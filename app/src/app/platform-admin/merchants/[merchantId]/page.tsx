import { MerchantDetailAdminPage } from "@/components/platform-admin/platform-admin-content";
import { getAdminMerchant } from "@/lib/ui/platform-admin-mock";
import { notFound } from "next/navigation";

export default async function MerchantDetailPage({
  params,
}: {
  params: Promise<{ merchantId: string }>;
}) {
  const { merchantId } = await params;
  const merchant = getAdminMerchant(merchantId);

  if (!merchant) {
    notFound();
  }

  return <MerchantDetailAdminPage merchant={merchant} />;
}
