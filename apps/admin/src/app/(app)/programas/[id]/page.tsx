import { EditPrograma } from './edit-client';

export default async function EditProgramaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditPrograma id={id} />;
}
