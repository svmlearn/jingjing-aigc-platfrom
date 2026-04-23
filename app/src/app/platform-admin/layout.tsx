import { PlatformAdminShell } from "@/components/platform-admin/platform-admin-shell";
import { hasPlatformAdminSession } from "@/lib/auth/platform-admin-session";
import { redirect } from "next/navigation";

export default async function PlatformAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!(await hasPlatformAdminSession())) {
    redirect("/platform-admin-login");
  }

  return <PlatformAdminShell>{children}</PlatformAdminShell>;
}
