'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ProgramaForm } from '@/components/programa-form';
import { es } from '@/i18n/es';

export function EditPrograma({ id }: { id: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['program', id],
    queryFn: () => api.programs.get(id),
  });
  if (isLoading) return <div className="p-6 text-sm text-muted">{es.app.loading}</div>;
  if (isError || !data) return <div className="p-6 text-sm text-accent-dark">{es.app.error}</div>;
  return <ProgramaForm program={data} />;
}
