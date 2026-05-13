import type { PublicVideoEditJobDto, VideoEditJobStatus } from "@/contracts/video";

const videoJobStatusLabels: Record<VideoEditJobStatus, string> = {
  pending: "等待开始",
  queued: "排队处理中",
  preparing: "正在准备素材",
  running: "正在剪辑",
  succeeded: "已生成完成",
  failed_retryable: "生成失败，可重试",
  failed_manual: "生成失败，需要人工处理",
  cancelled: "已取消",
};

const videoJobStageLabels: Record<string, string> = {
  claimed: "剪辑服务已接单",
  downloading_inputs: "正在下载素材",
  openstoryline_rendering: "正在生成视频",
  openstoryline_material_preparation: "正在准备素材",
  openstoryline_material_match: "正在匹配素材",
  openstoryline_voiceover: "正在生成配音",
  openstoryline_subtitles: "正在生成字幕和时间线",
  openstoryline_render: "正在合成渲染",
  uploading_outputs: "正在上传成片",
  completed: "成片已经回写完成",
  input_asset_validation_failed: "素材校验未通过",
  output_validation_failed: "成片校验未通过",
  downloading_inputs_failed: "下载素材失败",
  openstoryline_rendering_failed: "视频生成失败",
  uploading_outputs_failed: "上传成片失败",
  asset_objects_persistence_failed: "成片写回记录失败",
  stale_timeout: "任务等待超时",
  failed: "系统处理失败",
  local_demo_pending_worker: "演示模式等待开始",
  local_demo_claimed: "演示模式已接单",
  local_demo_preparing_inputs: "演示模式准备素材中",
  local_demo_rendering_placeholder: "演示模式生成占位结果中",
  local_demo_completed: "演示模式已完成",
};

export function getVideoJobStatusLabel(status?: VideoEditJobStatus | null) {
  if (!status) {
    return "等待开始";
  }

  return videoJobStatusLabels[status] ?? "处理中";
}

export function getVideoJobStageLabel(stage?: string | null, status?: VideoEditJobStatus | null) {
  if (stage) {
    return videoJobStageLabels[stage] ?? "系统正在处理当前步骤";
  }

  if (!status) {
    return "等待系统调度";
  }

  switch (status) {
    case "pending":
      return "任务已经创建，正在等待剪辑服务接单";
    case "queued":
      return "任务已经进队，马上开始处理";
    case "preparing":
      return "正在整理脚本和素材";
    case "running":
      return "正在生成视频和字幕";
    case "succeeded":
      return "成片已经可查看";
    case "failed_retryable":
      return "可以直接重试这次任务";
    case "failed_manual":
      return "需要先检查脚本或素材";
    case "cancelled":
      return "这次任务已经停止";
    default:
      return "系统正在处理当前步骤";
  }
}

export function getVideoJobAudienceSummary(job: PublicVideoEditJobDto) {
  const statusLabel = getVideoJobStatusLabel(job.status);
  const stageLabel = getVideoJobStageLabel(job.currentStage, job.status);

  if (job.status === "failed_retryable" || job.status === "failed_manual") {
    return job.failureReason?.trim() || `${statusLabel}。`;
  }

  if (job.status === "succeeded") {
    return "这条视频已经生成完成，可以回到工作台查看成片和后续修订。";
  }

  return `${statusLabel}，${stageLabel}。`;
}
