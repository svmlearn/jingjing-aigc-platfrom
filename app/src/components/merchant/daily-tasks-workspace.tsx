"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { CalendarDays, FileText, RefreshCw, Sparkles, Video } from "lucide-react";

import type { DailyContentWorkspaceDto } from "@/contracts/daily-task";

type ApiErrorPayload = {
  error?: {
    message?: string;
  };
};

export function DailyTasksWorkspace() {
  const [workspace, setWorkspace] = useState<DailyContentWorkspaceDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadWorkspace() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/daily-content-tasks", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await response.json().catch(() => null)) as
        | (DailyContentWorkspaceDto & ApiErrorPayload)
        | null;

      if (!response.ok || !data?.today) {
        throw new Error(data?.error?.message ?? "今日任务加载失败");
      }

      setWorkspace(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "今日任务加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWorkspace();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/40">
        正在准备今日任务...
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md rounded-3xl border border-rose-500/20 bg-rose-500/10 p-6 text-center">
          <p className="text-lg text-rose-100">今日任务暂时不可用</p>
          <p className="mt-3 text-sm leading-7 text-rose-100/70">
            {error ?? "项目内容素材正在补充中，可稍后重试。"}
          </p>
          <button
            type="button"
            onClick={() => {
              void loadWorkspace();
            }}
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs text-white/80"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重新加载
          </button>
        </div>
      </div>
    );
  }

  const today = workspace.today;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-6">
        <div>
          <h1 className="text-xl tracking-tight [font-family:var(--font-cormorant)]">今日任务</h1>
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">
            Team content calendar
          </p>
        </div>
        <div className="flex items-center gap-2">
          {workspace.role === "owner" ? (
            <Link
              href="/dashboard/consultation"
              className="rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-amber-400"
            >
              团队选题
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void loadWorkspace();
            }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-white/55"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6 lg:p-8">
        <section className="rounded-3xl border border-white/10 bg-[#111111] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
                <Sparkles className="h-3.5 w-3.5" />
                {today.taskDate}
              </div>
              <h2 className="mt-4 text-3xl tracking-tight text-white [font-family:var(--font-cormorant)]">
                {today.theme}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">
                今天给你准备了 1 条图文内容和 1 条视频脚本。它们来自团队内容日历，但标题、表达角度和素材组合会按账号稳定分配，成员端只需要照着拍、上传素材并一键剪辑。
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/55">
              来源：{readSourceLabel(today.teamCalendarSource)}
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <TaskCard
            icon={<FileText className="h-5 w-5" />}
            eyebrow="图文任务"
            title={today.articleTask.title}
            summary={today.articleTask.summary}
            materialHints={today.articleTask.materialHints}
            href={`/dashboard/article?source=daily_task&dailyTaskId=${today.id}`}
            actionLabel="生成图文"
          />
          <TaskCard
            icon={<Video className="h-5 w-5" />}
            eyebrow="视频任务"
            title={today.videoTask.title}
            summary={today.videoTask.summary}
            materialHints={today.videoTask.materialHints}
            href={`/dashboard/video?source=daily_task&dailyTaskId=${today.id}`}
            actionLabel="看脚本并上传素材"
          />
        </div>

        <section className="mt-6 rounded-3xl border border-white/10 bg-[#111111]">
          <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
            <CalendarDays className="h-4 w-4 text-white/35" />
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">未来 7 天</p>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
            {workspace.upcoming.map((task) => (
              <div key={task.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                  {task.taskDate}
                </p>
                <p className="mt-3 line-clamp-2 text-sm font-medium leading-6 text-white/80">
                  {task.theme}
                </p>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/40">
                  {task.articleTask.title}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function TaskCard({
  icon,
  eyebrow,
  title,
  summary,
  materialHints,
  href,
  actionLabel,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  summary: string;
  materialHints: string[];
  href: string;
  actionLabel: string;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#111111] p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
            {icon}
          </div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">{eyebrow}</p>
        </div>
        <Link
          href={href}
          className="rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-amber-400"
        >
          {actionLabel}
        </Link>
      </div>
      <h3 className="mt-5 text-xl leading-7 text-white">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-white/55">{summary}</p>
      {materialHints.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {materialHints.slice(0, 4).map((item) => (
            <span key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/45">
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function readSourceLabel(source: Record<string, unknown>) {
  const value = source.source;
  return typeof value === "string" && value ? value : "团队内容日历";
}
