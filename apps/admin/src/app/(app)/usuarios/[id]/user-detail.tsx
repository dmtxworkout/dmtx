'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { access, historyLabel } from '@/lib/user-access';
import { formatDateEs } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MonoLabel } from '@/components/ui/mono-label';
import { toast } from '@/components/ui/toast';

export function UserDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-user', id], queryFn: () => api.subscriptions.user(id) });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [trialDays, setTrialDays] = useState('30');
  const [untilDate, setUntilDate] = useState('');

  const loadedId = q.data?.id;
  useEffect(() => {
    if (q.data) {
      setName(q.data.name ?? '');
      setEmail(q.data.email ?? '');
    }
    // Re-seed the form only when a different user loads.
  }, [loadedId]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-user', id] });
    qc.invalidateQueries({ queryKey: ['admin-users'] });
  };

  const saveUser = useMutation({
    mutationFn: () => api.subscriptions.updateUser(id, { name: name.trim(), email: email.trim() }),
    onSuccess: () => {
      invalidate();
      toast('Datos guardados');
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'),
  });

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
      invalidate();
      toast('Acceso actualizado');
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo actualizar', 'error'),
  });

  const reset = useMutation({
    mutationFn: async () => {
      const r = await authClient.requestPasswordReset({
        email: q.data!.email,
        redirectTo: `${window.location.origin}/login`,
      });
      if (r.error) throw new Error(r.error.message ?? 'Error');
      return r;
    },
    onSuccess: () => toast('Correo de restablecimiento enviado'),
    onError: () => toast('No se pudo enviar el correo', 'error'),
  });

  const a = q.data ? access(q.data.subscription) : null;
  const dirty = q.data ? name.trim() !== (q.data.name ?? '') || email.trim() !== (q.data.email ?? '') : false;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-line bg-surface px-7 pb-4 pt-5">
        <div className="flex items-center gap-2 font-mono text-xs font-medium text-muted">
          <Link href="/usuarios" className="hover:text-ink-2">
            Usuarios
          </Link>
          <span>/</span>
          <span className="text-ink-2">Detalle</span>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{q.data?.name || q.data?.email || '…'}</h1>
          {a && <Badge tone={a.tone}>{a.label}</Badge>}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        {q.isLoading ? (
          <div className="p-10 text-center text-sm text-muted">Cargando…</div>
        ) : q.isError || !q.data ? (
          <div className="p-10 text-center text-sm text-accent-dark">Usuario no encontrado.</div>
        ) : (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
            {/* Datos */}
            <section className="flex flex-col gap-4 rounded-xl border border-line-2 bg-surface p-5">
              <MonoLabel>Datos</MonoLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-[13px] font-semibold text-ink-2">Nombre</div>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <div className="mb-1.5 text-[13px] font-semibold text-ink-2">Correo</div>
                  <Input value={email} type="email" onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-muted">
                  Registrado {formatDateEs(q.data.createdAt)} · {q.data.role === 'admin' ? 'Admin' : 'Usuario'}
                </span>
                <Button onClick={() => saveUser.mutate()} disabled={!dirty || saveUser.isPending || !name.trim() || !email.trim()}>
                  {saveUser.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </section>

            {/* Acceso */}
            <section className="flex flex-col gap-4 rounded-xl border border-line-2 bg-surface p-5">
              <div className="flex items-center gap-2">
                <MonoLabel>Acceso</MonoLabel>
                {a && (
                  <span className="font-mono text-[11px] text-muted">
                    {a.ends ? `· ${a.tone === 'canceled' ? 'venció' : 'hasta'} ${formatDateEs(a.ends)}` : a.label === 'Gratis' ? '· sin fecha' : ''}
                  </span>
                )}
              </div>

              {/* Free trial */}
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-3 bg-surface-2/40 p-3.5">
                <span className="text-[13px] font-semibold text-ink-2">Prueba gratis</span>
                <Input
                  inputMode="numeric"
                  value={trialDays}
                  onChange={(e) => setTrialDays(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-20 text-center"
                />
                <span className="text-[13px] text-muted">días</span>
                <Button
                  variant="outline"
                  className="ml-auto"
                  disabled={act.isPending || !Number(trialDays)}
                  onClick={() => act.mutate({ t: 'trial', days: Number(trialDays) })}
                >
                  Iniciar prueba
                </Button>
              </div>

              {/* Free access */}
              <div className="flex flex-col gap-3 rounded-lg border border-line-3 bg-surface-2/40 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold text-ink-2">Acceso gratis para siempre</div>
                    <div className="font-mono text-[11px] text-muted">Cortesía sin fecha de vencimiento</div>
                  </div>
                  <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate({ t: 'forever' })}>
                    Dar acceso
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-line-3 pt-3">
                  <span className="text-[13px] font-semibold text-ink-2">Gratis hasta</span>
                  <input
                    type="date"
                    value={untilDate}
                    onChange={(e) => setUntilDate(e.target.value)}
                    className="h-9 rounded-lg border border-line-2 bg-surface px-3 text-sm text-ink focus:border-accent/40 focus:outline-none"
                  />
                  <Button
                    variant="outline"
                    className="ml-auto"
                    disabled={act.isPending || !untilDate}
                    onClick={() =>
                      act.mutate({ t: 'until', until: new Date(`${untilDate}T23:59:59`).toISOString() })
                    }
                  >
                    Dar acceso
                  </Button>
                </div>
              </div>

              <button
                type="button"
                disabled={act.isPending}
                onClick={() => act.mutate({ t: 'revoke' })}
                className="self-start text-[13px] font-medium text-accent-dark hover:underline disabled:opacity-50"
              >
                Revocar acceso
              </button>
            </section>

            {/* Historial */}
            {q.data.history && q.data.history.length > 0 && (
              <section className="flex flex-col gap-3 rounded-xl border border-line-2 bg-surface p-5">
                <MonoLabel>Historial</MonoLabel>
                <div className="flex flex-col divide-y divide-line-3">
                  {q.data.history.map((h, i) => {
                    const hl = historyLabel(h);
                    const price = h.unitAmount > 0 ? `${(h.unitAmount / 100).toFixed(2)} ${h.currency.toUpperCase()}` : null;
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

            {/* Contraseña */}
            <section className="flex items-center justify-between gap-3 rounded-xl border border-line-2 bg-surface p-5">
              <div>
                <MonoLabel>Contraseña</MonoLabel>
                <p className="mt-1.5 text-[13px] text-ink-3">
                  Envía un correo para que el usuario restablezca su contraseña.
                </p>
              </div>
              <Button variant="outline" disabled={reset.isPending} onClick={() => reset.mutate()}>
                {reset.isPending ? 'Enviando…' : 'Enviar correo'}
              </Button>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
