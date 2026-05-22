import { NextResponse, type NextRequest } from "next/server";

import {
  isDomesticSessionEnabled,
  signInDomesticUser,
  signOutDomesticUser,
} from "@/lib/auth/domestic-session";
import { listOperationalMerchantWorkspacesByUserId } from "@/lib/db/merchant-repository";
import { ApiError } from "@/server/api/errors";
import { memberLoginSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

function getSafeMemberNextPath(value?: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "";
  }

  if (!value.startsWith("/member")) {
    return "";
  }

  if (value.startsWith("/member/login") || value.startsWith("/member/register")) {
    return "";
  }

  return value;
}

function resolveMemberNextPath(inputNext: string | null | undefined, workspaceCount: number) {
  const next = getSafeMemberNextPath(inputNext);
  if (next) {
    return next;
  }

  return workspaceCount > 1 ? "/member/teams" : "/member/calendar";
}

function redirectToPath(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function redirectToLogin(request: NextRequest, error: string, next?: string | null) {
  const url = new URL("/member/login", request.url);
  url.searchParams.set("error", error);

  const safeNext = getSafeMemberNextPath(next);
  if (safeNext) {
    url.searchParams.set("next", safeNext);
  }

  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function readPayload(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return request.json();
  }

  const formData = await request.formData();
  return {
    username: formData.get("username"),
    password: formData.get("password"),
    next: formData.get("next"),
  };
}

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json") === true;
}

function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  return Response.json(
    { error: { code: "MEMBER_LOGIN_FAILED", message: "Member login failed." } },
    { status: 401 },
  );
}

export async function POST(request: NextRequest) {
  let safeNext: string | null | undefined;

  try {
    const payload = memberLoginSchema.parse(await readPayload(request));
    const username = payload.username.trim().toLowerCase();
    safeNext = payload.next;

    if (isDomesticSessionEnabled()) {
      const user = await signInDomesticUser({ email: username, password: payload.password });
      const workspaces = await listOperationalMerchantWorkspacesByUserId(user.id);
      if (workspaces.length === 0) {
        await signOutDomesticUser();
        throw new ApiError(403, "NO_MEMBER_WORKSPACE", "No member workspace is available.");
      }

      const nextPath = resolveMemberNextPath(payload.next, workspaces.length);
      if (wantsJson(request)) {
        return Response.json({
          userId: user.id,
          workspaces,
          nextPath,
          sessionEstablished: true,
        });
      }

      return redirectToPath(request, nextPath);
    }

    throw new ApiError(
      503,
      "AUTH_SERVICE_NOT_CONFIGURED",
      "Member login service is not configured.",
    );
  } catch (error) {
    if (wantsJson(request)) {
      return jsonError(error);
    }

    if (error instanceof ApiError && error.code === "AUTH_SERVICE_NOT_CONFIGURED") {
      return redirectToLogin(request, "auth-not-configured", safeNext);
    }

    if (error instanceof ApiError && error.code === "NO_MEMBER_WORKSPACE") {
      return redirectToLogin(request, "no-member-workspace", safeNext);
    }

    return redirectToLogin(request, "invalid-credentials");
  }
}
