'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatMoney, historyLabel } from '@/lib/user-access';
import { formatDateEs } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export function SubscriptionHistory({ userId }: { userId: string }) {
  const q = useQuery({ queryKey: ['admin-user', userId], queryFn: () => api.subscriptions.user(userId) });
  const history = q.data?.history ?? [];

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
          <span className="text-ink-2">Suscripciones</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Historial de suscripciones</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        {q.isLoading ? (
          <div className="p-10 text-center text-sm text-muted">Cargando…</div>
        ) : q.isError || !q.data ? (
          <div className="p-10 text-center text-sm text-accent-dark">No encontrado.</div>
        ) : history.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">Sin suscripciones.</div>
        ) : (
          <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-line-2 bg-surface">
            {history.map((h, i) => {
              const hl = historyLabel(h);
              const price = h.unitAmount > 0 ? formatMoney(h.unitAmount, h.currency) : null;
              const from = h.startedAt ? formatDateEs(h.startedAt) : '—';
              const to = h.endedAt ? formatDateEs(h.endedAt) : i === 0 ? 'actual' : '—';
              return (
                <Link
                  key={h.id}
                  href={`/usuarios/${userId}/suscripciones/${h.id}`}
                  className="flex items-center gap-3 border-b border-line-3 px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-2"
                >
                  <Badge tone={hl.tone}>{hl.label}</Badge>
                  {price && <span className="font-mono text-[12px] text-ink-3">{price}</span>}
                  <span className="ml-auto font-mono text-[11px] text-muted">
                    {from} → {to}
                  </span>
                  <span className="text-faint-2">›</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
