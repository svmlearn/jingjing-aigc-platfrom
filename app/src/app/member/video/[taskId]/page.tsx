import { MemberVideoTaskPage } from "@/components/member/member-workspace";
import { requireMemberAccess } from "@/lib/auth/member-page-guard";

export default async function MemberVideoTaskRoute({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  await requireMemberAccess(`/member/video/${taskId}`);

  return <MemberVideoTaskPage taskId={taskId} />;
}
