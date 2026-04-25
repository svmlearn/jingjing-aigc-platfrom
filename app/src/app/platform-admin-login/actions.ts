"use server";

import { redirect } from "next/navigation";

import {
  clearPlatformAdminSession,
  createPlatformAdminSession,
  isPlatformAdminAccessConfigured,
  verifyPlatformAdminSecret,
} from "@/lib/auth/platform-admin-session";

export async function signInToPlatformAdmin(formData: FormData) {
  if (!isPlatformAdminAccessConfigured()) {
    redirect("/platform-admin-login?error=not-configured");
  }

  if (!verifyPlatformAdminSecret(formData.get("secret"))) {
    redirect("/platform-admin-login?error=invalid-secret");
  }

  await createPlatformAdminSession();
  redirect("/platform-admin");
}

export async function signOutFromPlatformAdmin() {
  await clearPlatformAdminSession();
  redirect("/platform-admin-login");
}
