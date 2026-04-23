import {
  createPlatformInvitationCode,
  listPlatformInvitationCodes,
} from "@/lib/db/platform-admin-repository";
import type {
  PlatformAdminInvitationCodeFilters,
  PlatformAdminInvitationCodeStatusFilter,
  PlatformAdminInvitationCodeUsageFilter,
} from "@/contracts/platform-admin";
import { assertPlatformAdminAccess, handleApiError } from "@/server/api/errors";
import { createInvitationCodeSchema } from "@/server/api/schemas";

export const runtime = "nodejs";

const validStatusFilters: PlatformAdminInvitationCodeStatusFilter[] = [
  "all",
  "active",
  "disabled",
  "redeemed",
  "expired",
];

const validUsageFilters: PlatformAdminInvitationCodeUsageFilter[] = [
  "all",
  "unused",
  "expiring",
];

function parseInvitationCodeFilters(request: Request): PlatformAdminInvitationCodeFilters {
  const { searchParams } = new URL(request.url);
  const rawStatus = searchParams.get("status");
  const rawUsage = searchParams.get("usage");
  const rawQuery = searchParams.get("q")?.trim();

  return {
    query: rawQuery || undefined,
    status: validStatusFilters.includes(rawStatus as PlatformAdminInvitationCodeStatusFilter)
      ? (rawStatus as PlatformAdminInvitationCodeStatusFilter)
      : "all",
    usage: validUsageFilters.includes(rawUsage as PlatformAdminInvitationCodeUsageFilter)
      ? (rawUsage as PlatformAdminInvitationCodeUsageFilter)
      : "all",
  };
}

export async function GET(request: Request) {
  try {
    assertPlatformAdminAccess(request);
    const invitationCodes = await listPlatformInvitationCodes(parseInvitationCodeFilters(request));

    return Response.json({ invitationCodes });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertPlatformAdminAccess(request);
    const payload = createInvitationCodeSchema.parse(await request.json());
    const invitationCode = await createPlatformInvitationCode({
      code: payload.code,
      maxRedemptions: payload.maxRedemptions,
      expiresAt: payload.expiresAt,
      note: payload.note,
    });

    return Response.json({ invitationCode }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
