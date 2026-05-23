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
      source.variant.title,
      source.variant.body_text,
      buildVariantScriptText(videoTask.generatedVideoScript),
      JSON.stringify(source.variant.hashtags ?? []),
      source.variant.cta_text,
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
      source.variant.title,
      source.variant.body_text,
      buildVariantScriptText(input.videoTask.generatedVideoScript),
      JSON.stringify(source.variant.hashtags ?? []),
      source.variant.cta_text,
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
  const scenes = Array.isArray(generatedVideoScript.scenes)
    ? generatedVideoScript.scenes.map((scene) => normalizeFactoryScene(scene))
    : [];

  return {
    ...sourceVideoTask,
    generatedVideoScript: {
      ...generatedVideoScript,
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

function buildProductionConfig(sourceConfig) {
  return {
    ...toRecord(sourceConfig),
    bgm: bgmConfig,
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
