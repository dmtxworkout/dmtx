import Link from 'next/link';
import { cn } from '@/lib/utils';

const TABS = [
  { value: 'ingresos', label: 'Ingresos', href: '/reportes' },
  { value: 'actividad', label: 'Actividad', href: '/reportes/actividad' },
] as const;

export function ReportTabs({ current }: { current: (typeof TABS)[number]['value'] }) {
  return (
    <div className="inline-flex self-start rounded-lg border border-line-2 bg-surface p-0.5">
      {TABS.map((t) => (
        <Link
          key={t.value}
          href={t.href}
          className={cn('rounded-md px-3 py-1 text-[12px] font-semibold', current === t.value ? 'bg-ink text-white' : 'text-ink-3 hover:text-ink')}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
