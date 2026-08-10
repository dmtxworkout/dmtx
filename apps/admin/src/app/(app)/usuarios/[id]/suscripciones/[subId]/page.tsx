import { EpisodeDetail } from './episode-client';

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string; subId: string }>;
}) {
  const { id, subId } = await params;
  return <EpisodeDetail userId={id} subId={subId} />;
}
