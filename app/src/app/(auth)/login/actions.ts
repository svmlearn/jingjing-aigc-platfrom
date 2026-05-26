"use server";

import { redirect } from "next/navigation";

import {
  isDomesticSessionEnabled,
  signInDomesticUser,
  signOutDomesticUser,
} from "@/lib/auth/domestic-session";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";

function getSafeNextPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  if (value.startsWith("/platform-admin")) {
    return "/dashboard";
  }

  return value;
}

export async function signInToMerchant(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = getSafeNextPath(formData.get("next"));

  if (!email || !password) {
    redirect(`/login?error=invalid-credentials&next=${encodeURIComponent(next)}`);
  }

  if (isDomesticSessionEnabled()) {
    const user = await signInDomesticUser({ email, password }).catch(() => null);

    if (!user) {
      redirect(`/login?error=invalid-credentials&next=${encodeURIComponent(next)}`);
    }

    try {
      await getOperationalMerchantProfileByOwnerUserId(user.id);
    } catch {
      await signOutDomesticUser();
      redirect(`/login?error=no-merchant-profile&next=${encodeURIComponent(next)}`);
    }

    redirect(next);
  }

  redirect(`/login?error=auth-not-configured&next=${encodeURIComponent(next)}`);
}
