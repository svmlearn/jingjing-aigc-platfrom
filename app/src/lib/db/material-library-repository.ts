import "server-only";

import { randomUUID } from "node:crypto";

import type {
  MaterialLibraryItemDto,
  MaterialLibraryFilter,
  MaterialPlatform,
  MaterialRetrievalTarget,
  MaterialSourceKind,
  MaterialStatus,
  MaterialType,
  MaterialWorkbenchReferenceDto,
  MaterialWorkbenchTarget,
} from "@/contracts/material";
import { isLocalDemoRuntime } from "@/lib/demo/local-demo-runtime";
import { upsertImportedComments } from "@/lib/db/import-repository";
import { normalizeMaterialRouting } from "@/lib/material-routing";
import { rankMaterialLibraryItemsForRetrieval } from "@/lib/material-retrieval";
import {
  mapPostgresError,
  queryAppDb,
  withAppDbTransaction,
  type DatabaseClient,
} from "@/lib/server-db/postgres";
import { ApiError } from "@/server/api/errors";
import type { NormalizedComment } from "@/server/import-providers/types";

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
  comments?: NormalizedComment[];
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
} & MaterialLibraryFilter): Promise<MaterialLibraryItemDto[]> {
  if (isLocalDemoRuntime()) {
    const materials = filterMaterialLibraryItems(
      Array.from(demoMaterialItems.values()).filter(
        (item) => item.merchantId === input.merchantId && item.status !== "archived",
      ),
      input,
    );

    return rankMaterialLibraryItemsForRetrieval({
      materials,
      retrievalTarget: input.retrievalTarget,
      query: input.query,
      limit: input.limit ?? 50,
    });
  }

  try {
    const candidateLimit =
      input.retrievalTarget || input.query
        ? Math.max(input.limit ?? 50, 160)
        : input.limit ?? 50;
    const params: unknown[] = [input.merchantId, JSON.stringify({ materialLibrary: true })];
    const whereClauses = [
      "merchant_id = $1",
      "trace_payload @> $2::jsonb",
      "coalesce(structure_summary->>'materialStatus', 'ready') not in ('archived', 'failed')",
    ];

    if (input.platform) {
      params.push(input.platform);
      whereClauses.push(`platform = $${params.length}`);
    }

    if (input.materialType) {
      params.push(input.materialType);
      whereClauses.push(
        `coalesce(structure_summary->>'materialType', case when script_text is not null then 'video' else 'article' end) = $${params.length}`,
      );
    }

    if (input.usageType) {
      params.push(input.usageType);
      whereClauses.push(
        `coalesce(structure_summary->>'materialUsageType', trace_payload->>'materialUsageType') = $${params.length}`,
      );
    }

    params.push(candidateLimit);
    const result = await queryAppDb<SourceItemMaterialRow>(
      `
      select ${sourceItemMaterialSelect}
      from public.source_items
      where ${whereClauses.join("\n        and ")}
      order by created_at desc
      limit $${params.length}
      `,
      params,
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

export async function getMaterialLibraryItemById(input: {
  merchantId: string;
  materialItemId: string;
}): Promise<MaterialLibraryItemDto> {
  if (isLocalDemoRuntime()) {
    const item = demoMaterialItems.get(input.materialItemId);

    if (!item || item.merchantId !== input.merchantId) {
      throw new ApiError(404, "MATERIAL_ITEM_NOT_FOUND", "Material item not found.");
    }

    return item;
  }

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

function filterMaterialLibraryItems(
  materials: MaterialLibraryItemDto[],
  filters: MaterialLibraryFilter,
) {
  return materials.filter((item) =>
    (!filters.platform || item.platform === filters.platform) &&
    (!filters.materialType || item.materialType === filters.materialType) &&
    (!filters.usageType || item.usageType === filters.usageType),
  );
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

  if (isLocalDemoRuntime()) {
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

export async function listCachedMaterialProviderItems(input: {
  platform: MaterialPlatform;
  provider: string;
  cacheKey: string;
  maxAgeMs: number;
  limit?: number;
}): Promise<MaterialProviderLibraryItemInput[]> {
  if (isLocalDemoRuntime()) {
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

export async function upsertMaterialLibraryItemsFromProvider(input: {
  merchantId: string;
  createdByUserId: string;
  items: MaterialProviderLibraryItemInput[];
}): Promise<MaterialLibraryItemDto[]> {
  if (isLocalDemoRuntime()) {
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
            materialComments: item.comments ?? [],
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
      materialComments: item.comments ?? [],
      createdByUserId: input.createdByUserId,
    },
    is_selected_for_rewrite: false,
  }));

  if (rows.length === 0) {
    return [];
  }

  try {
    const savedWithComments = await withAppDbTransaction(async (client) => {
      const saved: Array<{ material: MaterialLibraryItemDto; comments: NormalizedComment[] }> = [];

      for (const [index, row] of rows.entries()) {
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

        saved.push({
          material: mapSourceItemToMaterial(savedRow),
          comments: input.items[index]?.comments ?? [],
        });
      }

      return saved;
    });

    await persistProviderComments(savedWithComments);
    return savedWithComments.map((item) => item.material);
  } catch (error) {
    throw mapPostgresError(error, "MATERIAL_PROVIDER_ITEMS_SAVE_FAILED");
  }
}

export async function createMaterialWorkbenchReference(input: {
  merchantId: string;
  materialItemId: string;
  targetWorkbench: MaterialWorkbenchTarget;
  createdByUserId: string;
}): Promise<MaterialWorkbenchReferenceDto> {
  if (isLocalDemoRuntime()) {
    const item = demoMaterialItems.get(input.materialItemId);

    if (!item || item.merchantId !== input.merchantId) {
      throw new ApiError(404, "MATERIAL_ITEM_NOT_FOUND", "Material item not found.");
    }

    const reference = buildWorkbenchReference(input);
    demoWorkbenchReferences.set(reference.id, reference);
    return reference;
  }

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

export async function getMaterialWorkbenchReference(input: {
  merchantId: string;
  referenceId: string;
  targetWorkbench?: MaterialWorkbenchTarget;
}): Promise<MaterialWorkbenchReferenceDto | null> {
  if (isLocalDemoRuntime()) {
    const reference = demoWorkbenchReferences.get(input.referenceId);

    if (!reference || reference.merchantId !== input.merchantId) {
      return null;
    }

    if (input.targetWorkbench && reference.targetWorkbench !== input.targetWorkbench) {
      return null;
    }

    return reference;
  }

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

export async function listMaterialWorkbenchReferencesByDraft(input: {
  merchantId: string;
  draftId: string;
  targetWorkbench?: MaterialWorkbenchTarget;
}): Promise<MaterialWorkbenchReferenceDto[]> {
  if (isLocalDemoRuntime()) {
    return Array.from(demoWorkbenchReferences.values()).filter(
      (reference) =>
        reference.merchantId === input.merchantId &&
        reference.draftId === input.draftId &&
        (!input.targetWorkbench || reference.targetWorkbench === input.targetWorkbench),
    );
  }

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

export async function consumeMaterialWorkbenchReference(input: {
  merchantId: string;
  referenceId: string;
  targetWorkbench: MaterialWorkbenchTarget;
  draftId: string;
  materialItemId?: string | null;
}): Promise<MaterialWorkbenchReferenceDto | null> {
  if (isLocalDemoRuntime()) {
    const reference = demoWorkbenchReferences.get(input.referenceId);

    if (
      !reference ||
      reference.merchantId !== input.merchantId ||
      reference.targetWorkbench !== input.targetWorkbench ||
      (input.materialItemId && reference.materialItemId !== input.materialItemId)
    ) {
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

async function findExistingMaterialByUrl(input: {
  merchantId: string;
  originalUrl: string;
}): Promise<MaterialLibraryItemDto | null> {
  if (isLocalDemoRuntime()) {
    return (
      Array.from(demoMaterialItems.values()).find(
        (item) =>
          item.merchantId === input.merchantId && item.originalUrl === input.originalUrl,
      ) ?? null
    );
  }

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

async function persistProviderComments(
  items: Array<{ material: MaterialLibraryItemDto; comments: NormalizedComment[] }>,
) {
  for (const item of items) {
    if (!item.material.sourceItemId || item.comments.length === 0) {
      continue;
    }

    try {
      await upsertImportedComments({
        sourceItemId: item.material.sourceItemId,
        comments: item.comments,
      });
    } catch (error) {
      console.warn("Material comments save failed", {
        materialItemId: item.material.id,
        error: error instanceof Error ? error.message : error,
      });
    }
  }
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
    comments: normalizeTracePayloadComments(tracePayload.materialComments),
  };
}

function normalizeTracePayloadComments(value: unknown): NormalizedComment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const content = typeof record.content === "string" ? record.content.trim() : "";

    if (!content) {
      return [];
    }

    return [{
      externalCommentId: typeof record.externalCommentId === "string" ? record.externalCommentId : undefined,
      parentExternalCommentId:
        typeof record.parentExternalCommentId === "string" ? record.parentExternalCommentId : undefined,
      authorName: typeof record.authorName === "string" ? record.authorName : undefined,
      content,
      likeCount: typeof record.likeCount === "number" ? record.likeCount : undefined,
      replyCount: typeof record.replyCount === "number" ? record.replyCount : undefined,
      publishedAt: typeof record.publishedAt === "string" ? record.publishedAt : undefined,
      tracePayload: record.tracePayload,
    }];
  });
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

function toIsoString(value: Timestamp) {
  return value instanceof Date ? value.toISOString() : value;
}
