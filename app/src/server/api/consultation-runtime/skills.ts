import type {
  AgentSkillReferenceDto,
  AgentSkillReferenceType,
  AgentSkillReferenceUsage,
  AgentSkillDto,
} from "@/contracts/agent-console";
import type {
  ConsultationAgentRuntimeSettings,
  ConsultationRuntimeSkill,
  ConsultationSkillDisclosure,
  ConsultationSkillDependencyWarning,
} from "@/server/api/consultation-runtime/types";
import { clipText, uniqueStrings } from "@/server/api/consultation-runtime/utils";

export type ConsultationSkillScore = {
  skill: ConsultationRuntimeSkill;
  score: number;
  triggerReasons: string[];
};

export function toRuntimeSkill(skill: AgentSkillDto): ConsultationRuntimeSkill {
  return {
    id: skill.id,
    skillKey: skill.skillKey,
    name: skill.name,
    description: skill.description,
    whenToUse: skill.whenToUse,
    body: skill.body,
    dependencies: skill.dependencies,
    references: parseSkillReferences(skill.metadata),
  };
}

export function selectActiveConsultationSkills(input: {
  skills: ConsultationRuntimeSkill[];
  userContent: string;
  userMessages: string[];
}) {
  return scoreConsultationSkills(input)
    .filter((item) => item.score > 0)
    .map((item) => ({
      ...item.skill,
      score: item.score,
      triggerReasons: item.triggerReasons,
    }))
    .slice(0, 3);
}

export function scoreConsultationSkills(input: {
  skills: ConsultationRuntimeSkill[];
  userContent: string;
  userMessages: string[];
}): ConsultationSkillScore[] {
  const currentText = normalizeSkillMatchText(input.userContent);
  const recentText = normalizeSkillMatchText(input.userMessages.slice(-3).join(" "));
  const usageSignal = buildSkillUsageSignal(input.userMessages);

  return input.skills
    .map((skill) => {
      const haystack = normalizeSkillMatchText(
        [skill.name, skill.skillKey ?? "", skill.description, skill.whenToUse].join(" "),
      );
      const tokens = extractSkillTriggerTokens(haystack);
      const triggerReasons: string[] = [];
      let score = 0;

      for (const token of tokens) {
        if (currentText.includes(token)) {
          score += 3;
          triggerReasons.push(`current:${token}`);
        } else if (recentText.includes(token)) {
          score += 1;
          triggerReasons.push(`recent:${token}`);
        }
      }

      if (usageSignal && haystack.includes(usageSignal)) {
        score += 1;
        triggerReasons.push(`usageSignal:${usageSignal}`);
      }

      return {
        skill,
        score,
        triggerReasons: uniqueStrings(triggerReasons).slice(0, 6),
      };
    })
    .sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      return first.skill.name.localeCompare(second.skill.name, "zh-CN");
    });
}

function buildSkillUsageSignal(userMessages: string[]) {
  if (userMessages.length >= 3) {
    return "策略";
  }

  if (userMessages.length === 2) {
    return "客群";
  }

  return "";
}

function extractSkillTriggerTokens(source: string) {
  const normalized = normalizeSkillMatchText(source);
  const phraseTokens = normalized
    .split(/[\s,，。；;、/|()[\]{}"'`：:]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token.length <= 12);
  const conceptTokens = [
    "个人ip",
    "个人定位",
    "定位",
    "亮点",
    "优势",
    "人设",
    "产品",
    "卖点",
    "客群",
    "场景",
    "异议",
    "内容",
    "日历",
    "图文",
    "视频",
    "脚本",
    "转化",
    "私信",
    "到店",
  ].filter((token) => normalized.includes(token));

  return uniqueStrings([...conceptTokens, ...phraseTokens]).slice(0, 32);
}

function normalizeSkillMatchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

export function buildSkillDisclosure(
  consultationAgent: ConsultationAgentRuntimeSettings,
): ConsultationSkillDisclosure {
  return {
    mode: "progressive_disclosure",
    candidateSkills: consultationAgent.skillCatalog.map(toSkillDisclosureItem),
    activeSkills: consultationAgent.activeSkills.map(toSkillDisclosureItem),
  };
}

export function buildSkillDependencyWarnings(
  consultationAgent: ConsultationAgentRuntimeSettings,
): ConsultationSkillDependencyWarning[] {
  const knowledgeReady = Boolean(
    consultationAgent.container &&
      consultationAgent.container.agent.serviceFlags.knowledgeEnabled &&
      consultationAgent.container.knowledgeSetIds.length > 0 &&
      consultationAgent.container.knowledgeDocumentIds.length > 0 &&
      consultationAgent.enabledTools.includes("retrieve_knowledge_base"),
  );

  return consultationAgent.skillCatalog.flatMap((skill) =>
    skill.dependencies.flatMap((dependency) => {
      const normalized = normalizeSkillDependency(dependency);
      const requiresKnowledge =
        normalized === "knowledge" ||
        normalized === "knowledge_retrieval" ||
        normalized === "retrieve_knowledge_base";

      if (!requiresKnowledge || knowledgeReady) {
        return [];
      }

      return [{
        skillId: skill.id,
        skillName: skill.name,
        dependency,
        message: `Skill「${skill.name}」依赖 Knowledge 检索，但当前 Agent 未启用 Knowledge、未挂载可检索知识集，或检索工具不可用。`,
      }];
    }),
  );
}

function normalizeSkillDependency(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function toSkillDisclosureItem(skill: ConsultationRuntimeSkill) {
  return {
    id: skill.id,
    skillKey: skill.skillKey,
    name: skill.name,
    whenToUse: skill.whenToUse,
    score: skill.score,
    triggerReasons: skill.triggerReasons,
    referenceCount: skill.references.length,
    referenceTitles: skill.references.map((reference) => reference.title).slice(0, 8),
  };
}

export function buildSkillCatalogPrompt(consultationAgent: ConsultationAgentRuntimeSettings) {
  if (consultationAgent.skillCatalog.length === 0) {
    return "";
  }

  const listing = consultationAgent.skillCatalog
    .map((skill) =>
      [
        `- ${skill.name}${skill.skillKey ? ` (${skill.skillKey})` : ""}`,
        skill.description ? `  Description: ${clipText(skill.description, 160)}` : "",
        skill.whenToUse ? `  When to use: ${clipText(skill.whenToUse, 180)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");

  return [
    "【候选 Skills：渐进式披露】",
    "下面只列出可用 Skill 的简短说明。只有当前轮用户问题命中触发条件时，才会在后续“本轮激活 Skill”中提供完整正文。",
    listing,
  ].join("\n");
}

export function buildActiveSkillPrompt(skills: ConsultationRuntimeSkill[]) {
  if (skills.length === 0) {
    return "";
  }

  return [
    "【本轮激活 Skill】",
    "以下 Skill 正文只用于当前轮咨询判断。不得向商家暴露 Skill 名称、内部字段或配置来源。",
    ...skills.map((skill) =>
      [
        `## ${skill.name}${skill.skillKey ? ` (${skill.skillKey})` : ""}`,
        skill.body ? clipText(skill.body, 3600) : skill.whenToUse,
      ].join("\n"),
    ),
  ].join("\n\n");
}

export function buildSkillReferencePrompt(skills: ConsultationRuntimeSkill[]) {
  const references = buildSkillReferenceHints(skills);

  if (references.length === 0) {
    return "";
  }

  const listing = references
    .map((reference) =>
      [
        `- ${reference.skillName} -> ${reference.title}`,
        `  Type: ${reference.type}; usage: ${reference.usage}`,
      ].join("\n"),
    )
    .join("\n");

  return [
    "【本轮 Skill References】",
    "以下是本轮激活 Skill 绑定的受控参考资料提示。不要向商家暴露 reference id、URL 或本地路径；需要方法论、案例、定义、判断标准时，优先调用 retrieve_knowledge_base，并把 query 聚焦在用户问题和 reference title 上。",
    listing,
  ].join("\n");
}

export function buildSkillReferencePlannerHints(skills: ConsultationRuntimeSkill[]) {
  return buildSkillReferenceHints(skills).map((reference) => ({
    skillName: reference.skillName,
    title: reference.title,
    type: reference.type,
    usage: reference.usage,
    documentId: reference.documentId ?? null,
    knowledgeSetId: reference.knowledgeSetId ?? null,
  }));
}

export function buildSkillReferenceQueryText(skills: ConsultationRuntimeSkill[]) {
  return uniqueStrings(
    buildSkillReferenceHints(skills).flatMap((reference) => [
      reference.skillName,
      reference.title,
    ]),
  )
    .join(" ")
    .slice(0, 360);
}

type SkillReferenceHint = AgentSkillReferenceDto & {
  skillName: string;
};

function buildSkillReferenceHints(skills: ConsultationRuntimeSkill[]): SkillReferenceHint[] {
  return skills
    .flatMap((skill) =>
      skill.references.map((reference) => ({
        ...reference,
        skillName: skill.name,
      })),
    )
    .slice(0, 12);
}

function parseSkillReferences(metadata: Record<string, unknown>): AgentSkillReferenceDto[] {
  const rawReferences = Array.isArray(metadata.references) ? metadata.references : [];

  return rawReferences
    .map(parseSkillReference)
    .filter((reference): reference is AgentSkillReferenceDto => Boolean(reference))
    .slice(0, 30);
}

function parseSkillReference(value: unknown): AgentSkillReferenceDto | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = readNonEmptyString(value.title) ?? readReferenceFallbackTitle(value);

  if (!title) {
    return null;
  }

  const type = readReferenceType(value.type, value);
  const usage = readReferenceUsage(value.usage);
  const documentId = readNonEmptyString(value.documentId) ?? readNonEmptyString(value.knowledgeDocumentId);
  const knowledgeSetId = readNonEmptyString(value.knowledgeSetId);
  const url = readNonEmptyString(value.url);
  const path = readNonEmptyString(value.path);
  const notes = readNonEmptyString(value.notes);

  return {
    type,
    title,
    usage,
    ...(documentId ? { documentId } : {}),
    ...(knowledgeSetId ? { knowledgeSetId } : {}),
    ...(url ? { url } : {}),
    ...(path ? { path } : {}),
    ...(notes ? { notes } : {}),
  };
}

function readReferenceType(value: unknown, reference: Record<string, unknown>): AgentSkillReferenceType {
  if (
    value === "knowledge_document" ||
    value === "knowledge_set" ||
    value === "url" ||
    value === "local_path"
  ) {
    return value;
  }

  if (readNonEmptyString(reference.documentId) || readNonEmptyString(reference.knowledgeDocumentId)) {
    return "knowledge_document";
  }

  if (readNonEmptyString(reference.knowledgeSetId)) {
    return "knowledge_set";
  }

  if (readNonEmptyString(reference.url)) {
    return "url";
  }

  return "local_path";
}

function readReferenceUsage(value: unknown): AgentSkillReferenceUsage {
  return value === "retrieve_when_active" ||
    value === "retrieve_when_needed" ||
    value === "load_when_active"
    ? value
    : "retrieve_when_needed";
}

function readReferenceFallbackTitle(value: Record<string, unknown>) {
  return (
    readNonEmptyString(value.documentTitle) ??
    readNonEmptyString(value.knowledgeSetTitle) ??
    readNonEmptyString(value.url) ??
    readNonEmptyString(value.path)
  );
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
