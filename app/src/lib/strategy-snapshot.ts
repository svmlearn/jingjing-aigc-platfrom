import type { ContentCalendarItemDto, StrategySnapshotDto } from "@/contracts/consultation";

export const emptyStrategySnapshot: StrategySnapshotDto = {
  positioning: "",
  coreSellingPoints: [],
  targetAudiences: [],
  keyScenes: [],
  currentSuggestion: "",
  strategyTags: [],
  contentCalendarDraft: [],
  articleBrief: null,
  videoBrief: null,
};

export function toStrategySnapshot(value: unknown): StrategySnapshotDto {
  const record = toRecord(value);
  const articleBrief = toNullableRecord(record.articleBrief);
  const videoBrief = toNullableRecord(record.videoBrief);

  return {
    positioning: getString(record.positioning),
    coreSellingPoints: toStringArray(record.coreSellingPoints),
    targetAudiences: toStringArray(record.targetAudiences),
    keyScenes: toStringArray(record.keyScenes),
    currentSuggestion: getString(record.currentSuggestion),
    strategyTags: toStringArray(record.strategyTags),
    contentCalendarDraft: toCalendarItems(record.contentCalendarDraft),
    articleBrief: articleBrief
      ? {
          workingTitle: getString(articleBrief.workingTitle),
          angle: getString(articleBrief.angle),
          callToAction: getString(articleBrief.callToAction),
        }
      : null,
    videoBrief: videoBrief
      ? {
          workingTitle: getString(videoBrief.workingTitle),
          hook: getString(videoBrief.hook),
          outcome: getString(videoBrief.outcome),
        }
      : null,
  };
}

function toCalendarItems(value: unknown): ContentCalendarItemDto[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      const record = toRecord(item);
      const contentType: "article" | "video" =
        getString(record.contentType) === "video" ? "video" : "article";
      return {
        id: getString(record.id, `calendar-${index + 1}`),
        dayLabel: getString(record.dayLabel),
        contentType,
        strategyTag: getString(record.strategyTag),
        title: getString(record.title),
        summary: getString(record.summary),
      };
    })
    .filter((item) => item.title.length > 0);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function toNullableRecord(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const record = toRecord(value);
  return Object.keys(record).length > 0 ? record : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
