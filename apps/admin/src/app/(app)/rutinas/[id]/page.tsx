import { EditRutina } from './edit-client';

export default async function EditRutinaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditRutina id={id} />;
}
