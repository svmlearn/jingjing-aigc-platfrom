"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileText, ImageIcon, PenLine, RefreshCw } from "lucide-react";

import type { ContentCalendarItemDto, ConsultationSessionDetailDto } from "@/contracts/consultation";
import type { ContentDraftBundleDto } from "@/contracts/draft";
import type { MaterialLibraryItemDto } from "@/contracts/material";

type ArticleMode = "create" | "rewrite";
type ArticleToneStyle = "专业干货" | "知心闺蜜" | "痛点唤醒";
type ArticlePlaybook =
  | "balanced_seed"
  | "viral_generation"
  | "traffic_rewrite"
  | "compliance_safe"
  | "ip_persona";
type RevisionResponse = {
  variant?: NonNullable<ContentDraftBundleDto["selectedVariant"]>;
  llmTrace?: {
    mode?: string;
  };
  error?: { message?: string };
};

const toneStyles: ArticleToneStyle[] = ["专业干货", "知心闺蜜", "痛点唤醒"];
const articlePlaybooks: Array<{
  value: ArticlePlaybook;
  label: string;
  description: string;
}> = [
  {
    value: "balanced_seed",
    label: "稳妥种草",
    description: "平衡小红书表达和合规风险",
  },
  {
    value: "viral_generation",
    label: "爆款生成",
    description: "更重标题钩子、情绪表达和 Tags",
  },
  {
    value: "traffic_rewrite",
    label: "流量重构",
    description: "更重结构拆解和对标迁移",
  },
  {
    value: "compliance_safe",
    label: "风控安全版",
    description: "适合敏感行业的克制表达",
  },
  {
    value: "ip_persona",
    label: "IP 人设强化",
    description: "强化主理人、老师和门店人格",
  },
];

export function ArticleWorkbench({
  sessionId,
  source,
  calendarItemId,
  materialId,
  materialReferenceId,
  initialMode,
  strategyTag,
}: {
  sessionId?: string | null;
  source?: string | null;
  calendarItemId?: string | null;
  materialId?: string | null;
  materialReferenceId?: string | null;
  initialMode?: ArticleMode | null;
  strategyTag?: string | null;
}) {
  const [mode, setMode] = useState<ArticleMode>(
    materialId || initialMode === "rewrite" ? "rewrite" : "create",
  );
  const [session, setSession] = useState<ConsultationSessionDetailDto | null>(null);
  const [referenceMaterial, setReferenceMaterial] = useState<MaterialLibraryItemDto | null>(null);
  const [goal, setGoal] = useState("");
  const [extraRequirement, setExtraRequirement] = useState("");
  const [toneStyle, setToneStyle] = useState<ArticleToneStyle>("专业干货");
  const [articlePlaybook, setArticlePlaybook] = useState<ArticlePlaybook>("balanced_seed");
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [draftBundle, setDraftBundle] = useState<ContentDraftBundleDto | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(Boolean(sessionId));
  const [generating, setGenerating] = useState(false);
  const [revising, setRevising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSession = useCallback(async function loadSession(nextSessionId: string) {
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
      const selectedCalendarItem = resolveSelectedCalendarItem(data.session, calendarItemId);
      setGoal(
        selectedCalendarItem?.summary ??
          data.session.strategySnapshot.articleBrief?.angle ??
          data.session.summaryText ??
          "",
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "咨询上下文加载失败");
    } finally {
      setLoadingSession(false);
    }
  }, [calendarItemId]);

  const loadReferenceMaterial = useCallback(async function loadReferenceMaterial(
    nextMaterialId: string,
  ) {
    try {
      const response = await fetch("/api/materials", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        materials?: MaterialLibraryItemDto[];
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(data.error?.message ?? "参考素材加载失败");
      }

      setReferenceMaterial(data.materials?.find((item) => item.id === nextMaterialId) ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "参考素材加载失败");
    }
  }, []);

  async function generateDraft() {
    if (!sessionId) {
      setError("请先从咨询页进入图文工作台。");
      return;
    }

    if (mode === "rewrite" && !referenceMaterial && !materialId) {
      setError("改写模式需要先从素材库选择一条参考素材。");
      return;
    }

    setGenerating(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/content/article-drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          source,
          calendarItemId,
          goal,
          extraRequirement,
          toneStyle,
          mode,
          materialId: mode === "rewrite" ? referenceMaterial?.id ?? materialId ?? null : null,
          materialReferenceId: mode === "rewrite" ? materialReferenceId ?? null : null,
          strategyTag,
          articlePlaybook,
        }),
      });
      const data = (await response.json()) as {
        draftBundle?: ContentDraftBundleDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.draftBundle) {
        throw new Error(data.error?.message ?? "图文草稿生成失败");
      }

      setDraftBundle(data.draftBundle);
      setSelectedVariantId(data.draftBundle.selectedVariant?.id ?? null);
      const traceMode = readTraceMode(data.draftBundle.draft.inputSnapshot);
      if (traceMode && traceMode !== "llm") {
        setNotice("AI 生成服务暂不可用，已先生成一版可编辑草稿。");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "图文草稿生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function reviseDraft() {
    if (!selectedVariant) {
      setError("请先选择一个已有版本。");
      return;
    }

    if (!revisionInstruction.trim()) {
      setError("请先填写修改意见。");
      return;
    }

    setRevising(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/content/article-drafts/revisions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentVariantId: selectedVariant.id,
          revisionInstruction,
          toneStyle,
        }),
      });
      const data = (await response.json()) as RevisionResponse;

      if (!response.ok || !data.variant) {
        throw new Error(data.error?.message ?? "图文版本修订失败");
      }

      const revisedVariant = data.variant;

      setDraftBundle((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          draft: {
            ...current.draft,
            selectedVariantId: revisedVariant.id,
          },
          variants: [...current.variants, revisedVariant],
          selectedVariant: revisedVariant,
        };
      });
      setSelectedVariantId(revisedVariant.id);
      setRevisionInstruction("");

      if (data.llmTrace?.mode && data.llmTrace.mode !== "llm") {
        setNotice("AI 生成服务暂不可用，已先追加一版可编辑草稿。");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "图文版本修订失败");
    } finally {
      setRevising(false);
    }
  }

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSession(sessionId);
  }, [loadSession, sessionId]);

  useEffect(() => {
    if (!materialId) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReferenceMaterial(materialId);
  }, [loadReferenceMaterial, materialId]);

  const selectedVariant = draftBundle
    ? draftBundle.variants.find((variant) => variant.id === selectedVariantId) ??
      draftBundle.selectedVariant ??
      null
    : null;
  const selectedCalendarItem = resolveSelectedCalendarItem(session, calendarItemId);
  const snapshot = draftBundle?.draft.inputSnapshot ?? null;
  const coverCopySuggestions = readStringArray(snapshot, "coverCopySuggestions");
  const imageStructureSuggestions = readStringArray(snapshot, "imageStructureSuggestions");
  const riskNotes = readStringArray(snapshot, "riskNotes");
  const writingNotes = readStringArray(snapshot, "writingNotes");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="rounded-lg p-2 text-white/45 hover:bg-white/5 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl tracking-tight [font-family:var(--font-cormorant)]">
              图文工作台
            </h1>
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">小红书笔记</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden rounded-xl bg-white/5 p-1 md:flex">
            {[
              ["create", "从 0 到 1创作"],
              ["rewrite", "基于素材改写"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value as "create" | "rewrite")}
                className={
                  mode === value
                    ? "rounded-lg bg-[#0a0a0a] px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-500"
                    : "rounded-lg px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white/75"
                }
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              void generateDraft();
            }}
            disabled={generating || loadingSession}
            className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-amber-500 disabled:opacity-60"
          >
            {generating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            {draftBundle ? "重新生成" : mode === "rewrite" ? "开始改写" : "开始创作"}
          </button>
          <Link
            href="/dashboard/history"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-white/65"
          >
            去历史页
          </Link>
        </div>
      </div>

      {error ? (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-6 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-6 py-3 text-sm text-amber-100">
          {notice}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[380px] shrink-0 flex-col border-r border-white/10 bg-[#0a0a0a]">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            <section>
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">已带入策略</p>
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-white/75">
                <p>{session?.strategySnapshot.positioning ?? "请先完成咨询后再进入图文工作台。"}</p>
              </div>
            </section>

            {selectedCalendarItem ? (
              <section>
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">已带入日历卡片</p>
                <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-white/55">
                      {selectedCalendarItem.dayLabel}
                    </span>
                    <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-orange-300">
                      {selectedCalendarItem.strategyTag}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-medium leading-6 text-white">
                    {selectedCalendarItem.title}
                  </p>
                  <p className="mt-2 text-xs leading-6 text-white/55">
                    {selectedCalendarItem.summary}
                  </p>
                </div>
              </section>
            ) : null}

            {mode === "rewrite" ? (
              <section>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">参考素材</p>
                  <Link href="/dashboard/content" className="text-[10px] uppercase tracking-[0.2em] text-amber-500">
                    {referenceMaterial ? "更换素材" : "打开素材库"}
                  </Link>
                </div>
                <div className="mt-3 flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/30">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-serif text-white/80">
                      {referenceMaterial?.title ?? "请先从素材库选择一条参考素材"}
                    </p>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/45">
                      {referenceMaterial?.description ??
                        "改写模式会把素材拆解、原文结构和互动表现带入生成上下文。"}
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            <section>
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">内容目标</p>
              <textarea
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                rows={4}
                className="mt-3 w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none"
              />
            </section>

            <section>
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">创作策略</p>
              <div className="mt-3 grid gap-2">
                {articlePlaybooks.map((playbook) => {
                  const selected = articlePlaybook === playbook.value;

                  return (
                    <button
                      key={playbook.value}
                      type="button"
                      onClick={() => setArticlePlaybook(playbook.value)}
                      className={
                        selected
                          ? "rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-left"
                          : "rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition-colors hover:border-white/20 hover:bg-white/10"
                      }
                    >
                      <span className={selected ? "text-sm text-amber-200" : "text-sm text-white/75"}>
                        {playbook.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-white/40">
                        {playbook.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">附加要求</p>
              <textarea
                value={extraRequirement}
                onChange={(event) => setExtraRequirement(event.target.value)}
                rows={5}
                placeholder="例如：更口语一点，末尾引导预约体验课，强调门店环境和信任感。"
                className="mt-3 w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none placeholder:text-white/25"
              />
            </section>

            <section>
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">平台风格与口吻</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {toneStyles.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setToneStyle(tag)}
                    className={
                      toneStyle === tag
                        ? "rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-500"
                        : "rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/55"
                    }
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">内容标签</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {session?.strategySnapshot.strategyTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          </div>
          <div className="shrink-0 border-t border-white/10 bg-[#070707] p-5">
            <button
              type="button"
              onClick={() => {
                void generateDraft();
              }}
              disabled={generating || loadingSession}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600/80 px-5 py-3 text-[10px] uppercase tracking-[0.25em] text-white shadow-[0_18px_60px_rgba(180,83,9,0.22)] transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <PenLine className="h-4 w-4" />
              )}
              {generating
                ? mode === "rewrite"
                  ? "正在改写..."
                  : "正在创作..."
                : mode === "rewrite"
                  ? "开始改写"
                  : "开始创作"}
            </button>
          </div>
        </aside>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 lg:px-12">
          {loadingSession ? (
            <div className="flex h-full items-center justify-center text-sm text-white/40">
              正在读取咨询上下文...
            </div>
          ) : draftBundle && selectedVariant ? (
            <div className="mx-auto max-w-4xl space-y-8">
              <section className="rounded-3xl border border-white/10 bg-[#111111]">
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">标题方案</p>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-400">已保存到记录</p>
                </div>
                <div className="space-y-3 p-6">
                  {draftBundle.variants.map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => setSelectedVariantId(variant.id)}
                      className={
                        variant.id === selectedVariant.id
                          ? "w-full rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-left text-lg text-white"
                          : "w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-lg text-white/75"
                      }
                    >
                      {variant.title}
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-[#111111]">
                <div className="border-b border-white/10 px-6 py-4">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">正文与排版</p>
                </div>
                <div className="whitespace-pre-wrap px-8 py-8 text-base leading-8 text-white/85">
                  {selectedVariant.bodyText}
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-[#111111]">
                <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">自然语言修改</p>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-white/30">
                    追加新版本
                  </p>
                </div>
                <div className="space-y-4 p-6">
                  <textarea
                    value={revisionInstruction}
                    onChange={(event) => setRevisionInstruction(event.target.value)}
                    rows={4}
                    placeholder="例如：更口语一点，开头别太吓人，强调门店环境。"
                    className="w-full rounded-2xl border border-white/10 bg-[#050505] px-4 py-3 text-sm text-white outline-none placeholder:text-white/25"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        void reviseDraft();
                      }}
                      disabled={revising || !revisionInstruction.trim()}
                      className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {revising ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <PenLine className="h-3.5 w-3.5" />
                      )}
                      {revising ? "正在修改..." : "按要求修改"}
                    </button>
                  </div>
                </div>
              </section>

              <section className="grid gap-6 lg:grid-cols-2">
                <section className="rounded-3xl border border-white/10 bg-[#111111] p-6">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">话题标签</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedVariant.hashtags.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </section>
                <section className="rounded-3xl border border-white/10 bg-[#111111] p-6">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">配图建议</p>
                  <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-white/75">
                    {(imageStructureSuggestions.length
                      ? imageStructureSuggestions
                      : [
                          "封面优先使用强对比痛点提问，标题与正文主张一致。",
                          "中间页重点展示商家差异点和真实场景，不要堆抽象词。",
                          "最后一页保留明确 CTA，和笔记末尾动作一致。",
                        ]
                    ).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              </section>

              <section className="grid gap-6 lg:grid-cols-3">
                <InsightList
                  title="封面花字"
                  items={coverCopySuggestions}
                  emptyText="本次未返回单独封面花字，可直接沿用推荐标题。"
                />
                <InsightList
                  title="风控提醒"
                  items={riskNotes.length ? riskNotes : ["未发现明显高危表达"]}
                  emptyText="未发现明显高危表达"
                />
                <InsightList
                  title="写作说明"
                  items={writingNotes}
                  emptyText="系统已按当前创作策略生成可编辑草稿。"
                />
              </section>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-lg text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-amber-500">
                  <PenLine className="h-7 w-7" />
                </div>
                <p className="text-2xl text-white [font-family:var(--font-cormorant)]">图文草稿还没生成</p>
                <p className="mt-3 text-sm leading-7 text-white/45">
                  这里会把咨询页沉淀下来的策略快照转换成真实的 `content_drafts / content_variants`
                  记录，并直接展示两个可切换的标题与正文版本。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function resolveSelectedCalendarItem(
  session: ConsultationSessionDetailDto | null,
  calendarItemId?: string | null,
): ContentCalendarItemDto | null {
  if (!session || !calendarItemId) {
    return null;
  }

  return (
    session.strategySnapshot.contentCalendarDraft.find((item) => item.id === calendarItemId) ??
    null
  );
}

function InsightList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  const visibleItems = items.length ? items : [emptyText];

  return (
    <section className="rounded-3xl border border-white/10 bg-[#111111] p-6">
      <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">{title}</p>
      <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-white/75">
        {visibleItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function readStringArray(snapshot: Record<string, unknown> | null | undefined, key: string) {
  const value = snapshot?.[key];

  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function readTraceMode(snapshot?: Record<string, unknown> | null) {
  const trace = snapshot?.llmTrace;

  if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
    return null;
  }

  const mode = (trace as Record<string, unknown>).mode;
  return typeof mode === "string" ? mode : null;
}
