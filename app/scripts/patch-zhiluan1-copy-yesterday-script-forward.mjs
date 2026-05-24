#!/usr/bin/env node

import pg from "pg";

import { loadEnvFileFromArgs } from "./lib/env-file.mjs";

const { Client } = pg;

const target = {
  merchantId: "e7c94a17-cf7d-4eb2-8178-13daa780551a",
  memberUserId: "0b3351a6-778b-4e79-b5f1-6aa18fdb0020",
  defaultSourceDate: "2026-05-23",
  defaultStartDate: "2026-05-24",
  defaultEndDate: "2026-05-31",
};

const auditVersion = "zhiluan1-copy-yesterday-script-forward-20260524";

loadEnvFileFromArgs();

const apply = process.argv.includes("--apply");
const forceReplaceLinked = process.argv.includes("--force-replace-linked");
const sourceDate = readArg("--source-date", target.defaultSourceDate);
const startDate = readArg("--start-date", target.defaultStartDate);
const endDate = readArg("--end-date", target.defaultEndDate);
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
  validateSourceContext(context);

  const outputs = [];
  for (const targetTask of context.targetTasks) {
    outputs.push(await copyScriptToTask(context, targetTask));
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
        auditVersion,
        source: summarizeSource(context),
        targetRange: { startDate, endDate },
        updatedTaskCount: outputs.length,
        outputs,
        consequences: {
          clonedContentDraftsAndVariants: true,
          copiedVideoTaskStructure: true,
          copiedProductionScenes: true,
          copiedRecommendedProductionConfig: true,
          copiedKnowledgeAndMaterialRefs: true,
          copiedUploadedOrRenderedAssets: false,
          copiedVideoEditJobs: false,
          forceReplaceLinked,
          targetTasksStatus: "video_script_created",
        },
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
  const member = await db.query(
    `
    select mtm.id, mtm.display_name, mtm.status, au.email
    from public.merchant_team_members mtm
    left join public.app_users au on au.id = mtm.user_id
    where mtm.merchant_id = $1
      and mtm.user_id = $2
      and mtm.status = 'active'
    limit 1
    `,
    [target.merchantId, target.memberUserId],
  );

  if (!member.rows[0]) {
    throw new Error("Target member zhiluan1 is not active in the merchant team.");
  }

  const sourceTask = await db.query(
    `
    select *
    from public.daily_content_tasks
    where merchant_id = $1
      and user_id = $2
      and task_date = $3::date
    limit 1
    `,
    [target.merchantId, target.memberUserId, sourceDate],
  );

  if (!sourceTask.rows[0]) {
    throw new Error(`Source daily task was not found for ${sourceDate}.`);
  }

  const sourceVideoTask = toRecord(sourceTask.rows[0].video_task);
  const sourceDraftId = readString(sourceVideoTask.contentDraftId, "");
  const sourceVariantId = readString(sourceVideoTask.contentVariantId, "");
  if (!sourceDraftId || !sourceVariantId) {
    throw new Error("Source video task is missing contentDraftId or contentVariantId.");
  }

  const sourceDraft = await db.query(
    `select * from public.content_drafts where id = $1 and merchant_id = $2 limit 1`,
    [sourceDraftId, target.merchantId],
  );
  if (!sourceDraft.rows[0]) {
    throw new Error(`Source content draft was not found: ${sourceDraftId}.`);
  }

  const sourceVariant = await db.query(
    `
    select *
    from public.content_variants
    where id = $1
      and draft_id = $2
      and variant_type = 'video_script'
    limit 1
    `,
    [sourceVariantId, sourceDraftId],
  );
  if (!sourceVariant.rows[0]) {
    throw new Error(`Source video script variant was not found: ${sourceVariantId}.`);
  }

  const targetTasks = await db.query(
    `
    select *
    from public.daily_content_tasks
    where merchant_id = $1
      and user_id = $2
      and task_date between $3::date and $4::date
    order by task_date asc
    `,
    [target.merchantId, target.memberUserId, startDate, endDate],
  );

  if (targetTasks.rows.length === 0) {
    throw new Error(`No target daily tasks found from ${startDate} to ${endDate}.`);
  }
  assertContinuousTargetTasks(targetTasks.rows);

  return {
    member: member.rows[0],
    sourceTask: sourceTask.rows[0],
    sourceDraft: sourceDraft.rows[0],
    sourceVariant: sourceVariant.rows[0],
    targetTasks: targetTasks.rows,
  };
}

function validateSourceContext(context) {
  const sourceVideoTask = toRecord(context.sourceTask.video_task);
  const generatedVideoScript = toRecord(sourceVideoTask.generatedVideoScript);
  const generatedScenes = Array.isArray(generatedVideoScript.scenes)
    ? generatedVideoScript.scenes
    : [];
  const productionScenes = Array.isArray(context.sourceVariant.production_scenes)
    ? context.sourceVariant.production_scenes
    : [];

  if (sourceVideoTask.generationStatus !== "succeeded") {
    throw new Error(`Source video task generationStatus must be succeeded, got ${sourceVideoTask.generationStatus}.`);
  }
  if (!generatedScenes.length) {
    throw new Error("Source generatedVideoScript has no scenes.");
  }
  if (!productionScenes.length) {
    throw new Error("Source content variant has no production_scenes.");
  }
  if (generatedScenes.length !== productionScenes.length) {
    throw new Error(
      `Source scene count mismatch: generated=${generatedScenes.length}, production=${productionScenes.length}.`,
    );
  }
  if (!sourceVideoTask.recommendedProductionConfig) {
    throw new Error("Source video task is missing recommendedProductionConfig.");
  }
  if (!sourceVideoTask.memberUploadPolicy) {
    throw new Error("Source video task is missing memberUploadPolicy.");
  }
  if (!context.sourceVariant.script_text) {
    throw new Error("Source video script variant is missing script_text.");
  }
}

async function copyScriptToTask(context, targetTask) {
  const taskDate = readDateString(targetTask.task_date);
  if (taskDate === sourceDate) {
    throw new Error("Target range must not include the source date.");
  }

  const existingLink = await loadExistingLinkedClone(targetTask);
  assertSafeToReplace(targetTask, existingLink);
  const copiedAt = new Date().toISOString();
  const clone = existingLink
    ? await refreshClone(context, targetTask, existingLink, copiedAt)
    : await createClone(context, targetTask, copiedAt);
  const videoTask = buildCopiedVideoTask(context, targetTask, clone, copiedAt);
  const teamCalendarSource = buildCopiedTeamCalendarSource(context, targetTask, clone, copiedAt);

  const updatedTask = await db.query(
    `
    update public.daily_content_tasks
    set theme = $4,
        team_calendar_source = $5::jsonb,
        video_task = $6::jsonb,
        knowledge_refs = $7::jsonb,
        material_refs = $8::jsonb,
        status = 'video_script_created',
        updated_at = timezone('utc', now())
    where id = $1
      and merchant_id = $2
      and user_id = $3
    returning *
    `,
    [
      targetTask.id,
      target.merchantId,
      target.memberUserId,
      context.sourceTask.theme,
      JSON.stringify(teamCalendarSource),
      JSON.stringify(videoTask),
      JSON.stringify(normalizeArray(context.sourceTask.knowledge_refs)),
      JSON.stringify(normalizeArray(context.sourceTask.material_refs)),
    ],
  );

  return summarizeCopiedTask({
    targetTask: updatedTask.rows[0],
    sourceTask: context.sourceTask,
    sourceVariant: context.sourceVariant,
    clone,
    videoTask,
    teamCalendarSource,
    reusedExistingClone: Boolean(existingLink),
  });
}

function assertContinuousTargetTasks(tasks) {
  const foundDates = new Set(tasks.map((task) => readDateString(task.task_date)).filter(Boolean));
  const missingDates = listDateRange(startDate, endDate).filter((date) => !foundDates.has(date));
  if (missingDates.length) {
    throw new Error(`Target range has missing daily tasks: ${missingDates.join(", ")}.`);
  }
}

function assertSafeToReplace(targetTask, existingLink) {
  if (existingLink || forceReplaceLinked) {
    return;
  }
  const videoTask = toRecord(targetTask.video_task);
  const existingDraftId = readString(videoTask.contentDraftId, "");
  const existingVariantId = readString(videoTask.contentVariantId, "");
  if (existingDraftId || existingVariantId) {
    throw new Error(
      `Target task ${targetTask.id} (${readDateString(
        targetTask.task_date,
      )}) already points to a different draft/variant. Re-run with --force-replace-linked only after review.`,
    );
  }
}

async function loadExistingLinkedClone(targetTask) {
  const videoTask = toRecord(targetTask.video_task);
  const draftId = readString(videoTask.contentDraftId, "");
  const variantId = readString(videoTask.contentVariantId, "");
  if (!draftId || !variantId) {
    return null;
  }

  const existing = await db.query(
    `
    select cd.id as draft_id, cv.id as variant_id
    from public.content_drafts cd
    join public.content_variants cv on cv.id = $2 and cv.draft_id = cd.id
    where cd.id = $1
      and cd.merchant_id = $3
      and cd.created_by_user_id = $4
      and cd.input_snapshot @> $5::jsonb
    limit 1
    `,
    [
      draftId,
      variantId,
      target.merchantId,
      target.memberUserId,
      JSON.stringify({
        scriptCopyProvenance: {
          auditVersion,
          sourceTaskDate: sourceDate,
          targetDailyTaskId: targetTask.id,
        },
      }),
    ],
  );

  if (!existing.rows[0]) {
    return null;
  }

  return {
    draftId: existing.rows[0].draft_id,
    variantId: existing.rows[0].variant_id,
  };
}

async function createClone(context, targetTask, copiedAt) {
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
      context.sourceDraft.source_item_id,
      target.merchantId,
      context.sourceDraft.audience_profile_id,
      target.memberUserId,
      context.sourceDraft.working_title,
      context.sourceDraft.rewrite_goal,
      JSON.stringify(buildCopiedInputSnapshot(context, targetTask, null, null, copiedAt)),
      JSON.stringify(toRecord(context.sourceDraft.comment_insights)),
      context.sourceDraft.status,
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
      review_status,
      production_scenes
    ) values ($1, $2, $3, 1, $4, $5, $6, $7::jsonb, $8, $9, $10, $11::jsonb)
    returning id
    `,
    [
      draftId,
      context.sourceVariant.platform,
      context.sourceVariant.variant_type,
      context.sourceVariant.title,
      context.sourceVariant.body_text,
      context.sourceVariant.script_text,
      JSON.stringify(normalizeArray(context.sourceVariant.hashtags)),
      context.sourceVariant.cta_text,
      context.sourceVariant.generation_mode,
      context.sourceVariant.review_status,
      JSON.stringify(normalizeArray(context.sourceVariant.production_scenes)),
    ],
  );
  const variantId = variantResult.rows[0].id;

  await db.query(
    `
    update public.content_drafts
    set selected_variant_id = $2,
        input_snapshot = $3::jsonb,
        updated_at = timezone('utc', now())
    where id = $1
    `,
    [draftId, variantId, JSON.stringify(buildCopiedInputSnapshot(context, targetTask, draftId, variantId, copiedAt))],
  );

  return { draftId, variantId };
}

async function refreshClone(context, targetTask, clone, copiedAt) {
  await db.query(
    `
    update public.content_drafts
    set source_item_id = $3,
        audience_profile_id = $4,
        working_title = $5,
        rewrite_goal = $6,
        input_snapshot = $7::jsonb,
        comment_insights = $8::jsonb,
        status = $9,
        selected_variant_id = $10,
        updated_at = timezone('utc', now())
    where id = $1
      and merchant_id = $2
    `,
    [
      clone.draftId,
      target.merchantId,
      context.sourceDraft.source_item_id,
      context.sourceDraft.audience_profile_id,
      context.sourceDraft.working_title,
      context.sourceDraft.rewrite_goal,
      JSON.stringify(buildCopiedInputSnapshot(context, targetTask, clone.draftId, clone.variantId, copiedAt)),
      JSON.stringify(toRecord(context.sourceDraft.comment_insights)),
      context.sourceDraft.status,
      clone.variantId,
    ],
  );

  await db.query(
    `
    update public.content_variants
    set platform = $3,
        variant_type = $4,
        title = $5,
        body_text = $6,
        script_text = $7,
        hashtags = $8::jsonb,
        cta_text = $9,
        generation_mode = $10,
        review_status = $11,
        production_scenes = $12::jsonb,
        updated_at = timezone('utc', now())
    where id = $1
      and draft_id = $2
    `,
    [
      clone.variantId,
      clone.draftId,
      context.sourceVariant.platform,
      context.sourceVariant.variant_type,
      context.sourceVariant.title,
      context.sourceVariant.body_text,
      context.sourceVariant.script_text,
      JSON.stringify(normalizeArray(context.sourceVariant.hashtags)),
      context.sourceVariant.cta_text,
      context.sourceVariant.generation_mode,
      context.sourceVariant.review_status,
      JSON.stringify(normalizeArray(context.sourceVariant.production_scenes)),
    ],
  );

  return clone;
}

function buildCopiedVideoTask(context, targetTask, clone, copiedAt) {
  const sourceVideoTask = toRecord(context.sourceTask.video_task);
  const existingVideoTask = toRecord(targetTask.video_task);
  return {
    ...sourceVideoTask,
    contentDraftId: clone.draftId,
    contentVariantId: clone.variantId,
    scriptCopyProvenance: buildScriptCopyProvenance(context, targetTask, clone, copiedAt, {
      previousVideoTaskTitle: existingVideoTask.title ?? null,
      previousContentDraftId: existingVideoTask.contentDraftId ?? null,
      previousContentVariantId: existingVideoTask.contentVariantId ?? null,
    }),
  };
}

function buildCopiedTeamCalendarSource(context, targetTask, clone, copiedAt) {
  const source = toRecord(context.sourceTask.team_calendar_source);
  const previous = toRecord(targetTask.team_calendar_source);
  return {
    ...source,
    source: "manual_factory_script",
    assignedToMemberUserId: target.memberUserId,
    assignmentMarker: readString(source.assignmentMarker, "factory_member_video_assignment_20260522"),
    scriptDraftId: clone.draftId,
    scriptVariantId: clone.variantId,
    copiedFromTaskDate: sourceDate,
    copiedFromTaskId: context.sourceTask.id,
    copiedFromDraftId: context.sourceDraft.id,
    copiedFromVariantId: context.sourceVariant.id,
    manualRestoreProvenance: buildForwardManualRestoreProvenance(
      toRecord(source.manualRestoreProvenance),
      context,
      targetTask,
      clone,
    ),
    scriptCopyProvenance: buildScriptCopyProvenance(context, targetTask, clone, copiedAt, {
      previousTeamCalendarSource: {
        source: previous.source ?? null,
        scriptDraftId: previous.scriptDraftId ?? null,
        scriptVariantId: previous.scriptVariantId ?? null,
      },
    }),
    updatedAt: copiedAt,
  };
}

function buildCopiedInputSnapshot(context, targetTask, draftId, variantId, copiedAt) {
  const sourceSnapshot = toRecord(context.sourceDraft.input_snapshot);
  return {
    ...sourceSnapshot,
    dailyTaskId: targetTask.id,
    taskDate: readDateString(targetTask.task_date),
    scriptCopyProvenance: buildScriptCopyProvenance(context, targetTask, { draftId, variantId }, copiedAt),
    factoryMemberAssignment: {
      ...toRecord(sourceSnapshot.factoryMemberAssignment),
      targetMerchantId: target.merchantId,
      targetUserId: target.memberUserId,
    },
    manualRestoreProvenance: buildForwardManualRestoreProvenance(
      toRecord(sourceSnapshot.manualRestoreProvenance),
      context,
      targetTask,
      { draftId, variantId },
    ),
    recommendedProductionConfig: toRecord(context.sourceTask.video_task).recommendedProductionConfig ?? null,
  };
}

function buildForwardManualRestoreProvenance(sourceManualRestoreProvenance, context, targetTask, clone) {
  return {
    source: "manual_factory_script_forward_copy",
    sourceIsDifyWorkflowRun: false,
    sourceManualRestoreProvenance,
    copiedFromTaskDate: sourceDate,
    copiedFromDailyTaskId: context.sourceTask.id,
    copiedFromDraftId: context.sourceDraft.id,
    copiedFromVariantId: context.sourceVariant.id,
    copiedForTaskDate: readDateString(targetTask.task_date),
    copiedForDailyTaskId: targetTask.id,
    copiedDraftId: clone.draftId ?? null,
    copiedVariantId: clone.variantId ?? null,
  };
}

function buildScriptCopyProvenance(context, targetTask, clone, copiedAt, extra = {}) {
  return {
    auditVersion,
    copiedAt,
    sourceTaskDate: sourceDate,
    sourceDailyTaskId: context.sourceTask.id,
    sourceDraftId: context.sourceDraft.id,
    sourceVariantId: context.sourceVariant.id,
    targetTaskDate: readDateString(targetTask.task_date),
    targetDailyTaskId: targetTask.id,
    targetDraftId: clone.draftId ?? null,
    targetVariantId: clone.variantId ?? null,
    copiedBy: "codex_release_script",
    note: "Copied the approved zhiluan1 factory video script structure to this calendar date without copying rendered result assets or video_edit_jobs.",
    ...extra,
  };
}

function summarizeSource(context) {
  const videoTask = toRecord(context.sourceTask.video_task);
  const generatedVideoScript = toRecord(videoTask.generatedVideoScript);
  const generatedScenes = Array.isArray(generatedVideoScript.scenes)
    ? generatedVideoScript.scenes
    : [];
  const productionScenes = normalizeArray(context.sourceVariant.production_scenes);
  return {
    taskDate: sourceDate,
    dailyTaskId: context.sourceTask.id,
    draftId: context.sourceDraft.id,
    variantId: context.sourceVariant.id,
    title: context.sourceVariant.title ?? videoTask.title ?? generatedVideoScript.title ?? null,
    generatedSceneCount: generatedScenes.length,
    productionSceneCount: productionScenes.length,
    requiredSceneOrders: generatedScenes
      .filter((scene) => toRecord(scene).required === true)
      .map((scene) => toRecord(scene).order),
    memberUploadPolicy: videoTask.memberUploadPolicy ?? null,
    recommendedProductionConfigKeys: Object.keys(toRecord(videoTask.recommendedProductionConfig)),
    scriptTextChars: String(context.sourceVariant.script_text ?? "").length,
  };
}

function summarizeCopiedTask(input) {
  const generatedVideoScript = toRecord(input.videoTask.generatedVideoScript);
  const generatedScenes = Array.isArray(generatedVideoScript.scenes)
    ? generatedVideoScript.scenes
    : [];
  const sourceProductionSceneCount = normalizeArray(input.sourceVariant?.production_scenes).length;
  return {
    taskDate: readDateString(input.targetTask.task_date),
    taskId: input.targetTask.id,
    reusedExistingClone: input.reusedExistingClone,
    title: input.videoTask.title ?? generatedVideoScript.title ?? null,
    status: input.targetTask.status,
    theme: input.targetTask.theme,
    contentDraftId: input.clone.draftId,
    contentVariantId: input.clone.variantId,
    generatedSceneCount: generatedScenes.length,
    productionSceneCount: sourceProductionSceneCount,
    targetDurationSeconds: generatedVideoScript.targetDurationSeconds ?? null,
    memberUploadPolicy: input.videoTask.memberUploadPolicy ?? null,
    requiredSceneOrders: generatedScenes
      .filter((scene) => toRecord(scene).required === true)
      .map((scene) => toRecord(scene).order),
    recommendedProductionConfig: input.videoTask.recommendedProductionConfig ?? null,
    copiedFromTaskDate: input.teamCalendarSource.copiedFromTaskDate,
    copiedFromTaskId: input.teamCalendarSource.copiedFromTaskId,
  };
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function readString(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readDateString(value) {
  if (typeof value === "string" && value.trim()) {
    return value.slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return "";
}

function listDateRange(start, end) {
  const startValue = Date.parse(`${start}T00:00:00Z`);
  const endValue = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue) || startValue > endValue) {
    throw new Error(`Invalid date range: ${start} to ${end}.`);
  }
  const dates = [];
  for (let cursor = startValue; cursor <= endValue; cursor += 24 * 60 * 60 * 1000) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return dates;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
