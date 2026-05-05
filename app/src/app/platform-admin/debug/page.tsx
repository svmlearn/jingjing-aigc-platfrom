import { AgentDebugAdminPage } from "@/components/platform-admin/agent-console-pages";
import {
  getAgentConsoleFoundationState,
  listAgentKnowledgeSetBindings,
  listAgentPromptVersions,
  listAgentSkillBindings,
} from "@/lib/db/agent-console-repository";
import { listPlatformMerchants } from "@/lib/db/platform-admin-repository";

export const dynamic = "force-dynamic";

export default async function AgentDebugPage() {
  const foundationState = await getAgentConsoleFoundationState();
  const [skillBindings, knowledgeSetBindings, promptVersionGroups, merchants] = await Promise.all([
    listAgentSkillBindings(),
    listAgentKnowledgeSetBindings(),
    Promise.all(foundationState.agents.map((agent) => listAgentPromptVersions(agent.id))),
    listPlatformMerchants(),
  ]);

  return (
    <AgentDebugAdminPage
      foundationState={foundationState}
      skillBindings={skillBindings}
      knowledgeSetBindings={knowledgeSetBindings}
      promptVersions={promptVersionGroups.flat()}
      merchants={merchants}
    />
  );
}
