'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ExerciseForm } from '@/components/exercise-form';
import { es } from '@/i18n/es';

export function EditExercise({ id }: { id: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['exercise', id],
    queryFn: () => api.exercises.get(id),
  });

  if (isLoading) return <div className="p-6 text-sm text-zinc-500">{es.app.loading}</div>;
  if (isError || !data) return <div className="p-6 text-sm text-red-600">{es.app.error}</div>;
  return <ExerciseForm exercise={data} />;
}
