export type MerchantPlan = "free" | "plus" | "pro";

export type MerchantProfileInput = {
  name: string;
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  serviceItems?: string[];
  industry?: string | null;
  brandSummary?: string | null;
  regionSummary?: string | null;
  toneStyle?: string | null;
  defaultCta?: string[];
  forbiddenWords?: string[];
};

export type MerchantProfileDto = {
  id: string;
  ownerUserId?: string | null;
  name: string;
  industry?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  serviceItems: string[];
  brandSummary?: string | null;
  regionSummary?: string | null;
  toneStyle?: string | null;
  defaultCta: string[];
  forbiddenWords: string[];
  status: "active" | "disabled" | "archived";
  plan: MerchantPlan;
  createdAt: string;
  updatedAt: string;
};

export type MerchantTeamRole = "owner" | "member";

export type MerchantWorkspaceDto = {
  merchantProfile: MerchantProfileDto;
  role: MerchantTeamRole;
  membershipId?: string | null;
};

export type InvitationCodeDto = {
  id: string;
  code: string;
  purpose: "merchant_signup";
  status: "active" | "redeemed" | "expired" | "disabled";
  maxRedemptions: number;
  redemptionCount: number;
  expiresAt?: string | null;
  note?: string | null;
  createdAt: string;
};
