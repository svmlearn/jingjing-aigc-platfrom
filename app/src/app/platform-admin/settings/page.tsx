import { PageHeader } from "@/components/app/page-header";
import { PlatformSettingsEditor } from "@/components/platform-admin/platform-settings-editor";

export default function PlatformSettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Platform Admin"
        title="系统配置"
        description="真实平台设置编辑页，直接驱动 consultation agent 与 knowledge runtime。"
      />
      <PlatformSettingsEditor />
    </>
  );
}
