"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText, RefreshCw } from "lucide-react";

import type { ConsultationSessionDetailDto } from "@/contracts/consultation";
import type { ContentDraftBundleDto } from "@/contracts/draft";

export function ArticleWorkbench({ sessionId }: { sessionId?: string | null }) {
  const [session, setSession] = useState<ConsultationSessionDetailDto | null>(null);
  const [goal, setGoal] = useState("");
  const [extraRequirement, setExtraRequirement] = useState("");
  const [draftBundle, setDraftBundle] = useState<ContentDraftBundleDto | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(Boolean(sessionId));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        throw new Error(data.error?.message ?? "咨询上下文加载失败");
      }

      setSession(data.session);
      setGoal(data.session.strategySnapshot.articleBrief?.angle ?? data.session.summaryText ?? "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "咨询上下文加载失败");
    } finally {
      setLoadingSession(false);
    }
  }

  async function generateDraft() {
    if (!sessionId) {
      setError("请先从咨询页进入图文工作台。");
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/content/article-drafts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          goal,
          extraRequirement,
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
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "图文草稿生成失败");
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSession(sessionId);
  }, [sessionId]);

  const selectedVariant = useMemo(() => {
    if (!draftBundle) {
      return null;
    }

    return (
      draftBundle.variants.find((variant) => variant.id === selectedVariantId) ??
      draftBundle.selectedVariant ??
      null
    );
  }, [draftBundle, selectedVariantId]);

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
          <button
            type="button"
            onClick={() => {
              void generateDraft();
            }}
            disabled={generating || loadingSession}
            className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-amber-500 disabled:opacity-60"
          >
            {generating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            {draftBundle ? "重新生成" : "生成草稿"}
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

      <div className="flex min-h-0 flex-1">
        <aside className="w-[380px] shrink-0 border-r border-white/10 bg-[#0a0a0a] p-6">
          <div className="space-y-5">
            <section>
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">已带入策略</p>
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-white/75">
                <p>{session?.strategySnapshot.positioning ?? "请先完成咨询后再进入图文工作台。"}</p>
              </div>
            </section>

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
                    <li>封面优先使用强对比痛点提问，标题与正文主张一致。</li>
                    <li>中间页重点展示商家差异点和真实场景，不要堆抽象词。</li>
                    <li>最后一页保留明确 CTA，和笔记末尾动作一致。</li>
                  </ul>
                </section>
              </section>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-lg text-center">
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
