import { PlatformSettingsEditor } from "@/components/platform-admin/platform-settings-editor";
import { AdminPageHeader } from "@/components/platform-admin/platform-admin-ui";
import { getCurrentPlatformAdmin } from "@/lib/auth/platform-admin-session";
import { redirect } from "next/navigation";

export default async function PlatformSettingsPage() {
  const currentAdmin = await getCurrentPlatformAdmin();

  if (!currentAdmin) {
    redirect("/platform-admin-login");
  }

  return (
    <div className="grid gap-6">
      <AdminPageHeader
        title="系统配置"
        description="平台级运行参数。Agent 配置、技能与知识挂载请前往 Agent 能力模块。"
      />
      <PlatformSettingsEditor currentAdmin={currentAdmin} />
    </div>
  );
}
