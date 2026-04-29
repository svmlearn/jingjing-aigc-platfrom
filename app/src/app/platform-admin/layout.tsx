import { PlatformAdminShell } from "@/components/platform-admin/platform-admin-shell";
import { getCurrentPlatformAdmin } from "@/lib/auth/platform-admin-session";
import { redirect } from "next/navigation";

export default async function PlatformAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentAdmin = await getCurrentPlatformAdmin();

  if (!currentAdmin) {
    redirect("/platform-admin-login");
  }

  return <PlatformAdminShell currentAdmin={currentAdmin}>{children}</PlatformAdminShell>;
}
