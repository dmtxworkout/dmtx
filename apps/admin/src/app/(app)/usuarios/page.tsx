'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateEs } from '@/lib/utils';
import { access } from '@/lib/user-access';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';

const COLS = 'grid-cols-[minmax(0,2fr)_90px_130px_minmax(0,1fr)_20px] items-center gap-3 px-4';

function ini(name: string): string {
  return (name || '?')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function UsuariosPage() {
  const [search, setSearch] = useState('');
  const router = useRouter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => api.subscriptions.users(search || undefined),
    placeholderData: keepPreviousData,
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
              <span />
            </div>
            {users.map((u) => {
              const a = access(u.subscription);
              return (
                <div
                  key={u.id}
                  onClick={() => router.push(`/usuarios/${u.id}`)}
                  className={`grid cursor-pointer border-b border-line-2 py-2 text-sm transition-colors last:border-b-0 hover:bg-surface-2 ${COLS}`}
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
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge tone={a.tone}>{a.label}</Badge>
                    {a.ends ? (
                      <span className="truncate font-mono text-[11px] text-muted">
                        {a.tone === 'canceled' ? 'venció' : 'hasta'} {formatDateEs(a.ends)}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-right text-faint-2">›</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
