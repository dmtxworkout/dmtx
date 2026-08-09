'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminUser, UserSubscription } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { formatDateEs } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';

const COLS = 'grid-cols-[minmax(0,2fr)_90px_130px_170px_150px] items-center gap-3 px-4';

function ini(name: string): string {
  return (name || '?')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Derive a display access status from the raw subscription row. */
function access(sub: UserSubscription | null): { tone: BadgeTone; label: string; ends: string | null } {
  if (!sub) return { tone: 'neutral', label: 'Sin acceso', ends: null };
  const now = Date.now();
  const trialEnd = sub.trialEnd ? new Date(sub.trialEnd).getTime() : null;
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : null;
  if (sub.status === 'trialing' && trialEnd && trialEnd > now)
    return { tone: 'trialing', label: 'Prueba', ends: sub.trialEnd };
  if (sub.status === 'active' && (periodEnd === null || periodEnd > now))
    return {
      tone: 'active',
      label: sub.comp ? (periodEnd ? 'Cortesía' : 'Gratis') : 'Activa',
      ends: sub.currentPeriodEnd,
    };
  if (sub.status === 'trialing') return { tone: 'canceled', label: 'Prueba vencida', ends: sub.trialEnd };
  return { tone: 'canceled', label: 'Sin acceso', ends: sub.currentPeriodEnd ?? sub.trialEnd };
}

export default function UsuariosPage() {
  const [search, setSearch] = useState('');
  const [manage, setManage] = useState<AdminUser | null>(null);
  const [trialDays, setTrialDays] = useState('30');
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => api.subscriptions.users(search || undefined),
    placeholderData: keepPreviousData,
  });

  const act = useMutation({
    mutationFn: (v: { userId: string; action: 'trial' | 'grant' | 'revoke'; days?: number }) => {
      if (v.action === 'trial') return api.subscriptions.trial(v.userId, v.days ?? 30);
      if (v.action === 'grant') return api.subscriptions.grant(v.userId, null);
      return api.subscriptions.revoke(v.userId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast('Acceso actualizado');
      setManage(null);
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo actualizar', 'error'),
  });

  const users = data?.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Usuarios"
        subtitle={data ? `${users.length} usuario${users.length === 1 ? '' : 's'}` : 'Usuarios'}
      >
        <div className="flex h-9 w-[300px] items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5">
          <span className="text-muted-2">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o correo"
            className="h-full flex-1 bg-transparent text-sm text-ink placeholder:text-muted-2 focus:outline-none"
          />
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-[22px]">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted">Cargando…</div>
        ) : isError ? (
          <div className="p-10 text-center text-sm text-accent-dark">Ocurrió un error.</div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">No hay usuarios.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div
              className={`grid border-b border-line bg-surface-2 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-2 ${COLS}`}
            >
              <span>Usuario</span>
              <span>Rol</span>
              <span>Registrado</span>
              <span>Acceso</span>
              <span className="text-right">Acciones</span>
            </div>
            {users.map((u) => {
              const a = access(u.subscription);
              return (
                <div
                  key={u.id}
                  className={`grid border-b border-line-2 py-2 text-sm last:border-b-0 ${COLS}`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f0ece4] text-[11px] font-semibold text-[#6b6760]">
                      {ini(u.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink">{u.name || '—'}</div>
                      <div className="truncate font-mono text-[11px] text-muted">{u.email}</div>
                    </div>
                  </div>
                  <span className="text-[13px] text-ink-2">{u.role === 'admin' ? 'Admin' : 'Usuario'}</span>
                  <span className="font-mono text-[12px] text-muted">{formatDateEs(u.createdAt)}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={a.tone}>{a.label}</Badge>
                    {a.ends ? (
                      <span className="font-mono text-[11px] text-muted">
                        · {a.tone === 'canceled' ? 'venció' : 'hasta'} {formatDateEs(a.ends)}
                      </span>
                    ) : a.label === 'Gratis' ? (
                      <span className="font-mono text-[11px] text-muted">· sin fecha</span>
                    ) : null}
                  </span>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTrialDays('30');
                        setManage(u);
                      }}
                    >
                      Gestionar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={manage !== null}
        onClose={() => setManage(null)}
        title={manage ? `Acceso · ${manage.name || manage.email}` : 'Acceso'}
        className="max-w-md"
      >
        {manage && (
          <div className="flex flex-col gap-5 p-5">
            <div className="flex items-center gap-2 text-[13px] text-ink-2">
              <span>Estado actual:</span>
              <Badge tone={access(manage.subscription).tone}>{access(manage.subscription).label}</Badge>
            </div>

            {/* Free trial */}
            <div className="flex flex-col gap-2 rounded-xl border border-line-2 bg-surface-2/40 p-3.5">
              <div className="text-[13px] font-semibold text-ink-2">Prueba gratis</div>
              <div className="flex items-center gap-2">
                <Input
                  inputMode="numeric"
                  value={trialDays}
                  onChange={(e) => setTrialDays(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-20 text-center"
                />
                <span className="text-[13px] text-muted">días</span>
                <Button
                  className="ml-auto"
                  disabled={act.isPending || !Number(trialDays)}
                  onClick={() =>
                    act.mutate({ userId: manage.id, action: 'trial', days: Number(trialDays) })
                  }
                >
                  Iniciar prueba
                </Button>
              </div>
            </div>

            {/* Free forever */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line-2 bg-surface-2/40 p-3.5">
              <div>
                <div className="text-[13px] font-semibold text-ink-2">Acceso gratis para siempre</div>
                <div className="font-mono text-[11px] text-muted">Cortesía sin fecha de vencimiento</div>
              </div>
              <Button
                variant="outline"
                disabled={act.isPending}
                onClick={() => act.mutate({ userId: manage.id, action: 'grant' })}
              >
                Dar acceso
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-line-3 pt-4">
              <button
                type="button"
                disabled={act.isPending}
                onClick={() => act.mutate({ userId: manage.id, action: 'revoke' })}
                className="text-[13px] font-medium text-accent-dark hover:underline disabled:opacity-50"
              >
                Revocar acceso
              </button>
              <Button variant="outline" onClick={() => setManage(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
