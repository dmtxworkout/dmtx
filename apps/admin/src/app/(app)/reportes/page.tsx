import { reportStats, revenue } from '@/lib/mock';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { StatCard } from '@/components/ui/stat-card';

const periods = ['12 meses', 'Trimestre', 'Mes', 'Personalizado'];

export default function ReportesPage() {
  const max = Math.max(...revenue.map((r) => r.v));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Reportes"
        subtitle="Agosto 2025 – julio 2026 · datos de suscripciones y pagos"
        actions={<Button variant="outline">Descargar CSV</Button>}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          {periods.map((p, i) => (
            <Chip key={p} active={i === 0}>
              {p}
            </Chip>
          ))}
          <span className="ml-auto font-mono text-xs font-medium text-muted">
            Actualizado hace 12 min
          </span>
        </div>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-8 pb-10 pt-[22px]">
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {reportStats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} delta={s.delta} deltaTone={s.tone} />
          ))}
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface px-5 pb-3.5 pt-[18px]">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-bold">Ingresos por mes</h2>
            <div className="flex items-center gap-3.5 font-mono text-[11px] font-medium text-ink-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="block h-2.5 w-2.5 rounded-sm bg-accent" />
                Suscripciones
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="block h-2.5 w-2.5 rounded-sm bg-[#e6d3c6]" />
                Anuales
              </span>
            </div>
          </div>
          <div className="grid h-[190px] grid-cols-12 items-end gap-2.5">
            {revenue.map((r) => (
              <div key={r.m} className="flex h-full flex-col items-center justify-end gap-2">
                <span className="font-mono text-[10px] text-muted">${r.v}k</span>
                <div className="flex w-full flex-col justify-end" style={{ height: `${(r.v / max) * 100}%` }}>
                  <div className="rounded-t-[4px] bg-[#e6d3c6]" style={{ height: '18%' }} />
                  <div className="flex-1 bg-accent" style={{ borderRadius: '0 0 2px 2px' }} />
                </div>
                <span className="font-mono text-[10px] font-medium text-muted-2">{r.m}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
