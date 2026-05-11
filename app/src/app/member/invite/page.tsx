import { MemberInvitePage } from "@/components/member/member-workspace";

export default async function MemberInviteRoute({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return <MemberInvitePage initialCode={code ?? ""} />;
}
