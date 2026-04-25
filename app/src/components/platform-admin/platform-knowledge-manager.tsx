"use client";

import { useEffect, useEffectEvent, useState } from "react";
import {
  Database,
  FileText,
  RefreshCw,
  RotateCcw,
  Trash2,
  UploadCloud,
} from "lucide-react";

import type { KnowledgeDocumentWithStatsDto } from "@/contracts/knowledge";
import { cn } from "@/lib/utils";

export function PlatformKnowledgeManager() {
  const [documents, setDocuments] = useState<KnowledgeDocumentWithStatsDto[]>([]);
  const [title, setTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadDocuments() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/platform-admin/knowledge/documents", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        documents?: KnowledgeDocumentWithStatsDto[];
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(data.error?.message ?? "知识库文档加载失败");
      }

      setDocuments(data.documents ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "知识库文档加载失败");
    } finally {
      setLoading(false);
    }
  }

  const loadDocumentsFromEffect = useEffectEvent(async () => {
    await loadDocuments();
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDocumentsFromEffect();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  async function uploadDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file && !textContent.trim()) {
      setError("请上传一个文本类文件，或直接粘贴知识内容。");
      return;
    }

    setUploading(true);
    setError(null);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.set("scope", "platform");
      formData.set("title", title);
      formData.set("textContent", textContent);

      if (file) {
        formData.set("file", file);
        formData.set("sourceName", file.name);
      }

      const response = await fetch("/api/platform-admin/knowledge/documents", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as {
        document?: KnowledgeDocumentWithStatsDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.document) {
        throw new Error(data.error?.message ?? "知识文档上传失败");
      }

      setTitle("");
      setTextContent("");
      setFile(null);
      setFileInputKey((current) => current + 1);
      setNotice(`已入库「${data.document.title}」，生成 ${data.document.chunkCount} 个知识片段。`);
      await loadDocuments();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "知识文档上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function retryDocument(documentId: string) {
    setMutatingId(documentId);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/platform-admin/knowledge/documents/${documentId}/retry`,
        {
          method: "POST",
        },
      );
      const data = (await response.json()) as {
        document?: KnowledgeDocumentWithStatsDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.document) {
        throw new Error(data.error?.message ?? "重新入库失败");
      }

      setNotice(`已重新入库「${data.document.title}」。`);
      await loadDocuments();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "重新入库失败");
    } finally {
      setMutatingId(null);
    }
  }

  async function deleteDocument(documentId: string) {
    if (!window.confirm("确认删除这份知识文档？对应 chunks 和入库 job 会一起删除。")) {
      return;
    }

    setMutatingId(documentId);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/platform-admin/knowledge/documents/${documentId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: { message?: string };
      };

      if (!response.ok || !data.ok) {
        throw new Error(data.error?.message ?? "删除知识文档失败");
      }

      setNotice("知识文档已删除。");
      await loadDocuments();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除知识文档失败");
    } finally {
      setMutatingId(null);
    }
  }

  return (
    <div className="grid gap-6">
      {error ? (
        <div className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm text-[#166534]">
          {notice}
        </div>
      ) : null}

      <section className="rounded-md border border-[#dde3ea] bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#17202a]">
              <UploadCloud className="size-4 text-[#0f766e]" />
              上传平台知识
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#5d6b7a]">
              当前 demo 支持文本类文件与直接粘贴内容；云端配置 COS 后会同步保存原文对象，
              并立刻切块入库供下一轮咨询检索。
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadDocuments();
            }}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-[#dde3ea] px-3 py-2 text-sm font-medium text-[#435364] disabled:opacity-60"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            刷新
          </button>
        </div>

        <form onSubmit={uploadDocument} className="mt-5 grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-[#17202a]">文档标题</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：普拉提门店小红书内容方法论"
              className="rounded-md border border-[#dde3ea] px-3 py-2 text-sm"
            />
          </label>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[#17202a]">上传文件</span>
              <input
                key={fileInputKey}
                type="file"
                accept=".txt,.md,.markdown,.csv,.json,.jsonl,.yaml,.yml,.xml,text/*,application/json"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="rounded-md border border-dashed border-[#b6c2cf] px-3 py-2 text-sm text-[#435364]"
              />
              <span className="text-xs text-[#7b8794]">
                当前保底解析文本类文件；PDF/Word 后续交给异步 worker。
              </span>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-[#17202a]">或粘贴内容</span>
              <textarea
                value={textContent}
                onChange={(event) => setTextContent(event.target.value)}
                rows={6}
                placeholder="把平台方法论、行业 SOP、禁忌话术、内容模板粘贴在这里..."
                className="rounded-md border border-[#dde3ea] px-3 py-2 text-sm leading-6"
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs leading-5 text-[#7b8794]">
              本轮先做平台级知识库；商户级知识会复用同一张表和 API 入参继续扩展。
            </p>
            <button
              type="submit"
              disabled={uploading}
              className="rounded-md bg-[#1d4ed8] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {uploading ? "入库中..." : "上传并入库"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-md border border-[#dde3ea] bg-white">
        <div className="flex items-center justify-between border-b border-[#dde3ea] p-5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#17202a]">
              <Database className="size-4 text-[#1d4ed8]" />
              知识文档列表
            </h2>
            <p className="mt-1 text-sm text-[#5d6b7a]">
              已 indexed 的 chunks 会参与咨询诊断的保底检索。
            </p>
          </div>
          <span className="rounded-full bg-[#edf4ff] px-3 py-1 text-xs font-medium text-[#1d4ed8]">
            {documents.length} 份文档
          </span>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-[#5d6b7a]">正在读取知识文档...</div>
        ) : documents.length === 0 ? (
          <div className="p-6 text-sm text-[#5d6b7a]">
            还没有知识文档。先上传一份行业方法论，我们就能让下一轮咨询真的命中它。
          </div>
        ) : (
          <div className="divide-y divide-[#edf1f5]">
            {documents.map((document) => (
              <article key={document.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="size-4 text-[#5d6b7a]" />
                    <h3 className="font-semibold text-[#17202a]">{document.title}</h3>
                    <StatusBadge status={document.status} />
                    {document.latestJob ? <JobBadge status={document.latestJob.status} /> : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#5d6b7a]">
                    {document.summaryText ?? "暂无摘要"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#7b8794]">
                    <span>scope: {document.scope}</span>
                    <span>chunks: {document.chunkCount}</span>
                    <span>source: {document.sourceName ?? "manual"}</span>
                    <span>updated: {formatDateTime(document.updatedAt)}</span>
                    {document.storageKey ? <span>COS: {document.storageKey}</span> : null}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void retryDocument(document.id);
                    }}
                    disabled={mutatingId === document.id}
                    className="inline-flex items-center gap-2 rounded-md border border-[#dde3ea] px-3 py-2 text-sm font-medium text-[#435364] disabled:opacity-60"
                  >
                    <RotateCcw className="size-4" />
                    重跑入库
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void deleteDocument(document.id);
                    }}
                    disabled={mutatingId === document.id}
                    className="inline-flex items-center gap-2 rounded-md border border-[#fecaca] px-3 py-2 text-sm font-medium text-[#b91c1c] disabled:opacity-60"
                  >
                    <Trash2 className="size-4" />
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: KnowledgeDocumentWithStatsDto["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium",
        status === "indexed" && "bg-[#dcfce7] text-[#166534]",
        status === "failed" && "bg-[#fee2e2] text-[#b91c1c]",
        status === "processing" && "bg-[#fef3c7] text-[#92400e]",
        (status === "uploaded" || status === "queued") && "bg-[#edf4ff] text-[#1d4ed8]",
      )}
    >
      {status}
    </span>
  );
}

function JobBadge({ status }: { status: NonNullable<KnowledgeDocumentWithStatsDto["latestJob"]>["status"] }) {
  return (
    <span className="rounded-full bg-[#f4f6f8] px-2.5 py-1 text-xs font-medium text-[#435364]">
      job: {status}
    </span>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
