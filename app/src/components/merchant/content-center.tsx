"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Video } from "lucide-react";

import type { ContentDraftBundleDto } from "@/contracts/draft";
import { cn } from "@/lib/utils";

export function MerchantContentCenter() {
  const [draftBundles, setDraftBundles] = useState<ContentDraftBundleDto[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDrafts() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/content/records", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        draftBundles?: ContentDraftBundleDto[];
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(data.error?.message ?? "内容记录加载失败");
      }

      const bundles = data.draftBundles ?? [];
      setDraftBundles(bundles);
      if (bundles[0]) {
        setSelectedDraftId(bundles[0].draft.id);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "内容记录加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDrafts();
  }, []);

  const selectedBundle = useMemo(() => {
    return (
      draftBundles.find((bundle) => bundle.draft.id === selectedDraftId) ??
      draftBundles[0] ??
      null
    );
  }, [draftBundles, selectedDraftId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-6">
        <div>
          <h1 className="text-xl tracking-tight [font-family:var(--font-cormorant)]">内容中心</h1>
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">真实草稿与脚本资产</p>
        </div>
      </div>

      {error ? (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-6 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="w-[360px] shrink-0 border-r border-white/10 bg-[#0a0a0a] p-5">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-white/40">正在读取内容资产...</div>
          ) : draftBundles.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm leading-7 text-white/45">
              还没有真实内容记录。请先从咨询页进入图文或视频工作台生成草稿。
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto">
              {draftBundles.map((bundle) => {
                const isVideo = bundle.selectedVariant?.variantType === "video_script";

                return (
                  <button
                    key={bundle.draft.id}
                    type="button"
                    onClick={() => setSelectedDraftId(bundle.draft.id)}
                    className={cn(
                      "w-full rounded-2xl border p-4 text-left transition-colors",
                      selectedBundle?.draft.id === bundle.draft.id
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-white/10 p-3 text-white/60">
                        {isVideo ? <Video className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-sm text-white">{bundle.draft.workingTitle}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-white/35">
                          {isVideo ? "视频脚本" : "图文草稿"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 lg:px-12">
          {selectedBundle ? (
            <div className="mx-auto max-w-4xl space-y-6">
              <section className="rounded-3xl border border-white/10 bg-[#111111] p-6">
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">主内容</p>
                <h2 className="mt-3 text-3xl text-white [font-family:var(--font-cormorant)]">
                  {selectedBundle.selectedVariant?.title ?? selectedBundle.draft.workingTitle}
                </h2>
                <p className="mt-3 text-sm leading-7 text-white/45">
                  状态: {selectedBundle.draft.status} · 版本数: {selectedBundle.variants.length}
                </p>
              </section>

              <section className="rounded-3xl border border-white/10 bg-[#111111] p-8 text-sm leading-7 text-white/80 whitespace-pre-wrap">
                {selectedBundle.selectedVariant?.bodyText ??
                  selectedBundle.selectedVariant?.scriptText ??
                  "暂无正文内容。"}
              </section>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-white/40">请选择左侧内容资产。</div>
          )}
        </div>
      </div>
    </div>
  );
}
