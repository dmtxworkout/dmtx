import { SubscriptionHistory } from './history-client';

export default async function HistorialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubscriptionHistory userId={id} />;
}
