export type DailyTaskStatus =
  | "generated"
  | "claimed"
  | "article_created"
  | "video_script_created"
  | "archived";

export type DailyTaskKind = "article" | "video";

export type DailyProjectIntroDto = {
  projectName: string;
  summary: string;
  coreSellingPoints: string[];
  promotedLayouts: string[];
  publicInfo: string[];
  weeklyFocus: string;
  usageGuide: string[];
  defaultCta: string[];
};

export type DailyTaskImageAssetDto = {
  id: string;
  title: string;
  description?: string | null;
  url?: string | null;
  source?: string | null;
};

export type DailyArticleContentPackageDto = {
  title: string;
  body: string;
  hashtags: string[];
  cta: string;
  coverText: string;
  imageAssets: DailyTaskImageAssetDto[];
  imageBriefs: string[];
  generatedAt: string;
};

export type DailyVideoScriptSceneDto = {
  id: string;
  order: number;
  title: string;
  durationSeconds: number;
  camera: string;
  spokenText: string;
  subtitle: string;
  shootingGuide: string;
  materialSlot: string;
  required: boolean;
};

export type DailyVideoScriptPackageDto = {
  title: string;
  hook: string;
  storyOutline: string;
  targetDurationSeconds: number;
  scenes: DailyVideoScriptSceneDto[];
  cta: string;
  materialChecklist: string[];
  generatedAt: string;
};

export type DailyContentTaskItemDto = {
  kind: DailyTaskKind;
  title: string;
  summary: string;
  strategyTag?: string | null;
  contentGoal?: string | null;
  suggestedPlatform: "xiaohongshu" | "douyin";
  materialHints: string[];
  generatedArticle?: DailyArticleContentPackageDto | null;
  generatedVideoScript?: DailyVideoScriptPackageDto | null;
};

export type DailyContentTaskDto = {
  id: string;
  merchantId: string;
  userId: string;
  taskDate: string;
  theme: string;
  teamCalendarSource: Record<string, unknown>;
  articleTask: DailyContentTaskItemDto;
  videoTask: DailyContentTaskItemDto;
  knowledgeRefs: Array<Record<string, unknown>>;
  materialRefs: Array<Record<string, unknown>>;
  status: DailyTaskStatus;
  createdAt: string;
  updatedAt: string;
};

export type DailyContentWorkspaceDto = {
  project: DailyProjectIntroDto;
  today: DailyContentTaskDto;
  upcoming: DailyContentTaskDto[];
  role: "owner" | "member";
};
