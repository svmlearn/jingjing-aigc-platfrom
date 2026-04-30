import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { isSupabasePublicConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getSafeNextPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  if (value.startsWith("/platform-admin")) {
    return "/dashboard";
  }

  return value;
}

function redirectToPath(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function redirectToLogin(request: NextRequest, error: string, next?: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);

  if (next) {
    url.searchParams.set("next", next);
  }

  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = getSafeNextPath(formData.get("next"));

  if (!email || !password) {
    return redirectToLogin(request, "invalid-credentials", next);
  }

  if (!isSupabasePublicConfigured()) {
    return redirectToPath(request, next);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return redirectToLogin(request, "invalid-credentials", next);
  }

  let response = redirectToPath(request, next);
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return redirectToLogin(request, "invalid-credentials", next);
  }

  try {
    await getOperationalMerchantProfileByOwnerUserId(data.user.id);
  } catch {
    response = redirectToLogin(request, "no-merchant-profile");
    await supabase.auth.signOut().catch(() => undefined);
  }

  return response;
}
