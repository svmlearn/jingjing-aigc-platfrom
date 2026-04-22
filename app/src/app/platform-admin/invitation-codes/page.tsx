import { InvitationCodesAdminPage } from "@/components/platform-admin/platform-admin-content";
import { listPlatformInvitationCodes } from "@/lib/db/platform-admin-repository";

export const dynamic = "force-dynamic";

export default async function InvitationCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string | string[] }>;
}) {
  const [invitationCodes, params] = await Promise.all([
    listPlatformInvitationCodes(),
    searchParams,
  ]);
  const createdCode = Array.isArray(params.created) ? params.created[0] : params.created;

  return (
    <InvitationCodesAdminPage
      invitationCodes={invitationCodes}
      createdCode={createdCode}
    />
  );
}
