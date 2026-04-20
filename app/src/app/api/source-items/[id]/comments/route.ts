import type { NextRequest } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { listImportedComments } from "@/lib/db/import-repository";
import { getMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import { handleApiError } from "@/server/api/errors";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthenticatedUser();
    const merchant = await getMerchantProfileByOwnerUserId(user.id);
    const { id } = await context.params;
    const comments = await listImportedComments({
      merchantId: merchant.id,
      sourceItemId: id,
      limit: parseLimit(request.nextUrl.searchParams.get("limit")),
    });

    return Response.json({ comments });
  } catch (error) {
    return handleApiError(error);
  }
}

function parseLimit(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.min(Math.max(parsed, 1), 200);
}
