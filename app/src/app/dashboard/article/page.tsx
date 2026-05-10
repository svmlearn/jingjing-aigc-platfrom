import { ArticleWorkbench } from "@/components/merchant/article-workbench";

export default async function DashboardArticlePage({
  searchParams,
}: {
  searchParams: Promise<{
    source?: string;
    sessionId?: string;
    dailyTaskId?: string;
    calendarItemId?: string;
    materialId?: string;
    materialReferenceId?: string;
    mode?: string;
    strategyTag?: string;
    strategy?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <ArticleWorkbench
      sessionId={params.sessionId ?? null}
      dailyTaskId={params.dailyTaskId ?? null}
      source={params.source ?? null}
      calendarItemId={params.calendarItemId ?? null}
      materialId={params.materialId ?? null}
      materialReferenceId={params.materialReferenceId ?? null}
      initialMode={params.mode === "rewrite" ? "rewrite" : null}
      strategyTag={params.strategyTag ?? params.strategy ?? null}
    />
  );
}
