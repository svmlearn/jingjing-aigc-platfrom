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
        description="这里现在直接连接真实商户资料 API，保存后会写入当前 owner 对应的商户记录。"
        nextHref="/dashboard/rewrite/source-xhs-sensitive-repair"
        nextLabel="去改写工作台"
      />
    </>
  );
}
