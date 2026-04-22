export type AdminMerchantStatus = "active" | "disabled" | "archived";
export type MerchantPlan = "free" | "plus" | "pro";
export type AdminEventType = "邀请码" | "商户" | "模型配置" | "密钥";
export type AdminAlertLevel = "critical" | "warning" | "info";

export type AdminOverviewMetric = {
  label: string;
  value: number;
  delta: string;
  tone: "neutral" | "positive" | "warning";
};

export type AdminAuditEvent = {
  id: string;
  happenedAt: string;
  actorName: string;
  type: AdminEventType;
  summary: string;
};

export type AdminAlert = {
  id: string;
  level: AdminAlertLevel;
  title: string;
  description: string;
  happenedAt: string;
};

export type AdminInvitationCode = {
  id: string;
  code: string;
  status: "active" | "redeemed" | "expired" | "disabled";
  redemptionCount: number;
  maxRedemptions: number;
  expiresAt: string | null;
  note: string;
};

export type AdminMerchant = {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  status: AdminMerchantStatus;
  plan: MerchantPlan;
  dailyCredits: number;
  remainingCredits: number;
  lastActiveAt: string;
  joinedAt: string;
  contactPhone: string;
  address: string;
  serviceSummary: string;
  note: string;
  totalImports: number;
  totalDrafts: number;
  todayRewrites: number;
  runningTasks: number;
  failedTasks: number;
};

export type LlmProviderConfig = {
  id: string;
  name: string;
  providerLabel: string;
  baseUrl: string;
  apiKeyMasked: string;
  primaryModel: string;
  fallbackModel: string;
  temperature: number;
  maxTokens: number;
  timeoutSeconds: number;
  retryCount: number;
  enabled: boolean;
};

export type MembershipPlanConfig = {
  plan: MerchantPlan;
  label: string;
  dailyCredits: number;
  description: string;
};

export type ImportRuntimeConfig = {
  importProvider: string;
  defaultMaxComments: number;
  defaultCreatorPosts: number;
  waitSeconds: number;
};

export const adminOverviewMetrics: AdminOverviewMetric[] = [
  { label: "今日导入", value: 24, delta: "较昨日 +6", tone: "positive" },
  { label: "今日改写", value: 18, delta: "较昨日 +3", tone: "positive" },
  { label: "失败任务", value: 2, delta: "需关注", tone: "warning" },
  { label: "活跃商户", value: 12, delta: "本周 +3", tone: "neutral" },
];

export const adminAuditEvents: AdminAuditEvent[] = [
  {
    id: "event-001",
    happenedAt: "5 分钟前",
    actorName: "admin",
    type: "邀请码",
    summary: "生成邀请码 JJ-2026-008",
  },
  {
    id: "event-002",
    happenedAt: "1 小时前",
    actorName: "admin",
    type: "商户",
    summary: "禁用商户「北辰健身中心」",
  },
  {
    id: "event-003",
    happenedAt: "3 小时前",
    actorName: "admin",
    type: "模型配置",
    summary: "更新主模型 temperature = 0.7",
  },
  {
    id: "event-004",
    happenedAt: "昨天",
    actorName: "admin",
    type: "密钥",
    summary: "轮换 API Key（OpenAI）",
  },
];

export const adminAlerts: AdminAlert[] = [
  {
    id: "alert-001",
    level: "critical",
    title: "OpenAI 失败率升高",
    description: "过去 1 小时改写请求 12% 失败，需排查 5xx。",
    happenedAt: "10 分钟前",
  },
  {
    id: "alert-002",
    level: "warning",
    title: "Apify 抓取超时",
    description: "小红书博主主页任务 3 次超过 30 秒。",
    happenedAt: "1 小时前",
  },
  {
    id: "alert-003",
    level: "info",
    title: "商户积分耗尽",
    description: "「悦肤美疗所」今日已用完 Plus 档积分。",
    happenedAt: "2 小时前",
  },
];

export const adminInvitationCodes: AdminInvitationCode[] = [
  {
    id: "invite-001",
    code: "JJ-2026-001",
    status: "redeemed",
    redemptionCount: 1,
    maxRedemptions: 1,
    expiresAt: "2026-04-15",
    note: "静境皮肤管理中心",
  },
  {
    id: "invite-002",
    code: "JJ-2026-002",
    status: "active",
    redemptionCount: 0,
    maxRedemptions: 1,
    expiresAt: "2026-04-20",
    note: "线索测试渠道",
  },
  {
    id: "invite-003",
    code: "JJ-2026-005",
    status: "expired",
    redemptionCount: 0,
    maxRedemptions: 3,
    expiresAt: "2026-05-18",
    note: "老客裂变活动",
  },
];

export const adminMerchants: AdminMerchant[] = [
  {
    id: "merchant-jingjing-001",
    name: "静境皮肤管理中心",
    ownerName: "林予安",
    ownerEmail: "linyuan@jingjing.demo",
    status: "active",
    plan: "pro",
    dailyCredits: 300,
    remainingCredits: 86,
    lastActiveAt: "10 分钟前",
    joinedAt: "2026-03-15",
    contactPhone: "13800008888",
    address: "杭州市西湖区文三路 268 号 3F",
    serviceSummary: "敏感肌修护、痘肌管理、面部清洁、抗初老护理",
    note: "邀请码来源：杭州投放测试",
    totalImports: 45,
    totalDrafts: 28,
    todayRewrites: 12,
    runningTasks: 2,
    failedTasks: 1,
  },
  {
    id: "merchant-yuefu-002",
    name: "悦肤美疗所",
    ownerName: "陈惟宁",
    ownerEmail: "chenwn@yuefu.demo",
    status: "active",
    plan: "plus",
    dailyCredits: 100,
    remainingCredits: 0,
    lastActiveAt: "1 小时前",
    joinedAt: "2026-03-20",
    contactPhone: "13900001111",
    address: "杭州市拱墅区湖墅南路 88 号",
    serviceSummary: "祛痘护理、毛孔清洁、基础补水",
    note: "今日积分已用完，需关注套餐续费",
    totalImports: 32,
    totalDrafts: 19,
    todayRewrites: 9,
    runningTasks: 1,
    failedTasks: 0,
  },
  {
    id: "merchant-beichen-003",
    name: "北辰健身中心",
    ownerName: "柳书安",
    ownerEmail: "liusha@beichen.demo",
    status: "disabled",
    plan: "free",
    dailyCredits: 20,
    remainingCredits: 5,
    lastActiveAt: "昨天",
    joinedAt: "2026-04-10",
    contactPhone: "13700002222",
    address: "杭州市滨江区江南大道 218 号",
    serviceSummary: "减脂训练、私教体验、健身打卡",
    note: "因异常抓取频率已临时停用",
    totalImports: 5,
    totalDrafts: 0,
    todayRewrites: 0,
    runningTasks: 0,
    failedTasks: 2,
  },
];

export const llmProviderConfigs: LlmProviderConfig[] = [
  {
    id: "llm-main",
    name: "主改写通道",
    providerLabel: "OpenAI Compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKeyMasked: "sk-...8f2a",
    primaryModel: "gpt-4.1",
    fallbackModel: "gpt-4.1-mini",
    temperature: 0.7,
    maxTokens: 1800,
    timeoutSeconds: 45,
    retryCount: 2,
    enabled: true,
  },
  {
    id: "llm-backup",
    name: "备用改写通道",
    providerLabel: "OpenAI Compatible",
    baseUrl: "https://gateway.example.com/v1",
    apiKeyMasked: "gw-...19bd",
    primaryModel: "rewrite-fallback-01",
    fallbackModel: "rewrite-fallback-lite",
    temperature: 0.6,
    maxTokens: 1600,
    timeoutSeconds: 30,
    retryCount: 1,
    enabled: false,
  },
];

export const membershipPlanConfigs: MembershipPlanConfig[] = [
  {
    plan: "free",
    label: "Free",
    dailyCredits: 20,
    description: "适合测试期商户，默认每天 20 点，先按 1 次改写 = 1 点。",
  },
  {
    plan: "plus",
    label: "Plus",
    dailyCredits: 100,
    description: "适合稳定使用中的商户，支持更高频改写与导入。",
  },
  {
    plan: "pro",
    label: "Pro",
    dailyCredits: 300,
    description: "适合高频运营商户，预留更多团队和活动场景空间。",
  },
];

export const importRuntimeConfig: ImportRuntimeConfig = {
  importProvider: "apify",
  defaultMaxComments: 30,
  defaultCreatorPosts: 20,
  waitSeconds: 120,
};

export function getAdminMerchant(merchantId: string) {
  return adminMerchants.find((merchant) => merchant.id === merchantId);
}
