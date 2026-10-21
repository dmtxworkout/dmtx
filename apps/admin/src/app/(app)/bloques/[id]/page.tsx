import { EditReusableBlock } from './edit-client';

export default async function EditReusableBlockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditReusableBlock id={id} />;
}
