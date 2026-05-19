import "server-only";

import { z } from "zod";

const consultationAgentToolSchema = z.enum([
  "read_merchant_profile",
  "retrieve_knowledge_base",
  "update_strategy_snapshot",
  "update_content_calendar",
  "generate_article_brief",
  "generate_video_brief",
  "read_history",
]);

const jsonObjectSchema = z.record(z.string(), z.unknown());

const agentKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "Only lowercase letters, numbers, underscores and dashes are allowed.");

const agentServiceStatusSchema = z.enum(["draft", "enabled", "disabled"]);

const agentAssetStatusSchema = z.enum(["draft", "enabled", "disabled"]);

const agentServiceFlagsSchema = z
  .object({
    systemPromptEnabled: z.boolean().optional(),
    skillsEnabled: z.boolean().optional(),
    knowledgeEnabled: z.boolean().optional(),
  })
  .catchall(z.unknown());

export const createAgentConfigSchema = z.object({
  agentKey: agentKeySchema.optional(),
  displayName: z.string().trim().min(1).max(120),
  roleDescription: z.string().trim().max(300).nullish(),
  description: z.string().trim().max(1000).nullish(),
  serviceStatus: agentServiceStatusSchema.optional(),
  serviceFlags: agentServiceFlagsSchema.optional(),
  modelConfig: jsonObjectSchema.optional(),
});

export const updateAgentConfigSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    roleDescription: z.string().trim().max(300).nullish(),
    description: z.string().trim().max(1000).nullish(),
    serviceStatus: agentServiceStatusSchema.optional(),
    serviceFlags: agentServiceFlagsSchema.optional(),
    modelConfig: jsonObjectSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const copyAgentSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
});

export const saveAgentPromptDraftSchema = z.object({
  body: z.string().max(20000),
  changeNote: z.string().trim().max(300).nullish(),
});

export const publishAgentPromptSchema = z.object({
  promptVersionId: z.uuid().optional(),
});

export const rollbackAgentPromptSchema = z.object({
  promptVersionId: z.uuid(),
});

export const saveAgentSoulDraftSchema = z.object({
  body: z.string().max(12000),
  changeNote: z.string().trim().max(300).nullish(),
});

export const publishAgentSoulSchema = z.object({
  soulVersionId: z.uuid().optional(),
});

export const rollbackAgentSoulSchema = z.object({
  soulVersionId: z.uuid(),
});

export const updateAgentSkillBindingsSchema = z.object({
  skillIds: z.array(z.uuid()).max(100),
});

export const updateAgentKnowledgeSetBindingsSchema = z.object({
  knowledgeSetIds: z.array(z.uuid()).max(100),
});

export const createAgentSkillSchema = z.object({
  skillKey: agentKeySchema.nullish(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  whenToUse: z.string().trim().max(1000).optional(),
  body: z.string().max(20000).optional(),
  status: agentAssetStatusSchema.optional(),
  dependencies: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  metadata: jsonObjectSchema.optional(),
});

export const updateAgentSkillSchema = z
  .object({
    skillKey: agentKeySchema.nullish(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    whenToUse: z.string().trim().max(1000).optional(),
    body: z.string().max(20000).optional(),
    status: agentAssetStatusSchema.optional(),
    dependencies: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const createKnowledgeSetSchema = z.object({
  setKey: agentKeySchema.nullish(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullish(),
  scope: z.enum(["platform", "merchant"]).optional(),
  merchantId: z.uuid().nullish(),
  status: agentAssetStatusSchema.optional(),
  metadata: jsonObjectSchema.optional(),
});

export const updateKnowledgeSetSchema = z
  .object({
    setKey: agentKeySchema.nullish(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullish(),
    status: agentAssetStatusSchema.optional(),
    metadata: jsonObjectSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const updateKnowledgeSetDocumentsSchema = z.object({
  documentIds: z.array(z.uuid()).max(500),
});

export const updateKnowledgeDocumentSetsSchema = z.object({
  knowledgeSetIds: z.array(z.uuid()).max(100),
});

export const runAgentTestSchema = z.object({
  agentId: z.uuid(),
  merchantId: z.uuid(),
  inputMessage: z.string().trim().min(1).max(4000),
});

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

export const memberInvitationAcceptSchema = z.object({
  code: z.string().trim().min(1).max(80),
  displayName: z.string().trim().max(80).nullish(),
});

export const createMemberInvitationCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4)
    .max(80)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/, "Only letters, numbers and dashes are allowed.")
    .optional(),
  maxRedemptions: z.number().int().min(1).max(100).optional(),
  expiresAt: z.iso.datetime().nullish(),
  note: z.string().trim().max(200).nullish(),
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

export const merchantKnowledgeDocumentPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    textContent: z.string().max(1200).optional(),
  })
  .refine((value) => value.title !== undefined || value.textContent !== undefined, {
    message: "At least one field must be provided.",
  });

export const platformAdminMerchantPatchSchema = z
  .object({
    status: z.enum(["active", "disabled", "archived"]).optional(),
    plan: z.enum(["free", "plus", "pro"]).optional(),
  })
  .refine((value) => value.status !== undefined || value.plan !== undefined, {
    message: "At least one field must be provided.",
  });

export const dailyContentTasksQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
});

export const createContentGenerationBatchSchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  days: z.number().int().min(1).max(7).optional(),
  memberScope: z.enum(["self", "active_members"]).optional(),
  extraRequirement: z.string().trim().max(1000).nullish(),
});

export const platformAdminBootstrapSchema = z.object({
  setupSecret: z.string().trim().min(1).max(200),
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().max(80).nullish(),
});

export const platformAdminUserCreateSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().max(80).nullish(),
  role: z.enum(["super_admin", "admin"]).optional(),
});

export const platformAdminUserPatchSchema = z
  .object({
    displayName: z.string().trim().max(80).nullish(),
    role: z.enum(["super_admin", "admin"]).optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined || value.role !== undefined || value.status !== undefined,
    {
      message: "At least one field must be provided.",
    },
  );

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

const consultationAgentSchema = z.object({
  systemPrompt: z.string().trim().min(1).max(5000),
  enabledTools: z.array(consultationAgentToolSchema).min(1).max(20),
  visibleExecutionMode: z.enum(["cards", "minimal"]),
  maxRounds: z.number().int().min(1).max(12),
  retrievalTopK: z.number().int().min(0).max(20),
  model: z.string().trim().min(1).max(120),
  temperature: z.number().min(0).max(2),
});

const scriptProductionAgentSchema = z.object({
  model: z.string().trim().min(1).max(120),
  temperature: z.number().min(0).max(2),
  retrievalTopK: z.number().int().min(0).max(20),
  revisionEnabled: z.boolean(),
});

const knowledgeRuntimeSchema = z.object({
  retrievalTopK: z.number().int().min(1).max(20),
  chunkSize: z.number().int().min(200).max(4000),
  chunkOverlap: z.number().int().min(0).max(1000),
  embeddingModel: z.string().trim().min(1).max(120),
  queryRewriteEnabled: z.boolean(),
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
  consultationAgent: consultationAgentSchema.optional(),
  scriptProductionAgent: scriptProductionAgentSchema.optional(),
  knowledgeRuntime: knowledgeRuntimeSchema.optional(),
});

const mediaOwnerTypeSchema = z.enum(["source_item", "content_draft", "content_variant", "voice_profile"]);

const mediaAssetTypeSchema = z.enum(["image", "video", "cover", "subtitle", "audio"]);

const videoEditJobStatusSchema = z.enum([
  "pending",
  "queued",
  "preparing",
  "running",
  "succeeded",
  "failed_retryable",
  "failed_manual",
  "cancelled",
]);

export const mediaUploadIntentSchema = z.object({
  ownerType: mediaOwnerTypeSchema,
  ownerId: z.uuid(),
  assetType: z.enum(["image", "video", "audio"]),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().positive().max(1024 * 1024 * 1024),
});

export const mediaCompleteSchema = z.object({
  ownerType: mediaOwnerTypeSchema,
  ownerId: z.uuid(),
  assetType: mediaAssetTypeSchema,
  storageProvider: z.enum(["tencent_cos", "aliyun_oss", "supabase_storage"]),
  bucketName: z.string().trim().max(120).nullish(),
  storageKey: z.string().trim().min(1).max(1000),
  mimeType: z.string().trim().max(200).nullish(),
  sizeBytes: z.number().int().nonnegative().max(1024 * 1024 * 1024).nullish(),
  etag: z.string().trim().max(200).nullish(),
  originUrl: z.url().max(2000).nullish(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

const merchantMediaManifestTagSchema = z.string().trim().min(1).max(80);

const merchantMediaManifestClipSchema = z
  .object({
    id: z.uuid().optional(),
    clipIndex: z.number().int().min(0).max(9999),
    mediaType: z.enum(["image", "video"]).optional(),
    clipType: z.enum(["full_video", "segment", "image"]),
    startTimeSeconds: z.number().min(0).nullish(),
    endTimeSeconds: z.number().positive().nullish(),
    durationSeconds: z.number().positive().nullish(),
    bucketName: z.string().trim().min(1).max(120).optional(),
    cosKey: z.string().trim().min(1).max(1000),
    thumbCosKey: z.string().trim().min(1).max(1000).nullish(),
    mimeType: z.string().trim().min(1).max(200).optional(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    orientation: z.enum(["portrait", "landscape"]).optional(),
    description: z.string().trim().min(1).max(1000),
    tags: z.array(merchantMediaManifestTagSchema).min(3).max(50),
    industryTags: z.array(merchantMediaManifestTagSchema).max(30).optional(),
    sceneTags: z.array(merchantMediaManifestTagSchema).max(30).optional(),
    shotTags: z.array(merchantMediaManifestTagSchema).max(30).optional(),
    peopleTags: z.array(merchantMediaManifestTagSchema).max(30).optional(),
    qualityTags: z.array(merchantMediaManifestTagSchema).max(30).optional(),
    tagConfidence: z.number().min(0).max(1).nullish(),
    tagSource: z.enum(["fixture", "mock", "manual", "vision_model"]).optional(),
  })
  .strict();

export const merchantMediaManifestSchema = z
  .object({
    draftId: z.uuid().nullish(),
    asset: z
      .object({
        id: z.uuid().optional(),
        mediaType: z.enum(["image", "video"]),
        source: z.enum(["merchant_upload", "merchant_confirmed"]).optional(),
        bucketName: z.string().trim().min(1).max(120).optional(),
        sourceCosKey: z.string().trim().min(1).max(1000),
        originalFilename: z.string().trim().max(255).nullish(),
        mimeType: z.string().trim().max(200).nullish(),
        fileSizeBytes: z.number().int().nonnegative().max(1024 * 1024 * 1024 * 20).nullish(),
        idempotencyKey: z.string().trim().max(300).optional(),
      })
      .strict(),
    clips: z.array(merchantMediaManifestClipSchema).min(1).max(200),
  })
  .strict();

const productionConfigFilterSchema = z
  .object({
    mood: z.array(z.union([z.string(), z.number()])).optional(),
    scene: z.array(z.union([z.string(), z.number()])).optional(),
    genre: z.array(z.union([z.string(), z.number()])).optional(),
    lang: z.array(z.union([z.string(), z.number()])).optional(),
    id: z.array(z.union([z.string(), z.number()])).optional(),
  })
  .strict();

const productionConfigSchema = z
  .object({
    voiceover: z
      .object({
        enabled: z.boolean().optional(),
        mode: z.enum(["system", "voice_profile"]).optional(),
        provider: z.enum(["bytedance_bigtts", "minimax", "302"]).optional(),
        speaker: z.string().trim().max(120).nullish(),
        voiceStyle: z.string().trim().max(120).nullish(),
        voiceProfileId: z.uuid().optional(),
        refAudioAssetId: z.uuid().optional(),
        includeOriginalAudio: z.boolean().optional(),
        speed: z.number().min(0.5).max(2).nullish(),
        volume: z.number().min(0).max(3).nullish(),
      })
      .strict()
      .optional(),
    bgm: z
      .object({
        enabled: z.boolean().optional(),
        userRequest: z.string().trim().max(300).nullish(),
        include: productionConfigFilterSchema.optional(),
        exclude: productionConfigFilterSchema.optional(),
        volume: z.number().min(0).max(3).nullish(),
      })
      .strict()
      .optional(),
    subtitles: z
      .object({
        enabled: z.boolean().optional(),
        style: z.enum(["platform_default", "bold_caption"]).optional(),
        talkingHeadSource: z.enum(["script", "asr_original_audio"]).optional(),
      })
      .strict()
      .optional(),
    render: z
      .object({
        aspectRatio: z.literal("9:16").optional(),
        maxDurationSeconds: z.number().int().min(15).max(180).nullish(),
        includeOriginalAudio: z.boolean().optional(),
        preserveTalkingHeadOriginalAudio: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const createVideoEditJobSchema = z.object({
  contentVariantId: z.uuid(),
  instructionText: z.string().trim().max(4000).nullish(),
  inputPayload: z.never().optional(),
  productionConfig: productionConfigSchema.nullish(),
  sourceJobId: z.uuid().nullish(),
}).strict();

export const createVoiceProfileSchema = z.object({
  id: z.uuid().optional(),
  displayName: z.string().trim().min(1).max(80),
  refAudioAssetId: z.uuid(),
  authorizationAccepted: z.literal(true),
}).strict();

export const listVideoEditJobsQuerySchema = z.object({
  status: videoEditJobStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const createConsultationSessionSchema = z.object({
  title: z.string().trim().max(120).nullish(),
  mode: z.enum(["standard", "roundtable"]).optional(),
});

export const sendConsultationMessageSchema = z.object({
  content: z.string().trim().min(1).max(8000),
});

export const roundtableActionSchema = z.object({
  action: z.enum([
    "complete_phase",
    "confirm_phase_summary",
    "return_to_phase",
    "save_strategy_candidate",
  ]),
});

export const generateConsultationContentSchema = z.object({
  sessionId: z.uuid().nullish(),
  dailyTaskId: z.uuid().nullish(),
  source: z.enum(["consultation_calendar", "material_center", "manual", "daily_task"]).nullish(),
  calendarItemId: z.string().trim().max(120).nullish(),
  goal: z.string().trim().max(300).nullish(),
  extraRequirement: z.string().trim().max(4000).nullish(),
  toneStyle: z.string().trim().max(80).nullish(),
  mode: z.enum(["create", "rewrite"]).optional(),
  materialId: z.uuid().nullish(),
  materialReferenceId: z.uuid().nullish(),
  strategyTag: z.string().trim().max(80).nullish(),
  articlePlaybook: z
    .enum(["balanced_seed", "viral_generation", "traffic_rewrite", "compliance_safe", "ip_persona"])
    .nullish(),
});

export const reviseArticleDraftSchema = z.object({
  contentVariantId: z.uuid(),
  revisionInstruction: z.string().trim().min(1).max(4000),
  toneStyle: z.string().trim().max(80).nullish(),
});

export const reviseVideoScriptSchema = z.object({
  contentVariantId: z.uuid(),
  sessionId: z.uuid(),
  revisionInstruction: z.string().trim().min(1).max(4000),
  materialId: z.uuid().nullish(),
  materialReferenceId: z.uuid().nullish(),
  strategyTag: z.string().trim().max(80).nullish(),
});

export const videoWorkbenchAgentMessageSchema = z.object({
  role: z.enum(["user", "assistant", "agent"]),
  content: z.string().trim().min(1).max(8000),
});

export const runVideoWorkbenchAgentSchema = z.object({
  sessionId: z.uuid().nullish(),
  dailyTaskId: z.uuid().nullish(),
  source: z.enum(["consultation_calendar", "material_center", "manual", "daily_task"]).nullish(),
  calendarItemId: z.string().trim().max(120).nullish(),
  goal: z.string().trim().max(300).nullish(),
  userMessage: z.string().trim().min(1).max(4000),
  messages: z.array(videoWorkbenchAgentMessageSchema).max(20).optional(),
  intent: z.enum(["chat", "generate", "revise"]).optional(),
  contentVariantId: z.uuid().nullish(),
  draftId: z.uuid().nullish(),
  materialId: z.uuid().nullish(),
  materialReferenceId: z.uuid().nullish(),
  strategyTag: z.string().trim().max(80).nullish(),
});

export const listContentRecordsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const materialPlatformSchema = z.enum(["xiaohongshu", "douyin"]);

export const listMaterialLibraryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  query: z.string().trim().max(300).optional(),
  retrievalTarget: z
    .enum(["copy_context", "script_context", "article_image_asset", "video_edit_asset"])
    .optional(),
});

export const createMaterialLibraryItemSchema = z.object({
  platform: materialPlatformSchema,
  url: z.url().max(2000),
});

export const createProjectMediaMaterialSchema = z.object({
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(1000).nullish(),
  assetType: z.enum(["image", "video"]),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().positive().max(1024 * 1024 * 1024),
});

export const benchmarkMaterialSearchSchema = z
  .object({
    platform: materialPlatformSchema,
    findMethod: z.enum(["keyword", "profile"]),
    keyword: z.string().trim().max(120).optional(),
    profileUrl: z.url().max(2000).optional(),
    count: z.number().int().min(1).max(20).optional(),
  })
  .refine(
    (value) =>
      value.findMethod === "keyword"
        ? Boolean(value.keyword?.trim())
        : Boolean(value.profileUrl?.trim()),
    {
      message: "Search target is required.",
      path: ["keyword"],
    },
  );

export const materialWorkbenchReferenceSchema = z.object({
  targetWorkbench: z.enum(["article", "video"]),
});
