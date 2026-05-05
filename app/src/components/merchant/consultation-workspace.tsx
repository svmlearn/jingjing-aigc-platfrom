"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Edit3,
  History,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import type {
  ConsultationExpertRosterItemDto,
  ContentCalendarItemDto,
  ConsultationSessionDetailDto,
  ConsultationSessionSummaryDto,
} from "@/contracts/consultation";
import { cn } from "@/lib/utils";

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

export function ConsultationWorkspace() {
  const [sessions, setSessions] = useState<ConsultationSessionSummaryDto[]>([]);
  const [experts, setExperts] = useState<ConsultationExpertRosterItemDto[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<ConsultationSessionDetailDto | null>(null);
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolCardsCollapsed, setToolCardsCollapsed] = useState(true);

  function redirectToLogin() {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/login?error=unauthenticated&next=${encodeURIComponent(next)}`);
  }

  async function readApiJson<T>(response: Response, fallbackMessage: string): Promise<T> {
    const data = (await response.json().catch(() => null)) as (T & ApiErrorPayload) | null;

    if (response.status === 401) {
      redirectToLogin();
      throw new Error("登录状态已失效，请重新登录。");
    }

    if (!response.ok) {
      throw new Error(data?.error?.message ?? fallbackMessage);
    }

    return (data ?? {}) as T;
  }

  function assertApiResponseOk(response: Response, fallbackMessage: string) {
    if (response.status === 401) {
      redirectToLogin();
      throw new Error("登录状态已失效，请重新登录。");
    }

    if (!response.ok) {
      throw new Error(fallbackMessage);
    }
  }

  async function loadSessions(preferredId?: string) {
    setLoading(true);
    setSessionsLoaded(false);
    setError(null);

    try {
      const response = await fetch("/api/consultation/sessions", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await readApiJson<{
        sessions?: ConsultationSessionSummaryDto[];
      }>(response, "咨询会话加载失败");

      const nextSessions = data.sessions ?? [];
      setSessions(nextSessions);
      setSessionsLoaded(true);
      setSessionId((currentSessionId) => {
        if (preferredId) {
          return preferredId;
        }

        if (currentSessionId && nextSessions.some((item) => item.id === currentSessionId)) {
          return currentSessionId;
        }

        return nextSessions[0]?.id ?? null;
      });
    } catch (requestError) {
      setSessionsLoaded(false);
      setError(requestError instanceof Error ? requestError.message : "咨询会话加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadSession(nextSessionId: string) {
    try {
      const response = await fetch(`/api/consultation/sessions/${nextSessionId}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await readApiJson<{
        session?: ConsultationSessionDetailDto;
      }>(response, "咨询详情加载失败");

      setSession(data.session ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "咨询详情加载失败");
    }
  }

  async function loadExperts() {
    try {
      const response = await fetch("/api/consultation/experts", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await readApiJson<{
        experts?: ConsultationExpertRosterItemDto[];
      }>(response, "咨询专家加载失败");

      setExperts(data.experts ?? []);
    } catch {
      setExperts([]);
    }
  }

  async function createSession() {
    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/consultation/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "standard" }),
        credentials: "same-origin",
      });
      const data = await readApiJson<{
        session?: ConsultationSessionDetailDto;
      }>(response, "新建咨询失败");

      if (!data.session) {
        throw new Error("新建咨询失败");
      }

      setSession(data.session);
      setSessionId(data.session.id);
      await loadSessions(data.session.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "新建咨询失败");
    } finally {
      setCreating(false);
    }
  }

  const loadSessionsFromEffect = useEffectEvent(async () => {
    await loadSessions();
  });

  const createSessionFromEffect = useEffectEvent(async () => {
    await createSession();
  });

  const loadSessionFromEffect = useEffectEvent(async (nextSessionId: string) => {
    await loadSession(nextSessionId);
  });

  const loadExpertsFromEffect = useEffectEvent(async () => {
    await loadExperts();
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSessionsFromEffect();
      void loadExpertsFromEffect();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (sessionsLoaded && !loading && sessions.length === 0 && !creating) {
      const timeoutId = window.setTimeout(() => {
        void createSessionFromEffect();
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [creating, loading, sessions.length, sessionsLoaded]);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadSessionFromEffect(sessionId);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [sessionId]);

  const latestAssistantMessage =
    [...(session?.messages ?? [])].reverse().find((message) => message.role === "assistant") ?? null;
  const toolCards = latestAssistantMessage?.toolCards ?? [];
  const strategySnapshot = session?.strategySnapshot ?? null;
  const isLegacyRoundtable = Boolean(session?.roundtable);

  function selectHistorySession(nextSessionId: string) {
    setSessionId(nextSessionId);
    setHistoryOpen(false);
  }

  function toggleHistoryDrawer() {
    const nextHistoryOpen = !historyOpen;
    setHistoryOpen(nextHistoryOpen);

    if (nextHistoryOpen) {
      void loadSessions(sessionId ?? undefined);
    }
  }

  function getCalendarItemHref(item: ContentCalendarItemDto) {
    if (!session) {
      return "#";
    }

    const params = new URLSearchParams({
      source: "consultation_calendar",
      sessionId: session.id,
      calendarItemId: item.id,
      strategyTag: item.strategyTag,
    });

    if (item.contentType === "article") {
      params.set("mode", "create");
    }

    return `/dashboard/${item.contentType === "article" ? "article" : "video"}?${params.toString()}`;
  }

  function insertExpertMention(expert: ConsultationExpertRosterItemDto) {
    const mention = `@${expert.mentionLabel} `;

    setInput((currentInput) => {
      const trimmedStart = currentInput.trimStart();

      if (trimmedStart.startsWith(mention)) {
        return currentInput;
      }

      const withoutExistingMention = trimmedStart.replace(/^@[^\s@，,：:]+[\s，,：:]*/, "");
      return `${mention}${withoutExistingMention}`;
    });
  }

  async function deleteHistorySession(nextSessionId: string) {
    if (pendingDeleteSessionId !== nextSessionId) {
      setPendingDeleteSessionId(nextSessionId);
      return;
    }

    setDeletingSessionId(nextSessionId);
    setError(null);

    try {
      const response = await fetch(`/api/consultation/sessions/${nextSessionId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });

      assertApiResponseOk(response, "聊天记录删除失败，请稍后重试。");

      setPendingDeleteSessionId(null);

      if (nextSessionId === sessionId) {
        setSession(null);
        setSessionId(null);
      }

      await loadSessions();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "聊天记录删除失败，请稍后重试。");
    } finally {
      setDeletingSessionId(null);
    }
  }

  async function sendMessage() {
    if (!sessionId || !input.trim()) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await fetch(`/api/consultation/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: input.trim(),
        }),
        credentials: "same-origin",
      });
      const data = await readApiJson<{
        session?: ConsultationSessionDetailDto;
      }>(response, "发送消息失败");

      if (!data.session) {
        throw new Error("发送消息失败");
      }

      setSession(data.session);
      setInput("");
      await loadSessions(data.session.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "发送消息失败");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex h-14 items-center justify-between border-b border-white/10 px-6">
        <div className="flex items-center gap-4">
          <h1 className="text-xl tracking-tight [font-family:var(--font-cormorant)]">
            AI 咨询诊断
          </h1>
          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.25em] text-amber-500">
            {session?.currentStage ?? "准备中"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void createSession();
            }}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] text-amber-500 transition-colors hover:bg-amber-500/20 disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            新开对话
          </button>
          <button
            type="button"
            onClick={toggleHistoryDrawer}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] transition-colors",
              historyOpen
                ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white",
            )}
          >
            <History className="h-3.5 w-3.5" />
            历史记录
          </button>
        </div>
      </div>

      {historyOpen ? (
        <>
          <button
            type="button"
            aria-label="关闭咨询历史记录"
            onClick={() => setHistoryOpen(false)}
            className="absolute inset-0 z-20 bg-black/35 backdrop-blur-[1px]"
          />
          <div className="absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-white/10 bg-[#0a0a0a]/95 shadow-[0_24px_90px_rgba(0,0,0,0.55)] backdrop-blur">
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-amber-500/80">
                  Consultation History
                </p>
                <h2 className="mt-1 text-sm font-medium text-white">咨询聊天记录</h2>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="关闭咨询历史记录"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/55">
                  正在读取咨询聊天记录...
                </div>
              ) : sessions.length ? (
                <div className="space-y-3">
                  {sessions.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-2xl border p-4 transition-colors",
                        item.id === sessionId
                          ? "border-amber-500/40 bg-amber-500/10"
                          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/5",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3 text-left">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => selectHistorySession(item.id)}
                            className="block max-w-full text-left focus-visible:outline-none"
                          >
                            <span className="block truncate text-sm font-medium text-white">
                              {item.title ?? "未命名咨询"}
                            </span>
                          </button>
                          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/35">
                            {item.currentStage ?? "咨询中"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-[10px] text-white/35">
                            {formatConsultationTime(item.lastMessageAt)}
                          </span>
                          <button
                            type="button"
                            disabled={deletingSessionId === item.id}
                            onClick={() => {
                              void deleteHistorySession(item.id);
                            }}
                            className={cn(
                              "inline-flex h-8 items-center gap-1 rounded-full border px-2 text-[10px] transition-colors disabled:opacity-50",
                              pendingDeleteSessionId === item.id
                                ? "border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20"
                                : "border-white/10 bg-white/5 text-white/40 hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-200",
                            )}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {pendingDeleteSessionId === item.id
                              ? deletingSessionId === item.id
                                ? "删除中"
                                : "确认删除"
                              : "删除"}
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => selectHistorySession(item.id)}
                        className="mt-3 block w-full text-left focus-visible:outline-none"
                      >
                        <span className="block max-h-12 overflow-hidden text-xs leading-6 text-white/55">
                          {item.latestMessagePreview || item.summaryText || "暂无消息摘要"}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/55">
                  还没有咨询聊天记录。新开对话后，会在这里显示。
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      {calendarOpen ? (
        <>
          <button
            type="button"
            aria-label="关闭内容日历"
            onClick={() => setCalendarOpen(false)}
            className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
          <div className="absolute inset-4 z-50 flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] shadow-[0_24px_90px_rgba(0,0,0,0.65)] md:inset-8">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-amber-500/80">
                  Content Marketing Calendar
                </p>
                <h2 className="mt-2 text-xl italic tracking-tight text-white [font-family:var(--font-cormorant)]">
                  营销内容日历
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCalendarOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="关闭内容日历"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {session?.strategySnapshot.contentCalendarDraft.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {session.strategySnapshot.contentCalendarDraft.map((item) => (
                    <Link
                      key={item.id}
                      href={getCalendarItemHref(item)}
                      onClick={() => setCalendarOpen(false)}
                      className="group flex min-h-44 flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-amber-500/40 hover:bg-amber-500/5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-white/55">
                          {item.dayLabel}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.22em]",
                            item.contentType === "article"
                              ? "bg-orange-500/15 text-orange-300"
                              : "bg-sky-500/15 text-sky-300",
                          )}
                        >
                          {item.contentType === "article" ? "图文" : "视频"}
                        </span>
                      </div>
                      <p className="mt-4 text-[10px] uppercase tracking-[0.25em] text-amber-500/80">
                        {item.strategyTag}
                      </p>
                      <h3 className="mt-2 text-sm font-medium leading-6 text-white">{item.title}</h3>
                      <p className="mt-2 line-clamp-3 text-xs leading-6 text-white/50">{item.summary}</p>
                      <span className="mt-auto inline-flex items-center gap-1 pt-4 text-[10px] uppercase tracking-[0.22em] text-white/35 transition-colors group-hover:text-amber-500">
                        去{item.contentType === "article" ? "图文" : "视频"}工作台生成
                        <ChevronRight className="h-3 w-3" />
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm leading-7 text-white/55">
                  暂无内容日历。继续和 AI 咨询诊断沟通后，这里会同步生成可执行的图文和视频任务。
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      {error ? (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-6 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="border-b border-white/10 px-6 py-3">
        <div className="flex gap-2 overflow-x-auto">
          {sessions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSessionId(item.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors",
                sessionId === item.id
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                  : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white",
              )}
            >
              {item.title ?? "未命名咨询"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {toolCards.length ? (
              <section className="border-b border-white/10 px-6 py-3">
                <button
                  type="button"
                  aria-expanded={!toolCardsCollapsed}
                  onClick={() => setToolCardsCollapsed((collapsed) => !collapsed)}
                  className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-amber-500/30 hover:bg-amber-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
                >
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-amber-500/80">
                      Agent 执行过程
                    </p>
                    <p className="mt-1 truncate text-sm text-white/65">
                      已执行 {toolCards.length} 项：
                      {toolCards.slice(0, 3).map((tool) => tool.label).join("、")}
                      {toolCards.length > 3 ? " 等" : ""}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-[#050505] px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-white/55">
                    {toolCardsCollapsed ? "展开" : "收起"}
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        !toolCardsCollapsed && "rotate-180",
                      )}
                    />
                  </span>
                </button>

                {!toolCardsCollapsed ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {toolCards.map((tool) => (
                      <div key={tool.key} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">
                          {tool.label}
                        </p>
                        <p className="mt-2 text-sm text-white/80">{tool.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            <div className="px-6 py-6">
              {loading && !session ? (
                <div className="flex min-h-[12rem] items-center justify-center text-sm text-white/40">
                  正在读取咨询会话...
                </div>
              ) : (
                <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-8">
                  {session?.messages.map((message) => {
                    const agentLoopMeta = getMessageAgentLoopMeta(message.visibleSummary);

                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-4",
                          message.role === "user" ? "justify-end" : "justify-start",
                        )}
                      >
                        {message.role !== "user" ? (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
                            <Sparkles className="h-4 w-4" />
                          </div>
                        ) : null}
                        <div
                          className={cn(
                            "max-w-2xl rounded-2xl border px-4 py-3 text-sm leading-7",
                            message.role === "user"
                              ? "border-amber-500/20 bg-amber-600/80 text-white"
                              : "border-white/10 bg-[#111111] text-white/85",
                          )}
                        >
                          {message.role !== "user" && agentLoopMeta?.agentName ? (
                            <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-amber-500/80">
                              {agentLoopMeta.agentName}
                            </p>
                          ) : null}
                          {message.content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-white/10 bg-[#0d0d0d]/95 px-6 py-4">
            {isLegacyRoundtable ? (
              <LegacyRoundtableNotice />
            ) : null}

            {experts.length > 0 ? (
              <ExpertMentionBar
                experts={experts}
                onSelect={insertExpertMention}
              />
            ) : null}

            <form
              className="mx-auto flex max-w-3xl items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage();
              }}
            >
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={isLegacyRoundtable}
                placeholder={
                  isLegacyRoundtable
                    ? "这个旧圆桌会话已不再作为主入口，请新开普通咨询后用 @ 专家继续。"
                    : "告诉我你的业务目标、主力客群、成交异议或想优先拿下的场景..."
                }
                className="max-h-36 min-h-[72px] flex-1 resize-y rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={sending || !input.trim() || isLegacyRoundtable}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-600 text-white transition-colors hover:bg-amber-500 disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            {!isLegacyRoundtable ? (
              <div className="mx-auto mt-3 flex max-w-3xl flex-wrap gap-2">
                {["我们在客流上有瓶颈", "我不太清楚怎么拍视频"].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="hidden w-96 shrink-0 overflow-y-auto border-l border-white/10 bg-[#0a0a0a] xl:flex xl:flex-col">
          <div className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/40">
                <BookOpen className="h-4 w-4 text-amber-500" />
                我的策略资产
              </h2>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-emerald-400">
                可执行
              </span>
            </div>

            <Card title="策略资产 Editor">
              <div className="space-y-5">
                <div className="space-y-3 text-sm text-white/75">
                  <StrategyRow
                    label="我们是谁"
                    value={strategySnapshot?.positioning ?? "等待咨询中..."}
                  />
                  <StrategyRow
                    label="服务谁"
                    value={strategySnapshot?.targetAudiences.join("、") || "继续补充客群"}
                  />
                  <StrategyRow
                    label="核心场景"
                    value={strategySnapshot?.keyScenes.join("、") || "继续补充场景"}
                  />
                </div>

                <StrategyChipGroup
                  label="核心卖点"
                  items={strategySnapshot?.coreSellingPoints ?? []}
                  emptyText="继续补充卖点"
                  tone="neutral"
                />
                <StrategyChipGroup
                  label="目标客群"
                  items={strategySnapshot?.targetAudiences ?? []}
                  emptyText="继续补充客群"
                  tone="amber"
                />

                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">
                    当前建议
                  </p>
                  <p className="flex items-start gap-2 text-sm leading-7 text-white/75">
                    <MessageCircle className="mt-1 h-4 w-4 shrink-0 text-white/35" />
                    {strategySnapshot?.currentSuggestion ?? "继续补充信息后，这里会同步咨询建议。"}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-auto border-t border-white/10 p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/40">
                <CalendarDays className="h-4 w-4 text-amber-500" />
                营销内容日历
              </h2>
              <button
                type="button"
                onClick={() => setCalendarOpen(true)}
                className="text-[10px] uppercase tracking-[0.25em] text-amber-500"
              >
                查看全部内容
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {session?.strategySnapshot.contentCalendarDraft.map((item) => (
                <Link
                  key={item.id}
                  href={getCalendarItemHref(item)}
                  className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition-colors hover:border-amber-500/40 hover:bg-amber-500/5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">
                        {item.dayLabel} · {item.strategyTag}
                      </p>
                      <p className="mt-2 text-sm text-white">{item.title}</p>
                      <p className="mt-2 text-xs leading-6 text-white/50">{item.summary}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-white/30" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ExpertMentionBar(props: {
  experts: ConsultationExpertRosterItemDto[];
  onSelect: (expert: ConsultationExpertRosterItemDto) => void;
}) {
  return (
    <div className="mx-auto mb-3 flex max-w-3xl items-center gap-2 overflow-x-auto pb-1">
      <span className="shrink-0 text-[10px] uppercase tracking-[0.22em] text-white/35">
        @ 专家
      </span>
      {props.experts.map((expert) => (
        <button
          key={expert.agentId}
          type="button"
          onClick={() => props.onSelect(expert)}
          title={expert.roleDescription ?? expert.description ?? expert.displayName}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
            expert.isDefault
              ? "border-amber-500/35 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
              : "border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:bg-white/10 hover:text-white",
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {expert.displayName}
          {expert.isDefault ? (
            <span className="text-[10px] text-amber-300/60">默认</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function LegacyRoundtableNotice() {
  return (
    <div className="mx-auto mb-3 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">
        Legacy Roundtable
      </p>
      <p className="mt-2 text-sm leading-6 text-white/60">
        这个会话来自旧圆桌咨询入口。当前主流程已收口到普通咨询里的 @ 专家容器，请新开对话后选择专家继续。
      </p>
    </div>
  );
}

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">{props.title}</p>
        <Edit3 className="h-3.5 w-3.5 text-white/25" />
      </div>
      <div className="mt-3">{props.children}</div>
    </div>
  );
}

function StrategyRow(props: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-16 shrink-0 text-[10px] uppercase tracking-[0.2em] text-white/30">
        {props.label}
      </span>
      <span className="font-serif italic text-white/80">{props.value}</span>
    </div>
  );
}

function StrategyChipGroup(props: {
  label: string;
  items: string[];
  emptyText: string;
  tone: "amber" | "neutral";
}) {
  const chipClassName =
    props.tone === "amber"
      ? "border-amber-500/20 bg-amber-500/10 text-amber-500"
      : "border-white/10 bg-white/5 text-white/75";
  const items = props.items.length > 0 ? props.items : [props.emptyText];

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/30">{props.label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className={cn("rounded-full border px-3 py-1 text-xs", chipClassName)}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function getMessageAgentLoopMeta(value: Record<string, unknown>) {
  const agentLoop = toRecord(value.agentLoop);
  const agentContainer = toRecord(agentLoop.agentContainer);
  const agentName =
    typeof agentContainer.displayName === "string" ? agentContainer.displayName : null;

  return agentName ? { agentName } : null;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function formatConsultationTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
