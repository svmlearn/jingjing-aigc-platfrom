"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  FileText,
  FolderGit2,
  Home,
  ImageIcon,
  Loader2,
  RefreshCw,
  Send,
  Upload,
  UserPlus,
  Video,
  WandSparkles,
} from "lucide-react";

import type {
  DailyArticleContentPackageDto,
  DailyContentTaskDto,
  DailyContentWorkspaceDto,
  DailyVideoScriptPackageDto,
} from "@/contracts/daily-task";
import type { ContentDraftBundleDto, ContentVariantDto } from "@/contracts/draft";
import type { VideoEditJobDto } from "@/contracts/video";
import { summarizeMemberVideoEditState } from "@/lib/member-video-workflow";
import {
  createVideoEditJob,
  getVideoEditJobDetail,
  type VideoEditJob,
  uploadDraftMediaFile,
} from "@/lib/ui/video-workflow";
import { cn } from "@/lib/utils";

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

type MemberTaskPayload = ApiErrorPayload & {
  task?: DailyContentTaskDto;
};

type MemberHistoryPayload = ApiErrorPayload & {
  draftBundles?: ContentDraftBundleDto[];
  videoJobs?: VideoEditJobDto[];
};

const taskFetchHeaders = {
  "Content-Type": "application/json",
};

export function MemberShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const navItems = [
    { href: "/member", label: "项目", icon: Home, active: pathname === "/member" },
    {
      href: "/member/calendar",
      label: "日历",
      icon: CalendarDays,
      active:
        pathname.startsWith("/member/calendar") ||
        pathname.startsWith("/member/article") ||
        pathname.startsWith("/member/video"),
    },
    {
      href: "/member/history",
      label: "内容",
      icon: FolderGit2,
      active: pathname.startsWith("/member/history"),
    },
  ];

  return (
    <div className="min-h-screen bg-[#ece8dc] text-[#171717]">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col border-x border-black/10 bg-[#f7f4ea] shadow-2xl shadow-black/10">
        <header className="sticky top-0 z-20 border-b border-black/10 bg-[#f7f4ea]/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Link href="/member" className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-lg bg-[#161616] text-xs font-bold text-[#f1c15b]">
                AI
              </span>
              <span>
                <span className="block text-sm font-semibold">静境成员端</span>
                <span className="block text-[10px] uppercase tracking-[0.22em] text-black/45">
                  Mobile execution
                </span>
              </span>
            </Link>
            <Link
              href="/member/invite"
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-lg border text-black/55",
                pathname.startsWith("/member/invite")
                  ? "border-[#1f6f68]/40 bg-[#1f6f68]/10 text-[#1f6f68]"
                  : "border-black/10 bg-white/55",
              )}
              aria-label="邀请码加入"
            >
              <UserPlus className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </header>

        <main className="flex-1 pb-24">{children}</main>

        <nav className="fixed bottom-0 left-1/2 z-30 grid w-full max-w-md -translate-x-1/2 grid-cols-3 border-t border-black/10 bg-[#f7f4ea]/95 px-3 py-2 backdrop-blur">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px]",
                item.active ? "bg-[#1f6f68] text-white" : "text-black/55",
              )}
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function MemberProjectIntroPage() {
  const { workspace, loading, error, reload } = useMemberWorkspace();

  if (loading) {
    return <MemberLoading label="正在读取项目介绍" />;
  }

  if (error || !workspace) {
    return <MemberError title="项目介绍暂时不可用" message={error} onRetry={reload} />;
  }

  const project = workspace.project;

  return (
    <div className="space-y-4 px-4 py-5">
      <section className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center gap-2 text-xs text-[#1f6f68]">
          <BriefcaseBusiness className="size-4" aria-hidden="true" />
          当前项目
        </div>
        <h1 className="mt-3 text-2xl font-semibold leading-tight">{project.projectName}</h1>
        <p className="mt-3 text-sm leading-7 text-black/68">{project.summary}</p>
      </section>

      <TextSection title="核心卖点" items={project.coreSellingPoints} />
      <TextSection title="主推户型 / 客群" items={project.promotedLayouts} />
      <TextSection title="公开项目信息" items={project.publicInfo} />

      <section className="rounded-lg border border-[#1f6f68]/20 bg-[#e6f1ee] p-4">
        <p className="text-xs font-semibold text-[#1f6f68]">本周主推方向</p>
        <p className="mt-2 text-base font-medium leading-7">{project.weeklyFocus}</p>
      </section>

      <TextSection title="怎么使用成员端" items={project.usageGuide} />

      <section className="grid gap-3">
        <Link
          href="/member/calendar"
          className="inline-flex items-center justify-between rounded-lg bg-[#171717] px-4 py-3 text-sm font-medium text-white"
        >
          进入内容日历
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
        <p className="text-center text-xs leading-5 text-black/45">
          首页只保留项目文字介绍，不提供成员端聊天入口。
        </p>
      </section>
    </div>
  );
}

export function MemberCalendarPage() {
  const { workspace, loading, error, reload } = useMemberWorkspace();

  if (loading) {
    return <MemberLoading label="正在准备内容日历" />;
  }

  if (error || !workspace) {
    return <MemberError title="内容日历暂时不可用" message={error} onRetry={reload} />;
  }

  const today = workspace.today;

  return (
    <div className="space-y-4 px-4 py-5">
      <section className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-black/45">{today.taskDate}</p>
            <h1 className="mt-2 text-xl font-semibold leading-tight">{today.theme}</h1>
          </div>
          <button
            type="button"
            onClick={reload}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-black/10 bg-[#f7f4ea]"
            aria-label="刷新内容日历"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-7 text-black/60">
          团队已经把今天的图文和视频脚本准备好。你只需要查看内容、复制发布，或按镜头上传手机素材后发起 AI 剪辑。
        </p>
      </section>

      <div className="grid gap-3">
        <DailyTaskLink
          href={`/member/article/${today.id}`}
          icon={<FileText className="size-5" aria-hidden="true" />}
          eyebrow="今日图文"
          title={today.articleTask.title}
          summary={today.articleTask.summary}
          action="查看图文"
        />
        <DailyTaskLink
          href={`/member/video/${today.id}`}
          icon={<Video className="size-5" aria-hidden="true" />}
          eyebrow="今日视频"
          title={today.videoTask.title}
          summary={today.videoTask.summary}
          action="查看脚本"
        />
      </div>

      <section className="rounded-lg border border-black/10 bg-white">
        <div className="flex items-center gap-2 border-b border-black/10 px-4 py-3">
          <CalendarDays className="size-4 text-black/45" aria-hidden="true" />
          <p className="text-sm font-semibold">未来 7 天</p>
        </div>
        <div className="divide-y divide-black/10">
          {workspace.upcoming.map((task) => (
            <div key={task.id} className="px-4 py-3">
              <p className="text-xs text-black/45">{task.taskDate}</p>
              <p className="mt-1 text-sm font-medium leading-6">{task.theme}</p>
              <p className="mt-1 text-xs leading-5 text-black/50">{task.articleTask.title}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function MemberArticleTaskPage({ taskId }: { taskId: string }) {
  const { task, loading, error, reload } = useMemberTask(taskId);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  if (loading) {
    return <MemberLoading label="正在打开图文内容包" />;
  }

  if (error || !task) {
    return <MemberError title="图文内容包暂时不可用" message={error} onRetry={reload} />;
  }

  const article = task.articleTask.generatedArticle ?? buildArticleFallback(task);
  const publishText = buildPublishText(article);

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLabel(label);
      window.setTimeout(() => setCopiedLabel(null), 1600);
    } catch {
      setCopiedLabel("复制失败");
    }
  }

  return (
    <div className="space-y-4 px-4 py-5">
      <BackLink href="/member/calendar">返回内容日历</BackLink>

      <section className="rounded-lg border border-black/10 bg-white p-4">
        <p className="text-xs text-black/45">{task.taskDate} · 图文任务</p>
        <h1 className="mt-2 text-xl font-semibold leading-tight">{article.title}</h1>
        <p className="mt-3 text-sm leading-7 text-black/60">{task.articleTask.summary}</p>
      </section>

      <section className="rounded-lg border border-black/10 bg-white">
        <div className="border-b border-black/10 px-4 py-3">
          <p className="text-sm font-semibold">已生成文案</p>
        </div>
        <div className="space-y-4 p-4">
          <div>
            <p className="text-xs text-black/45">标题</p>
            <p className="mt-1 text-base font-medium leading-7">{article.title}</p>
          </div>
          <div>
            <p className="text-xs text-black/45">正文</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-black/72">{article.body}</p>
          </div>
          <div>
            <p className="text-xs text-black/45">话题标签</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {article.hashtags.map((tag) => (
                <span key={tag} className="rounded-lg bg-[#ece8dc] px-2 py-1 text-xs text-black/65">
                  #{tag.replace(/^#/, "")}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => void copyText("正文已复制", publishText)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#171717] px-4 py-3 text-sm font-medium text-white"
            >
              <Copy className="size-4" aria-hidden="true" />
              复制标题正文标签
            </button>
            <button
              type="button"
              onClick={() => void copyText("CTA 已复制", article.cta)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-black/10 bg-[#f7f4ea] px-4 py-3 text-sm font-medium"
            >
              <Send className="size-4" aria-hidden="true" />
              复制行动引导
            </button>
            {copiedLabel ? <p className="text-center text-xs text-[#1f6f68]">{copiedLabel}</p> : null}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-black/10 bg-white">
        <div className="border-b border-black/10 px-4 py-3">
          <p className="text-sm font-semibold">已匹配图片</p>
        </div>
        <div className="grid gap-3 p-4">
          {article.imageAssets.length ? (
            article.imageAssets.map((asset) => (
              <div key={asset.id} className="overflow-hidden rounded-lg border border-black/10 bg-[#f7f4ea]">
                <div
                  className="flex aspect-[4/3] items-end bg-[#d6ded8] bg-cover bg-center p-3"
                  style={asset.url ? { backgroundImage: `url(${asset.url})` } : undefined}
                >
                  <span className="rounded-lg bg-black/65 px-2 py-1 text-xs text-white">{asset.title}</span>
                </div>
                <div className="p-3">
                  <p className="text-xs leading-5 text-black/55">
                    {asset.description ?? "团队素材库匹配图片。"}
                  </p>
                  {asset.url ? (
                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#1f6f68]"
                    >
                      打开图片
                      <Download className="size-3" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-black/15 bg-[#f7f4ea] p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ImageIcon className="size-4" aria-hidden="true" />
                图片 brief
              </div>
              <div className="mt-3 space-y-2 text-sm leading-6 text-black/65">
                {article.imageBriefs.map((brief) => (
                  <p key={brief}>{brief}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function MemberVideoTaskPage({ taskId }: { taskId: string }) {
  const { task, loading, error, reload } = useMemberTask(taskId);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [draftBundle, setDraftBundle] = useState<ContentDraftBundleDto | null>(null);
  const [job, setJob] = useState<VideoEditJob | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!job || isTerminalJob(job.status)) {
      return;
    }

    const timer = window.setInterval(() => {
      void getVideoEditJobDetail(job.id)
        .then((nextJob) => {
          if (nextJob) {
            setJob(nextJob);
          }
        })
        .catch(() => undefined);
    }, 6000);

    return () => window.clearInterval(timer);
  }, [job]);

  if (loading) {
    return <MemberLoading label="正在打开视频镜头脚本" />;
  }

  if (error || !task) {
    return <MemberError title="视频任务暂时不可用" message={error} onRetry={reload} />;
  }

  const script = task.videoTask.generatedVideoScript ?? buildVideoScriptFallback(task);
  const selectedFileCount = Object.values(selectedFiles).filter(Boolean).length;
  const editState = summarizeMemberVideoEditState({
    uploadedFileCount: selectedFileCount,
    job,
  });
  const resultUrl = editState.previewUrl;

  async function startAiEdit() {
    const currentTask = task;

    if (!currentTask) {
      setActionError("任务加载完成后才能发起 AI 剪辑。");
      return;
    }

    const uploadEntries = Object.entries(selectedFiles).filter(
      (entry): entry is [string, File] => Boolean(entry[1]),
    );

    if (!uploadEntries.length) {
      setActionError("请先至少上传一段手机素材，再发起 AI 剪辑。");
      return;
    }

    setActionError(null);
    setBusyMessage("准备剪辑脚本...");

    try {
      const bundle = draftBundle ?? (await createVideoDraftFromTask(currentTask, script));
      setDraftBundle(bundle);
      const selectedVariant = bundle.selectedVariant ?? bundle.variants[0] ?? null;

      if (!selectedVariant) {
        throw new Error("视频脚本草稿缺少候选版本。");
      }

      setBusyMessage("确认脚本...");
      const approvedVariant = await approveVariantIfNeeded(selectedVariant);

      setBusyMessage("上传手机素材...");
      for (let index = 0; index < uploadEntries.length; index += 1) {
        const [, file] = uploadEntries[index]!;

        await uploadDraftMediaFile({
          draftId: bundle.draft.id,
          file,
          sortOrder: index,
        });
      }

      setBusyMessage("创建 AI 剪辑任务...");
      const nextJob = await createVideoEditJob({
        draftId: bundle.draft.id,
        contentVariantId: approvedVariant.id,
        instructionText: `成员端 AI 剪辑：${script.title}`,
        productionConfig: {
          render: {
            aspectRatio: "9:16",
            maxDurationSeconds: script.targetDurationSeconds,
            includeOriginalAudio: true,
          },
          subtitles: {
            enabled: true,
            style: "platform_default",
          },
          bgm: {
            enabled: true,
            userRequest: "轻快但不要盖过口播的人居项目短视频背景音乐",
          },
        },
      });

      setJob(nextJob);
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "AI 剪辑任务创建失败");
    } finally {
      setBusyMessage(null);
    }
  }

  return (
    <div className="space-y-4 px-4 py-5">
      <BackLink href="/member/calendar">返回内容日历</BackLink>

      <section className="rounded-lg border border-black/10 bg-white p-4">
        <p className="text-xs text-black/45">{task.taskDate} · 视频任务</p>
        <h1 className="mt-2 text-xl font-semibold leading-tight">{script.title}</h1>
        <p className="mt-3 text-sm leading-7 text-black/60">{script.storyOutline}</p>
      </section>

      <section className="rounded-lg border border-[#1f6f68]/20 bg-[#e6f1ee] p-4">
        <p className="text-xs font-semibold text-[#1f6f68]">开场钩子</p>
        <p className="mt-2 text-sm leading-7">{script.hook}</p>
      </section>

      <section className="rounded-lg border border-black/10 bg-white">
        <div className="border-b border-black/10 px-4 py-3">
          <p className="text-sm font-semibold">镜头脚本与素材上传</p>
        </div>
        <div className="divide-y divide-black/10">
          {script.scenes.map((scene) => (
            <div key={scene.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-black/45">
                    镜头 {scene.order} · {scene.durationSeconds}s
                  </p>
                  <h2 className="mt-1 text-base font-semibold">{scene.title}</h2>
                </div>
                <span className="rounded-lg bg-[#ece8dc] px-2 py-1 text-[11px] text-black/55">
                  {scene.required ? "必传" : "可选"}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-7 text-black/72">{scene.spokenText}</p>
              <div className="grid gap-2 text-xs leading-5 text-black/55">
                <p>字幕：{scene.subtitle}</p>
                <p>拍法：{scene.camera}</p>
                <p>提示：{scene.shootingGuide}</p>
              </div>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-black/20 bg-[#f7f4ea] px-3 py-3 text-sm">
                <span className="min-w-0 truncate">
                  {selectedFiles[scene.id]?.name ?? scene.materialSlot}
                </span>
                <span className="inline-flex items-center gap-1 text-[#1f6f68]">
                  <Upload className="size-4" aria-hidden="true" />
                  上传
                </span>
                <input
                  type="file"
                  accept="video/*,image/*"
                  className="sr-only"
                  onChange={(event) => {
                    setSelectedFiles((current) => ({
                      ...current,
                      [scene.id]: event.target.files?.[0] ?? null,
                    }));
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">AI 剪辑</p>
            <p className="mt-1 text-xs text-black/50">
              已选择 {selectedFileCount} 段素材，预计成片 {script.targetDurationSeconds}s。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void startAiEdit()}
            disabled={Boolean(busyMessage)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#171717] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {busyMessage ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <WandSparkles className="size-4" aria-hidden="true" />}
            AI 剪辑
          </button>
        </div>

        {busyMessage ? <StatusLine icon={<Loader2 className="size-4 animate-spin" />} text={busyMessage} /> : null}
        {actionError ? <StatusLine tone="danger" icon={<AlertCircle className="size-4" />} text={actionError} /> : null}
        {job ? <VideoJobStatus job={job} resultUrl={resultUrl} /> : null}
      </section>
    </div>
  );
}

export function MemberHistoryPage() {
  const [payload, setPayload] = useState<MemberHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory() {
    setLoading(true);
    setError(null);

    try {
      const data = await requestJson<MemberHistoryPayload>("/api/member/history?limit=20");
      setPayload(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "我的内容加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory();
  }, []);

  if (loading) {
    return <MemberLoading label="正在读取我的内容" />;
  }

  if (error || !payload) {
    return <MemberError title="我的内容暂时不可用" message={error} onRetry={loadHistory} />;
  }

  const drafts = payload.draftBundles ?? [];
  const jobs = payload.videoJobs ?? [];

  return (
    <div className="space-y-4 px-4 py-5">
      <section className="rounded-lg border border-black/10 bg-white p-4">
        <h1 className="text-xl font-semibold">我的内容</h1>
        <p className="mt-2 text-sm leading-7 text-black/60">
          这里沉淀当前成员自己创建的图文草稿、视频脚本和 AI 剪辑任务。
        </p>
      </section>

      <HistorySection title="图文 / 脚本草稿" emptyText="还没有内容草稿，先从内容日历进入今日任务。">
        {drafts.map((bundle) => (
          <div key={bundle.draft.id} className="rounded-lg border border-black/10 bg-white p-4">
            <p className="text-xs text-black/45">{formatDateTime(bundle.draft.createdAt)}</p>
            <p className="mt-2 text-sm font-semibold">
              {bundle.selectedVariant?.title ?? bundle.draft.workingTitle ?? "未命名内容"}
            </p>
            <p className="mt-1 text-xs text-black/50">{bundle.selectedVariant?.variantType === "video_script" ? "视频脚本" : "图文草稿"}</p>
          </div>
        ))}
      </HistorySection>

      <HistorySection title="AI 剪辑任务" emptyText="还没有 AI 剪辑任务。">
        {jobs.map((videoJob) => (
          <div key={videoJob.id} className="rounded-lg border border-black/10 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">视频任务</p>
              <span className="rounded-lg bg-[#ece8dc] px-2 py-1 text-[11px] text-black/55">
                {renderJobStatus(videoJob.status)}
              </span>
            </div>
            <p className="mt-2 text-xs text-black/45">{formatDateTime(videoJob.createdAt)}</p>
            <p className="mt-2 text-xs leading-5 text-black/55">
              {videoJob.currentStage ?? videoJob.instructionText ?? "等待 worker 处理。"}
            </p>
          </div>
        ))}
      </HistorySection>
    </div>
  );
}

export function MemberInvitePage({ initialCode = "" }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode);
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/member/invitations/accept", {
        method: "POST",
        headers: taskFetchHeaders,
        body: JSON.stringify({
          code,
          displayName: displayName || null,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | ({ workspace?: { merchantProfile?: { name?: string } } } & ApiErrorPayload)
        | null;

      if (!response.ok || !data?.workspace) {
        throw new Error(data?.error?.message ?? "邀请码加入失败");
      }

      setResult(`已加入 ${data.workspace.merchantProfile?.name ?? "当前项目"}。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "邀请码加入失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 px-4 py-5">
      <section className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center gap-2 text-xs text-[#1f6f68]">
          <UserPlus className="size-4" aria-hidden="true" />
          成员加入
        </div>
        <h1 className="mt-3 text-xl font-semibold">输入团队邀请码</h1>
        <p className="mt-2 text-sm leading-7 text-black/60">
          邀请码由项目团队或负责人提供。加入后，成员默认进入当前项目的项目介绍和内容日历。
        </p>
      </section>

      <form onSubmit={(event) => void submitInvitation(event)} className="space-y-3 rounded-lg border border-black/10 bg-white p-4">
        <label className="grid gap-2 text-sm font-medium">
          邀请码
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="例如 DEMO-MEMBER"
            className="rounded-lg border border-black/15 bg-[#f7f4ea] px-3 py-3 text-sm outline-none focus:border-[#1f6f68]"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          昵称
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="用于团队识别，可选"
            className="rounded-lg border border-black/15 bg-[#f7f4ea] px-3 py-3 text-sm outline-none focus:border-[#1f6f68]"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#171717] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
          加入团队
        </button>
        {result ? (
          <Link href="/member" className="block rounded-lg bg-[#e6f1ee] px-3 py-3 text-center text-sm font-medium text-[#1f6f68]">
            {result} 进入项目介绍
          </Link>
        ) : null}
        {error ? <p className="text-sm leading-6 text-red-700">{error}</p> : null}
      </form>
    </div>
  );
}

function useMemberWorkspace() {
  const [workspace, setWorkspace] = useState<DailyContentWorkspaceDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async function reload() {
    setLoading(true);
    setError(null);

    try {
      const data = await requestJson<DailyContentWorkspaceDto & ApiErrorPayload>("/api/member/tasks/week");
      setWorkspace(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "成员端数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  return { workspace, loading, error, reload };
}

function useMemberTask(taskId: string) {
  const [task, setTask] = useState<DailyContentTaskDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async function reload() {
    setLoading(true);
    setError(null);

    try {
      const data = await requestJson<MemberTaskPayload>(`/api/member/tasks/${taskId}`);

      if (!data.task) {
        throw new Error("任务不存在或无权访问。");
      }

      setTask(data.task);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "任务加载失败");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  return { task, loading, error, reload };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
  });
  const data = (await response.json().catch(() => null)) as (T & ApiErrorPayload) | null;

  if (!response.ok || !data) {
    throw new Error(data?.error?.message ?? "请求失败");
  }

  return data;
}

async function createVideoDraftFromTask(
  task: DailyContentTaskDto,
  script: DailyVideoScriptPackageDto,
) {
  const response = await fetch("/api/content/video-workbench-agent", {
    method: "POST",
    headers: taskFetchHeaders,
    body: JSON.stringify({
      dailyTaskId: task.id,
      source: "daily_task",
      goal: task.videoTask.title,
      userMessage: buildVideoDraftPrompt(script),
      intent: "generate",
    }),
  });
  const data = (await response.json().catch(() => null)) as
    | ({ draftBundle?: ContentDraftBundleDto } & ApiErrorPayload)
    | null;

  if (!response.ok || !data?.draftBundle) {
    throw new Error(data?.error?.message ?? "视频脚本草稿创建失败");
  }

  return data.draftBundle;
}

async function approveVariantIfNeeded(variant: ContentVariantDto) {
  if (variant.reviewStatus === "approved") {
    return variant;
  }

  const response = await fetch(`/api/content/variants/${variant.id}/approve`, {
    method: "POST",
  });
  const data = (await response.json().catch(() => null)) as
    | ({ variant?: ContentVariantDto } & ApiErrorPayload)
    | null;

  if (!response.ok || !data?.variant) {
    throw new Error(data?.error?.message ?? "视频脚本确认失败");
  }

  return data.variant;
}

function buildVideoDraftPrompt(script: DailyVideoScriptPackageDto) {
  const scenes = script.scenes
    .map(
      (scene) =>
        `${scene.order}. ${scene.title}：${scene.spokenText}；画面：${scene.camera}；素材：${scene.materialSlot}`,
    )
    .join("\n");

  return `请按成员端已生成镜头脚本创建可剪辑的视频脚本草稿，不要重新发散选题。\n标题：${script.title}\n大纲：${script.storyOutline}\n镜头：\n${scenes}\nCTA：${script.cta}`;
}

function DailyTaskLink({
  href,
  icon,
  eyebrow,
  title,
  summary,
  action,
}: {
  href: string;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  summary: string;
  action: string;
}) {
  return (
    <Link href={href} className="rounded-lg border border-black/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-[#1f6f68]">
          {icon}
          {eyebrow}
        </div>
        <span className="text-xs text-black/45">{action}</span>
      </div>
      <h2 className="mt-3 text-base font-semibold leading-7">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-black/58">{summary}</p>
    </Link>
  );
}

function TextSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border border-black/10 bg-white p-4">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <p key={item} className="text-sm leading-7 text-black/65">
            {item}
          </p>
        ))}
      </div>
    </section>
  );
}

function HistorySection({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children: ReactNode[];
}) {
  const items = useMemo(() => children.filter(Boolean), [children]);

  return (
    <section className="space-y-3">
      <h2 className="px-1 text-sm font-semibold">{title}</h2>
      {items.length ? (
        items
      ) : (
        <div className="rounded-lg border border-dashed border-black/15 bg-white p-4 text-sm leading-7 text-black/55">
          {emptyText}
        </div>
      )}
    </section>
  );
}

function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 text-sm text-black/55">
      <ArrowLeft className="size-4" aria-hidden="true" />
      {children}
    </Link>
  );
}

function MemberLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="rounded-lg border border-black/10 bg-white px-4 py-3 text-sm text-black/60">
        <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}

function MemberError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message?: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full rounded-lg border border-red-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
          <AlertCircle className="size-4" aria-hidden="true" />
          {title}
        </div>
        <p className="mt-2 text-sm leading-7 text-black/60">{message ?? "请稍后重试。"}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-black/10 bg-[#f7f4ea] px-3 py-2 text-sm"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          重试
        </button>
      </div>
    </div>
  );
}

function StatusLine({
  icon,
  text,
  tone = "default",
}: {
  icon: ReactNode;
  text: string;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={cn(
        "mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
        tone === "danger" ? "bg-red-50 text-red-700" : "bg-[#e6f1ee] text-[#1f6f68]",
      )}
    >
      {icon}
      {text}
    </div>
  );
}

function VideoJobStatus({ job, resultUrl }: { job: VideoEditJob; resultUrl: string | null }) {
  return (
    <div className="mt-3 rounded-lg border border-black/10 bg-[#f7f4ea] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {job.status === "succeeded" ? (
            <Check className="size-4 text-[#1f6f68]" aria-hidden="true" />
          ) : (
            <Clock3 className="size-4 text-black/45" aria-hidden="true" />
          )}
          {renderJobStatus(job.status)}
        </div>
        <span className="text-xs text-black/45">{job.progressPct ?? 0}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-lg bg-black/10">
        <div className="h-full bg-[#1f6f68]" style={{ width: `${Math.max(job.progressPct ?? 0, 5)}%` }} />
      </div>
      {job.failureReason ? <p className="mt-2 text-xs leading-5 text-red-700">{job.failureReason}</p> : null}
      {resultUrl ? (
        <a
          href={resultUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#171717] px-3 py-2 text-sm font-medium text-white"
        >
          <Download className="size-4" aria-hidden="true" />
          预览 / 下载成片
        </a>
      ) : null}
    </div>
  );
}

function buildArticleFallback(task: DailyContentTaskDto): DailyArticleContentPackageDto {
  return {
    title: task.articleTask.title,
    body: `${task.articleTask.summary}\n\n这条图文已经按团队内容日历准备好。发布时可以结合项目实景、户型或配套图片，把客户最关心的问题讲清楚。`,
    hashtags: compactStrings([task.articleTask.strategyTag, "小红书买房笔记", "本地看房"]),
    cta: "想了解适不适合自己，私信我说预算和通勤范围。",
    coverText: task.articleTask.title,
    imageAssets: [],
    imageBriefs: task.articleTask.materialHints.length
      ? task.articleTask.materialHints.map((hint) => `围绕「${hint}」选择一张项目图片。`)
      : ["封面图、项目实景图、配套图各准备一张。"],
    generatedAt: task.updatedAt,
  };
}

function buildVideoScriptFallback(task: DailyContentTaskDto): DailyVideoScriptPackageDto {
  return {
    title: task.videoTask.title,
    hook: "如果你正在关注这个项目，先看这几个更实际的判断点。",
    storyOutline: task.videoTask.summary,
    targetDurationSeconds: 38,
    scenes: [
      {
        id: "scene-1",
        order: 1,
        title: "开场口播",
        durationSeconds: 8,
        camera: "手机竖屏半身口播。",
        spokenText: task.videoTask.summary,
        subtitle: task.videoTask.title,
        shootingGuide: "开头直接说客户最关心的问题。",
        materialSlot: "本人开场口播",
        required: true,
      },
      {
        id: "scene-2",
        order: 2,
        title: "项目补充画面",
        durationSeconds: 20,
        camera: "项目实景、样板间或周边配套。",
        spokenText: "结合现场素材解释项目优势。",
        subtitle: "结合现场素材解释项目优势",
        shootingGuide: "每个画面保持 3 秒以上，避免快速晃动。",
        materialSlot: "项目现场素材",
        required: true,
      },
      {
        id: "scene-3",
        order: 3,
        title: "行动引导",
        durationSeconds: 10,
        camera: "手机竖屏半身口播。",
        spokenText: "把预算和通勤位置发我，我帮你判断这个项目适不适合。",
        subtitle: "发我预算和通勤，我帮你判断",
        shootingGuide: "结尾留 1 秒停顿。",
        materialSlot: "本人收尾口播",
        required: true,
      },
    ],
    cta: "把预算和通勤位置发我，我帮你判断这个项目适不适合。",
    materialChecklist: ["本人开场口播", "项目现场素材", "本人收尾口播"],
    generatedAt: task.updatedAt,
  };
}

function buildPublishText(article: DailyArticleContentPackageDto) {
  const tags = article.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ");
  return `${article.title}\n\n${article.body}\n\n${article.cta}\n\n${tags}`;
}

function renderJobStatus(status: VideoEditJobDto["status"]) {
  const labels: Record<VideoEditJobDto["status"], string> = {
    pending: "待进入队列",
    queued: "队列中",
    preparing: "准备素材",
    running: "剪辑中",
    succeeded: "成片成功",
    failed_retryable: "可重试失败",
    failed_manual: "需要人工处理",
    cancelled: "已取消",
  };

  return labels[status] ?? status;
}

function isTerminalJob(status: VideoEditJobDto["status"]) {
  return status === "succeeded" || status === "failed_manual" || status === "cancelled";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function compactStrings(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim()));
}
