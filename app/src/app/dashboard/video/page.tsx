import { VideoWorkbench } from "@/components/merchant/video-workbench";

export default async function DashboardVideoPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string }>;
}) {
  const params = await searchParams;
  return <VideoWorkbench sessionId={params.sessionId ?? null} />;
}
