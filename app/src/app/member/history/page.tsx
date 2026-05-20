import { MemberHistoryPage } from "@/components/member/member-workspace";
import { requireMemberAccess } from "@/lib/auth/member-page-guard";

export default async function MemberHistoryRoute() {
  await requireMemberAccess("/member/history");
  return <MemberHistoryPage />;
}
