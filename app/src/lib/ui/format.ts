import type { ImportJobStatus, ImportType, Platform } from "@/contracts/import";

export const platformLabel: Record<Platform, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
};

export const importTypeLabel: Record<ImportType, string> = {
  detail: "单条内容",
  creator: "博主主页",
  comments: "评论补抓",
};

export const statusLabel: Record<ImportJobStatus, string> = {
  pending: "等待导入",
  running: "正在导入",
  succeeded: "导入成功",
  partial: "部分成功",
  failed: "导入失败",
};

export function getMetric(metrics: Record<string, unknown>, key: string) {
  const value = metrics[key];
  return typeof value === "number" ? value.toLocaleString("zh-CN") : "0";
}

export function getQualityWarning(title?: string | null, body?: string | null, script?: string | null) {
  if (title && (body || script)) {
    return null;
  }

  return "这条内容导入不完整。建议重新复制平台页面里的完整链接后再试。";
}
