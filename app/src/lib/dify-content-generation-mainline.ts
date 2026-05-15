import type { ContentVariantDto } from "../contracts/draft.ts";
import {
  extractDifyFinalResultJson,
  mapDifyFinalResultToVariants,
  parseFinalResultJson,
  type DifyFinalResultMapping,
  type DifyMappedContentVariant,
} from "./dify-final-result-adapter.ts";

export type DifyMainlineDraftInput = {
  source: string;
  dailyTaskId?: string | null;
  teamTheme?: string | null;
  teamCalendarSource?: unknown;
  consultationSessionId?: string | null;
  syntheticSessionId?: string | null;
  calendarItemId?: string | null;
  selectedCalendarItem?: unknown;
  strategySnapshot?: unknown;
  strategyAssetMarkdown?: string | null;
  roundtableContext?: unknown;
  merchantProfile?: unknown;
  matchedProjectMaterials?: unknown[];
  knowledgeRefs?: unknown[];
  strategyTag?: string | null;
  extraRequirement?: string | null;
  toneStyle?: string | null;
  materialContext?: unknown;
  rewriteGoal?: string | null;
  finalResult: unknown;
};

export type DifyMainlineDraftBuildResult =
  | {
      ok: true;
      mapping: DifyFinalResultMapping;
      sourceItem: {
        platform: ContentVariantDto["platform"];
        title: string;
        bodyText: string | null;
        scriptText: string | null;
        tracePayload: Record<string, unknown>;
      };
      draft: {
        workingTitle: string;
        rewriteGoal: string | null;
        inputSnapshot: Record<string, unknown>;
        commentInsights: Record<string, unknown>;
        variants: DifyMappedContentVariant[];
      };
    }
  | {
      ok: false;
      status: "blocked" | "schema_failed";
      mapping: DifyFinalResultMapping;
      reason: string;
    };

export type DifyFinalResultProviderInput = {
  userId: string;
  merchantId: string;
  sessionId?: string | null;
  dailyTaskId?: string | null;
  goal?: string | null;
  extraRequirement?: string | null;
};

export type DifyFinalResultProvider = (
  input: DifyFinalResultProviderInput,
) => Promise<unknown | null>;

export function isDifyMainlineEnabled(env: Record<string, string | undefined>) {
  return isTruthy(env.DIFY_CONTENT_GENERATION_ENABLED ?? env.CONTENT_GENERATION_USE_DIFY);
}

export function readDifyFinalResultFixtureFromEnv(env: Record<string, string | undefined>) {
  return (
    env.DIFY_FINAL_RESULT_JSON_FIXTURE ??
    env.DIFY_MOCK_FINAL_RESULT_JSON ??
    env.DIFY_FINAL_RESULT_JSON ??
    null
  );
}

export function buildDifyMainlineDraftInput(
  input: DifyMainlineDraftInput,
): DifyMainlineDraftBuildResult {
  const mapping = mapDifyFinalResultToVariants(extractDifyMaybeWrappedFinalResult(input.finalResult));
  const snapshotContext = { ...input } as Record<string, unknown>;
  delete snapshotContext.finalResult;

  if (mapping.status === "blocked") {
    return {
      ok: false,
      status: "blocked",
      mapping,
      reason: "Dify quality gate blocked this generation.",
    };
  }

  if (mapping.status === "schema_failed") {
    return {
      ok: false,
      status: "schema_failed",
      mapping,
      reason: "Dify final_result_json failed the local schema gate.",
    };
  }

  const noteVariant = mapping.variants.find((variant) => variant.variantType === "note") ?? null;
  const videoVariant =
    mapping.variants.find((variant) => variant.variantType === "video_script") ?? null;
  const workingTitle =
    noteVariant?.title?.trim() ||
    videoVariant?.title?.trim() ||
    "Dify content generation draft";
  const scriptText = videoVariant?.scriptText?.trim() || null;

  return {
    ok: true,
    mapping,
    sourceItem: {
      platform: noteVariant?.platform ?? videoVariant?.platform ?? "xiaohongshu",
      title: workingTitle,
      bodyText: noteVariant?.bodyText ?? null,
      scriptText,
      tracePayload: {
        generated_kind: "dify_content_package",
        workflow_provider: "dify",
        workflow_version: mapping.workflowVersion,
        quality_status: readString(mapping.quality?.status) ?? null,
        schema_errors: mapping.schemaErrors,
        fallback_contract: "existing_generation_path_on_schema_or_provider_failure",
      },
    },
    draft: {
      workingTitle,
      rewriteGoal: input.rewriteGoal ?? null,
      inputSnapshot: {
        ...snapshotContext,
        workflowProvider: "dify",
        workflowVersion: mapping.workflowVersion,
        difyMainline: {
          status: mapping.status,
          featureFlag: "on",
          schemaErrors: mapping.schemaErrors,
          fallbackContract: "feature_flag_off_or_dify_schema_api_failure_uses_existing_path",
        },
        difyQuality: mapping.quality,
        difyDebug: mapping.debug,
        difyDraftInput: mapping.draftInputSnapshot,
      },
      commentInsights: {
        workflowProvider: "dify",
        workflowVersion: mapping.workflowVersion,
        qualityStatus: readString(mapping.quality?.status) ?? null,
        riskNotes: readStringArray(mapping.quality?.blockingReasons),
      },
      variants: mapping.variants,
    },
  };
}

function extractDifyMaybeWrappedFinalResult(value: unknown) {
  const parsed = parseFinalResultJson(value);
  const record = toRecord(parsed);
  if (toRecord(record.outputs).final_result_json !== undefined) {
    return extractDifyFinalResultJson(parsed);
  }

  return value;
}

function isTruthy(value: string | undefined) {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on", "dify"].includes(value.trim().toLowerCase());
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
