"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  FileText,
  Filter,
  Library,
  Link2,
  PenLine,
  Plus,
  Search,
  User,
  Video,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { MaterialLibraryItemDto, MaterialPlatform } from "@/contracts/material";

const platforms = ["xiaohongshu", "douyin"] as const;
const platformLabels: Record<MaterialPlatform, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
};
const sourceKindLabels = {
  uploaded: "用户上传",
  benchmark: "对标库",
} as const;

type FindMethod = "keyword" | "profile";

const materialTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function MerchantContentCenter() {
  const router = useRouter();
  const [materials, setMaterials] = useState<MaterialLibraryItemDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showFindModal, setShowFindModal] = useState(false);

  const [uploadPlatform, setUploadPlatform] = useState<MaterialPlatform>("xiaohongshu");
  const [uploadLink, setUploadLink] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  const [findPlatform, setFindPlatform] = useState<MaterialPlatform>("xiaohongshu");
  const [findMethod, setFindMethod] = useState<FindMethod>("keyword");
  const [findKeyword, setFindKeyword] = useState("");
  const [findCount, setFindCount] = useState("5");
  const [findProfileUrl, setFindProfileUrl] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [sendingMaterialId, setSendingMaterialId] = useState<string | null>(null);

  const filteredMaterials = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return materials;
    }

    return materials.filter((item) =>
      [
        item.title,
        platformLabels[item.platform],
        sourceKindLabels[item.sourceKind],
        item.description ?? "",
      ].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [materials, query]);

  const selectedItem =
    filteredMaterials.find((item) => item.id === selectedId) ?? filteredMaterials[0] ?? null;

  async function loadMaterials() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/materials", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        materials?: MaterialLibraryItemDto[];
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(data.error?.message ?? "素材读取失败");
      }

      const nextMaterials = data.materials ?? [];
      setMaterials(nextMaterials);
      setSelectedId((currentSelectedId) =>
        currentSelectedId && nextMaterials.some((item) => item.id === currentSelectedId)
          ? currentSelectedId
          : nextMaterials[0]?.id ?? null,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "素材读取失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMaterials();
  }, []);

  async function handleUploadParse() {
    const nextLink = uploadLink.trim();
    if (!nextLink) {
      return;
    }

    setIsParsing(true);
    setError(null);

    try {
      const response = await fetch("/api/materials", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          platform: uploadPlatform,
          url: nextLink,
        }),
      });
      const data = (await response.json()) as {
        material?: MaterialLibraryItemDto;
        error?: { message?: string };
      };

      if (!response.ok || !data.material) {
        throw new Error(data.error?.message ?? "素材提交失败");
      }

      setMaterials((current) => [data.material!, ...current]);
      setSelectedId(data.material.id);
      setShowUploadModal(false);
      setUploadLink("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "素材提交失败");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleBenchmarkSearch() {
    const searchTarget = findMethod === "keyword" ? findKeyword.trim() : findProfileUrl.trim();
    if (!searchTarget) {
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const response = await fetch("/api/materials/benchmark-search", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          platform: findPlatform,
          findMethod,
          keyword: findMethod === "keyword" ? searchTarget : undefined,
          profileUrl: findMethod === "profile" ? searchTarget : undefined,
          count: Number(findCount),
        }),
      });
      const data = (await response.json()) as {
        materials?: MaterialLibraryItemDto[];
        error?: { message?: string };
      };

      if (!response.ok || !data.materials) {
        throw new Error(data.error?.message ?? "对标素材检索失败");
      }

      setMaterials((current) => [...data.materials!, ...current]);
      setSelectedId(data.materials[0]?.id ?? null);
      setShowFindModal(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "对标素材检索失败");
    } finally {
      setIsSearching(false);
    }
  }

  async function sendToWorkbench(material: MaterialLibraryItemDto) {
    const targetWorkbench = material.materialType === "article" ? "article" : "video";
    setSendingMaterialId(material.id);
    setError(null);

    try {
      const response = await fetch(`/api/materials/${material.id}/send-to-workbench`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ targetWorkbench }),
      });
      const data = (await response.json()) as {
        reference?: { id: string };
        error?: { message?: string };
      };

      if (!response.ok || !data.reference) {
        throw new Error(data.error?.message ?? "素材送入工作台失败");
      }

      const params = new URLSearchParams({
        source: "material_center",
        materialId: material.id,
        materialReferenceId: data.reference.id,
      });
      if (targetWorkbench === "article") {
        params.set("mode", "rewrite");
      }

      router.push(`/dashboard/${targetWorkbench}?${params.toString()}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "素材送入工作台失败");
    } finally {
      setSendingMaterialId(null);
    }
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col bg-transparent">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-6">
        <div>
          <h1 className="text-xl tracking-tight [font-family:var(--font-cormorant)]">
            素材中心
          </h1>
          <p className="text-[10px] uppercase tracking-[0.25em] text-white/35">
            对标素材与上传素材
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            上传素材
          </button>
          <button
            type="button"
            onClick={() => setShowFindModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600/80 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-white shadow-[0_18px_60px_rgba(180,83,9,0.22)] transition-colors hover:bg-amber-600"
          >
            <Search className="h-3.5 w-3.5" />
            找对标
          </button>
        </div>
      </header>

      {error ? (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-6 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-white/40">
          正在读取素材库...
        </div>
      ) : materials.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/5 text-amber-500/80">
            <Library className="h-10 w-10" />
          </div>
          <h2 className="text-2xl text-[#e0e0e0] [font-family:var(--font-cormorant)]">
            Your Library is Empty
          </h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-white/40 [font-family:var(--font-cormorant)]">
            在这里管理优秀对标内容，或上传自己的历史素材。图文工作台和视频工作台会从这里取参考素材，而不是把草稿混在素材库里。
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-[10px] uppercase tracking-[0.25em] text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            >
              本地上传
            </button>
            <button
              type="button"
              onClick={() => setShowFindModal(true)}
              className="rounded-xl bg-amber-600 px-6 py-3 text-[10px] uppercase tracking-[0.25em] text-white shadow-[0_18px_60px_rgba(180,83,9,0.24)] transition-colors hover:bg-amber-500"
            >
              去库里找找
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <aside className="flex h-[340px] shrink-0 flex-col border-b border-white/10 bg-[#0a0a0a] lg:h-full lg:w-[400px] lg:border-b-0 lg:border-r">
            <div className="flex gap-3 border-b border-white/5 p-5">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  type="text"
                  placeholder="Search materials..."
                  className="h-10 w-full rounded-xl border border-white/10 bg-[#050505] pl-11 pr-4 text-xs text-[#e0e0e0] outline-none placeholder:text-white/25 focus:border-amber-500/50"
                />
              </div>
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#050505] text-white/55 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="筛选素材"
              >
                <Filter className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              {filteredMaterials.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    "flex w-full gap-4 overflow-hidden rounded-2xl border p-4 text-left transition-all",
                    selectedItem?.id === item.id
                      ? "border-amber-500/40 bg-amber-500/10 shadow-[0_18px_70px_rgba(180,83,9,0.16)]"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border",
                      selectedItem?.id === item.id
                        ? "border-amber-500/20 bg-amber-500/15 text-amber-500"
                        : "border-white/10 bg-white/5 text-white/35",
                    )}
                  >
                    {item.materialType === "article" ? (
                      <FileText className="h-6 w-6" />
                    ) : (
                      <Video className="h-6 w-6" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-sm leading-snug text-[#e0e0e0] [font-family:var(--font-cormorant)]">
                      {item.title}
                    </h3>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em]">
                      <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-white/55">
                        {platformLabels[item.platform]}
                      </span>
                      <span className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-500">
                        {item.engagementLabel ?? "待分析"}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
              {filteredMaterials.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-white/40">
                  没找到匹配素材，可以换个关键词。
                </div>
              ) : null}
            </div>
          </aside>

          <main className="min-h-0 flex-1 overflow-y-auto p-6 lg:p-10">
            {selectedItem ? (
              <div className="mx-auto flex min-h-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0d0d0d] shadow-[0_24px_100px_rgba(0,0,0,0.35)]">
                <section className="flex items-start justify-between gap-6 border-b border-white/10 bg-[#050505] p-8">
                  <div className="flex gap-5">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-amber-500">
                      {selectedItem.materialType === "article" ? (
                        <FileText className="h-6 w-6" />
                      ) : (
                        <Video className="h-6 w-6" />
                      )}
                    </div>
                    <div>
                      <h2 className="text-2xl leading-snug text-[#e0e0e0] [font-family:var(--font-cormorant)]">
                        {selectedItem.title}
                      </h2>
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em]">
                        <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-white/55">
                          {platformLabels[selectedItem.platform]}
                        </span>
                        <span className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-500">
                          {selectedItem.engagementLabel ?? "待分析"}
                        </span>
                        <span className="text-white/30">{sourceKindLabels[selectedItem.sourceKind]}</span>
                        <span className="text-white/25">{formatMaterialTime(selectedItem.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-white/40 transition-colors hover:text-amber-500"
                  >
                    查看详情
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </section>

                <section className="min-h-[260px] flex-1 p-8 text-sm leading-8 text-[#e0e0e0] whitespace-pre-wrap [font-family:var(--font-cormorant)]">
                  {selectedItem.description}
                  <p className="mt-8 text-xs italic text-white/30">
                    当前记录已保存到素材库。后续接素材解析 provider 后，这里会展示完整拆解、封面结构、评论洞察与可复用脚本。
                  </p>
                </section>

                <section className="flex justify-end border-t border-white/10 bg-[#050505] p-6">
                  <button
                    type="button"
                    onClick={() => {
                      void sendToWorkbench(selectedItem);
                    }}
                    disabled={sendingMaterialId === selectedItem.id}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-[#e0e0e0] transition-colors hover:bg-white/15"
                  >
                    {selectedItem.materialType === "article" ? (
                      <PenLine className="h-4 w-4" />
                    ) : (
                      <Video className="h-4 w-4" />
                    )}
                    {sendingMaterialId === selectedItem.id ? "送入中..." : "送去工作台"}
                  </button>
                </section>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm italic text-white/35 [font-family:var(--font-cormorant)]">
                请选择左侧素材。
              </div>
            )}
          </main>
        </div>
      )}

      {showUploadModal ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] shadow-[0_24px_120px_rgba(0,0,0,0.55)]">
            <ModalHeader title="上传解析素材" onClose={() => setShowUploadModal(false)} />
            <div className="space-y-6 p-8">
              <OptionGroup
                label="选择平台"
                options={platforms}
                value={uploadPlatform}
                onChange={setUploadPlatform}
              />
              <div>
                <label className="mb-3 block text-[10px] uppercase tracking-[0.22em] text-white/55">
                  发布链接
                </label>
                <div className="relative">
                  <Link2 className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                  <input
                    value={uploadLink}
                    onChange={(event) => setUploadLink(event.target.value)}
                    type="text"
                    placeholder="粘贴小红书、抖音或视频号链接..."
                    className="w-full rounded-xl border border-white/10 bg-[#050505] py-3 pl-12 pr-4 text-sm text-[#e0e0e0] outline-none placeholder:text-white/25 focus:border-amber-500/50"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleUploadParse}
                  disabled={!uploadLink.trim() || isParsing}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-600/80 px-6 py-3 text-[10px] uppercase tracking-[0.22em] text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isParsing ? <Search className="h-3.5 w-3.5 animate-spin" /> : null}
                  {isParsing ? "解析中..." : "提交解析"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showFindModal ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] shadow-[0_24px_120px_rgba(0,0,0,0.55)]">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 bg-[#050505] px-8 pt-4">
              <div className="flex">
                {[
                  ["keyword", "搜关键词找"],
                  ["profile", "给博主主页找"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFindMethod(value as FindMethod)}
                    className={cn(
                      "relative px-5 py-3 text-xs uppercase tracking-[0.2em] transition-colors",
                      findMethod === value ? "text-amber-500" : "text-white/40 hover:text-white/75",
                    )}
                  >
                    {label}
                    {findMethod === value ? (
                      <span className="absolute bottom-0 left-0 h-px w-full bg-amber-500" />
                    ) : null}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowFindModal(false)}
                className="mb-4 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/45 transition-colors hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-400"
                aria-label="关闭找对标弹窗"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-6 p-8">
              <OptionGroup
                label="目标平台"
                options={platforms}
                value={findPlatform}
                onChange={setFindPlatform}
              />

              {findMethod === "keyword" ? (
                <>
                  <div>
                    <label className="mb-3 block text-[10px] uppercase tracking-[0.22em] text-white/55">
                      搜索关键词
                    </label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                      <input
                        value={findKeyword}
                        onChange={(event) => setFindKeyword(event.target.value)}
                        type="text"
                        placeholder="例如：普拉提 产后修复"
                        className="w-full rounded-xl border border-white/10 bg-[#050505] py-3 pl-12 pr-4 text-sm text-[#e0e0e0] outline-none placeholder:text-white/25 focus:border-amber-500/50"
                      />
                    </div>
                  </div>
                  <OptionGroup
                    label="寻找数量"
                    options={["5", "10", "20"] as const}
                    value={findCount}
                    onChange={setFindCount}
                    suffix="篇"
                  />
                </>
              ) : (
                <div>
                  <label className="mb-3 block text-[10px] uppercase tracking-[0.22em] text-white/55">
                    博主主页链接
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                    <input
                      value={findProfileUrl}
                      onChange={(event) => setFindProfileUrl(event.target.value)}
                      type="text"
                      placeholder="粘贴博主主页链接..."
                      className="w-full rounded-xl border border-white/10 bg-[#050505] py-3 pl-12 pr-4 text-sm text-[#e0e0e0] outline-none placeholder:text-white/25 focus:border-amber-500/50"
                    />
                  </div>
                  <p className="mt-3 text-xs leading-6 text-white/35">
                    会优先拉取该博主近期互动表现更好的内容，供后续图文和视频工作台参考。
                  </p>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleBenchmarkSearch}
                  disabled={
                    isSearching ||
                    (findMethod === "keyword" && !findKeyword.trim()) ||
                    (findMethod === "profile" && !findProfileUrl.trim())
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-600/80 px-6 py-3 text-[10px] uppercase tracking-[0.22em] text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSearching ? <Search className="h-3.5 w-3.5 animate-spin" /> : null}
                  {isSearching ? "找寻中..." : "开始找寻"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#050505] px-8 py-6">
      <h2 className="text-2xl italic text-[#e0e0e0] [font-family:var(--font-cormorant)]">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl p-2 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
        aria-label="关闭弹窗"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  suffix = "",
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (nextValue: T) => void;
  suffix?: string;
}) {
  return (
    <div>
      <label className="mb-3 block text-[10px] uppercase tracking-[0.22em] text-white/55">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "rounded-lg border px-4 py-2 text-[10px] uppercase tracking-[0.18em] transition-colors",
              value === option
                ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
            )}
          >
            {formatOptionLabel(option)}
            {suffix}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatOptionLabel(option: string) {
  return option in platformLabels ? platformLabels[option as MaterialPlatform] : option;
}

function formatMaterialTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return materialTimeFormatter.format(date);
}
