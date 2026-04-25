import "server-only";

import { randomUUID } from "node:crypto";

import type {
  ConsultationEventDto,
  ConsultationMessageDto,
  ConsultationSessionDetailDto,
  ConsultationSessionSummaryDto,
  ConsultationToolCardDto,
  StrategySnapshotDto,
} from "@/contracts/consultation";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type ConsultationSessionRow = {
  id: string;
  merchant_id: string;
  title: string | null;
  status: ConsultationSessionSummaryDto["status"];
  current_stage: string | null;
  strategy_snapshot: unknown;
  summary_text: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

type ConsultationMessageRow = {
  id: string;
  session_id: string;
  role: ConsultationMessageDto["role"];
  content: string;
  stage_label: string | null;
  tool_cards: unknown;
  visible_summary: unknown;
  created_at: string;
};

type ConsultationEventRow = {
  id: string;
  session_id: string;
  event_type: string;
  stage_label: string | null;
  payload: unknown;
  created_at: string;
};

const demoConsultationSessions = new Map<string, ConsultationSessionSummaryDto>();
const demoConsultationMessages = new Map<string, ConsultationMessageDto[]>();
const demoConsultationEvents = new Map<string, ConsultationEventDto[]>();

export async function listConsultationSessions(
  merchantId: string,
): Promise<ConsultationSessionSummaryDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return Array.from(demoConsultationSessions.values())
      .filter((session) => session.merchantId === merchantId)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
      .map((session) => ({
        ...session,
        latestMessagePreview:
          demoConsultationMessages.get(session.id)?.at(-1)?.content ??
          session.latestMessagePreview ??
          null,
      }));
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("consultation_sessions")
    .select(consultationSessionSelect)
    .eq("merchant_id", merchantId)
    .order("last_message_at", { ascending: false });

  if (error) {
    throw new ApiError(500, "CONSULTATION_SESSIONS_LIST_FAILED", error.message);
  }

  const sessions = ((data ?? []) as unknown as ConsultationSessionRow[]).map(
    mapConsultationSessionSummary,
  );
  const previews = await listLatestMessagePreviewBySessionIds(sessions.map((session) => session.id));

  return sessions.map((session) => ({
    ...session,
    latestMessagePreview: previews.get(session.id) ?? null,
  }));
}

export async function createConsultationSession(input: {
  merchantId: string;
  title?: string | null;
  status?: ConsultationSessionSummaryDto["status"];
  currentStage?: string | null;
  strategySnapshot?: StrategySnapshotDto;
  summaryText?: string | null;
}): Promise<ConsultationSessionSummaryDto> {
  if (!isSupabaseAdminConfigured()) {
    const now = new Date().toISOString();
    const session: ConsultationSessionSummaryDto = {
      id: randomUUID(),
      merchantId: input.merchantId,
      title: input.title ?? null,
      status: input.status ?? "active",
      currentStage: input.currentStage ?? null,
      strategySnapshot: input.strategySnapshot ?? emptyStrategySnapshot,
      summaryText: input.summaryText ?? null,
      latestMessagePreview: null,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    };

    demoConsultationSessions.set(session.id, session);
    demoConsultationMessages.set(session.id, []);
    demoConsultationEvents.set(session.id, []);

    return session;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("consultation_sessions")
    .insert({
      merchant_id: input.merchantId,
      title: input.title ?? null,
      status: input.status ?? "active",
      current_stage: input.currentStage ?? null,
      strategy_snapshot: input.strategySnapshot ?? emptyStrategySnapshot,
      summary_text: input.summaryText ?? null,
    })
    .select(consultationSessionSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "CONSULTATION_SESSION_CREATE_FAILED", error?.message ?? "Create failed.");
  }

  return mapConsultationSessionSummary(data as unknown as ConsultationSessionRow);
}

export async function getConsultationSessionDetail(input: {
  merchantId: string;
  sessionId: string;
}): Promise<ConsultationSessionDetailDto> {
  if (!isSupabaseAdminConfigured()) {
    const session = demoConsultationSessions.get(input.sessionId);

    if (!session || session.merchantId !== input.merchantId) {
      throw new ApiError(404, "CONSULTATION_SESSION_NOT_FOUND", "Consultation session not found.");
    }

    const messages = demoConsultationMessages.get(input.sessionId) ?? [];
    return {
      ...session,
      latestMessagePreview: messages.at(-1)?.content ?? null,
      messages,
      events: demoConsultationEvents.get(input.sessionId) ?? [],
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("consultation_sessions")
    .select(consultationSessionSelect)
    .eq("id", input.sessionId)
    .eq("merchant_id", input.merchantId)
    .single();

  if (error || !data) {
    throw new ApiError(404, "CONSULTATION_SESSION_NOT_FOUND", "Consultation session not found.");
  }

  const [messages, events] = await Promise.all([
    listConsultationMessages(input.sessionId),
    listConsultationEvents(input.sessionId),
  ]);

  const summary = mapConsultationSessionSummary(data as unknown as ConsultationSessionRow);
  const latestMessagePreview = messages.at(-1)?.content ?? null;

  return {
    ...summary,
    latestMessagePreview,
    messages,
    events,
  };
}

export async function createConsultationMessage(input: {
  sessionId: string;
  role: ConsultationMessageDto["role"];
  content: string;
  stageLabel?: string | null;
  toolCards?: ConsultationToolCardDto[];
  visibleSummary?: Record<string, unknown>;
  touchLastMessageAt?: string;
}): Promise<ConsultationMessageDto> {
  if (!isSupabaseAdminConfigured()) {
    const session = demoConsultationSessions.get(input.sessionId);

    if (!session) {
      throw new ApiError(404, "CONSULTATION_SESSION_NOT_FOUND", "Consultation session not found.");
    }

    const now = new Date().toISOString();
    const message: ConsultationMessageDto = {
      id: randomUUID(),
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      stageLabel: input.stageLabel ?? null,
      toolCards: input.toolCards ?? [],
      visibleSummary: input.visibleSummary ?? {},
      createdAt: now,
    };
    const messages = demoConsultationMessages.get(input.sessionId) ?? [];
    messages.push(message);
    demoConsultationMessages.set(input.sessionId, messages);
    demoConsultationSessions.set(input.sessionId, {
      ...session,
      latestMessagePreview: message.content,
      lastMessageAt: input.touchLastMessageAt ?? message.createdAt,
      updatedAt: now,
    });

    return message;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("consultation_messages")
    .insert({
      session_id: input.sessionId,
      role: input.role,
      content: input.content,
      stage_label: input.stageLabel ?? null,
      tool_cards: input.toolCards ?? [],
      visible_summary: input.visibleSummary ?? {},
    })
    .select(consultationMessageSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "CONSULTATION_MESSAGE_CREATE_FAILED", error?.message ?? "Create failed.");
  }

  const createdMessage = mapConsultationMessage(data as unknown as ConsultationMessageRow);
  const touchedAt = input.touchLastMessageAt ?? createdMessage.createdAt;
  const { error: sessionError } = await supabase
    .from("consultation_sessions")
    .update({
      last_message_at: touchedAt,
    })
    .eq("id", input.sessionId);

  if (sessionError) {
    throw new ApiError(500, "CONSULTATION_SESSION_TOUCH_FAILED", sessionError.message);
  }

  return createdMessage;
}

export async function createConsultationEvent(input: {
  sessionId: string;
  eventType: string;
  stageLabel?: string | null;
  payload?: Record<string, unknown>;
}): Promise<ConsultationEventDto> {
  if (!isSupabaseAdminConfigured()) {
    if (!demoConsultationSessions.has(input.sessionId)) {
      throw new ApiError(404, "CONSULTATION_SESSION_NOT_FOUND", "Consultation session not found.");
    }

    const event: ConsultationEventDto = {
      id: randomUUID(),
      sessionId: input.sessionId,
      eventType: input.eventType,
      stageLabel: input.stageLabel ?? null,
      payload: input.payload ?? {},
      createdAt: new Date().toISOString(),
    };
    const events = demoConsultationEvents.get(input.sessionId) ?? [];
    events.push(event);
    demoConsultationEvents.set(input.sessionId, events);

    return event;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("consultation_events")
    .insert({
      session_id: input.sessionId,
      event_type: input.eventType,
      stage_label: input.stageLabel ?? null,
      payload: input.payload ?? {},
    })
    .select(consultationEventSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "CONSULTATION_EVENT_CREATE_FAILED", error?.message ?? "Create failed.");
  }

  return mapConsultationEvent(data as unknown as ConsultationEventRow);
}

export async function updateConsultationSession(input: {
  merchantId: string;
  sessionId: string;
  title?: string | null;
  status?: ConsultationSessionSummaryDto["status"];
  currentStage?: string | null;
  strategySnapshot?: StrategySnapshotDto;
  summaryText?: string | null;
  lastMessageAt?: string;
}): Promise<ConsultationSessionSummaryDto> {
  if (!isSupabaseAdminConfigured()) {
    const current = demoConsultationSessions.get(input.sessionId);

    if (!current || current.merchantId !== input.merchantId) {
      throw new ApiError(404, "CONSULTATION_SESSION_NOT_FOUND", "Consultation session not found.");
    }

    const updated: ConsultationSessionSummaryDto = {
      ...current,
      title: input.title !== undefined ? input.title : current.title,
      status: input.status ?? current.status,
      currentStage:
        input.currentStage !== undefined ? input.currentStage : current.currentStage,
      strategySnapshot: input.strategySnapshot ?? current.strategySnapshot,
      summaryText: input.summaryText !== undefined ? input.summaryText : current.summaryText,
      lastMessageAt: input.lastMessageAt ?? current.lastMessageAt,
      updatedAt: new Date().toISOString(),
    };

    demoConsultationSessions.set(input.sessionId, updated);

    return updated;
  }

  const supabase = createSupabaseAdminClient();
  const patch: Record<string, unknown> = {};

  if (input.title !== undefined) patch.title = input.title;
  if (input.status !== undefined) patch.status = input.status;
  if (input.currentStage !== undefined) patch.current_stage = input.currentStage;
  if (input.strategySnapshot !== undefined) patch.strategy_snapshot = input.strategySnapshot;
  if (input.summaryText !== undefined) patch.summary_text = input.summaryText;
  if (input.lastMessageAt !== undefined) patch.last_message_at = input.lastMessageAt;

  const { data, error } = await supabase
    .from("consultation_sessions")
    .update(patch)
    .eq("id", input.sessionId)
    .eq("merchant_id", input.merchantId)
    .select(consultationSessionSelect)
    .single();

  if (error || !data) {
    throw new ApiError(500, "CONSULTATION_SESSION_UPDATE_FAILED", error?.message ?? "Update failed.");
  }

  return mapConsultationSessionSummary(data as unknown as ConsultationSessionRow);
}

export async function deleteConsultationSession(input: {
  merchantId: string;
  sessionId: string;
}) {
  if (!isSupabaseAdminConfigured()) {
    const current = demoConsultationSessions.get(input.sessionId);

    if (!current || current.merchantId !== input.merchantId) {
      throw new ApiError(404, "CONSULTATION_SESSION_NOT_FOUND", "Consultation session not found.");
    }

    demoConsultationSessions.delete(input.sessionId);
    demoConsultationMessages.delete(input.sessionId);
    demoConsultationEvents.delete(input.sessionId);
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { error, count } = await supabase
    .from("consultation_sessions")
    .delete({ count: "exact" })
    .eq("id", input.sessionId)
    .eq("merchant_id", input.merchantId);

  if (error) {
    throw new ApiError(500, "CONSULTATION_SESSION_DELETE_FAILED", error.message);
  }

  if (!count) {
    throw new ApiError(404, "CONSULTATION_SESSION_NOT_FOUND", "Consultation session not found.");
  }
}

async function listConsultationMessages(sessionId: string): Promise<ConsultationMessageDto[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("consultation_messages")
    .select(consultationMessageSelect)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new ApiError(500, "CONSULTATION_MESSAGES_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as ConsultationMessageRow[]).map(mapConsultationMessage);
}

async function listConsultationEvents(sessionId: string): Promise<ConsultationEventDto[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("consultation_events")
    .select(consultationEventSelect)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new ApiError(500, "CONSULTATION_EVENTS_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as ConsultationEventRow[]).map(mapConsultationEvent);
}

async function listLatestMessagePreviewBySessionIds(sessionIds: string[]) {
  const previews = new Map<string, string>();

  if (sessionIds.length === 0) {
    return previews;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("consultation_messages")
    .select("session_id, content, created_at")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new ApiError(500, "CONSULTATION_MESSAGE_PREVIEW_FETCH_FAILED", error.message);
  }

  for (const row of (data ?? []) as Array<{
    session_id: string;
    content: string;
    created_at: string;
  }>) {
    if (!previews.has(row.session_id)) {
      previews.set(row.session_id, row.content);
    }
  }

  return previews;
}

function mapConsultationSessionSummary(
  row: ConsultationSessionRow,
): ConsultationSessionSummaryDto {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    title: row.title,
    status: row.status,
    currentStage: row.current_stage,
    strategySnapshot: toStrategySnapshot(row.strategy_snapshot),
    summaryText: row.summary_text,
    latestMessagePreview: null,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapConsultationMessage(row: ConsultationMessageRow): ConsultationMessageDto {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    stageLabel: row.stage_label,
    toolCards: toToolCards(row.tool_cards),
    visibleSummary: toRecord(row.visible_summary),
    createdAt: row.created_at,
  };
}

function mapConsultationEvent(row: ConsultationEventRow): ConsultationEventDto {
  return {
    id: row.id,
    sessionId: row.session_id,
    eventType: row.event_type,
    stageLabel: row.stage_label,
    payload: toRecord(row.payload),
    createdAt: row.created_at,
  };
}

function toStrategySnapshot(value: unknown): StrategySnapshotDto {
  const record = toRecord(value);
  const articleBrief = toNullableRecord(record.articleBrief);
  const videoBrief = toNullableRecord(record.videoBrief);

  return {
    positioning: getString(record.positioning),
    coreSellingPoints: toStringArray(record.coreSellingPoints),
    targetAudiences: toStringArray(record.targetAudiences),
    keyScenes: toStringArray(record.keyScenes),
    currentSuggestion: getString(record.currentSuggestion),
    strategyTags: toStringArray(record.strategyTags),
    contentCalendarDraft: toCalendarItems(record.contentCalendarDraft),
    articleBrief: articleBrief
      ? {
          workingTitle: getString(articleBrief.workingTitle),
          angle: getString(articleBrief.angle),
          callToAction: getString(articleBrief.callToAction),
        }
      : null,
    videoBrief: videoBrief
      ? {
          workingTitle: getString(videoBrief.workingTitle),
          hook: getString(videoBrief.hook),
          outcome: getString(videoBrief.outcome),
        }
      : null,
  };
}

function toCalendarItems(value: unknown): StrategySnapshotDto["contentCalendarDraft"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const record = toRecord(item);
      const contentType: "article" | "video" =
        getString(record.contentType) === "video" ? "video" : "article";
      return {
        id: getString(record.id, `calendar-${index + 1}`),
        dayLabel: getString(record.dayLabel),
        contentType,
        strategyTag: getString(record.strategyTag),
        title: getString(record.title),
        summary: getString(record.summary),
      };
    })
    .filter((item) => item.title.length > 0);
}

function toToolCards(value: unknown): ConsultationToolCardDto[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = toRecord(item);
      return {
        key: getString(record.key),
        label: getString(record.label),
        summary: getString(record.summary),
        status: getString(record.status) === "skipped" ? "skipped" : "completed",
      } as ConsultationToolCardDto;
    })
    .filter((card) => card.key.length > 0 && card.label.length > 0);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function toNullableRecord(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const record = toRecord(value);
  return Object.keys(record).length > 0 ? record : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

const consultationSessionSelect = [
  "id",
  "merchant_id",
  "title",
  "status",
  "current_stage",
  "strategy_snapshot",
  "summary_text",
  "last_message_at",
  "created_at",
  "updated_at",
].join(", ");

const consultationMessageSelect = [
  "id",
  "session_id",
  "role",
  "content",
  "stage_label",
  "tool_cards",
  "visible_summary",
  "created_at",
].join(", ");

const consultationEventSelect = [
  "id",
  "session_id",
  "event_type",
  "stage_label",
  "payload",
  "created_at",
].join(", ");

const emptyStrategySnapshot: StrategySnapshotDto = {
  positioning: "",
  coreSellingPoints: [],
  targetAudiences: [],
  keyScenes: [],
  currentSuggestion: "",
  strategyTags: [],
  contentCalendarDraft: [],
  articleBrief: null,
  videoBrief: null,
};
