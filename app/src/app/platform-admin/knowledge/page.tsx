import { PageHeader } from "@/components/app/page-header";
import { PlatformKnowledgeManager } from "@/components/platform-admin/platform-knowledge-manager";

export default function PlatformKnowledgePage() {
  return (
    <>
      <PageHeader
        eyebrow="Platform Admin"
        title="知识库管理"
        description="上传平台级方法论与行业素材，入库后会作为受控上下文影响下一轮咨询诊断。"
      />
      <PlatformKnowledgeManager />
    </>
  );
}
