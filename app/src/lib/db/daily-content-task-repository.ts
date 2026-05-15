import "server-only";

import { randomUUID } from "node:crypto";

import type {
  DailyArticleContentPackageDto,
  DailyContentTaskDto,
  DailyContentTaskItemDto,
  DailyTaskStatus,
  DailyVideoScriptPackageDto,
  DailyVideoScriptSceneDto,
} from "@/contracts/daily-task";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type DailyContentTaskRow = {
  id: string;
  merchant_id: string;
  user_id: string;
  task_date: string;
  theme: string;
  team_calendar_source: unknown;
  article_task: unknown;
  video_task: unknown;
  knowledge_refs: unknown;
  material_refs: unknown;
  status: DailyTaskStatus;
  created_at: string;
  updated_at: string;
};

const dailyContentTaskSelect = [
  "id",
  "merchant_id",
  "user_id",
  "task_date",
  "theme",
  "team_calendar_source",
  "article_task",
  "video_task",
  "knowledge_refs",
  "material_refs",
  "status",
  "created_at",
  "updated_at",
].join(", ");

const demoDailyTasks = new Map<string, DailyContentTaskDto>();

export async function getDailyContentTask(input: {
  merchantId: string;
  userId: string;
  taskDate: string;
}): Promise<DailyContentTaskDto | null> {
  if (!isSupabaseAdminConfigured()) {
    return demoDailyTasks.get(buildDemoKey(input)) ?? null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("daily_content_tasks")
    .select(dailyContentTaskSelect)
    .eq("merchant_id", input.merchantId)
    .eq("user_id", input.userId)
    .eq("task_date", input.taskDate)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "DAILY_CONTENT_TASK_LOOKUP_FAILED", error.message);
  }

  return data ? mapDailyContentTask(data as unknown as DailyContentTaskRow) : null;
}

export async function upsertDailyContentTask(input: {
  merchantId: string;
  userId: string;
  taskDate: string;
  theme: string;
  teamCalendarSource: Record<string, unknown>;
  articleTask: DailyContentTaskItemDto;
  videoTask: DailyContentTaskItemDto;
  knowledgeRefs?: Array<Record<string, unknown>>;
  materialRefs?: Array<Record<string, unknown>>;
  status?: DailyTaskStatus;
}): Promise<DailyContentTaskDto> {
  if (!isSupabaseAdminConfigured()) {
    const now = new Date().toISOString();
    const existing = demoDailyTasks.get(buildDemoKey(input));
    const task: DailyContentTaskDto = {
      id: existing?.id ?? randomUUID(),
      merchantId: input.merchantId,
      userId: input.userId,
      taskDate: input.taskDate,
      theme: input.theme,
      teamCalendarSource: input.teamCalendarSource,
      articleTask: input.articleTask,
      videoTask: input.videoTask,
      knowledgeRefs: input.knowledgeRefs ?? [],
      materialRefs: input.materialRefs ?? [],
      status: input.status ?? existing?.status ?? "generated",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    demoDailyTasks.set(buildDemoKey(input), task);
    return task;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("daily_content_tasks")
    .upsert(
      {
        merchant_id: input.merchantId,
        user_id: input.userId,
        task_date: input.taskDate,
        theme: input.theme,
        team_calendar_source: input.teamCalendarSource,
        article_task: input.articleTask,
        video_task: input.videoTask,
        knowledge_refs: input.knowledgeRefs ?? [],
        material_refs: input.materialRefs ?? [],
        status: input.status ?? "generated",
      },
      { onConflict: "merchant_id,user_id,task_date" },
    )
    .select(dailyContentTaskSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "DAILY_CONTENT_TASK_UPSERT_FAILED", error?.message ?? "Upsert failed.");
  }

  return mapDailyContentTask(data as unknown as DailyContentTaskRow);
}

export async function getDailyContentTaskById(input: {
  merchantId: string;
  userId: string;
  taskId: string;
}): Promise<DailyContentTaskDto> {
  if (!isSupabaseAdminConfigured()) {
    const task = Array.from(demoDailyTasks.values()).find(
      (item) =>
        item.id === input.taskId &&
        item.merchantId === input.merchantId &&
        item.userId === input.userId,
    );

    if (!task) {
      throw new ApiError(404, "DAILY_CONTENT_TASK_NOT_FOUND", "今日任务不存在或无权访问。");
    }

    return task;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("daily_content_tasks")
    .select(dailyContentTaskSelect)
    .eq("id", input.taskId)
    .eq("merchant_id", input.merchantId)
    .eq("user_id", input.userId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "DAILY_CONTENT_TASK_NOT_FOUND", "今日任务不存在或无权访问。");
  }

  return mapDailyContentTask(data as unknown as DailyContentTaskRow);
}

export async function updateDailyContentTaskGeneratedContent(input: {
  merchantId: string;
  userId: string;
  taskId: string;
  articleTaskPatch?: Partial<DailyContentTaskItemDto>;
  videoTaskPatch?: Partial<DailyContentTaskItemDto>;
  status?: DailyTaskStatus;
}): Promise<DailyContentTaskDto> {
  const current = await getDailyContentTaskById({
    merchantId: input.merchantId,
    userId: input.userId,
    taskId: input.taskId,
  });
  const nextArticleTask = {
    ...current.articleTask,
    ...input.articleTaskPatch,
  };
  const nextVideoTask = {
    ...current.videoTask,
    ...input.videoTaskPatch,
  };

  if (!isSupabaseAdminConfigured()) {
    const updated: DailyContentTaskDto = {
      ...current,
      articleTask: nextArticleTask,
      videoTask: nextVideoTask,
      status: input.status ?? current.status,
      updatedAt: new Date().toISOString(),
    };

    demoDailyTasks.set(
      buildDemoKey({
        merchantId: input.merchantId,
        userId: input.userId,
        taskDate: current.taskDate,
      }),
      updated,
    );

    return updated;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("daily_content_tasks")
    .update({
      article_task: nextArticleTask,
      video_task: nextVideoTask,
      status: input.status ?? current.status,
    })
    .eq("id", input.taskId)
    .eq("merchant_id", input.merchantId)
    .eq("user_id", input.userId)
    .select(dailyContentTaskSelect)
    .single();

  if (error || !data) {
    throw new ApiError(
      500,
      "DAILY_CONTENT_TASK_UPDATE_FAILED",
      error?.message ?? "Update failed.",
    );
  }

  return mapDailyContentTask(data as unknown as DailyContentTaskRow);
}

function mapDailyContentTask(row: DailyContentTaskRow): DailyContentTaskDto {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    userId: row.user_id,
    taskDate: row.task_date,
    theme: row.theme,
    teamCalendarSource: toRecord(row.team_calendar_source),
    articleTask: toTaskItem(row.article_task, "article"),
    videoTask: toTaskItem(row.video_task, "video"),
    knowledgeRefs: toRecordArray(row.knowledge_refs),
    materialRefs: toRecordArray(row.material_refs),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTaskItem(value: unknown, fallbackKind: "article" | "video"): DailyContentTaskItemDto {
  const record = toRecord(value);
  return {
    kind: record.kind === "video" ? "video" : record.kind === "article" ? "article" : fallbackKind,
    title: readString(record.title, fallbackKind === "article" ? "今日图文任务" : "今日视频任务"),
    summary: readString(record.summary, "围绕今日主题生成内容。"),
    strategyTag: readNullableString(record.strategyTag),
    contentGoal: readNullableString(record.contentGoal),
    suggestedPlatform:
      record.suggestedPlatform === "douyin" ? "douyin" : "xiaohongshu",
    materialHints: Array.isArray(record.materialHints)
      ? record.materialHints.filter((item): item is string => typeof item === "string")
      : [],
    generatedArticle: toArticlePackage(record.generatedArticle),
    generatedVideoScript: toVideoScriptPackage(record.generatedVideoScript),
    generationStatus: toGenerationStatus(record.generationStatus),
    generationJobId: readNullableString(record.generationJobId),
    contentDraftId: readNullableString(record.contentDraftId),
    contentVariantId: readNullableString(record.contentVariantId),
  };
}

function toArticlePackage(value: unknown): DailyArticleContentPackageDto | null {
  const record = toRecord(value);
  const title = readNullableString(record.title);
  const body = readNullableString(record.body);

  if (!title || !body) {
    return null;
  }

  return {
    title,
    body,
    hashtags: toStringArray(record.hashtags),
    cta: readString(record.cta, "欢迎私信咨询项目细节。"),
    coverText: readString(record.coverText, title),
    imageAssets: toRecordArray(record.imageAssets).map((item, index) => ({
      id: readString(item.id, `image-${index + 1}`),
      title: readString(item.title, `配图 ${index + 1}`),
      description: readNullableString(item.description),
      url: readNullableString(item.url),
      source: readNullableString(item.source),
    })),
    imageBriefs: toStringArray(record.imageBriefs),
    generatedAt: readString(record.generatedAt, new Date(0).toISOString()),
  };
}

function toVideoScriptPackage(value: unknown): DailyVideoScriptPackageDto | null {
  const record = toRecord(value);
  const title = readNullableString(record.title);
  const storyOutline = readNullableString(record.storyOutline);
  const scenes = toRecordArray(record.scenes)
    .map(toVideoScriptScene)
    .filter((scene): scene is DailyVideoScriptSceneDto => Boolean(scene));

  if (!title || !storyOutline || scenes.length === 0) {
    return null;
  }

  return {
    title,
    hook: readString(record.hook, title),
    storyOutline,
    targetDurationSeconds: readNumber(record.targetDurationSeconds, 45),
    scenes,
    cta: readString(record.cta, "想了解项目，评论区或私信我。"),
    materialChecklist: toStringArray(record.materialChecklist),
    generatedAt: readString(record.generatedAt, new Date(0).toISOString()),
  };
}

function toVideoScriptScene(value: Record<string, unknown>, index: number): DailyVideoScriptSceneDto | null {
  const title = readNullableString(value.title);
  const spokenText = readNullableString(value.spokenText);

  if (!title || !spokenText) {
    return null;
  }

  return {
    id: readString(value.id, `scene-${index + 1}`),
    order: readNumber(value.order, index + 1),
    title,
    durationSeconds: readNumber(value.durationSeconds, 8),
    camera: readString(value.camera, "手机竖屏，人物半身或项目实拍。"),
    spokenText,
    subtitle: readString(value.subtitle, spokenText),
    shootingGuide: readString(value.shootingGuide, "按口播内容拍摄 1 段清晰素材。"),
    materialSlot: readString(value.materialSlot, `镜头 ${index + 1} 素材`),
    required: value.required === false ? false : true,
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

function toGenerationStatus(value: unknown): DailyContentTaskItemDto["generationStatus"] {
  return value === "not_started" ||
    value === "pending" ||
    value === "running" ||
    value === "succeeded" ||
    value === "failed"
    ? value
    : null;
}

function buildDemoKey(input: { merchantId: string; userId: string; taskDate: string }) {
  return `${input.merchantId}:${input.userId}:${input.taskDate}`;
}
