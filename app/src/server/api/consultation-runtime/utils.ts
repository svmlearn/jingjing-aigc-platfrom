export function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(value.trim());
  }

  return result;
}

export function toStringArrayValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return typeof value === "string" ? [value] : [];
}

export function clipText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function clampInteger(value: number, min: number, max: number) {
  return Math.max(min, Math.min(Math.trunc(value), max));
}

export function isExplicitKnowledgeBaseReadRequest(content: string) {
  const normalized = content.replace(/\s+/g, "");

  if (!normalized) {
    return false;
  }

  const mentionsKnowledgeBase =
    /知识库|上传.*(?:文件|文档|资料)|(?:文件|文档|资料).*上传|这(?:两|2|几|些)?个(?:文件|文档|资料)/.test(
      normalized,
    );
  const asksToRead =
    /读|读取|查看|看看|看一下|读一下|分析|总结|梳理|概括|提取/.test(normalized);

  return mentionsKnowledgeBase && asksToRead;
}
