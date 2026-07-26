import { type ReactNode } from 'react';

/** Standard screen header: title + subtitle + actions, with an optional
 *  second row (filters/search) as children. */
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-line bg-surface px-8 pb-4 pt-[22px]">
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-shrink-0 gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
