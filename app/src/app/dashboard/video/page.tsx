import { VideoWorkbench } from "@/components/merchant/video-workbench";

import {
  normalizeDashboardVideoSearchParams,
  type DashboardVideoSearchParams,
} from "./page-search-params";

export default async function DashboardVideoPage({
  searchParams,
}: {
  searchParams: Promise<DashboardVideoSearchParams>;
}) {
  const params = normalizeDashboardVideoSearchParams(await searchParams);

  return (
    <VideoWorkbench
      sessionId={params.sessionId}
      materialId={params.materialId}
      materialReferenceId={params.materialReferenceId}
      strategyTag={params.strategyTag}
    />
  );
}
