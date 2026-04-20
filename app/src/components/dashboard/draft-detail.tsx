"use client";

import Link from "next/link";
import { CheckCircle2, Save } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getDraftBundle, saveDraft } from "@/lib/ui/mock-api";
import { platformLabel } from "@/lib/ui/format";

export function DraftDetail({ draftId }: { draftId: string }) {
  const bundle = getDraftBundle(draftId);
  const selectedVariant = bundle.variants[0];
  const [title, setTitle] = useState(selectedVariant.title ?? "");
  const [body, setBody] = useState(selectedVariant.bodyText ?? selectedVariant.scriptText ?? "");
  const [hashtags, setHashtags] = useState(selectedVariant.hashtags.join(" "));
  const [cta, setCta] = useState(selectedVariant.ctaText ?? "");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavedAt(saveDraft(bundle.draft.id).updatedAt);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <form className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm" onSubmit={handleSave}>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#dde3ea] pb-4">
          <Badge className="rounded-md border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]">
            {platformLabel[selectedVariant.platform]}
          </Badge>
          <Badge className="rounded-md border-[#cbd5e1] bg-[#f8fafc] text-[#475569]">
            {bundle.draft.status}
          </Badge>
          {savedAt ? (
            <span className="flex items-center gap-1 text-sm text-[#166534]">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              已保存于 {savedAt}
            </span>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="draft-title">标题</Label>
            <Input id="draft-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="draft-body">正文</Label>
            <Textarea
              id="draft-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-72"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="draft-tags">话题</Label>
            <Input id="draft-tags" value={hashtags} onChange={(event) => setHashtags(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="draft-cta">行动引导</Label>
            <Input id="draft-cta" value={cta} onChange={(event) => setCta(event.target.value)} />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button type="submit" className="h-11 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]">
            <Save className="size-4" />
            保存草稿
          </Button>
          <Button variant="outline" className="h-11 rounded-md" asChild>
            <Link href={`/dashboard/rewrite/${bundle.sourceItem.id}`}>回到改写</Link>
          </Button>
        </div>
      </form>

      <aside className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm xl:self-start">
        <h2 className="font-semibold">来源内容</h2>
        <p className="mt-3 text-sm font-medium">{bundle.sourceItem.title}</p>
        <p className="mt-2 line-clamp-5 text-sm leading-6 text-[#5d6b7a]">
          {bundle.sourceItem.bodyText ?? bundle.sourceItem.scriptText}
        </p>
        <div className="mt-5 rounded-md border border-[#dde3ea] bg-[#f8fafc] p-3 text-sm text-[#5d6b7a]">
          发布账号、审核流和排期暂不进入 V0.1-A。当前只确认草稿可以编辑和保存。
        </div>
      </aside>
    </div>
  );
}
