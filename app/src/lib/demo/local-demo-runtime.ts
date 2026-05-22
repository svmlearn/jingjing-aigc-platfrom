import "server-only";

import type { MerchantProfileDto, MerchantProfileInput } from "@/contracts/merchant";
import type { AuthenticatedUser } from "@/lib/auth/authenticated-user";

export const localDemoUserId = "demo-user-local";
export const localDemoMerchantId = "demo-merchant-local";

const localDemoMerchants = new Map<string, MerchantProfileDto>();

export function isLocalDemoRuntime() {
  return !(
    process.env.APP_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_PROVIDER === "postgres" ||
    process.env.DOMESTIC_DATABASE_ENABLED === "true"
  );
}

export function createLocalDemoUser(userId = localDemoUserId): AuthenticatedUser {
  const displayName = userId === localDemoUserId ? "静境本地 Demo 用户" : "静境本地 Demo 成员";

  return {
    id: userId,
    email: "demo@jingjing.local",
    role: userId === localDemoUserId ? "merchant_owner" : "merchant_member",
    displayName,
    appMetadata: {
      provider: "local_demo",
    },
    userMetadata: {
      displayName,
    },
  };
}

export function resolveLocalDemoWorkspaceIdentity(userId: string) {
  const match = /^demo-team-([a-z0-9]+)-/.exec(userId);

  if (!match) {
    return {
      merchantId: localDemoMerchantId,
      ownerUserId: localDemoUserId,
      role: userId === localDemoUserId ? ("owner" as const) : ("member" as const),
    };
  }

  const teamKey = match[1];
  const ownerUserId = `demo-team-${teamKey}-owner`;

  return {
    merchantId: `demo-merchant-${teamKey}-local`,
    ownerUserId,
    role: userId === ownerUserId ? ("owner" as const) : ("member" as const),
  };
}

export function getLocalDemoMerchantProfile(
  ownerUserId = localDemoUserId,
  merchantId = resolveLocalDemoWorkspaceIdentity(ownerUserId).merchantId,
): MerchantProfileDto {
  const current = localDemoMerchants.get(merchantId);

  if (!current || current.ownerUserId !== ownerUserId) {
    const now = new Date().toISOString();

    localDemoMerchants.set(merchantId, {
      id: merchantId,
      ownerUserId,
      name: merchantId === localDemoMerchantId ? "静境 Demo 用户" : `静境 ${merchantId} 团队`,
      industry: null,
      contactName: null,
      contactPhone: null,
      address: null,
      serviceItems: [],
      brandSummary: null,
      regionSummary: null,
      toneStyle: null,
      defaultCta: [],
      forbiddenWords: [],
      status: "active",
      plan: "plus",
      createdAt: now,
      updatedAt: now,
    });
  }

  const localDemoMerchant = localDemoMerchants.get(merchantId);

  if (!localDemoMerchant) {
    throw new Error("Local demo merchant profile was not initialized.");
  }

  return {
    ...localDemoMerchant,
    serviceItems: [...localDemoMerchant.serviceItems],
    defaultCta: [...localDemoMerchant.defaultCta],
    forbiddenWords: [...localDemoMerchant.forbiddenWords],
  };
}

export function updateLocalDemoMerchantProfile(
  ownerUserId: string,
  input: Partial<MerchantProfileInput>,
): MerchantProfileDto {
  const { merchantId } = resolveLocalDemoWorkspaceIdentity(ownerUserId);
  const current = getLocalDemoMerchantProfile(ownerUserId, merchantId);
  const updatedAt = new Date().toISOString();

  localDemoMerchants.set(merchantId, {
    ...current,
    name: input.name ?? current.name,
    industry: input.industry ?? current.industry,
    contactName: input.contactName ?? current.contactName,
    contactPhone: input.contactPhone ?? current.contactPhone,
    address: input.address ?? current.address,
    serviceItems: input.serviceItems ?? current.serviceItems,
    brandSummary: input.brandSummary ?? current.brandSummary,
    regionSummary: input.regionSummary ?? current.regionSummary,
    toneStyle: input.toneStyle ?? current.toneStyle,
    defaultCta: input.defaultCta ?? current.defaultCta,
    forbiddenWords: input.forbiddenWords ?? current.forbiddenWords,
    updatedAt,
  });

  return getLocalDemoMerchantProfile(ownerUserId, merchantId);
}
