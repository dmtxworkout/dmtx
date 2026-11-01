'use client';

// What all members search for, open and train: read from the daily summary.
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityReportItem } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { formatDateEs } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { MonoLabel } from '@/components/ui/mono-label';
import { PageHeader } from '@/components/ui/page-header';
import { ReportTabs } from '@/components/report-tabs';
import { toast } from '@/components/ui/toast';

const RANGES = [7, 30, 90];
const CONTENT = {
  workout: { label: 'Rutina', href: '/rutinas' },
  program: { label: 'Programa', href: '/programas' },
  skill: { label: 'Habilidad', href: '/habilidades' },
} as const;

function Ranking({
  title,
  hint,
  items,
  empty,
  link,
  note,
}: {
  title: string;
  hint?: string;
  items: ActivityReportItem[];
  empty: string;
  link?: (item: ActivityReportItem) => string;
  note?: (item: ActivityReportItem) => ReactNode;
}) {
  const max = Math.max(1, ...items.map((i) => i.total));
  return (
    <section className="rounded-xl border border-line-2 bg-surface p-5">
      <MonoLabel>{title}</MonoLabel>
      {hint && <p className="mt-1.5 text-[13px] text-ink-3">{hint}</p>}
      <div className="mt-3 flex flex-col gap-3">
        {items.length === 0 && <p className="text-[13px] text-muted">{empty}</p>}
        {items.map((i) => (
          <div key={i.key}>
            <div className="flex items-baseline justify-between gap-4 text-[13.5px]">
              <span className="min-w-0 truncate font-semibold text-ink">
                {link ? (
                  <Link href={link(i)} className="hover:text-accent-dark">
                    {i.label}
                  </Link>
                ) : (
                  i.label
                )}
                {note && <span className="ml-2 font-mono text-[11px] font-normal text-muted">{note(i)}</span>}
              </span>
              <span className="shrink-0 font-mono text-[12px] text-ink-3">
                {i.total} {i.total === 1 ? 'vez' : 'veces'} · {i.people} {i.people === 1 ? 'persona' : 'personas'}
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(i.total / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ActivityReportPage() {
  const qc = useQueryClient();
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ['activity-report', days], queryFn: () => api.reports.activity(days) });
  const refresh = useMutation({
    mutationFn: () => api.reports.refreshActivity(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activity-report'] }),
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo actualizar', 'error'),
  });
  const typeOf = new Map(q.data?.opened.map((o) => [o.key, o.type]));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Reportes"
        subtitle={q.data?.updatedAt ? `Actualizado ${formatDateEs(q.data.updatedAt)}` : 'Aún sin datos'}
        actions={
          <Button variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            {refresh.isPending ? 'Actualizando…' : 'Actualizar'}
          </Button>
        }
      >
        <ReportTabs current="actividad" />
        <div className="flex flex-wrap items-center gap-2.5">
          {RANGES.map((r) => (
            <Chip key={r} active={r === days} onClick={() => setDays(r)}>
              {r} días
            </Chip>
          ))}
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-[22px]">
        {q.isLoading ? (
          <div className="p-10 text-center text-sm text-muted">Cargando…</div>
        ) : q.isError || !q.data ? (
          <div className="p-10 text-center text-sm text-accent-dark">No se pudo cargar el reporte.</div>
        ) : (
          <div className="mx-auto grid w-full max-w-[1280px] items-start gap-5 lg:grid-cols-2">
            <Ranking title="Lo más buscado" items={q.data.searches} empty="Aún no hay búsquedas." />
            <Ranking
              title="Buscado sin resultados"
              hint="Lo que la gente quiere y no encontró."
              items={q.data.emptySearches}
              empty="Todas las búsquedas encontraron algo."
            />
            <Ranking
              title="Lo más abierto"
              items={q.data.opened}
              empty="Aún nadie ha abierto contenido."
              link={(i) => `${CONTENT[typeOf.get(i.key) ?? 'workout'].href}/${i.key}`}
              note={(i) => CONTENT[typeOf.get(i.key) ?? 'workout'].label}
            />
            <Ranking title="Lo más entrenado" hint="Sesiones terminadas por rutina." items={q.data.trained} empty="Aún no hay sesiones." link={(i) => `/rutinas/${i.key}`} />
            <Ranking title="Filtros más usados" items={q.data.filters} empty="Aún nadie ha usado filtros." />
          </div>
        )}
      </div>
    </div>
  );
}
