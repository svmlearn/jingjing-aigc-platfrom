import { MemberShell } from "@/components/member/member-workspace";

export const dynamic = "force-dynamic";

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return <MemberShell>{children}</MemberShell>;
}
