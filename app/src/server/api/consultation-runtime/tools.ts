import type { ConsultationAgentToolKey } from "@/server/api/consultation-runtime/types";

export function getConsultationBusinessToolCatalog(): Array<{
  key: ConsultationAgentToolKey;
  label: string;
  purpose: string;
  writes: string;
}> {
  return [
    {
      key: "read_merchant_profile",
      label: "读取商家资料",
      purpose: "读取商家基础信息、服务项目、品牌语气和默认 CTA。",
      writes: "只读上下文",
    },
    {
      key: "retrieve_knowledge_base",
      label: "检索平台方法论与商家上下文",
      purpose: "检索平台方法论、商家资料和可用于咨询的知识片段。",
      writes: "knowledgeMatches / 受控上下文",
    },
    {
      key: "read_history",
      label: "读取历史内容",
      purpose: "读取当前咨询会话历史和摘要，避免丢上下文。",
      writes: "只读上下文",
    },
    {
      key: "search_benchmark_materials",
      label: "检索对标素材",
      purpose: "按关键词或博主主页检索小红书/抖音对标内容，并写入素材中心缓存，供营销专家分析选题和爆款结构。",
      writes: "source_items / 素材中心 / 对标素材缓存",
    },
    {
      key: "update_strategy_snapshot",
      label: "编辑策略资产",
      purpose: "把产品定位、核心卖点、目标客群、关键场景和当前建议作为一个整体资产编辑。",
      writes: "strategySnapshot as one editor document: positioning / coreSellingPoints / targetAudiences / keyScenes / currentSuggestion",
    },
    {
      key: "update_content_calendar",
      label: "更新内容日历",
      purpose: "把策略快照转成图文/视频混合内容日历。",
      writes: "strategySnapshot.contentCalendarDraft",
    },
    {
      key: "generate_article_brief",
      label: "生成图文任务草案",
      purpose: "把咨询结论转成图文工作台可使用的 brief。",
      writes: "strategySnapshot.articleBrief",
    },
    {
      key: "generate_video_brief",
      label: "生成视频任务草案",
      purpose: "把咨询结论转成视频工作台可使用的 brief。",
      writes: "strategySnapshot.videoBrief",
    },
  ];
}

export function buildBusinessToolPrompt(enabledTools: ConsultationAgentToolKey[]) {
  const enabled = new Set(enabledTools);
  const rows = getConsultationBusinessToolCatalog()
    .filter((tool) => enabled.has(tool.key))
    .map((tool) => `- ${tool.label}。${tool.purpose} 写入/影响：${tool.writes}。`)
    .join("\n");

  return [
    "【咨询 Agent 受控业务工具】",
    "右侧策略资产不是普通文案，它由以下受控业务工具更新；回答时要尊重这些工具的输出，不要声称执行未启用工具。",
    rows,
  ].join("\n");
}
