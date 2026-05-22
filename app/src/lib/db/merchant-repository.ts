import "server-only";

import { randomBytes } from "node:crypto";

import type {
  InvitationCodeDto,
  MemberInvitationAcceptResultDto,
  MerchantPlan,
  MerchantProfileDto,
  MerchantProfileInput,
  MerchantTeamInvitationCodeDto,
  MerchantTeamManagementDto,
  MerchantTeamMemberDto,
  MerchantWorkspaceDto,
} from "@/contracts/merchant";
import {
  pgAcceptMemberInvitationCode,
  pgCreateInvitationCode,
  pgCreateMemberInvitationCodeForOwner,
  pgGetMerchantProfileById,
  pgGetMerchantProfileByOwnerUserId,
  pgGetMerchantWorkspaceByUserId,
  pgListActiveMerchantTeamMembersByMerchant,
  pgListMerchantTeamInvitationCodesByMerchant,
  pgListMerchantWorkspacesByUserId,
  pgRedeemInvitationCode,
  pgSelectMerchantWorkspaceForUser,
  pgUpdateMerchantProfile,
} from "@/lib/db/postgres-video-chain-repository";
import { ApiError } from "@/server/api/errors";

type MerchantProfileRow = {
  id: string;
  owner_user_id: string | null;
  name: string;
  industry: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  address: string | null;
  service_items: unknown;
  brand_summary: string | null;
  region_summary: string | null;
  tone_style: string | null;
  default_cta: unknown;
  forbidden_words: unknown;
  status: "active" | "disabled" | "archived";
  plan: MerchantPlan;
  created_at: string;
  updated_at: string;
};

export async function createInvitationCode(input: {
  code?: string;
  maxRedemptions?: number;
  expiresAt?: string | null;
  note?: string | null;
}): Promise<InvitationCodeDto> {
  return pgCreateInvitationCode(input);
}

export async function redeemInvitationCode(input: {
  code: string;
  ownerUserId: string;
  merchantProfile: MerchantProfileInput;
}): Promise<MerchantProfileDto> {
  return pgRedeemInvitationCode(input);
}

export async function getMerchantProfileById(id: string): Promise<MerchantProfileDto> {
  return pgGetMerchantProfileById(id);
}

export async function getMerchantProfileByOwnerUserId(
  ownerUserId: string,
): Promise<MerchantProfileDto> {
  return pgGetMerchantProfileByOwnerUserId(ownerUserId);
}

export async function listActiveMerchantTeamMembersByMerchant(
  merchantId: string,
): Promise<MerchantTeamMemberDto[]> {
  return pgListActiveMerchantTeamMembersByMerchant(merchantId);
}

export async function getMerchantTeamManagementForOwner(
  ownerUserId: string,
): Promise<MerchantTeamManagementDto> {
  const workspace = await getOperationalMerchantWorkspaceByUserId(ownerUserId);
  assertMerchantTeamOwner(workspace);

  const merchantId = workspace.merchantProfile.id;

  return {
    workspace,
    members: await listActiveMerchantTeamMembersByMerchant(merchantId),
    invitationCodes: await listMerchantTeamInvitationCodesByMerchant(merchantId),
  };
}

export async function createMemberInvitationCodeForOwner(input: {
  ownerUserId: string;
  code?: string;
  maxRedemptions?: number;
  expiresAt?: string | null;
  note?: string | null;
}): Promise<MerchantTeamInvitationCodeDto> {
  const workspace = await getOperationalMerchantWorkspaceByUserId(input.ownerUserId);
  assertMerchantTeamOwner(workspace);

  return pgCreateMemberInvitationCodeForOwner({
    merchantId: workspace.merchantProfile.id,
    createdByUserId: input.ownerUserId,
    code: normalizeMemberInvitationCode(input.code ?? generateMemberInvitationCode()),
    maxRedemptions: input.maxRedemptions,
    expiresAt: input.expiresAt,
    note: input.note,
  });
}

async function listMerchantTeamInvitationCodesByMerchant(
  merchantId: string,
): Promise<MerchantTeamInvitationCodeDto[]> {
  return pgListMerchantTeamInvitationCodesByMerchant(merchantId);
}

export async function getMerchantWorkspaceByUserId(
  userId: string,
  merchantId?: string | null,
): Promise<MerchantWorkspaceDto> {
  return pgGetMerchantWorkspaceByUserId(userId, merchantId);
}

export async function listOperationalMerchantWorkspacesByUserId(
  userId: string,
): Promise<MerchantWorkspaceDto[]> {
  const workspaces = await pgListMerchantWorkspacesByUserId(userId);
  return workspaces.filter((workspace) => workspace.merchantProfile.status === "active");
}

export async function selectOperationalMerchantWorkspaceForUser(input: {
  userId: string;
  merchantId: string;
}): Promise<MerchantWorkspaceDto> {
  const workspace = await pgSelectMerchantWorkspaceForUser(input);
  assertMerchantOperational(workspace.merchantProfile);
  return workspace;
}

export async function acceptMemberInvitationCode(input: {
  code: string;
  userId: string;
  displayName?: string | null;
}): Promise<MemberInvitationAcceptResultDto> {
  return pgAcceptMemberInvitationCode(input);
}

export async function updateMerchantProfile(
  ownerUserId: string,
  input: Partial<MerchantProfileInput>,
): Promise<MerchantProfileDto> {
  return pgUpdateMerchantProfile(ownerUserId, input);
}

export function mapMerchantProfile(row: MerchantProfileRow): MerchantProfileDto {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    industry: row.industry,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    address: row.address,
    serviceItems: toStringArray(row.service_items),
    brandSummary: row.brand_summary,
    regionSummary: row.region_summary,
    toneStyle: row.tone_style,
    defaultCta: toStringArray(row.default_cta),
    forbiddenWords: toStringArray(row.forbidden_words),
    status: row.status,
    plan: row.plan,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getOperationalMerchantProfileByOwnerUserId(
  ownerUserId: string,
): Promise<MerchantProfileDto> {
  const profile = (await getMerchantWorkspaceByUserId(ownerUserId)).merchantProfile;
  assertMerchantOperational(profile);
  return profile;
}

export async function getOperationalMerchantWorkspaceByUserId(
  userId: string,
): Promise<MerchantWorkspaceDto> {
  const workspace = await getMerchantWorkspaceByUserId(userId);
  assertMerchantOperational(workspace.merchantProfile);
  return workspace;
}

export function assertMerchantOperational(profile: Pick<MerchantProfileDto, "status">) {
  if (profile.status === "disabled") {
    throw new ApiError(
      403,
      "MERCHANT_DISABLED",
      "This merchant has been disabled by the platform administrator.",
    );
  }

  if (profile.status === "archived") {
    throw new ApiError(
      403,
      "MERCHANT_ARCHIVED",
      "This merchant has been archived and cannot continue using the workspace.",
    );
  }
}

function assertMerchantTeamOwner(workspace: Pick<MerchantWorkspaceDto, "role">) {
  if (workspace.role !== "owner") {
    throw new ApiError(
      403,
      "MERCHANT_TEAM_OWNER_REQUIRED",
      "Only the merchant owner can manage team members.",
    );
  }
}

function normalizeMemberInvitationCode(code: string) {
  return code.trim().toUpperCase();
}

function generateMemberInvitationCode() {
  return `TEAM-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}
