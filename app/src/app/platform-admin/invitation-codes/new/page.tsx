import Link from "next/link";

import { CreateInvitationCodeAdminPage } from "@/components/platform-admin/platform-admin-content";
import {
  AdminNotice,
  AdminPageHeader,
  adminButtonClassName,
  adminButtonVariants,
} from "@/components/platform-admin/platform-admin-ui";
import { getCurrentPlatformAdmin } from "@/lib/auth/platform-admin-session";
import { cn } from "@/lib/utils";

export default async function NewInvitationCodePage() {
  const currentAdmin = await getCurrentPlatformAdmin();

  if (currentAdmin?.role !== "super_admin") {
    return (
      <div className="grid gap-6">
        <AdminPageHeader
          title="生成邀请码"
          description="当前账号没有生成邀请码的权限。"
          action={
            <Link
              href="/platform-admin/invitation-codes"
              className={cn(adminButtonClassName, adminButtonVariants.secondary)}
            >
              返回邀请码管理
            </Link>
          }
        />
        <AdminNotice tone="warning">
          生成邀请码会影响新用户准入，当前仅 super_admin 可以操作。
        </AdminNotice>
      </div>
    );
  }

  return <CreateInvitationCodeAdminPage />;
}
