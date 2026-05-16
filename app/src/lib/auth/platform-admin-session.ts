import "server-only";

import { cookies } from "next/headers";

import type {
  PlatformAdminRole,
  PlatformAdminUserDto,
  PlatformAdminUserStatus,
} from "@/contracts/platform-admin";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import {
  createSupabaseServerClient,
  isSupabasePublicConfigured,
} from "@/lib/supabase/server";

export const platformAdminSessionCookieName = "platform_admin_session";

type PlatformAdminUserRow = {
  id: string;
  auth_user_id: string;
  email: string;
  display_name: string | null;
  role: PlatformAdminRole;
  status: PlatformAdminUserStatus;
  created_by_admin_id: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
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

function getPlatformAdminSecret() {
  return process.env.ADMIN_SETUP_SECRET?.trim() ?? "";
}

export function isPlatformAdminAccessConfigured() {
  return isSupabasePublicConfigured() && isSupabaseAdminConfigured();
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
  if (!isPlatformAdminAccessConfigured()) {
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
  if (!isPlatformAdminAccessConfigured()) {
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
  if (!isPlatformAdminAccessConfigured()) {
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
  if (isSupabasePublicConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  const cookieStore = await cookies();
  cookieStore.delete(platformAdminSessionCookieName);
}

async function countPlatformAdminUsers() {
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

async function touchPlatformAdminLastLogin(adminUserId: string) {
  if (!isSupabaseAdminConfigured()) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  await supabase
    .from("platform_admin_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", adminUserId);
}

function mapPlatformAdminUser(row: PlatformAdminUserRow): PlatformAdminUserDto {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdByAdminId: row.created_by_admin_id,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
