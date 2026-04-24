import "server-only";

import { randomUUID } from "node:crypto";

import type {
  MaterialLibraryItemDto,
  MaterialPlatform,
  MaterialSourceKind,
  MaterialStatus,
  MaterialType,
  MaterialWorkbenchReferenceDto,
  MaterialWorkbenchTarget,
} from "@/contracts/material";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type SourceItemMaterialRow = {
  id: string;
  merchant_id: string;
  platform: MaterialPlatform;
  source_type: "detail" | "creator" | "search" | "manual_text";
  source_url: string | null;
  creator_name: string | null;
  title: string | null;
  body_text: string | null;
  script_text: string | null;
  structure_summary: unknown;
  engagement_snapshot: unknown;
  trace_payload: unknown;
  is_selected_for_rewrite: boolean;
  created_at: string;
};

const sourceItemMaterialSelect = [
  "id",
  "merchant_id",
  "platform",
  "source_type",
  "source_url",
  "creator_name",
  "title",
  "body_text",
  "script_text",
  "structure_summary",
  "engagement_snapshot",
  "trace_payload",
  "is_selected_for_rewrite",
  "created_at",
].join(", ");

const demoMaterialItems = new Map<string, MaterialLibraryItemDto>();
const demoWorkbenchReferences = new Map<string, MaterialWorkbenchReferenceDto>();

export async function listMaterialLibraryItems(input: {
  merchantId: string;
  limit?: number;
}): Promise<MaterialLibraryItemDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return Array.from(demoMaterialItems.values())
      .filter((item) => item.merchantId === input.merchantId && item.status !== "archived")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, input.limit ?? 50);
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("source_items")
    .select(sourceItemMaterialSelect)
    .eq("merchant_id", input.merchantId)
    .contains("trace_payload", { materialLibrary: true })
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 50);

  if (error) {
    throw new ApiError(500, "MATERIAL_LIBRARY_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as SourceItemMaterialRow[]).map(mapSourceItemToMaterial);
}

export async function createMaterialLibraryItem(input: {
  merchantId: string;
  createdByUserId: string;
  platform: MaterialPlatform;
  materialType: MaterialType;
  sourceKind: MaterialSourceKind;
  title: string;
  description?: string | null;
  originalUrl?: string | null;
  creatorName?: string | null;
  engagementLabel?: string | null;
  analysisPayload?: Record<string, unknown>;
  status?: MaterialStatus;
}): Promise<MaterialLibraryItemDto> {
  if (!isSupabaseAdminConfigured()) {
    const now = new Date().toISOString();
    const item: MaterialLibraryItemDto = {
      id: randomUUID(),
      merchantId: input.merchantId,
      sourceItemId: null,
      platform: input.platform,
      materialType: input.materialType,
      sourceKind: input.sourceKind,
      status: input.status ?? "ready",
      title: input.title,
      description: input.description ?? null,
      originalUrl: input.originalUrl ?? null,
      creatorName: input.creatorName ?? null,
      engagementLabel: input.engagementLabel ?? null,
      analysisPayload: input.analysisPayload ?? {},
      createdAt: now,
      updatedAt: now,
    };

    demoMaterialItems.set(item.id, item);
    return item;
  }

  const supabase = createSupabaseAdminClient();
  const insertPayload = {
    merchant_id: input.merchantId,
    platform: input.platform,
    source_type: input.sourceKind === "benchmark" ? "search" : "manual_text",
    source_url: input.originalUrl ?? null,
    creator_name: input.creatorName ?? null,
    title: input.title,
    body_text: input.materialType === "article" ? input.description ?? null : null,
    script_text: input.materialType === "video" ? input.description ?? null : null,
    structure_summary: {
      materialType: input.materialType,
      materialStatus: input.status ?? "ready",
      materialSourceKind: input.sourceKind,
    },
    engagement_snapshot: {
      label: input.engagementLabel ?? null,
    },
    trace_payload: {
      materialLibrary: true,
      materialSourceKind: input.sourceKind,
      materialAnalysis: input.analysisPayload ?? {},
      createdByUserId: input.createdByUserId,
    },
    is_selected_for_rewrite: false,
  };

  const { data, error } = await supabase
    .from("source_items")
    .insert(insertPayload)
    .select(sourceItemMaterialSelect)
    .single();

  if (error || !data) {
    if (error?.code === "23505" && input.originalUrl) {
      const existing = await findExistingMaterialByUrl({
        merchantId: input.merchantId,
        originalUrl: input.originalUrl,
      });

      if (existing) {
        return existing;
      }
    }

    throw new ApiError(500, "MATERIAL_LIBRARY_CREATE_FAILED", error?.message ?? "Create failed.");
  }

  return mapSourceItemToMaterial(data as unknown as SourceItemMaterialRow);
}

export async function createMaterialWorkbenchReference(input: {
  merchantId: string;
  materialItemId: string;
  targetWorkbench: MaterialWorkbenchTarget;
  createdByUserId: string;
}): Promise<MaterialWorkbenchReferenceDto> {
  if (!isSupabaseAdminConfigured()) {
    const item = demoMaterialItems.get(input.materialItemId);

    if (!item || item.merchantId !== input.merchantId) {
      throw new ApiError(404, "MATERIAL_ITEM_NOT_FOUND", "Material item not found.");
    }

    const reference = buildWorkbenchReference(input);
    demoWorkbenchReferences.set(reference.id, reference);
    return reference;
  }

  const supabase = createSupabaseAdminClient();
  const { data: itemData, error: itemError } = await supabase
    .from("source_items")
    .select(sourceItemMaterialSelect)
    .eq("id", input.materialItemId)
    .eq("merchant_id", input.merchantId)
    .contains("trace_payload", { materialLibrary: true })
    .single();

  if (itemError || !itemData) {
    throw new ApiError(404, "MATERIAL_ITEM_NOT_FOUND", "Material item not found.");
  }

  const item = itemData as unknown as SourceItemMaterialRow;
  const tracePayload = toRecord(item.trace_payload);
  const currentReferences = Array.isArray(tracePayload.materialWorkbenchReferences)
    ? tracePayload.materialWorkbenchReferences
    : [];
  const reference = buildWorkbenchReference(input);

  const { error: updateError } = await supabase
    .from("source_items")
    .update({
      is_selected_for_rewrite: true,
      trace_payload: {
        ...tracePayload,
        materialWorkbenchReferences: [...currentReferences, reference],
      },
    })
    .eq("id", input.materialItemId)
    .eq("merchant_id", input.merchantId);

  if (updateError) {
    throw new ApiError(500, "MATERIAL_WORKBENCH_REFERENCE_CREATE_FAILED", updateError.message);
  }

  return reference;
}

async function findExistingMaterialByUrl(input: {
  merchantId: string;
  originalUrl: string;
}): Promise<MaterialLibraryItemDto | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("source_items")
    .select(sourceItemMaterialSelect)
    .eq("merchant_id", input.merchantId)
    .eq("source_url", input.originalUrl)
    .contains("trace_payload", { materialLibrary: true })
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapSourceItemToMaterial(data as unknown as SourceItemMaterialRow);
}

function buildWorkbenchReference(input: {
  merchantId: string;
  materialItemId: string;
  targetWorkbench: MaterialWorkbenchTarget;
}): MaterialWorkbenchReferenceDto {
  return {
    id: randomUUID(),
    merchantId: input.merchantId,
    materialItemId: input.materialItemId,
    targetWorkbench: input.targetWorkbench,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

function mapSourceItemToMaterial(row: SourceItemMaterialRow): MaterialLibraryItemDto {
  const structureSummary = toRecord(row.structure_summary);
  const engagementSnapshot = toRecord(row.engagement_snapshot);
  const tracePayload = toRecord(row.trace_payload);
  const materialType = normalizeMaterialType(structureSummary.materialType, row.script_text);
  const sourceKind = normalizeSourceKind(tracePayload.materialSourceKind, row.source_type);
  const status = normalizeMaterialStatus(structureSummary.materialStatus);

  return {
    id: row.id,
    merchantId: row.merchant_id,
    sourceItemId: row.id,
    platform: row.platform,
    materialType,
    sourceKind,
    status,
    title: row.title ?? "未命名素材",
    description: materialType === "video" ? row.script_text : row.body_text,
    originalUrl: row.source_url,
    creatorName: row.creator_name,
    engagementLabel:
      typeof engagementSnapshot.label === "string" ? engagementSnapshot.label : null,
    analysisPayload: {
      structureSummary,
      engagementSnapshot,
      tracePayload,
      selectedForRewrite: row.is_selected_for_rewrite,
    },
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}

function normalizeMaterialType(value: unknown, scriptText: string | null): MaterialType {
  if (value === "article" || value === "video") {
    return value;
  }

  return scriptText ? "video" : "article";
}

function normalizeSourceKind(value: unknown, sourceType: SourceItemMaterialRow["source_type"]): MaterialSourceKind {
  if (value === "uploaded" || value === "benchmark") {
    return value;
  }

  return sourceType === "search" ? "benchmark" : "uploaded";
}

function normalizeMaterialStatus(value: unknown): MaterialStatus {
  if (value === "ready" || value === "parsing" || value === "failed" || value === "archived") {
    return value;
  }

  return "ready";
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}
