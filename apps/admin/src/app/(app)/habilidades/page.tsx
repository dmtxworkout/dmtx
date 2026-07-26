import { skills } from '@/lib/mock';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Thumb } from '@/components/ui/thumb';
import { MonoLabel } from '@/components/ui/mono-label';
import { cn } from '@/lib/utils';

export default function HabilidadesPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Habilidades"
        subtitle="Progresiones por niveles. Cada nivel se desbloquea al cumplir su objetivo."
        actions={<Button>Nueva habilidad</Button>}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-8 pb-10 pt-[22px]">
        {skills.map((sk) => (
          <div key={sk.name} className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line-3 bg-surface-2 px-4 py-3.5">
              <Thumb className="h-9 w-14 rounded-md" ratio="auto" />
              <div className="min-w-0">
                <div className="text-base font-bold tracking-[-0.01em]">{sk.name}</div>
                <div className="font-mono text-[11px] text-muted">{sk.meta}</div>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <Badge tone={sk.tone}>{sk.badge}</Badge>
                <span className="text-faint-2">⋯</span>
              </div>
            </div>

            <div className="flex gap-2.5 overflow-x-auto px-4 py-3.5">
              {sk.levels.map((lv) => (
                <div
                  key={lv.n}
                  className={cn(
                    'flex w-[196px] flex-shrink-0 flex-col gap-1.5 rounded-[10px] border p-3',
                    lv.done ? 'border-accent-tint bg-accent-tint/25' : 'border-line bg-surface',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] font-semibold',
                        lv.done ? 'bg-accent text-white' : 'bg-surface-2 text-muted',
                      )}
                    >
                      {lv.n}
                    </span>
                    <span className="min-w-0 truncate text-[13px] font-semibold">{lv.name}</span>
                  </div>
                  <Thumb className="h-[22px] rounded-[5px]" ratio="auto" />
                  <div className="font-mono text-[10px] text-muted">{lv.workout}</div>
                  <div className="flex items-center gap-1.5 border-t border-line-3 pt-1.5">
                    <MonoLabel className="text-[9px] tracking-[0.1em]">Desbloqueo</MonoLabel>
                    <span className="ml-auto font-mono text-[11px] font-semibold text-ink-2">
                      {lv.goal}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
