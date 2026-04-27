import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { CreateInvitationCodeAdminPage } from "@/components/platform-admin/platform-admin-content";
import { Button } from "@/components/ui/button";
import { getCurrentPlatformAdmin } from "@/lib/auth/platform-admin-session";

export default async function NewInvitationCodePage() {
  const currentAdmin = await getCurrentPlatformAdmin();

  if (currentAdmin?.role !== "super_admin") {
    return (
      <>
        <PageHeader
          eyebrow="Platform Admin"
          title="生成邀请码"
          description="当前账号没有生成邀请码的权限。"
          action={
            <Button asChild variant="outline" className="rounded-md">
              <Link href="/platform-admin/invitation-codes">返回邀请码管理</Link>
            </Button>
          }
        />
        <div className="rounded-md border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
          生成邀请码会影响新商户准入，当前仅 super_admin 可以操作。
        </div>
      </>
    );
  }

  return <CreateInvitationCodeAdminPage />;
}
