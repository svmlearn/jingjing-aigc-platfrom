import type {
  MaterialLibraryItemDto,
  MaterialRetrievalTarget,
  MaterialSourceKind,
  MaterialStatus,
  MaterialType,
  MaterialUsageType,
} from "@/contracts/material";

type MaterialRoutingInput = {
  materialType: MaterialType;
  sourceKind: MaterialSourceKind;
  status?: MaterialStatus | null;
  analysisPayload?: Record<string, unknown> | null;
};

export function getRetrievalTargetsForUsage(input: {
  usageType: MaterialUsageType;
  status?: MaterialStatus | null;
}): MaterialRetrievalTarget[] {
  if (input.status === "archived" || input.status === "failed") {
    return [];
  }

  switch (input.usageType) {
    case "text_knowledge":
    case "viral_reference":
      return ["copy_context", "script_context"];
    case "image_asset":
      return input.status === "ready" ? ["article_image_asset"] : [];
    case "video_asset":
      return input.status === "ready" ? ["video_edit_asset"] : [];
  }
}

export function inferMaterialUsageType(input: MaterialRoutingInput): MaterialUsageType {
  const analysisPayload = toRecord(input.analysisPayload);
  const structureSummary = toRecord(analysisPayload.structureSummary);
  const tracePayload = toRecord(analysisPayload.tracePayload);
  const materialAnalysis = toRecord(tracePayload.materialAnalysis);
  const explicitUsage = firstMaterialUsageType(
    analysisPayload.materialUsageType,
    structureSummary.materialUsageType,
    tracePayload.materialUsageType,
    materialAnalysis.materialUsageType,
  );

  if (explicitUsage) {
    return explicitUsage;
  }

  const category = firstString(
    analysisPayload.materialCategory,
    structureSummary.materialCategory,
    tracePayload.materialCategory,
    materialAnalysis.materialCategory,
  );
  const assetType = firstString(
    analysisPayload.assetType,
    structureSummary.assetType,
    tracePayload.assetType,
    materialAnalysis.assetType,
  );

  if (category === "project_media_asset") {
    return assetType === "video" ? "video_asset" : "image_asset";
  }

  if (input.sourceKind === "benchmark") {
    return "viral_reference";
  }

  return "viral_reference";
}

export function normalizeMaterialRouting(input: MaterialRoutingInput): {
  usageType: MaterialUsageType;
  retrievalTargets: MaterialRetrievalTarget[];
} {
  const analysisPayload = toRecord(input.analysisPayload);
  const structureSummary = toRecord(analysisPayload.structureSummary);
  const explicitTargets = normalizeRetrievalTargets(
    analysisPayload.retrievalTargets ??
      structureSummary.retrievalTargets ??
      toRecord(analysisPayload.tracePayload).retrievalTargets ??
      toRecord(toRecord(analysisPayload.tracePayload).materialAnalysis).retrievalTargets,
  );
  const usageType = inferMaterialUsageType(input);
  const derivedTargets = getRetrievalTargetsForUsage({
    usageType,
    status: input.status ?? "ready",
  });

  return {
    usageType,
    retrievalTargets: explicitTargets.length
      ? explicitTargets.filter((target) => derivedTargets.includes(target))
      : derivedTargets,
  };
}

export function materialMatchesRetrievalTarget(
  material: Pick<MaterialLibraryItemDto, "retrievalTargets" | "status">,
  target: MaterialRetrievalTarget,
) {
  if (material.status === "archived" || material.status === "failed") {
    return false;
  }

  return material.retrievalTargets.includes(target);
}

export function buildMaterialRoutingTrace(
  material: Pick<
    MaterialLibraryItemDto,
    | "id"
    | "title"
    | "materialType"
    | "sourceKind"
    | "usageType"
    | "retrievalTargets"
    | "status"
  >,
) {
  return {
    id: material.id,
    title: material.title,
    materialType: material.materialType,
    sourceKind: material.sourceKind,
    usageType: material.usageType,
    retrievalTargets: material.retrievalTargets,
    status: material.status,
  };
}

function normalizeRetrievalTargets(value: unknown): MaterialRetrievalTarget[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const targets = value.filter(isMaterialRetrievalTarget);
  return Array.from(new Set(targets));
}

function firstMaterialUsageType(...values: unknown[]): MaterialUsageType | null {
  for (const value of values) {
    if (
      value === "text_knowledge" ||
      value === "viral_reference" ||
      value === "image_asset" ||
      value === "video_asset"
    ) {
      return value;
    }
  }

  return null;
}

function isMaterialRetrievalTarget(value: unknown): value is MaterialRetrievalTarget {
  return (
    value === "copy_context" ||
    value === "script_context" ||
    value === "article_image_asset" ||
    value === "video_edit_asset"
  );
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
