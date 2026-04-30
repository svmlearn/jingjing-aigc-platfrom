import { PlatformKnowledgeManager } from "@/components/platform-admin/platform-knowledge-manager";
import { AdminPageHeader } from "@/components/platform-admin/platform-admin-ui";
import { getAgentConsoleFoundationState } from "@/lib/db/agent-console-repository";

export const dynamic = "force-dynamic";

export default async function PlatformKnowledgePage() {
  const foundationState = await getAgentConsoleFoundationState();

  return (
    <div className="grid gap-6">
      <AdminPageHeader
        title="平台方法论知识库"
        description="上传平台级方法论与行业素材，并预览 V2.2 Knowledge Set 结构。真实文档操作继续走现有 knowledge API。"
      />
      <PlatformKnowledgeManager knowledgeSets={foundationState.knowledgeSets} />
    </div>
  );
}
