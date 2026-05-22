import { NextResponse, type NextRequest } from "next/server";

import { isDomesticSessionEnabled, signInDomesticUser } from "@/lib/auth/domestic-session";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";

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

  if (isDomesticSessionEnabled()) {
    try {
      const user = await signInDomesticUser({ email, password });
      await getOperationalMerchantProfileByOwnerUserId(user.id);
      return redirectToPath(request, next);
    } catch {
      return redirectToLogin(request, "invalid-credentials", next);
    }
  }

  return redirectToLogin(request, "auth-not-configured", next);
}
