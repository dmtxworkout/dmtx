'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { access, formatMoney, historyLabel, planLabel } from '@/lib/user-access';
import { cn, formatDateEs } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MonoLabel } from '@/components/ui/mono-label';
import { toast } from '@/components/ui/toast';

export function SubscriptionDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-user', id], queryFn: () => api.subscriptions.user(id) });

  const [trialDays, setTrialDays] = useState('30');
  const [compMode, setCompMode] = useState<'forever' | 'until'>('forever');
  const [untilDate, setUntilDate] = useState('');

  const act = useMutation({
    mutationFn: (
      v:
        | { t: 'trial'; days: number }
        | { t: 'forever' }
        | { t: 'until'; until: string }
        | { t: 'revoke' },
    ) => {
      if (v.t === 'trial') return api.subscriptions.trial(id, v.days);
      if (v.t === 'forever') return api.subscriptions.grant(id, {});
      if (v.t === 'until') return api.subscriptions.grant(id, { until: v.until });
      return api.subscriptions.revoke(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-user', id] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast('Suscripción actualizada');
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo actualizar', 'error'),
  });

  const sub = q.data?.subscription ?? null;
  const a = sub ? access(sub) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-line bg-surface px-7 pb-4 pt-5">
        <div className="flex items-center gap-2 font-mono text-xs font-medium text-muted">
          <Link href="/suscripciones" className="hover:text-ink-2">
            Suscripciones
          </Link>
          <span>/</span>
          <span className="text-ink-2">Detalle</span>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{q.data?.name || q.data?.email || '…'}</h1>
          {a && <Badge tone={a.tone}>{a.label}</Badge>}
        </div>
        {q.data && (
          <Link href={`/usuarios/${id}`} className="mt-1 inline-block font-mono text-[11px] text-muted hover:text-ink-2">
            {q.data.email} · ver perfil →
          </Link>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        {q.isLoading ? (
          <div className="p-10 text-center text-sm text-muted">Cargando…</div>
        ) : q.isError || !q.data ? (
          <div className="p-10 text-center text-sm text-accent-dark">No encontrado.</div>
        ) : (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
            {/* Current subscription */}
            <section className="flex flex-col gap-3 rounded-xl border border-line-2 bg-surface p-5">
              <MonoLabel>Suscripción actual</MonoLabel>
              {sub ? (
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                  <Field label="Plan" value={planLabel(sub)} />
                  <Field label="Precio" value={formatMoney(sub.unitAmount, sub.currency)} mono />
                  <Field label="Estado" value={a?.label ?? '—'} />
                  <Field label="Empezó" value={sub.startedAt ? formatDateEs(sub.startedAt) : '—'} mono />
                  <Field label={a?.tone === 'canceled' ? 'Venció' : 'Vence'} value={a?.ends ? formatDateEs(a.ends) : '—'} mono />
                  <Field label="Próximo cargo" value={sub.nextChargeDate ? formatDateEs(sub.nextChargeDate) : '—'} mono />
                </div>
              ) : (
                <p className="text-[13px] text-muted">Sin suscripción activa.</p>
              )}
            </section>

            {/* Manage access */}
            <section className="flex flex-col gap-4 rounded-xl border border-line-2 bg-surface p-5">
              <MonoLabel>Gestionar acceso</MonoLabel>

              {/* Trial: a temporary free trial period. */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-3 bg-surface-2/40 p-3.5">
                <div>
                  <div className="text-[13px] font-semibold text-ink-2">Prueba gratis</div>
                  <div className="font-mono text-[11px] text-muted">Periodo de prueba temporal</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Input
                    inputMode="numeric"
                    value={trialDays}
                    onChange={(e) => setTrialDays(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-16 text-center"
                  />
                  <span className="text-[13px] text-muted">días</span>
                  <Button
                    variant="outline"
                    disabled={act.isPending || !Number(trialDays)}
                    onClick={() => act.mutate({ t: 'trial', days: Number(trialDays) })}
                  >
                    Iniciar prueba
                  </Button>
                </div>
              </div>

              {/* Comp: a courtesy grant — forever or until a date. */}
              <div className="flex flex-col gap-3 rounded-lg border border-line-3 bg-surface-2/40 p-3.5">
                <div>
                  <div className="text-[13px] font-semibold text-ink-2">Cortesía (acceso gratis)</div>
                  <div className="font-mono text-[11px] text-muted">Regala acceso sin costo</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg border border-line-2 bg-surface p-0.5">
                    {(['forever', 'until'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setCompMode(m)}
                        className={cn(
                          'rounded-md px-3 py-1 text-[12px] font-semibold',
                          compMode === m ? 'bg-ink text-white' : 'text-ink-3 hover:text-ink',
                        )}
                      >
                        {m === 'forever' ? 'Para siempre' : 'Hasta una fecha'}
                      </button>
                    ))}
                  </div>
                  {compMode === 'until' && (
                    <input
                      type="date"
                      value={untilDate}
                      onChange={(e) => setUntilDate(e.target.value)}
                      className="h-9 rounded-lg border border-line-2 bg-surface px-3 text-sm text-ink focus:border-accent/40 focus:outline-none"
                    />
                  )}
                  <Button
                    variant="outline"
                    className="ml-auto"
                    disabled={act.isPending || (compMode === 'until' && !untilDate)}
                    onClick={() =>
                      compMode === 'forever'
                        ? act.mutate({ t: 'forever' })
                        : act.mutate({ t: 'until', until: new Date(`${untilDate}T23:59:59`).toISOString() })
                    }
                  >
                    Dar acceso
                  </Button>
                </div>
              </div>

              <button
                type="button"
                disabled={act.isPending || !sub}
                onClick={() => act.mutate({ t: 'revoke' })}
                className="self-start text-[13px] font-medium text-accent-dark hover:underline disabled:opacity-50"
              >
                Revocar acceso
              </button>
            </section>

            {/* History */}
            {q.data.history && q.data.history.length > 0 && (
              <section className="flex flex-col gap-3 rounded-xl border border-line-2 bg-surface p-5">
                <MonoLabel>Historial</MonoLabel>
                <div className="flex flex-col divide-y divide-line-3">
                  {q.data.history.map((h, i) => {
                    const hl = historyLabel(h);
                    const price = h.unitAmount > 0 ? formatMoney(h.unitAmount, h.currency) : null;
                    const from = h.startedAt ? formatDateEs(h.startedAt) : '—';
                    const to = h.endedAt ? formatDateEs(h.endedAt) : i === 0 ? 'actual' : '—';
                    return (
                      <div key={i} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Badge tone={hl.tone}>{hl.label}</Badge>
                          {price && <span className="font-mono text-[12px] text-ink-3">{price}</span>}
                        </div>
                        <span className="font-mono text-[11px] text-muted">
                          {from} → {to}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="mb-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-2">
        {label}
      </div>
      <div className={`text-[13px] text-ink ${mono ? 'font-mono' : 'font-semibold'}`}>{value}</div>
    </div>
  );
}
