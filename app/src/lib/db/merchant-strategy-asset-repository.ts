import "server-only";

import type { MerchantStrategyAssetDto, StrategySnapshotDto } from "@/contracts/consultation";
import { emptyStrategySnapshot, toStrategySnapshot } from "@/lib/strategy-snapshot";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { cloudSupabaseRequiredError } from "@/lib/db/cloud-supabase-required";
import { ApiError } from "@/server/api/errors";

type MerchantStrategyAssetRow = {
  merchant_id: string;
  strategy_snapshot: unknown;
  strategy_markdown: string | null;
  canonical_snapshot: Record<string, unknown> | null;
  compiled_context: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export async function getMerchantStrategyAsset(
  merchantId: string,
): Promise<StrategySnapshotDto | null> {
  const asset = await getMerchantStrategyAssetDocument(merchantId);

  return asset?.strategySnapshot ?? null;
}

export async function getMerchantStrategyAssetDocument(
  merchantId: string,
): Promise<MerchantStrategyAssetDto | null> {
  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("merchant_strategy_assets")
    .select(merchantStrategyAssetSelect)
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, "MERCHANT_STRATEGY_ASSET_FETCH_FAILED", error.message);
  }

  return data ? mapMerchantStrategyAsset(data as unknown as MerchantStrategyAssetRow) : null;
}

export async function upsertMerchantStrategyAsset(input: {
  merchantId: string;
  strategySnapshot: StrategySnapshotDto;
  strategyMarkdown?: string | null;
  canonicalSnapshot?: Record<string, unknown> | null;
  compiledContext?: Record<string, unknown> | null;
}): Promise<StrategySnapshotDto> {
  const asset = await upsertMerchantStrategyAssetDocument(input);

  return asset.strategySnapshot;
}

export async function upsertMerchantStrategyAssetDocument(input: {
  merchantId: string;
  strategySnapshot: StrategySnapshotDto;
  strategyMarkdown?: string | null;
  canonicalSnapshot?: Record<string, unknown> | null;
  compiledContext?: Record<string, unknown> | null;
}): Promise<MerchantStrategyAssetDto> {
  if (!isSupabaseAdminConfigured()) {
    throw cloudSupabaseRequiredError();
  }

  const supabase = createSupabaseAdminClient();
  const existing = await getMerchantStrategyAssetDocument(input.merchantId);
  const strategyMarkdown =
    normalizeStrategyMarkdown(input.strategyMarkdown) ||
    existing?.strategyMarkdown ||
    buildStrategyAssetMarkdown(input.strategySnapshot);
  const { data, error } = await supabase
    .from("merchant_strategy_assets")
    .upsert(
      {
        merchant_id: input.merchantId,
        strategy_snapshot: input.strategySnapshot,
        strategy_markdown: strategyMarkdown,
        canonical_snapshot: input.canonicalSnapshot ?? input.strategySnapshot,
        compiled_context: input.compiledContext ?? existing?.compiledContext ?? null,
      },
      { onConflict: "merchant_id" },
    )
    .select(merchantStrategyAssetSelect)
    .single();

  if (error || !data) {
    throw new ApiError(
      500,
      "MERCHANT_STRATEGY_ASSET_UPSERT_FAILED",
      error?.message ?? "Upsert failed.",
    );
  }

  return mapMerchantStrategyAsset(data as unknown as MerchantStrategyAssetRow);
}

export async function ensureMerchantStrategyAsset(input: {
  merchantId: string;
  fallback: StrategySnapshotDto;
}): Promise<StrategySnapshotDto> {
  const current = await getMerchantStrategyAssetDocument(input.merchantId);

  if (current) {
    return current.strategySnapshot;
  }

  return upsertMerchantStrategyAsset({
    merchantId: input.merchantId,
    strategySnapshot: input.fallback ?? emptyStrategySnapshot,
  });
}

export async function ensureMerchantStrategyAssetDocument(input: {
  merchantId: string;
  fallback: StrategySnapshotDto;
}): Promise<MerchantStrategyAssetDto> {
  const current = await getMerchantStrategyAssetDocument(input.merchantId);

  if (current) {
    return current;
  }

  return upsertMerchantStrategyAssetDocument({
    merchantId: input.merchantId,
    strategySnapshot: input.fallback ?? emptyStrategySnapshot,
  });
}

export function buildStrategyAssetMarkdown(snapshot: StrategySnapshotDto): string {
  const sections = [
    "# 策略资产",
    markdownSection("当前定位", snapshot.positioning || "继续通过咨询补充。"),
    markdownListSection("目标对象洞察", snapshot.targetAudiences, "继续补充目标对象。"),
    markdownListSection("核心卖点", snapshot.coreSellingPoints, "继续补充核心卖点。"),
    markdownListSection("核心场景", snapshot.keyScenes, "继续补充用户决策和使用场景。"),
    markdownSection("小红书表达方向", buildXiaohongshuDirection(snapshot)),
    markdownSection("风控边界", "不编造价格、疗效、收益、资质、真实案例、活动承诺；不使用绝对化或功效承诺表达。"),
    markdownSection("当前建议", snapshot.currentSuggestion || "继续补充信息后同步咨询建议。"),
    markdownSection("待验证想法", "- 后续咨询中继续补充。"),
  ];

  return sections.join("\n\n");
}

function mapMerchantStrategyAsset(row: MerchantStrategyAssetRow): MerchantStrategyAssetDto {
  const strategySnapshot = toStrategySnapshot(row.strategy_snapshot);
  const strategyMarkdown =
    normalizeStrategyMarkdown(row.strategy_markdown) || buildStrategyAssetMarkdown(strategySnapshot);

  return {
    merchantId: row.merchant_id,
    strategySnapshot,
    strategyMarkdown,
    canonicalSnapshot: row.canonical_snapshot ?? strategySnapshot,
    compiledContext: row.compiled_context ?? null,
    updatedAt: row.updated_at,
  };
}

const merchantStrategyAssetSelect = [
  "merchant_id",
  "strategy_snapshot",
  "strategy_markdown",
  "canonical_snapshot",
  "compiled_context",
  "created_at",
  "updated_at",
].join(", ");

function normalizeStrategyMarkdown(value?: string | null) {
  const normalized = value?.replace(/\r\n/g, "\n").trim();

  return normalized ? normalized.slice(0, 24000) : "";
}

function markdownSection(title: string, body: string) {
  return `## ${title}\n${body.trim()}`;
}

function markdownListSection(title: string, items: string[], emptyText: string) {
  const list = items.map((item) => item.trim()).filter(Boolean);

  return markdownSection(title, list.length ? list.map((item) => `- ${item}`).join("\n") : emptyText);
}

function buildXiaohongshuDirection(snapshot: StrategySnapshotDto) {
  const parts = [
    snapshot.articleBrief?.angle,
    snapshot.articleBrief?.callToAction ? `CTA：${snapshot.articleBrief.callToAction}` : null,
    snapshot.strategyTags.length ? `内容标签：${snapshot.strategyTags.join("、")}` : null,
  ].filter((item): item is string => Boolean(item));

  return parts.length ? parts.map((item) => `- ${item}`).join("\n") : "- 继续在咨询中沉淀适合小红书的表达方式。";
}
