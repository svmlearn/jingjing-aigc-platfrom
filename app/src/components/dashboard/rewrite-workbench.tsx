"use client";

import Link from "next/link";
import { CheckCircle2, Sparkles, Store, Wand2 } from "lucide-react";
import { useState } from "react";

import type { Platform } from "@/contracts/import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getComments,
  getCommentSummary,
  getSourceItem,
  merchantProfile,
  rewriteSourceItem,
  sourceThumbnails,
  type RewriteResult,
} from "@/lib/ui/mock-api";
import { platformLabel } from "@/lib/ui/format";

const rewriteGoals = ["本地化种草", "活动引流", "抖音口播", "评论答疑"];

export function RewriteWorkbench({ sourceItemId }: { sourceItemId: string }) {
  const sourceItem = getSourceItem(sourceItemId);
  const comments = getComments(sourceItemId);
  const sourceCommentSummary = getCommentSummary(sourceItemId);
  const [targetPlatform, setTargetPlatform] = useState<Platform>(sourceItem.platform);
  const [goal, setGoal] = useState(rewriteGoals[0]);
  const [prompt, setPrompt] = useState("突出低刺激、流程时长、不强制办卡，语气像真实门店顾问。");
  const [result, setResult] = useState<RewriteResult | null>(null);
  const [savedVariantId, setSavedVariantId] = useState<string | null>(null);

  function handleRewrite() {
    setResult(rewriteSourceItem(sourceItemId));
    setSavedVariantId(null);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <section className="grid gap-5">
        <div className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <div
              role="img"
              aria-label={sourceItem.title ?? "来源内容封面"}
              className="h-40 w-full rounded-md bg-cover bg-center md:h-full"
              style={{ backgroundImage: `url(${sourceThumbnails[sourceItem.id]})` }}
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-md border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]">
                  {platformLabel[sourceItem.platform]}
                </Badge>
                <Badge className="rounded-md border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]">
                  {comments.length} 条评论
                </Badge>
              </div>
              <h2 className="mt-3 text-xl font-semibold">{sourceItem.title ?? "导入内容不完整"}</h2>
              <p className="mt-3 line-clamp-4 text-sm leading-7 text-[#435364]">
                {sourceItem.bodyText ?? sourceItem.scriptText ?? "暂无正文，建议重新导入完整链接。"}
              </p>
            </div>
          </div>
        </div>

        <section className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[#0f766e]" aria-hidden="true" />
            <h2 className="text-lg font-semibold">生成结果</h2>
          </div>

          {!result ? (
            <div className="mt-5 rounded-md border border-dashed border-[#b7c4d2] bg-[#f8fafc] p-6 text-center">
              <p className="text-sm text-[#5d6b7a]">先确认右侧改写设置，再生成 2 个可编辑版本。</p>
              <Button onClick={handleRewrite} className="mt-4 h-10 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]">
                <Wand2 className="size-4" />
                生成改写
              </Button>
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {result.variants.map((variant) => (
                <article key={variant.id} className="rounded-md border border-[#dde3ea] bg-[#fbfcfd] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge className="rounded-md border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]">
                        版本 {variant.versionNo}
                      </Badge>
                      <Badge className="rounded-md border-[#cbd5e1] bg-white text-[#475569]">
                        {platformLabel[targetPlatform]}
                      </Badge>
                    </div>
                    {savedVariantId === variant.id ? (
                      <span className="flex items-center gap-1 text-sm text-[#166534]">
                        <CheckCircle2 className="size-4" />
                        已保存
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-3 text-base font-semibold">{variant.title}</h3>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#435364]">
                    {variant.bodyText ?? variant.scriptText}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {variant.hashtags.map((tag) => (
                      <span key={tag} className="rounded-md bg-[#e6fffb] px-2 py-1 text-xs text-[#0f766e]">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-sm font-medium text-[#17202a]">{variant.ctaText}</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      className="h-10 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                      onClick={() => setSavedVariantId(variant.id)}
                    >
                      保存为草稿
                    </Button>
                    <Button variant="outline" className="h-10 rounded-md" asChild>
                      <Link href={`/dashboard/drafts/${result.draft.id}`}>打开草稿详情</Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      <aside className="grid gap-5 xl:sticky xl:top-6 xl:self-start">
        <section className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Store className="size-4 text-[#0f766e]" aria-hidden="true" />
            <h2 className="font-semibold">商户资料摘要</h2>
          </div>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-[#5d6b7a]">商户</dt>
              <dd className="mt-1 font-medium">{merchantProfile.name}</dd>
            </div>
            <div>
              <dt className="text-[#5d6b7a]">地址</dt>
              <dd className="mt-1">{merchantProfile.address}</dd>
            </div>
            <div>
              <dt className="text-[#5d6b7a]">服务项目</dt>
              <dd className="mt-1 leading-6">{merchantProfile.services}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm">
          <h2 className="font-semibold">改写设置</h2>
          <div className="mt-4 grid gap-4">
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">目标平台</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["xiaohongshu", "douyin"] as Platform[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTargetPlatform(item)}
                    className={`min-h-10 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2563eb]/30 ${
                      targetPlatform === item
                        ? "border-[#2563eb] bg-[#e8f1ff] text-[#1d4ed8]"
                        : "border-[#dde3ea] text-[#435364] hover:bg-[#f8fafc]"
                    }`}
                  >
                    {platformLabel[item]}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">改写方向</legend>
              <div className="grid grid-cols-2 gap-2">
                {rewriteGoals.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setGoal(item)}
                    className={`min-h-10 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2563eb]/30 ${
                      goal === item
                        ? "border-[#0f766e] bg-[#e6fffb] text-[#0f766e]"
                        : "border-[#dde3ea] text-[#435364] hover:bg-[#f8fafc]"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-2">
              <Label htmlFor="rewrite-prompt">补充要求</Label>
              <Textarea
                id="rewrite-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-28"
              />
            </div>

            <div className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-3">
              <p className="text-sm font-medium">评论摘要</p>
              <p className="mt-2 text-sm leading-6 text-[#5d6b7a]">
                {result?.commentSummary ?? sourceCommentSummary}
              </p>
            </div>

            <Button onClick={handleRewrite} className="h-11 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]">
              <Wand2 className="size-4" />
              重新生成
            </Button>
          </div>
        </section>
      </aside>
    </div>
  );
}
