"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Film,
  Loader2,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  PlayCircle,
  RefreshCw,
  Send,
  Sparkles,
  UploadCloud,
  Video,
  Wand2,
} from "lucide-react";

import type { ConsultationSessionDetailDto } from "@/contracts/consultation";
import type { ContentDraftBundleDto } from "@/contracts/draft";
import type { MaterialLibraryItemDto } from "@/contracts/material";
import type { VideoEditJobDto } from "@/contracts/video";
import {
  formatAssetSize,
  loadDraftMediaAssetsFallback,
  persistDraftMediaAssetsFallback,
  uploadDraftMediaFile,
  type DraftMediaAsset,
} from "@/lib/ui/video-workflow";

type ChatMessage = {
  role: "agent" | "user";
  content: string;
};

export function VideoWorkbench({
  sessionId,
  materialId,
  materialReferenceId,
  strategyTag,
}: {
  sessionId?: string | null;
  materialId?: string | null;
  materialReferenceId?: string | null;
  strategyTag?: string | null;
}) {
  const effectiveSessionId = sessionId ?? "00000000-0000-4000-8000-000000000202";
  const [session, setSession] = useState<ConsultationSessionDetailDto | null>(null);
  const [referenceMaterial, setReferenceMaterial] = useState<MaterialLibraryItemDto | null>(null);
  const [goal, setGoal] = useState("");
  const [extraRequirement, setExtraRequirement] = useState("");
  const [draftBundle, setDraftBundle] = useState<ContentDraftBundleDto | null>(null);
  const [job, setJob] = useState<VideoEditJobDto | null>(null);
  const [loadingSession, setLoadingSession] = useState(Boolean(sessionId));
  const [generating, setGenerating] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [showCanvas, setShowCanvas] = useState(true);
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  const [uploadedSegments, setUploadedSegments] = useState<Record<number, boolean>>({});
  const [uploadedAssets, setUploadedAssets] = useState<DraftMediaAsset[]>([]);
  const [uploadingSegments, setUploadingSegments] = useState<Record<number, boolean>>({});
  const [uploadProgressBySegment, setUploadProgressBySegment] = useState<Record<number, number>>({});
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "agent",
      content: `我已经准备好把咨询策略拆成镜头表、台词和素材要求。${
        strategyTag ? `这次内容策略是「${strategyTag}」。` : ""
      }你可以直接告诉我希望视频偏种草、转化，还是人设表达。`,
    },
  ]);

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
        throw new Error(data.error?.message ?? "咨询上下文加载失败。");
      }

      const loadedSession = data.session;
      setSession(loadedSession);
      setGoal(loadedSession.strategySnapshot.videoBrief?.hook ?? loadedSession.summaryText ?? "");
      setMessages((current) => [
        ...current,
        {
          role: "agent",
          content: `已读取咨询策略：${
            loadedSession.strategySnapshot.videoBrief?.workingTitle ??
            loadedSession.strategySnapshot.currentSuggestion ??
            "视频脚本任务"
          }。右侧画布会根据后续对话实时沉淀脚本结构。`,
        },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "咨询上下文加载失败。");
    } finally {
      setLoadingSession(false);
    }
  }

  async function loadReferenceMaterial(nextMaterialId: string) {
    try {
      const response = await fetch("/api/materials", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        materials?: MaterialLibraryItemDto[];
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(data.error?.message ?? "参考素材加载失败。");
      }

      const material = data.materials?.find((item) => item.id === nextMaterialId) ?? null;
      setReferenceMaterial(material);

      if (material) {
        setMessages((current) => [
          ...current,
          {
            role: "agent",
            content: `已带入参考素材「${material.title}」。我会优先借鉴它的开头钩子、镜头结构和转化动作。`,
          },
        ]);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "参考素材加载失败。");
    }
  }

  async function generateScript(overrides?: {
    goal?: string;
    extraRequirement?: string;
    fromChat?: boolean;
  }) {
    const nextGoal = overrides?.goal ?? goal;
    const nextExtraRequirement = overrides?.extraRequirement ?? extraRequirement;

    setGenerating(true);
    setError(null);
    setUploadMessage(null);

    try {
      const response = await fetch("/api/content/video-scripts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: effectiveSessionId,
          goal: nextGoal,
          extraRequirement: nextExtraRequirement,
          materialId: referenceMaterial?.id ?? materialId ?? null,
          materialReferenceId: materialReferenceId ?? null,
          strategyTag,
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
      setShowCanvas(true);
      setMessages((current) => [
        ...current,
        {
          role: "agent",
          content: overrides?.fromChat
            ? "收到，我已经把你的补充意见更新到右侧脚本画布。你可以继续让我调整镜头节奏、台词风格或结尾转化动作。"
            : "脚本草案已经生成。你可以继续在对话里微调，也可以先上传真实素材，再启动 AI 一键剪辑。",
        },
      ]);
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
      setMessages((current) => [
        ...current,
        {
          role: "agent",
          content: "AI 剪辑任务已经创建。我会在右侧持续显示任务进度，完成后这里会出现可预览的成片结果。",
        },
      ]);
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

  async function handleSegmentUpload(segmentIndex: number, fileList: FileList | null) {
    const nextDraftId = draftBundle?.draft.id;

    if (!nextDraftId) {
      setError("请先生成脚本，再上传素材。");
      return;
    }

    const files = Array.from(fileList ?? []);
    if (files.length === 0) {
      return;
    }

    setUploadingSegments((current) => ({
      ...current,
      [segmentIndex]: true,
    }));
    setUploadProgressBySegment((current) => ({
      ...current,
      [segmentIndex]: 0,
    }));
    setUploadMessage(null);
    setError(null);

    const succeeded: DraftMediaAsset[] = [];
    const failed: string[] = [];

    try {
      for (const file of files) {
        try {
          const asset = await uploadDraftMediaFile({
            draftId: nextDraftId,
            file,
            onProgress(progress) {
              setUploadProgressBySegment((current) => ({
                ...current,
                [segmentIndex]: Math.round(progress.percent * 100),
              }));
            },
          });
          succeeded.push(asset);
        } catch (uploadError) {
          failed.push(
            uploadError instanceof Error ? `${file.name}: ${uploadError.message}` : `${file.name}: 上传失败`,
          );
        }
      }

      if (succeeded.length > 0) {
        setUploadedAssets((current) => mergeAssets(current, succeeded));
        setUploadedSegments((current) => ({
          ...current,
          [segmentIndex]: true,
        }));
        setUploadMessage(`已上传 ${succeeded.length} 个素材，并归档到当前 content_draft。`);
      }

      if (failed.length > 0) {
        setError(failed.join("；"));
      }
    } finally {
      setUploadingSegments((current) => {
        const next = { ...current };
        delete next[segmentIndex];
        return next;
      });
      setUploadProgressBySegment((current) => {
        const next = { ...current };
        delete next[segmentIndex];
        return next;
      });
    }
  }

  function submitChatMessage() {
    const nextInput = input.trim();

    if (!nextInput) {
      return;
    }

    const nextExtraRequirement = [extraRequirement, nextInput].filter(Boolean).join("\n");
    setMessages((current) => [...current, { role: "user", content: nextInput }]);
    setExtraRequirement(nextExtraRequirement);
    setInput("");
    void generateScript({
      extraRequirement: nextExtraRequirement,
      fromChat: true,
    });
  }

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitChatMessage();
  }

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    void loadSession(sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (!materialId) {
      return;
    }

    void loadReferenceMaterial(materialId);
  }, [materialId]);

  useEffect(() => {
    if (!job || !["pending", "queued", "preparing", "running"].includes(job.status)) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadVideoJob(job.id);
    }, 4000);

    return () => window.clearInterval(timer);
  }, [job]);

  useEffect(() => {
    const nextDraftId = draftBundle?.draft.id;
    if (!nextDraftId) {
      setUploadedAssets([]);
      setUploadedSegments({});
      return;
    }

    const restored = loadDraftMediaAssetsFallback(nextDraftId);
    setUploadedAssets(restored);
    setUploadedSegments(restored.length > 0 ? { 0: true } : {});
  }, [draftBundle?.draft.id]);

  useEffect(() => {
    const nextDraftId = draftBundle?.draft.id;
    if (!nextDraftId) {
      return;
    }

    persistDraftMediaAssetsFallback(nextDraftId, uploadedAssets);
  }, [draftBundle?.draft.id, uploadedAssets]);

  const selectedVariant = draftBundle?.selectedVariant ?? draftBundle?.variants[0] ?? null;
  const draftId = draftBundle?.draft.id ?? null;
  const scriptSections = useMemo(() => {
    return (selectedVariant?.scriptText ?? "")
      .split("\n\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }, [selectedVariant?.scriptText]);
  const canvasSegments = scriptSections.length > 0 ? scriptSections : buildPlaceholderSegments(goal, strategyTag);
  const jobIsRunning = job && ["pending", "queued", "preparing", "running"].includes(job.status);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="rounded-lg p-2 text-white/45 hover:bg-white/5 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl tracking-tight [font-family:var(--font-cormorant)]">视频脚本室</h1>
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">AI 对话 + 脚本画布</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-emerald-400 md:inline-flex">
            <CheckCircle2 className="h-3.5 w-3.5" />
            上下文已就绪
          </span>
          <button
            type="button"
            onClick={() => {
              void generateScript();
            }}
            disabled={generating || loadingSession}
            className="inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-amber-500 disabled:opacity-60"
          >
            {generating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
            {draftBundle ? "重新生成脚本" : "生成视频脚本"}
          </button>
          <button
            type="button"
            onClick={() => {
              void createVideoJob();
            }}
            disabled={creatingJob || !selectedVariant}
            className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-white/70 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {creatingJob || jobIsRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
            ) : (
              <Wand2 className="h-3.5 w-3.5 text-amber-500" />
            )}
            {jobIsRunning ? "AI 剪辑中" : "AI 一键剪辑"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-6 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <section
          className={
            showCanvas && canvasExpanded
              ? "hidden min-h-0 shrink-0 flex-col border-r border-white/10 bg-[#0a0a0a] lg:flex lg:w-[320px]"
              : showCanvas
                ? "flex min-h-0 w-[420px] shrink-0 flex-col border-r border-white/10 bg-[#0a0a0a]"
                : "mx-auto flex min-h-0 w-full max-w-3xl flex-col bg-[#0a0a0a]"
          }
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={message.role === "user" ? "flex flex-row-reverse gap-3" : "flex gap-3"}
              >
                <div
                  className={
                    message.role === "agent"
                      ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500"
                      : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs text-white/60"
                  }
                >
                  {message.role === "agent" ? <PlayCircle className="h-4 w-4" /> : "你"}
                </div>
                <div
                  className={
                    message.role === "agent"
                      ? "rounded-2xl rounded-tl-none border border-white/10 bg-[#0d0d0d] p-4 text-sm leading-7 text-white/75"
                      : "rounded-2xl rounded-tr-none bg-amber-600/80 p-4 text-sm leading-7 text-white"
                  }
                >
                  {message.content}
                </div>
              </div>
            ))}

            {generating ? (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
                  <PlayCircle className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-none border border-white/10 bg-[#0d0d0d] p-4 text-sm italic text-white/45">
                  <RefreshCw className="h-4 w-4 animate-spin text-amber-500" />
                  正在更新右侧脚本画布...
                </div>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-white/10 bg-[#080808] p-5">
            <form onSubmit={handleSend} className="relative">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitChatMessage();
                  }
                }}
                placeholder="告诉 AI：镜头节奏、台词风格、素材限制或转化目标..."
                className="max-h-32 min-h-20 w-full resize-none rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 pr-14 text-sm text-white outline-none placeholder:text-white/25 focus:border-amber-500/50"
              />
              <button
                type="submit"
                disabled={generating || !input.trim()}
                className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600/80 text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                aria-label="发送脚本意见"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>

        {showCanvas ? (
          <section className="flex min-h-0 flex-1 justify-center overflow-hidden p-5 lg:p-7">
            <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d] shadow-[0_24px_100px_rgba(0,0,0,0.35)]">
              <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#050505] px-6 py-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="max-w-xl truncate text-base text-[#e0e0e0] [font-family:var(--font-cormorant)]">
                      {selectedVariant?.title ??
                        session?.strategySnapshot.videoBrief?.workingTitle ??
                        referenceMaterial?.title ??
                        "等待生成视频脚本"}
                    </h2>
                    {strategyTag ? (
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-500">
                        {strategyTag}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-white/35">镜头画布 / 台词 / 素材要求</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCanvasExpanded((current) => !current)}
                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/45 transition-colors hover:text-amber-500"
                    aria-label={canvasExpanded ? "缩小画布" : "放大画布"}
                  >
                    {canvasExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCanvas(false)}
                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/45 transition-colors hover:text-white"
                    aria-label="收起画布"
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-6">
                {selectedVariant ? (
                  <div className="space-y-5">
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#080808]">
                      <div className="grid grid-cols-12 border-b border-white/10 bg-[#050505] text-[10px] uppercase tracking-[0.2em] text-white/35">
                        <div className="col-span-2 border-r border-white/10 p-4 text-center">时长</div>
                        <div className="col-span-4 border-r border-white/10 p-4">画面 / 镜头要求</div>
                        <div className="col-span-4 border-r border-white/10 p-4">台词 / 旁白</div>
                        <div className="col-span-2 p-4 text-center">素材</div>
                      </div>
                      {canvasSegments.map((segment, index) => (
                        <ScriptSegmentRow
                          key={`${segment}-${index}`}
                          index={index}
                          text={segment}
                          uploaded={Boolean(uploadedSegments[index])}
                          disabled={!draftId || Boolean(uploadingSegments[index])}
                          uploadLabel={
                            uploadingSegments[index]
                              ? `${uploadProgressBySegment[index] ?? 0}%`
                              : !draftId
                                ? "先生成脚本"
                                : "上传素材"
                          }
                          onUpload={(files) => {
                            void handleSegmentUpload(index, files);
                          }}
                        />
                      ))}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-[#080808] p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm text-[#e0e0e0] [font-family:var(--font-cormorant)]">当前会话已上传素材</p>
                          <p className="mt-2 text-xs leading-6 text-white/45">
                            这里先展示当前会话里已经上传成功并完成归档的素材，目标 owner 固定为 `content_draft`。
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/50">
                          {draftId ? `draft ${draftId.slice(0, 8)}` : "等待脚本"}
                        </span>
                      </div>

                      {!draftId ? (
                        <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-white/45">
                          还没有 `draftId`。请先生成脚本，再上传图片或视频素材。
                        </div>
                      ) : null}

                      {uploadMessage ? (
                        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                          {uploadMessage}
                        </div>
                      ) : null}

                      {uploadedAssets.length > 0 ? (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {uploadedAssets.map((asset) => (
                            <div key={asset.id} className="rounded-2xl border border-white/10 bg-[#050505] p-4">
                              <div className="flex items-center justify-between gap-3">
                                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/50">
                                  {asset.assetType}
                                </span>
                                <span className="text-xs text-white/35">{formatAssetSize(asset.fileSizeBytes)}</span>
                              </div>
                              <p className="mt-3 break-all text-sm text-white/70">{asset.storageKey}</p>
                              <p className="mt-2 text-xs text-white/35">
                                {asset.bucketName || "未返回 bucket"} / {asset.storageProvider}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-white/45">
                          还没有已归档素材。上传成功后，这里会先显示当前浏览器会话内的成功结果。
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[420px] items-center justify-center">
                    <div className="max-w-lg text-center">
                      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5 text-amber-500">
                        <Film className="h-8 w-8" />
                      </div>
                      <p className="text-3xl text-white [font-family:var(--font-cormorant)]">视频脚本还没生成</p>
                      <p className="mt-4 text-sm leading-7 text-white/45">
                        左侧继续和 AI 对话，或点击顶部「生成视频脚本」。脚本生成后，这里会变成可放大、可收起的镜头画布，并支持真实素材上传。
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-amber-500/15 p-2 text-amber-500">
                      {jobIsRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="text-sm text-[#e0e0e0] [font-family:var(--font-cormorant)]">
                        {job
                          ? `任务状态：${job.status} / ${job.currentStage ?? "等待调度"} / ${job.progressPct}%`
                          : "AI 一键剪辑提示"}
                      </p>
                      <p className="mt-2 text-xs leading-6 text-white/50">
                        {job
                          ? "任务创建后会在这里持续更新状态；完成后展示成片预览。"
                          : "脚本确认后点击顶部「AI 一键剪辑」，系统会按镜头顺序和素材要求创建视频任务。即使没有素材，也仍保留当前 fallback。"}
                      </p>
                      {jobIsRunning ? (
                        <div className="mt-4 inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-500">
                          <Clock className="mr-2 h-3.5 w-3.5" />
                          预计 5-10 分钟
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {job?.resultAssets?.[0]?.signedPreviewUrl || job?.resultAssets?.[0]?.originUrl ? (
                    <video
                      controls
                      className="mt-5 aspect-video w-full rounded-2xl border border-white/10 bg-black"
                      src={job.resultAssets?.[0]?.signedPreviewUrl ?? job.resultAssets?.[0]?.originUrl ?? undefined}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="flex min-h-0 flex-1 items-center justify-center p-8">
            <button
              type="button"
              onClick={() => setShowCanvas(true)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-[10px] uppercase tracking-[0.25em] text-white/65 transition-colors hover:bg-white/10 hover:text-white"
            >
              <PanelRightOpen className="h-4 w-4" />
              展开脚本画布
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

function ScriptSegmentRow({
  index,
  text,
  uploaded,
  disabled,
  uploadLabel,
  onUpload,
}: {
  index: number;
  text: string;
  uploaded: boolean;
  disabled: boolean;
  uploadLabel: string;
  onUpload: (files: FileList | null) => void;
}) {
  const labels = ["Hook", "Body", "CTA", "Backup"];
  const timeRanges = ["00:00 - 00:05", "00:05 - 00:25", "00:25 - 00:45", "00:45 - 00:60"];

  return (
    <div className="grid grid-cols-12 border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]">
      <div className="col-span-2 flex flex-col items-center justify-center border-r border-white/5 p-5 text-center font-mono text-xs text-white/55">
        {timeRanges[index] ?? `${index + 1}`.padStart(2, "0")}
        <span className="mt-3 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-amber-500">
          {labels[index] ?? "Shot"}
        </span>
      </div>
      <div className="col-span-4 border-r border-white/5 p-5 text-sm leading-7 text-white/75 [font-family:var(--font-cormorant)]">
        <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-amber-500/80">镜头要求</p>
        {extractShotText(text)}
      </div>
      <div className="col-span-4 border-r border-white/5 p-5 text-sm leading-7 text-white/80 whitespace-pre-wrap [font-family:var(--font-cormorant)]">
        <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/35">台词 / 音效</p>
        {text}
      </div>
      <div className="col-span-2 flex items-center justify-center p-5">
        {uploaded ? (
          <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <Film className="h-5 w-5" />
          </div>
        ) : (
          <label
            className={`flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-[#050505] text-white/35 transition-colors ${
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-amber-500/40 hover:bg-amber-500/5 hover:text-amber-500"
            }`}
          >
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              disabled={disabled}
              onChange={(event) => {
                onUpload(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <UploadCloud className="h-5 w-5" />
            <span className="text-[10px] uppercase tracking-[0.16em]">{uploadLabel}</span>
          </label>
        )}
      </div>
    </div>
  );
}

function extractShotText(text: string) {
  const firstSentence = text.split(/[。！!\n]/).find(Boolean)?.trim();
  return firstSentence
    ? `围绕「${firstSentence}」设计画面节奏，优先使用真实门店、人物动作和细节特写。`
    : "根据策略生成画面、台词和素材要求。";
}

function buildPlaceholderSegments(goal: string, strategyTag?: string | null) {
  const target = goal || "门店场景视频";
  const strategy = strategyTag ?? "种草";

  return [
    `开头 3 秒用「${target}」相关痛点或场景钩子抓注意力，策略侧重「${strategy}」。`,
    "中段展示门店真实空间、服务流程、专业资质或客户常见问题，建立信任。",
    "结尾给出明确行动：私信咨询、预约体验、领取评估或到店了解。",
  ];
}

function mergeAssets(current: DraftMediaAsset[], nextAssets: DraftMediaAsset[]) {
  const seen = new Set<string>();
  return [...nextAssets, ...current].filter((asset) => {
    if (seen.has(asset.id)) {
      return false;
    }
    seen.add(asset.id);
    return true;
  });
}
