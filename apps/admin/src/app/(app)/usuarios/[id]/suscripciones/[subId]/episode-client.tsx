'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatMoney, historyLabel, planLabel } from '@/lib/user-access';
import { formatDateEs } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { MonoLabel } from '@/components/ui/mono-label';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-2">
        {label}
      </div>
      <div className="font-mono text-[13px] text-ink">{value}</div>
    </div>
  );
}

export function EpisodeDetail({ userId, subId }: { userId: string; subId: string }) {
  const q = useQuery({ queryKey: ['admin-user', userId], queryFn: () => api.subscriptions.user(userId) });
  const ep = q.data?.history?.find((h) => h.id === subId) ?? null;
  const d = (s: string | null) => (s ? formatDateEs(s) : '—');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-line bg-surface px-7 pb-4 pt-5">
        <div className="flex items-center gap-2 font-mono text-xs font-medium text-muted">
          <Link href="/usuarios" className="hover:text-ink-2">
            Usuarios
          </Link>
          <span>/</span>
          <Link href={`/usuarios/${userId}`} className="hover:text-ink-2">
            {q.data?.name || 'Detalle'}
          </Link>
          <span>/</span>
          <Link href={`/usuarios/${userId}/suscripciones`} className="hover:text-ink-2">
            Suscripciones
          </Link>
          <span>/</span>
          <span className="text-ink-2">Episodio</span>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Detalle de la suscripción</h1>
          {ep && <Badge tone={historyLabel(ep).tone}>{historyLabel(ep).label}</Badge>}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        {q.isLoading ? (
          <div className="p-10 text-center text-sm text-muted">Cargando…</div>
        ) : !ep ? (
          <div className="p-10 text-center text-sm text-accent-dark">Episodio no encontrado.</div>
        ) : (
          <div className="mx-auto w-full max-w-2xl">
            <section className="flex flex-col gap-4 rounded-xl border border-line-2 bg-surface p-5">
              <MonoLabel>Detalle</MonoLabel>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                <Field label="Plan" value={planLabel(ep)} />
                <Field label="Precio" value={formatMoney(ep.unitAmount, ep.currency)} />
                <Field label="Estado" value={historyLabel(ep).label} />
                <Field label="Empezó" value={d(ep.startedAt)} />
                <Field label="Terminó" value={d(ep.endedAt)} />
                <Field label="Fin de prueba" value={d(ep.trialEnd)} />
                <Field label="Periodo desde" value={d(ep.currentPeriodStart)} />
                <Field label="Periodo hasta" value={d(ep.currentPeriodEnd)} />
                <Field label="Cancelada" value={d(ep.canceledAt)} />
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
