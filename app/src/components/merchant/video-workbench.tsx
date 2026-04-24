"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, RefreshCw, Video } from "lucide-react";

import type { ConsultationSessionDetailDto } from "@/contracts/consultation";
import type { ContentDraftBundleDto } from "@/contracts/draft";
import type { VideoEditJobDto } from "@/contracts/video";

export function VideoWorkbench({ sessionId }: { sessionId?: string | null }) {
  const [session, setSession] = useState<ConsultationSessionDetailDto | null>(null);
  const [goal, setGoal] = useState("");
  const [extraRequirement, setExtraRequirement] = useState("");
  const [draftBundle, setDraftBundle] = useState<ContentDraftBundleDto | null>(null);
  const [job, setJob] = useState<VideoEditJobDto | null>(null);
  const [loadingSession, setLoadingSession] = useState(Boolean(sessionId));
  const [generating, setGenerating] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSession(nextSessionId: string) {
    setLoadingSession(true);
    setError(null);

    try {
      const response = await fetch(`/api/consultation/sessions/${nextSessionId}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        session?: ConsultationSessionDetailDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.session) {
        throw new Error(data.error?.message ?? "咨询上下文加载失败");
      }

      setSession(data.session);
      setGoal(data.session.strategySnapshot.videoBrief?.hook ?? data.session.summaryText ?? "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "咨询上下文加载失败");
    } finally {
      setLoadingSession(false);
    }
  }

  async function generateScript() {
    if (!sessionId) {
      setError("请先从咨询页进入视频工作台。");
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/content/video-scripts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          goal,
          extraRequirement,
        }),
      });
      const data = (await response.json()) as {
        draftBundle?: ContentDraftBundleDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.draftBundle) {
        throw new Error(data.error?.message ?? "视频脚本生成失败");
      }

      setDraftBundle(data.draftBundle);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "视频脚本生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function createVideoJob() {
    if (!selectedVariant) {
      setError("请先生成视频脚本。");
      return;
    }

    setCreatingJob(true);
    setError(null);

    try {
      const response = await fetch("/api/video-edit-jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentVariantId: selectedVariant.id,
          instructionText: extraRequirement || goal || selectedVariant.title,
        }),
      });
      const data = (await response.json()) as {
        job?: VideoEditJobDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.job) {
        throw new Error(data.error?.message ?? "视频任务创建失败");
      }

      setJob(data.job);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "视频任务创建失败");
    } finally {
      setCreatingJob(false);
    }
  }

  async function loadVideoJob(jobId: string) {
    try {
      const response = await fetch(`/api/video-edit-jobs/${jobId}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        job?: VideoEditJobDto;
      };

      if (response.ok && data.job) {
        setJob(data.job);
      }
    } catch {
      // Ignore polling errors and keep the last visible state.
    }
  }

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSession(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (!job || !["pending", "queued", "preparing", "running"].includes(job.status)) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadVideoJob(job.id);
    }, 4000);

    return () => window.clearInterval(timer);
  }, [job]);

  const selectedVariant = draftBundle?.selectedVariant ?? draftBundle?.variants[0] ?? null;
  const scriptSections = useMemo(() => {
    return (selectedVariant?.scriptText ?? "")
      .split("\n\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }, [selectedVariant?.scriptText]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="rounded-lg p-2 text-white/45 hover:bg-white/5 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl tracking-tight [font-family:var(--font-cormorant)]">
              视频工作台
            </h1>
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">脚本协同 + 视频任务</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void generateScript();
            }}
            disabled={generating || loadingSession}
            className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-amber-500 disabled:opacity-60"
          >
            {generating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
            {draftBundle ? "重新生成脚本" : "生成脚本"}
          </button>
          <button
            type="button"
            onClick={() => {
              void createVideoJob();
            }}
            disabled={creatingJob || !selectedVariant}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-white disabled:opacity-60"
          >
            {creatingJob ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            创建视频任务
          </button>
        </div>
      </div>

      {error ? (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-6 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="w-[360px] shrink-0 border-r border-white/10 bg-[#0a0a0a] p-6">
          <div className="space-y-5">
            <section>
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">脚本目标</p>
              <textarea
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                rows={4}
                className="mt-3 w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none"
              />
            </section>
            <section>
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">补充要求</p>
              <textarea
                value={extraRequirement}
                onChange={(event) => setExtraRequirement(event.target.value)}
                rows={5}
                placeholder="例如：强调门店空间感，镜头节奏更快，结尾明确引导私信。"
                className="mt-3 w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none placeholder:text-white/25"
              />
            </section>
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">当前策略</p>
              <p className="mt-3 text-sm leading-7 text-white/75">
                {session?.strategySnapshot.currentSuggestion ?? "请先完成咨询后再进入视频工作台。"}
              </p>
            </section>
            <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">任务状态</p>
              <p className="mt-3 text-sm text-white/75">
                {job ? `${job.status} · ${job.currentStage ?? "等待调度"}` : "脚本生成后可直接创建视频任务。"}
              </p>
              {job?.failureReason ? (
                <p className="mt-3 text-sm leading-7 text-rose-200">{job.failureReason}</p>
              ) : null}
            </section>
          </div>
        </aside>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 lg:px-10">
          {loadingSession ? (
            <div className="flex h-full items-center justify-center text-sm text-white/40">
              正在读取咨询上下文...
            </div>
          ) : selectedVariant ? (
            <div className="mx-auto max-w-5xl space-y-6">
              <section className="rounded-3xl border border-white/10 bg-[#111111] p-6">
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">脚本标题</p>
                <h2 className="mt-3 text-3xl text-white [font-family:var(--font-cormorant)]">
                  {selectedVariant.title}
                </h2>
              </section>

              <section className="rounded-3xl border border-white/10 bg-[#111111]">
                <div className="border-b border-white/10 px-6 py-4">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">镜头画布</p>
                </div>
                <div className="space-y-4 p-6">
                  {scriptSections.map((section) => (
                    <div key={section} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-white/80 whitespace-pre-wrap">
                      {section}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-[#111111] p-6">
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">任务结果</p>
                {!job ? (
                  <p className="mt-3 text-sm leading-7 text-white/50">
                    当前脚本已经真实保存到 `content_drafts / content_variants`。下一步创建视频任务后，这里会显示状态推进、失败原因与成片结果。
                  </p>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
                      当前状态: {job.status} · {job.currentStage ?? "等待中"} · {job.progressPct}%
                    </div>
                    {job.resultAssets?.[0]?.signedPreviewUrl || job.resultAssets?.[0]?.originUrl ? (
                      <video
                        controls
                        className="aspect-video w-full rounded-2xl border border-white/10 bg-black"
                        src={job.resultAssets?.[0]?.signedPreviewUrl ?? job.resultAssets?.[0]?.originUrl ?? undefined}
                      />
                    ) : null}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-lg text-center">
                <p className="text-2xl text-white [font-family:var(--font-cormorant)]">视频脚本还没生成</p>
                <p className="mt-3 text-sm leading-7 text-white/45">
                  这里会基于咨询策略快照生成真实 `video_script` 变体，并继续推进视频任务。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
