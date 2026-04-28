import { VideoWorkbench } from "@/components/merchant/video-workbench";

export default async function DashboardVideoPage({
  searchParams,
}: {
  searchParams: Promise<{
    source?: string;
    sessionId?: string;
    calendarItemId?: string;
    materialId?: string;
    materialReferenceId?: string;
    strategyTag?: string;
    strategy?: string;
    testMode?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <VideoWorkbench
      sessionId={params.sessionId ?? null}
      source={params.source ?? null}
      calendarItemId={params.calendarItemId ?? null}
      materialId={params.materialId ?? null}
      materialReferenceId={params.materialReferenceId ?? null}
      strategyTag={params.strategyTag ?? params.strategy ?? null}
      testMode={params.testMode ?? null}
    />
  );
}
