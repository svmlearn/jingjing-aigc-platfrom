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
const factoryScriptSpec = {
  title: "找厂房，别只看租金",
  cta: "你要找工业园区厂房，建议实地来看一圈。",
  targetDurationSeconds: 64,
  scenes: [
    {
      order: 1,
      timeRange: "00:00-00:08",
      durationSeconds: 8,
      title: "成员口播开场",
      visual: "成员在园区现场面对镜头开场，带出看厂房不能只看租金，要先判断空间、配套和管理。",
      spokenText: "找厂房别只看租金，先看空间能不能用、配套能不能跟上、管理是不是省心。",
      uploadLabel: "成员开场口播",
      required: true,
    },
    {
      order: 2,
      timeRange: "00:08-00:20",
      durationSeconds: 12,
      title: "厂房空间和层高",
      visual: "呈现空置厂房空间、柱网、绿色地坪和整体层高感，让观众看到一楼主力厂房的开阔度和可用性。",
      spokenText:
        "这边主力是一楼约 2000 平厂房，层高到楼板 5.56 米、到梁 5 米，空区开阔，柱网清楚，生产、仓储、轻加工都好安排。",
      uploadLabel: "",
      required: false,
    },
    {
      order: 3,
      timeRange: "00:20-00:30",
      durationSeconds: 10,
      title: "厂房基础设施",
      visual: "呈现采光窗、消防栓、配电箱、地面标识和安全警示等基础设施，表达后期布置和改造有基础。",
      spokenText:
        "现场能看到采光窗、绿色地坪、消防栓、配电箱和安全警示，后期做办公隔断、设备布置，也有基础。",
      uploadLabel: "",
      required: false,
    },
    {
      order: 4,
      timeRange: "00:30-00:41",
      durationSeconds: 11,
      title: "楼上补充空间与楼层动线",
      visual: "呈现楼上可租空间、电梯厅、玻璃门入口、走廊入口和通道，表达空间可以分区使用。",
      spokenText:
        "除了主力空间，楼上还有可租补充空间，电梯厅、玻璃门入口和通道都比较清楚，适合把仓储、办公室或者配套功能分开布置。",
      uploadLabel: "",
      required: false,
    },
    {
      order: 5,
      timeRange: "00:41-00:50",
      durationSeconds: 9,
      title: "园区管理和公共配套",
      visual: "呈现管理服务站、消防疏散图、厂区平面图、电梯轿厢和管理信息，表达园区管理与基础配套比较完整。",
      spokenText:
        "园区里面有管理服务站，消防疏散图、厂区平面图、电梯和管理信息都能看到，日常使用不用只靠口头承诺。",
      uploadLabel: "",
      required: false,
    },
    {
      order: 6,
      timeRange: "00:50-01:04",
      durationSeconds: 14,
      title: "住宿生活配套与成员收尾",
      visual: "呈现宿舍楼、公寓楼、生活区通道、电动车停放和成员面对镜头收尾，引导实地看厂。",
      spokenText:
        "员工这块也有宿舍和公寓，楼下有生活区通道和电动车停放，停车、住宿、通勤会更好安排。找厂房不只是看面积和价格，更要看空间、设施、住宿和管理是不是一起到位，建议实地来看一圈。",
      uploadLabel: "成员收尾口播",
      required: true,
    },
  ],
};

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
        title = $5,
        cta_text = $6,
        updated_at = timezone('utc', now())
    where id = $1
      and draft_id = $2
    `,
    [
      target.variantId,
      target.draftId,
      JSON.stringify(productionScenes),
      variantScriptText,
      factoryScriptSpec.title,
      factoryScriptSpec.cta,
    ],
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
  const scenes = buildFactoryScriptScenes(script.scenes);
  const targetDurationSeconds =
    normalizePositiveInteger(factoryScriptSpec.targetDurationSeconds) ??
    normalizePositiveInteger(script.targetDurationSeconds) ??
    scenes.reduce((sum, scene) => sum + (normalizePositiveNumber(scene.durationSeconds) ?? 0), 0);

  return {
    ...videoTask,
    title: factoryScriptSpec.title,
    contentDraftId: target.draftId,
    contentVariantId: target.variantId,
    generatedVideoScript: {
      ...script,
      title: factoryScriptSpec.title,
      cta: factoryScriptSpec.cta,
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
  const sceneNo = normalizePositiveInteger(scene.order);
  const specScene = getFactoryScriptScene(sceneNo);
  const spokenText = specScene?.spokenText ?? readString(scene.spokenText, readString(scene.subtitle, ""));
  const sceneDescription = getFactorySceneDescription(scene);
  const required = specScene?.required ?? (isTalkingHeadScene(scene) || scene.required === true);
  return {
    ...scene,
    order: specScene?.order ?? scene.order,
    timeRange: specScene?.timeRange ?? scene.timeRange,
    durationSeconds: specScene?.durationSeconds ?? scene.durationSeconds,
    title: sceneDescription.title,
    camera: sceneDescription.visual,
    subtitle: spokenText,
    spokenText,
    materialSlot: required ? sceneDescription.uploadLabel : "",
    shootingGuide: required
      ? "真人面对镜头按台词口播，声音保持清晰，背景保持自然现场环境。"
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
    `标题：${readString(script.title, factoryScriptSpec.title)}`,
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
    `结尾引导：${readString(script.cta, factoryScriptSpec.cta)}`,
  ];

  return blocks.filter((line) => line !== null && line !== undefined).join("\n").trim();
}

function getFactorySceneDescription(sceneValue, fallbackIndex = 0) {
  const scene = toRecord(sceneValue);
  const sceneNo = normalizePositiveInteger(scene.order) ?? fallbackIndex + 1;
  const specScene = getFactoryScriptScene(sceneNo);

  return specScene
    ? {
        title: specScene.title,
        visual: specScene.visual,
        uploadLabel: specScene.uploadLabel,
      }
    : {
    title: readString(scene.title, `场景 ${sceneNo}`),
    visual: readString(scene.camera, "按本段台词呈现对应画面内容。"),
    uploadLabel: "",
  };
}

function buildFactoryScriptScenes(sourceScenesValue) {
  const sourceScenes = Array.isArray(sourceScenesValue) ? sourceScenesValue : [];
  const sourceByOrder = new Map(
    sourceScenes
      .map((scene, index) => [normalizePositiveInteger(toRecord(scene).order) ?? index + 1, toRecord(scene)])
      .filter(([sceneNo]) => Number.isInteger(sceneNo)),
  );

  return factoryScriptSpec.scenes.map((specScene) =>
    normalizeFactoryScene({
      ...toRecord(sourceByOrder.get(specScene.order)),
      ...specScene,
      camera: specScene.visual,
      subtitle: specScene.spokenText,
      materialSlot: specScene.required ? specScene.uploadLabel : "",
      shootingGuide: specScene.required
        ? "真人面对镜头按台词口播，声音保持清晰，背景保持自然现场环境。"
        : specScene.visual,
    }),
  );
}

function getFactoryScriptScene(sceneNo) {
  return factoryScriptSpec.scenes.find((scene) => scene.order === sceneNo);
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
