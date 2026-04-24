import { ArticleWorkbench } from "@/components/merchant/article-workbench";

export default async function DashboardArticlePage({
  searchParams,
}: {
  searchParams: Promise<{
    sessionId?: string;
    materialId?: string;
    materialReferenceId?: string;
    mode?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <ArticleWorkbench
      sessionId={params.sessionId ?? null}
      materialId={params.materialId ?? null}
      materialReferenceId={params.materialReferenceId ?? null}
      initialMode={params.mode === "rewrite" ? "rewrite" : null}
    />
  );
}
