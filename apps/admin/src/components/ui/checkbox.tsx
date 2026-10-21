'use client';

import { cn } from '@/lib/utils';

/** A square tick box for table rows and bulk bars. `indeterminate` shows a dash. */
export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-[10px] leading-none transition-colors',
        on ? 'border-ink bg-ink text-white' : 'border-line-2 bg-surface hover:border-ink',
        className,
      )}
    >
      {indeterminate ? '–' : checked ? '✓' : ''}
    </button>
  );
}
