import "server-only";

import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

import { cookies, headers } from "next/headers";

import type {
  PlatformAdminRole,
  PlatformAdminUserDto,
  PlatformAdminUserStatus,
} from "@/contracts/platform-admin";
import { isLocalDemoRuntime } from "@/lib/demo/local-demo-runtime";
import {
  isAppPostgresConfigured,
  isAppPostgresPreferred,
  queryAppDb,
  withAppDbTransaction,
  type DatabaseClient,
} from "@/lib/server-db/postgres";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import {
  createSupabaseServerClient,
  isSupabasePublicConfigured,
} from "@/lib/supabase/server";

export const platformAdminSessionCookieName = "platform_admin_session";

const defaultSessionTtlSeconds = 60 * 60 * 24 * 14;
const passwordHashAlgorithm = "pbkdf2_sha256";
const passwordHashIterations = 210_000;
const passwordHashKeyLength = 32;

type PlatformAdminUserRow = {
  id: string;
  auth_user_id?: string | null;
  email: string;
  display_name: string | null;
  role: PlatformAdminRole;
  status: PlatformAdminUserStatus;
  password_hash?: string | null;
  created_by_admin_id: string | null;
  last_login_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type PlatformAdminLoginResult =
  | { ok: true; admin: PlatformAdminUserDto }
  | {
      ok: false;
      code:
        | "not-configured"
        | "invalid-credentials"
        | "no-admin-access"
        | "disabled-admin";
    };

const platformAdminUserSelect = [
  "id",
  "auth_user_id",
  "email",
  "display_name",
  "role",
  "status",
  "created_by_admin_id",
  "last_login_at",
  "created_at",
  "updated_at",
].join(", ");

const appOwnedPlatformAdminUserSelect = [
  "id",
  "id as auth_user_id",
  "email",
  "display_name",
  "role",
  "status",
  "created_by_admin_id",
  "last_login_at",
  "created_at",
  "updated_at",
].join(", ");

const appOwnedPlatformAdminSessionUserSelect = [
  "u.id",
  "u.id as auth_user_id",
  "u.email",
  "u.display_name",
  "u.role",
  "u.status",
  "u.created_by_admin_id",
  "u.last_login_at",
  "u.created_at",
  "u.updated_at",
].join(", ");

const demoPlatformAdminUser: PlatformAdminUserDto = {
  id: "local-demo-platform-admin",
  authUserId: "local-demo-auth-user",
  email: "local-demo@platform-admin.internal",
  displayName: "本地演示超管",
  role: "super_admin",
  status: "active",
  createdByAdminId: null,
  lastLoginAt: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

function getPlatformAdminSecret() {
  return process.env.ADMIN_SETUP_SECRET?.trim() ?? "";
}

export function isPlatformAdminAccessConfigured() {
  return isAppOwnedPlatformAdminAuthEnabled() || (
    isSupabasePublicConfigured() && isSupabaseAdminConfigured()
  );
}

export function isPlatformAdminBootstrapSecretConfigured() {
  return getPlatformAdminSecret().length > 0;
}

export function verifyPlatformAdminSecret(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return false;
  }

  const expected = getPlatformAdminSecret();

  if (!expected) {
    return false;
  }

  return value.trim() === expected;
}

export async function hasPlatformAdminSession() {
  return (await getCurrentPlatformAdmin()) !== null;
}

export async function getCurrentPlatformAdmin(): Promise<PlatformAdminUserDto | null> {
  if (isAppOwnedPlatformAdminAuthEnabled()) {
    return getCurrentAppOwnedPlatformAdmin();
  }

  if (await isLocalDemoPlatformAdminRequest()) {
    return demoPlatformAdminUser;
  }

  if (!isSupabasePublicConfigured() || !isSupabaseAdminConfigured()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  const adminUser = await getPlatformAdminUserByAuthUserId(data.user.id);

  if (!adminUser || adminUser.status !== "active") {
    return null;
  }

  return adminUser;
}

export async function authenticatePlatformAdminWithPassword(input: {
  email: string;
  password: string;
}): Promise<PlatformAdminLoginResult> {
  if (isAppOwnedPlatformAdminAuthEnabled()) {
    return authenticateAppOwnedPlatformAdminWithPassword(input);
  }

  if (!isSupabasePublicConfigured() || !isSupabaseAdminConfigured()) {
    return { ok: false, code: "not-configured" };
  }

  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) {
    return { ok: false, code: "invalid-credentials" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { ok: false, code: "invalid-credentials" };
  }

  const adminUser = await getPlatformAdminUserByAuthUserId(data.user.id);

  if (!adminUser) {
    await supabase.auth.signOut();
    return { ok: false, code: "no-admin-access" };
  }

  if (adminUser.status !== "active") {
    await supabase.auth.signOut();
    return { ok: false, code: "disabled-admin" };
  }

  await touchPlatformAdminLastLogin(adminUser.id);

  return { ok: true, admin: { ...adminUser, lastLoginAt: new Date().toISOString() } };
}

export async function createInitialPlatformAdmin(input: {
  email: string;
  password: string;
  displayName?: string | null;
}): Promise<PlatformAdminUserDto> {
  if (isAppOwnedPlatformAdminAuthEnabled()) {
    return createInitialAppOwnedPlatformAdmin(input);
  }

  if (!isSupabasePublicConfigured() || !isSupabaseAdminConfigured()) {
    throw new Error("Platform admin access is not configured.");
  }

  const existingCount = await countPlatformAdminUsers();

  if (existingCount > 0) {
    throw new Error("Initial platform admin already exists.");
  }

  const supabase = createSupabaseAdminClient();
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName?.trim() || null;

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      platform_admin_role: "super_admin",
    },
  });

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? "Failed to create Supabase auth user.");
  }

  const { data, error } = await supabase
    .from("platform_admin_users")
    .insert({
      auth_user_id: authData.user.id,
      email,
      display_name: displayName,
      role: "super_admin",
      status: "active",
      last_login_at: new Date().toISOString(),
    })
    .select(platformAdminUserSelect)
    .single();

  if (error || !data) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    throw new Error(error?.message ?? "Failed to create platform admin user.");
  }

  return mapPlatformAdminUser(data as unknown as PlatformAdminUserRow);
}

export async function hasAnyPlatformAdminUsers() {
  return (await countPlatformAdminUsers()) > 0;
}

export async function getPlatformAdminUserByAuthUserId(
  authUserId: string,
): Promise<PlatformAdminUserDto | null> {
  if (!isSupabaseAdminConfigured()) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("platform_admin_users")
    .select(platformAdminUserSelect)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapPlatformAdminUser(data as unknown as PlatformAdminUserRow);
}

export function isPlatformAdminRoleAllowed(
  adminUser: PlatformAdminUserDto,
  allowedRoles?: PlatformAdminRole[],
) {
  return !allowedRoles || allowedRoles.includes(adminUser.role);
}

export async function clearPlatformAdminSession() {
  if (isAppOwnedPlatformAdminAuthEnabled()) {
    await revokeCurrentAppOwnedPlatformAdminSession();
  }

  if (isSupabasePublicConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  const cookieStore = await cookies();
  cookieStore.delete(platformAdminSessionCookieName);
}

export function createPlatformAdminPasswordHash(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derived = pbkdf2Sync(
    password,
    salt,
    passwordHashIterations,
    passwordHashKeyLength,
    "sha256",
  ).toString("base64url");

  return `${passwordHashAlgorithm}$${passwordHashIterations}$${salt}$${derived}`;
}

function isAppOwnedPlatformAdminAuthEnabled() {
  const provider = process.env.PLATFORM_ADMIN_AUTH_PROVIDER?.trim().toLowerCase();

  return isAppPostgresConfigured() && (
    isAppPostgresPreferred() ||
    provider === "postgres" ||
    provider === "app-owned"
  );
}

async function getCurrentAppOwnedPlatformAdmin() {
  const token = await readPlatformAdminSessionCookie();
  if (!token) {
    return null;
  }

  const result = await queryAppDb<PlatformAdminUserRow>(
    `
    select
      ${appOwnedPlatformAdminSessionUserSelect}
    from public.platform_admin_sessions s
    join public.platform_admin_users u on u.id = s.admin_user_id
    where s.token_hash = $1
      and s.expires_at > timezone('utc', now())
      and s.revoked_at is null
      and u.status = 'active'
    limit 1
    `,
    [hashSessionToken(token)],
  ).catch(() => null);
  const adminUser = result?.rows[0] ?? null;

  if (!adminUser) {
    await clearPlatformAdminSessionCookie();
    return null;
  }

  return mapPlatformAdminUser(adminUser);
}

async function authenticateAppOwnedPlatformAdminWithPassword(input: {
  email: string;
  password: string;
}): Promise<PlatformAdminLoginResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!email || !password) {
    return { ok: false, code: "invalid-credentials" };
  }

  const result = await queryAppDb<PlatformAdminUserRow>(
    `
    select
      ${appOwnedPlatformAdminUserSelect},
      password_hash
    from public.platform_admin_users
    where lower(email) = $1
    limit 1
    `,
    [email],
  ).catch(() => null);
  const adminUser = result?.rows[0] ?? null;

  if (!adminUser || !adminUser.password_hash) {
    return { ok: false, code: "invalid-credentials" };
  }

  if (adminUser.status !== "active") {
    return { ok: false, code: "disabled-admin" };
  }

  if (!verifyPlatformAdminPassword(password, adminUser.password_hash)) {
    return { ok: false, code: "invalid-credentials" };
  }

  const token = randomBytes(32).toString("base64url");
  const ttlSeconds = getPlatformAdminSessionTtlSeconds();
  await withAppDbTransaction(async (client) => {
    await client.query(
      `
      insert into public.platform_admin_sessions (
        admin_user_id,
        token_hash,
        expires_at
      ) values ($1, $2, timezone('utc', now()) + ($3 * interval '1 second'))
      `,
      [adminUser.id, hashSessionToken(token), ttlSeconds],
    );
    await client.query(
      `
      update public.platform_admin_users
      set last_login_at = timezone('utc', now()),
          updated_at = timezone('utc', now())
      where id = $1
      `,
      [adminUser.id],
    );
  });
  await writePlatformAdminSessionCookie(token, ttlSeconds);

  return {
    ok: true,
    admin: {
      ...mapPlatformAdminUser(adminUser),
      lastLoginAt: new Date().toISOString(),
    },
  };
}

async function createInitialAppOwnedPlatformAdmin(input: {
  email: string;
  password: string;
  displayName?: string | null;
}): Promise<PlatformAdminUserDto> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName?.trim() || null;

  return withAppDbTransaction(async (client) => {
    const existingCount = await countAppOwnedPlatformAdminUsers(client);

    if (existingCount > 0) {
      throw new Error("Initial platform admin already exists.");
    }

    const result = await client.query<PlatformAdminUserRow>(
      `
      insert into public.platform_admin_users (
        email,
        password_hash,
        display_name,
        role,
        status
      ) values ($1, $2, $3, 'super_admin', 'active')
      returning ${appOwnedPlatformAdminUserSelect}
      `,
      [email, createPlatformAdminPasswordHash(input.password), displayName],
    );
    const adminUser = result.rows[0];

    await client.query(
      `
      insert into public.platform_admin_events (
        actor_admin_id,
        actor_label,
        event_type,
        target_type,
        target_id,
        summary,
        details
      ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        adminUser.id,
        adminUser.email,
        "platform_admin_user.bootstrap_created",
        "platform_admin_user",
        adminUser.id,
        `Bootstrap platform admin ${adminUser.email}`,
        JSON.stringify({ role: adminUser.role }),
      ],
    );

    return mapPlatformAdminUser(adminUser);
  });
}

async function countPlatformAdminUsers() {
  if (isAppOwnedPlatformAdminAuthEnabled()) {
    return countAppOwnedPlatformAdminUsers();
  }

  if (!isSupabaseAdminConfigured()) {
    return 0;
  }

  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from("platform_admin_users")
    .select("*", { count: "exact", head: true });

  if (error) {
    return 0;
  }

  return count ?? 0;
}

async function countAppOwnedPlatformAdminUsers(client?: DatabaseClient) {
  const executor = client ?? { query: queryAppDb };
  const result = await executor.query<{ count: string }>(
    `
    select count(*)::text as count
    from public.platform_admin_users
    `,
  );

  return Number.parseInt(result.rows[0]?.count ?? "0", 10) || 0;
}

async function touchPlatformAdminLastLogin(adminUserId: string) {
  if (isAppOwnedPlatformAdminAuthEnabled()) {
    await queryAppDb(
      `
      update public.platform_admin_users
      set last_login_at = timezone('utc', now()),
          updated_at = timezone('utc', now())
      where id = $1
      `,
      [adminUserId],
    ).catch(() => undefined);
    return;
  }

  if (!isSupabaseAdminConfigured()) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  await supabase
    .from("platform_admin_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", adminUserId);
}

async function revokeCurrentAppOwnedPlatformAdminSession() {
  const token = await readPlatformAdminSessionCookie();
  if (!token) {
    return;
  }

  await queryAppDb(
    `
    update public.platform_admin_sessions
    set revoked_at = timezone('utc', now())
    where token_hash = $1
    `,
    [hashSessionToken(token)],
  ).catch(() => undefined);
}

async function readPlatformAdminSessionCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(platformAdminSessionCookieName)?.value ?? "";
}

async function writePlatformAdminSessionCookie(token: string, ttlSeconds: number) {
  const cookieStore = await cookies();
  cookieStore.set(platformAdminSessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_SESSION_SECURE_COOKIE === "true",
    path: "/",
    maxAge: ttlSeconds,
  });
}

async function clearPlatformAdminSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(platformAdminSessionCookieName);
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getPlatformAdminSessionTtlSeconds() {
  const raw = process.env.PLATFORM_ADMIN_SESSION_TTL_SECONDS ?? process.env.APP_SESSION_TTL_SECONDS;
  if (!raw) {
    return defaultSessionTtlSeconds;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultSessionTtlSeconds;
}

function verifyPlatformAdminPassword(password: string, storedHash: string) {
  const [algorithm, iterationsRaw, salt, expected] = storedHash.split("$");
  if (algorithm !== passwordHashAlgorithm || !iterationsRaw || !salt || !expected) {
    return false;
  }

  const iterations = Number.parseInt(iterationsRaw, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }

  const actual = pbkdf2Sync(password, salt, iterations, passwordHashKeyLength, "sha256");
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (expectedBuffer.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(actual, expectedBuffer);
}

async function isLocalDemoPlatformAdminRequest() {
  if (!isLocalDemoRuntime()) {
    return false;
  }

  const headerStore = await headers();
  const host = headerStore.get("host")?.split(":")[0];

  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function mapPlatformAdminUser(row: PlatformAdminUserRow): PlatformAdminUserDto {
  return {
    id: row.id,
    authUserId: row.auth_user_id ?? row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdByAdminId: row.created_by_admin_id,
    lastLoginAt: toNullableIsoString(row.last_login_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function toNullableIsoString(value: string | Date | null) {
  return value ? toIsoString(value) : null;
}
