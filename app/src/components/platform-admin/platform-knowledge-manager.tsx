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

import type {
  AgentAssetStatus,
  KnowledgeSetDocumentDto,
  KnowledgeSetDto,
} from "@/contracts/agent-console";
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

type KnowledgeSetFormState = {
  name: string;
  description: string;
  status: AgentAssetStatus;
};

function toKnowledgeSetForm(knowledgeSet: KnowledgeSetDto): KnowledgeSetFormState {
  return {
    name: knowledgeSet.name,
    description: knowledgeSet.description ?? "",
    status: knowledgeSet.status,
  };
}

export function PlatformKnowledgeManager({
  knowledgeSets = [],
  knowledgeSetDocuments = [],
}: {
  knowledgeSets?: KnowledgeSetDto[];
  knowledgeSetDocuments?: KnowledgeSetDocumentDto[];
}) {
  const [localKnowledgeSets, setLocalKnowledgeSets] = useState(knowledgeSets);
  const [memberships, setMemberships] = useState(knowledgeSetDocuments);
  const [documents, setDocuments] = useState<KnowledgeDocumentWithStatsDto[]>([]);
  const [title, setTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [creatingSet, setCreatingSet] = useState(false);
  const [savingSet, setSavingSet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedSetId, setSelectedSetId] = useState<string>("all");
  const [selectedUploadSetIds, setSelectedUploadSetIds] = useState<string[]>(
    localKnowledgeSets.filter((set) => set.scope === "platform").slice(0, 1).map((set) => set.id),
  );

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
        throw new Error(data.error?.message ?? "平台方法论文档加载失败");
      }

      setDocuments(data.documents ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "平台方法论文档加载失败");
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

    if (selectedUploadSetIds.length === 0) {
      setError("请选择至少一个知识集。");
      return;
    }

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
      formData.set("knowledgeSetIds", JSON.stringify(selectedUploadSetIds));

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
        memberships?: KnowledgeSetDocumentDto[];
        error?: { message?: string };
      };

      if (!response.ok || !data.document) {
        throw new Error(data.error?.message ?? "平台方法论文档上传失败");
      }

      const uploadedDocument = data.document;
      const uploadedMemberships = data.memberships ?? [];

      setTitle("");
      setTextContent("");
      setFile(null);
      setFileInputKey((current) => current + 1);
      if (uploadedMemberships.length > 0) {
        setMemberships((current) => [
          ...current.filter((membership) => membership.documentId !== uploadedDocument.id),
          ...uploadedMemberships,
        ]);
      }
      setNotice(`已入库「${uploadedDocument.title}」，生成 ${uploadedDocument.chunkCount} 个方法论片段。`);
      await loadDocuments();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "平台方法论文档上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function createKnowledgeSet() {
    const name = window.prompt("输入知识集名称，例如：房地产方法论");
    const trimmedName = name?.trim();

    if (!trimmedName) {
      return;
    }

    setCreatingSet(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/platform-admin/knowledge/sets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          description: "",
          scope: "platform",
          status: "draft",
        }),
      });
      const data = (await response.json()) as {
        knowledgeSet?: KnowledgeSetDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.knowledgeSet) {
        throw new Error(data.error?.message ?? "知识集创建失败");
      }

      setLocalKnowledgeSets((current) => [data.knowledgeSet!, ...current]);
      setSelectedSetId(data.knowledgeSet.id);
      setKnowledgeSetFormState({
        knowledgeSetId: data.knowledgeSet.id,
        values: toKnowledgeSetForm(data.knowledgeSet),
      });
      setSelectedUploadSetIds((current) => [...new Set([data.knowledgeSet!.id, ...current])]);
      setNotice(`知识集「${data.knowledgeSet.name}」已创建为草稿。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "知识集创建失败");
    } finally {
      setCreatingSet(false);
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
    if (!window.confirm("确认删除这份平台方法论文档？对应 chunks 和入库 job 会一起删除。")) {
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
        throw new Error(data.error?.message ?? "删除平台方法论文档失败");
      }

      setNotice("平台方法论文档已删除。");
      setMemberships((current) =>
        current.filter((membership) => membership.documentId !== documentId),
      );
      await loadDocuments();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除平台方法论文档失败");
    } finally {
      setMutatingId(null);
    }
  }

  const platformKnowledgeSets = localKnowledgeSets.filter((set) => set.scope === "platform");
  const selectedKnowledgeSet =
    selectedSetId === "all"
      ? null
      : localKnowledgeSets.find((knowledgeSet) => knowledgeSet.id === selectedSetId) ?? null;
  const [knowledgeSetFormState, setKnowledgeSetFormState] = useState<{
    knowledgeSetId: string;
    values: KnowledgeSetFormState;
  } | null>(null);
  const knowledgeSetForm =
    selectedKnowledgeSet &&
    knowledgeSetFormState?.knowledgeSetId === selectedKnowledgeSet.id
      ? knowledgeSetFormState.values
      : selectedKnowledgeSet
        ? toKnowledgeSetForm(selectedKnowledgeSet)
        : null;
  const knowledgeSetFormDirty =
    Boolean(selectedKnowledgeSet && knowledgeSetForm) &&
    (knowledgeSetForm?.name !== selectedKnowledgeSet?.name ||
      knowledgeSetForm?.description !== (selectedKnowledgeSet?.description ?? "") ||
      knowledgeSetForm?.status !== selectedKnowledgeSet?.status);
  const selectedSetDocumentIds = new Set(
    memberships
      .filter((membership) => membership.knowledgeSetId === selectedSetId)
      .map((membership) => membership.documentId),
  );
  const filteredDocuments =
    selectedSetId === "all"
      ? documents
      : documents.filter((document) => selectedSetDocumentIds.has(document.id));

  function getKnowledgeSetIdsForDocument(documentId: string) {
    return memberships
      .filter((membership) => membership.documentId === documentId)
      .map((membership) => membership.knowledgeSetId);
  }

  function toggleUploadKnowledgeSet(setId: string, checked: boolean) {
    setError(null);
    setSelectedUploadSetIds((current) => {
      if (checked) {
        return [...new Set([...current, setId])];
      }

      return current.filter((id) => id !== setId);
    });
  }

  function mergeKnowledgeSet(knowledgeSet: KnowledgeSetDto) {
    setLocalKnowledgeSets((current) => {
      const exists = current.some((item) => item.id === knowledgeSet.id);

      return exists
        ? current.map((item) => (item.id === knowledgeSet.id ? knowledgeSet : item))
        : [knowledgeSet, ...current];
    });
  }

  function setKnowledgeSetFormField<K extends keyof KnowledgeSetFormState>(
    key: K,
    value: KnowledgeSetFormState[K],
  ) {
    if (!selectedKnowledgeSet || !knowledgeSetForm) {
      return;
    }

    setKnowledgeSetFormState({
      knowledgeSetId: selectedKnowledgeSet.id,
      values: {
        ...knowledgeSetForm,
        [key]: value,
      },
    });
    setError(null);
    setNotice(null);
  }

  async function saveKnowledgeSet() {
    if (!selectedKnowledgeSet || !knowledgeSetForm) {
      return;
    }

    if (!knowledgeSetForm.name.trim()) {
      setError("知识集名称不能为空。");
      return;
    }

    setSavingSet(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/platform-admin/knowledge/sets/${selectedKnowledgeSet.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: knowledgeSetForm.name.trim(),
          description: knowledgeSetForm.description.trim() || null,
          status: knowledgeSetForm.status,
        }),
      });
      const data = (await response.json()) as {
        knowledgeSet?: KnowledgeSetDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.knowledgeSet) {
        throw new Error(data.error?.message ?? "知识集保存失败");
      }

      mergeKnowledgeSet(data.knowledgeSet);
      setKnowledgeSetFormState({
        knowledgeSetId: data.knowledgeSet.id,
        values: toKnowledgeSetForm(data.knowledgeSet),
      });
      setNotice(`知识集「${data.knowledgeSet.name}」已保存。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "知识集保存失败");
    } finally {
      setSavingSet(false);
    }
  }

  async function toggleKnowledgeSetStatus() {
    if (!selectedKnowledgeSet) {
      return;
    }

    const nextStatus: AgentAssetStatus =
      selectedKnowledgeSet.status === "enabled" ? "disabled" : "enabled";

    setSavingSet(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/platform-admin/knowledge/sets/${selectedKnowledgeSet.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = (await response.json()) as {
        knowledgeSet?: KnowledgeSetDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.knowledgeSet) {
        throw new Error(data.error?.message ?? "知识集状态更新失败");
      }

      mergeKnowledgeSet(data.knowledgeSet);
      setKnowledgeSetFormState({
        knowledgeSetId: data.knowledgeSet.id,
        values: toKnowledgeSetForm(data.knowledgeSet),
      });
      setNotice(
        nextStatus === "enabled"
          ? `知识集「${data.knowledgeSet.name}」已启用，可挂载到 Agent。`
          : `知识集「${data.knowledgeSet.name}」已禁用，并会从 Agent 检索范围移除。`,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "知识集状态更新失败");
    } finally {
      setSavingSet(false);
    }
  }

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
                onClick={() => void createKnowledgeSet()}
                disabled={creatingSet}
                className={cn(adminButtonClassName, adminButtonVariants.ghost, "min-h-8 px-2")}
                title="新建知识集"
              >
                {creatingSet ? (
                  <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="size-3.5" aria-hidden="true" />
                )}
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
            {localKnowledgeSets.map((knowledgeSet) => (
              <button
                key={knowledgeSet.id}
                type="button"
                onClick={() => {
                  setSelectedSetId(knowledgeSet.id);
                  setKnowledgeSetFormState({
                    knowledgeSetId: knowledgeSet.id,
                    values: toKnowledgeSetForm(knowledgeSet),
                  });
                  setError(null);
                  setNotice(null);
                }}
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
            {localKnowledgeSets.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs leading-5 text-white/30">
                foundation 还没有返回知识集。
              </div>
            ) : null}
          </div>
        </AdminPanel>

        <div className="grid gap-4">
          {selectedKnowledgeSet ? (
            <AdminPanel>
              <AdminPanelHeader
                eyebrow="知识集配置"
                description="知识集启用后才可被 Agent 作为平台知识检索范围挂载；禁用后会自动移出 enabled 挂载。"
                action={
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void toggleKnowledgeSetStatus()}
                      disabled={savingSet}
                      className={cn(
                        adminButtonClassName,
                        selectedKnowledgeSet.status === "enabled"
                          ? adminButtonVariants.danger
                          : adminButtonVariants.primary,
                      )}
                    >
                      {savingSet ? (
                        <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : null}
                      {selectedKnowledgeSet.status === "enabled" ? "禁用" : "启用"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveKnowledgeSet()}
                      disabled={savingSet || !knowledgeSetFormDirty}
                      className={cn(adminButtonClassName, adminButtonVariants.primary)}
                    >
                      {savingSet ? (
                        <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <FileText className="size-3.5" aria-hidden="true" />
                      )}
                      保存
                    </button>
                  </div>
                }
              />
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <AdminField label="知识集名称">
                  <input
                    value={knowledgeSetForm?.name ?? selectedKnowledgeSet.name}
                    onChange={(event) => setKnowledgeSetFormField("name", event.target.value)}
                    disabled={savingSet}
                    className={adminInputClassName}
                  />
                </AdminField>
                <AdminField label="状态">
                  <select
                    value={knowledgeSetForm?.status ?? selectedKnowledgeSet.status}
                    onChange={(event) =>
                      setKnowledgeSetFormField("status", event.target.value as AgentAssetStatus)
                    }
                    disabled={savingSet}
                    className={adminInputClassName}
                  >
                    <option value="draft">草稿</option>
                    <option value="enabled">已启用</option>
                    <option value="disabled">已禁用</option>
                  </select>
                </AdminField>
                <div className="md:col-span-2">
                  <AdminField label="描述">
                    <textarea
                      rows={2}
                      value={knowledgeSetForm?.description ?? ""}
                      onChange={(event) =>
                        setKnowledgeSetFormField("description", event.target.value)
                      }
                      disabled={savingSet}
                      className={adminTextareaClassName}
                    />
                  </AdminField>
                </div>
              </div>
            </AdminPanel>
          ) : null}

          <AdminPanel>
            <AdminPanelHeader
              eyebrow={selectedSetId === "all" ? "全部平台方法论文档" : "平台方法论文档"}
              description="文档列表读取真实 knowledge documents API；按知识集筛选时只展示已加入该知识集的文档。"
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
              <div className="p-6 text-sm text-white/40">正在读取平台方法论文档...</div>
            ) : filteredDocuments.length === 0 ? (
              <div className="p-5">
                <AdminEmptyState
                  icon={Database}
                  title="暂无平台方法论文档"
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
                      {document.latestJob?.status === "failed" && document.latestJob.errorSummary ? (
                        <p className="mt-2 rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-200">
                          失败原因：{document.latestJob.errorSummary}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/30">
                        <span>scope: {document.scope}</span>
                        <span>chunks: {document.chunkCount}</span>
                        <span>source: {document.sourceName ?? "manual"}</span>
                        <span>updated: {formatDateTime(document.updatedAt)}</span>
                        {document.storageKey ? <span>COS: {document.storageKey}</span> : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {getKnowledgeSetIdsForDocument(document.id).length > 0 ? (
                          getKnowledgeSetIdsForDocument(document.id).map((setId) => {
                            const knowledgeSet = localKnowledgeSets.find((set) => set.id === setId);

                            return knowledgeSet ? (
                              <span
                                key={setId}
                                className="rounded border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300"
                              >
                                {knowledgeSet.name}
                              </span>
                            ) : null;
                          })
                        ) : (
                          <span className="text-xs text-red-300/70">未加入任何知识集</span>
                        )}
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
              eyebrow="上传平台方法论"
              description="上传前必须选择至少一个知识集，新文档只会被挂到选中的知识集中。"
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

              <AdminField label="加入知识集" hint="至少选择一个。新文档不会默认影响所有 Agent。">
                {platformKnowledgeSets.length > 0 ? (
                  <div className="grid gap-2 rounded-md border border-white/10 bg-[#050505] p-3">
                    {platformKnowledgeSets.map((knowledgeSet) => (
                      <label
                        key={knowledgeSet.id}
                        className="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-white/60 hover:bg-white/[0.04]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{knowledgeSet.name}</span>
                          <span className="mt-1 block text-xs text-white/30">
                            {knowledgeSet.status}
                          </span>
                        </span>
                        <input
                          type="checkbox"
                          checked={selectedUploadSetIds.includes(knowledgeSet.id)}
                          onChange={(event) =>
                            toggleUploadKnowledgeSet(knowledgeSet.id, event.target.checked)
                          }
                          className="size-4 accent-amber-500"
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <AdminNotice tone="warning">
                    还没有平台知识集。请先点击左侧加号创建知识集，再上传文档。
                  </AdminNotice>
                )}
              </AdminField>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-white/30">
                  平台级文档会进入真实 knowledge documents；是否参与 Agent 检索由知识集挂载决定。
                </p>
                <button
                  type="submit"
                  disabled={uploading || selectedUploadSetIds.length === 0}
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
