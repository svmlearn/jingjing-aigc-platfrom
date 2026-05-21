import type {
  ContentCalendarGenerationStatusDto,
  ContentCalendarItemDto,
  StrategySnapshotDto,
} from "@/contracts/consultation";

export function buildContentCalendarRevisionId(calendar: ContentCalendarItemDto[]) {
  const canonical = JSON.stringify(
    calendar.map((item) => ({
      id: item.id,
      dayLabel: item.dayLabel,
      contentType: item.contentType,
      strategyTag: item.strategyTag,
      title: item.title,
      summary: item.summary,
    })),
  );

  return `cal_${fnv1a(canonical).toString(36)}`;
}

export function normalizeContentCalendarGenerationStatus(
  value: unknown,
  calendar: ContentCalendarItemDto[],
): ContentCalendarGenerationStatusDto | null {
  if (calendar.length === 0) {
    return null;
  }

  const record = toRecord(value);
  const currentRevisionId =
    readString(record.currentRevisionId) || buildContentCalendarRevisionId(calendar);
  const generatedFromRevisionId = readString(record.generatedFromRevisionId);

  return {
    status: resolveGenerationStatus({
      currentRevisionId,
      generatedFromRevisionId,
      explicitStatus: readString(record.status),
    }),
    currentRevisionId,
    generatedFromRevisionId,
    generatedBatchId: readString(record.generatedBatchId),
    generatedAt: readString(record.generatedAt),
    generatedByUserId: readString(record.generatedByUserId),
    generatedJobCount: readPositiveInteger(record.generatedJobCount),
  };
}

export function withUpdatedContentCalendarGeneration(
  snapshot: StrategySnapshotDto,
  calendar: ContentCalendarItemDto[],
): StrategySnapshotDto {
  return {
    ...snapshot,
    contentCalendarDraft: calendar,
    contentCalendarGeneration: normalizeContentCalendarGenerationStatus(
      {
        ...snapshot.contentCalendarGeneration,
        currentRevisionId: buildContentCalendarRevisionId(calendar),
      },
      calendar,
    ),
  };
}

export function markContentCalendarTeamContentGenerated(
  snapshot: StrategySnapshotDto,
  input: {
    batchId: string;
    generatedAt: string;
    generatedByUserId: string;
    generatedJobCount: number;
  },
): StrategySnapshotDto {
  const currentRevisionId = buildContentCalendarRevisionId(snapshot.contentCalendarDraft);

  return {
    ...snapshot,
    contentCalendarGeneration: snapshot.contentCalendarDraft.length
      ? {
          status: "generated",
          currentRevisionId,
          generatedFromRevisionId: currentRevisionId,
          generatedBatchId: input.batchId,
          generatedAt: input.generatedAt,
          generatedByUserId: input.generatedByUserId,
          generatedJobCount: input.generatedJobCount,
        }
      : null,
  };
}

function resolveGenerationStatus(input: {
  currentRevisionId: string;
  generatedFromRevisionId: string | null;
  explicitStatus: string | null;
}): ContentCalendarGenerationStatusDto["status"] {
  if (!input.generatedFromRevisionId) {
    return "draft";
  }

  if (input.generatedFromRevisionId === input.currentRevisionId) {
    return "generated";
  }

  if (input.explicitStatus === "draft") {
    return "draft";
  }

  return "modified_after_generation";
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  return null;
}
