import Link from "next/link";
import { ExternalLink, MessageSquare, PenLine, RotateCcw } from "lucide-react";

import type { SourceItemDto } from "@/contracts/content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getComments, sourceThumbnails } from "@/lib/ui/mock-api";
import { getMetric, getQualityWarning, platformLabel } from "@/lib/ui/format";

export function ContentDetail({ sourceItem }: { sourceItem: SourceItemDto }) {
  const comments = getComments(sourceItem.id);
  const warning = getQualityWarning(sourceItem.title, sourceItem.bodyText, sourceItem.scriptText);

  return (
    <article className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div
          role="img"
          aria-label={sourceItem.title ?? "导入内容封面"}
          className="h-44 w-full rounded-md bg-cover bg-center md:h-full"
          style={{ backgroundImage: `url(${sourceThumbnails[sourceItem.id]})` }}
        />
        <div className="rounded-md border border-[#dde3ea] bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-md border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]">
              {platformLabel[sourceItem.platform]}
            </Badge>
            <Badge className="rounded-md border-[#cbd5e1] bg-[#f8fafc] text-[#475569]">
              {sourceItem.sourceType === "creator" ? "博主主页导入" : "单条内容"}
            </Badge>
          </div>
          <h2 className="mt-3 text-xl font-semibold">{sourceItem.title ?? "导入内容不完整"}</h2>
          <p className="mt-2 text-sm text-[#5d6b7a]">
            {sourceItem.creatorName ?? "未知作者"} / {sourceItem.sourceUrl ?? "暂无原链接"}
          </p>
          {warning ? (
            <p className="mt-4 rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-sm text-[#92400e]">
              {warning}
            </p>
          ) : null}
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-md bg-[#f8fafc] p-3">
              <p className="text-[#5d6b7a]">点赞</p>
              <p className="mt-1 font-semibold">{getMetric(sourceItem.engagementSnapshot, "likes")}</p>
            </div>
            <div className="rounded-md bg-[#f8fafc] p-3">
              <p className="text-[#5d6b7a]">评论</p>
              <p className="mt-1 font-semibold">{comments.length}</p>
            </div>
            <div className="rounded-md bg-[#f8fafc] p-3">
              <p className="text-[#5d6b7a]">收藏/分享</p>
              <p className="mt-1 font-semibold">
                {getMetric(sourceItem.engagementSnapshot, "collects") ||
                  getMetric(sourceItem.engagementSnapshot, "shares")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <section className="rounded-md border border-[#dde3ea] bg-white p-4">
        <h3 className="font-semibold">正文</h3>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#435364]">
          {sourceItem.bodyText ?? sourceItem.scriptText ?? "暂无正文，建议重新复制平台页面里的完整链接后再试。"}
        </p>
      </section>

      <section className="rounded-md border border-[#dde3ea] bg-white p-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-[#0f766e]" aria-hidden="true" />
          <h3 className="font-semibold">评论洞察</h3>
        </div>
        <p className="mt-3 text-sm leading-7 text-[#435364]">
          评论集中在「会不会刺痛」「能不能快速完成」「是否强推办卡」三类顾虑。改写时适合强调先检测、低刺激、流程时长和不强制办卡。
        </p>
        <div className="mt-4 grid gap-3">
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-md border border-[#dde3ea] bg-[#f8fafc] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5d6b7a]">
                <span>{comment.authorName ?? "匿名用户"}</span>
                <span>{comment.likeCount} 赞 / {comment.replyCount} 回复</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#17202a]">{comment.content}</p>
            </div>
          ))}
          {comments.length === 0 ? (
            <p className="rounded-md border border-[#dde3ea] bg-[#f8fafc] px-3 py-3 text-sm text-[#5d6b7a]">
              暂无评论，稍后可以重试评论导入。
            </p>
          ) : null}
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button className="h-10 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]" asChild>
          <Link href={`/dashboard/rewrite/${sourceItem.id}`}>
            <PenLine className="size-4" />
            进入改写
          </Link>
        </Button>
        <Button variant="outline" className="h-10 rounded-md">
          <RotateCcw className="size-4" />
          重试评论
        </Button>
        {sourceItem.sourceUrl ? (
          <Button variant="outline" className="h-10 rounded-md" asChild>
            <a href={sourceItem.sourceUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              打开原链接
            </a>
          </Button>
        ) : null}
      </div>
    </article>
  );
}
