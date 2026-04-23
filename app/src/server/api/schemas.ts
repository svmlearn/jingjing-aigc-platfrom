import "server-only";

import { z } from "zod";

export const merchantProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).nullish(),
  contactName: z.string().trim().max(80).nullish(),
  contactPhone: z.string().trim().max(40).nullish(),
  serviceItems: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  industry: z.string().trim().max(80).nullish(),
  brandSummary: z.string().trim().max(1000).nullish(),
  regionSummary: z.string().trim().max(1000).nullish(),
  toneStyle: z.string().trim().max(300).nullish(),
  defaultCta: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  forbiddenWords: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
});

export const registerWithInviteSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  inviteCode: z.string().trim().min(1).max(80),
  merchantProfile: merchantProfileInputSchema,
});

export const createInvitationCodeSchema = z.object({
  code: z.string().trim().min(4).max(80).optional(),
  maxRedemptions: z.number().int().min(1).max(50).optional(),
  expiresAt: z.iso.datetime().nullish(),
  note: z.string().trim().max(200).nullish(),
});

export const platformAdminInvitationCodePatchSchema = z.object({
  status: z.enum(["active", "disabled"]),
});

export const importRequestSchema = z.object({
  platform: z.enum(["xiaohongshu", "douyin"]),
  importType: z.enum(["detail", "creator", "comments"]),
  url: z.url().max(2000),
  options: z
    .object({
      includeComments: z.boolean().optional(),
      maxItems: z.number().int().min(1).max(50).optional(),
      maxComments: z.number().int().min(1).max(100).optional(),
    })
    .optional(),
});

export const merchantProfilePatchSchema = merchantProfileInputSchema.partial();

export const platformAdminMerchantPatchSchema = z
  .object({
    status: z.enum(["active", "disabled", "archived"]).optional(),
    plan: z.enum(["free", "plus", "pro"]).optional(),
  })
  .refine((value) => value.status !== undefined || value.plan !== undefined, {
    message: "At least one field must be provided.",
  });

const llmRuntimeSchema = z.object({
  providerLabel: z.string().trim().min(1).max(80),
  baseUrl: z.url().max(2000),
  primaryModel: z.string().trim().min(1).max(120),
  fallbackModel: z.string().trim().max(120).nullish(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(128).max(20000),
  timeoutSeconds: z.number().int().min(5).max(300),
  retryCount: z.number().int().min(0).max(10),
});

const importRuntimeSchema = z.object({
  importProvider: z.string().trim().min(1).max(80),
  defaultMaxComments: z.number().int().min(1).max(200),
  defaultCreatorPosts: z.number().int().min(1).max(100),
  waitSeconds: z.number().int().min(5).max(600),
});

const membershipPlanRuleSchema = z.object({
  dailyCredits: z.number().int().min(0).max(100000),
  description: z.string().trim().min(1).max(300),
});

export const platformSettingsUpdateSchema = z.object({
  llmRuntime: llmRuntimeSchema.optional(),
  importRuntime: importRuntimeSchema.optional(),
  membershipPlans: z
    .object({
      free: membershipPlanRuleSchema,
      plus: membershipPlanRuleSchema,
      pro: membershipPlanRuleSchema,
    })
    .optional(),
});
