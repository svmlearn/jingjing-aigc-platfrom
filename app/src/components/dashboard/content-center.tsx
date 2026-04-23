"use client";

import Link from "next/link";
import { Eye, FileText, MessageSquare, PenLine, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { SourceItemDto } from "@/contracts/content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContentDetail } from "@/components/dashboard/content-detail";
import {
  contentDrafts,
  contentVariants,
  getComments,
  sourceItems,
  sourceThumbnails,
} from "@/lib/ui/mock-api";
import { getQualityWarning, platformLabel } from "@/lib/ui/format";

export function ContentCenter() {
  const [tab, setTab] = useState<"sources" | "drafts">("sources");
  const [selectedItem, setSelectedItem] = useState<SourceItemDto | null>(sourceItems[0]);

  const rewrittenSourceIds = useMemo(
    () => new Set(contentDrafts.map((draft) => draft.sourceItemId)),
    []
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
      <section className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[#dde3ea] pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">资产列表</h2>
            <p className="mt-1 text-sm text-[#5d6b7a]">导入内容和草稿分开看，入口仍在同一个内容中心。</p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-md bg-[#f1f5f9] p-1">
            <button
              type="button"
              onClick={() => setTab("sources")}
              className={`min-h-10 rounded-md px-3 text-sm font-medium transition-colors ${
                tab === "sources" ? "bg-white text-[#17202a] shadow-sm" : "text-[#5d6b7a]"
              }`}
            >
              导入内容
            </button>
            <button
              type="button"
              onClick={() => setTab("drafts")}
              className={`min-h-10 rounded-md px-3 text-sm font-medium transition-colors ${
                tab === "drafts" ? "bg-white text-[#17202a] shadow-sm" : "text-[#5d6b7a]"
              }`}
            >
              改写草稿
            </button>
          </div>
        </div>

        {tab === "sources" ? (
          <div className="mt-5 grid gap-3">
            {sourceItems.map((item) => {
              const warning = getQualityWarning(item.title, item.bodyText, item.scriptText);
              const comments = getComments(item.id);
              const rewritten = rewrittenSourceIds.has(item.id);

              return (
                <article
                  key={item.id}
                  className="grid gap-4 rounded-md border border-[#dde3ea] bg-[#fbfcfd] p-3 transition-colors hover:border-[#b7c4d2] md:grid-cols-[132px_1fr]"
                >
                  <div
                    role="img"
                    aria-label={item.title ?? "导入内容封面"}
                    className="h-28 w-full rounded-md bg-cover bg-center md:h-full"
                    style={{ backgroundImage: `url(${sourceThumbnails[item.id]})` }}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-md border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]">
                        {platformLabel[item.platform]}
                      </Badge>
                      <Badge className="rounded-md border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]">
                        {comments.length} 条评论
                      </Badge>
                      <Badge className="rounded-md border-[#cbd5e1] bg-white text-[#475569]">
                        {rewritten ? "已改写" : "未改写"}
                      </Badge>
                    </div>
                    <h3 className="mt-3 truncate text-base font-semibold">
                      {item.title ?? "导入内容不完整"}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#5d6b7a]">
                      {item.bodyText ?? item.scriptText ?? warning}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-md"
                        onClick={() => setSelectedItem(item)}
                      >
                        <Eye className="size-4" />
                        预览
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-md" asChild>
                        <Link href={`/dashboard/content/${item.id}`}>
                          <FileText className="size-4" />
                          详情
                        </Link>
                      </Button>
                      <Button size="sm" className="rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]" asChild>
                        <Link href={`/dashboard/rewrite/${item.id}`}>
                          <PenLine className="size-4" />
                          改写
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-md">
                        <MessageSquare className="size-4" />
                        重试评论
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            {contentDrafts.map((draft) => {
              const selectedVariant = contentVariants.find((variant) => variant.id === draft.selectedVariantId);
              return (
                <article key={draft.id} className="rounded-md border border-[#dde3ea] bg-[#fbfcfd] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-md border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]">草稿</Badge>
                    <Badge className="rounded-md border-[#cbd5e1] bg-white text-[#475569]">{draft.status}</Badge>
                  </div>
                  <h3 className="mt-3 text-base font-semibold">{draft.workingTitle}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#5d6b7a]">
                    {selectedVariant?.bodyText}
                  </p>
                  <Button className="mt-4 h-10 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]" asChild>
                    <Link href={`/dashboard/drafts/${draft.id}`}>打开草稿</Link>
                  </Button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <aside className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-auto">
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-[#dde3ea] pb-4">
          <div>
            <h2 className="font-semibold">内容预览抽屉</h2>
            <p className="mt-1 text-sm text-[#5d6b7a]">桌面端常驻，移动端在列表下方展示。完整信息可进入详情页。</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedItem ? (
              <Button variant="outline" size="sm" className="rounded-md" asChild>
                <Link href={`/dashboard/content/${selectedItem.id}`}>
                  <Eye className="size-4" />
                  详情页
                </Link>
              </Button>
            ) : null}
            {selectedItem ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-md"
                aria-label="关闭详情"
                onClick={() => setSelectedItem(null)}
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
        {selectedItem ? (
          <ContentDetail sourceItem={selectedItem} />
        ) : (
          <p className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-4 text-sm text-[#5d6b7a]">
            从左侧选择一条内容做快速预览，或进入详情页继续判断是否改写。
          </p>
        )}
      </aside>
    </div>
  );
}
