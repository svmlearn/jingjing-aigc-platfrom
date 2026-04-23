import { PageHeader } from "@/components/app/page-header";
import { ContentDetailPage } from "@/components/dashboard/content-detail-page";
import { getSourceItem } from "@/lib/ui/mock-api";

export default async function SourceItemPage({
  params,
}: {
  params: Promise<{ sourceItemId: string }>;
}) {
  const { sourceItemId } = await params;
  const sourceItem = getSourceItem(sourceItemId);

  return (
    <>
      <PageHeader
        eyebrow="Source Detail"
        title={sourceItem.title ?? "导入内容不完整"}
        description="查看来源正文、评论洞察和评论列表，再决定是否进入改写。"
      />
      <ContentDetailPage sourceItemId={sourceItemId} />
    </>
  );
}
