"use server";

import { redirect } from "next/navigation";

import { isDomesticSessionEnabled, signInDomesticUser } from "@/lib/auth/domestic-session";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import {
  createSupabaseServerClient,
  isSupabasePublicConfigured,
} from "@/lib/supabase/server";

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
    try {
      const user = await signInDomesticUser({ email, password });
      await getOperationalMerchantProfileByOwnerUserId(user.id);
    } catch {
      redirect(`/login?error=invalid-credentials&next=${encodeURIComponent(next)}`);
    }

    redirect(next);
  }

  if (!isSupabasePublicConfigured()) {
    redirect("/dashboard");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    redirect(`/login?error=invalid-credentials&next=${encodeURIComponent(next)}`);
  }

  try {
    await getOperationalMerchantProfileByOwnerUserId(data.user.id);
  } catch {
    await supabase.auth.signOut();
    redirect("/login?error=no-merchant-profile");
  }

  redirect(next);
}
