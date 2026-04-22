import "server-only";

import { createHash } from "node:crypto";

import { cookies } from "next/headers";

export const platformAdminSessionCookieName = "platform_admin_session";
const platformAdminSessionMaxAgeSeconds = 60 * 60 * 8;

function getPlatformAdminSecret() {
  return process.env.ADMIN_SETUP_SECRET?.trim() ?? "";
}

function buildPlatformAdminSessionValue(secret: string) {
  return createHash("sha256").update(`platform-admin:${secret}`).digest("hex");
}

export function isValidPlatformAdminSessionValue(value: string | null | undefined) {
  const secret = getPlatformAdminSecret();

  if (!secret || !value) {
    return false;
  }

  return value === buildPlatformAdminSessionValue(secret);
}

export function isPlatformAdminAccessConfigured() {
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
  const cookieStore = await cookies();
  const session = cookieStore.get(platformAdminSessionCookieName)?.value;

  return isValidPlatformAdminSessionValue(session);
}

export async function createPlatformAdminSession() {
  const secret = getPlatformAdminSecret();

  if (!secret) {
    return false;
  }

  const cookieStore = await cookies();

  cookieStore.set({
    name: platformAdminSessionCookieName,
    value: buildPlatformAdminSessionValue(secret),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: platformAdminSessionMaxAgeSeconds,
  });

  return true;
}

export async function clearPlatformAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(platformAdminSessionCookieName);
}
