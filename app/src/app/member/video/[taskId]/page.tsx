import { MemberVideoTaskPage } from "@/components/member/member-workspace";
import { requireMemberAccess } from "@/lib/auth/member-page-guard";

export default async function MemberVideoTaskRoute({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>;
  searchParams: Promise<{ jobId?: string }>;
}) {
  const { taskId } = await params;
  const { jobId } = await searchParams;
  await requireMemberAccess(`/member/video/${taskId}`);

  return <MemberVideoTaskPage taskId={taskId} jobId={jobId ?? null} />;
}
