import { ArticleWorkbench } from "@/components/merchant/article-workbench";

export default async function DashboardArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>;
}) {
  const params = await searchParams;
  return <ArticleWorkbench sessionId={params.sessionId ?? null} />;
}
