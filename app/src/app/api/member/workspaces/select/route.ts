import { NextResponse, type NextRequest } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { selectOperationalMerchantWorkspaceForUser } from "@/lib/db/merchant-repository";
import { handleApiError } from "@/server/api/errors";
import { memberWorkspaceSelectSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

function redirectToPath(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
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
    merchantId: formData.get("merchantId"),
  };
}

function wantsJson(request: NextRequest) {
  return request.headers.get("accept")?.includes("application/json") === true;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const payload = memberWorkspaceSelectSchema.parse(await readPayload(request));
    const workspace = await selectOperationalMerchantWorkspaceForUser({
      userId: user.id,
      merchantId: payload.merchantId,
    });

    if (wantsJson(request)) {
      return Response.json({ workspace, nextPath: "/member/calendar" });
    }

    return redirectToPath(request, "/member/calendar");
  } catch (error) {
    if (wantsJson(request)) {
      return handleApiError(error);
    }

    return redirectToPath(request, "/member/teams?error=select-failed");
  }
}
