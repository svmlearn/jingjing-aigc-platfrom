import { redirect } from "next/navigation";

import { MemberInvitePage } from "@/components/member/member-workspace";
import { getOptionalMemberAccess } from "@/lib/auth/member-page-guard";

export default async function MemberInviteRoute({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const access = await getOptionalMemberAccess();
  if (!access?.user) {
    const target = new URLSearchParams();
    if (code) {
      target.set("code", code);
    }
    const query = target.toString();
    redirect(`/member/register${query ? `?${query}` : ""}`);
  }

  return <MemberInvitePage initialCode={code ?? ""} />;
}
