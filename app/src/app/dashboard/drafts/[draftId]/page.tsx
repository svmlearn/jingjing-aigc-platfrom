import { PageHeader } from "@/components/app/page-header";
import { DraftDetail } from "@/components/dashboard/draft-detail";
import { getDraftBundle } from "@/lib/ui/mock-api";

export default async function DraftPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;
  const { draft } = getDraftBundle(draftId);

  return (
    <>
      <PageHeader
        eyebrow="Draft"
        title={draft.workingTitle ?? "改写草稿"}
        description="继续编辑标题、正文/脚本、话题和行动引导，并在同一页补素材、发起视频任务、查看成片结果。"
      />
      <DraftDetail draftId={draftId} />
    </>
  );
}
