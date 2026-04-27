import { PageHeader } from "@/components/app/page-header";
import { PlatformSettingsEditor } from "@/components/platform-admin/platform-settings-editor";
import { getCurrentPlatformAdmin } from "@/lib/auth/platform-admin-session";
import { redirect } from "next/navigation";

export default async function PlatformSettingsPage() {
  const currentAdmin = await getCurrentPlatformAdmin();

  if (!currentAdmin) {
    redirect("/platform-admin-login");
  }

  return (
    <>
      <PageHeader
        eyebrow="Platform Admin"
        title="系统配置"
        description="真实平台设置编辑页，直接驱动 consultation agent 与 knowledge runtime。"
      />
      <PlatformSettingsEditor currentAdmin={currentAdmin} />
    </>
  );
}
