'use client';

// The left column of a user's page: what they've done, what they looked at
// without doing it, what they search for, and all of it in order.
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { UserActivity as Activity } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { cn, formatDateEs } from '@/lib/utils';
import { MonoLabel } from '@/components/ui/mono-label';
import { StatCard } from '@/components/ui/stat-card';

const CONTENT = {
  workout: { label: 'Rutina', href: '/rutinas' },
  program: { label: 'Programa', href: '/programas' },
  skill: { label: 'Habilidad', href: '/habilidades' },
} as const;

const TIMELINE_LABEL = { session: 'Terminó', start: 'Empezó', view: 'Abrió', search: 'Buscó' } as const;
const TIMELINE_FILTERS = [
  { value: 'all', label: 'Todo' },
  { value: 'session', label: 'Sesiones' },
  { value: 'view', label: 'Abrió' },
  { value: 'start', label: 'Empezó' },
  { value: 'search', label: 'Búsquedas' },
] as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function ago(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return minutes < 2 ? 'hace un momento' : `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${plural(hours, 'hora', 'horas')}`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `hace ${plural(days, 'día', 'días')}` : formatDateEs(iso);
}

/** For the stat card, where a date wouldn't fit on one line. */
function sinceShort(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return 'Ahora';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return plural(Math.floor(minutes / 60), 'hora', 'horas');
  return plural(Math.floor(minutes / 1440), 'día', 'días');
}

function trained(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ''}`.trim();
}

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line-2 bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonoLabel>{title}</MonoLabel>
        {action}
      </div>
      {hint && <p className="mt-1.5 text-[13px] text-ink-3">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ name, href, meta, children }: { name: string; href?: string | null; meta: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line-4 py-2.5 first:border-0">
      <div className="min-w-0 flex-1">
        {href ? (
          <Link href={href} className="block truncate text-[13.5px] font-semibold text-ink hover:text-accent-dark">
            {name}
          </Link>
        ) : (
          <span className="block truncate text-[13.5px] font-semibold text-ink">{name}</span>
        )}
        {children}
      </div>
      <span className="shrink-0 text-right font-mono text-[11px] text-muted">{meta}</span>
    </div>
  );
}

function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  return (
    <div className="mt-1.5 flex items-center gap-2.5">
      <div className="h-1 w-32 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${total ? Math.min(100, (done / total) * 100) : 0}%` }} />
      </div>
      <span className="font-mono text-[11px] text-muted">{label}</span>
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-[13px] text-muted">{children}</p>;
const Subhead = ({ children }: { children: ReactNode }) => <h3 className="mb-1 mt-4 text-[13px] font-semibold text-ink-2 first:mt-0">{children}</h3>;

function Done({ data }: { data: Activity }) {
  if (!data.workouts.length && !data.programs.length && !data.skills.length) return <Empty>Aún no ha terminado ninguna sesión.</Empty>;
  return (
    <>
      {data.programs.length > 0 && <Subhead>Programas</Subhead>}
      {data.programs.map((p) => (
        <Row key={p.id} name={p.name} href={`/programas/${p.id}`} meta={`${plural(p.sessions, 'sesión', 'sesiones')} · ${ago(p.lastAt)}`}>
          <Progress done={p.daysDone} total={p.daysTotal} label={`${p.daysDone} de ${plural(p.daysTotal, 'día', 'días')}`} />
        </Row>
      ))}
      {data.skills.length > 0 && <Subhead>Habilidades</Subhead>}
      {data.skills.map((s) => (
        <Row
          key={s.id}
          name={s.name}
          href={`/habilidades/${s.id}`}
          meta={[plural(s.sessions, 'sesión', 'sesiones'), s.lastAt && ago(s.lastAt)].filter(Boolean).join(' · ')}
        >
          <Progress done={s.level} total={s.levels} label={`Nivel ${s.level} de ${s.levels}`} />
        </Row>
      ))}
      {data.workouts.length > 0 && <Subhead>Rutinas</Subhead>}
      {data.workouts.map((w) => (
        <Row
          key={w.id ?? w.name}
          name={w.name}
          href={w.id && `/rutinas/${w.id}`}
          meta={[plural(w.sessions, 'sesión', 'sesiones'), w.minutes ? trained(w.minutes) : null, ago(w.lastAt)].filter(Boolean).join(' · ')}
        />
      ))}
    </>
  );
}

function Timeline({ items }: { items: Activity['timeline'] }) {
  const [filter, setFilter] = useState<(typeof TIMELINE_FILTERS)[number]['value']>('all');
  const shown = filter === 'all' ? items : items.filter((i) => i.type === filter);
  return (
    <Section
      title="Historial"
      action={
        <div className="inline-flex rounded-lg border border-line-2 bg-surface p-0.5">
          {TIMELINE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn('rounded-md px-2.5 py-1 text-[12px] font-semibold', filter === f.value ? 'bg-ink text-white' : 'text-ink-3 hover:text-ink')}
            >
              {f.label}
            </button>
          ))}
        </div>
      }
    >
      {shown.length === 0 ? (
        <Empty>Nada por aquí todavía.</Empty>
      ) : (
        shown.map((t, i) => (
          <div key={i} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-line-4 py-2 first:border-0">
            <span className={cn('font-mono text-[11px]', t.type === 'session' ? 'font-medium text-accent-dark' : 'text-muted')}>{TIMELINE_LABEL[t.type]}</span>
            <span className="truncate text-[13px] text-ink-2">
              {t.title}
              {t.detail && <span className="text-muted"> · {t.detail}</span>}
            </span>
            <span className="font-mono text-[11px] text-muted">{ago(t.at)}</span>
          </div>
        ))
      )}
    </Section>
  );
}

export function UserActivity({ data, isLoading, isError }: { data?: Activity; isLoading: boolean; isError: boolean }) {
  if (isLoading) return <div className="p-10 text-center text-sm text-muted">Cargando…</div>;
  if (isError || !data) return <div className="p-10 text-center text-sm text-accent-dark">No se pudo cargar la actividad.</div>;
  const { summary } = data;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Sesiones" value={String(summary.sessions)} />
        <StatCard label="Últimos 30 días" value={String(summary.sessions30d)} />
        <StatCard label="Tiempo entrenado" value={trained(summary.minutes)} />
        <StatCard label="Última actividad" value={summary.lastActiveAt ? sinceShort(summary.lastActiveAt) : '—'} />
      </div>

      <Section title="Qué ha hecho">
        <Done data={data} />
      </Section>

      <Section title="Qué le interesa" hint="Lo abrió o lo empezó, pero aún no termina ninguna sesión.">
        {data.interest.length === 0 ? (
          <Empty>Nada pendiente.</Empty>
        ) : (
          data.interest.map((i) => (
            <Row
              key={`${i.type}:${i.id}`}
              name={i.name}
              href={`${CONTENT[i.type].href}/${i.id}`}
              meta={[i.views ? `Abrió ${plural(i.views, 'vez', 'veces')}` : null, i.starts ? `Empezó ${plural(i.starts, 'vez', 'veces')}` : null, ago(i.lastAt)].filter(Boolean).join(' · ')}
            >
              <span className="font-mono text-[11px] text-muted">{CONTENT[i.type].label}</span>
            </Row>
          ))
        )}
      </Section>

      <Section title="Qué busca">
        {data.searches.length === 0 ? (
          <Empty>Aún no ha buscado nada.</Empty>
        ) : (
          data.searches.map((s, i) => (
            <Row key={i} name={s.query ?? 'Solo filtros'} meta={ago(s.at)}>
              <span className={cn('font-mono text-[11px]', s.results ? 'text-muted' : 'font-medium text-accent-dark')}>
                {[s.results ? plural(s.results, 'resultado', 'resultados') : 'Sin resultados', ...s.filters].join(' · ')}
              </span>
            </Row>
          ))
        )}
      </Section>

      <Timeline items={data.timeline} />
    </div>
  );
}

export const useUserActivity = (id: string) => useQuery({ queryKey: ['admin-user-activity', id], queryFn: () => api.subscriptions.activity(id) });
