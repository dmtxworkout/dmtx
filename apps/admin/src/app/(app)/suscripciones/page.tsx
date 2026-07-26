import { billingStats, subs } from '@/lib/mock';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';

const COLS =
  'grid-cols-[minmax(0,1.6fr)_120px_100px_120px_120px_150px] gap-3.5 px-[18px]';

function ini(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export default function SuscripcionesPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Suscripciones"
        subtitle="1 842 activas · 34 en pausa · 9 pagos fallidos"
        actions={
          <>
            <Button variant="outline">Pagos fallidos (9)</Button>
            <Button>Nueva cortesía</Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-8 pb-10 pt-[22px]">
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {billingStats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} delta={s.delta} deltaTone={s.tone} />
          ))}
        </div>

        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <div className={`grid min-w-[1000px] ${COLS} border-b border-line-3 bg-surface-2 py-2.5`}>
            {['Suscriptor', 'Plan', 'Precio', 'Próximo cargo', 'Estado', 'Acciones'].map((h, i) => (
              <span
                key={h}
                className={cnHead(i)}
              >
                {h}
              </span>
            ))}
          </div>
          {subs.map((s) => (
            <div
              key={s.email}
              className={`grid min-w-[1000px] ${COLS} items-center border-b border-line-4 py-2.5 last:border-0`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f0ece4] text-[11px] font-semibold text-[#6b6760]">
                  {ini(s.name)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{s.name}</div>
                  <div className="truncate font-mono text-[11px] text-muted">{s.email}</div>
                </div>
              </div>
              <span className="text-[13px] text-ink-2">{s.plan}</span>
              <span className="text-right font-mono text-[13px] font-medium">{s.price}</span>
              <span className="text-right font-mono text-[12px] text-ink-3">{s.next}</span>
              <span>
                <Badge tone={s.tone}>{s.badge}</Badge>
              </span>
              <div className="flex justify-end gap-1.5">
                <Button variant="outline" size="sm">
                  {s.action}
                </Button>
                <span className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[13px] text-faint">
                  ⋯
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function cnHead(i: number): string {
  const base = 'font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-2';
  return i === 2 || i === 3 || i === 5 ? `${base} text-right` : base;
}
