import { EditExercise } from './edit-client';

export default async function EditExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditExercise id={id} />;
}
