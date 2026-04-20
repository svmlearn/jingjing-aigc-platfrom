import type { NextRequest } from "next/server";

import type { Platform } from "@/contracts/import";
import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { listSourceItems } from "@/lib/db/import-repository";
import { getMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { handleApiError } from "@/server/api/errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const merchant = await getMerchantProfileByOwnerUserId(user.id);
    const platform = parsePlatform(request.nextUrl.searchParams.get("platform"));
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const sourceItems = await listSourceItems({
      merchantId: merchant.id,
      platform,
      limit,
    });

    return Response.json({ sourceItems });
  } catch (error) {
    return handleApiError(error);
  }
}

function parsePlatform(value: string | null): Platform | undefined {
  if (value === "xiaohongshu" || value === "douyin") {
    return value;
  }

  return undefined;
}

function parseLimit(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.min(Math.max(parsed, 1), 100);
}
