import "server-only";

import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { isPostgresVideoChainEnabled } from "@/lib/db/postgres-video-chain-repository";
import { queryAppDb } from "@/lib/server-db/postgres";
import { ApiError } from "@/server/api/errors";

const defaultSessionTtlSeconds = 60 * 60 * 24 * 14;
const passwordHashAlgorithm = "pbkdf2_sha256";
const passwordHashIterations = 210_000;
const passwordHashKeyLength = 32;

type AppUserSessionRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  status: "active" | "disabled";
  password_hash: string;
};

export function isDomesticSessionEnabled() {
  return isPostgresVideoChainEnabled();
}

export async function getDomesticAuthenticatedUser(): Promise<User> {
  const token = await readSessionCookie();
  if (!token) {
    throw new ApiError(401, "UNAUTHENTICATED", "Please sign in first.");
  }

  const result = await queryAppDb<AppUserSessionRow>(
    `
    select
      u.id,
      u.email,
      u.display_name,
      u.role,
      u.status,
      u.password_hash
    from public.user_sessions s
    join public.app_users u on u.id = s.user_id
    where s.token_hash = $1
      and s.expires_at > timezone('utc', now())
      and s.revoked_at is null
      and u.status = 'active'
    limit 1
    `,
    [hashSessionToken(token)],
  );
  const user = result.rows[0];
  if (!user) {
    await clearDomesticSessionCookie();
    throw new ApiError(401, "UNAUTHENTICATED", "Please sign in first.");
  }

  return toSupabaseCompatibleUser(user);
}

export async function signInDomesticUser(input: {
  email: string;
  password: string;
}): Promise<User> {
  const email = input.email.trim().toLowerCase();
  const result = await queryAppDb<AppUserSessionRow>(
    `
    select id, email, display_name, role, status, password_hash
    from public.app_users
    where lower(email) = $1
    limit 1
    `,
    [email],
  );
  const user = result.rows[0];

  if (!user || user.status !== "active" || !verifyDomesticPassword(input.password, user.password_hash)) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const token = randomBytes(32).toString("base64url");
  const ttlSeconds = getSessionTtlSeconds();
  await queryAppDb(
    `
    insert into public.user_sessions (
      user_id,
      token_hash,
      expires_at
    ) values ($1, $2, timezone('utc', now()) + ($3 * interval '1 second'))
    `,
    [user.id, hashSessionToken(token), ttlSeconds],
  );
  await queryAppDb(
    `
    update public.app_users
    set last_login_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    where id = $1
    `,
    [user.id],
  );
  await writeDomesticSessionCookie(token, ttlSeconds);

  return toSupabaseCompatibleUser(user);
}

export async function signOutDomesticUser() {
  const token = await readSessionCookie();
  if (token) {
    await queryAppDb(
      `
      update public.user_sessions
      set revoked_at = timezone('utc', now())
      where token_hash = $1
      `,
      [hashSessionToken(token)],
    ).catch(() => undefined);
  }
  await clearDomesticSessionCookie();
}

export function createDomesticPasswordHash(password: string) {
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

function verifyDomesticPassword(password: string, storedHash: string) {
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

async function readSessionCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(getSessionCookieName())?.value ?? "";
}

async function writeDomesticSessionCookie(token: string, ttlSeconds: number) {
  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_SESSION_SECURE_COOKIE === "true",
    path: "/",
    maxAge: ttlSeconds,
  });
}

async function clearDomesticSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(getSessionCookieName());
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getSessionCookieName() {
  return process.env.APP_SESSION_COOKIE?.trim() || "jingjing_session";
}

function getSessionTtlSeconds() {
  const raw = process.env.APP_SESSION_TTL_SECONDS;
  if (!raw) {
    return defaultSessionTtlSeconds;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultSessionTtlSeconds;
}

function toSupabaseCompatibleUser(user: AppUserSessionRow): User {
  return {
    id: user.id,
    app_metadata: {
      provider: "domestic",
      role: user.role,
    },
    user_metadata: {
      display_name: user.display_name,
    },
    aud: "authenticated",
    confirmation_sent_at: undefined,
    recovery_sent_at: undefined,
    email_change_sent_at: undefined,
    new_email: undefined,
    new_phone: undefined,
    invited_at: undefined,
    action_link: undefined,
    email: user.email,
    phone: "",
    created_at: "",
    confirmed_at: "",
    email_confirmed_at: "",
    phone_confirmed_at: "",
    last_sign_in_at: "",
    role: "authenticated",
    updated_at: "",
    identities: [],
    factors: undefined,
    is_anonymous: false,
  } as unknown as User;
}
