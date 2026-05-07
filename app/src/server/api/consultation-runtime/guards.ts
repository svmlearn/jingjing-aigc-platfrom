import type { StrategySnapshotDto } from "@/contracts/consultation";

import { clipText, toStringArrayValue, uniqueStrings } from "@/server/api/consultation-runtime/utils";

export type StrategyAssetGuardFieldKey =
  | "positioning"
  | "coreSellingPoints"
  | "targetAudiences"
  | "keyScenes"
  | "currentSuggestion"
  | "strategyMarkdown";

export type StrategyAssetGuardPatch = {
  positioning?: string;
  coreSellingPoints?: string[];
  targetAudiences?: string[];
  keyScenes?: string[];
  currentSuggestion?: string;
  strategyMarkdown?: string;
  changedFields: StrategyAssetGuardFieldKey[];
};

export type StrategyAssetGuardSource =
  | "llm_tool"
  | "fallback_no_key"
  | "tool_not_called"
  | "validation_failed"
  | "runtime_error";

export type StrategyAssetGuardReasonCode =
  | "allowed"
  | "no_editor_tool_call"
  | "validation_failed"
  | "runtime_error"
  | "low_confidence_user_intent"
  | "unsafe_editor_content"
  | "no_effective_change";

export type StrategyAssetGuardDecision = {
  allowed: boolean;
  reasonCode: StrategyAssetGuardReasonCode;
  summary: string;
  patch: StrategyAssetGuardPatch;
  warnings: string[];
};

type StrategyAssetGuardSnapshot = Pick<
  StrategySnapshotDto,
  "positioning" | "coreSellingPoints" | "targetAudiences" | "keyScenes" | "currentSuggestion"
>;

const listFieldLimits = {
  coreSellingPoints: 8,
  targetAudiences: 10,
  keyScenes: 8,
} as const;

export function guardStrategyAssetEditorPatch(input: {
  previousSnapshot: StrategyAssetGuardSnapshot;
  previousMarkdown?: string | null;
  userContent: string;
  patch: StrategyAssetGuardPatch;
  source: StrategyAssetGuardSource;
}): StrategyAssetGuardDecision {
  const previousPatch = buildPatchFromSnapshot(input.previousSnapshot);
  const normalizedPatch = normalizeGuardPatch(input.patch);

  if (input.source === "tool_not_called") {
    return deny({
      reasonCode: "no_editor_tool_call",
      summary: "策略资产 Editor 未调用受控工具，已拒绝写入。",
      previousPatch,
    });
  }

  if (input.source === "validation_failed") {
    return deny({
      reasonCode: "validation_failed",
      summary: "策略资产 Editor 工具参数校验失败，已拒绝写入。",
      previousPatch,
    });
  }

  if (input.source === "runtime_error") {
    return deny({
      reasonCode: "runtime_error",
      summary: "策略资产 Editor 运行异常，已保留原资产。",
      previousPatch,
    });
  }

  const unsafeWarnings = findUnsafeEditorContent(normalizedPatch);

  if (unsafeWarnings.length > 0) {
    return deny({
      reasonCode: "unsafe_editor_content",
      summary: `策略资产 Editor 产物包含不适合落库的内容：${unsafeWarnings[0]}。`,
      previousPatch,
      warnings: unsafeWarnings,
    });
  }

  const changedFields = normalizedPatch.changedFields.filter((field) =>
    hasEffectiveFieldChange(field, normalizedPatch, input.previousSnapshot, input.previousMarkdown),
  );

  if (changedFields.length > 0 && looksLikeLowConfidenceEditIntent(input.userContent)) {
    return deny({
      reasonCode: "low_confidence_user_intent",
      summary: "用户本轮更像追问或闲聊，未检测到明确业务资产修改意图。",
      previousPatch,
    });
  }

  if (changedFields.length === 0) {
    return {
      allowed: true,
      reasonCode: "no_effective_change",
      summary: "未检测到有效字段变更，策略资产保持不变。",
      patch: previousPatch,
      warnings:
        normalizedPatch.changedFields.length > 0
          ? ["模型声明了变更字段，但字段值与当前策略资产一致。"]
          : [],
    };
  }

  return {
    allowed: true,
    reasonCode: "allowed",
    summary: `允许写入 ${changedFields.length} 个策略资产字段。`,
    patch: {
      ...normalizedPatch,
      changedFields,
    },
    warnings: [],
  };
}

function deny(input: {
  reasonCode: Exclude<StrategyAssetGuardReasonCode, "allowed" | "no_effective_change">;
  summary: string;
  previousPatch: StrategyAssetGuardPatch;
  warnings?: string[];
}): StrategyAssetGuardDecision {
  return {
    allowed: false,
    reasonCode: input.reasonCode,
    summary: input.summary,
    patch: input.previousPatch,
    warnings: input.warnings ?? [],
  };
}

function normalizeGuardPatch(patch: StrategyAssetGuardPatch): StrategyAssetGuardPatch {
  return {
    positioning: cleanGuardText(patch.positioning) ?? undefined,
    coreSellingPoints: cleanGuardList(patch.coreSellingPoints, listFieldLimits.coreSellingPoints),
    targetAudiences: cleanGuardList(patch.targetAudiences, listFieldLimits.targetAudiences),
    keyScenes: cleanGuardList(patch.keyScenes, listFieldLimits.keyScenes),
    currentSuggestion: cleanGuardText(patch.currentSuggestion) ?? undefined,
    strategyMarkdown: cleanGuardMarkdown(patch.strategyMarkdown) ?? undefined,
    changedFields: uniqueFieldKeys(patch.changedFields),
  };
}

function buildPatchFromSnapshot(snapshot: StrategyAssetGuardSnapshot): StrategyAssetGuardPatch {
  return {
    positioning: cleanGuardText(snapshot.positioning) ?? undefined,
    coreSellingPoints: cleanGuardList(snapshot.coreSellingPoints, listFieldLimits.coreSellingPoints),
    targetAudiences: cleanGuardList(snapshot.targetAudiences, listFieldLimits.targetAudiences),
    keyScenes: cleanGuardList(snapshot.keyScenes, listFieldLimits.keyScenes),
    currentSuggestion: cleanGuardText(snapshot.currentSuggestion) ?? undefined,
    strategyMarkdown: undefined,
    changedFields: [],
  };
}

function cleanGuardList(value: unknown, maxItems: number) {
  return uniqueStrings(
    toStringArrayValue(value)
      .map(cleanGuardText)
      .filter((item): item is string => Boolean(item)),
  ).slice(0, maxItems);
}

function cleanGuardText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized ? clipText(normalized, 180) : null;
}

function cleanGuardMarkdown(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\r\n/g, "\n").trim();

  return normalized ? clipText(normalized, 24000) : null;
}

function hasEffectiveFieldChange(
  field: StrategyAssetGuardFieldKey,
  patch: StrategyAssetGuardPatch,
  previousSnapshot: StrategyAssetGuardSnapshot,
  previousMarkdown?: string | null,
) {
  if (field === "positioning") {
    return normalizeComparableText(patch.positioning) !== normalizeComparableText(previousSnapshot.positioning);
  }

  if (field === "currentSuggestion") {
    return (
      normalizeComparableText(patch.currentSuggestion) !==
      normalizeComparableText(previousSnapshot.currentSuggestion)
    );
  }

  if (field === "strategyMarkdown") {
    return normalizeComparableMarkdown(patch.strategyMarkdown) !== normalizeComparableMarkdown(previousMarkdown);
  }

  return !areComparableListsEqual(patch[field] ?? [], previousSnapshot[field]);
}

function normalizeComparableText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeComparableMarkdown(value: string | null | undefined) {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

function areComparableListsEqual(first: string[], second: string[]) {
  const firstList = first.map(normalizeComparableText).filter(Boolean);
  const secondList = second.map(normalizeComparableText).filter(Boolean);

  if (firstList.length !== secondList.length) {
    return false;
  }

  return firstList.every((item, index) => item === secondList[index]);
}

function findUnsafeEditorContent(patch: StrategyAssetGuardPatch) {
  const warnings: string[] = [];
  const values = [
    patch.positioning ?? "",
    patch.currentSuggestion ?? "",
    ...(patch.coreSellingPoints ?? []),
    ...(patch.targetAudiences ?? []),
    ...(patch.keyScenes ?? []),
  ].filter(Boolean);

  for (const value of values) {
    if (looksLikeMarkdownOrStructuredPayload(value)) {
      warnings.push(`疑似 Markdown、JSON 或结构化编辑说明：${clipText(value, 36)}`);
      continue;
    }

    if (looksLikeEditorInstruction(value)) {
      warnings.push(`疑似编辑动作或内部说明：${clipText(value, 36)}`);
    }
  }

  return uniqueStrings(warnings).slice(0, 4);
}

function looksLikeMarkdownOrStructuredPayload(value: string) {
  const trimmed = value.trim();

  return (
    /^(```|[-*#>]\s|\d+\.\s)/.test(trimmed) ||
    /^[{[]/.test(trimmed) ||
    /[`|]/.test(trimmed) ||
    /<\/?[a-z][\s\S]*>/i.test(trimmed)
  );
}

function looksLikeEditorInstruction(value: string) {
  return /(?:changedFields|strategyAsset|currentStrategySnapshot|本轮修改|用户要求|已更新为|我已|以下是|如下|可以改为|改成：|工具调用)/i.test(
    value,
  );
}

function looksLikeLowConfidenceEditIntent(userContent: string) {
  const compact = userContent.replace(/\s+/g, "").trim().toLowerCase();

  if (!compact) {
    return true;
  }

  if (hasBusinessAssetSignal(compact)) {
    return false;
  }

  if (compact.length <= 18) {
    return true;
  }

  return /[?？]$/.test(compact) && /(?:什么|为什么|怎么|如何|能不能|可以吗|吗)$/.test(compact);
}

function hasBusinessAssetSignal(value: string) {
  return [
    "改",
    "修改",
    "调整",
    "更新",
    "换成",
    "新增",
    "添加",
    "补充",
    "删除",
    "去掉",
    "保留",
    "写进",
    "写入",
    "沉淀",
    "策略资产",
    "定位",
    "卖点",
    "客群",
    "人群",
    "场景",
    "建议",
    "用户",
    "顾客",
    "客户",
    "服务",
    "项目",
    "价格",
    "转化",
    "私信",
    "视频",
    "图文",
    "小红书",
    "抖音",
    "成交",
    "门店",
    "体验",
    "咨询",
    "获客",
    "产后",
    "白领",
    "宝妈",
    "附近",
    "瑜伽",
    "普拉提",
  ].some((signal) => value.includes(signal));
}

function uniqueFieldKeys(values: StrategyAssetGuardFieldKey[]) {
  const seen = new Set<StrategyAssetGuardFieldKey>();
  const result: StrategyAssetGuardFieldKey[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}
