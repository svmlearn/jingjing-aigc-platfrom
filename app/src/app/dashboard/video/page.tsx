import { VideoWorkbench } from "@/components/merchant/video-workbench";

export default async function DashboardVideoPage({
  searchParams,
}: {
  searchParams: Promise<{
    sessionId?: string;
    materialId?: string;
    materialReferenceId?: string;
    strategy?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <VideoWorkbench
      sessionId={params.sessionId ?? null}
      materialId={params.materialId ?? null}
      materialReferenceId={params.materialReferenceId ?? null}
      strategyTag={params.strategy ?? null}
    />
  );
}
