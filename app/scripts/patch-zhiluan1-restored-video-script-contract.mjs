#!/usr/bin/env node

import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const { Client } = pg;

const target = {
  merchantId: "e7c94a17-cf7d-4eb2-8178-13daa780551a",
  memberUserId: "0b3351a6-778b-4e79-b5f1-6aa18fdb0020",
  dailyTaskId: "39946899-d5ec-45a1-9203-18799554da24",
  draftId: "36fa1e4f-1c92-40e3-a8cd-f228b5e799ae",
  variantId: "3ff39eeb-e9b8-445d-827a-4d19595b28b3",
  restoredFromDailyTaskId: "56c7f587-344d-4977-b387-c10380c5662b",
  restoredFromDraftId: "7758b270-ccfc-4829-a0b2-6f833e386e50",
  restoredFromVariantId: "4d3dcf7e-d1e6-458d-a9a5-66e41b0cceb6",
  originalSourceTaskId: "18451440-8ebe-4fe0-bd5f-d3391741fd11",
  originalSourceDraftId: "574ae1a3-7557-44e0-a92a-a3652e20c32b",
  originalSourceVariantId: "1856b226-210a-4ccf-a80e-d37344d7fa41",
  restoredFromTaskDate: "2026-05-22",
  restoredForTaskDate: "2026-05-23",
};

const auditVersion = "zhiluan1-restored-video-script-contract-20260523";
const normalFlowReference =
  "docs/架构规范/2026-05-15-Dify主链路国内自托管方案/03-数据合同与落库边界.md";

const missingNormalDifyFields = [
  "content_generation_jobs row",
  "content_drafts.input_snapshot.contentGenerationJobId",
  "content_drafts.input_snapshot.batchId",
  "content_drafts.input_snapshot.workflowProvider = dify",
  "content_drafts.input_snapshot.workflowVersion",
  "content_drafts.input_snapshot.difyWorkflowRunId",
  "content_drafts.input_snapshot.difyInputs",
  "content_drafts.input_snapshot.difyFinalJson",
  "content_drafts.input_snapshot.difyRawOutputs",
  "content_drafts.input_snapshot.memberProfileSnapshot",
  "content_drafts.input_snapshot.accountProfileSnapshot",
];

const compensatedFields = [
  "daily_content_tasks.video_task.generatedVideoScript.scenes[].required",
  "daily_content_tasks.video_task.memberUploadPolicy",
  "daily_content_tasks.video_task.recommendedProductionConfig",
  "daily_content_tasks.video_task.recommendedProductionConfig.render without maxDurationSeconds",
  "daily_content_tasks.video_task.generatedVideoScript.targetDurationSeconds for frontend display only",
  "content_variants.production_scenes[].requiresUserUpload",
  "content_variants.production_scenes[].sceneType",
  "content_variants.production_scenes[].durationSeconds",
  "content_variants.production_scenes[].timeRange",
  "content_drafts.input_snapshot.factoryMemberAssignment",
  "content_drafts.input_snapshot.manualRestoreProvenance",
  "content_drafts.input_snapshot.difyContractAudit",
];

loadEnvFileFromArgs();

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("APP_DATABASE_URL or DATABASE_URL is required.");
}

const db = new Client({
  connectionString: databaseUrl,
  ssl: process.env.APP_DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

try {
  await db.connect();
  await db.query("begin");

  const context = await loadContext();
  const productionScenes = buildProductionScenes(context.task.video_task);
  const audit = buildAudit(context, productionScenes);
  const snapshot = buildPatchedSnapshot(context, audit);
  const teamCalendarSource = buildPatchedTeamCalendarSource(context, audit);
  const videoTask = buildPatchedVideoTask(context.task.video_task);
  const variantScriptText = buildVariantScriptText(videoTask.generatedVideoScript);

  await db.query(
    `
    update public.content_drafts
    set input_snapshot = $3::jsonb,
        updated_at = timezone('utc', now())
    where id = $1
      and merchant_id = $2
    `,
    [target.draftId, target.merchantId, JSON.stringify(snapshot)],
  );

  await db.query(
    `
    update public.content_variants
    set production_scenes = $3::jsonb,
        script_text = $4,
        updated_at = timezone('utc', now())
    where id = $1
      and draft_id = $2
    `,
    [target.variantId, target.draftId, JSON.stringify(productionScenes), variantScriptText],
  );

  await db.query(
    `
    update public.daily_content_tasks
    set team_calendar_source = $4::jsonb,
        video_task = $5::jsonb,
        updated_at = timezone('utc', now())
    where id = $1
      and merchant_id = $2
      and user_id = $3
    `,
    [
      target.dailyTaskId,
      target.merchantId,
      target.memberUserId,
      JSON.stringify(teamCalendarSource),
      JSON.stringify(videoTask),
    ],
  );

  if (apply) {
    await db.query("commit");
  } else {
    await db.query("rollback");
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "applied" : "dry-run",
        target,
        audit,
        productionSceneCount: productionScenes.length,
        talkingHeadSceneNumbers: productionScenes
          .filter((scene) => scene.requiresUserUpload)
          .map((scene) => scene.sceneNo),
        scriptText: variantScriptText,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await db.end();
}

async function loadContext() {
  const task = await db.query(
    `
    select *
    from public.daily_content_tasks
    where id = $1
      and merchant_id = $2
      and user_id = $3
    limit 1
    `,
    [target.dailyTaskId, target.merchantId, target.memberUserId],
  );
  if (!task.rows[0]) {
    throw new Error("Target daily task was not found.");
  }

  const draft = await db.query(
    `
    select *
    from public.content_drafts
    where id = $1
      and merchant_id = $2
    limit 1
    `,
    [target.draftId, target.merchantId],
  );
  if (!draft.rows[0]) {
    throw new Error("Target content draft was not found.");
  }

  const variant = await db.query(
    `
    select *
    from public.content_variants
    where id = $1
      and draft_id = $2
      and variant_type = 'video_script'
    limit 1
    `,
    [target.variantId, target.draftId],
  );
  if (!variant.rows[0]) {
    throw new Error("Target video script variant was not found.");
  }

  const assets = await db.query(
    `
    select id, asset_type, owner_type, owner_id, storage_provider, bucket_name, storage_key,
           mime_type, file_size_bytes, sort_order, created_at
    from public.asset_objects
    where owner_type = 'content_draft'
      and owner_id = $1
      and asset_type = 'video'
    order by created_at asc
    `,
    [target.draftId],
  );

  return {
    task: task.rows[0],
    draft: draft.rows[0],
    variant: variant.rows[0],
    assets: assets.rows,
  };
}

function buildPatchedSnapshot(context, audit) {
  const task = context.task;
  const snapshot = toRecord(context.draft.input_snapshot);

  return {
    ...snapshot,
    dailyTaskId: target.dailyTaskId,
    taskDate: readDateString(task.task_date, target.restoredForTaskDate),
    materialRefs: Array.isArray(task.material_refs) ? task.material_refs : [],
    knowledgeRefs: Array.isArray(task.knowledge_refs) ? task.knowledge_refs : [],
    factoryMemberAssignment: buildFactoryMemberAssignment(snapshot.factoryMemberAssignment),
    manualRestoreProvenance: buildManualRestoreProvenance(context),
    difyContractAudit: audit,
  };
}

function buildPatchedTeamCalendarSource(context, audit) {
  const task = context.task;
  const source = toRecord(task.team_calendar_source);

  return {
    ...source,
    source: "manual_factory_script",
    assignedToMemberUserId: target.memberUserId,
    assignedFromTaskId:
      readString(source.assignedFromTaskId, "") ||
      readString(source.restoredFromDailyTaskId, "") ||
      readString(context.draft.input_snapshot?.restoredFromDailyTaskId, ""),
    assignmentMarker: readString(source.assignmentMarker, "factory_member_video_assignment_20260522"),
    scriptDraftId: target.draftId,
    scriptVariantId: target.variantId,
    factoryMemberAssignment: buildFactoryMemberAssignment(source.factoryMemberAssignment),
    manualRestoreProvenance: buildManualRestoreProvenance(context),
    difyContractAudit: {
      status: audit.status,
      auditVersion: audit.auditVersion,
      checkedAt: audit.checkedAt,
      missingNormalDifyFields: audit.missingNormalDifyFields,
    },
    updatedAt: audit.checkedAt,
  };
}

function buildPatchedVideoTask(videoTaskValue) {
  const videoTask = toRecord(videoTaskValue);
  const script = toRecord(videoTask.generatedVideoScript);
  const scenes = Array.isArray(script.scenes)
    ? script.scenes.map((scene) => normalizeFactoryScene(scene))
    : [];
  const targetDurationSeconds =
    normalizePositiveInteger(script.targetDurationSeconds) ??
    scenes.reduce((sum, scene) => sum + (normalizePositiveNumber(scene.durationSeconds) ?? 0), 0);

  return {
    ...videoTask,
    contentDraftId: target.draftId,
    contentVariantId: target.variantId,
    generatedVideoScript: {
      ...script,
      targetDurationSeconds,
      scenes,
    },
    recommendedProductionConfig: normalizeRecommendedProductionConfig(
      videoTask.recommendedProductionConfig,
    ),
    memberUploadPolicy: "talking_head_required_only",
  };
}

function buildProductionScenes(videoTaskValue) {
  const videoTask = buildPatchedVideoTask(videoTaskValue);
  const scenes = Array.isArray(videoTask.generatedVideoScript?.scenes)
    ? videoTask.generatedVideoScript.scenes
    : [];

  let elapsedSeconds = 0;

  return scenes.map((scene, index) => {
    const requiresUserUpload = scene.required === true;
    const durationSeconds = normalizePositiveNumber(scene.durationSeconds);
    const sceneDescription = getFactorySceneDescription(scene, index);
    const timeRange =
      readString(scene.timeRange, "") ||
      (durationSeconds ? formatTimeRange(elapsedSeconds, elapsedSeconds + durationSeconds) : "");
    if (durationSeconds) {
      elapsedSeconds += durationSeconds;
    }

    return {
      sceneNo: normalizePositiveInteger(scene.order) ?? index + 1,
      timeRange,
      durationSeconds,
      sceneType: requiresUserUpload ? "talking_head" : "merchant_broll",
      requiresUserUpload,
      shotRequirement: "",
      visual: sceneDescription.visual,
      voiceover: readString(scene.spokenText, ""),
      subtitle: readString(scene.spokenText, scene.subtitle),
      materials: [],
      cameraMovement: sceneDescription.visual,
      purpose: readString(scene.title, ""),
      fallbackShot: "",
    };
  });
}

function normalizeFactoryScene(sceneValue) {
  const scene = toRecord(sceneValue);
  const spokenText = readString(scene.spokenText, readString(scene.subtitle, ""));
  const sceneNo = normalizePositiveInteger(scene.order);
  const isClosingScene = sceneNo === 5;
  const sceneDescription = getFactorySceneDescription(scene);
  const required = isTalkingHeadScene(scene) || scene.required === true;
  return {
    ...scene,
    title: isClosingScene ? "成员口播收尾" : sceneDescription.title,
    camera: sceneDescription.visual,
    subtitle: spokenText,
    spokenText,
    materialSlot: required ? sceneDescription.uploadLabel : "",
    shootingGuide: required
      ? "真人面对镜头按台词口播，声音保持清晰，背景不需要指定为园区门口。"
      : sceneDescription.visual,
    required,
  };
}

function buildVariantScriptText(scriptValue) {
  const script = toRecord(scriptValue);
  const scenes = Array.isArray(script.scenes)
    ? script.scenes.map((scene) => normalizeFactoryScene(scene))
    : [];
  const fullVoiceover = scenes
    .map((scene) => readString(scene.spokenText, ""))
    .filter(Boolean)
    .join("\n");
  const timeRanges = buildSceneTimeRanges(scenes);
  const blocks = [
    `标题：${readString(script.title, "找厂房，先看这三个点")}`,
    "音乐：使用背景音乐，轻快、稳重、有节奏的工业园区招商背景音乐，音量低，不压口播。",
    "",
    "完整口播：",
    fullVoiceover,
    "",
    "分镜脚本：",
    ...scenes.flatMap((scene, index) => {
      const sceneNo = normalizePositiveInteger(scene.order) ?? index + 1;
      const sceneDescription = getFactorySceneDescription(scene, index);
      const spokenText = readString(scene.spokenText, "");
      return [
        String(sceneNo),
        timeRanges[index] ?? "",
        `场景：${sceneDescription.title}`,
        `画面：${sceneDescription.visual}`,
        `台词/字幕：${spokenText}`,
        "",
      ];
    }),
    `结尾引导：${readString(script.cta, "")}`,
  ];

  return blocks.filter((line) => line !== null && line !== undefined).join("\n").trim();
}

function getFactorySceneDescription(sceneValue, fallbackIndex = 0) {
  const scene = toRecord(sceneValue);
  const sceneNo = normalizePositiveInteger(scene.order) ?? fallbackIndex + 1;
  const descriptions = {
    1: {
      title: "成员口播开场",
      visual: "成员面对镜头开场，先抛出找厂房不要只看价格，要看空间、配套、位置。",
      uploadLabel: "成员开场口播",
    },
    2: {
      title: "厂房空间介绍",
      visual: "呈现厂房主体空间和层高感，让观众能看出一楼约 2000 平，生产、仓储、办公改造都比较好安排。",
      uploadLabel: "",
    },
    3: {
      title: "园区配套介绍",
      visual: "呈现宿舍、公寓、食堂、电梯、管理处、停车等园区基础配套，表达员工生活和企业使用便利。",
      uploadLabel: "",
    },
    4: {
      title: "周边环境与通勤物流",
      visual: "呈现园区周边环境、道路交通和物流条件，表达员工通勤、货物流转都方便。",
      uploadLabel: "",
    },
    5: {
      title: "成员口播收尾",
      visual: "成员面对镜头收尾，引导正在找工业园区厂房的人实地看一眼。",
      uploadLabel: "成员收尾口播",
    },
  };

  return descriptions[sceneNo] ?? {
    title: readString(scene.title, `场景 ${sceneNo}`),
    visual: readString(scene.camera, "按本段台词呈现对应画面内容。"),
    uploadLabel: "",
  };
}

function buildSceneTimeRanges(scenes) {
  let elapsedSeconds = 0;

  return scenes.map((scene) => {
    const durationSeconds = normalizePositiveNumber(scene.durationSeconds);
    const explicitTimeRange = readString(scene.timeRange, "");

    if (explicitTimeRange) {
      if (durationSeconds) {
        elapsedSeconds += durationSeconds;
      }
      return explicitTimeRange;
    }

    if (!durationSeconds) {
      return "";
    }

    const timeRange = formatTimeRange(elapsedSeconds, elapsedSeconds + durationSeconds);
    elapsedSeconds += durationSeconds;
    return timeRange;
  });
}

function buildAudit(context, productionScenes) {
  const snapshot = toRecord(context.draft.input_snapshot);
  const checkedAt = new Date().toISOString();
  const talkingHeadScenes = productionScenes.filter((scene) => scene.requiresUserUpload);
  const uploadedVideoAssets = context.assets.map((asset) => ({
    id: asset.id,
    storageProvider: asset.storage_provider,
    bucketName: asset.bucket_name,
    storageKey: asset.storage_key,
    mimeType: asset.mime_type,
    fileSizeBytes: asset.file_size_bytes,
  }));

  return {
    status: "manual_restored_script_not_dify_workflow_output",
    auditVersion,
    checkedAt,
    normalFlowReference,
    notBackfilledReason:
      "The restored script was assembled manually from an existing daily-task draft, so no real Dify workflow run or content_generation_jobs row exists to copy.",
    presentCompensations: compensatedFields,
    missingNormalDifyFields,
    cannotFabricate: [
      "Do not set source=dify_daily_task_generation.",
      "Do not create a fake succeeded content_generation_jobs row.",
      "Do not invent difyWorkflowRunId, difyInputs, difyFinalJson, or difyRawOutputs.",
    ],
    workerReadiness: {
      productionSceneCount: productionScenes.length,
      talkingHeadSceneNumbers: talkingHeadScenes.map((scene) => scene.sceneNo),
      totalDisplayDurationSeconds: productionScenes.reduce(
        (sum, scene) => sum + (normalizePositiveNumber(scene.durationSeconds) ?? 0),
        0,
      ),
      renderMaxDurationSecondsPolicy:
        "targetDurationSeconds stays available for frontend display, but render.maxDurationSeconds is removed from recommendedProductionConfig and ignored by payload creation.",
      uploadedVideoAssetIds: uploadedVideoAssets.map((asset) => asset.id),
      uploadedVideoAssetCount: uploadedVideoAssets.length,
      uploadPolicy: "talking_head_required_only",
      payloadBuilderBehavior:
        "buildVideoEditJobInputPayload infers draft uploaded videos as talking_head when production_scenes requires user upload.",
    },
    originalSnapshotSource: readString(snapshot.source, null),
    restoredFrom: {
      memberTask: {
        taskDate: target.restoredFromTaskDate,
        dailyTaskId:
          readString(snapshot.restoredFromDailyTaskId, "") || target.restoredFromDailyTaskId,
        draftId: readString(snapshot.restoredFromDraftId, "") || target.restoredFromDraftId,
        variantId: readString(snapshot.restoredFromVariantId, "") || target.restoredFromVariantId,
      },
      originalFactorySource: {
        dailyTaskId:
          readString(snapshot.factoryMemberAssignment?.sourceTaskId, "") ||
          target.originalSourceTaskId,
        draftId:
          readString(snapshot.factoryMemberAssignment?.sourceDraftId, "") ||
          target.originalSourceDraftId,
        variantId:
          readString(snapshot.factoryMemberAssignment?.sourceVariantId, "") ||
          target.originalSourceVariantId,
      },
    },
  };
}

function buildFactoryMemberAssignment(existing) {
  const record = toRecord(existing);
  return {
    marker: readString(record.marker, "factory_member_video_assignment_20260522"),
    sourceTaskId: readString(record.sourceTaskId, target.originalSourceTaskId),
    sourceDraftId: readString(record.sourceDraftId, target.originalSourceDraftId),
    sourceVariantId: readString(record.sourceVariantId, target.originalSourceVariantId),
    targetMerchantId: target.merchantId,
    targetUserId: target.memberUserId,
  };
}

function buildManualRestoreProvenance(context) {
  const snapshot = toRecord(context.draft.input_snapshot);
  return {
    source: "manual_factory_script_restore",
    sourceIsDifyWorkflowRun: false,
    restoredForDailyTaskId: target.dailyTaskId,
    restoredForTaskDate: target.restoredForTaskDate,
    restoredFromTaskDate: target.restoredFromTaskDate,
    restoredFromDailyTaskId:
      readString(snapshot.restoredFromDailyTaskId, "") || target.restoredFromDailyTaskId,
    restoredFromDraftId:
      readString(snapshot.restoredFromDraftId, "") || target.restoredFromDraftId,
    restoredFromVariantId:
      readString(snapshot.restoredFromVariantId, "") || target.restoredFromVariantId,
    originalSourceDailyTaskId:
      readString(snapshot.factoryMemberAssignment?.sourceTaskId, "") ||
      target.originalSourceTaskId,
    originalSourceDraftId:
      readString(snapshot.factoryMemberAssignment?.sourceDraftId, "") ||
      target.originalSourceDraftId,
    originalSourceVariantId:
      readString(snapshot.factoryMemberAssignment?.sourceVariantId, "") ||
      target.originalSourceVariantId,
    restoredDraftId: target.draftId,
    restoredVariantId: target.variantId,
  };
}

function isTalkingHeadScene(scene) {
  const text = [
    scene?.title,
    scene?.materialSlot,
    scene?.shootingGuide,
    scene?.camera,
  ]
    .filter(Boolean)
    .join(" ");

  return /口播|真人|成员|出镜|talking/i.test(text);
}

function splitMaterialSlot(value) {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[、,，;；/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePositiveInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizePositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function readString(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeRecommendedProductionConfig(value) {
  const config = toRecord(value);
  const render = toRecord(config.render);
  const renderWithoutDurationLimit = { ...render };
  delete renderWithoutDurationLimit.maxDurationSeconds;
  delete renderWithoutDurationLimit.max_duration_seconds;

  return {
    ...config,
    render: {
      ...renderWithoutDurationLimit,
      aspectRatio: readString(render.aspectRatio, "9:16"),
      includeOriginalAudio: render.includeOriginalAudio === true,
    },
  };
}

function formatTimeRange(startSeconds, endSeconds) {
  return `${formatTimestamp(startSeconds)}-${formatTimestamp(endSeconds)}`;
}

function formatTimestamp(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readDateString(value, fallback) {
  if (typeof value === "string" && value.trim()) {
    return value.slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  return fallback;
}

function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
