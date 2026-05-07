"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  FileText,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import type {
  KnowledgeDocumentStatus,
  KnowledgeDocumentWithStatsDto,
} from "@/contracts/knowledge";
import { cn } from "@/lib/utils";

const statusMeta: Record<
  KnowledgeDocumentStatus,
  { label: string; className: string }
> = {
  uploaded: {
    label: "已上传，待处理",
    className: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  },
  queued: {
    label: "队列中",
    className: "border-violet-400/20 bg-violet-400/10 text-violet-200",
  },
  processing: {
    label: "处理中",
    className: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  },
  indexed: {
    label: "可用于咨询",
    className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  },
  failed: {
    label: "处理失败",
    className: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  },
};

type ApiDocumentResponse = {
  document?: KnowledgeDocumentWithStatsDto;
  documents?: KnowledgeDocumentWithStatsDto[];
  error?: { message?: string };
};

type EditDraft = {
  documentId: string;
  title: string;
  textContent: string;
};

export function MerchantKnowledgeLibrary() {
  const [documents, setDocuments] = useState<KnowledgeDocumentWithStatsDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [memoryTitle, setMemoryTitle] = useState("");
  const [memoryText, setMemoryText] = useState("");
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  async function loadDocuments() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/merchant-knowledge/documents", {
        cache: "no-store",
      });
      const data = (await response.json()) as ApiDocumentResponse;

      if (!response.ok || !data.documents) {
        throw new Error(data.error?.message ?? "用户知识库加载失败");
      }

      setDocuments(data.documents);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "用户知识库加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDocuments();
  }, []);

  const memoryCharCount = useMemo(() => visibleCharCount(memoryText.trim()), [memoryText]);

  async function createDocument() {
    setError(null);
    setNotice(null);

    if (!documentTitle.trim()) {
      setError("资料名称必填。");
      return;
    }

    if (!selectedFile) {
      setError("请选择 txt 或 md 文件。");
      return;
    }

    setSubmitting("document");

    try {
      const formData = new FormData();
      formData.set("action", "document");
      formData.set("title", documentTitle);
      formData.set("file", selectedFile);
      const document = await requestDocument("/api/merchant-knowledge/documents", {
        method: "POST",
        body: formData,
      });

      setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
      setDocumentTitle("");
      setSelectedFile(null);
      setFileInputKey((current) => current + 1);
      setNotice("用户资料已提交处理。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "用户资料上传失败");
    } finally {
      setSubmitting(null);
    }
  }

  async function createMemory() {
    setError(null);
    setNotice(null);

    if (!memoryTitle.trim()) {
      setError("记忆名称必填。");
      return;
    }

    if (!memoryText.trim()) {
      setError("用户记忆正文不能为空。");
      return;
    }

    if (memoryCharCount > 1000) {
      setError("用户记忆正文不能超过 1000 个可见字符。");
      return;
    }

    setSubmitting("memory");

    try {
      const formData = new FormData();
      formData.set("action", "memory");
      formData.set("title", memoryTitle);
      formData.set("textContent", memoryText);
      const document = await requestDocument("/api/merchant-knowledge/documents", {
        method: "POST",
        body: formData,
      });

      setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
      setMemoryTitle("");
      setMemoryText("");
      setNotice("用户记忆已提交处理。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "用户记忆保存失败");
    } finally {
      setSubmitting(null);
    }
  }

  async function saveEdit() {
    if (!editDraft) {
      return;
    }

    setError(null);
    setNotice(null);
    setSubmitting(`edit:${editDraft.documentId}`);

    try {
      const document = documents.find((item) => item.id === editDraft.documentId);
      const payload: Record<string, string> = {
        title: editDraft.title,
      };

      if (document && isMerchantMemory(document)) {
        payload.textContent = editDraft.textContent;
      }

      const updated = await requestDocument(
        `/api/merchant-knowledge/documents/${editDraft.documentId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      setDocuments((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setEditDraft(null);
      setNotice("内容已更新。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "内容更新失败");
    } finally {
      setSubmitting(null);
    }
  }

  async function retryDocument(documentId: string) {
    setError(null);
    setNotice(null);
    setSubmitting(`retry:${documentId}`);

    try {
      const document = await requestDocument(
        `/api/merchant-knowledge/documents/${documentId}/retry`,
        {
          method: "POST",
        },
      );

      setDocuments((current) =>
        current.map((item) => (item.id === document.id ? document : item)),
      );
      setNotice("内容已重新进入处理流程。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "重新处理失败");
    } finally {
      setSubmitting(null);
    }
  }

  async function deleteDocument(documentId: string) {
    if (!window.confirm("确认删除这条用户知识库内容？")) {
      return;
    }

    setError(null);
    setNotice(null);
    setSubmitting(`delete:${documentId}`);

    try {
      const response = await fetch(`/api/merchant-knowledge/documents/${documentId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as ApiDocumentResponse;

      if (!response.ok) {
        throw new Error(data.error?.message ?? "删除失败");
      }

      setDocuments((current) => current.filter((item) => item.id !== documentId));
      setNotice("内容已删除。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除失败");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center gap-3">
            <Upload className="h-4 w-4 text-amber-400" />
            <div>
              <h2 className="text-sm font-medium text-white">知识库上传</h2>
              <p className="mt-1 text-xs text-white/45">仅支持 txt / md，单文件最大 10MB。</p>
            </div>
          </div>
          <div className="space-y-3">
            <input
              value={documentTitle}
              onChange={(event) => setDocumentTitle(event.target.value)}
              placeholder="资料名称"
              className="w-full rounded-xl border border-white/10 bg-[#050505] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25"
            />
            <input
              key={fileInputKey}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-xl border border-white/10 bg-[#050505] px-3 py-2 text-xs text-white/65 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-white"
            />
            <button
              type="button"
              onClick={() => {
                void createDocument();
              }}
              disabled={submitting !== null}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              {submitting === "document" ? "提交中" : "上传资料"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center gap-3">
            <Brain className="h-4 w-4 text-cyan-300" />
            <div>
              <h2 className="text-sm font-medium text-white">记忆录入</h2>
              <p className="mt-1 text-xs text-white/45">手动记录可编辑的用户记忆，最多 1000 个可见字符。</p>
            </div>
          </div>
          <div className="space-y-3">
            <input
              value={memoryTitle}
              onChange={(event) => setMemoryTitle(event.target.value)}
              placeholder="记忆名称"
              className="w-full rounded-xl border border-white/10 bg-[#050505] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25"
            />
            <textarea
              value={memoryText}
              onChange={(event) => setMemoryText(event.target.value)}
              rows={5}
              placeholder="例如：主理人更希望弱化焦虑表达，重点讲真实体验和专业评估。"
              className="w-full resize-none rounded-xl border border-white/10 bg-[#050505] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25"
            />
            <div className="flex items-center justify-between gap-3">
              <span
                className={cn(
                  "text-xs",
                  memoryCharCount > 1000 ? "text-rose-300" : "text-white/35",
                )}
              >
                {memoryCharCount}/1000
              </span>
              <button
                type="button"
                onClick={() => {
                  void createMemory();
                }}
                disabled={submitting !== null}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
              >
                <Brain className="h-4 w-4" />
                {submitting === "memory" ? "保存中" : "保存记忆"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-sm font-medium text-white">用户知识库内容</h2>
            <p className="mt-1 text-xs text-white/40">只有“可用于咨询”的内容会进入咨询上下文。</p>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadDocuments();
            }}
            disabled={loading || submitting !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading ? "animate-spin" : "")} />
            刷新
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-white/45">正在读取用户知识库...</div>
        ) : documents.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-white/45">
            还没有用户资料或用户记忆。
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {documents.map((document) => {
              const isEditing = editDraft?.documentId === document.id;
              const isMemory = isMerchantMemory(document);
              const status = statusMeta[document.status];

              return (
                <div key={document.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {isMemory ? (
                          <Brain className="h-4 w-4 text-cyan-300" />
                        ) : (
                          <FileText className="h-4 w-4 text-amber-300" />
                        )}
                        <h3 className="truncate text-sm font-medium text-white">{document.title}</h3>
                        <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-white/55">
                          {getContentTypeLabel(document)}
                        </span>
                        <span className={cn("rounded-full border px-2 py-1 text-[11px]", status.className)}>
                          {status.label}
                        </span>
                      </div>
                      <p className="text-xs text-white/35">
                        更新于 {formatDate(document.updatedAt)} · {document.chunkCount} 个 chunk
                        {document.latestJob?.errorSummary ? ` · ${document.latestJob.errorSummary}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <IconButton
                        label={isEditing ? "取消" : "编辑"}
                        disabled={submitting !== null}
                        onClick={() => {
                          setEditDraft(
                            isEditing
                              ? null
                              : {
                                  documentId: document.id,
                                  title: document.title,
                                  textContent: getMemoryText(document),
                                },
                          );
                        }}
                      >
                        {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                      </IconButton>
                      <IconButton
                        label="重新处理"
                        disabled={submitting !== null}
                        onClick={() => {
                          void retryDocument(document.id);
                        }}
                      >
                        <RefreshCw
                          className={cn(
                            "h-3.5 w-3.5",
                            submitting === `retry:${document.id}` ? "animate-spin" : "",
                          )}
                        />
                      </IconButton>
                      <IconButton
                        label="删除"
                        disabled={submitting !== null}
                        onClick={() => {
                          void deleteDocument(document.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  </div>

                  {isEditing && editDraft ? (
                    <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
                      <input
                        value={editDraft.title}
                        onChange={(event) =>
                          setEditDraft({ ...editDraft, title: event.target.value })
                        }
                        className="w-full rounded-xl border border-white/10 bg-[#050505] px-3 py-2 text-sm text-white outline-none"
                      />
                      {isMemory ? (
                        <>
                          <textarea
                            value={editDraft.textContent}
                            onChange={(event) =>
                              setEditDraft({ ...editDraft, textContent: event.target.value })
                            }
                            rows={5}
                            className="w-full resize-none rounded-xl border border-white/10 bg-[#050505] px-3 py-2 text-sm text-white outline-none"
                          />
                          <p className="text-xs text-white/35">
                            {visibleCharCount(editDraft.textContent.trim())}/1000
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-white/45">
                          该类型资料不支持在线修改正文，如需修改内容，请删除后重新上传。
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          void saveEdit();
                        }}
                        disabled={submitting !== null}
                        className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
                      >
                        <Save className="h-4 w-4" />
                        {submitting === `edit:${document.id}` ? "保存中" : "保存修改"}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

async function requestDocument(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const data = (await response.json()) as ApiDocumentResponse;

  if (!response.ok || !data.document) {
    throw new Error(data.error?.message ?? "请求失败");
  }

  return data.document;
}

function isMerchantMemory(document: KnowledgeDocumentWithStatsDto) {
  return document.metadata.contentKind === "merchant_memory";
}

function getContentTypeLabel(document: KnowledgeDocumentWithStatsDto) {
  if (isMerchantMemory(document)) {
    return "用户记忆";
  }

  const sourceName = document.sourceName?.toLowerCase() ?? "";
  return sourceName.endsWith(".md") ? "md 文件" : "txt 文件";
}

function getMemoryText(document: KnowledgeDocumentWithStatsDto) {
  return typeof document.metadata.sourceText === "string"
    ? document.metadata.sourceText
    : document.summaryText ?? "";
}

function visibleCharCount(value: string) {
  return Array.from(value).length;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function IconButton(props: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-white/65 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}
