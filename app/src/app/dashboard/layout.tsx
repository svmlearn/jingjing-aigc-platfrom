import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/app/dashboard-shell";
import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireMerchantAccess();

  return <DashboardShell>{children}</DashboardShell>;
}

async function requireMerchantAccess() {
  try {
    const user = await getAuthenticatedUser();
    await getOperationalMerchantProfileByOwnerUserId(user.id);
  } catch {
    redirect("/login?error=unauthenticated&next=/dashboard");
  }
}
