import { SubscriptionDetail } from './subscription-detail';

export default async function SuscripcionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubscriptionDetail id={id} />;
}
