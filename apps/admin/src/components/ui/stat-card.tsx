import { MonoLabel } from './mono-label';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  delta,
  deltaTone = 'pos',
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: 'pos' | 'neg' | 'neutral';
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-[18px] py-4">
      <MonoLabel>{label}</MonoLabel>
      <span className="text-[28px] font-bold leading-none tracking-[-0.03em]">{value}</span>
      {delta && (
        <span
          className={cn(
            'font-mono text-xs font-medium',
            deltaTone === 'neg'
              ? 'text-accent-dark'
              : deltaTone === 'neutral'
                ? 'text-muted'
                : 'text-[#276b34]',
          )}
        >
          {delta}
        </span>
      )}
    </div>
  );
}
