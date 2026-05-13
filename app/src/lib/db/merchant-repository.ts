import "server-only";

import { randomBytes } from "node:crypto";

import type {
  InvitationCodeDto,
  MemberInvitationAcceptResultDto,
  MerchantPlan,
  MerchantProfileDto,
  MerchantProfileInput,
  MerchantTeamRole,
  MerchantWorkspaceDto,
} from "@/contracts/merchant";
import {
  getLocalDemoMerchantProfile,
  resolveLocalDemoWorkspaceIdentity,
  updateLocalDemoMerchantProfile,
} from "@/lib/demo/local-demo-runtime";
import {
  isPostgresVideoChainEnabled,
  pgAcceptMemberInvitationCode,
  pgCreateInvitationCode,
  pgGetMerchantProfileById,
  pgGetMerchantProfileByOwnerUserId,
  pgGetMerchantWorkspaceByUserId,
  pgRedeemInvitationCode,
  pgUpdateMerchantProfile,
} from "@/lib/db/postgres-video-chain-repository";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
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

type InvitationCodeRow = {
  id: string;
  code: string;
  purpose: "merchant_signup";
  status: "active" | "redeemed" | "expired" | "disabled";
  max_redemptions: number;
  redemption_count: number;
  expires_at: string | null;
  note: string | null;
  created_at: string;
};

type MerchantTeamMemberRow = {
  id: string;
  merchant_id: string;
  user_id: string;
  role: MerchantTeamRole;
  status: "active" | "disabled";
  display_name: string | null;
  invited_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type MerchantTeamInvitationCodeRow = {
  id: string;
  merchant_id: string;
  code: string;
  status: "active" | "disabled" | "expired";
  max_redemptions: number;
  redemption_count: number;
  expires_at: string | null;
  note: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

const merchantProfileSelect = [
  "id",
  "owner_user_id",
  "name",
  "industry",
  "contact_name",
  "contact_phone",
  "address",
  "service_items",
  "brand_summary",
  "region_summary",
  "tone_style",
  "default_cta",
  "forbidden_words",
  "status",
  "plan",
  "created_at",
  "updated_at",
].join(", ");

const merchantTeamMemberSelect = [
  "id",
  "merchant_id",
  "user_id",
  "role",
  "status",
  "display_name",
  "invited_by_user_id",
  "created_at",
  "updated_at",
].join(", ");

const merchantTeamInvitationCodeSelect = [
  "id",
  "merchant_id",
  "code",
  "status",
  "max_redemptions",
  "redemption_count",
  "expires_at",
  "note",
  "created_by_user_id",
  "created_at",
  "updated_at",
].join(", ");

export async function createInvitationCode(input: {
  code?: string;
  maxRedemptions?: number;
  expiresAt?: string | null;
  note?: string | null;
}): Promise<InvitationCodeDto> {
  if (isPostgresVideoChainEnabled()) {
    return pgCreateInvitationCode(input);
  }

  const supabase = createSupabaseAdminClient();
  const code = input.code?.trim() || generateInvitationCode();

  const { data, error } = await supabase
    .from("invitation_codes")
    .insert({
      code,
      max_redemptions: input.maxRedemptions ?? 1,
      expires_at: input.expiresAt ?? null,
      note: input.note ?? null,
    })
    .select(
      "id, code, purpose, status, max_redemptions, redemption_count, expires_at, note, created_at",
    )
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ApiError(409, "INVITATION_CODE_EXISTS", "Invitation code already exists.");
    }

    throw new ApiError(500, "INVITATION_CODE_CREATE_FAILED", error.message);
  }

  return mapInvitationCode(data as unknown as InvitationCodeRow);
}

export async function redeemInvitationCode(input: {
  code: string;
  ownerUserId: string;
  merchantProfile: MerchantProfileInput;
}): Promise<MerchantProfileDto> {
  if (isPostgresVideoChainEnabled()) {
    return pgRedeemInvitationCode(input);
  }

  const supabase = createSupabaseAdminClient();
  const profile = input.merchantProfile;

  const { data: merchantId, error } = await supabase.rpc("redeem_invitation_code", {
    p_code: input.code.trim(),
    p_owner_user_id: input.ownerUserId,
    p_merchant_name: profile.name,
    p_contact_name: profile.contactName ?? null,
    p_contact_phone: profile.contactPhone ?? null,
    p_address: profile.address ?? null,
    p_service_items: profile.serviceItems ?? [],
    p_industry: profile.industry ?? null,
    p_brand_summary: profile.brandSummary ?? null,
    p_region_summary: profile.regionSummary ?? null,
    p_tone_style: profile.toneStyle ?? null,
    p_default_cta: profile.defaultCta ?? [],
    p_forbidden_words: profile.forbiddenWords ?? [],
  });

  if (error) {
    throw mapInviteRedemptionError(error.message);
  }

  return getMerchantProfileById(String(merchantId));
}

export async function getMerchantProfileById(id: string): Promise<MerchantProfileDto> {
  if (isPostgresVideoChainEnabled()) {
    return pgGetMerchantProfileById(id);
  }

  if (!isSupabaseAdminConfigured()) {
    const profile = getLocalDemoMerchantProfile();

    if (id !== profile.id) {
      throw new ApiError(404, "MERCHANT_PROFILE_NOT_FOUND", "Merchant profile not found.");
    }

    return profile;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("merchant_profiles")
    .select(
      [
        "id",
        "owner_user_id",
        "name",
        "industry",
        "contact_name",
        "contact_phone",
        "address",
        "service_items",
        "brand_summary",
        "region_summary",
        "tone_style",
        "default_cta",
        "forbidden_words",
        "status",
        "plan",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new ApiError(404, "MERCHANT_PROFILE_NOT_FOUND", "Merchant profile not found.");
  }

  return mapMerchantProfile(data as unknown as MerchantProfileRow);
}

export async function getMerchantProfileByOwnerUserId(
  ownerUserId: string,
): Promise<MerchantProfileDto> {
  if (isPostgresVideoChainEnabled()) {
    return pgGetMerchantProfileByOwnerUserId(ownerUserId);
  }

  if (!isSupabaseAdminConfigured()) {
    return getLocalDemoMerchantProfile(ownerUserId);
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("merchant_profiles")
    .select(
      [
        "id",
        "owner_user_id",
        "name",
        "industry",
        "contact_name",
        "contact_phone",
        "address",
        "service_items",
        "brand_summary",
        "region_summary",
        "tone_style",
        "default_cta",
        "forbidden_words",
        "status",
        "plan",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("owner_user_id", ownerUserId)
    .single();

  if (error || !data) {
    const membershipProfile = await getMerchantProfileByTeamMemberUserId(ownerUserId);

    if (membershipProfile) {
      return membershipProfile;
    }

    throw new ApiError(404, "MERCHANT_PROFILE_NOT_FOUND", "Merchant profile not found.");
  }

  return mapMerchantProfile(data as unknown as MerchantProfileRow);
}

async function getMerchantProfileByOwnerUserIdStrict(
  ownerUserId: string,
): Promise<MerchantProfileDto> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("merchant_profiles")
    .select(merchantProfileSelect)
    .eq("owner_user_id", ownerUserId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "MERCHANT_PROFILE_NOT_FOUND", "Merchant profile not found.");
  }

  return mapMerchantProfile(data as unknown as MerchantProfileRow);
}

async function getMerchantProfileByTeamMemberUserId(
  userId: string,
): Promise<MerchantProfileDto | null> {
  const membership = await getActiveMerchantTeamMemberByUserId(userId);
  return membership ? getMerchantProfileById(membership.merchant_id) : null;
}

async function getActiveMerchantTeamMemberByUserId(
  userId: string,
): Promise<MerchantTeamMemberRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("merchant_team_members")
    .select(merchantTeamMemberSelect)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error.message)) {
      return null;
    }

    throw new ApiError(500, "MERCHANT_TEAM_MEMBER_LOOKUP_FAILED", error.message);
  }

  return (data as unknown as MerchantTeamMemberRow | null) ?? null;
}

async function ensureMerchantOwnerMembership(input: {
  merchantId: string;
  userId: string;
  displayName?: string | null;
}): Promise<MerchantTeamMemberRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("merchant_team_members")
    .upsert(
      {
        merchant_id: input.merchantId,
        user_id: input.userId,
        role: "owner",
        status: "active",
        display_name: input.displayName ?? null,
      },
      { onConflict: "user_id" },
    )
    .select(merchantTeamMemberSelect)
    .single();

  if (error) {
    if (isMissingRelationError(error.message)) {
      return null;
    }

    throw new ApiError(500, "MERCHANT_TEAM_OWNER_MEMBERSHIP_FAILED", error.message);
  }

  return data as unknown as MerchantTeamMemberRow;
}

export async function getMerchantWorkspaceByUserId(userId: string): Promise<MerchantWorkspaceDto> {
  if (isPostgresVideoChainEnabled()) {
    return pgGetMerchantWorkspaceByUserId(userId);
  }

  if (!isSupabaseAdminConfigured()) {
    const identity = resolveLocalDemoWorkspaceIdentity(userId);
    const merchantProfile = getLocalDemoMerchantProfile(
      identity.ownerUserId,
      identity.merchantId,
    );

    return {
      merchantProfile,
      role: identity.role,
      membershipId:
        identity.role === "owner"
          ? "demo-membership-local-owner"
          : `demo-membership-local-${userId}`,
    };
  }

  const ownerProfile = await getMerchantProfileByOwnerUserIdStrict(userId).catch(() => null);

  if (ownerProfile) {
    const membership = await ensureMerchantOwnerMembership({
      merchantId: ownerProfile.id,
      userId,
      displayName: ownerProfile.name,
    });

    return {
      merchantProfile: ownerProfile,
      role: "owner",
      membershipId: membership?.id ?? null,
    };
  }

  const membership = await getActiveMerchantTeamMemberByUserId(userId);

  if (!membership) {
    throw new ApiError(404, "MERCHANT_PROFILE_NOT_FOUND", "Merchant profile not found.");
  }

  return {
    merchantProfile: await getMerchantProfileById(membership.merchant_id),
    role: membership.role,
    membershipId: membership.id,
  };
}

export async function acceptMemberInvitationCode(input: {
  code: string;
  userId: string;
  displayName?: string | null;
}): Promise<MemberInvitationAcceptResultDto> {
  if (isPostgresVideoChainEnabled()) {
    return pgAcceptMemberInvitationCode(input);
  }

  const normalizedCode = normalizeMemberInvitationCode(input.code);

  if (!normalizedCode) {
    throw new ApiError(400, "MEMBER_INVITATION_CODE_REQUIRED", "Member invitation code is required.");
  }

  if (!isSupabaseAdminConfigured()) {
    const workspace = await getMerchantWorkspaceByUserId(input.userId);

    return {
      ...workspace,
      invitationCode: normalizedCode,
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("merchant_team_invitation_codes")
    .select(merchantTeamInvitationCodeSelect)
    .eq("code", normalizedCode)
    .maybeSingle();

  if (error) {
    if (isMissingMemberInvitationCodesRelationError(error.message)) {
      throw new ApiError(
        500,
        "MEMBER_INVITATION_CODES_NOT_READY",
        "Member invitation table is not migrated yet.",
      );
    }

    throw new ApiError(500, "MEMBER_INVITATION_LOOKUP_FAILED", error.message);
  }

  const invitation = (data as unknown as MerchantTeamInvitationCodeRow | null) ?? null;

  assertMemberInvitationUsable(invitation);

  const { data: membership, error: upsertError } = await supabase
    .from("merchant_team_members")
    .upsert(
      {
        merchant_id: invitation.merchant_id,
        user_id: input.userId,
        role: "member",
        status: "active",
        display_name: input.displayName ?? null,
        invited_by_user_id: invitation.created_by_user_id,
      },
      { onConflict: "user_id" },
    )
    .select(merchantTeamMemberSelect)
    .single();

  if (upsertError || !membership) {
    throw new ApiError(
      500,
      "MEMBER_INVITATION_MEMBERSHIP_FAILED",
      upsertError?.message ?? "Failed to bind member to team.",
    );
  }

  const { error: updateError } = await supabase
    .from("merchant_team_invitation_codes")
    .update({
      redemption_count: invitation.redemption_count + 1,
    })
    .eq("id", invitation.id);

  if (updateError) {
    throw new ApiError(500, "MEMBER_INVITATION_UPDATE_FAILED", updateError.message);
  }

  const workspace = await getMerchantWorkspaceByUserId(input.userId);

  return {
    ...workspace,
    invitationCode: normalizedCode,
  };
}

export async function updateMerchantProfile(
  ownerUserId: string,
  input: Partial<MerchantProfileInput>,
): Promise<MerchantProfileDto> {
  if (isPostgresVideoChainEnabled()) {
    return pgUpdateMerchantProfile(ownerUserId, input);
  }

  if (!isSupabaseAdminConfigured()) {
    return updateLocalDemoMerchantProfile(ownerUserId, input);
  }

  const supabase = createSupabaseAdminClient();
  const update: Record<string, unknown> = {};

  if (input.name !== undefined) update.name = input.name;
  if (input.industry !== undefined) update.industry = input.industry;
  if (input.contactName !== undefined) update.contact_name = input.contactName;
  if (input.contactPhone !== undefined) update.contact_phone = input.contactPhone;
  if (input.address !== undefined) update.address = input.address;
  if (input.serviceItems !== undefined) update.service_items = input.serviceItems;
  if (input.brandSummary !== undefined) update.brand_summary = input.brandSummary;
  if (input.regionSummary !== undefined) update.region_summary = input.regionSummary;
  if (input.toneStyle !== undefined) update.tone_style = input.toneStyle;
  if (input.defaultCta !== undefined) update.default_cta = input.defaultCta;
  if (input.forbiddenWords !== undefined) update.forbidden_words = input.forbiddenWords;

  if (Object.keys(update).length === 0) {
    return getMerchantProfileByOwnerUserId(ownerUserId);
  }

  const { data, error } = await supabase
    .from("merchant_profiles")
    .update(update)
    .eq("owner_user_id", ownerUserId)
    .select(
      [
        "id",
        "owner_user_id",
        "name",
        "industry",
        "contact_name",
        "contact_phone",
        "address",
        "service_items",
        "brand_summary",
        "region_summary",
        "tone_style",
        "default_cta",
        "forbidden_words",
        "status",
        "plan",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .single();

  if (error || !data) {
    throw new ApiError(500, "MERCHANT_PROFILE_UPDATE_FAILED", error?.message ?? "Update failed.");
  }

  return mapMerchantProfile(data as unknown as MerchantProfileRow);
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

function mapInvitationCode(row: InvitationCodeRow): InvitationCodeDto {
  return {
    id: row.id,
    code: row.code,
    purpose: row.purpose,
    status: row.status,
    maxRedemptions: row.max_redemptions,
    redemptionCount: row.redemption_count,
    expiresAt: row.expires_at,
    note: row.note,
    createdAt: row.created_at,
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

function mapInviteRedemptionError(message: string): ApiError {
  if (message.includes("INVITATION_CODE_NOT_FOUND")) {
    return new ApiError(404, "INVITATION_CODE_NOT_FOUND", "Invitation code was not found.");
  }

  if (message.includes("INVITATION_CODE_EXPIRED")) {
    return new ApiError(410, "INVITATION_CODE_EXPIRED", "Invitation code has expired.");
  }

  if (
    message.includes("INVITATION_CODE_NOT_ACTIVE") ||
    message.includes("INVITATION_CODE_REDEEMED")
  ) {
    return new ApiError(409, "INVITATION_CODE_UNAVAILABLE", "Invitation code is unavailable.");
  }

  if (message.includes("MERCHANT_NAME_REQUIRED")) {
    return new ApiError(400, "MERCHANT_NAME_REQUIRED", "Merchant name is required.");
  }

  if (message.includes("duplicate key")) {
    return new ApiError(409, "MERCHANT_OWNER_EXISTS", "This user already owns a merchant.");
  }

  return new ApiError(500, "INVITATION_CODE_REDEEM_FAILED", message);
}

function isMissingRelationError(message: string) {
  return message.includes("merchant_team_members") && message.includes("does not exist");
}

function isMissingMemberInvitationCodesRelationError(message: string) {
  return message.includes("merchant_team_invitation_codes") && message.includes("does not exist");
}

function normalizeMemberInvitationCode(code: string) {
  return code.trim().toUpperCase();
}

function assertMemberInvitationUsable(
  invitation: MerchantTeamInvitationCodeRow | null,
): asserts invitation is MerchantTeamInvitationCodeRow {
  if (!invitation) {
    throw new ApiError(404, "MEMBER_INVITATION_CODE_NOT_FOUND", "Member invitation code was not found.");
  }

  if (invitation.status !== "active") {
    throw new ApiError(409, "MEMBER_INVITATION_CODE_UNAVAILABLE", "Member invitation code is unavailable.");
  }

  if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) {
    throw new ApiError(410, "MEMBER_INVITATION_CODE_EXPIRED", "Member invitation code has expired.");
  }

  if (invitation.redemption_count >= invitation.max_redemptions) {
    throw new ApiError(409, "MEMBER_INVITATION_CODE_UNAVAILABLE", "Member invitation code has been fully redeemed.");
  }
}

function generateInvitationCode() {
  return `JJ-${randomBytes(6).toString("hex").toUpperCase()}`;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}
