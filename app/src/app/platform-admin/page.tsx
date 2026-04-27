import { PlatformAdminOverviewPage } from "@/components/platform-admin/platform-admin-content";
import { getAgentConsoleFoundationState } from "@/lib/db/agent-console-repository";

export const dynamic = "force-dynamic";

export default async function PlatformAdminHomePage() {
  const foundationState = await getAgentConsoleFoundationState();

  return <PlatformAdminOverviewPage foundationState={foundationState} />;
}
