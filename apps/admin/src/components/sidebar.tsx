'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth-client';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/logo';
import { MonoLabel } from '@/components/ui/mono-label';

const groups = [
  { label: es.nav.sections.principal, items: [{ href: '/', label: es.nav.dashboard }] },
  {
    label: es.nav.sections.contenido,
    items: [
      { href: '/rutinas', label: es.nav.workouts },
      { href: '/bloques', label: es.nav.reusableBlocks },
      { href: '/ejercicios', label: es.nav.exercises },
      { href: '/programas', label: es.nav.programs },
      { href: '/habilidades', label: es.nav.skills },
      { href: '/colecciones', label: es.nav.collections },
    ],
  },
  {
    label: es.nav.sections.catalogo,
    items: [
      { href: '/taxonomia', label: es.nav.taxonomy },
      { href: '/biblioteca', label: es.nav.media },
    ],
  },
  {
    label: es.nav.sections.negocio,
    items: [
      { href: '/usuarios', label: es.nav.users },
      { href: '/reportes', label: es.nav.reports },
    ],
  },
];

function initials(name?: string | null, email?: string): string {
  const src = (name ?? email ?? '').trim();
  if (!src) return 'DM';
  const parts = src.split(/\s+/);
  const combined =
    parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : src.slice(0, 2);
  return combined.toUpperCase() || 'DM';
}

export function Sidebar({ user }: { user: { email: string; name?: string | null } }) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <aside className="flex w-[244px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2.5 px-[18px] pb-4 pt-5">
        <Logo />
        <MonoLabel className="text-[11px] tracking-[0.12em] text-muted">Admin</MonoLabel>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto px-2.5 pb-3 pt-1.5">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-0.5">
            <MonoLabel className="px-2.5 pb-1.5">{g.label}</MonoLabel>
            {g.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-sm',
                    active
                      ? 'bg-[#f3efe8] font-semibold text-ink'
                      : 'font-medium text-ink-3 hover:bg-surface-2',
                  )}
                >
                  <span
                    className={cn(
                      'block h-1.5 w-1.5 shrink-0 rounded-sm',
                      active ? 'bg-accent' : 'bg-[#d8d2c7]',
                    )}
                  />
                  <span className="min-w-0 truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <button
        onClick={async () => {
          await signOut();
          router.replace('/login');
        }}
        title={es.app.signOut}
        className="flex items-center gap-2.5 border-t border-line-3 px-3.5 py-3 text-left hover:bg-surface-2"
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-ink text-xs font-semibold text-white">
          {initials(user.name, user.email)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold text-ink">
            {user.name ?? user.email}
          </span>
          <span className="block text-[11px] text-muted">{es.nav.role}</span>
        </span>
        <span className="ml-auto shrink-0 text-[13px] text-faint">⏎</span>
      </button>
    </aside>
  );
}
