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
        description="继续编辑标题、正文、话题和行动引导。发布链路后置，本页只保存草稿体验。"
      />
      <DraftDetail draftId={draftId} />
    </>
  );
}
