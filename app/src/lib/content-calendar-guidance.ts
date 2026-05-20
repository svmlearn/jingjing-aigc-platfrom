import type {
  ContentCalendarGuidanceDto,
  ContentCalendarItemDto,
  ContentCalendarKnowledgeRefDto,
  StrategySnapshotDto,
} from "@/contracts/consultation";
import type { KnowledgeSearchMatchDto } from "@/contracts/knowledge";

const calendarGuidanceSource = "consultation_knowledge_distillation_v1";

export function buildMerchantKnowledgeCalendarGuidance(input: {
  matches: KnowledgeSearchMatchDto[];
  snapshot: StrategySnapshotDto;
  maxRefs?: number;
}): ContentCalendarGuidanceDto | null {
  const refs = input.matches
    .filter((match) => match.scope === "merchant")
    .map(toCalendarKnowledgeRef)
    .filter((ref): ref is ContentCalendarKnowledgeRefDto => Boolean(ref))
    .filter(uniqueKnowledgeRef)
    .slice(0, input.maxRefs ?? 6);

  if (refs.length === 0) {
    return null;
  }

  const mustUseFacts = usefulUniqueStrings([
    ...refs.map((ref) => ref.summary),
    ...input.snapshot.coreSellingPoints,
  ]).slice(0, 8);
  const contentAngles = usefulUniqueStrings([
    ...input.snapshot.strategyTags,
    ...input.snapshot.keyScenes,
    ...refs.map((ref) => ref.title),
  ]).slice(0, 8);
  const assetCapabilityHints = buildAssetCapabilityHints(input.snapshot);

  return {
    source: calendarGuidanceSource,
    summary: refs
      .map((ref) => `${ref.title}：${ref.summary}`)
      .slice(0, 3)
      .join("\n"),
    mustUseFacts,
    sellingPointHints: usefulUniqueStrings(input.snapshot.coreSellingPoints).slice(0, 8),
    audienceHints: usefulUniqueStrings(input.snapshot.targetAudiences).slice(0, 8),
    contentAngles,
    complianceNotes: [
      "知识库片段只作为事实依据；价格、收益、资质、案例、活动承诺必须以实际资料为准。",
      "生成内容不得扩写成用户知识库未明确支持的确定性承诺。",
    ],
    materialHints: usefulUniqueStrings(input.snapshot.keyScenes).slice(0, 6),
    assetCapabilityHints,
    retrievalTrace: input.matches
      .filter((match) => match.scope === "merchant")
      .map((match) => ({
        source: getString(match.metadata.retrievalSource, "knowledge_search"),
        documentId: match.documentId,
        chunkId: match.chunkId,
        documentTitle: match.documentTitle,
        scope: match.scope,
        score: Number(match.score.toFixed(4)),
      }))
      .filter(uniqueRetrievalTrace)
      .slice(0, 12),
    knowledgeRefs: refs,
  };
}

export function attachGuidanceToContentCalendar(input: {
  calendar: ContentCalendarItemDto[];
  guidance: ContentCalendarGuidanceDto | null;
}): ContentCalendarItemDto[] {
  const guidance = input.guidance;

  if (!guidance || input.calendar.length === 0) {
    return input.calendar;
  }

  return input.calendar.map((item) => ({
    ...item,
    guidance: mergeContentCalendarGuidance(item.guidance ?? null, guidance),
  }));
}

export function collectContentCalendarKnowledgeRefs(
  items: Array<ContentCalendarItemDto | null | undefined>,
) {
  return items
    .flatMap((item) => item?.guidance?.knowledgeRefs ?? [])
    .map((ref) => ({
      ...ref,
      source: ref.source || "merchant_knowledge_base",
      usageType: "calendar_guidance",
      retrievalTargets: ["copy_context", "script_context"],
    }))
    .filter(uniqueKnowledgeRef);
}

export function collectContentCalendarGuidanceSummary(
  items: Array<ContentCalendarItemDto | null | undefined>,
) {
  const guidance = items
    .map((item) => item?.guidance)
    .filter((item): item is ContentCalendarGuidanceDto => Boolean(item));

  if (guidance.length === 0) {
    return null;
  }

  return {
    source: calendarGuidanceSource,
    mustUseFacts: usefulUniqueStrings(guidance.flatMap((item) => item.mustUseFacts)).slice(0, 10),
    sellingPointHints: usefulUniqueStrings(guidance.flatMap((item) => item.sellingPointHints)).slice(
      0,
      10,
    ),
    audienceHints: usefulUniqueStrings(guidance.flatMap((item) => item.audienceHints)).slice(0, 10),
    contentAngles: usefulUniqueStrings(guidance.flatMap((item) => item.contentAngles)).slice(0, 10),
    complianceNotes: uniqueStrings(guidance.flatMap((item) => item.complianceNotes)).slice(0, 8),
    materialHints: usefulUniqueStrings(guidance.flatMap((item) => item.materialHints)).slice(0, 8),
    shotConstraints: usefulUniqueStrings(guidance.flatMap((item) => item.shotConstraints ?? [])).slice(
      0,
      10,
    ),
    assetCapabilityHints: usefulUniqueStrings(
      guidance.flatMap((item) => item.assetCapabilityHints ?? []),
    ).slice(0, 10),
    retrievalTrace: guidance
      .flatMap((item) => item.retrievalTrace ?? [])
      .filter(uniqueRetrievalTrace)
      .slice(0, 20),
    knowledgeRefIds: uniqueStrings(
      guidance.flatMap((item) => item.knowledgeRefs.map((ref) => ref.chunkId ?? ref.id)),
    ).slice(0, 12),
  };
}

export function normalizeContentCalendarGuidance(value: unknown): ContentCalendarGuidanceDto | null {
  const record = toRecord(value);

  if (!Object.keys(record).length) {
    return null;
  }

  const refs = toArray(record.knowledgeRefs)
    .map(normalizeKnowledgeRef)
    .filter((ref): ref is ContentCalendarKnowledgeRefDto => Boolean(ref))
    .filter(uniqueKnowledgeRef)
    .slice(0, 12);
  const summary = getString(record.summary);
  const guidance: ContentCalendarGuidanceDto = {
    source: getString(record.source, calendarGuidanceSource),
    summary: summary || null,
    mustUseFacts: usefulUniqueStrings(toStringArray(record.mustUseFacts)).slice(0, 12),
    sellingPointHints: usefulUniqueStrings(toStringArray(record.sellingPointHints)).slice(0, 12),
    audienceHints: usefulUniqueStrings(toStringArray(record.audienceHints)).slice(0, 12),
    contentAngles: usefulUniqueStrings(toStringArray(record.contentAngles)).slice(0, 12),
    complianceNotes: toStringArray(record.complianceNotes).slice(0, 8),
    materialHints: usefulUniqueStrings(toStringArray(record.materialHints)).slice(0, 8),
    shotConstraints: usefulUniqueStrings(toStringArray(record.shotConstraints)).slice(0, 12),
    assetCapabilityHints: usefulUniqueStrings(toStringArray(record.assetCapabilityHints)).slice(0, 12),
    retrievalTrace: toArray(record.retrievalTrace)
      .map(normalizeRetrievalTrace)
      .filter((item): item is NonNullable<ContentCalendarGuidanceDto["retrievalTrace"]>[number] =>
        Boolean(item),
      )
      .filter(uniqueRetrievalTrace)
      .slice(0, 24),
    knowledgeRefs: refs,
  };

  if (
    guidance.knowledgeRefs.length === 0 &&
    guidance.mustUseFacts.length === 0 &&
    guidance.contentAngles.length === 0 &&
    (guidance.shotConstraints ?? []).length === 0 &&
    (guidance.assetCapabilityHints ?? []).length === 0 &&
    !guidance.summary
  ) {
    return null;
  }

  return guidance;
}

function mergeContentCalendarGuidance(
  current: ContentCalendarGuidanceDto | null,
  incoming: ContentCalendarGuidanceDto,
): ContentCalendarGuidanceDto {
  if (!current) {
    return incoming;
  }

  return {
    source: incoming.source,
    summary: incoming.summary ?? current.summary ?? null,
    mustUseFacts: usefulUniqueStrings([...current.mustUseFacts, ...incoming.mustUseFacts]).slice(0, 12),
    sellingPointHints: usefulUniqueStrings([
      ...current.sellingPointHints,
      ...incoming.sellingPointHints,
    ]).slice(0, 12),
    audienceHints: usefulUniqueStrings([...current.audienceHints, ...incoming.audienceHints]).slice(0, 12),
    contentAngles: usefulUniqueStrings([...current.contentAngles, ...incoming.contentAngles]).slice(0, 12),
    complianceNotes: uniqueStrings([...current.complianceNotes, ...incoming.complianceNotes]).slice(
      0,
      8,
    ),
    materialHints: usefulUniqueStrings([...current.materialHints, ...incoming.materialHints]).slice(0, 8),
    shotConstraints: usefulUniqueStrings([
      ...(current.shotConstraints ?? []),
      ...(incoming.shotConstraints ?? []),
    ]).slice(0, 12),
    assetCapabilityHints: usefulUniqueStrings([
      ...(current.assetCapabilityHints ?? []),
      ...(incoming.assetCapabilityHints ?? []),
    ]).slice(0, 12),
    retrievalTrace: [...(current.retrievalTrace ?? []), ...(incoming.retrievalTrace ?? [])]
      .filter(uniqueRetrievalTrace)
      .slice(0, 24),
    knowledgeRefs: [...current.knowledgeRefs, ...incoming.knowledgeRefs]
      .filter(uniqueKnowledgeRef)
      .slice(0, 12),
  };
}

function buildAssetCapabilityHints(snapshot: StrategySnapshotDto) {
  return usefulUniqueStrings([
    ...snapshot.keyScenes.map((scene) => `可用或可补拍的内容场景线索：${scene}`),
  ]).slice(0, 8);
}

function toCalendarKnowledgeRef(
  match: KnowledgeSearchMatchDto,
): ContentCalendarKnowledgeRefDto | null {
  const summary = summarizeKnowledgeContent(match.content);

  if (!summary) {
    return null;
  }

  return {
    id: match.chunkId,
    source: "merchant_knowledge_base",
    title: match.documentTitle || match.sourceName || "用户知识库资料",
    summary,
    documentId: match.documentId,
    chunkId: match.chunkId,
    documentTitle: match.documentTitle,
    sourceName: match.sourceName ?? null,
    scope: match.scope,
    excerpt: clipText(match.content, 280),
    score: Number(match.score.toFixed(4)),
    chunkIndex: match.chunkIndex,
  };
}

function normalizeKnowledgeRef(value: unknown): ContentCalendarKnowledgeRefDto | null {
  const record = toRecord(value);
  const title = getString(record.title) || getString(record.documentTitle) || "知识库参考";
  const summary = getString(record.summary) || getString(record.excerpt);

  if (!summary) {
    return null;
  }

  const id =
    getString(record.id) ||
    getString(record.chunkId) ||
    getString(record.documentId) ||
    `${title}:${summary.slice(0, 24)}`;

  return {
    id,
    source: getString(record.source, "merchant_knowledge_base"),
    title,
    summary: clipText(summary, 180),
    documentId: getNullableString(record.documentId),
    chunkId: getNullableString(record.chunkId),
    documentTitle: getNullableString(record.documentTitle),
    sourceName: getNullableString(record.sourceName),
    scope: getNullableString(record.scope),
    excerpt: getNullableString(record.excerpt),
    score: getNullableNumber(record.score),
    chunkIndex: getNullableNumber(record.chunkIndex),
  };
}

function normalizeRetrievalTrace(
  value: unknown,
): NonNullable<ContentCalendarGuidanceDto["retrievalTrace"]>[number] | null {
  const record = toRecord(value);
  const source = getNullableString(record.source);
  const documentId = getNullableString(record.documentId);
  const chunkId = getNullableString(record.chunkId);
  const documentTitle = getNullableString(record.documentTitle);
  const scope = getNullableString(record.scope);
  const score = getNullableNumber(record.score);

  if (!source && !documentId && !chunkId && !documentTitle) {
    return null;
  }

  return {
    source,
    documentId,
    chunkId,
    documentTitle,
    scope,
    score,
  };
}

function summarizeKnowledgeContent(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "";
  }

  const sentence = normalized.split(/[。！？!?；;]/).find((part) => part.trim().length >= 12);
  return clipText((sentence || normalized).trim(), 180);
}

function uniqueKnowledgeRef<T extends { chunkId?: string | null; id?: string | null; title?: string; summary?: string }>(
  item: T,
  index: number,
  items: T[],
) {
  const key = item.chunkId || item.id || `${item.title ?? ""}:${item.summary ?? ""}`;
  return items.findIndex((candidate) => {
    const candidateKey =
      candidate.chunkId || candidate.id || `${candidate.title ?? ""}:${candidate.summary ?? ""}`;
    return candidateKey === key;
  }) === index;
}

function uniqueRetrievalTrace<
  T extends {
    source?: string | null;
    documentId?: string | null;
    chunkId?: string | null;
    documentTitle?: string | null;
  },
>(item: T, index: number, items: T[]) {
  const key = item.chunkId || item.documentId || `${item.source ?? ""}:${item.documentTitle ?? ""}`;
  return items.findIndex((candidate) => {
    const candidateKey =
      candidate.chunkId ||
      candidate.documentId ||
      `${candidate.source ?? ""}:${candidate.documentTitle ?? ""}`;
    return candidateKey === key;
  }) === index;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value?.replace(/\s+/g, " ").trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function usefulUniqueStrings(values: Array<string | null | undefined>) {
  return uniqueStrings(values).filter(isUsefulGuidanceText);
}

function isUsefulGuidanceText(value: string) {
  const normalized = value.replace(/\s+/g, "").trim();

  if (!normalized) {
    return false;
  }

  if (/^(图文内容|AI视频|测试区域|测试内容|测试素材)$/.test(normalized)) {
    return false;
  }

  if (/用于验证|成员端登录|邀请码|测试链路/.test(normalized)) {
    return false;
  }

  return true;
}

function clipText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueStrings(value.filter((item): item is string => typeof item === "string"));
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function getNullableString(value: unknown) {
  const normalized = getString(value);
  return normalized || null;
}

function getNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
