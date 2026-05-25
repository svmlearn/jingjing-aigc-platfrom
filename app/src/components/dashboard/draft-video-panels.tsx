"use client";

import { CheckCircle2, CircleAlert, Clapperboard, Download, ImageIcon, Loader2, RefreshCw, RotateCcw, Upload, Video, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ContentVariantDto } from "@/contracts/draft";
import type { VideoEditProgressModuleDto } from "@/contracts/video";
import { isVideoEditJobInFlightStatus } from "@/contracts/video";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getVideoJobStageLabel } from "@/lib/ui/video-job-display";
import {
  cancelVideoEditJob,
  createVideoEditJob,
  formatAssetSize,
  getVideoEditJobDetail,
  listVideoEditJobs,
  loadDraftMediaAssetsFallback,
  loadDraftVideoJobsFallback,
  persistDraftMediaAssetsFallback,
  persistDraftVideoJobsFallback,
  retryVideoEditJob,
  uploadDraftMediaFile,
  type DraftMediaAsset,
  type VideoEditJob,
  type VideoEditJobStatus,
} from "@/lib/ui/video-workflow";
import { platformLabel } from "@/lib/ui/format";

const jobStatusLabel: Record<VideoEditJobStatus, string> = {
  pending: "待处理",
  queued: "已排队",
  preparing: "准备中",
  running: "执行中",
  succeeded: "已完成",
  failed_retryable: "失败，可重试",
  failed_manual: "失败，需人工处理",
  cancelled: "已取消",
};

const jobStatusTone: Record<VideoEditJobStatus, string> = {
  pending: "border-[#cbd5e1] bg-[#f8fafc] text-[#475569]",
  queued: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
  preparing: "border-[#ddd6fe] bg-[#f5f3ff] text-[#6d28d9]",
  running: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
  succeeded: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
  failed_retryable: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
  failed_manual: "border-[#fecdd3] bg-[#fff1f2] text-[#be123c]",
  cancelled: "border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]",
};

function variantTypeLabel(variantType: ContentVariantDto["variantType"]) {
  return variantType === "video_script" ? "视频脚本" : "图文笔记";
}

function defaultInstructionText(variant: ContentVariantDto) {
  const title = variant.title?.trim();
  if (title) {
    return `请基于「${title}」生成 2 分钟以内的视频成片，并保留口播节奏。`;
  }

  return "请基于当前视频脚本生成 2 分钟以内的视频成片。";
}

function upsertJob(items: VideoEditJob[], nextItem: VideoEditJob) {
  const others = items.filter((item) => item.id !== nextItem.id);
  return [nextItem, ...others];
}

function prependAssets(items: DraftMediaAsset[], nextItems: DraftMediaAsset[]) {
  const seen = new Set<string>();
  return [...nextItems, ...items].filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function isRelatedJob(job: VideoEditJob, draftId: string, variantIds: string[]) {
  const sameDraft = job.draftId === draftId;
  const sameVariant = job.contentVariantId
    ? variantIds.includes(job.contentVariantId)
    : false;

  return sameDraft || sameVariant;
}

function findInFlightJobForVariant(jobs: VideoEditJob[], variantId: string) {
  return jobs.find(
    (job) => job.contentVariantId === variantId && isVideoEditJobInFlightStatus(job.status),
  );
}

function pickBetterAssets(primary: DraftMediaAsset[], secondary: DraftMediaAsset[]) {
  const primaryHasPreview = primary.some((asset) => Boolean(asset.signedPreviewUrl));
  const secondaryHasPreview = secondary.some((asset) => Boolean(asset.signedPreviewUrl));

  if (primaryHasPreview || (primary.length > 0 && !secondaryHasPreview)) {
    return primary;
  }

  if (secondary.length > 0) {
    return secondary;
  }

  return primary;
}

function mergeJobData(primary: VideoEditJob, secondary?: VideoEditJob) {
  if (!secondary) {
    return primary;
  }

  return {
    ...secondary,
    ...primary,
    resultAssets: pickBetterAssets(primary.resultAssets, secondary.resultAssets),
  } satisfies VideoEditJob;
}

function mergeJobCollections(params: {
  listedJobs?: VideoEditJob[];
  fallbackJobs?: VideoEditJob[];
  detailedJobs?: VideoEditJob[];
}) {
  const fallbackJobs = params.fallbackJobs ?? [];
  const listedJobs = params.listedJobs ?? [];
  const detailedJobs = params.detailedJobs ?? [];
  const mergedMap = new Map<string, VideoEditJob>();

  for (const job of fallbackJobs) {
    mergedMap.set(job.id, job);
  }

  for (const job of listedJobs) {
    mergedMap.set(job.id, mergeJobData(job, mergedMap.get(job.id)));
  }

  for (const job of detailedJobs) {
    mergedMap.set(job.id, mergeJobData(job, mergedMap.get(job.id)));
  }

  const orderedIds = [
    ...listedJobs.map((job) => job.id),
    ...fallbackJobs.map((job) => job.id),
  ];
  const uniqueOrderedIds = orderedIds.filter((id, index) => orderedIds.indexOf(id) === index);

  return uniqueOrderedIds
    .map((id) => mergedMap.get(id))
    .filter((job): job is VideoEditJob => Boolean(job));
}

function needsJobDetailHydration(job: VideoEditJob) {
  if (job.resultAssets.length === 0) {
    return true;
  }

  return job.resultAssets.some((asset) => !asset.signedPreviewUrl);
}

function CompactProgressModules({ modules }: { modules: VideoEditProgressModuleDto[] }) {
  return (
    <div className="mt-3 grid gap-2">
      {modules.map((module) => (
        <div key={module.key} className="grid gap-1">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-[#475569]">{module.label}</span>
            <span className={getCompactModuleTextClass(module.status)}>
              {compactProgressModuleStatusLabel[module.status]}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
            <div
              className={`h-full rounded-full ${getCompactModuleBarClass(module.status)}`}
              style={{ width: `${module.progressPct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

const compactProgressModuleStatusLabel: Record<VideoEditProgressModuleDto["status"], string> = {
  pending: "等待",
  running: "处理中",
  succeeded: "完成",
  failed: "失败",
  skipped: "跳过",
};

function getCompactModuleTextClass(status: VideoEditProgressModuleDto["status"]) {
  if (status === "running") {
    return "shrink-0 text-[#1d4ed8]";
  }
  if (status === "succeeded") {
    return "shrink-0 text-[#166534]";
  }
  if (status === "failed") {
    return "shrink-0 text-[#be123c]";
  }

  return "shrink-0 text-[#64748b]";
}

function getCompactModuleBarClass(status: VideoEditProgressModuleDto["status"]) {
  if (status === "running") {
    return "bg-[#2563eb]";
  }
  if (status === "succeeded") {
    return "bg-[#16a34a]";
  }
  if (status === "failed") {
    return "bg-[#e11d48]";
  }

  return "bg-[#94a3b8]";
}

export function DraftVideoPanels({
  draftId,
  variants,
  selectedVariantId,
  onSelectVariant,
}: {
  draftId: string;
  variants: ContentVariantDto[];
  selectedVariantId: string;
  onSelectVariant: (variantId: string) => void;
}) {
  const variantIdsKey = variants.map((variant) => variant.id).join("|");

  return (
    <DraftVideoPanelsContent
      key={`${draftId}:${variantIdsKey}`}
      draftId={draftId}
      variants={variants}
      variantIdsKey={variantIdsKey}
      selectedVariantId={selectedVariantId}
      onSelectVariant={onSelectVariant}
    />
  );
}

function DraftVideoPanelsContent({
  draftId,
  variants,
  variantIdsKey,
  selectedVariantId,
  onSelectVariant,
}: {
  draftId: string;
  variants: ContentVariantDto[];
  variantIdsKey: string;
  selectedVariantId: string;
  onSelectVariant: (variantId: string) => void;
}) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [assets, setAssets] = useState<DraftMediaAsset[]>(() => loadDraftMediaAssetsFallback(draftId));
  const [fileInputKey, setFileInputKey] = useState(0);
  const [instructionText, setInstructionText] = useState("");
  const [jobs, setJobs] = useState<VideoEditJob[]>(() =>
    loadDraftVideoJobsFallback(draftId).filter((job) =>
      isRelatedJob(job, draftId, variantIdsKey ? variantIdsKey.split("|") : []),
    ),
  );
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [jobsHint, setJobsHint] = useState<string | null>(null);
  const [isRefreshingJobs, setIsRefreshingJobs] = useState(false);
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const [activeApprovalVariantId, setActiveApprovalVariantId] = useState<string | null>(null);
  const [approvedVariantIds, setApprovedVariantIds] = useState<string[]>(() =>
    variants.filter((variant) => variant.reviewStatus === "approved").map((variant) => variant.id),
  );
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId) ?? variants[0];
  const videoVariants = variants.filter((variant) => variant.variantType === "video_script");
  const hasActiveJobs = jobs.some((job) =>
    ["pending", "queued", "preparing", "running"].includes(job.status),
  );
  const isVariantApproved = useCallback(
    (variant: ContentVariantDto) =>
      variant.reviewStatus === "approved" || approvedVariantIds.includes(variant.id),
    [approvedVariantIds],
  );

  const refreshJobs = useCallback(async (silent = false) => {
    const variantIds = variantIdsKey ? variantIdsKey.split("|") : [];

    if (!silent) {
      setIsRefreshingJobs(true);
    }
    try {
      const fallbackJobs = loadDraftVideoJobsFallback(draftId).filter((job) =>
        isRelatedJob(job, draftId, variantIds),
      );
      const listedJobs = (await listVideoEditJobs()).filter((job) =>
        isRelatedJob(job, draftId, variantIds),
      );
      const jobsNeedingDetail = mergeJobCollections({
        listedJobs,
        fallbackJobs,
      }).filter(needsJobDetailHydration);

      const detailResults = await Promise.allSettled(
        jobsNeedingDetail.map(async (job) => getVideoEditJobDetail(job.id)),
      );
      const detailedJobs = detailResults
        .map((result) => (result.status === "fulfilled" ? result.value : null))
        .filter((job): job is VideoEditJob => Boolean(job));

      setJobs(
        mergeJobCollections({
          listedJobs,
          fallbackJobs,
          detailedJobs,
        }),
      );
      setJobsError(null);
      if (!silent) {
        setJobsHint("任务状态已刷新。");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "视频任务接口暂时不可用。";
      setJobsError(message);
      if (!silent) {
        setJobsHint(null);
      }
    } finally {
      if (!silent) {
        setIsRefreshingJobs(false);
      }
    }
  }, [draftId, variantIdsKey]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshJobs();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [refreshJobs]);

  useEffect(() => {
    persistDraftMediaAssetsFallback(draftId, assets);
  }, [assets, draftId]);

  useEffect(() => {
    persistDraftVideoJobsFallback(draftId, jobs);
  }, [draftId, jobs]);

  useEffect(() => {
    if (!hasActiveJobs) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshJobs(true);
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasActiveJobs, refreshJobs]);
  const instructionValue =
    instructionText || (selectedVariant.variantType === "video_script"
      ? defaultInstructionText(selectedVariant)
      : "");

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedFiles.length === 0) {
      setUploadError("请先选择至少一个图片或视频素材。");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadMessage(null);
    setUploadProgress({});

    const uploadedAssets: DraftMediaAsset[] = [];
    const failedFiles: string[] = [];

    for (const file of selectedFiles) {
      try {
        const asset = await uploadDraftMediaFile({
          draftId,
          file,
          onProgress(progress) {
            setUploadProgress((current) => ({
              ...current,
              [file.name]: progress.percent,
            }));
          },
        });
        uploadedAssets.push(asset);
      } catch (error) {
        const message = error instanceof Error ? error.message : "素材上传失败。";
        failedFiles.push(`${file.name}：${message}`);
      }
    }

    if (uploadedAssets.length > 0) {
      setAssets((current) => prependAssets(current, uploadedAssets));
      setUploadMessage(
        `已归档 ${uploadedAssets.length} 个素材到 content_draft 级别资产，并写入当前浏览器的临时恢复缓存。`,
      );
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setFileInputKey((current) => current + 1);
    }

    if (failedFiles.length > 0) {
      setUploadError(failedFiles.join("；"));
    }

    setIsUploading(false);
  }

  async function handleCreateJob(variant: ContentVariantDto) {
    if (!isVariantApproved(variant)) {
      setJobsError("请先确认脚本，再创建正式视频任务。");
      return;
    }
    const existingJob = findInFlightJobForVariant(jobs, variant.id);

    if (existingJob) {
      setJobsHint(`「${variant.title ?? `版本 ${variant.versionNo}`}」已有视频任务正在进行中。`);
      return;
    }

    setActiveVariantId(variant.id);
    setJobsError(null);
    setJobsHint(null);

    try {
      const nextJob = await createVideoEditJob({
        draftId,
        contentVariantId: variant.id,
        instructionText: instructionText.trim() || defaultInstructionText(variant),
      });
      setJobs((current) => upsertJob(current, nextJob));
      setJobsHint(`已为「${variant.title ?? `版本 ${variant.versionNo}`}」创建视频任务。`);
      void refreshJobs(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建视频任务失败。";
      setJobsError(message);
    } finally {
      setActiveVariantId(null);
    }
  }

  async function handleApproveVariant(variant: ContentVariantDto) {
    setActiveApprovalVariantId(variant.id);
    setJobsError(null);
    setJobsHint(null);

    try {
      const response = await fetch(`/api/content/variants/${variant.id}/approve`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        variant?: ContentVariantDto;
        error?: { message?: string };
      };

      if (!response.ok || !payload.variant) {
        throw new Error(payload.error?.message ?? "脚本确认失败。");
      }

      setApprovedVariantIds((current) =>
        current.includes(payload.variant!.id) ? current : [...current, payload.variant!.id],
      );
      setJobsHint(`已确认「${payload.variant.title ?? `版本 ${payload.variant.versionNo}`}」。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "脚本确认失败。";
      setJobsError(message);
    } finally {
      setActiveApprovalVariantId(null);
    }
  }

  async function handleRetry(jobId: string) {
    setActiveJobId(jobId);
    setJobsError(null);
    setJobsHint(null);

    try {
      const nextJob = await retryVideoEditJob(jobId);
      if (nextJob) {
        setJobs((current) => upsertJob(current, nextJob));
      }
      setJobsHint("已重新提交视频任务。");
      void refreshJobs(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "重试视频任务失败。";
      setJobsError(message);
    } finally {
      setActiveJobId(null);
    }
  }

  async function handleCancel(jobId: string) {
    setActiveJobId(jobId);
    setJobsError(null);
    setJobsHint(null);

    try {
      const nextJob = await cancelVideoEditJob(jobId);
      if (nextJob) {
        setJobs((current) => upsertJob(current, nextJob));
      }
      setJobsHint("已发送取消请求。");
      void refreshJobs(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "取消视频任务失败。";
      setJobsError(message);
    } finally {
      setActiveJobId(null);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-[#dde3ea] pb-4">
          <div>
            <h2 className="text-base font-semibold">素材上传</h2>
            <p className="mt-1 text-sm text-[#5d6b7a]">
              先向 `/api/media/upload-intents` 领临时凭证，再直传 OSS，最后通过 `/api/media/complete`
              归档到 `content_draft` 资产。
            </p>
          </div>
          <Badge className="rounded-md border-[#cbd5e1] bg-[#f8fafc] text-[#475569]">
            归档层级：content_draft
          </Badge>
        </div>

        <form className="mt-4 grid gap-4" onSubmit={handleUpload}>
          <div className="grid gap-2">
            <Label htmlFor="draft-media-upload">选择素材</Label>
            <input
              key={fileInputKey}
              ref={fileInputRef}
              id="draft-media-upload"
              type="file"
              multiple
              accept="image/*,video/*"
              className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none file:mr-3 file:rounded-md file:border-0 file:bg-[#eff6ff] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#1d4ed8] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              onChange={(event) => {
                setSelectedFiles(Array.from(event.target.files ?? []));
                setUploadError(null);
                setUploadMessage(null);
              }}
            />
          </div>

          {selectedFiles.length > 0 ? (
            <div className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-3">
              <p className="text-sm font-medium text-[#17202a]">待上传素材</p>
              <div className="mt-3 grid gap-2">
                {selectedFiles.map((file) => {
                  const progress = uploadProgress[file.name];

                  return (
                    <div
                      key={`${file.name}-${file.size}`}
                      className="rounded-md border border-[#dde3ea] bg-white px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-medium text-[#17202a]">{file.name}</span>
                        <span className="text-[#5d6b7a]">{formatAssetSize(file.size)}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
                        <div
                          className="h-full rounded-full bg-[#2563eb] transition-[width]"
                          style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {uploadMessage ? (
            <p className="rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-sm text-[#166534]">
              {uploadMessage}
            </p>
          ) : null}
          {uploadError ? (
            <p className="rounded-md border border-[#fecdd3] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c]">
              {uploadError}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="submit"
              className="h-10 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
              disabled={isUploading}
            >
              {isUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              开始上传
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-md"
              onClick={() => {
                setSelectedFiles([]);
                setUploadProgress({});
                setUploadError(null);
                setUploadMessage(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
                setFileInputKey((current) => current + 1);
              }}
            >
              清空待上传
            </Button>
          </div>
        </form>

        <div className="mt-5">
          <p className="text-sm font-medium text-[#17202a]">当前 draft 已归档素材</p>
          <p className="mt-2 rounded-md border border-[#dde3ea] bg-[#f8fafc] px-3 py-2 text-sm text-[#5d6b7a]">
            当前阶段后端还没有开放 draft 级资产列表接口，所以这里会优先恢复这个浏览器里最近成功归档到
            `content_draft` 的素材缓存，避免刷新页面后空列表。
          </p>
          {assets.length > 0 ? (
            <div className="mt-3 grid gap-3">
              {assets.map((asset) => (
                <div key={asset.id} className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-md border-[#cbd5e1] bg-white text-[#475569]">
                      {asset.assetType}
                    </Badge>
                    <Badge className="rounded-md border-[#cbd5e1] bg-white text-[#475569]">
                      {formatAssetSize(asset.fileSizeBytes)}
                    </Badge>
                  </div>
                  <p className="mt-2 break-all text-sm text-[#17202a]">{asset.storageKey}</p>
                  <p className="mt-1 text-xs text-[#5d6b7a]">
                    bucket: {asset.bucketName || "待后端补充"} / provider: {asset.storageProvider}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-md border border-dashed border-[#cbd5e1] px-3 py-3 text-sm text-[#5d6b7a]">
              还没有可恢复的已归档素材。等 A 分支补上 draft 资产列表接口后，这里应切到服务端真实列表，而不是继续只依赖本地缓存。
            </p>
          )}
        </div>
      </section>

      <section className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-[#dde3ea] pb-4">
          <div>
            <h2 className="text-base font-semibold">视频生成与任务状态</h2>
            <p className="mt-1 text-sm text-[#5d6b7a]">
              只在 `video_script` 版本上开放“生成视频”。结果预览直接消费后端返回的签名 URL，不在前端拼对象存储地址。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-md"
            onClick={() => void refreshJobs()}
            disabled={isRefreshingJobs}
          >
            {isRefreshingJobs ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            刷新任务
          </Button>
        </div>

        {videoVariants.length > 0 ? (
          <>
            <div className="mt-4 grid gap-3">
              {variants.map((variant) => {
                const isSelected = variant.id === selectedVariantId;
                const isVideoVariant = variant.variantType === "video_script";
                const isApproved = isVariantApproved(variant);
                const inFlightJob = findInFlightJobForVariant(jobs, variant.id);

                return (
                  <div
                    key={variant.id}
                    className={`rounded-md border p-4 transition-colors ${
                      isSelected
                        ? "border-[#2563eb] bg-[#eff6ff]"
                        : "border-[#dde3ea] bg-[#f8fafc]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-md border-[#bfdbfe] bg-white text-[#1d4ed8]">
                        {platformLabel[variant.platform]}
                      </Badge>
                      <Badge className="rounded-md border-[#cbd5e1] bg-white text-[#475569]">
                        {variantTypeLabel(variant.variantType)}
                      </Badge>
                      <Badge className="rounded-md border-[#cbd5e1] bg-white text-[#475569]">
                        v{variant.versionNo}
                      </Badge>
                      {isApproved ? (
                        <Badge className="rounded-md border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]">
                          已确认
                        </Badge>
                      ) : (
                        <Badge className="rounded-md border-[#fde68a] bg-[#fffbeb] text-[#92400e]">
                          待确认
                        </Badge>
                      )}
                    </div>
                    <p className="mt-3 text-sm font-medium text-[#17202a]">
                      {variant.title ?? `版本 ${variant.versionNo}`}
                    </p>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#5d6b7a]">
                      {variant.scriptText ?? variant.bodyText ?? "当前版本暂无正文。"}
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <Button
                        type="button"
                        variant={isSelected ? "secondary" : "outline"}
                        className="h-10 rounded-md"
                        onClick={() => onSelectVariant(variant.id)}
                      >
                        编辑此版本
                      </Button>
                      {isVideoVariant ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 rounded-md"
                            onClick={() => void handleApproveVariant(variant)}
                            disabled={isApproved || activeApprovalVariantId === variant.id}
                          >
                            {activeApprovalVariantId === variant.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-4" />
                            )}
                            {isApproved ? "已确认" : "确认脚本"}
                          </Button>
                          <Button
                            type="button"
                            className="h-10 rounded-md bg-[#0f766e] text-white hover:bg-[#115e59]"
                            onClick={() => void handleCreateJob(variant)}
                            disabled={!isApproved || Boolean(inFlightJob) || activeVariantId === variant.id}
                          >
                            {activeVariantId === variant.id || inFlightJob ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Clapperboard className="size-4" />
                            )}
                            {inFlightJob ? "生成中" : isApproved ? "生成视频" : "待确认"}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 grid gap-2">
              <Label htmlFor="video-instruction">补充执行说明</Label>
              <Textarea
                id="video-instruction"
                value={instructionValue}
                onChange={(event) => setInstructionText(event.target.value)}
                className="min-h-24"
                placeholder="可选。比如补充镜头节奏、字幕风格、BGM 或时长要求。"
              />
            </div>
          </>
        ) : (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 py-3 text-sm text-[#92400e]">
            <CircleAlert className="mt-0.5 size-4" aria-hidden="true" />
            当前草稿只有图文版本，先不展示视频生成入口。
          </div>
        )}

        {jobsHint ? (
          <p className="mt-5 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-sm text-[#166534]">
            {jobsHint}
          </p>
        ) : null}
        {jobsError ? (
          <p className="mt-5 rounded-md border border-[#fecdd3] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c]">
            {jobsError}
          </p>
        ) : null}

        <div className="mt-5 grid gap-4">
          {jobs.length > 0 ? (
            jobs.map((job) => {
              const linkedVariant = variants.find((variant) => variant.id === job.contentVariantId);
              const canRetry = job.status === "failed_retryable";
              const canCancel = ["pending", "queued", "preparing", "running"].includes(job.status);

              return (
                <div key={job.id} className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={`rounded-md ${jobStatusTone[job.status]}`}>
                          {job.status === "running" ? <Loader2 className="size-3 animate-spin" /> : null}
                          {jobStatusLabel[job.status]}
                        </Badge>
                        {linkedVariant ? (
                          <Badge className="rounded-md border-[#cbd5e1] bg-white text-[#475569]">
                            {linkedVariant.title ?? `版本 ${linkedVariant.versionNo}`}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm text-[#17202a]">
                        当前阶段：{getVideoJobStageLabel(job.currentStage, job.status)}
                      </p>
                      <p className="mt-1 text-sm text-[#17202a]">
                        整体进度：{job.progressPct ?? 0}
                        %
                      </p>
                      {job.progressModules.length > 0 ? (
                        <CompactProgressModules modules={job.progressModules} />
                      ) : null}
                      {job.failureReason ? (
                        <p className="mt-2 rounded-md border border-[#fecdd3] bg-white px-3 py-2 text-sm text-[#be123c]">
                          {job.failureReason}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      {canRetry ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 rounded-md"
                          onClick={() => void handleRetry(job.id)}
                          disabled={activeJobId === job.id}
                        >
                          {activeJobId === job.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <RotateCcw className="size-4" />
                          )}
                          重试
                        </Button>
                      ) : null}
                      {canCancel ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 rounded-md"
                          onClick={() => void handleCancel(job.id)}
                          disabled={activeJobId === job.id}
                        >
                          {activeJobId === job.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <XCircle className="size-4" />
                          )}
                          取消
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {job.resultAssets.length > 0 ? (
                      job.resultAssets.map((asset) => {
                        const isVideo = asset.assetType === "video";
                        const previewUrl = asset.signedPreviewUrl;
                        const downloadUrl = asset.signedDownloadUrl ?? previewUrl;

                        return (
                          <div key={asset.id} className="rounded-md border border-[#dde3ea] bg-white p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className="rounded-md border-[#cbd5e1] bg-[#f8fafc] text-[#475569]">
                                {asset.assetType}
                              </Badge>
                              <Badge className="rounded-md border-[#cbd5e1] bg-[#f8fafc] text-[#475569]">
                                {formatAssetSize(asset.fileSizeBytes)}
                              </Badge>
                            </div>
                            {previewUrl ? (
                              <div className="mt-3 overflow-hidden rounded-md border border-[#dde3ea] bg-[#0f172a]">
                                {isVideo ? (
                                  <video
                                    className="h-auto w-full"
                                    controls
                                    preload="metadata"
                                    src={previewUrl}
                                  />
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={previewUrl}
                                    alt={asset.storageKey}
                                    className="h-auto w-full object-cover"
                                  />
                                )}
                              </div>
                            ) : (
                              <p className="mt-3 rounded-md border border-dashed border-[#cbd5e1] px-3 py-3 text-sm text-[#5d6b7a]">
                                后端尚未返回签名预览 URL，当前先保留资产记录。
                              </p>
                            )}
                            {isVideo && downloadUrl ? (
                              <a
                                href={downloadUrl}
                                className="mt-3 inline-flex items-center gap-2 rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-3 py-2 text-sm font-medium text-[#334155] hover:bg-[#eef2f7]"
                              >
                                <Download className="size-4" aria-hidden="true" />
                                下载成片
                              </a>
                            ) : null}
                            <p className="mt-3 break-all text-xs text-[#5d6b7a]">{asset.storageKey}</p>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex items-start gap-2 rounded-md border border-dashed border-[#cbd5e1] px-3 py-3 text-sm text-[#5d6b7a]">
                        {job.status === "succeeded" ? (
                          <ImageIcon className="mt-0.5 size-4" aria-hidden="true" />
                        ) : (
                          <Video className="mt-0.5 size-4" aria-hidden="true" />
                        )}
                        暂无结果资产。任务完成后这里会直接展示后端签名 URL 对应的成片、封面或字幕文件。
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-md border border-dashed border-[#cbd5e1] px-3 py-4 text-sm text-[#5d6b7a]">
              还没有视频任务。等 A 分支接口稳定后，这里会直接展示 `/api/video-edit-jobs` 返回的任务状态与结果资产。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
