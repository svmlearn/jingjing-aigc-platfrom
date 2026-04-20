import { MerchantProfileForm } from "@/components/dashboard/merchant-profile-form";

export default function MerchantOnboardingPage() {
  return (
    <main className="min-h-screen bg-[#f7f8fa] px-4 py-6 text-[#17202a] md:px-6">
      <div className="mx-auto max-w-4xl">
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
