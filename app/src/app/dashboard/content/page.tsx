import { PageHeader } from "@/components/app/page-header";
import { ContentCenter } from "@/components/dashboard/content-center";

export default function ContentPage() {
  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="内容中心"
        description="统一查看导入内容、评论和改写草稿。低质量导入会保留提示，不直接推入改写。"
      />
      <ContentCenter />
    </>
  );
}
