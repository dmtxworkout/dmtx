import { EditHabilidad } from './edit-client';

export default async function EditHabilidadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditHabilidad id={id} />;
}
