import { PlatformSettingsEditor } from "@/components/platform-admin/platform-settings-editor";
import { AdminPageHeader } from "@/components/platform-admin/platform-admin-ui";

export default function PlatformSettingsPage() {
  return (
    <div className="grid gap-6">
      <AdminPageHeader
        title="系统配置"
        description="平台级运行参数。Agent 配置、技能与知识挂载请前往 Agent 能力模块。"
      />
      <PlatformSettingsEditor />
    </div>
  );
}
