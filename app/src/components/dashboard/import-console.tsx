"use client";

import Link from "next/link";
import { CheckCircle2, CircleAlert, Loader2, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import type { ImportJobDto, ImportRequest, ImportType, Platform } from "@/contracts/import";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createImportJob, importJobs } from "@/lib/ui/mock-api";
import { importTypeLabel, platformLabel, statusLabel } from "@/lib/ui/format";

const statusTone: Record<ImportJobDto["status"], string> = {
  pending: "border-[#cbd5e1] bg-[#f8fafc] text-[#475569]",
  running: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
  succeeded: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
  partial: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
  failed: "border-[#fecdd3] bg-[#fff1f2] text-[#be123c]",
};

export function ImportConsole() {
  const [platform, setPlatform] = useState<Platform>("xiaohongshu");
  const [importType, setImportType] = useState<ImportType>("detail");
  const [includeComments, setIncludeComments] = useState(true);
  const [maxComments, setMaxComments] = useState(30);
  const [url, setUrl] = useState("https://www.xiaohongshu.com/explore/661f9e9c000000001b00a120");
  const [jobs, setJobs] = useState<ImportJobDto[]>(importJobs);
  const [submitted, setSubmitted] = useState(false);

  const activeJob = useMemo(() => jobs.find((job) => job.status === "running"), [jobs]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request: ImportRequest = {
      platform,
      importType,
      url,
      options: {
        includeComments,
        maxComments,
        maxItems: importType === "creator" ? 20 : 1,
      },
    };

    setJobs((currentJobs) => [createImportJob(request), ...currentJobs]);
    setSubmitted(true);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <section className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-[#dde3ea] pb-4">
          <div>
            <h2 className="text-lg font-semibold">链接导入</h2>
            <p className="mt-1 text-sm text-[#5d6b7a]">不用选择 actor，只选择平台、链接和评论数量。</p>
          </div>
          {activeJob ? (
            <Badge className="rounded-md border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]">
              1 个任务运行中
            </Badge>
          ) : null}
        </div>

        <form className="mt-5 grid gap-5" onSubmit={handleSubmit}>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">平台</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["xiaohongshu", "douyin"] as Platform[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPlatform(item)}
                  className={`min-h-11 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2563eb]/30 ${
                    platform === item
                      ? "border-[#2563eb] bg-[#e8f1ff] text-[#1d4ed8]"
                      : "border-[#dde3ea] bg-white text-[#435364] hover:bg-[#f8fafc]"
                  }`}
                >
                  {platformLabel[item]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">类型</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["detail", "creator", "comments"] as ImportType[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setImportType(item);
                    setIncludeComments(item === "detail");
                  }}
                  className={`min-h-11 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2563eb]/30 ${
                    importType === item
                      ? "border-[#0f766e] bg-[#e6fffb] text-[#0f766e]"
                      : "border-[#dde3ea] bg-white text-[#435364] hover:bg-[#f8fafc]"
                  }`}
                >
                  {importTypeLabel[item]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-2">
            <Label htmlFor="source-url">链接</Label>
            <Input
              id="source-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="粘贴帖子链接或主页链接"
              required
            />
          </div>

          <div className="grid gap-3 rounded-md border border-[#dde3ea] bg-[#f8fafc] p-3 sm:grid-cols-[1fr_160px]">
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={includeComments}
                onChange={(event) => setIncludeComments(event.target.checked)}
                className="size-4 accent-[#2563eb]"
              />
              同时抓评论
            </label>
            <div className="grid gap-1">
              <Label htmlFor="max-comments">评论数量</Label>
              <Input
                id="max-comments"
                type="number"
                min={1}
                max={100}
                value={maxComments}
                onChange={(event) => setMaxComments(Number(event.target.value))}
              />
            </div>
          </div>

          {submitted ? (
            <p className="flex items-start gap-2 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-sm text-[#166534]">
              <CheckCircle2 className="mt-0.5 size-4" aria-hidden="true" />
              导入请求已交给 mock adapter，最近导入任务已新增一条记录。
            </p>
          ) : null}

          <Button type="submit" className="h-11 rounded-md bg-[#2563eb] text-white hover:bg-[#1d4ed8]">
            <Plus className="size-4" />
            开始导入
          </Button>
        </form>
      </section>

      <section className="rounded-md border border-[#dde3ea] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-[#dde3ea] pb-4">
          <div>
            <h2 className="text-lg font-semibold">最近导入任务</h2>
            <p className="mt-1 text-sm text-[#5d6b7a]">状态文案和 API contract 对齐。</p>
          </div>
          <Button variant="outline" className="h-10 rounded-md">
            <RefreshCw className="size-4" />
            刷新
          </Button>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-[#dde3ea]">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#f8fafc]">
                <TableHead>状态</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>结果</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <Badge className={`rounded-md ${statusTone[job.status]}`}>
                      {job.status === "running" ? <Loader2 className="size-3 animate-spin" /> : null}
                      {statusLabel[job.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{platformLabel[job.platform]}</TableCell>
                  <TableCell>{importTypeLabel[job.importType]}</TableCell>
                  <TableCell>
                    <span className="text-[#17202a]">{job.successItems}</span>
                    <span className="text-[#5d6b7a]"> / {job.totalItems ?? 1}</span>
                  </TableCell>
                  <TableCell>
                    {job.status === "partial" ? (
                      <Button variant="outline" size="sm" className="rounded-md" asChild>
                        <Link href="/dashboard/content/source-xhs-sensitive-repair">查看</Link>
                      </Button>
                    ) : (
                      <span className="text-sm text-[#5d6b7a]">等待</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 py-3 text-sm text-[#92400e]">
          <CircleAlert className="mt-0.5 size-4" aria-hidden="true" />
          部分成功不是失败。正文可先进入改写，评论可以稍后重试。
        </div>
      </section>
    </div>
  );
}
