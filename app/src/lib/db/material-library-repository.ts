import "server-only";

import { randomUUID } from "node:crypto";

import type {
  MaterialLibraryItemDto,
  MaterialPlatform,
  MaterialRetrievalTarget,
  MaterialSourceKind,
  MaterialStatus,
  MaterialType,
  MaterialWorkbenchReferenceDto,
  MaterialWorkbenchTarget,
} from "@/contracts/material";
import { normalizeMaterialRouting } from "@/lib/material-routing";
import { rankMaterialLibraryItemsForRetrieval } from "@/lib/material-retrieval";
import {
  isAppPostgresConfigured,
  isAppPostgresPreferred,
  mapPostgresError,
  queryAppDb,
  withAppDbTransaction,
  type DatabaseClient,
} from "@/lib/server-db/postgres";
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { ApiError } from "@/server/api/errors";

type Timestamp = string | Date;

type SourceItemMaterialRow = {
  id: string;
  merchant_id: string;
  platform: MaterialPlatform;
  source_type: "detail" | "creator" | "search" | "manual_text";
  external_item_id: string | null;
  source_url: string | null;
  creator_id: string | null;
  creator_name: string | null;
  title: string | null;
  body_text: string | null;
  script_text: string | null;
  structure_summary: unknown;
  engagement_snapshot: unknown;
  trace_payload: unknown;
  is_selected_for_rewrite: boolean;
  created_at: Timestamp;
};

type MaterialWorkbenchReferenceRow = {
  id: string;
  merchant_id: string;
  material_item_id: string;
  target_workbench: MaterialWorkbenchTarget;
  status: "pending" | "consumed";
  draft_id: string | null;
  created_at: Timestamp;
  consumed_at: Timestamp | null;
};

export type MaterialProviderLibraryItemInput = {
  platform: MaterialPlatform;
  materialType: MaterialType;
  sourceKind: MaterialSourceKind;
  sourceType: "detail" | "creator" | "search" | "manual_text";
  externalItemId?: string | null;
  sourceUrl?: string | null;
  creatorId?: string | null;
  creatorName?: string | null;
  title: string;
  description?: string | null;
  engagementSnapshot?: Record<string, unknown>;
  structureSummary?: Record<string, unknown>;
  tracePayload?: Record<string, unknown>;
};

type MaterialSourceItemWriteRow = {
  merchant_id: string;
  platform: MaterialPlatform;
  source_type: SourceItemMaterialRow["source_type"];
  external_item_id: string | null;
  source_url: string | null;
  creator_id: string | null;
  creator_name: string | null;
  title: string;
  body_text: string | null;
  script_text: string | null;
  structure_summary: Record<string, unknown>;
  engagement_snapshot: Record<string, unknown>;
  trace_payload: Record<string, unknown>;
  is_selected_for_rewrite: boolean;
};

const sourceItemMaterialSelect = [
  "id",
  "merchant_id",
  "platform",
  "source_type",
  "external_item_id",
  "source_url",
  "creator_id",
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
  retrievalTarget?: MaterialRetrievalTarget;
  query?: string | null;
}): Promise<MaterialLibraryItemDto[]> {
  if (shouldUseAppPostgres()) {
    try {
      const candidateLimit =
        input.retrievalTarget || input.query
          ? Math.max(input.limit ?? 50, 160)
          : input.limit ?? 50;
      const result = await queryAppDb<SourceItemMaterialRow>(
        `
        select ${sourceItemMaterialSelect}
        from public.source_items
        where merchant_id = $1
          and trace_payload @> $2::jsonb
        order by created_at desc
        limit $3
        `,
        [input.merchantId, JSON.stringify({ materialLibrary: true }), candidateLimit],
      );
      const materials = result.rows.map(mapSourceItemToMaterial);

      return rankMaterialLibraryItemsForRetrieval({
        materials,
        retrievalTarget: input.retrievalTarget,
        query: input.query,
        limit: input.limit ?? 50,
      });
    } catch (error) {
      throw mapPostgresError(error, "MATERIAL_LIBRARY_LIST_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
    const materials = Array.from(demoMaterialItems.values()).filter(
      (item) => item.merchantId === input.merchantId && item.status !== "archived",
    );

    return rankMaterialLibraryItemsForRetrieval({
      materials,
      retrievalTarget: input.retrievalTarget,
      query: input.query,
      limit: input.limit ?? 50,
    });
  }

  const supabase = createSupabaseAdminClient();
  const candidateLimit =
    input.retrievalTarget || input.query
      ? Math.max(input.limit ?? 50, 160)
      : input.limit ?? 50;
  const { data, error } = await supabase
    .from("source_items")
    .select(sourceItemMaterialSelect)
    .eq("merchant_id", input.merchantId)
    .contains("trace_payload", { materialLibrary: true })
    .order("created_at", { ascending: false })
    .limit(candidateLimit);

  if (error) {
    throw new ApiError(500, "MATERIAL_LIBRARY_LIST_FAILED", error.message);
  }

  const materials = ((data ?? []) as unknown as SourceItemMaterialRow[]).map(mapSourceItemToMaterial);

  return rankMaterialLibraryItemsForRetrieval({
    materials,
    retrievalTarget: input.retrievalTarget,
    query: input.query,
    limit: input.limit ?? 50,
  });
}

export async function getMaterialLibraryItemById(input: {
  merchantId: string;
  materialItemId: string;
}): Promise<MaterialLibraryItemDto> {
  if (shouldUseAppPostgres()) {
    try {
      const row = await pgGetMaterialLibraryItemRow(input);
      if (!row) {
        throw new ApiError(404, "MATERIAL_ITEM_NOT_FOUND", "Material item not found.");
      }

      return mapSourceItemToMaterial(row);
    } catch (error) {
      throw mapPostgresError(error, "MATERIAL_ITEM_FETCH_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
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
  usageType?: MaterialLibraryItemDto["usageType"];
  status?: MaterialStatus;
}): Promise<MaterialLibraryItemDto> {
  const status = input.status ?? "ready";
  const rawAnalysisPayload = input.usageType
    ? {
        ...(input.analysisPayload ?? {}),
        materialUsageType: input.usageType,
      }
    : input.analysisPayload ?? {};
  const routing = normalizeMaterialRouting({
    materialType: input.materialType,
    sourceKind: input.sourceKind,
    status,
    analysisPayload: rawAnalysisPayload,
  });
  const materialAnalysisPayload = {
    ...rawAnalysisPayload,
    materialUsageType: routing.usageType,
    retrievalTargets: routing.retrievalTargets,
  };
  const insertPayload: MaterialSourceItemWriteRow = {
    merchant_id: input.merchantId,
    platform: input.platform,
    source_type: input.sourceKind === "benchmark" ? "search" : "manual_text",
    external_item_id: null,
    source_url: input.originalUrl ?? null,
    creator_id: null,
    creator_name: input.creatorName ?? null,
    title: input.title,
    body_text: input.materialType === "article" ? input.description ?? null : null,
    script_text: input.materialType === "video" ? input.description ?? null : null,
    structure_summary: {
      materialType: input.materialType,
      materialStatus: status,
      materialSourceKind: input.sourceKind,
      materialUsageType: routing.usageType,
      retrievalTargets: routing.retrievalTargets,
    },
    engagement_snapshot: {
      label: input.engagementLabel ?? null,
    },
    trace_payload: {
      materialLibrary: true,
      materialSourceKind: input.sourceKind,
      materialUsageType: routing.usageType,
      retrievalTargets: routing.retrievalTargets,
      materialAnalysis: materialAnalysisPayload,
      createdByUserId: input.createdByUserId,
    },
    is_selected_for_rewrite: false,
  };

  if (shouldUseAppPostgres()) {
    try {
      const row = await pgInsertMaterialLibraryItem(insertPayload);

      if (row) {
        return mapSourceItemToMaterial(row);
      }

      if (input.originalUrl) {
        const existing = await findExistingMaterialByUrl({
          merchantId: input.merchantId,
          originalUrl: input.originalUrl,
        });

        if (existing) {
          return existing;
        }
      }

      throw new ApiError(500, "MATERIAL_LIBRARY_CREATE_FAILED", "Create failed.");
    } catch (error) {
      throw mapPostgresError(error, "MATERIAL_LIBRARY_CREATE_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
    const now = new Date().toISOString();
    const item: MaterialLibraryItemDto = {
      id: randomUUID(),
      merchantId: input.merchantId,
      sourceItemId: null,
      platform: input.platform,
      materialType: input.materialType,
      sourceKind: input.sourceKind,
      usageType: routing.usageType,
      retrievalTargets: routing.retrievalTargets,
      status,
      title: input.title,
      description: input.description ?? null,
      originalUrl: input.originalUrl ?? null,
      creatorName: input.creatorName ?? null,
      engagementLabel: input.engagementLabel ?? null,
      analysisPayload: materialAnalysisPayload,
      createdAt: now,
      updatedAt: now,
    };

    demoMaterialItems.set(item.id, item);
    return item;
  }

  const supabase = createSupabaseAdminClient();
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

export async function listCachedMaterialProviderItems(input: {
  platform: MaterialPlatform;
  provider: string;
  cacheKey: string;
  maxAgeMs: number;
  limit?: number;
}): Promise<MaterialProviderLibraryItemInput[]> {
  if (shouldUseAppPostgres()) {
    try {
      const cutoff = new Date(Date.now() - input.maxAgeMs).toISOString();
      const result = await queryAppDb<SourceItemMaterialRow>(
        `
        select ${sourceItemMaterialSelect}
        from public.source_items
        where platform = $1
          and created_at >= $2
          and trace_payload @> $3::jsonb
        order by created_at desc
        limit $4
        `,
        [
          input.platform,
          cutoff,
          JSON.stringify({
            materialLibrary: true,
            materialProvider: input.provider,
            materialProviderCacheKey: input.cacheKey,
          }),
          input.limit ?? 20,
        ],
      );

      return result.rows.map(rowToProviderInput);
    } catch (error) {
      throw mapPostgresError(error, "MATERIAL_PROVIDER_CACHE_READ_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
    const cutoff = Date.now() - input.maxAgeMs;

    return Array.from(demoMaterialItems.values())
      .filter((item) => {
        const payload = item.analysisPayload;
        const tracePayload = toRecord(payload.tracePayload);
        const createdAt = new Date(item.createdAt).getTime();

        return (
          item.platform === input.platform &&
          tracePayload.materialProvider === input.provider &&
          tracePayload.materialProviderCacheKey === input.cacheKey &&
          Number.isFinite(createdAt) &&
          createdAt >= cutoff
        );
      })
      .slice(0, input.limit ?? 20)
      .map((item) => {
        const tracePayload = toRecord(item.analysisPayload.tracePayload);

        return {
          platform: item.platform,
          materialType: item.materialType,
          sourceKind: item.sourceKind,
          sourceType: item.sourceKind === "benchmark" ? "search" : "manual_text",
          sourceUrl: item.originalUrl,
          creatorName: item.creatorName,
          title: item.title,
          description: item.description,
          engagementSnapshot: toRecord(item.analysisPayload.engagementSnapshot),
          structureSummary: toRecord(item.analysisPayload.structureSummary),
          tracePayload,
        };
      });
  }

  const cutoff = new Date(Date.now() - input.maxAgeMs).toISOString();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("source_items")
    .select(sourceItemMaterialSelect)
    .eq("platform", input.platform)
    .gte("created_at", cutoff)
    .contains("trace_payload", {
      materialLibrary: true,
      materialProvider: input.provider,
      materialProviderCacheKey: input.cacheKey,
    })
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 20);

  if (error) {
    throw new ApiError(500, "MATERIAL_PROVIDER_CACHE_READ_FAILED", error.message);
  }

  return ((data ?? []) as unknown as SourceItemMaterialRow[]).map(rowToProviderInput);
}

export async function upsertMaterialLibraryItemsFromProvider(input: {
  merchantId: string;
  createdByUserId: string;
  items: MaterialProviderLibraryItemInput[];
}): Promise<MaterialLibraryItemDto[]> {
  if (shouldUseDemoFallback()) {
    const now = new Date().toISOString();
    const savedItems = input.items.map((item) => {
      const material: MaterialLibraryItemDto = {
        id: randomUUID(),
        merchantId: input.merchantId,
        sourceItemId: null,
        platform: item.platform,
        materialType: item.materialType,
        sourceKind: item.sourceKind,
        usageType: "viral_reference",
        retrievalTargets: ["copy_context", "script_context"],
        status: "ready",
        title: item.title,
        description: item.description ?? null,
        originalUrl: item.sourceUrl ?? null,
        creatorName: item.creatorName ?? null,
        engagementLabel:
          typeof item.engagementSnapshot?.label === "string" ? item.engagementSnapshot.label : null,
        analysisPayload: {
          structureSummary: item.structureSummary ?? {},
          engagementSnapshot: item.engagementSnapshot ?? {},
          tracePayload: {
            ...(item.tracePayload ?? {}),
            createdByUserId: input.createdByUserId,
          },
        },
        createdAt: now,
        updatedAt: now,
      };

      demoMaterialItems.set(material.id, material);
      return material;
    });

    return savedItems;
  }

  const rows: MaterialSourceItemWriteRow[] = input.items.map((item) => ({
    merchant_id: input.merchantId,
    platform: item.platform,
    source_type: item.sourceType,
    external_item_id: item.externalItemId ?? null,
    source_url: item.sourceUrl ?? null,
    creator_id: item.creatorId ?? null,
    creator_name: item.creatorName ?? null,
    title: item.title,
    body_text: item.materialType === "article" ? item.description ?? null : null,
    script_text: item.materialType === "video" ? item.description ?? null : null,
    structure_summary: {
      ...(item.structureSummary ?? {}),
      materialType: item.materialType,
      materialStatus: "ready",
      materialSourceKind: item.sourceKind,
      materialUsageType: "viral_reference",
      retrievalTargets: ["copy_context", "script_context"],
    },
    engagement_snapshot: item.engagementSnapshot ?? {},
    trace_payload: {
      ...(item.tracePayload ?? {}),
      materialLibrary: true,
      materialSourceKind: item.sourceKind,
      materialUsageType: "viral_reference",
      retrievalTargets: ["copy_context", "script_context"],
      createdByUserId: input.createdByUserId,
    },
    is_selected_for_rewrite: false,
  }));

  if (rows.length === 0) {
    return [];
  }

  if (shouldUseAppPostgres()) {
    try {
      return await withAppDbTransaction(async (client) => {
        const saved: MaterialLibraryItemDto[] = [];

        for (const row of rows) {
          const existingId = await pgFindExistingProviderMaterialId(client, row);
          const savedRow = existingId
            ? await pgUpdateMaterialLibraryItem(client, existingId, row)
            : await pgInsertMaterialLibraryItem(row, client);

          if (!savedRow) {
            throw new ApiError(
              500,
              "MATERIAL_PROVIDER_ITEMS_SAVE_FAILED",
              "Provider material save failed.",
            );
          }

          saved.push(mapSourceItemToMaterial(savedRow));
        }

        return saved;
      });
    } catch (error) {
      throw mapPostgresError(error, "MATERIAL_PROVIDER_ITEMS_SAVE_FAILED");
    }
  }

  const supabase = createSupabaseAdminClient();
  const saved: MaterialLibraryItemDto[] = [];

  for (const row of rows) {
    let existingId: string | null = null;

    if (row.external_item_id) {
      const { data, error } = await supabase
        .from("source_items")
        .select("id")
        .eq("merchant_id", row.merchant_id)
        .eq("platform", row.platform)
        .eq("external_item_id", row.external_item_id)
        .maybeSingle();

      if (error) {
        throw new ApiError(500, "MATERIAL_PROVIDER_ITEMS_SAVE_FAILED", error.message);
      }

      existingId = typeof data?.id === "string" ? data.id : null;
    } else if (row.source_url) {
      const { data, error } = await supabase
        .from("source_items")
        .select("id")
        .eq("merchant_id", row.merchant_id)
        .eq("source_url", row.source_url)
        .maybeSingle();

      if (error) {
        throw new ApiError(500, "MATERIAL_PROVIDER_ITEMS_SAVE_FAILED", error.message);
      }

      existingId = typeof data?.id === "string" ? data.id : null;
    }

    const { data, error } = existingId
      ? await supabase
          .from("source_items")
          .update(row)
          .eq("id", existingId)
          .select(sourceItemMaterialSelect)
          .single()
      : await supabase
          .from("source_items")
          .insert(row)
          .select(sourceItemMaterialSelect)
          .single();

    if (error || !data) {
      throw new ApiError(500, "MATERIAL_PROVIDER_ITEMS_SAVE_FAILED", error.message);
    }

    saved.push(mapSourceItemToMaterial(data as unknown as SourceItemMaterialRow));
  }

  return saved;
}

export async function createMaterialWorkbenchReference(input: {
  merchantId: string;
  materialItemId: string;
  targetWorkbench: MaterialWorkbenchTarget;
  createdByUserId: string;
}): Promise<MaterialWorkbenchReferenceDto> {
  if (shouldUseAppPostgres()) {
    try {
      return await withAppDbTransaction(async (client) => {
        if (!(await pgGetMaterialLibraryItemRow(input, client))) {
          throw new ApiError(404, "MATERIAL_ITEM_NOT_FOUND", "Material item not found.");
        }

        const result = await client.query<MaterialWorkbenchReferenceRow>(
          `
          insert into public.material_workbench_references (
            merchant_id,
            material_item_id,
            target_workbench,
            status,
            created_by_user_id,
            trace_payload
          ) values ($1, $2, $3, 'pending', $4, $5::jsonb)
          returning ${materialWorkbenchReferenceSelect}
          `,
          [
            input.merchantId,
            input.materialItemId,
            input.targetWorkbench,
            input.createdByUserId,
            JSON.stringify({
              createdByUserId: input.createdByUserId,
              createdFrom: "material_library_repository",
            }),
          ],
        );

        await pgMarkMaterialSelectedForRewrite(client, {
          merchantId: input.merchantId,
          materialItemId: input.materialItemId,
        });

        return mapWorkbenchReference(result.rows[0]);
      });
    } catch (error) {
      throw mapPostgresError(error, "MATERIAL_WORKBENCH_REFERENCE_CREATE_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
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
  if (shouldUseAppPostgres()) {
    try {
      const params: unknown[] = [input.referenceId, input.merchantId];
      const targetSql = input.targetWorkbench
        ? `and target_workbench = $${params.length + 1}`
        : "";
      if (input.targetWorkbench) {
        params.push(input.targetWorkbench);
      }
      const result = await queryAppDb<MaterialWorkbenchReferenceRow>(
        `
        select ${materialWorkbenchReferenceSelect}
        from public.material_workbench_references
        where id = $1
          and merchant_id = $2
          ${targetSql}
        limit 1
        `,
        params,
      );

      return result.rows[0] ? mapWorkbenchReference(result.rows[0]) : null;
    } catch (error) {
      throw mapPostgresError(error, "MATERIAL_WORKBENCH_REFERENCE_READ_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
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
  if (shouldUseAppPostgres()) {
    try {
      const params: unknown[] = [input.merchantId, input.draftId];
      const targetSql = input.targetWorkbench
        ? `and target_workbench = $${params.length + 1}`
        : "";
      if (input.targetWorkbench) {
        params.push(input.targetWorkbench);
      }
      const result = await queryAppDb<MaterialWorkbenchReferenceRow>(
        `
        select ${materialWorkbenchReferenceSelect}
        from public.material_workbench_references
        where merchant_id = $1
          and draft_id = $2
          ${targetSql}
        order by created_at asc
        `,
        params,
      );

      return result.rows.map(mapWorkbenchReference);
    } catch (error) {
      throw mapPostgresError(error, "MATERIAL_WORKBENCH_REFERENCE_LIST_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
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
  if (shouldUseAppPostgres()) {
    try {
      const params: unknown[] = [
        input.draftId,
        new Date().toISOString(),
        input.referenceId,
        input.merchantId,
        input.targetWorkbench,
      ];
      const materialSql = input.materialItemId ? `and material_item_id = $${params.length + 1}` : "";
      if (input.materialItemId) {
        params.push(input.materialItemId);
      }
      const result = await queryAppDb<MaterialWorkbenchReferenceRow>(
        `
        update public.material_workbench_references
        set status = 'consumed',
            draft_id = $1,
            consumed_at = $2
        where id = $3
          and merchant_id = $4
          and target_workbench = $5
          ${materialSql}
        returning ${materialWorkbenchReferenceSelect}
        `,
        params,
      );

      return result.rows[0] ? mapWorkbenchReference(result.rows[0]) : null;
    } catch (error) {
      throw mapPostgresError(error, "MATERIAL_WORKBENCH_REFERENCE_CONSUME_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
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
  if (shouldUseAppPostgres()) {
    try {
      await pgMarkMaterialSelectedForRewrite(undefined, input);
      return;
    } catch (error) {
      throw mapPostgresError(error, "MATERIAL_SELECTED_FOR_REWRITE_UPDATE_FAILED");
    }
  }

  if (shouldUseDemoFallback()) {
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
  if (shouldUseAppPostgres()) {
    try {
      const result = await queryAppDb<SourceItemMaterialRow>(
        `
        select ${sourceItemMaterialSelect}
        from public.source_items
        where merchant_id = $1
          and source_url = $2
          and trace_payload @> $3::jsonb
        limit 1
        `,
        [input.merchantId, input.originalUrl, JSON.stringify({ materialLibrary: true })],
      );

      return result.rows[0] ? mapSourceItemToMaterial(result.rows[0]) : null;
    } catch {
      return null;
    }
  }

  if (shouldUseDemoFallback()) {
    return (
      Array.from(demoMaterialItems.values()).find(
        (item) =>
          item.merchantId === input.merchantId && item.originalUrl === input.originalUrl,
      ) ?? null
    );
  }

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

async function pgGetMaterialLibraryItemRow(
  input: {
    merchantId: string;
    materialItemId: string;
  },
  client?: DatabaseClient,
): Promise<SourceItemMaterialRow | null> {
  const executor = client ?? { query: queryAppDb };
  const result = await executor.query<SourceItemMaterialRow>(
    `
    select ${sourceItemMaterialSelect}
    from public.source_items
    where id = $1
      and merchant_id = $2
      and trace_payload @> $3::jsonb
    limit 1
    `,
    [input.materialItemId, input.merchantId, JSON.stringify({ materialLibrary: true })],
  );

  return result.rows[0] ?? null;
}

async function pgInsertMaterialLibraryItem(
  row: MaterialSourceItemWriteRow,
  client?: DatabaseClient,
): Promise<SourceItemMaterialRow | null> {
  const executor = client ?? { query: queryAppDb };
  const result = await executor.query<SourceItemMaterialRow>(
    `
    insert into public.source_items (
      merchant_id,
      platform,
      source_type,
      external_item_id,
      source_url,
      creator_id,
      creator_name,
      title,
      body_text,
      script_text,
      structure_summary,
      engagement_snapshot,
      trace_payload,
      is_selected_for_rewrite
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14
    )
    on conflict (merchant_id, source_url) where source_url is not null
    do nothing
    returning ${sourceItemMaterialSelect}
    `,
    buildMaterialSourceItemParams(row),
  );

  return result.rows[0] ?? null;
}

async function pgUpdateMaterialLibraryItem(
  client: DatabaseClient,
  materialItemId: string,
  row: MaterialSourceItemWriteRow,
): Promise<SourceItemMaterialRow> {
  const result = await client.query<SourceItemMaterialRow>(
    `
    update public.source_items
    set platform = $2,
        source_type = $3,
        external_item_id = $4,
        source_url = $5,
        creator_id = $6,
        creator_name = $7,
        title = $8,
        body_text = $9,
        script_text = $10,
        structure_summary = $11::jsonb,
        engagement_snapshot = $12::jsonb,
        trace_payload = $13::jsonb,
        is_selected_for_rewrite = $14
    where id = $15
      and merchant_id = $1
    returning ${sourceItemMaterialSelect}
    `,
    [...buildMaterialSourceItemParams(row), materialItemId],
  );

  if (!result.rows[0]) {
    throw new ApiError(404, "MATERIAL_ITEM_NOT_FOUND", "Material item not found.");
  }

  return result.rows[0];
}

async function pgFindExistingProviderMaterialId(
  client: DatabaseClient,
  row: MaterialSourceItemWriteRow,
): Promise<string | null> {
  if (row.external_item_id) {
    const result = await client.query<{ id: string }>(
      `
      select id
      from public.source_items
      where merchant_id = $1
        and platform = $2
        and external_item_id = $3
      limit 1
      `,
      [row.merchant_id, row.platform, row.external_item_id],
    );

    return result.rows[0]?.id ?? null;
  }

  if (row.source_url) {
    const result = await client.query<{ id: string }>(
      `
      select id
      from public.source_items
      where merchant_id = $1
        and source_url = $2
      limit 1
      `,
      [row.merchant_id, row.source_url],
    );

    return result.rows[0]?.id ?? null;
  }

  return null;
}

async function pgMarkMaterialSelectedForRewrite(
  client: DatabaseClient | undefined,
  input: {
    merchantId: string;
    materialItemId: string;
  },
) {
  const executor = client ?? { query: queryAppDb };
  await executor.query(
    `
    update public.source_items
    set is_selected_for_rewrite = true
    where id = $1
      and merchant_id = $2
    `,
    [input.materialItemId, input.merchantId],
  );
}

function buildMaterialSourceItemParams(row: MaterialSourceItemWriteRow) {
  return [
    row.merchant_id,
    row.platform,
    row.source_type,
    row.external_item_id,
    row.source_url,
    row.creator_id,
    row.creator_name,
    row.title,
    row.body_text,
    row.script_text,
    JSON.stringify(row.structure_summary ?? {}),
    JSON.stringify(row.engagement_snapshot ?? {}),
    JSON.stringify(row.trace_payload ?? {}),
    row.is_selected_for_rewrite,
  ];
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
    createdAt: toIsoString(row.created_at),
    consumedAt: row.consumed_at ? toIsoString(row.consumed_at) : null,
  };
}

function mapSourceItemToMaterial(row: SourceItemMaterialRow): MaterialLibraryItemDto {
  const structureSummary = toRecord(row.structure_summary);
  const engagementSnapshot = toRecord(row.engagement_snapshot);
  const tracePayload = toRecord(row.trace_payload);
  const materialType = normalizeMaterialType(structureSummary.materialType, row.script_text);
  const sourceKind = normalizeSourceKind(tracePayload.materialSourceKind, row.source_type);
  const status = normalizeMaterialStatus(structureSummary.materialStatus);
  const analysisPayload = {
    structureSummary,
    engagementSnapshot,
    tracePayload,
    selectedForRewrite: row.is_selected_for_rewrite,
  };
  const routing = normalizeMaterialRouting({
    materialType,
    sourceKind,
    status,
    analysisPayload,
  });

  return {
    id: row.id,
    merchantId: row.merchant_id,
    sourceItemId: row.id,
    platform: row.platform,
    materialType,
    sourceKind,
    usageType: routing.usageType,
    retrievalTargets: routing.retrievalTargets,
    status,
    title: row.title ?? "未命名素材",
    description: materialType === "video" ? row.script_text : row.body_text,
    originalUrl: row.source_url,
    creatorName: row.creator_name,
    engagementLabel:
      typeof engagementSnapshot.label === "string" ? engagementSnapshot.label : null,
    analysisPayload,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.created_at),
  };
}

function rowToProviderInput(row: SourceItemMaterialRow): MaterialProviderLibraryItemInput {
  const structureSummary = toRecord(row.structure_summary);
  const engagementSnapshot = toRecord(row.engagement_snapshot);
  const tracePayload = toRecord(row.trace_payload);
  const materialType = normalizeMaterialType(structureSummary.materialType, row.script_text);
  const sourceKind = normalizeSourceKind(tracePayload.materialSourceKind, row.source_type);

  return {
    platform: row.platform,
    materialType,
    sourceKind,
    sourceType: row.source_type,
    externalItemId: row.external_item_id,
    sourceUrl: row.source_url,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    title: row.title ?? "未命名素材",
    description: materialType === "video" ? row.script_text : row.body_text,
    engagementSnapshot,
    structureSummary,
    tracePayload: {
      ...tracePayload,
      copiedFromSourceItemId: row.id,
      copiedFromMerchantId: row.merchant_id,
      providerCacheHit: true,
    },
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

function shouldUseAppPostgres() {
  return isAppPostgresConfigured() && isAppPostgresPreferred();
}

function shouldUseDemoFallback() {
  return !isAppPostgresConfigured() && !isSupabaseAdminConfigured();
}

function toIsoString(value: Timestamp) {
  return value instanceof Date ? value.toISOString() : value;
}

function isMissingMaterialReferenceTable(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42P01" ||
    Boolean(error?.message?.includes("material_workbench_references"))
  );
}
