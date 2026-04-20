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
