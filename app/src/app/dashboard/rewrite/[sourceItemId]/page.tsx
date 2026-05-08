import { PageHeader } from "@/components/app/page-header";
import { RewriteWorkbench } from "@/components/dashboard/rewrite-workbench";
import { getSourceItem } from "@/lib/ui/mock-api";

export default async function RewritePage({
  params,
}: {
  params: Promise<{ sourceItemId: string }>;
}) {
  const { sourceItemId } = await params;
  const sourceItem = getSourceItem(sourceItemId);

  return (
    <>
      <PageHeader
        eyebrow="Rewrite"
        title="改写工作台"
        description={`把「${sourceItem.title ?? "这条导入内容"}」改写成当前用户可发布的草稿。`}
      />
      <RewriteWorkbench sourceItemId={sourceItemId} />
    </>
  );
}
