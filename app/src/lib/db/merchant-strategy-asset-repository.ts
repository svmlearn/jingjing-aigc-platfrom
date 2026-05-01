import "server-only";

import type { StrategySnapshotDto } from "@/contracts/consultation";
import { emptyStrategySnapshot, toStrategySnapshot } from "@/lib/strategy-snapshot";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type MerchantStrategyAssetRow = {
  merchant_id: string;
  strategy_snapshot: unknown;
  created_at: string;
  updated_at: string;
};

const demoMerchantStrategyAssets = new Map<string, StrategySnapshotDto>();

export async function getMerchantStrategyAsset(
  merchantId: string,
): Promise<StrategySnapshotDto | null> {
  if (!isSupabaseAdminConfigured()) {
    return demoMerchantStrategyAssets.get(merchantId) ?? null;
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
}): Promise<StrategySnapshotDto> {
  if (!isSupabaseAdminConfigured()) {
    demoMerchantStrategyAssets.set(input.merchantId, input.strategySnapshot);
    return input.strategySnapshot;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("merchant_strategy_assets")
    .upsert(
      {
        merchant_id: input.merchantId,
        strategy_snapshot: input.strategySnapshot,
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
  const current = await getMerchantStrategyAsset(input.merchantId);

  if (current) {
    return current;
  }

  return upsertMerchantStrategyAsset({
    merchantId: input.merchantId,
    strategySnapshot: input.fallback ?? emptyStrategySnapshot,
  });
}

function mapMerchantStrategyAsset(row: MerchantStrategyAssetRow): StrategySnapshotDto {
  return toStrategySnapshot(row.strategy_snapshot);
}

const merchantStrategyAssetSelect = [
  "merchant_id",
  "strategy_snapshot",
  "created_at",
  "updated_at",
].join(", ");
