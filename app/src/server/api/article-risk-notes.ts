import type { ArticleGeneratedVariant } from "@/server/api/article-prompt-templates";

export function buildDeterministicArticleRiskNotes(input: {
  variants: ArticleGeneratedVariant[];
  forbiddenWords: string[];
  materialRefs: Array<Record<string, unknown>>;
}) {
  const joinedText = input.variants
    .map((variant) => [variant.title, variant.bodyText, variant.ctaText, ...variant.hashtags].join(" "))
    .join("\n");
  const matchedForbiddenWords = input.forbiddenWords.filter(
    (word) => word.trim() && joinedText.includes(word.trim()),
  );
  const highRiskExpressions = ["保证", "稳赚", "必涨", "不限购", "内部价", "唯一", "第一"];
  const matchedHighRiskExpressions = highRiskExpressions.filter((word) => joinedText.includes(word));
  const notes: string[] = [];

  if (matchedForbiddenWords.length > 0) {
    notes.push(`命中商家违禁词：${matchedForbiddenWords.slice(0, 5).join("、")}，发布前需要替换或删除。`);
  }

  if (matchedHighRiskExpressions.length > 0) {
    notes.push(`包含高风险表达：${matchedHighRiskExpressions.slice(0, 5).join("、")}，建议改成可验证、非承诺式说法。`);
  }

  if (input.materialRefs.length === 0) {
    notes.push("未匹配到真实项目图片素材，图文配图仅给出结构建议，发布前需要从后台素材库补充真实项目图片。");
  }

  return notes;
}
