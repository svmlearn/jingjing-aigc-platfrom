import { SkillManagementAdminPage } from "@/components/platform-admin/agent-console-pages";
import {
  getAgentConsoleFoundationState,
  listAgentSkillBindings,
} from "@/lib/db/agent-console-repository";

export const dynamic = "force-dynamic";

export default async function SkillManagementPage() {
  const [foundationState, skillBindings] = await Promise.all([
    getAgentConsoleFoundationState(),
    listAgentSkillBindings(),
  ]);

  return (
    <SkillManagementAdminPage
      foundationState={foundationState}
      skillBindings={skillBindings}
    />
  );
}
