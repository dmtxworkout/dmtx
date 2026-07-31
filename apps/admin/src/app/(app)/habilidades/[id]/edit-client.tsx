'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { HabilidadForm } from '@/components/habilidad-form';
import { es } from '@/i18n/es';

export function EditHabilidad({ id }: { id: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['skill', id],
    queryFn: () => api.skills.get(id),
  });
  if (isLoading) return <div className="p-6 text-sm text-muted">{es.app.loading}</div>;
  if (isError || !data) return <div className="p-6 text-sm text-accent-dark">{es.app.error}</div>;
  return <HabilidadForm skill={data} />;
}
