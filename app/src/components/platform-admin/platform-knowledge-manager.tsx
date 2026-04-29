"use client";

import { useEffect, useEffectEvent, useState } from "react";
import {
  Database,
  FileText,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  UploadCloud,
} from "lucide-react";

import type { KnowledgeSetDto } from "@/contracts/agent-console";
import type { KnowledgeDocumentWithStatsDto } from "@/contracts/knowledge";
import {
  AdminEmptyState,
  AdminField,
  AdminNotice,
  AdminPanel,
  AdminPanelHeader,
  AdminStatusBadge,
  adminButtonClassName,
  adminButtonVariants,
  adminInputClassName,
  adminTextareaClassName,
} from "@/components/platform-admin/platform-admin-ui";
import { cn } from "@/lib/utils";

export function PlatformKnowledgeManager({
  knowledgeSets = [],
}: {
  knowledgeSets?: KnowledgeSetDto[];
}) {
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
  const [selectedSetId, setSelectedSetId] = useState<string>("all");

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

  const filteredDocuments =
    selectedSetId === "all"
      ? documents
      : documents.filter((document) => document.scope === "platform");

  return (
    <div className="grid gap-6">
      {error ? <AdminNotice tone="danger">{error}</AdminNotice> : null}
      {notice ? <AdminNotice tone="success">{notice}</AdminNotice> : null}

      <div className="grid gap-4 xl:grid-cols-[14rem_minmax(0,1fr)]">
        <AdminPanel className="overflow-hidden">
          <AdminPanelHeader
            eyebrow="知识集"
            action={
              <button
                type="button"
                disabled
                className={cn(adminButtonClassName, adminButtonVariants.ghost, "min-h-8 px-2")}
                title="等待 Knowledge Set 写入 API"
              >
                <Plus className="size-3.5" aria-hidden="true" />
              </button>
            }
          />
          <div className="grid gap-1 p-2">
            <button
              type="button"
              onClick={() => setSelectedSetId("all")}
              className={cn(
                "rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                selectedSetId === "all"
                  ? "bg-amber-500/10 text-amber-300"
                  : "text-white/55 hover:bg-white/[0.05]",
              )}
            >
              <span>全部文档</span>
              <span className="float-right text-xs text-white/30">{documents.length}</span>
            </button>
            {knowledgeSets.map((knowledgeSet) => (
              <button
                key={knowledgeSet.id}
                type="button"
                onClick={() => setSelectedSetId(knowledgeSet.id)}
                className={cn(
                  "min-w-0 rounded-md px-3 py-2.5 text-left transition-colors",
                  selectedSetId === knowledgeSet.id
                    ? "bg-amber-500/10 text-amber-300"
                    : "text-white/55 hover:bg-white/[0.05]",
                )}
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-sm">{knowledgeSet.name}</span>
                  <span className="shrink-0 text-xs text-white/30">
                    {knowledgeSet.scope === "platform" ? "平台" : "商户"}
                  </span>
                </div>
                <div className="mt-2">
                  <AdminStatusBadge status={knowledgeSet.status} />
                </div>
              </button>
            ))}
            {knowledgeSets.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs leading-5 text-white/30">
                foundation 还没有返回知识集。
              </div>
            ) : null}
          </div>
        </AdminPanel>

        <div className="grid gap-4">
          <AdminPanel>
            <AdminPanelHeader
              eyebrow={selectedSetId === "all" ? "全部知识文档" : "知识文档"}
              description="文档列表读取真实 knowledge documents API。知识集归属选择在 Knowledge Set API 接入前先保持明确边界。"
              action={
                <button
                  type="button"
                  onClick={() => {
                    void loadDocuments();
                  }}
                  disabled={loading}
                  className={cn(adminButtonClassName, adminButtonVariants.secondary)}
                >
                  <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                  刷新
                </button>
              }
            />

            {loading ? (
              <div className="p-6 text-sm text-white/40">正在读取知识文档...</div>
            ) : filteredDocuments.length === 0 ? (
              <div className="p-5">
                <AdminEmptyState
                  icon={Database}
                  title="暂无知识文档"
                  description="先上传一份行业方法论，入库后的 indexed chunks 会供咨询检索使用。"
                />
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {filteredDocuments.map((document) => (
                  <article key={document.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <FileText className="size-4 text-white/35" aria-hidden="true" />
                        <h3 className="break-words font-semibold text-white/80">{document.title}</h3>
                        <DocumentStatusBadge status={document.status} />
                        {document.latestJob ? <JobBadge status={document.latestJob.status} /> : null}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/40">
                        {document.summaryText ?? "暂无摘要"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/30">
                        <span>scope: {document.scope}</span>
                        <span>chunks: {document.chunkCount}</span>
                        <span>source: {document.sourceName ?? "manual"}</span>
                        <span>updated: {formatDateTime(document.updatedAt)}</span>
                        {document.storageKey ? <span>COS: {document.storageKey}</span> : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          void retryDocument(document.id);
                        }}
                        disabled={mutatingId === document.id}
                        className={cn(adminButtonClassName, adminButtonVariants.secondary)}
                      >
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                        重跑入库
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void deleteDocument(document.id);
                        }}
                        disabled={mutatingId === document.id}
                        className={cn(adminButtonClassName, adminButtonVariants.danger)}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </AdminPanel>

          <AdminPanel>
            <AdminPanelHeader
              eyebrow="上传知识"
              description="当前上传继续走真实平台级知识 API；加入知识集的强制选择会在 knowledge set 写入接口接入后开放。"
            />
            <form onSubmit={uploadDocument} className="grid gap-4 p-5">
              <AdminField label="文档标题">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="例如：普拉提门店小红书内容方法论"
                  className={adminInputClassName}
                />
              </AdminField>

              <div className="grid gap-4 lg:grid-cols-2">
                <AdminField label="上传文件" hint="当前保底解析文本类文件；PDF/Word 后续交给异步 worker。">
                  <input
                    key={fileInputKey}
                    type="file"
                    accept=".txt,.md,.markdown,.csv,.json,.jsonl,.yaml,.yml,.xml,text/*,application/json"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    className={cn(
                      adminInputClassName,
                      "h-auto border-dashed py-2 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white/70",
                    )}
                  />
                </AdminField>

                <AdminField label="或粘贴内容">
                  <textarea
                    value={textContent}
                    onChange={(event) => setTextContent(event.target.value)}
                    rows={6}
                    placeholder="把平台方法论、行业 SOP、禁忌话术、内容模板粘贴在这里..."
                    className={adminTextareaClassName}
                  />
                </AdminField>
              </div>

              <AdminNotice tone="info">
                知识集选择当前为只读预览。后续 API 完成后，上传时会强制至少选择一个知识集。
              </AdminNotice>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-white/30">
                  平台级文档会进入真实 knowledge documents；是否参与 Agent 检索由知识集挂载决定。
                </p>
                <button
                  type="submit"
                  disabled={uploading}
                  className={cn(adminButtonClassName, adminButtonVariants.primary)}
                >
                  <UploadCloud className="size-3.5" aria-hidden="true" />
                  {uploading ? "入库中..." : "上传并入库"}
                </button>
              </div>
            </form>
          </AdminPanel>
        </div>
      </div>
    </div>
  );
}

function DocumentStatusBadge({ status }: { status: KnowledgeDocumentWithStatsDto["status"] }) {
  return <AdminStatusBadge status={status} label={status} />;
}

function JobBadge({ status }: { status: NonNullable<KnowledgeDocumentWithStatsDto["latestJob"]>["status"] }) {
  return <AdminStatusBadge status={status} label={`job: ${status}`} />;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
