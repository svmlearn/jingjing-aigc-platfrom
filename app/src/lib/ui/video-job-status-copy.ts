import type { VideoEditJobStatus } from "@/lib/ui/video-workflow";

export type VideoJobStatusCopyTone = "info" | "success" | "warning" | "danger";

export type VideoJobStatusCopyInput = {
  status: VideoEditJobStatus;
  currentStage?: string | null;
  progressPct?: number | null;
  failureReason?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  now?: string;
  hasResultPreview: boolean;
};

export type VideoJobStatusCopy = {
  tone: VideoJobStatusCopyTone;
  title: string;
  detail: string;
  nextAction?: string;
  badge?: string;
};

const staleRunningThresholdMs = 15 * 60 * 1000;

export function buildVideoJobStatusCopy(input: VideoJobStatusCopyInput): VideoJobStatusCopy {
  const idleMs = getIdleMs(input);
  const stageLabel = formatVideoJobStage(input.currentStage);

  if (isActiveStatus(input.status) && idleMs !== null && idleMs >= staleRunningThresholdMs) {
    return {
      tone: "warning",
      title: "任务可能卡住了",
      detail: `已经 ${formatMinutes(idleMs)} 没有新进展，当前停在「${stageLabel}」。`,
      nextAction: "请联系运营或技术同学检查后台视频服务；服务恢复后可以继续等待，或取消后重新创建任务。",
      badge: "需要检查",
    };
  }

  if (input.status === "failed_retryable") {
    return {
      tone: "warning",
      title: "任务失败，可以重试",
      detail: `失败位置：${describeFailure(input)}。`,
      nextAction: "先确认素材和网络正常，再点击「重试任务」。如果连续失败，请把这条任务交给运营或技术同学排查。",
      badge: "可重试",
    };
  }

  if (input.status === "failed_manual") {
    return {
      tone: "danger",
      title: "任务失败，需要人工处理",
      detail: `失败位置：${describeFailure(input)}。`,
      nextAction: "请先检查脚本是否已确认、素材是否可用、镜头要求是否清楚。修正后重新创建任务。",
      badge: "需处理",
    };
  }

  if (input.status === "cancelled") {
    return {
      tone: "info",
      title: "任务已取消",
      detail: "这条视频任务不会继续生成。",
      nextAction: "需要继续制作时，可以重新创建一条 AI 剪辑任务。",
      badge: "已取消",
    };
  }

  if (input.status === "succeeded") {
    if (!input.hasResultPreview) {
      return {
        tone: "warning",
        title: "任务完成，但没有可预览成片",
        detail: "后台已标记完成，但页面没有拿到可播放的视频文件。",
        nextAction: "请刷新页面再看一次；如果仍然没有预览，请联系运营或技术同学检查成片回写和预览地址。",
        badge: "缺少预览",
      };
    }

    return {
      tone: "success",
      title: "成片已生成",
      detail: "可以在下方预览视频。需要调整字幕、节奏或封面时，点击「制作修订」。",
      badge: "已完成",
    };
  }

  return {
    tone: "info",
    title: formatActiveTitle(input.status),
    detail: `当前进度 ${input.progressPct ?? 0}%，正在处理「${stageLabel}」。`,
    nextAction: "保持页面打开即可；如果长时间没有变化，系统会提示你检查后台服务。",
    badge: "处理中",
  };
}

function isActiveStatus(status: VideoEditJobStatus) {
  return status === "pending" || status === "queued" || status === "preparing" || status === "running";
}

function formatActiveTitle(status: VideoEditJobStatus) {
  if (status === "pending") {
    return "等待开始制作";
  }

  if (status === "queued") {
    return "已进入制作队列";
  }

  if (status === "preparing") {
    return "正在准备素材";
  }

  return "正在生成视频";
}

function formatVideoJobStage(stage?: string | null) {
  if (!stage) {
    return "等待调度";
  }

  const normalized = stage.toLowerCase();

  if (normalized.includes("pending") || normalized.includes("queued") || normalized.includes("claim")) {
    return "等待视频服务接单";
  }

  if (normalized.includes("input") || normalized.includes("download") || normalized.includes("preparing")) {
    return "准备素材";
  }

  if (normalized.includes("render") || normalized.includes("openstoryline")) {
    return "生成视频";
  }

  if (normalized.includes("upload")) {
    return "保存成片";
  }

  if (normalized.includes("asset") || normalized.includes("result")) {
    return "写入成片记录";
  }

  if (normalized.includes("completed") || normalized.includes("succeeded")) {
    return "制作完成";
  }

  return stage.replaceAll("_", " ");
}

function describeFailure(input: VideoJobStatusCopyInput) {
  const source = `${input.currentStage ?? ""} ${input.failureReason ?? ""}`.toLowerCase();

  if (source.includes("input") || source.includes("download")) {
    return "素材读取失败";
  }

  if (source.includes("openstoryline") || source.includes("render")) {
    return "视频生成失败";
  }

  if (source.includes("upload")) {
    return "成片上传失败";
  }

  if (source.includes("asset") || source.includes("result")) {
    return "成片记录保存失败";
  }

  return formatVideoJobStage(input.currentStage);
}

function getIdleMs(input: VideoJobStatusCopyInput) {
  const activityAt = Date.parse(input.updatedAt ?? input.createdAt ?? "");
  const now = Date.parse(input.now ?? new Date().toISOString());

  if (!Number.isFinite(activityAt) || !Number.isFinite(now)) {
    return null;
  }

  return Math.max(0, now - activityAt);
}

function formatMinutes(ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  return `${minutes} 分钟`;
}
