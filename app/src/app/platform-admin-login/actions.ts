"use server";

import { redirect } from "next/navigation";

import {
  authenticatePlatformAdminWithPassword,
  clearPlatformAdminSession,
  createInitialPlatformAdmin,
  hasAnyPlatformAdminUsers,
  isPlatformAdminAccessConfigured,
  isPlatformAdminBootstrapSecretConfigured,
  verifyPlatformAdminSecret,
} from "@/lib/auth/platform-admin-session";
import { platformAdminBootstrapSchema } from "@/server/api/schemas";

export async function signInToPlatformAdmin(formData: FormData) {
  const result = await authenticatePlatformAdminWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (!result.ok) {
    redirect(`/platform-admin-login?error=${result.code}`);
  }

  redirect("/platform-admin");
}

export async function initializePlatformAdmin(formData: FormData) {
  if (!isPlatformAdminAccessConfigured()) {
    redirect("/platform-admin-login?error=not-configured");
  }

  if (!isPlatformAdminBootstrapSecretConfigured()) {
    redirect("/platform-admin-login?error=bootstrap-secret-required");
  }

  if (await hasAnyPlatformAdminUsers()) {
    redirect("/platform-admin-login?error=bootstrap-exists");
  }

  if (!verifyPlatformAdminSecret(formData.get("setupSecret"))) {
    redirect("/platform-admin-login?error=invalid-setup-secret");
  }

  const parsed = platformAdminBootstrapSchema.safeParse({
    setupSecret: String(formData.get("setupSecret") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
  });

  if (!parsed.success) {
    redirect("/platform-admin-login?error=bootstrap-invalid");
  }

  const payload = parsed.data;

  try {
    await createInitialPlatformAdmin({
      email: payload.email,
      password: payload.password,
      displayName: payload.displayName,
    });
  } catch {
    redirect("/platform-admin-login?error=bootstrap-failed");
  }

  const result = await authenticatePlatformAdminWithPassword({
    email: payload.email,
    password: payload.password,
  });

  if (!result.ok) {
    redirect(`/platform-admin-login?error=${result.code}`);
  }

  redirect("/platform-admin");
}

export async function signOutFromPlatformAdmin() {
  await clearPlatformAdminSession();
  redirect("/platform-admin-login");
}
