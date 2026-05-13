import type {
  VideoEditJobStatus,
  VideoEditProgressModuleDto,
  VideoEditProgressModuleStatus,
} from "@/contracts/video";

const progressModuleDefaults = [
  { key: "material_preparation", label: "素材准备" },
  { key: "material_match", label: "素材匹配" },
  { key: "voiceover", label: "配音生成" },
  { key: "subtitles", label: "字幕与时间线" },
  { key: "render", label: "合成渲染" },
  { key: "output_delivery", label: "保存成片" },
] as const;

const statusValues = new Set<VideoEditProgressModuleStatus>([
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
]);

const stageToModuleKey: Array<[RegExp, (typeof progressModuleDefaults)[number]["key"]]> = [
  [/openstoryline_material_preparation|download|preparing|input/i, "material_preparation"],
  [/openstoryline_material_match|match|load_media|split_shots|understand_clips|group_clips|filter_clips/i, "material_match"],
  [/openstoryline_voiceover|voice|tts|generate_voiceover/i, "voiceover"],
  [/openstoryline_subtitles|subtitle|timeline|plan_timeline/i, "subtitles"],
  [/openstoryline_rendering|openstoryline_render|render|output_validation/i, "render"],
  [/uploading_outputs|completed|upload|asset|result|succeeded/i, "output_delivery"],
];

type ProgressSource = {
  status?: VideoEditJobStatus | null;
  currentStage?: string | null;
  progressPct?: number | null;
  progressModules?: unknown[] | null;
  runtimePayload?: Record<string, unknown> | null;
  resultPayload?: Record<string, unknown> | null;
  logPayload?: Record<string, unknown> | null;
};

export function normalizeVideoProgressModules(input: ProgressSource): VideoEditProgressModuleDto[] {
  const topLevelModules = normalizeProgressModuleArray(input.progressModules ?? null);
  if (topLevelModules) {
    return topLevelModules;
  }

  const runtimeModules = normalizeProgressModuleArray(
    readArray(input.runtimePayload, "progressModules", "progress_modules"),
  );
  const resultModules = normalizeProgressModuleArray(
    readArray(input.resultPayload, "progressModules", "progress_modules"),
  );
  const logModules = normalizeProgressModuleArray(
    readArray(input.logPayload, "progressModules", "progress_modules"),
  );
  const explicit =
    input.status === "succeeded"
      ? resultModules ?? runtimeModules ?? logModules
      : input.status === "failed_manual" || input.status === "failed_retryable"
        ? logModules ?? runtimeModules ?? resultModules
        : runtimeModules ?? resultModules ?? logModules;

  if (explicit) {
    return explicit;
  }

  return buildFallbackProgressModules(input);
}

export function getActiveVideoProgressModule(
  modules: VideoEditProgressModuleDto[],
): VideoEditProgressModuleDto | null {
  return (
    modules.find((module) => module.status === "running") ??
    modules.find((module) => module.status === "failed") ??
    null
  );
}

function buildFallbackProgressModules(input: ProgressSource): VideoEditProgressModuleDto[] {
  const activeKey = getModuleKeyFromStage(input.currentStage);
  const activeIndex = activeKey
    ? progressModuleDefaults.findIndex((module) => module.key === activeKey)
    : -1;
  const status = input.status ?? "pending";
  const succeeded = status === "succeeded";
  const failed = status === "failed_manual" || status === "failed_retryable";

  return progressModuleDefaults.map((module, index) => {
    let moduleStatus: VideoEditProgressModuleStatus = "pending";
    let progressPct = 0;

    if (succeeded) {
      moduleStatus = "succeeded";
      progressPct = 100;
    } else if (failed && activeIndex >= 0) {
      if (index < activeIndex) {
        moduleStatus = "succeeded";
        progressPct = 100;
      } else if (index === activeIndex) {
        moduleStatus = "failed";
        progressPct = 100;
      }
    } else if (activeIndex >= 0) {
      if (index < activeIndex) {
        moduleStatus = "succeeded";
        progressPct = 100;
      } else if (index === activeIndex) {
        moduleStatus = "running";
        progressPct = input.progressPct ?? 50;
      }
    }

    return {
      key: module.key,
      label: module.label,
      status: moduleStatus,
      progressPct: normalizeProgressPct(progressPct),
      detail: null,
      startedAt: null,
      finishedAt: null,
    };
  });
}

function normalizeProgressModuleArray(value: unknown[] | null): VideoEditProgressModuleDto[] | null {
  if (!value || value.length === 0) {
    return null;
  }

  const normalized = value
    .map((item) => normalizeProgressModule(item))
    .filter((item): item is VideoEditProgressModuleDto => Boolean(item));

  return normalized.length > 0 ? normalized : null;
}

function normalizeProgressModule(value: unknown): VideoEditProgressModuleDto | null {
  if (!isRecord(value)) {
    return null;
  }

  const key = readString(value, "key", "moduleKey", "module_key");
  const label = readString(value, "label", "name") ?? (key ? defaultModuleLabel(key) : null);
  const rawStatus = readString(value, "status");
  const status = rawStatus && statusValues.has(rawStatus as VideoEditProgressModuleStatus)
    ? (rawStatus as VideoEditProgressModuleStatus)
    : null;

  if (!key || !label || !status) {
    return null;
  }

  return {
    key,
    label,
    status,
    progressPct: normalizeProgressPct(readNumber(value, "progressPct", "progress_pct", "progress") ?? 0),
    detail: readString(value, "detail", "message"),
    startedAt: readString(value, "startedAt", "started_at"),
    finishedAt: readString(value, "finishedAt", "finished_at"),
  };
}

function getModuleKeyFromStage(stage?: string | null) {
  if (!stage) {
    return "material_preparation";
  }

  for (const [pattern, key] of stageToModuleKey) {
    if (pattern.test(stage)) {
      return key;
    }
  }

  return "material_preparation";
}

function defaultModuleLabel(key: string) {
  return progressModuleDefaults.find((module) => module.key === key)?.label ?? key.replaceAll("_", " ");
}

function normalizeProgressPct(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readNumber(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function readArray(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}
