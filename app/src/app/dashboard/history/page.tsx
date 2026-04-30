import { Suspense } from "react";

import { HistoryHub } from "@/components/merchant/history-hub";

export default function DashboardHistoryPage() {
  return (
    <Suspense fallback={null}>
      <HistoryHub />
    </Suspense>
  );
}
