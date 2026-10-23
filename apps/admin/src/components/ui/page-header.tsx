import { type ReactNode } from 'react';

/**
 * Compact screen header, the way Shopify tops a page: one row with the title
 * (and a short note beside it) on the left and the actions on the right,
 * with an optional second row (filters/search) as children.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-line bg-surface px-6 py-3">
      <div className="flex min-h-8 items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 className="truncate text-[16px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
          {subtitle && <p className="shrink-0 font-mono text-[11px] text-ink-3">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-shrink-0 gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
