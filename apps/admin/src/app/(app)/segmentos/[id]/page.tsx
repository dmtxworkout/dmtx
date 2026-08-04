import { EditRutina } from '../../rutinas/[id]/edit-client';

export default async function EditSegmentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The form derives segment mode from workout.kind, so the same editor works.
  return <EditRutina id={id} />;
}
