'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth-client';
import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/ejercicios', label: es.nav.exercises },
  { href: '/rutinas', label: es.nav.workouts },
  { href: '/programas', label: es.nav.programs },
  { href: '/habilidades', label: es.nav.skills },
  { href: '/colecciones', label: es.nav.collections },
  { href: '/taxonomia', label: es.nav.taxonomy },
  { href: '/biblioteca', label: es.nav.media },
  { href: '/suscripciones', label: es.nav.subscriptions },
  { href: '/reportes', label: es.nav.reports },
];

export function Sidebar({ user }: { user: { email: string; name?: string | null } }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="px-4 py-4 text-lg font-semibold">{es.app.name}</div>
      <nav className="flex-1 space-y-0.5 px-2">
        {nav.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'block rounded-md px-3 py-2 text-sm',
                active ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-100 p-3">
        <div className="mb-2 truncate px-1 text-xs text-zinc-500">{user.email}</div>
        <button
          onClick={async () => {
            await signOut();
            router.replace('/login');
          }}
          className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100"
        >
          {es.app.signOut}
        </button>
      </div>
    </aside>
  );
}
