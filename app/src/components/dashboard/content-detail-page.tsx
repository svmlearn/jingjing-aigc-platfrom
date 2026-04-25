import { ContentDetail } from "@/components/dashboard/content-detail";
import { getSourceItem } from "@/lib/ui/mock-api";

export function ContentDetailPage({ sourceItemId }: { sourceItemId: string }) {
  return <ContentDetail sourceItem={getSourceItem(sourceItemId)} />;
}
