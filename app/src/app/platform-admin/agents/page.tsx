import { AgentConfigAdminPage } from "@/components/platform-admin/agent-console-pages";
import {
  getAgentConsoleFoundationState,
  listAgentKnowledgeSetBindings,
  listAgentPromptVersions,
  listAgentSoulVersions,
  listAgentSkillBindings,
} from "@/lib/db/agent-console-repository";

export const dynamic = "force-dynamic";

export default async function AgentConfigPage() {
  const foundationState = await getAgentConsoleFoundationState();
  const [skillBindings, knowledgeSetBindings, promptVersionGroups, soulVersionGroups] = await Promise.all([
    listAgentSkillBindings(),
    listAgentKnowledgeSetBindings(),
    Promise.all(foundationState.agents.map((agent) => listAgentPromptVersions(agent.id))),
    Promise.all(foundationState.agents.map((agent) => listAgentSoulVersions(agent.id))),
  ]);

  return (
    <AgentConfigAdminPage
      foundationState={foundationState}
      skillBindings={skillBindings}
      knowledgeSetBindings={knowledgeSetBindings}
      promptVersions={promptVersionGroups.flat()}
      soulVersions={soulVersionGroups.flat()}
    />
  );
}
