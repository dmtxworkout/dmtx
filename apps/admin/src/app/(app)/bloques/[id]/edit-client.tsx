'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { RutinaForm } from '@/components/rutina-form';
import { es } from '@/i18n/es';

export function EditReusableBlock({ id }: { id: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reusable-block', id],
    queryFn: () => api.reusableBlocks.get(id),
  });
  if (isLoading) return <div className="p-6 text-sm text-muted">{es.app.loading}</div>;
  if (isError || !data) return <div className="p-6 text-sm text-accent-dark">{es.app.error}</div>;
  return <RutinaForm block={data} />;
}
