#!/usr/bin/env node

import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const { Client } = pg;

const merchantId = "e7c94a17-cf7d-4eb2-8178-13daa780551a";
const memberUserId = "0b3351a6-778b-4e79-b5f1-6aa18fdb0020";
const factoryTaskIds = [
  "18451440-8ebe-4fe0-bd5f-d3391741fd11",
  "11ea1851-918d-4211-a1fa-02a3add73993",
];
const assignmentMarker = "factory_member_video_assignment_20260522";
const bgmConfig = {
  enabled: true,
  userRequest:
    "Light, steady industrial park promotion background music, low volume under voiceover.",
  volume: 0.22,
};
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
let hasProductionScenesColumn = false;

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
  const outputs = [];

  for (const task of context.tasks) {
    const clone = await ensureMemberDraftClone(task);
    const targetTask = await upsertMemberTask(task, clone);
    outputs.push({
      sourceTaskId: task.id,
      targetTaskId: targetTask.id,
      taskDate: targetTask.task_date,
      title: targetTask.video_task?.title ?? task.video_task?.title,
      draftId: clone.draftId,
      variantId: clone.variantId,
      requiredScenes: clone.videoTask.generatedVideoScript.scenes
        .filter((scene) => scene.required)
        .map((scene) => scene.order),
      bgm: clone.videoTask.recommendedProductionConfig.bgm,
    });
  }

  if (apply) {
    await db.query("commit");
  } else {
    await db.query("rollback");
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "applied" : "dry-run",
        merchantId,
        memberUserId,
        outputs,
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
  const schema = await db.query(
    `
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'content_variants'
      and column_name = 'production_scenes'
    limit 1
    `,
  );
  hasProductionScenesColumn = Boolean(schema.rows[0]);

  const member = await db.query(
    `
    select au.id, au.email, au.display_name, mtm.status
    from public.app_users au
    join public.merchant_team_members mtm on mtm.user_id = au.id
    where au.id = $1
      and mtm.merchant_id = $2
      and mtm.status = 'active'
    limit 1
    `,
    [memberUserId, merchantId],
  );

  if (!member.rows[0]) {
    throw new Error("Target member zhiluan1 is not active in factory team.");
  }

  const tasks = await db.query(
    `
    select *
    from public.daily_content_tasks
    where merchant_id = $1
      and id = any($2::uuid[])
    order by task_date asc
    `,
    [merchantId, factoryTaskIds],
  );

  if (tasks.rows.length !== factoryTaskIds.length) {
    throw new Error(`Expected ${factoryTaskIds.length} source tasks, got ${tasks.rows.length}.`);
  }

  return { member: member.rows[0], tasks: tasks.rows };
}

async function ensureMemberDraftClone(task) {
  const videoTask = buildMemberVideoTask(task.video_task);
  const sourceDraftId = videoTask.contentDraftId;
  const sourceVariantId = videoTask.contentVariantId;

  if (!sourceDraftId || !sourceVariantId) {
    throw new Error(`Task ${task.id} is missing content draft or variant id.`);
  }

  const existing = await db.query(
    `
    select cd.id as draft_id, cv.id as variant_id
    from public.content_drafts cd
    join public.content_variants cv on cv.draft_id = cd.id
    where cd.merchant_id = $1
      and cd.created_by_user_id = $2
      and cd.input_snapshot @> $3::jsonb
      and cv.variant_type = 'video_script'
    order by cd.updated_at desc
    limit 1
    `,
    [
      merchantId,
      memberUserId,
      JSON.stringify({
        factoryMemberAssignment: {
          marker: assignmentMarker,
          sourceDraftId,
        },
      }),
    ],
  );

  if (existing.rows[0]) {
    const draftId = existing.rows[0].draft_id;
    const variantId = existing.rows[0].variant_id;
    await refreshMemberDraftClone({ task, videoTask, draftId, variantId, sourceDraftId, sourceVariantId });
    return { draftId, variantId, videoTask: { ...videoTask, contentDraftId: draftId, contentVariantId: variantId } };
  }

  const source = await loadSourceDraftAndVariant(sourceDraftId, sourceVariantId);
  const draftResult = await db.query(
    `
    insert into public.content_drafts (
      source_item_id,
      merchant_id,
      audience_profile_id,
      created_by_user_id,
      working_title,
      rewrite_goal,
      input_snapshot,
      comment_insights,
      status
    ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
    returning id
    `,
    [
      source.draft.source_item_id,
      merchantId,
      source.draft.audience_profile_id,
      memberUserId,
      source.draft.working_title,
      source.draft.rewrite_goal,
      JSON.stringify(buildCloneInputSnapshot(source.draft.input_snapshot, task, sourceDraftId, sourceVariantId)),
      JSON.stringify(source.draft.comment_insights ?? {}),
      source.draft.status,
    ],
  );
  const draftId = draftResult.rows[0].id;

  const variantResult = await db.query(
    `
    insert into public.content_variants (
      draft_id,
      platform,
      variant_type,
      version_no,
      title,
      body_text,
      script_text,
      hashtags,
      cta_text,
      generation_mode,
      review_status
    ) values ($1, $2, $3, 1, $4, $5, $6, $7::jsonb, $8, $9, $10)
    returning id
    `,
    [
      draftId,
      source.variant.platform,
      source.variant.variant_type,
      factoryScriptSpec.title,
      source.variant.body_text,
      buildVariantScriptText(videoTask.generatedVideoScript),
      JSON.stringify(source.variant.hashtags ?? []),
      factoryScriptSpec.cta,
      source.variant.generation_mode,
      source.variant.review_status,
    ],
  );
  const variantId = variantResult.rows[0].id;

  await updateVariantProductionScenes(variantId, draftId, videoTask);

  await db.query(
    `update public.content_drafts set selected_variant_id = $2, updated_at = timezone('utc', now()) where id = $1`,
    [draftId, variantId],
  );

  return { draftId, variantId, videoTask: { ...videoTask, contentDraftId: draftId, contentVariantId: variantId } };
}

async function refreshMemberDraftClone(input) {
  const source = await loadSourceDraftAndVariant(input.sourceDraftId, input.sourceVariantId);
  await db.query(
    `
    update public.content_drafts
    set source_item_id = $3,
        working_title = $4,
        rewrite_goal = $5,
        input_snapshot = $6::jsonb,
        comment_insights = $7::jsonb,
        status = $8,
        selected_variant_id = $9,
        updated_at = timezone('utc', now())
    where id = $1
      and merchant_id = $2
    `,
    [
      input.draftId,
      merchantId,
      source.draft.source_item_id,
      source.draft.working_title,
      source.draft.rewrite_goal,
      JSON.stringify(buildCloneInputSnapshot(source.draft.input_snapshot, input.task, input.sourceDraftId, input.sourceVariantId)),
      JSON.stringify(source.draft.comment_insights ?? {}),
      source.draft.status,
      input.variantId,
    ],
  );

  await db.query(
    `
    update public.content_variants
    set title = $3,
        body_text = $4,
        script_text = $5,
        hashtags = $6::jsonb,
        cta_text = $7,
        generation_mode = $8,
        review_status = $9,
        updated_at = timezone('utc', now())
    where id = $1
      and draft_id = $2
    `,
    [
      input.variantId,
      input.draftId,
      factoryScriptSpec.title,
      source.variant.body_text,
      buildVariantScriptText(input.videoTask.generatedVideoScript),
      JSON.stringify(source.variant.hashtags ?? []),
      factoryScriptSpec.cta,
      source.variant.generation_mode,
      source.variant.review_status,
    ],
  );

  await updateVariantProductionScenes(input.variantId, input.draftId, input.videoTask);
}

async function loadSourceDraftAndVariant(draftId, variantId) {
  const draft = await db.query(`select * from public.content_drafts where id = $1 and merchant_id = $2`, [
    draftId,
    merchantId,
  ]);
  const variant = await db.query(`select * from public.content_variants where id = $1 and draft_id = $2`, [
    variantId,
    draftId,
  ]);

  if (!draft.rows[0] || !variant.rows[0]) {
    throw new Error(`Source draft or variant not found: ${draftId} / ${variantId}`);
  }

  return { draft: draft.rows[0], variant: variant.rows[0] };
}

async function upsertMemberTask(task, clone) {
  const existing = await db.query(
    `
    select *
    from public.daily_content_tasks
    where merchant_id = $1
      and user_id = $2
      and task_date = $3::date
    limit 1
    `,
    [merchantId, memberUserId, task.task_date],
  );
  const videoTask = {
    ...clone.videoTask,
    contentDraftId: clone.draftId,
    contentVariantId: clone.variantId,
  };
  const teamCalendarSource = {
    ...(toRecord(task.team_calendar_source)),
    source: "manual_factory_script",
    assignedToMemberUserId: memberUserId,
    assignedFromTaskId: task.id,
    assignmentMarker,
    recommendedProductionConfig: videoTask.recommendedProductionConfig,
    scriptDraftId: clone.draftId,
    scriptVariantId: clone.variantId,
    updatedAt: new Date().toISOString(),
  };
  const materialRefs = buildMaterialRefs(task.material_refs);
  const knowledgeRefs = Array.isArray(task.knowledge_refs) ? task.knowledge_refs : [];
  const articleTask = existing.rows[0]?.article_task ?? task.article_task;

  if (existing.rows[0]) {
    const updated = await db.query(
      `
      update public.daily_content_tasks
      set theme = $4,
          team_calendar_source = $5::jsonb,
          article_task = $6::jsonb,
          video_task = $7::jsonb,
          knowledge_refs = $8::jsonb,
          material_refs = $9::jsonb,
          status = 'video_script_created',
          updated_at = timezone('utc', now())
      where id = $1
        and merchant_id = $2
        and user_id = $3
      returning *
      `,
      [
        existing.rows[0].id,
        merchantId,
        memberUserId,
        task.theme,
        JSON.stringify(teamCalendarSource),
        JSON.stringify(articleTask),
        JSON.stringify(videoTask),
        JSON.stringify(knowledgeRefs),
        JSON.stringify(materialRefs),
      ],
    );
    return updated.rows[0];
  }

  const inserted = await db.query(
    `
    insert into public.daily_content_tasks (
      merchant_id,
      user_id,
      task_date,
      theme,
      team_calendar_source,
      article_task,
      video_task,
      knowledge_refs,
      material_refs,
      status
    ) values ($1, $2, $3::date, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, 'video_script_created')
    returning *
    `,
    [
      merchantId,
      memberUserId,
      task.task_date,
      task.theme,
      JSON.stringify(teamCalendarSource),
      JSON.stringify(articleTask),
      JSON.stringify(videoTask),
      JSON.stringify(knowledgeRefs),
      JSON.stringify(materialRefs),
    ],
  );
  return inserted.rows[0];
}

function buildMemberVideoTask(sourceVideoTask) {
  const generatedVideoScript = toRecord(sourceVideoTask.generatedVideoScript);
  const scenes = buildFactoryScriptScenes(generatedVideoScript.scenes);

  return {
    ...sourceVideoTask,
    title: factoryScriptSpec.title,
    generatedVideoScript: {
      ...generatedVideoScript,
      title: factoryScriptSpec.title,
      cta: factoryScriptSpec.cta,
      targetDurationSeconds: factoryScriptSpec.targetDurationSeconds,
      scenes,
    },
    recommendedProductionConfig: buildProductionConfig(sourceVideoTask.recommendedProductionConfig),
    memberUploadPolicy: "talking_head_required_only",
  };
}

async function updateVariantProductionScenes(variantId, draftId, videoTask) {
  if (!hasProductionScenesColumn) {
    return;
  }

  await db.query(
    `
    update public.content_variants
    set production_scenes = $3::jsonb,
        updated_at = timezone('utc', now())
    where id = $1
      and draft_id = $2
    `,
    [variantId, draftId, JSON.stringify(buildProductionScenes(videoTask))],
  );
}

function buildProductionScenes(videoTask) {
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

function buildProductionConfig(sourceConfig) {
  const config = toRecord(sourceConfig);
  const render = toRecord(config.render);
  const renderWithoutDurationLimit = { ...render };
  delete renderWithoutDurationLimit.maxDurationSeconds;
  delete renderWithoutDurationLimit.max_duration_seconds;

  return {
    ...config,
    bgm: bgmConfig,
    render: {
      ...renderWithoutDurationLimit,
      aspectRatio: readString(render.aspectRatio, "9:16"),
      includeOriginalAudio: render.includeOriginalAudio === true,
    },
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

function formatTimeRange(startSeconds, endSeconds) {
  return `${formatTimestamp(startSeconds)}-${formatTimestamp(endSeconds)}`;
}

function formatTimestamp(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readString(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function buildMaterialRefs(sourceRefs) {
  const refs = Array.isArray(sourceRefs) ? [...sourceRefs] : [];
  if (
    !refs.some(
      (ref) =>
        ref &&
        typeof ref === "object" &&
        ref.source === "material_library" &&
        ref.retrievalTarget === "video_edit_asset",
    )
  ) {
    refs.push({
      source: "material_library",
      retrievalTarget: "video_edit_asset",
      summary: "Factory project video library materials are used for non-talking-head scenes.",
    });
  }
  return refs;
}

function buildCloneInputSnapshot(sourceSnapshot, task, sourceDraftId, sourceVariantId) {
  return {
    ...toRecord(sourceSnapshot),
    factoryMemberAssignment: {
      marker: assignmentMarker,
      sourceTaskId: task.id,
      sourceDraftId,
      sourceVariantId,
      targetMerchantId: merchantId,
      targetUserId: memberUserId,
    },
    recommendedProductionConfig: buildProductionConfig(task.video_task?.recommendedProductionConfig),
  };
}

function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
