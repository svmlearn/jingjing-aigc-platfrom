import { PageHeader } from "@/components/app/page-header";
import { ImportConsole } from "@/components/dashboard/import-console";

export default function ImportPage() {
  return (
    <>
      <PageHeader
        eyebrow="Import"
        title="导入内容"
        description="粘贴小红书或抖音链接，先把对标内容和评论带进系统。当前 B 分支使用 mock adapter，不直连外部平台。"
      />
      <ImportConsole />
    </>
  );
}
