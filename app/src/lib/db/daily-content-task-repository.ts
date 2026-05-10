import "server-only";

import { randomUUID } from "node:crypto";

import type {
  DailyContentTaskDto,
  DailyContentTaskItemDto,
  DailyTaskStatus,
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

function buildDemoKey(input: { merchantId: string; userId: string; taskDate: string }) {
  return `${input.merchantId}:${input.userId}:${input.taskDate}`;
}

