import { MemberProjectIntroPage } from "@/components/member/member-workspace";
import { requireMemberAccess } from "@/lib/auth/member-page-guard";

export default async function MemberPage() {
  await requireMemberAccess("/member");
  return <MemberProjectIntroPage />;
}
