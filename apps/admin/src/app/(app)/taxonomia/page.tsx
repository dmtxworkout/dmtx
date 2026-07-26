import { equipmentList, muscleGroups, musclesOfGroup } from '@/lib/mock';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function AddRow({ label }: { label: string }) {
  return (
    <div className="px-4 py-3">
      <span className="inline-flex h-[30px] items-center rounded-[7px] border border-dashed border-line-2 bg-surface-3 px-2.5 text-[13px] font-semibold text-ink-3">
        {label}
      </span>
    </div>
  );
}

export default function TaxonomiaPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Músculos y equipo"
        subtitle="La taxonomía que alimenta los filtros de la app y del editor de ejercicios."
        actions={<Button variant="outline">Ver uso en ejercicios</Button>}
      />

      <div className="min-h-0 flex-1 overflow-auto px-8 pb-10 pt-[22px]">
        <div className="grid min-w-[880px] grid-cols-3 items-start gap-4">
          {/* Grupos musculares */}
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line-3 bg-surface-2 px-4 py-3.5">
              <span className="text-[15px] font-bold">Grupos musculares</span>
              <span className="font-mono text-[11px] text-muted-2">{muscleGroups.length}</span>
            </div>
            {muscleGroups.map((g) => (
              <div
                key={g.name}
                className={cn(
                  'flex items-center gap-2.5 border-b border-line-4 px-4 py-2.5',
                  g.active && 'bg-[#f3efe8]',
                )}
              >
                <span
                  className={cn(
                    'block h-1.5 w-1.5 shrink-0 rounded-sm',
                    g.active ? 'bg-accent' : 'bg-[#d8d2c7]',
                  )}
                />
                <span className={cn('min-w-0 flex-1 truncate text-sm', g.active && 'font-semibold')}>
                  {g.name}
                </span>
                <span className="font-mono text-[11px] text-muted">{g.n}</span>
              </div>
            ))}
            <AddRow label="+ Grupo" />
          </div>

          {/* Músculos del grupo */}
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line-3 bg-surface-2 px-4 py-3.5">
              <span className="text-[15px] font-bold">Músculos · Espalda</span>
              <span className="font-mono text-[11px] text-muted-2">{musclesOfGroup.length}</span>
            </div>
            {musclesOfGroup.map((m) => (
              <div
                key={m.name}
                className="flex items-center gap-2.5 border-b border-line-4 px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                <span className="font-mono text-[11px] text-muted">{m.n} ejerc.</span>
                <span className="text-[13px] text-faint-2">⋯</span>
              </div>
            ))}
            <AddRow label="+ Músculo" />
          </div>

          {/* Equipo */}
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line-3 bg-surface-2 px-4 py-3.5">
              <span className="text-[15px] font-bold">Equipo</span>
              <span className="font-mono text-[11px] text-muted-2">{equipmentList.length}</span>
            </div>
            {equipmentList.map((e) => (
              <div
                key={e.name}
                className="flex items-center gap-2.5 border-b border-line-4 px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{e.name}</span>
                <span className="font-mono text-[11px] text-muted">{e.n} ejerc.</span>
                <span className="text-[13px] text-faint-2">⋯</span>
              </div>
            ))}
            <AddRow label="+ Equipo" />
          </div>
        </div>
      </div>
    </div>
  );
}
