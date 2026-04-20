import { PageHeader } from "@/components/app/page-header";
import { MerchantProfileForm } from "@/components/dashboard/merchant-profile-form";

export default function MerchantProfilePage() {
  return (
    <>
      <PageHeader
        eyebrow="Merchant"
        title="商户资料"
        description="改写时会引用这些信息。越具体，草稿越像商户自己的内容。"
      />
      <MerchantProfileForm
        title="编辑商户资料"
        description="当前为前端 mock 保存，A 分支接入真实 API 后可替换 adapter。"
        nextHref="/dashboard/rewrite/source-xhs-sensitive-repair"
        nextLabel="去改写工作台"
      />
    </>
  );
}
