import { MemberArticleTaskPage } from "@/components/member/member-workspace";
import { requireMemberAccess } from "@/lib/auth/member-page-guard";

export default async function MemberArticleTaskRoute({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  await requireMemberAccess(`/member/article/${taskId}`);

  return <MemberArticleTaskPage taskId={taskId} />;
}
