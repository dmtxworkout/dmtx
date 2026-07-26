'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { isAdmin, useSession } from '@/lib/auth-client';
import { Sidebar } from '@/components/sidebar';
import { es } from '@/i18n/es';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace('/login');
  }, [isPending, session, router]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        {es.app.loading}
      </div>
    );
  }
  if (!session) return null;

  const role = (session.user as { role?: string | null }).role;
  if (!isAdmin(role)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center text-sm text-red-600">
        {es.login.unauthorized}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      <Sidebar user={session.user} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
