export type VideoWorkbenchChatMessage = {
  role: "agent" | "user";
  content: string;
};

export type VideoWorkbenchRouteContext = {
  sessionId: string | null;
  dailyTaskId: string | null;
  source: string | null;
  calendarItemId: string | null;
  draftId: string | null;
  variantId: string | null;
  jobId: string | null;
  materialId: string | null;
  materialReferenceId: string | null;
  strategyTag: string | null;
};

export type VideoWorkbenchSnapshot = {
  version: 1;
  routeContext: VideoWorkbenchRouteContext;
  goal: string;
  extraRequirement: string;
  selectedVariantId: string | null;
  messages: VideoWorkbenchChatMessage[];
  showCanvas: boolean;
  canvasExpanded: boolean;
  savedAt: string;
};

const VIDEO_WORKBENCH_SNAPSHOT_KEY = "jingjing:video-workbench-state:v1";

export function readVideoWorkbenchSnapshot(): VideoWorkbenchSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(VIDEO_WORKBENCH_SNAPSHOT_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<VideoWorkbenchSnapshot>;
    if (parsed.version !== 1 || !parsed.routeContext) {
      return null;
    }

    return {
      version: 1,
      routeContext: normalizeRouteContext(parsed.routeContext),
      goal: typeof parsed.goal === "string" ? parsed.goal : "",
      extraRequirement: typeof parsed.extraRequirement === "string" ? parsed.extraRequirement : "",
      selectedVariantId:
        typeof parsed.selectedVariantId === "string" ? parsed.selectedVariantId : null,
      messages: Array.isArray(parsed.messages)
        ? parsed.messages.filter(isChatMessage)
        : [],
      showCanvas: parsed.showCanvas !== false,
      canvasExpanded: parsed.canvasExpanded === true,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeVideoWorkbenchSnapshot(snapshot: VideoWorkbenchSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(VIDEO_WORKBENCH_SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function clearVideoWorkbenchSnapshot() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(VIDEO_WORKBENCH_SNAPSHOT_KEY);
}

export function mergeRouteContext(
  current: VideoWorkbenchRouteContext,
  next?: Partial<VideoWorkbenchRouteContext> | null,
): VideoWorkbenchRouteContext {
  if (!next) {
    return current;
  }

  return {
    sessionId: next.sessionId ?? current.sessionId,
    dailyTaskId: next.dailyTaskId ?? current.dailyTaskId,
    source: next.source ?? current.source,
    calendarItemId: next.calendarItemId ?? current.calendarItemId,
    draftId: next.draftId ?? current.draftId,
    variantId: next.variantId ?? current.variantId,
    jobId: next.jobId ?? current.jobId,
    materialId: next.materialId ?? current.materialId,
    materialReferenceId: next.materialReferenceId ?? current.materialReferenceId,
    strategyTag: next.strategyTag ?? current.strategyTag,
  };
}

export function readRouteContextFromDraftInputSnapshot(inputSnapshot: unknown): {
  routeContext: Partial<VideoWorkbenchRouteContext>;
  extraRequirement: string | null;
} {
  const snapshot = asRecord(inputSnapshot);
  const materialContext = asRecord(snapshot.materialContext);
  const source = readString(snapshot, "source");

  return {
    routeContext: {
      sessionId:
        source === "daily_task"
          ? null
          : readString(snapshot, "consultationSessionId", "sessionId"),
      dailyTaskId: readString(snapshot, "dailyTaskId"),
      source,
      calendarItemId: readString(snapshot, "calendarItemId"),
      materialId: readString(materialContext, "materialId"),
      materialReferenceId: readString(materialContext, "referenceId"),
      strategyTag: readString(snapshot, "strategyTag"),
    },
    extraRequirement: readString(snapshot, "extraRequirement"),
  };
}

function normalizeRouteContext(input: Partial<VideoWorkbenchRouteContext>): VideoWorkbenchRouteContext {
  return {
    sessionId: typeof input.sessionId === "string" ? input.sessionId : null,
    dailyTaskId: typeof input.dailyTaskId === "string" ? input.dailyTaskId : null,
    source: typeof input.source === "string" ? input.source : null,
    calendarItemId: typeof input.calendarItemId === "string" ? input.calendarItemId : null,
    draftId: typeof input.draftId === "string" ? input.draftId : null,
    variantId: typeof input.variantId === "string" ? input.variantId : null,
    jobId: typeof input.jobId === "string" ? input.jobId : null,
    materialId: typeof input.materialId === "string" ? input.materialId : null,
    materialReferenceId:
      typeof input.materialReferenceId === "string" ? input.materialReferenceId : null,
    strategyTag: typeof input.strategyTag === "string" ? input.strategyTag : null,
  };
}

function isChatMessage(value: unknown): value is VideoWorkbenchChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    (record.role === "agent" || record.role === "user") &&
    typeof record.content === "string" &&
    record.content.length > 0
  );
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}
