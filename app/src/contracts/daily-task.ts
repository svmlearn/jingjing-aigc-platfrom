export type DailyTaskStatus =
  | "generated"
  | "claimed"
  | "article_created"
  | "video_script_created"
  | "archived";

export type DailyTaskKind = "article" | "video";

export type DailyContentTaskItemDto = {
  kind: DailyTaskKind;
  title: string;
  summary: string;
  strategyTag?: string | null;
  contentGoal?: string | null;
  suggestedPlatform: "xiaohongshu" | "douyin";
  materialHints: string[];
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
  today: DailyContentTaskDto;
  upcoming: DailyContentTaskDto[];
  role: "owner" | "member";
};

