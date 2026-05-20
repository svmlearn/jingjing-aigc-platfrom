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
import type { PublicVideoEditJobDto, VideoEditProgressModuleDto } from "@/contracts/video";
import { isVideoEditJobInFlightStatus } from "@/contracts/video";
import type { VoiceProfileDto } from "@/contracts/voice";
import {
  isSupportedVoiceProfileAudioFile,
  summarizeMemberVideoEditState,
} from "@/lib/member-video-workflow";
import { getVideoJobStageLabel } from "@/lib/ui/video-job-display";
import {
  createVideoEditJob,
  type DraftMediaUploadStage,
  getVideoEditJobDetail,
  type VideoEditJob,
  uploadDraftMediaFile,
  uploadVoiceProfileAudioFile,
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
  videoJobs?: PublicVideoEditJobDto[];
};

type VoiceProfilesPayload = ApiErrorPayload & {
  voiceProfiles?: VoiceProfileDto[];
};

type AiEditBusyStage = "preparing_script" | "confirming_script" | "uploading_media" | "creating_job";

type AiEditBusyState = {
  stage: AiEditBusyStage;
  uploadIndex?: number;
  uploadTotal?: number;
  uploadPercent?: number;
  uploadStage?: DraftMediaUploadStage;
};

type VoiceProfileCreateState = {
  displayName: string;
  authorizationAccepted: boolean;
  fileName?: string;
  status: "idle" | "uploading" | "creating" | "ready" | "failed";
  progressPct: number;
  stage?: DraftMediaUploadStage;
  error?: string;
  profile?: VoiceProfileDto | null;
};

type AiEditProgressView = {
  statusLabel: string;
  progressPct?: number | null;
  stageLabel: string;
  moduleLabel?: string | null;
  moduleDetail?: string | null;
  moduleProgressPct?: number | null;
  moduleStatus?: VideoEditProgressModuleDto["status"];
  moduleStatusLabel?: string | null;
  failureReason?: string | null;
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
          status={today.articleTask.generationStatus}
          action="查看图文"
        />
        <DailyTaskLink
          href={`/member/video/${today.id}`}
          icon={<Video className="size-5" aria-hidden="true" />}
          eyebrow="今日视频"
          title={today.videoTask.title}
          summary={today.videoTask.summary}
          status={today.videoTask.generationStatus}
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
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="min-w-0 text-xs leading-5 text-black/50">{task.articleTask.title}</p>
                <GenerationStatusPill status={task.articleTask.generationStatus} />
              </div>
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
    if (await writeClipboardText(text)) {
      setCopiedLabel(label);
      window.setTimeout(() => setCopiedLabel(null), 1600);
      return;
    }

    setCopiedLabel("复制失败，请手动长按选择文案");
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
  const [selectedVoiceAudioFile, setSelectedVoiceAudioFile] = useState<File | null>(null);
  const [draftBundle, setDraftBundle] = useState<ContentDraftBundleDto | null>(null);
  const [job, setJob] = useState<VideoEditJob | null>(null);
  const [busyState, setBusyState] = useState<AiEditBusyState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [voiceProfileCreate, setVoiceProfileCreate] = useState<VoiceProfileCreateState>({
    displayName: "",
    authorizationAccepted: false,
    status: "idle",
    progressPct: 0,
    profile: null,
  });

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

  useEffect(() => {
    void requestJson<VoiceProfilesPayload>("/api/voice-profiles")
      .then((data) => {
        const profile = data.voiceProfiles?.find((item) => item.status === "ready") ?? null;
        if (profile) {
          setVoiceProfileCreate((current) => ({
            ...current,
            status: current.status === "idle" ? "ready" : current.status,
            profile,
          }));
        }
      })
      .catch(() => undefined);
  }, []);

  if (loading) {
    return <MemberLoading label="正在打开视频镜头脚本" />;
  }

  if (error || !task) {
    return <MemberError title="视频任务暂时不可用" message={error} onRetry={reload} />;
  }

  const script = task.videoTask.generatedVideoScript ?? buildVideoScriptFallback(task);
  const selectedFileCount = Object.values(selectedFiles).filter(Boolean).length;
  const requiredSceneCount = script.scenes.filter((scene) => scene.required).length;
  const editState = summarizeMemberVideoEditState({
    uploadedFileCount: selectedFileCount,
    job,
  });
  const resultUrl = editState.previewUrl;
  const resultDownloadUrl = editState.downloadUrl;
  const selectedVoiceProfile = voiceProfileCreate.profile ?? null;
  const voiceProfileBusy =
    voiceProfileCreate.status === "uploading" || voiceProfileCreate.status === "creating";

  async function startAiEdit() {
    const currentTask = task;

    if (job && isVideoEditJobInFlightStatus(job.status)) {
      setActionError("当前 AI 剪辑正在进行中，请等待成片完成。");
      return;
    }

    if (!currentTask) {
      setActionError("任务加载完成后才能发起 AI 剪辑。");
      return;
    }

    if (voiceProfileBusy) {
      setActionError("克隆音色还在上传，请等待声音准备完成后再发起 AI 剪辑。");
      return;
    }

    const uploadEntries = Object.entries(selectedFiles).filter(
      (entry): entry is [string, File] => Boolean(entry[1]),
    );

    if (requiredSceneCount > 0 && !uploadEntries.length) {
      setActionError("请先至少上传一段手机素材，再发起 AI 剪辑。");
      return;
    }

    setActionError(null);
    setBusyState({ stage: "preparing_script" });

    try {
      const difyDraftReference = getDifyVideoDraftReference(currentTask);
      let bundle = draftBundle;

      if (difyDraftReference) {
        if (!bundle || bundle.draft.id !== difyDraftReference.contentDraftId) {
          bundle = await getContentDraftBundle(difyDraftReference.contentDraftId);
        }
      } else {
        bundle = bundle ?? (await createVideoDraftFromTask(currentTask, script));
      }

      setDraftBundle(bundle);
      const selectedVariant = selectVideoVariantForEdit(
        bundle,
        difyDraftReference?.contentVariantId ?? null,
      );

      if (!selectedVariant) {
        throw new Error("视频脚本草稿缺少候选版本。");
      }

      if (selectedVariant.variantType !== "video_script") {
        throw new Error("视频脚本草稿缺少可剪辑的视频版本。");
      }

      setBusyState({ stage: "confirming_script" });
      const approvedVariant = await approveVariantIfNeeded(selectedVariant);

      const uploadTotal = uploadEntries.length;
      for (let index = 0; index < uploadEntries.length; index += 1) {
        const [, file] = uploadEntries[index]!;
        let currentUploadPercent = 0;
        const updateUploadState = (
          uploadStage: DraftMediaUploadStage,
          uploadPercent = currentUploadPercent,
        ) => {
          currentUploadPercent = normalizeUploadPercent(uploadPercent);
          setBusyState({
            stage: "uploading_media",
            uploadIndex: index + 1,
            uploadTotal,
            uploadPercent: currentUploadPercent,
            uploadStage,
          });
        };

        await uploadDraftMediaFile({
          draftId: bundle.draft.id,
          file,
          sortOrder: index,
          onStageChange(uploadStage) {
            updateUploadState(uploadStage, uploadStage === "finalizing" ? 100 : currentUploadPercent);
          },
          onProgress(progress) {
            updateUploadState("uploading", progress.percent);
          },
        });
      }

      let voiceProfileForJob = selectedVoiceProfile;
      if (selectedVoiceAudioFile) {
        const uploadedVoiceProfile = await createVoiceProfileFromFile(selectedVoiceAudioFile);
        if (!uploadedVoiceProfile) {
          return;
        }
        voiceProfileForJob = uploadedVoiceProfile;
        setSelectedVoiceAudioFile(null);
      }

      setBusyState({ stage: "creating_job" });
      const nextJob = await createVideoEditJob({
        draftId: bundle.draft.id,
        contentVariantId: approvedVariant.id,
        instructionText: `成员端 AI 剪辑：${script.title}`,
        productionConfig: buildMemberVideoProductionConfig({
          script,
          voiceProfile: voiceProfileForJob,
        }),
      });

      setJob(nextJob);
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "AI 剪辑任务创建失败");
    } finally {
      setBusyState(null);
    }
  }

  async function createVoiceProfileFromFile(file: File): Promise<VoiceProfileDto | null> {
    if (!isSupportedVoiceProfileAudioFile(file)) {
      const message = "克隆音色参考音频仅支持 wav、mp3、m4a、aac、ogg、opus、webm 音频文件。";
      setVoiceProfileCreate((current) => ({
        ...current,
        fileName: file.name,
        status: "failed",
        error: message,
      }));
      setActionError(message);
      return null;
    }

    if (!voiceProfileCreate.authorizationAccepted) {
      const message = "请先勾选声音克隆授权确认，再上传音频。";
      setVoiceProfileCreate((current) => ({
        ...current,
        fileName: file.name,
        status: "failed",
        error: message,
      }));
      setActionError(message);
      return null;
    }

    const voiceProfileId = crypto.randomUUID();
    const displayName = voiceProfileCreate.displayName.trim() || file.name.replace(/\.[^.]+$/, "");

    setActionError(null);
    setVoiceProfileCreate((current) => ({
      ...current,
      displayName,
      fileName: file.name,
      status: "uploading",
      stage: "preparing",
      progressPct: 0,
      error: undefined,
    }));

    try {
      const data = await uploadVoiceProfileAudioFile({
        voiceProfileId,
        displayName,
        authorizationAccepted: true,
        file,
        onStageChange(stage) {
          setVoiceProfileCreate((current) => ({
            ...current,
            status: "uploading",
            stage,
            progressPct: stage === "finalizing" ? 100 : current.progressPct,
          }));
        },
        onProgress(progress) {
          setVoiceProfileCreate((current) => ({
            ...current,
            status: "uploading",
            stage: "uploading",
            progressPct: normalizeUploadPercent(progress.percent),
          }));
        },
      });

      if (!data.voiceProfile) {
        throw new Error("克隆音色创建失败");
      }

      setVoiceProfileCreate({
        displayName: "",
        authorizationAccepted: false,
        fileName: file.name,
        status: "ready",
        progressPct: 100,
        profile: data.voiceProfile,
      });
      return data.voiceProfile;
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "克隆音色创建失败";
      setVoiceProfileCreate((current) => ({
        ...current,
        status: "failed",
        error: message,
      }));
      setActionError(message);
      return null;
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
              {scene.required ? (
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
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-[#f7f4ea] px-3 py-3 text-sm">
                  <span className="min-w-0 truncate">{scene.materialSlot}</span>
                  <span className="inline-flex items-center gap-1 text-[#1f6f68]">
                    <Check className="size-4" aria-hidden="true" />
                    团队素材
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">声音克隆</p>
            <p className="mt-1 text-xs leading-5 text-black/50">
              {selectedVoiceProfile ? `当前音色：${selectedVoiceProfile.displayName}` : "可上传本人音频用于 AI 配音；不上传则使用默认音色。"}
            </p>
          </div>
          <span className="rounded-lg bg-[#ece8dc] px-2 py-1 text-[11px] text-black/55">可选</span>
        </div>

        <label className="mt-3 flex items-start gap-2 rounded-lg border border-black/10 bg-[#f7f4ea] px-3 py-3 text-xs leading-5 text-black/65">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-[#1f6f68]"
            checked={voiceProfileCreate.authorizationAccepted}
            onChange={(event) => {
              setVoiceProfileCreate((current) => ({
                ...current,
                authorizationAccepted: event.target.checked,
              }));
            }}
          />
          <span>我确认已获得该声音用于克隆和视频配音的授权。</span>
        </label>

        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-black/20 bg-[#f7f4ea] px-3 py-3 text-sm">
          <span className="min-w-0 truncate">
            {selectedVoiceAudioFile?.name ?? voiceProfileCreate.fileName ?? selectedVoiceProfile?.refAudioAsset?.storageKey.split("/").pop() ?? "上传 MP3 / 音频"}
          </span>
          <span className="inline-flex items-center gap-1 text-[#1f6f68]">
            {voiceProfileBusy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="size-4" aria-hidden="true" />
            )}
            {voiceProfileBusy ? `${voiceProfileCreate.progressPct}%` : "上传"}
          </span>
          <input
            type="file"
            accept="audio/*,audio/mp4,audio/x-m4a,video/mp4,.m4a,.mp3,.wav,.aac,.ogg,.opus,.webm"
            className="sr-only"
            disabled={voiceProfileBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (file) {
                setSelectedVoiceAudioFile(file);
                setVoiceProfileCreate((current) => ({
                  ...current,
                  fileName: file.name,
                  status: "idle",
                  progressPct: 0,
                  error: undefined,
                  profile: null,
                }));
              }
            }}
          />
        </label>

        {selectedVoiceAudioFile && voiceProfileCreate.status === "idle" ? (
          <StatusLine icon={<Upload className="size-4" />} text="已选择音频，点击 AI 剪辑时会先上传并创建克隆音色。" />
        ) : null}

        {voiceProfileCreate.status === "ready" && selectedVoiceProfile ? (
          <StatusLine icon={<Check className="size-4" />} text="克隆音色已准备好，本次 AI 剪辑将使用该声音配音。" />
        ) : null}
        {voiceProfileCreate.status === "failed" && voiceProfileCreate.error ? (
          <StatusLine tone="danger" icon={<AlertCircle className="size-4" />} text={voiceProfileCreate.error} />
        ) : null}
      </section>

      <section className="rounded-lg border border-black/10 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">AI 剪辑</p>
            <p className="mt-1 text-xs text-black/50">
              已选择 {selectedFileCount} 段素材，需成员上传 {requiredSceneCount} 段，预计成片 {script.targetDurationSeconds}s。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void startAiEdit()}
            disabled={
              Boolean(busyState) ||
              voiceProfileBusy ||
              Boolean(job && isVideoEditJobInFlightStatus(job.status))
            }
            className="inline-flex items-center gap-2 rounded-lg bg-[#171717] px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {busyState || (job && isVideoEditJobInFlightStatus(job.status)) ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <WandSparkles className="size-4" aria-hidden="true" />
            )}
            {busyState || (job && isVideoEditJobInFlightStatus(job.status)) ? "剪辑中" : "AI 剪辑"}
          </button>
        </div>

        <AiEditProgressStatus
          busyState={busyState}
          job={job}
          resultUrl={resultUrl}
          downloadUrl={resultDownloadUrl}
        />
        {actionError ? <StatusLine tone="danger" icon={<AlertCircle className="size-4" />} text={actionError} /> : null}
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
              {getVideoJobStageLabel(videoJob.currentStage, videoJob.status)}
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

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Some mobile/webview contexts expose Clipboard API but block it by permission.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.append(textArea);
  textArea.focus();
  textArea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textArea.remove();
  }
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

function buildMemberVideoProductionConfig(input: {
  script: DailyVideoScriptPackageDto;
  voiceProfile: VoiceProfileDto | null;
}) {
  if (input.voiceProfile) {
    return {
      voiceover: {
        enabled: true,
        mode: "voice_profile",
        voiceProfileId: input.voiceProfile.id,
        refAudioAssetId: input.voiceProfile.refAudioAssetId,
        includeOriginalAudio: false,
      },
      render: {
        aspectRatio: "9:16",
        maxDurationSeconds: input.script.targetDurationSeconds,
        includeOriginalAudio: false,
      },
      subtitles: {
        enabled: true,
        style: "platform_default",
        talkingHeadSource: "asr_original_audio",
      },
      bgm: {
        enabled: false,
        userRequest: "",
      },
    };
  }

  return {
    voiceover: {
      enabled: true,
      mode: "system",
      provider: "minimax",
      includeOriginalAudio: false,
    },
    render: {
      aspectRatio: "9:16",
      maxDurationSeconds: input.script.targetDurationSeconds,
      includeOriginalAudio: false,
    },
    subtitles: {
      enabled: true,
      style: "platform_default",
      talkingHeadSource: "script",
    },
    bgm: {
      enabled: false,
      userRequest: "",
    },
  };
}

function getDifyVideoDraftReference(task: DailyContentTaskDto) {
  const contentDraftId = task.videoTask.contentDraftId?.trim();
  const contentVariantId = task.videoTask.contentVariantId?.trim();

  if (!task.videoTask.generatedVideoScript || !contentDraftId || !contentVariantId) {
    return null;
  }

  return {
    contentDraftId,
    contentVariantId,
  };
}

async function getContentDraftBundle(draftId: string) {
  const response = await fetch(`/api/content/records/${encodeURIComponent(draftId)}`, {
    method: "GET",
    headers: taskFetchHeaders,
  });
  const data = (await response.json().catch(() => null)) as
    | ({ draftBundle?: ContentDraftBundleDto } & ApiErrorPayload)
    | null;

  if (!response.ok || !data?.draftBundle) {
    throw new Error(data?.error?.message ?? "Dify 视频脚本草稿读取失败");
  }

  return data.draftBundle;
}

function selectVideoVariantForEdit(
  bundle: ContentDraftBundleDto,
  expectedVariantId?: string | null,
) {
  if (expectedVariantId) {
    const expectedVariant = bundle.variants.find((variant) => variant.id === expectedVariantId);

    if (!expectedVariant) {
      throw new Error("Dify 视频脚本版本不存在，无法发起 AI 剪辑。");
    }

    return expectedVariant;
  }

  if (bundle.selectedVariant?.variantType === "video_script") {
    return bundle.selectedVariant;
  }

  return bundle.variants.find((variant) => variant.variantType === "video_script") ?? null;
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
  status,
  action,
}: {
  href: string;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  summary: string;
  status?: DailyContentTaskDto["articleTask"]["generationStatus"];
  action: string;
}) {
  return (
    <Link href={href} className="rounded-lg border border-black/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-[#1f6f68]">
          {icon}
          {eyebrow}
        </div>
        <div className="flex items-center gap-2">
          <GenerationStatusPill status={status} />
          <span className="text-xs text-black/45">{action}</span>
        </div>
      </div>
      <h2 className="mt-3 text-base font-semibold leading-7">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-black/58">{summary}</p>
    </Link>
  );
}

function GenerationStatusPill({
  status,
}: {
  status?: DailyContentTaskDto["articleTask"]["generationStatus"];
}) {
  if (!status || status === "not_started") {
    return null;
  }

  const labelMap: Record<NonNullable<typeof status>, string> = {
    pending: "队列中",
    running: "生成中",
    succeeded: "已生成",
    failed: "失败",
  };

  return (
    <span
      className={cn(
        "shrink-0 rounded-lg px-2 py-1 text-[11px]",
        status === "failed"
          ? "bg-red-50 text-red-700"
          : status === "succeeded"
            ? "bg-[#e6f1ee] text-[#1f6f68]"
            : "bg-[#ece8dc] text-black/55",
      )}
    >
      {labelMap[status]}
    </span>
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

function AiEditProgressStatus({
  busyState,
  job,
  resultUrl,
  downloadUrl,
}: {
  busyState: AiEditBusyState | null;
  job: VideoEditJob | null;
  resultUrl: string | null;
  downloadUrl: string | null;
}) {
  const progress = busyState ? getBusyProgressView(busyState) : job ? getJobProgressView(job) : null;

  if (!progress) {
    return null;
  }

  const isSucceeded = job?.status === "succeeded" && !busyState;
  const isFailed = Boolean(progress.failureReason);
  const moduleStatus = progress.moduleStatus ?? "running";
  const hasOverallProgress = typeof progress.progressPct === "number";
  const hasModuleProgress =
    progress.moduleLabel &&
    typeof progress.moduleProgressPct === "number" &&
    typeof progress.moduleStatus === "string";

  return (
    <div className="mt-3 rounded-lg border border-black/10 bg-[#f7f4ea] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {isSucceeded ? (
            <Check className="size-4 text-[#1f6f68]" aria-hidden="true" />
          ) : isFailed ? (
            <AlertCircle className="size-4 text-red-700" aria-hidden="true" />
          ) : (
            <Clock3 className="size-4 text-black/45" aria-hidden="true" />
          )}
          {progress.statusLabel}
        </div>
        {hasOverallProgress ? <span className="text-xs text-black/45">{progress.progressPct}%</span> : null}
      </div>
      {hasOverallProgress ? (
        <div className="mt-3 h-2 overflow-hidden rounded-lg bg-black/10">
          <div className="h-full bg-[#1f6f68]" style={{ width: `${Math.max(progress.progressPct ?? 0, 5)}%` }} />
        </div>
      ) : null}
      <p className="mt-2 text-xs leading-5 text-black/55">{progress.stageLabel}</p>
      {hasModuleProgress ? (
        <div className="mt-3 rounded-lg border border-[#dbe4e1] bg-white/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn("size-2 shrink-0 rounded-full", getMemberProgressModuleDotClass(moduleStatus))} />
              <span className="truncate text-sm font-medium text-[#17202a]">{progress.moduleLabel}</span>
            </div>
            <span className={cn("shrink-0 text-xs", getMemberProgressModuleTextClass(moduleStatus))}>
              {progress.moduleStatusLabel ?? renderProgressModuleStatus(moduleStatus)}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
            <div
              className={cn("h-full rounded-full", getMemberProgressModuleBarClass(moduleStatus))}
              style={{ width: `${Math.max(progress.moduleProgressPct ?? 0, 5)}%` }}
            />
          </div>
          {progress.moduleDetail ? (
            <p className="mt-2 text-xs leading-5 text-black/50">{progress.moduleDetail}</p>
          ) : null}
        </div>
      ) : null}
      {progress.failureReason ? <p className="mt-2 text-xs leading-5 text-red-700">{progress.failureReason}</p> : null}
      {resultUrl ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-black/10 bg-black">
          <video
            className="aspect-video w-full bg-black object-contain"
            controls
            playsInline
            preload="metadata"
            src={resultUrl}
          />
        </div>
      ) : null}
      {downloadUrl ? (
        <a
          href={downloadUrl}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#171717] px-3 py-2 text-sm font-medium text-white"
        >
          <Download className="size-4" aria-hidden="true" />
          下载成片
        </a>
      ) : null}
    </div>
  );
}

function getBusyProgressView(state: AiEditBusyState): AiEditProgressView {
  if (state.stage === "preparing_script") {
    return {
      statusLabel: "剪辑准备中",
      stageLabel: "正在整理镜头脚本",
    };
  }

  if (state.stage === "confirming_script") {
    return {
      statusLabel: "剪辑准备中",
      stageLabel: "正在确认脚本版本",
    };
  }

  if (state.stage === "uploading_media") {
    const uploadProgress = getUploadBusyProgress(state);
    const uploadStageLabel = getUploadStageLabel(state.uploadStage);
    return {
      statusLabel: "上传素材中",
      progressPct: uploadProgress.overallProgressPct,
      stageLabel: `正在上传第 ${state.uploadIndex ?? 1} / ${state.uploadTotal ?? 1} 段素材`,
      moduleLabel: "上传手机素材",
      moduleDetail: uploadStageLabel,
      moduleProgressPct: uploadProgress.moduleProgressPct,
      moduleStatus: "running",
      moduleStatusLabel: state.uploadStage === "finalizing" ? "保存中" : "上传中",
    };
  }

  return {
    statusLabel: "剪辑准备中",
    stageLabel: "正在创建 AI 剪辑任务",
  };
}

function getJobProgressView(job: VideoEditJob): AiEditProgressView {
  const currentModule = isOpenStorylineProgressStage(job.currentStage) ? getCurrentVideoProgressModule(job) : null;
  const currentStageLabel = getVideoJobStageLabel(job.currentStage, job.status);
  const rawProgressPct = normalizeProgressPct(job.progressPct ?? 0);

  return {
    statusLabel: renderJobStatus(job.status),
    progressPct: isOpenStorylineProgressStage(job.currentStage) || job.status === "succeeded" ? rawProgressPct : null,
    stageLabel: currentStageLabel,
    moduleLabel: currentModule?.label ?? null,
    moduleDetail: currentModule ? getMemberProgressModuleDetail(currentModule.label) : null,
    moduleProgressPct: currentModule?.progressPct ?? null,
    moduleStatus: currentModule?.status,
    moduleStatusLabel: currentModule ? renderProgressModuleStatus(currentModule.status) : null,
    failureReason: job.failureReason,
  };
}

function isOpenStorylineProgressStage(stage?: string | null) {
  return Boolean(stage?.startsWith("openstoryline_") && !stage.endsWith("_failed"));
}

function getCurrentVideoProgressModule(job: VideoEditJob) {
  return (
    job.progressModules.find((module) => module.status === "running") ??
    job.progressModules.find((module) => module.status === "failed") ??
    [...job.progressModules].reverse().find((module) => module.status === "succeeded") ??
    null
  );
}

function getMemberProgressModuleDetail(label: string) {
  const details: Record<string, string> = {
    上传手机素材: "正在上传你选择的手机素材。",
    素材准备: "正在读取你上传的手机素材。",
    素材匹配: "正在按脚本镜头挑选合适素材。",
    配音生成: "正在生成旁白配音。",
    字幕与时间线: "正在对齐字幕和镜头时间线。",
    合成渲染: "正在合成最终视频。",
    保存成片: "正在保存成片，完成后可预览下载。",
  };
  return details[label] ?? "正在处理当前剪辑步骤。";
}

function getUploadBusyProgress(state: AiEditBusyState) {
  const uploadTotal = Math.max(state.uploadTotal ?? 1, 1);
  const uploadIndex = Math.max(state.uploadIndex ?? 1, 1);
  const uploadPercent = state.uploadStage === "finalizing" ? 100 : normalizeUploadPercent(state.uploadPercent ?? 0);
  const finishedFiles = Math.max(uploadIndex - 1, 0);
  const uploadedRatio = Math.min(1, (finishedFiles + uploadPercent / 100) / uploadTotal);

  return {
    overallProgressPct: normalizeProgressPct(24 + uploadedRatio * 24),
    moduleProgressPct: normalizeProgressPct(
      state.uploadStage === "preparing" ? 12 : state.uploadStage === "finalizing" ? 92 : uploadPercent,
    ),
  };
}

function getUploadStageLabel(stage?: DraftMediaUploadStage) {
  if (stage === "preparing") {
    return "正在申请上传通道。";
  }
  if (stage === "finalizing") {
    return "素材已经上传，正在保存素材记录。";
  }
  return "正在上传你选择的手机素材。";
}

function normalizeUploadPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const percent = value > 0 && value <= 1 ? value * 100 : value;
  return normalizeProgressPct(percent);
}

function normalizeProgressPct(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function renderProgressModuleStatus(status: VideoEditProgressModuleDto["status"]) {
  const labels: Record<VideoEditProgressModuleDto["status"], string> = {
    pending: "等待",
    running: "处理中",
    succeeded: "完成",
    failed: "失败",
    skipped: "跳过",
  };
  return labels[status] ?? "处理中";
}

function getMemberProgressModuleDotClass(status: VideoEditProgressModuleDto["status"]) {
  if (status === "running") {
    return "bg-[#2563eb] shadow-[0_0_0_4px_rgba(37,99,235,0.12)]";
  }
  if (status === "succeeded") {
    return "bg-[#16a34a] shadow-[0_0_0_4px_rgba(22,163,74,0.12)]";
  }
  if (status === "failed") {
    return "bg-[#e11d48] shadow-[0_0_0_4px_rgba(225,29,72,0.12)]";
  }
  return "bg-black/25";
}

function getMemberProgressModuleTextClass(status: VideoEditProgressModuleDto["status"]) {
  if (status === "running") {
    return "text-[#1d4ed8]";
  }
  if (status === "succeeded") {
    return "text-[#166534]";
  }
  if (status === "failed") {
    return "text-[#be123c]";
  }
  return "text-black/45";
}

function getMemberProgressModuleBarClass(status: VideoEditProgressModuleDto["status"]) {
  if (status === "running") {
    return "bg-[#2563eb]";
  }
  if (status === "succeeded") {
    return "bg-[#16a34a]";
  }
  if (status === "failed") {
    return "bg-[#e11d48]";
  }
  return "bg-black/20";
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

function renderJobStatus(status: PublicVideoEditJobDto["status"]) {
  const labels: Record<PublicVideoEditJobDto["status"], string> = {
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

function isTerminalJob(status: PublicVideoEditJobDto["status"]) {
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
