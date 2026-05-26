import { NextResponse, type NextRequest } from "next/server";

import {
  createDomesticPasswordHash,
  isDomesticSessionEnabled,
  signInDomesticUser,
} from "@/lib/auth/domestic-session";
import {
  acceptMemberInvitationCode,
  listOperationalMerchantWorkspacesByUserId,
} from "@/lib/db/merchant-repository";
import { queryAppDb } from "@/lib/server-db/postgres";
import { ApiError } from "@/server/api/errors";
import { memberRegisterWithInviteSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

function redirectToPath(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function redirectToRegister(request: NextRequest, error: string, code?: string | null) {
  const url = new URL("/member/register", request.url);
  url.searchParams.set("error", error);

  if (code) {
    url.searchParams.set("code", code);
  }

  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function resolveMemberNextPath(workspaceCount: number) {
  return workspaceCount > 1 ? "/member/teams" : "/member/calendar";
}

async function readPayload(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return request.json();
  }

  const formData = await request.formData();
  return {
    inviteCode: formData.get("inviteCode"),
    displayName: formData.get("displayName"),
    username: formData.get("username"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  };
}

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json") === true;
}

function mapRegistrationError(error: unknown) {
  if (error instanceof ApiError) {
    return error;
  }

  if (error && typeof error === "object" && "issues" in error) {
    return new ApiError(400, "INVALID_MEMBER_REGISTRATION", "Member registration input is invalid.");
  }

  const message = error instanceof Error ? error.message : "";
  if (message.includes("duplicate key")) {
    return new ApiError(409, "MEMBER_USERNAME_EXISTS", "Username already exists.");
  }

  return new ApiError(500, "MEMBER_REGISTER_FAILED", "Member registration failed.");
}

async function createDomesticMemberUser(input: {
  username: string;
  password: string;
  displayName?: string | null;
}) {
  try {
    const result = await queryAppDb<{ id: string }>(
      `
      insert into public.app_users (
        email,
        password_hash,
        display_name,
        role,
        status
      ) values ($1, $2, $3, 'merchant_member', 'active')
      returning id
      `,
      [
        input.username,
        createDomesticPasswordHash(input.password),
        input.displayName || null,
      ],
    );

    return result.rows[0].id;
  } catch (error) {
    throw mapRegistrationError(error);
  }
}

async function deleteDomesticMemberUser(userId: string) {
  await queryAppDb(
    `
    delete from public.app_users
    where id = $1 and role = 'merchant_member'
    `,
    [userId],
  ).catch(() => undefined);
}

function jsonError(error: unknown) {
  const mapped = mapRegistrationError(error);
  return Response.json(
    { error: { code: mapped.code, message: mapped.message } },
    { status: mapped.status },
  );
}

export async function POST(request: NextRequest) {
  let payload: ReturnType<typeof memberRegisterWithInviteSchema.parse> | undefined;
  let createdUserId: string | undefined;
  let invitationAccepted = false;

  try {
    const rawPayload = await readPayload(request);
    payload = memberRegisterWithInviteSchema.parse(rawPayload);
    const username = payload.username.trim().toLowerCase();
    const displayName = payload.displayName?.trim() || null;

    if (!isDomesticSessionEnabled()) {
      throw new ApiError(
        503,
        "AUTH_SERVICE_NOT_CONFIGURED",
        "Member registration service is not configured.",
      );
    }

    createdUserId = await createDomesticMemberUser({
      username,
      password: payload.password,
      displayName,
    });

    await acceptMemberInvitationCode({
      code: payload.inviteCode,
      userId: createdUserId,
      displayName,
    });
    invitationAccepted = true;

    const user = await signInDomesticUser({ email: username, password: payload.password });
    const workspaces = await listOperationalMerchantWorkspacesByUserId(user.id);
    const nextPath = resolveMemberNextPath(workspaces.length);

    if (wantsJson(request)) {
      return Response.json(
        {
          userId: user.id,
          workspaces,
          nextPath,
          sessionEstablished: true,
        },
        { status: 201 },
      );
    }

    return redirectToPath(request, nextPath);
  } catch (error) {
    if (createdUserId && !invitationAccepted) {
      await deleteDomesticMemberUser(createdUserId);
    }

    if (wantsJson(request)) {
      return jsonError(error);
    }

    const mapped = mapRegistrationError(error);
    return redirectToRegister(request, mapped.code.toLowerCase(), payload?.inviteCode);
  }
}
