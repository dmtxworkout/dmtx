'use client';

import Link from 'next/link';
import { useSession } from '@/lib/auth-client';
import { attentionItems, dashStats, publishedItems, resumeCards } from '@/lib/mock';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { MonoLabel } from '@/components/ui/mono-label';
import { Badge } from '@/components/ui/badge';
import { Thumb } from '@/components/ui/thumb';

function today(): string {
  const s = new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function PanelPage() {
  const { data: session } = useSession();
  const first = (session?.user.name ?? '').split(' ')[0];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="flex items-end justify-between gap-6 border-b border-line bg-surface px-8 pb-5 pt-[26px]">
        <div>
          <div className="mb-2 font-mono text-xs font-medium text-muted">{today()}</div>
          <h1 className="text-[28px] font-bold tracking-[-0.025em]">
            Buenas{first ? `, ${first}` : ''}
          </h1>
          <p className="mt-1.5 text-sm text-ink-3">
            4 rutinas en borrador y 2 programas esperan revisión.
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button variant="outline">Subir video</Button>
          <Link href="/rutinas">
            <Button>Nueva rutina</Button>
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-[26px] px-8 pb-10 pt-6">
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {dashStats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} delta={s.delta} deltaTone={s.tone} />
          ))}
        </div>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold">Continuar donde lo dejaste</h2>
            <Link href="/rutinas" className="text-[13px] font-semibold text-accent">
              Ver todas las rutinas →
            </Link>
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {resumeCards.map((r) => (
              <div key={r.name} className="overflow-hidden rounded-xl border border-line bg-surface">
                <Thumb ratio="16 / 8">
                  <span className="absolute bottom-2.5 left-2.5 rounded-md bg-surface px-1.5 py-1 font-mono text-[11px] font-medium text-ink-3">
                    {r.dur}
                  </span>
                </Thumb>
                <div className="flex flex-col gap-1.5 px-3.5 pb-3.5 pt-3">
                  <div className="text-[15px] font-semibold tracking-[-0.01em]">{r.name}</div>
                  <div className="font-mono text-[11px] text-muted">{r.meta}</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Badge tone="draft">Borrador</Badge>
                    <span className="font-mono text-[11px] text-faint">{r.ago}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-3.5 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line-3 px-[18px] py-3.5">
              <h2 className="text-[15px] font-bold">Publicado esta semana</h2>
              <MonoLabel className="normal-case tracking-normal text-muted-2">7 ítems</MonoLabel>
            </div>
            {publishedItems.map((p) => (
              <div
                key={p.name}
                className="flex items-center gap-3 border-b border-line-4 px-[18px] py-2.5 last:border-0"
              >
                <MonoLabel className="w-[52px] shrink-0 tracking-[0.06em]">{p.kind}</MonoLabel>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-faint">{p.when}</span>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line-3 px-[18px] py-3.5">
              <h2 className="text-[15px] font-bold">Necesita atención</h2>
              <span className="font-mono text-[11px] font-medium text-accent">5</span>
            </div>
            {attentionItems.map((a) => (
              <div
                key={a.name}
                className="flex items-center gap-3 border-b border-line-4 px-[18px] py-2.5 last:border-0"
              >
                <span
                  className="block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: a.dot }}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted">{a.why}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
