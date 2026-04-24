"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, FileText, Search, Video } from "lucide-react";

import type { ContentDraftBundleDto } from "@/contracts/draft";
import type { VideoEditJobDto } from "@/contracts/video";
import { cn } from "@/lib/utils";

type HistoryRecord = {
  id: string;
  type: "article" | "video_script" | "video_job";
  title: string;
  status: string;
  summary: string;
  createdAt: string;
  detail: ContentDraftBundleDto | VideoEditJobDto;
};

export function HistoryHub() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<HistoryRecord["type"] | "all">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/history/records", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        draftBundles?: ContentDraftBundleDto[];
        videoJobs?: VideoEditJobDto[];
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(data.error?.message ?? "历史记录加载失败");
      }

      const nextRecords = buildHistoryRecords(data.draftBundles ?? [], data.videoJobs ?? []);
      setRecords(nextRecords);
      if (nextRecords[0]) {
        setSelectedId(nextRecords[0].id);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "历史记录加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory();
  }, []);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return records.filter((record) => {
      const typeMatched = filterType === "all" || record.type === filterType;
      const queryMatched =
        !normalizedQuery ||
        [record.title, record.summary, record.status].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        );

      return typeMatched && queryMatched;
    });
  }, [filterType, query, records]);

  const selectedRecord =
    filteredRecords.find((record) => record.id === selectedId) ?? filteredRecords[0] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-6">
        <h1 className="text-xl tracking-tight [font-family:var(--font-cormorant)]">我的内容</h1>
      </div>

      {error ? (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-6 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="w-[360px] shrink-0 border-r border-white/10 bg-[#0a0a0a] p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              ["all", "全部"],
              ["article", "图文"],
              ["video_script", "脚本"],
              ["video_job", "视频任务"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilterType(value as HistoryRecord["type"] | "all")}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs",
                  filterType === value
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                    : "border-white/10 bg-white/5 text-white/60",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search archive..."
              className="h-10 w-full rounded-xl border border-white/10 bg-[#050505] pl-11 pr-4 text-xs text-white outline-none placeholder:text-white/25 focus:border-amber-500/50"
            />
          </div>

          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-white/40">正在读取历史记录...</div>
          ) : (
            <div className="space-y-3 overflow-y-auto">
              {filteredRecords.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => setSelectedId(record.id)}
                  className={cn(
                    "w-full rounded-2xl border p-4 text-left transition-colors",
                    selectedRecord?.id === record.id
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-white/10 bg-white/5 hover:bg-white/10",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-white/10 p-3 text-white/60">
                      {record.type === "article" ? (
                        <FileText className="h-4 w-4" />
                      ) : (
                        <Video className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-white">{record.title}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-white/35">
                        {record.status}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 lg:px-12">
          {selectedRecord ? (
            <div className="mx-auto max-w-4xl space-y-6">
              <section className="rounded-3xl border border-white/10 bg-[#111111] p-6">
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">记录标题</p>
                <h2 className="mt-3 text-3xl text-white [font-family:var(--font-cormorant)]">
                  {selectedRecord.title}
                </h2>
                <p className="mt-3 text-sm text-white/45">{selectedRecord.summary}</p>
                <Link
                  href={`/dashboard/history?record=${encodeURIComponent(selectedRecord.id)}`}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-white/65 transition-colors hover:bg-white/10 hover:text-white"
                >
                  查看详情
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </section>
              <section className="rounded-3xl border border-white/10 bg-[#111111] p-8 text-sm leading-7 text-white/80 whitespace-pre-wrap">
                {renderHistoryDetail(selectedRecord)}
              </section>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-white/40">
              暂无历史记录。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildHistoryRecords(
  draftBundles: ContentDraftBundleDto[],
  videoJobs: VideoEditJobDto[],
): HistoryRecord[] {
  const draftRecords = draftBundles.map((bundle) => ({
    id: `draft:${bundle.draft.id}`,
    type: bundle.selectedVariant?.variantType === "video_script" ? ("video_script" as const) : ("article" as const),
    title: bundle.selectedVariant?.title ?? bundle.draft.workingTitle ?? "内容草稿",
    status: bundle.draft.status,
    summary:
      bundle.selectedVariant?.bodyText?.slice(0, 120) ??
      bundle.selectedVariant?.scriptText?.slice(0, 120) ??
      "内容草稿",
    createdAt: bundle.draft.updatedAt,
    detail: bundle,
  }));
  const videoJobRecords = videoJobs.map((job) => ({
    id: `video-job:${job.id}`,
    type: "video_job" as const,
    title: `视频任务 ${job.id.slice(0, 8)}`,
    status: job.status,
    summary: job.failureReason ?? job.currentStage ?? "视频任务记录",
    createdAt: job.updatedAt,
    detail: job,
  }));

  return [...draftRecords, ...videoJobRecords].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function renderHistoryDetail(record: HistoryRecord) {
  if (record.type === "article" || record.type === "video_script") {
    const bundle = record.detail as ContentDraftBundleDto;
    return (
      bundle.selectedVariant?.bodyText ??
      bundle.selectedVariant?.scriptText ??
      bundle.draft.workingTitle ??
      "暂无详细内容。"
    );
  }

  const job = record.detail as VideoEditJobDto;
  return [
    `状态：${job.status}`,
    `当前阶段：${job.currentStage ?? "等待中"}`,
    `进度：${job.progressPct}%`,
    "",
    `失败原因：${job.failureReason ?? "无"}`,
  ].join("\n");
}
