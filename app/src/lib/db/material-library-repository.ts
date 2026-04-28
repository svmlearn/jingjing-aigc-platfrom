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

type MaterialWorkbenchReferenceRow = {
  id: string;
  merchant_id: string;
  material_item_id: string;
  target_workbench: MaterialWorkbenchTarget;
  status: "pending" | "consumed";
  draft_id: string | null;
  created_at: string;
  consumed_at: string | null;
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

const materialWorkbenchReferenceSelect = [
  "id",
  "merchant_id",
  "material_item_id",
  "target_workbench",
  "status",
  "draft_id",
  "created_at",
  "consumed_at",
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

export async function getMaterialLibraryItemById(input: {
  merchantId: string;
  materialItemId: string;
}): Promise<MaterialLibraryItemDto> {
  if (!isSupabaseAdminConfigured()) {
    const item = demoMaterialItems.get(input.materialItemId);

    if (!item || item.merchantId !== input.merchantId) {
      throw new ApiError(404, "MATERIAL_ITEM_NOT_FOUND", "Material item not found.");
    }

    return item;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("source_items")
    .select(sourceItemMaterialSelect)
    .eq("id", input.materialItemId)
    .eq("merchant_id", input.merchantId)
    .contains("trace_payload", { materialLibrary: true })
    .single();

  if (error || !data) {
    throw new ApiError(404, "MATERIAL_ITEM_NOT_FOUND", "Material item not found.");
  }

  return mapSourceItemToMaterial(data as unknown as SourceItemMaterialRow);
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

  await getMaterialLibraryItemById({
    merchantId: input.merchantId,
    materialItemId: input.materialItemId,
  });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("material_workbench_references")
    .insert({
      merchant_id: input.merchantId,
      material_item_id: input.materialItemId,
      target_workbench: input.targetWorkbench,
      status: "pending",
      created_by_user_id: input.createdByUserId,
    })
    .select(materialWorkbenchReferenceSelect)
    .single();

  if (error || !data) {
    if (isMissingMaterialReferenceTable(error)) {
      return createTracePayloadWorkbenchReference(input);
    }

    throw new ApiError(
      500,
      "MATERIAL_WORKBENCH_REFERENCE_CREATE_FAILED",
      error?.message ?? "Create failed.",
    );
  }

  await markMaterialSelectedForRewrite({
    merchantId: input.merchantId,
    materialItemId: input.materialItemId,
  });

  return mapWorkbenchReference(data as unknown as MaterialWorkbenchReferenceRow);
}

export async function getMaterialWorkbenchReference(input: {
  merchantId: string;
  referenceId: string;
  targetWorkbench?: MaterialWorkbenchTarget;
}): Promise<MaterialWorkbenchReferenceDto | null> {
  if (!isSupabaseAdminConfigured()) {
    const reference = demoWorkbenchReferences.get(input.referenceId);

    if (!reference || reference.merchantId !== input.merchantId) {
      return null;
    }

    if (input.targetWorkbench && reference.targetWorkbench !== input.targetWorkbench) {
      return null;
    }

    return reference;
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("material_workbench_references")
    .select(materialWorkbenchReferenceSelect)
    .eq("id", input.referenceId)
    .eq("merchant_id", input.merchantId);

  if (input.targetWorkbench) {
    query = query.eq("target_workbench", input.targetWorkbench);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    if (isMissingMaterialReferenceTable(error)) {
      return null;
    }

    throw new ApiError(500, "MATERIAL_WORKBENCH_REFERENCE_READ_FAILED", error.message);
  }

  return data ? mapWorkbenchReference(data as unknown as MaterialWorkbenchReferenceRow) : null;
}

export async function listMaterialWorkbenchReferencesByDraft(input: {
  merchantId: string;
  draftId: string;
  targetWorkbench?: MaterialWorkbenchTarget;
}): Promise<MaterialWorkbenchReferenceDto[]> {
  if (!isSupabaseAdminConfigured()) {
    return Array.from(demoWorkbenchReferences.values()).filter(
      (reference) =>
        reference.merchantId === input.merchantId &&
        reference.draftId === input.draftId &&
        (!input.targetWorkbench || reference.targetWorkbench === input.targetWorkbench),
    );
  }

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("material_workbench_references")
    .select(materialWorkbenchReferenceSelect)
    .eq("merchant_id", input.merchantId)
    .eq("draft_id", input.draftId);

  if (input.targetWorkbench) {
    query = query.eq("target_workbench", input.targetWorkbench);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) {
    if (isMissingMaterialReferenceTable(error)) {
      return [];
    }

    throw new ApiError(500, "MATERIAL_WORKBENCH_REFERENCE_LIST_FAILED", error.message);
  }

  return ((data ?? []) as unknown as MaterialWorkbenchReferenceRow[]).map(mapWorkbenchReference);
}

export async function consumeMaterialWorkbenchReference(input: {
  merchantId: string;
  referenceId: string;
  targetWorkbench: MaterialWorkbenchTarget;
  draftId: string;
  materialItemId?: string | null;
}): Promise<MaterialWorkbenchReferenceDto | null> {
  if (!isSupabaseAdminConfigured()) {
    const reference = demoWorkbenchReferences.get(input.referenceId);

    if (!reference || reference.merchantId !== input.merchantId) {
      return null;
    }

    const consumedReference = {
      ...reference,
      status: "consumed" as const,
      draftId: input.draftId,
      consumedAt: new Date().toISOString(),
    };

    demoWorkbenchReferences.set(reference.id, consumedReference);
    return consumedReference;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("material_workbench_references")
    .update({
      status: "consumed",
      draft_id: input.draftId,
      consumed_at: new Date().toISOString(),
    })
    .eq("id", input.referenceId)
    .eq("merchant_id", input.merchantId)
    .eq("target_workbench", input.targetWorkbench)
    .select(materialWorkbenchReferenceSelect)
    .maybeSingle();

  if (error) {
    if (isMissingMaterialReferenceTable(error)) {
      if (input.materialItemId) {
        await appendTracePayloadReferenceConsumption({
          merchantId: input.merchantId,
          materialItemId: input.materialItemId,
          referenceId: input.referenceId,
          draftId: input.draftId,
        });
      }

      return null;
    }

    throw new ApiError(500, "MATERIAL_WORKBENCH_REFERENCE_CONSUME_FAILED", error.message);
  }

  return data ? mapWorkbenchReference(data as unknown as MaterialWorkbenchReferenceRow) : null;
}

async function createTracePayloadWorkbenchReference(input: {
  merchantId: string;
  materialItemId: string;
  targetWorkbench: MaterialWorkbenchTarget;
}): Promise<MaterialWorkbenchReferenceDto> {
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

async function markMaterialSelectedForRewrite(input: {
  merchantId: string;
  materialItemId: string;
}) {
  if (!isSupabaseAdminConfigured()) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  await supabase
    .from("source_items")
    .update({
      is_selected_for_rewrite: true,
    })
    .eq("id", input.materialItemId)
    .eq("merchant_id", input.merchantId);
}

async function appendTracePayloadReferenceConsumption(input: {
  merchantId: string;
  materialItemId: string;
  referenceId: string;
  draftId: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("source_items")
    .select("trace_payload")
    .eq("id", input.materialItemId)
    .eq("merchant_id", input.merchantId)
    .maybeSingle();

  const tracePayload = toRecord((data as { trace_payload?: unknown } | null)?.trace_payload);
  const currentConsumptions = Array.isArray(tracePayload.materialReferenceConsumptions)
    ? tracePayload.materialReferenceConsumptions
    : [];

  await supabase
    .from("source_items")
    .update({
      is_selected_for_rewrite: true,
      trace_payload: {
        ...tracePayload,
        materialReferenceConsumptions: [
          ...currentConsumptions,
          {
            referenceId: input.referenceId,
            draftId: input.draftId,
            consumedAt: new Date().toISOString(),
          },
        ],
      },
    })
    .eq("id", input.materialItemId)
    .eq("merchant_id", input.merchantId);
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
    draftId: null,
    consumedAt: null,
  };
}

function mapWorkbenchReference(row: MaterialWorkbenchReferenceRow): MaterialWorkbenchReferenceDto {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    materialItemId: row.material_item_id,
    targetWorkbench: row.target_workbench,
    status: row.status,
    draftId: row.draft_id,
    createdAt: row.created_at,
    consumedAt: row.consumed_at,
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

function isMissingMaterialReferenceTable(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42P01" ||
    Boolean(error?.message?.includes("material_workbench_references"))
  );
}
