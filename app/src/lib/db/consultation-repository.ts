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
import {
  isAppPostgresConfigured,
  isAppPostgresPreferred,
  mapPostgresError,
  queryAppDb,
  withAppDbTransaction,
} from "@/lib/server-db/postgres";
import { emptyStrategySnapshot, toStrategySnapshot } from "@/lib/strategy-snapshot";
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
  last_message_at: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
};

type ConsultationMessageRow = {
  id: string;
  session_id: string;
  role: ConsultationMessageDto["role"];
  content: string;
  stage_label: string | null;
  tool_cards: unknown;
  visible_summary: unknown;
  created_at: string | Date;
};

type ConsultationEventRow = {
  id: string;
  session_id: string;
  event_type: string;
  stage_label: string | null;
  payload: unknown;
  created_at: string | Date;
};

const demoConsultationSessions = new Map<string, ConsultationSessionSummaryDto>();
const demoConsultationMessages = new Map<string, ConsultationMessageDto[]>();
const demoConsultationEvents = new Map<string, ConsultationEventDto[]>();

export async function listConsultationSessions(
  merchantId: string,
): Promise<ConsultationSessionSummaryDto[]> {
  if (shouldUseAppPostgres()) {
    try {
      const result = await queryAppDb<ConsultationSessionRow>(
        `
        select ${consultationSessionSelect}
        from public.consultation_sessions
        where merchant_id = $1
        order by last_message_at desc, created_at desc
        `,
        [merchantId],
      );
      const sessions = result.rows.map(mapConsultationSessionSummary);
      const previews = await listLatestMessagePreviewBySessionIds(
        sessions.map((session) => session.id),
      );

      return sessions.map((session) => ({
        ...session,
        latestMessagePreview: previews.get(session.id) ?? null,
      }));
    } catch (error) {
      throw mapPostgresError(error, "CONSULTATION_SESSIONS_LIST_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
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
  if (shouldUseAppPostgres()) {
    try {
      const result = await queryAppDb<ConsultationSessionRow>(
        `
        insert into public.consultation_sessions (
          merchant_id,
          title,
          status,
          current_stage,
          strategy_snapshot,
          summary_text
        ) values ($1, $2, $3, $4, $5::jsonb, $6)
        returning ${consultationSessionSelect}
        `,
        [
          input.merchantId,
          input.title ?? null,
          input.status ?? "active",
          input.currentStage ?? null,
          JSON.stringify(input.strategySnapshot ?? emptyStrategySnapshot),
          input.summaryText ?? null,
        ],
      );

      return mapConsultationSessionSummary(result.rows[0]);
    } catch (error) {
      throw mapPostgresError(error, "CONSULTATION_SESSION_CREATE_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
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
  if (shouldUseAppPostgres()) {
    try {
      const result = await queryAppDb<ConsultationSessionRow>(
        `
        select ${consultationSessionSelect}
        from public.consultation_sessions
        where id = $1
          and merchant_id = $2
        limit 1
        `,
        [input.sessionId, input.merchantId],
      );
      const sessionRow = result.rows[0];

      if (!sessionRow) {
        throw new ApiError(404, "CONSULTATION_SESSION_NOT_FOUND", "Consultation session not found.");
      }

      const [messages, events] = await Promise.all([
        listConsultationMessages(input.sessionId),
        listConsultationEvents(input.sessionId),
      ]);
      const summary = mapConsultationSessionSummary(sessionRow);

      return {
        ...summary,
        latestMessagePreview: messages.at(-1)?.content ?? null,
        messages,
        events,
      };
    } catch (error) {
      throw mapPostgresError(error, "CONSULTATION_SESSION_FETCH_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
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
  if (shouldUseAppPostgres()) {
    try {
      return await withAppDbTransaction(async (client) => {
        const messageResult = await client.query<ConsultationMessageRow>(
          `
          insert into public.consultation_messages (
            session_id,
            role,
            content,
            stage_label,
            tool_cards,
            visible_summary
          ) values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
          returning ${consultationMessageSelect}
          `,
          [
            input.sessionId,
            input.role,
            input.content,
            input.stageLabel ?? null,
            JSON.stringify(input.toolCards ?? []),
            JSON.stringify(input.visibleSummary ?? {}),
          ],
        );
        const createdMessage = mapConsultationMessage(messageResult.rows[0]);
        const touchedAt = input.touchLastMessageAt ?? createdMessage.createdAt;
        const touchResult = await client.query(
          `
          update public.consultation_sessions
          set last_message_at = $2,
              updated_at = timezone('utc', now())
          where id = $1
          `,
          [input.sessionId, touchedAt],
        );

        if (touchResult.rowCount === 0) {
          throw new ApiError(404, "CONSULTATION_SESSION_NOT_FOUND", "Consultation session not found.");
        }

        return createdMessage;
      });
    } catch (error) {
      throw mapPostgresError(error, "CONSULTATION_MESSAGE_CREATE_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
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
  if (shouldUseAppPostgres()) {
    try {
      const result = await queryAppDb<ConsultationEventRow>(
        `
        insert into public.consultation_events (
          session_id,
          event_type,
          stage_label,
          payload
        ) values ($1, $2, $3, $4::jsonb)
        returning ${consultationEventSelect}
        `,
        [
          input.sessionId,
          input.eventType,
          input.stageLabel ?? null,
          JSON.stringify(input.payload ?? {}),
        ],
      );

      return mapConsultationEvent(result.rows[0]);
    } catch (error) {
      throw mapPostgresError(error, "CONSULTATION_EVENT_CREATE_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
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
  if (shouldUseAppPostgres()) {
    try {
      const patch = buildConsultationSessionPostgresPatch(input);

      if (patch.assignments.length === 0) {
        return getConsultationSessionDetail({
          merchantId: input.merchantId,
          sessionId: input.sessionId,
        });
      }

      const result = await queryAppDb<ConsultationSessionRow>(
        `
        update public.consultation_sessions
        set ${patch.assignments.join(", ")},
            updated_at = timezone('utc', now())
        where id = $${patch.values.length + 1}
          and merchant_id = $${patch.values.length + 2}
        returning ${consultationSessionSelect}
        `,
        [...patch.values, input.sessionId, input.merchantId],
      );
      const sessionRow = result.rows[0];

      if (!sessionRow) {
        throw new ApiError(404, "CONSULTATION_SESSION_NOT_FOUND", "Consultation session not found.");
      }

      return mapConsultationSessionSummary(sessionRow);
    } catch (error) {
      throw mapPostgresError(error, "CONSULTATION_SESSION_UPDATE_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
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
  if (shouldUseAppPostgres()) {
    try {
      const result = await queryAppDb<{ id: string }>(
        `
        delete from public.consultation_sessions
        where id = $1
          and merchant_id = $2
        returning id
        `,
        [input.sessionId, input.merchantId],
      );

      if (!result.rows[0]) {
        throw new ApiError(404, "CONSULTATION_SESSION_NOT_FOUND", "Consultation session not found.");
      }

      return;
    } catch (error) {
      throw mapPostgresError(error, "CONSULTATION_SESSION_DELETE_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
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
  if (shouldUseAppPostgres()) {
    try {
      const result = await queryAppDb<ConsultationMessageRow>(
        `
        select ${consultationMessageSelect}
        from public.consultation_messages
        where session_id = $1
        order by created_at asc, id asc
        `,
        [sessionId],
      );

      return result.rows.map(mapConsultationMessage);
    } catch (error) {
      throw mapPostgresError(error, "CONSULTATION_MESSAGES_LIST_FAILED");
    }
  }

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
  if (shouldUseAppPostgres()) {
    try {
      const result = await queryAppDb<ConsultationEventRow>(
        `
        select ${consultationEventSelect}
        from public.consultation_events
        where session_id = $1
        order by created_at asc, id asc
        `,
        [sessionId],
      );

      return result.rows.map(mapConsultationEvent);
    } catch (error) {
      throw mapPostgresError(error, "CONSULTATION_EVENTS_LIST_FAILED");
    }
  }

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

  if (shouldUseAppPostgres()) {
    try {
      const result = await queryAppDb<{
        session_id: string;
        content: string;
      }>(
        `
        select distinct on (session_id)
          session_id,
          content
        from public.consultation_messages
        where session_id = any($1::uuid[])
        order by session_id, created_at desc, id desc
        `,
        [sessionIds],
      );

      for (const row of result.rows) {
        previews.set(row.session_id, row.content);
      }

      return previews;
    } catch (error) {
      throw mapPostgresError(error, "CONSULTATION_MESSAGE_PREVIEW_FETCH_FAILED");
    }
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
    lastMessageAt: toIsoString(row.last_message_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
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
    createdAt: toIsoString(row.created_at),
  };
}

function mapConsultationEvent(row: ConsultationEventRow): ConsultationEventDto {
  return {
    id: row.id,
    sessionId: row.session_id,
    eventType: row.event_type,
    stageLabel: row.stage_label,
    payload: toRecord(row.payload),
    createdAt: toIsoString(row.created_at),
  };
}

function buildConsultationSessionPostgresPatch(input: {
  title?: string | null;
  status?: ConsultationSessionSummaryDto["status"];
  currentStage?: string | null;
  strategySnapshot?: StrategySnapshotDto;
  summaryText?: string | null;
  lastMessageAt?: string;
}) {
  const assignments: string[] = [];
  const values: unknown[] = [];

  function add(column: string, value: unknown, cast = "") {
    values.push(value);
    assignments.push(`${column} = $${values.length}${cast}`);
  }

  if (input.title !== undefined) add("title", input.title);
  if (input.status !== undefined) add("status", input.status);
  if (input.currentStage !== undefined) add("current_stage", input.currentStage);
  if (input.strategySnapshot !== undefined) {
    add("strategy_snapshot", JSON.stringify(input.strategySnapshot), "::jsonb");
  }
  if (input.summaryText !== undefined) add("summary_text", input.summaryText);
  if (input.lastMessageAt !== undefined) add("last_message_at", input.lastMessageAt);

  return { assignments, values };
}

function shouldUseAppPostgres() {
  return isAppPostgresConfigured() && isAppPostgresPreferred();
}

function shouldUseDemoFallback() {
  return !shouldUseAppPostgres() && !isSupabaseAdminConfigured();
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
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
        status: toToolCardStatus(record.status),
      } as ConsultationToolCardDto;
    })
    .filter((card) => card.key.length > 0 && card.label.length > 0);
}

function toToolCardStatus(value: unknown): ConsultationToolCardDto["status"] {
  const status = getString(value);

  if (status === "skipped" || status === "failed") {
    return status;
  }

  return "completed";
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
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
