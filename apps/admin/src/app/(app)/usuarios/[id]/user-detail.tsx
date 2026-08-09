'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { access, formatMoney, planLabel } from '@/lib/user-access';
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

  const loadedId = q.data?.id;
  useEffect(() => {
    if (q.data) {
      setName(q.data.name ?? '');
      setEmail(q.data.email ?? '');
    }
    // Re-seed the form only when a different user loads.
  }, [loadedId]);

  const saveUser = useMutation({
    mutationFn: () => api.subscriptions.updateUser(id, { name: name.trim(), email: email.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-user', id] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast('Datos guardados');
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'No se pudo guardar', 'error'),
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

  const sub = q.data?.subscription ?? null;
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

            {/* Suscripción (read-only summary — managed from Suscripciones) */}
            <section className="flex flex-col gap-3 rounded-xl border border-line-2 bg-surface p-5">
              <div className="flex items-center justify-between">
                <MonoLabel>Suscripción</MonoLabel>
                <Link
                  href={`/suscripciones/${id}`}
                  className="font-mono text-[11px] font-medium text-accent-dark hover:underline"
                >
                  Gestionar suscripción →
                </Link>
              </div>
              {sub && a ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
                  <Badge tone={a.tone}>{a.label}</Badge>
                  <span className="text-ink-2">{planLabel(sub)}</span>
                  <span className="font-mono text-ink-3">{formatMoney(sub.unitAmount, sub.currency)}</span>
                  {a.ends && (
                    <span className="font-mono text-[11px] text-muted">
                      · {a.tone === 'canceled' ? 'venció' : 'hasta'} {formatDateEs(a.ends)}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-[13px] text-muted">Sin suscripción activa.</p>
              )}
            </section>

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
