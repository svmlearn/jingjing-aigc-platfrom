import "server-only";

import { randomBytes } from "node:crypto";

import type {
  InvitationCodeDto,
  MerchantProfileDto,
  MerchantProfileInput,
} from "@/contracts/merchant";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  status: "active" | "archived";
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
  created_at: string;
};

export async function createInvitationCode(input: {
  code?: string;
  maxRedemptions?: number;
  expiresAt?: string | null;
}): Promise<InvitationCodeDto> {
  const supabase = createSupabaseAdminClient();
  const code = input.code?.trim() || generateInvitationCode();

  const { data, error } = await supabase
    .from("invitation_codes")
    .insert({
      code,
      max_redemptions: input.maxRedemptions ?? 1,
      expires_at: input.expiresAt ?? null,
    })
    .select(
      "id, code, purpose, status, max_redemptions, redemption_count, expires_at, created_at",
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
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("owner_user_id", ownerUserId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "MERCHANT_PROFILE_NOT_FOUND", "Merchant profile not found.");
  }

  return mapMerchantProfile(data as unknown as MerchantProfileRow);
}

export async function updateMerchantProfile(
  ownerUserId: string,
  input: Partial<MerchantProfileInput>,
): Promise<MerchantProfileDto> {
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
    createdAt: row.created_at,
  };
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

function generateInvitationCode() {
  return `JJ-${randomBytes(6).toString("hex").toUpperCase()}`;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}
