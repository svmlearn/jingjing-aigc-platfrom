import { MemberVideoTaskPage } from "@/components/member/member-workspace";

export default async function MemberVideoTaskRoute({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;

  return <MemberVideoTaskPage taskId={taskId} />;
}
