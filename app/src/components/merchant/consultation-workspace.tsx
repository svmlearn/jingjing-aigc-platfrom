"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  History,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";

import type {
  ConsultationSessionDetailDto,
  ConsultationSessionSummaryDto,
} from "@/contracts/consultation";
import { cn } from "@/lib/utils";

export function ConsultationWorkspace() {
  const [sessions, setSessions] = useState<ConsultationSessionSummaryDto[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<ConsultationSessionDetailDto | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSessions(preferredId?: string) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/consultation/sessions", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        sessions?: ConsultationSessionSummaryDto[];
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(data.error?.message ?? "咨询会话加载失败");
      }

      const nextSessions = data.sessions ?? [];
      setSessions(nextSessions);
      setSessionId((currentSessionId) => preferredId ?? currentSessionId ?? nextSessions[0]?.id ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "咨询会话加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadSession(nextSessionId: string) {
    try {
      const response = await fetch(`/api/consultation/sessions/${nextSessionId}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        session?: ConsultationSessionDetailDto;
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(data.error?.message ?? "咨询详情加载失败");
      }

      setSession(data.session ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "咨询详情加载失败");
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
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as {
        session?: ConsultationSessionDetailDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.session) {
        throw new Error(data.error?.message ?? "新建咨询失败");
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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSessionsFromEffect();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!loading && sessions.length === 0 && !creating) {
      const timeoutId = window.setTimeout(() => {
        void createSessionFromEffect();
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [creating, loading, sessions.length]);

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
      });
      const data = (await response.json()) as {
        session?: ConsultationSessionDetailDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.session) {
        throw new Error(data.error?.message ?? "发送消息失败");
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
    <div className="flex h-full min-h-0 flex-col">
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
          <Link
            href="/dashboard/history"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] text-white/65 transition-colors hover:bg-white/10 hover:text-white"
          >
            <History className="h-3.5 w-3.5" />
            历史记录
          </Link>
        </div>
      </div>

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

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col">
          {latestAssistantMessage?.toolCards?.length ? (
            <div className="border-b border-white/10 px-6 py-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {latestAssistantMessage.toolCards.map((tool) => (
                  <div key={tool.key} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">
                      {tool.label}
                    </p>
                    <p className="mt-2 text-sm text-white/80">{tool.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {loading && !session ? (
              <div className="flex h-full items-center justify-center text-sm text-white/40">
                正在读取咨询会话...
              </div>
            ) : (
              <div className="mx-auto flex max-w-3xl flex-col gap-5">
                {session?.messages.map((message) => (
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
                      {message.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 px-6 py-4">
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
                placeholder="告诉我你的业务目标、主力客群、成交异议或想优先拿下的场景..."
                className="min-h-[72px] flex-1 rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none placeholder:text-white/25"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-600 text-white transition-colors hover:bg-amber-500 disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        <aside className="hidden w-96 shrink-0 border-l border-white/10 bg-[#0a0a0a] xl:flex xl:flex-col">
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

            <Card title="产品定位">
              <div className="space-y-2 text-sm text-white/80">
                <p>{session?.strategySnapshot.positioning ?? "等待咨询中..."}</p>
              </div>
            </Card>

            <Card title="核心卖点卡">
              <div className="flex flex-wrap gap-2">
                {session?.strategySnapshot.coreSellingPoints.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </Card>

            <Card title="目标客群">
              <div className="flex flex-wrap gap-2">
                {session?.strategySnapshot.targetAudiences.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-500"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </Card>

            <Card title="当前建议">
              <p className="text-sm leading-7 text-white/75">
                {session?.strategySnapshot.currentSuggestion ?? "继续补充信息后，这里会同步咨询建议。"}
              </p>
            </Card>
          </div>

          <div className="mt-auto border-t border-white/10 p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/40">
                <CalendarDays className="h-4 w-4 text-amber-500" />
                营销内容日历
              </h2>
              <Link
                href="/dashboard/content"
                className="text-[10px] uppercase tracking-[0.25em] text-amber-500"
              >
                查看全部
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {session?.strategySnapshot.contentCalendarDraft.map((item) => (
                <Link
                  key={item.id}
                  href={
                    item.contentType === "article"
                      ? `/dashboard/article?sessionId=${session.id}`
                      : `/dashboard/video?sessionId=${session.id}`
                  }
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

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">{props.title}</p>
      <div className="mt-3">{props.children}</div>
    </div>
  );
}
