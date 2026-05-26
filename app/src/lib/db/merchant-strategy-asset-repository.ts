import "server-only";

import type { MerchantStrategyAssetDto, StrategySnapshotDto } from "@/contracts/consultation";
import {
  mapPostgresError,
  queryAppDb,
} from "@/lib/server-db/postgres";
import { isLocalDemoRuntime } from "@/lib/demo/local-demo-runtime";
import { emptyStrategySnapshot, toStrategySnapshot } from "@/lib/strategy-snapshot";

type MerchantStrategyAssetRow = {
  merchant_id: string;
  strategy_snapshot: unknown;
  strategy_markdown: string | null;
  canonical_snapshot: Record<string, unknown> | null;
  compiled_context: Record<string, unknown> | null;
  created_at: string | Date;
  updated_at: string | Date;
};

const demoMerchantStrategyAssets = new Map<string, MerchantStrategyAssetDto>();

export async function getMerchantStrategyAsset(
  merchantId: string,
): Promise<StrategySnapshotDto | null> {
  const asset = await getMerchantStrategyAssetDocument(merchantId);

  return asset?.strategySnapshot ?? null;
}

export async function getMerchantStrategyAssetDocument(
  merchantId: string,
): Promise<MerchantStrategyAssetDto | null> {
  if (isLocalDemoRuntime()) {
    return demoMerchantStrategyAssets.get(merchantId) ?? null;
  }

  try {
    const result = await queryAppDb<MerchantStrategyAssetRow>(
      `
      select ${merchantStrategyAssetSelect}
      from public.merchant_strategy_assets
      where merchant_id = $1
      limit 1
      `,
      [merchantId],
    );

    return result.rows[0] ? mapMerchantStrategyAsset(result.rows[0]) : null;
  } catch (error) {
    throw mapPostgresError(error, "MERCHANT_STRATEGY_ASSET_FETCH_FAILED");
  }
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
  if (isLocalDemoRuntime()) {
    const now = new Date().toISOString();
    const current = demoMerchantStrategyAssets.get(input.merchantId);
    const asset: MerchantStrategyAssetDto = {
      merchantId: input.merchantId,
      strategySnapshot: input.strategySnapshot,
      strategyMarkdown:
        normalizeStrategyMarkdown(input.strategyMarkdown) ||
        current?.strategyMarkdown ||
        buildStrategyAssetMarkdown(input.strategySnapshot),
      canonicalSnapshot: input.canonicalSnapshot ?? input.strategySnapshot,
      compiledContext: input.compiledContext ?? current?.compiledContext ?? null,
      updatedAt: now,
    };
    demoMerchantStrategyAssets.set(input.merchantId, asset);
    return asset;
  }

  try {
    const existing = await getMerchantStrategyAssetDocument(input.merchantId);
    const strategyMarkdown =
      normalizeStrategyMarkdown(input.strategyMarkdown) ||
      existing?.strategyMarkdown ||
      buildStrategyAssetMarkdown(input.strategySnapshot);
    const compiledContext = input.compiledContext ?? existing?.compiledContext ?? null;
    const result = await queryAppDb<MerchantStrategyAssetRow>(
      `
      insert into public.merchant_strategy_assets (
        merchant_id,
        strategy_snapshot,
        strategy_markdown,
        canonical_snapshot,
        compiled_context
      ) values ($1, $2::jsonb, $3, $4::jsonb, $5::jsonb)
      on conflict (merchant_id) do update
      set strategy_snapshot = excluded.strategy_snapshot,
          strategy_markdown = excluded.strategy_markdown,
          canonical_snapshot = excluded.canonical_snapshot,
          compiled_context = excluded.compiled_context,
          updated_at = timezone('utc', now())
      returning ${merchantStrategyAssetSelect}
      `,
      [
        input.merchantId,
        JSON.stringify(input.strategySnapshot),
        strategyMarkdown,
        JSON.stringify(input.canonicalSnapshot ?? input.strategySnapshot),
        compiledContext === null ? null : JSON.stringify(compiledContext),
      ],
    );

    return mapMerchantStrategyAsset(result.rows[0]);
  } catch (error) {
    throw mapPostgresError(error, "MERCHANT_STRATEGY_ASSET_UPSERT_FAILED");
  }
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
    markdownListSection("策略标签", snapshot.strategyTags, "继续补充可检索的策略标签。"),
    markdownSection("小红书表达方向", buildXiaohongshuDirection(snapshot)),
    markdownSection("风控边界", "不编造价格、疗效、收益、资质、真实案例、活动承诺；不使用绝对化或功效承诺表达。"),
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
    updatedAt: toIsoString(row.updated_at),
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

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
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
    snapshot.strategyTags.length ? `内容标签：${snapshot.strategyTags.join("、")}` : null,
  ].filter((item): item is string => Boolean(item));

  return parts.length ? parts.map((item) => `- ${item}`).join("\n") : "- 继续在咨询中沉淀适合小红书的表达方式。";
}
