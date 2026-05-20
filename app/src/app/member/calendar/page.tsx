import { MemberCalendarPage } from "@/components/member/member-workspace";
import { requireMemberAccess } from "@/lib/auth/member-page-guard";

export default async function MemberCalendarRoute() {
  await requireMemberAccess("/member/calendar");
  return <MemberCalendarPage />;
}
