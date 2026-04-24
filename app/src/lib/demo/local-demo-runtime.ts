import "server-only";

import type { User } from "@supabase/supabase-js";

import type { MerchantProfileDto, MerchantProfileInput } from "@/contracts/merchant";

export const localDemoUserId = "demo-user-local";
export const localDemoMerchantId = "demo-merchant-local";

let localDemoMerchant: MerchantProfileDto | null = null;

export function isLocalDemoRuntime() {
  return !(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function createLocalDemoUser(): User {
  return {
    id: localDemoUserId,
    aud: "authenticated",
    role: "authenticated",
    email: "demo@jingjing.local",
    app_metadata: {},
    user_metadata: {
      display_name: "静境本地 Demo 用户",
    },
    created_at: "2026-04-24T00:00:00.000Z",
  } as User;
}

export function getLocalDemoMerchantProfile(ownerUserId = localDemoUserId): MerchantProfileDto {
  if (!localDemoMerchant || localDemoMerchant.ownerUserId !== ownerUserId) {
    const now = new Date().toISOString();

    localDemoMerchant = {
      id: localDemoMerchantId,
      ownerUserId,
      name: "静境普拉提",
      industry: "本地生活 / 普拉提门店",
      contactName: "小静",
      contactPhone: "13800000000",
      address: "上海市徐汇区 demo 门店",
      serviceItems: ["普拉提私教", "体态评估", "产后恢复", "小班体验课"],
      brandSummary: "主打女性体态改善、低压力陪伴式训练和真实到店体验。",
      regionSummary: "门店服务半径集中在周边 3 公里白领女性与精致宝妈。",
      toneStyle: "专业、温柔、可信，不夸张承诺效果。",
      defaultCta: ["私信领取体态评估表", "预约 1 次到店体验课"],
      forbiddenWords: ["包瘦", "永久", "百分百"],
      status: "active",
      plan: "plus",
      createdAt: now,
      updatedAt: now,
    };
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
  const current = getLocalDemoMerchantProfile(ownerUserId);
  const updatedAt = new Date().toISOString();

  localDemoMerchant = {
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
  };

  return getLocalDemoMerchantProfile(ownerUserId);
}
