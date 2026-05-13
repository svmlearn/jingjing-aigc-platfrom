"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, CalendarClock, FileText, Search, Video } from "lucide-react";

import type { ContentDraftBundleDto } from "@/contracts/draft";
import type { PublicVideoEditJobDto } from "@/contracts/video";
import { getVideoJobAudienceSummary, getVideoJobStageLabel, getVideoJobStatusLabel } from "@/lib/ui/video-job-display";
import { cn } from "@/lib/utils";

type HistoryFilter = "all" | "article" | "video";

type BaseHistoryRecord = {
  id: string;
  type: Exclude<HistoryFilter, "all">;
  title: string;
  statusLabel: string;
  summary: string;
  searchText: string;
  createdAt: string;
};

type ArticleHistoryRecord = BaseHistoryRecord & {
  type: "article";
  draftBundle: ContentDraftBundleDto;
};

type VideoHistoryRecord = BaseHistoryRecord & {
  type: "video";
  draftBundle: ContentDraftBundleDto | null;
  jobs: PublicVideoEditJobDto[];
  latestJob: PublicVideoEditJobDto | null;
};

type HistoryRecord = ArticleHistoryRecord | VideoHistoryRecord;

export function HistoryHub() {
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<HistoryFilter>("all");
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
        videoJobs?: PublicVideoEditJobDto[];
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(data.error?.message ?? "历史记录加载失败");
      }

      setRecords(buildHistoryRecords(data.draftBundles ?? [], data.videoJobs ?? []));
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

  useEffect(() => {
    if (records.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(null);
      return;
    }

    const requestedRecord = searchParams.get("record");
    const resolvedId = resolveHistoryRecordId(records, requestedRecord);
    if (resolvedId) {
      setSelectedId(resolvedId);
      return;
    }

    setSelectedId((current) => (records.some((record) => record.id === current) ? current : records[0]?.id ?? null));
  }, [records, searchParams]);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return records.filter((record) => {
      const typeMatched = filterType === "all" || record.type === filterType;
      const queryMatched = !normalizedQuery || record.searchText.includes(normalizedQuery);

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
              ["video", "视频"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilterType(value as HistoryFilter)}
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
              placeholder="搜索标题、脚本或状态..."
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
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-white/10 p-3 text-white/60">
                      {record.type === "article" ? (
                        <FileText className="h-4 w-4" />
                      ) : (
                        <Video className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm leading-6 text-white">{record.title}</p>
                      <p className="mt-1 text-[11px] leading-5 text-white/55">
                        {formatDateLabel(record.createdAt)}
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/35">
                        {record.statusLabel}
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
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">
                  {selectedRecord.type === "article" ? "图文内容" : "视频内容"}
                </p>
                <h2 className="mt-3 text-3xl text-white [font-family:var(--font-cormorant)]">
                  {selectedRecord.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-white/55">
                  {selectedRecord.summary}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-white/45">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {formatDateTime(selectedRecord.createdAt)}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    {selectedRecord.statusLabel}
                  </span>
                </div>
                {selectedRecord.type === "video" ? (
                  <Link
                    href={buildVideoWorkbenchHref(selectedRecord)}
                    className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-white/65 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    回到视频工作台
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
              </section>

              {selectedRecord.type === "article" ? (
                <section className="rounded-3xl border border-white/10 bg-[#111111] p-8 text-sm leading-7 text-white/80 whitespace-pre-wrap">
                  {selectedRecord.draftBundle.selectedVariant?.bodyText ??
                    selectedRecord.draftBundle.draft.workingTitle ??
                    "暂无详细内容。"}
                </section>
              ) : (
                <VideoHistoryDetail record={selectedRecord} />
              )}
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

function VideoHistoryDetail({ record }: { record: VideoHistoryRecord }) {
  const scriptText =
    record.draftBundle?.selectedVariant?.scriptText ??
    record.draftBundle?.variants.find((variant) => variant.variantType === "video_script")?.scriptText ??
    null;

  return (
    <>
      {scriptText ? (
        <section className="rounded-3xl border border-white/10 bg-[#111111] p-8">
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">脚本内容</p>
          <div className="mt-4 whitespace-pre-wrap text-sm leading-8 text-white/80">
            {scriptText}
          </div>
        </section>
      ) : null}

      {record.latestJob ? (
        <section className="rounded-3xl border border-white/10 bg-[#111111] p-8">
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">当前视频进度</p>
          <div className="mt-4 space-y-4 text-sm leading-7 text-white/80">
            <p>
              <span className="text-white/45">当前状态：</span>
              {getVideoJobStatusLabel(record.latestJob.status)}
            </p>
            <p>
              <span className="text-white/45">当前步骤：</span>
              {getVideoJobStageLabel(record.latestJob.currentStage, record.latestJob.status)}
            </p>
            <p>
              <span className="text-white/45">当前进度：</span>
              {record.latestJob.progressPct}%
            </p>
            <p>
              <span className="text-white/45">给你的解释：</span>
              {getVideoJobAudienceSummary(record.latestJob)}
            </p>
            {record.latestJob.failureReason ? (
              <p>
                <span className="text-white/45">失败原因：</span>
                {record.latestJob.failureReason}
              </p>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-white/10 bg-[#111111] p-8 text-sm leading-7 text-white/75">
          当前已经有视频脚本，但还没有发起正式剪辑任务。
        </section>
      )}

      {record.jobs.length > 1 ? (
        <section className="rounded-3xl border border-white/10 bg-[#111111] p-8">
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">任务记录</p>
          <div className="mt-4 space-y-3">
            {record.jobs.map((job) => (
              <div
                key={job.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75"
              >
                <p>{formatDateTime(job.createdAt)}</p>
                <p className="mt-1 text-white/45">{getVideoJobStatusLabel(job.status)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function buildHistoryRecords(
  draftBundles: ContentDraftBundleDto[],
  videoJobs: PublicVideoEditJobDto[],
): HistoryRecord[] {
  const articleRecords: ArticleHistoryRecord[] = draftBundles
    .filter((bundle) => bundle.selectedVariant?.variantType !== "video_script")
    .map((bundle) => {
      const title = bundle.selectedVariant?.title ?? bundle.draft.workingTitle ?? "图文草稿";
      const summary =
        bundle.selectedVariant?.bodyText?.slice(0, 120) ??
        bundle.draft.workingTitle ??
        "图文草稿";
      const statusLabel = getDraftStatusLabel(bundle.draft.status);

      return {
        id: `article:${bundle.draft.id}`,
        type: "article",
        title,
        statusLabel,
        summary,
        createdAt: bundle.draft.updatedAt,
        searchText: [title, summary, statusLabel].join(" ").toLowerCase(),
        draftBundle: bundle,
      };
    });

  const videoGroups = new Map<
    string,
    {
      draftBundle: ContentDraftBundleDto | null;
      jobs: PublicVideoEditJobDto[];
    }
  >();

  for (const bundle of draftBundles) {
    if (bundle.selectedVariant?.variantType !== "video_script") {
      continue;
    }

    videoGroups.set(bundle.draft.id, {
      draftBundle: bundle,
      jobs: videoGroups.get(bundle.draft.id)?.jobs ?? [],
    });
  }

  for (const job of videoJobs) {
    const key = job.draftId || job.id;
    const current = videoGroups.get(key) ?? {
      draftBundle: null,
      jobs: [],
    };

    current.jobs.push(job);
    videoGroups.set(key, current);
  }

  const videoRecords: VideoHistoryRecord[] = Array.from(videoGroups.entries()).map(([draftId, group]) => {
    const jobs = [...group.jobs].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const latestJob = jobs[0] ?? null;
    const title =
      group.draftBundle?.selectedVariant?.title ??
      group.draftBundle?.draft.workingTitle ??
      `视频内容 · ${formatDateLabel(latestJob?.createdAt ?? group.draftBundle?.draft.updatedAt ?? new Date().toISOString())}`;
    const statusLabel = latestJob
      ? getVideoJobStatusLabel(latestJob.status)
      : group.draftBundle?.selectedVariant?.reviewStatus === "approved"
        ? "脚本已确认，待发起剪辑"
        : "脚本待确认";
    const summary = latestJob
      ? getVideoJobAudienceSummary(latestJob)
      : "这条视频脚本已经生成，可以继续确认脚本并发起剪辑。";
    const createdAt = latestJob?.updatedAt ?? group.draftBundle?.draft.updatedAt ?? new Date().toISOString();
    const scriptText =
      group.draftBundle?.selectedVariant?.scriptText ??
      group.draftBundle?.draft.workingTitle ??
      "";

    return {
      id: `video:${draftId}`,
      type: "video",
      title,
      statusLabel,
      summary,
      createdAt,
      searchText: [title, summary, statusLabel, scriptText].join(" ").toLowerCase(),
      draftBundle: group.draftBundle,
      jobs,
      latestJob,
    };
  });

  return [...articleRecords, ...videoRecords].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function resolveHistoryRecordId(records: HistoryRecord[], requestedRecord: string | null) {
  if (!requestedRecord) {
    return null;
  }

  const direct = records.find((record) => record.id === requestedRecord);
  if (direct) {
    return direct.id;
  }

  if (requestedRecord.startsWith("video-job:")) {
    const jobId = requestedRecord.slice("video-job:".length);
    return (
      records.find(
        (record): record is VideoHistoryRecord =>
          record.type === "video" && record.jobs.some((job) => job.id === jobId),
      )?.id ?? null
    );
  }

  if (requestedRecord.startsWith("draft:")) {
    const draftId = requestedRecord.slice("draft:".length);
    return records.find((record) => getRecordDraftId(record) === draftId)?.id ?? null;
  }

  return null;
}

function getRecordDraftId(record: HistoryRecord) {
  if (record.type === "article") {
    return record.draftBundle.draft.id;
  }

  return record.draftBundle?.draft.id ?? record.latestJob?.draftId ?? null;
}

function buildVideoWorkbenchHref(record: VideoHistoryRecord) {
  const params = new URLSearchParams();
  const draftId = record.draftBundle?.draft.id ?? record.latestJob?.draftId ?? null;
  const variantId =
    record.draftBundle?.selectedVariant?.id ??
    record.draftBundle?.draft.selectedVariantId ??
    record.latestJob?.contentVariantId ??
    null;

  if (draftId) {
    params.set("draftId", draftId);
  }

  if (variantId) {
    params.set("variantId", variantId);
  }

  if (record.latestJob?.id) {
    params.set("jobId", record.latestJob.id);
  }

  const inputSnapshot = asRecord(record.draftBundle?.draft.inputSnapshot);
  const materialContext = asRecord(inputSnapshot.materialContext);
  const sessionId = readString(inputSnapshot, "consultationSessionId", "sessionId");
  const source = readString(inputSnapshot, "source");
  const calendarItemId = readString(inputSnapshot, "calendarItemId");
  const strategyTag = readString(inputSnapshot, "strategyTag");
  const materialId = readString(materialContext, "materialId");
  const materialReferenceId = readString(materialContext, "referenceId");

  if (sessionId) {
    params.set("sessionId", sessionId);
  }
  if (source) {
    params.set("source", source);
  }
  if (calendarItemId) {
    params.set("calendarItemId", calendarItemId);
  }
  if (strategyTag) {
    params.set("strategyTag", strategyTag);
  }
  if (materialId) {
    params.set("materialId", materialId);
  }
  if (materialReferenceId) {
    params.set("materialReferenceId", materialReferenceId);
  }

  return `/dashboard/video?${params.toString()}`;
}

function getDraftStatusLabel(status: ContentDraftBundleDto["draft"]["status"]) {
  switch (status) {
    case "drafting":
      return "编辑中";
    case "review_pending":
      return "待确认";
    case "ready_to_publish":
      return "待发布";
    case "publishing":
      return "发布中";
    case "published":
      return "已发布";
    case "archived":
      return "已归档";
    default:
      return "处理中";
  }
}

function formatDateLabel(value?: string | null) {
  if (!value) {
    return "时间未记录";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "时间未记录";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}
