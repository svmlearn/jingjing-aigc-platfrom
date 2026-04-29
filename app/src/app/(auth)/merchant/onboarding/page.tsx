import { redirect } from "next/navigation";

import { MerchantProfileForm } from "@/components/dashboard/merchant-profile-form";
import {
  createSupabaseServerClient,
  isSupabasePublicConfigured,
} from "@/lib/supabase/server";

export default async function MerchantOnboardingPage() {
  await requireSignedInMerchantOwner();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] px-4 py-6 text-white md:px-6">
      <div className="pointer-events-none absolute left-[-16rem] top-[-18rem] size-[34rem] rounded-full bg-amber-500/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-20rem] right-[-12rem] size-[36rem] rounded-full bg-orange-900/25 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/45 to-transparent" />
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-4xl items-center py-8">
        <MerchantProfileForm
          title="补全商户资料"
          description="这些信息会进入改写上下文，先保持准确、具体、够销售使用。"
          nextHref="/dashboard/import"
          nextLabel="进入导入页"
        />
      </div>
    </main>
  );
}

async function requireSignedInMerchantOwner() {
  if (!isSupabasePublicConfigured()) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login?error=unauthenticated&next=/merchant/onboarding");
  }
}
