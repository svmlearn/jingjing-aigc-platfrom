import type {
  MaterialLibraryItemDto,
  MaterialRetrievalTarget,
  MaterialUsageType,
} from "@/contracts/material";
import { materialMatchesRetrievalTarget } from "./material-routing.ts";

export type MaterialRetrievalMatchReason = {
  code:
    | "retrieval_target"
    | "usage_target"
    | "keyword_match"
    | "exact_query"
    | "source_priority"
    | "recent_upload";
  label: string;
  weight: number;
  evidence?: string;
};

type MaterialRetrievalTrace = {
  retrievalTarget: MaterialRetrievalTarget | null;
  query: string | null;
  score: number;
  queryTerms: string[];
  matchReasons: MaterialRetrievalMatchReason[];
};

type RankMaterialInput = {
  materials: MaterialLibraryItemDto[];
  retrievalTarget?: MaterialRetrievalTarget;
  query?: string | null;
  limit?: number;
  now?: Date;
};

const usageTargetWeights: Record<
  MaterialRetrievalTarget,
  Partial<Record<MaterialUsageType, number>>
> = {
  copy_context: {
    text_knowledge: 18,
    viral_reference: 14,
  },
  script_context: {
    text_knowledge: 16,
    viral_reference: 18,
  },
  article_image_asset: {
    image_asset: 24,
  },
  video_edit_asset: {
    video_asset: 24,
  },
};

export function rankMaterialLibraryItemsForRetrieval(
  input: RankMaterialInput,
): MaterialLibraryItemDto[] {
  const query = input.query?.trim() ?? "";
  const queryTerms = tokenizeMaterialRetrievalQuery(query);
  const now = input.now ?? new Date();
  const candidates = input.materials.filter((material) =>
    input.retrievalTarget
      ? materialMatchesRetrievalTarget(material, input.retrievalTarget)
      : material.status !== "archived" && material.status !== "failed",
  );
  const ranked = candidates
    .map((material) => {
      const score = scoreMaterialForRetrieval({
        material,
        retrievalTarget: input.retrievalTarget ?? null,
        query,
        queryTerms,
        now,
      });

      return {
        material: attachMaterialRetrievalTrace(material, {
          retrievalTarget: input.retrievalTarget ?? null,
          query: query || null,
          score: score.total,
          queryTerms,
          matchReasons: score.matchReasons,
        }),
        score: score.total,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const createdAtDiff =
        Date.parse(right.material.createdAt) - Date.parse(left.material.createdAt);
      if (createdAtDiff !== 0 && Number.isFinite(createdAtDiff)) {
        return createdAtDiff;
      }

      return left.material.id.localeCompare(right.material.id);
    })
    .map((item) => item.material);

  return typeof input.limit === "number" ? ranked.slice(0, input.limit) : ranked;
}

export function buildMaterialSearchIndexText(material: MaterialLibraryItemDto) {
  const strings = [
    material.title,
    material.description ?? "",
    material.creatorName ?? "",
    material.engagementLabel ?? "",
    material.platform,
    material.materialType,
    material.sourceKind,
    material.usageType,
    material.status,
    ...material.retrievalTargets,
    ...extractSearchableStrings(material.analysisPayload),
  ];

  return uniqueStrings(strings)
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 16_000);
}

export function tokenizeMaterialRetrievalQuery(query: string | null | undefined) {
  const chunks = normalizeForSearch(query ?? "")
    .split(/[^\p{L}\p{N}]+/gu)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
  const terms: string[] = [];

  for (const chunk of chunks) {
    terms.push(chunk);

    if (isHanText(chunk) && chunk.length > 2) {
      for (const size of [2, 3, 4]) {
        if (chunk.length < size) {
          continue;
        }

        for (let index = 0; index <= chunk.length - size; index += 1) {
          terms.push(chunk.slice(index, index + size));
        }
      }
    }
  }

  return uniqueStrings(terms).slice(0, 40);
}

export function readMaterialRetrievalTrace(
  material: MaterialLibraryItemDto,
): MaterialRetrievalTrace | null {
  const trace = toRecord(material.analysisPayload.materialRetrieval);
  const score = typeof trace.score === "number" && Number.isFinite(trace.score)
    ? trace.score
    : null;

  if (score === null) {
    return null;
  }

  return {
    retrievalTarget: isRetrievalTarget(trace.retrievalTarget)
      ? trace.retrievalTarget
      : null,
    query: typeof trace.query === "string" ? trace.query : null,
    score,
    queryTerms: Array.isArray(trace.queryTerms)
      ? trace.queryTerms.filter((item): item is string => typeof item === "string")
      : [],
    matchReasons: Array.isArray(trace.matchReasons)
      ? trace.matchReasons
          .map(normalizeMatchReason)
          .filter((item): item is MaterialRetrievalMatchReason => Boolean(item))
      : [],
  };
}

function scoreMaterialForRetrieval(input: {
  material: MaterialLibraryItemDto;
  retrievalTarget: MaterialRetrievalTarget | null;
  query: string;
  queryTerms: string[];
  now: Date;
}) {
  const matchReasons: MaterialRetrievalMatchReason[] = [];
  let total = 0;

  if (input.retrievalTarget) {
    total += 40;
    matchReasons.push({
      code: "retrieval_target",
      label: `命中 ${input.retrievalTarget} 素材池`,
      weight: 40,
    });

    const usageWeight =
      usageTargetWeights[input.retrievalTarget][input.material.usageType] ?? 0;
    if (usageWeight > 0) {
      total += usageWeight;
      matchReasons.push({
        code: "usage_target",
        label: `素材用途 ${input.material.usageType} 可服务当前检索目标`,
        weight: usageWeight,
      });
    }
  }

  const sourceWeight = getSourcePriorityWeight(input.material, input.retrievalTarget);
  if (sourceWeight > 0) {
    total += sourceWeight;
    matchReasons.push({
      code: "source_priority",
      label:
        input.material.sourceKind === "uploaded"
          ? "用户或团队上传素材优先"
          : "对标爆款素材优先作为表达参考",
      weight: sourceWeight,
    });
  }

  const indexText = normalizeForSearch(buildMaterialSearchIndexText(input.material));
  const normalizedQuery = normalizeForSearch(input.query);
  if (normalizedQuery && indexText.includes(normalizedQuery)) {
    total += 28;
    matchReasons.push({
      code: "exact_query",
      label: "完整 query 命中素材摘要",
      weight: 28,
      evidence: input.query,
    });
  }

  const hitTerms = input.queryTerms.filter((term) => indexText.includes(term));
  if (hitTerms.length > 0) {
    const keywordWeight = Math.min(
      72,
      hitTerms.length * 6 + (hitTerms.length / Math.max(input.queryTerms.length, 1)) * 24,
    );
    total += keywordWeight;
    matchReasons.push({
      code: "keyword_match",
      label: `命中 ${hitTerms.length} 个 query 关键词`,
      weight: Number(keywordWeight.toFixed(2)),
      evidence: hitTerms.slice(0, 8).join(" / "),
    });
  }

  const recencyWeight = getRecencyWeight(input.material.createdAt, input.now);
  if (recencyWeight > 0) {
    total += recencyWeight;
    matchReasons.push({
      code: "recent_upload",
      label: "近期入库素材优先",
      weight: recencyWeight,
    });
  }

  return {
    total: Number(total.toFixed(2)),
    matchReasons,
  };
}

function attachMaterialRetrievalTrace(
  material: MaterialLibraryItemDto,
  trace: MaterialRetrievalTrace,
): MaterialLibraryItemDto {
  return {
    ...material,
    analysisPayload: {
      ...material.analysisPayload,
      materialRetrieval: trace,
    },
  };
}

function getSourcePriorityWeight(
  material: MaterialLibraryItemDto,
  target: MaterialRetrievalTarget | null,
) {
  if (target === "article_image_asset" || target === "video_edit_asset") {
    return material.sourceKind === "uploaded" ? 10 : 0;
  }

  if (target === "copy_context" || target === "script_context") {
    return material.sourceKind === "benchmark" ? 8 : 4;
  }

  return 0;
}

function getRecencyWeight(createdAt: string, now: Date) {
  const createdAtMs = Date.parse(createdAt);
  const nowMs = now.getTime();

  if (!Number.isFinite(createdAtMs) || !Number.isFinite(nowMs) || createdAtMs > nowMs) {
    return 0;
  }

  const ageHours = Math.max((nowMs - createdAtMs) / (60 * 60 * 1000), 0);
  return Number(Math.max(0, 8 - Math.log2(ageHours + 1)).toFixed(2));
}

function extractSearchableStrings(value: unknown, depth = 0): string[] {
  if (depth > 4) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractSearchableStrings(item, depth + 1)).slice(0, 80);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, nested]) => [key, ...extractSearchableStrings(nested, depth + 1)])
    .slice(0, 120);
}

function normalizeMatchReason(value: unknown): MaterialRetrievalMatchReason | null {
  const record = toRecord(value);
  const code = record.code;
  const weight = record.weight;

  if (
    code !== "retrieval_target" &&
    code !== "usage_target" &&
    code !== "keyword_match" &&
    code !== "exact_query" &&
    code !== "source_priority" &&
    code !== "recent_upload"
  ) {
    return null;
  }

  return {
    code,
    label: typeof record.label === "string" ? record.label : code,
    weight: typeof weight === "number" && Number.isFinite(weight) ? weight : 0,
    evidence: typeof record.evidence === "string" ? record.evidence : undefined,
  };
}

function normalizeForSearch(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isHanText(value: string) {
  return /^[\p{Script=Han}]+$/u.test(value);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function isRetrievalTarget(value: unknown): value is MaterialRetrievalTarget {
  return (
    value === "copy_context" ||
    value === "script_context" ||
    value === "article_image_asset" ||
    value === "video_edit_asset"
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
