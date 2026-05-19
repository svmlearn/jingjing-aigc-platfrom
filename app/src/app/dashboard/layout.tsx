import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/app/dashboard-shell";
import { isDomesticSessionEnabled } from "@/lib/auth/domestic-session";
import { getAuthenticatedUser } from "@/lib/auth/current-user";
import { getOperationalMerchantProfileByOwnerUserId } from "@/lib/db/merchant-repository";
import {
  createSupabaseServerClient,
  isSupabasePublicConfigured,
} from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireMerchantAccess();

  return <DashboardShell>{children}</DashboardShell>;
}

async function requireMerchantAccess() {
  if (isDomesticSessionEnabled() || !isSupabasePublicConfigured()) {
    try {
      const user = await getAuthenticatedUser();
      await getOperationalMerchantProfileByOwnerUserId(user.id);
    } catch {
      redirect("/login?error=unauthenticated&next=/dashboard");
    }

    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login?error=unauthenticated&next=/dashboard");
  }

  try {
    await getOperationalMerchantProfileByOwnerUserId(data.user.id);
  } catch {
    await supabase.auth.signOut();
    redirect("/login?error=no-merchant-profile");
  }
}
