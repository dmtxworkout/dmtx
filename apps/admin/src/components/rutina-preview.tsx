'use client';

import { cn } from '@/lib/utils';

// A read-only, athlete-facing rendering of the whole rutina, driven live by the
// builder state (plus the fetched warmup/cooldown rutinas).
export type PvItem =
  | { kind: 'rest'; seconds: number | null }
  | {
      kind: 'exercise';
      name: string;
      sets: number | null;
      target: string | null;
      load: string | null;
      tempo: string | null;
    };
export type PvBlock = { title: string | null; rounds: number | null; items: PvItem[] };
export type PvSection = { name: string | null; blocks: PvBlock[] };
export type PvModel = {
  type: 'structured' | 'video';
  hasVideo: boolean;
  formatLabel: string;
  summary: string[];
  warmup: PvSection | null;
  main: PvBlock[];
  cooldown: PvSection | null;
};

function ItemRow({ item }: { item: PvItem }) {
  if (item.kind === 'rest') {
    return (
      <div className="py-1 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
        Descanso {item.seconds ? `${item.seconds}s` : ''}
      </div>
    );
  }
  const meta = [item.target, item.load, item.tempo].filter(Boolean).join(' · ');
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[13px] leading-snug text-ink">
        {item.sets ? <span className="font-mono text-ink-3">{item.sets}× </span> : null}
        {item.name}
      </span>
      {meta ? <span className="shrink-0 font-mono text-[11px] text-ink-3">{meta}</span> : null}
    </div>
  );
}

function Block({ block }: { block: PvBlock }) {
  const showHead = Boolean(block.title) || (block.rounds != null && block.rounds > 1);
  return (
    <div className="rounded-lg border border-line-3 bg-surface-2/40 px-3 py-2">
      {showHead && (
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          {block.title && <span>{block.title}</span>}
          {block.rounds != null && block.rounds > 1 && (
            <span className="text-accent-dark">{block.rounds} rondas</span>
          )}
        </div>
      )}
      <div className="divide-y divide-line-3/60">
        {block.items.map((it, i) => (
          <ItemRow key={i} item={it} />
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
      {children}
    </div>
  );
}

export function RutinaPreview({ model, name }: { model: PvModel; name: string }) {
  const mainHasContent = model.main.some((b) => b.items.length > 0);
  const empty = !model.warmup && !model.cooldown && !mainHasContent && !model.hasVideo;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Vista previa</SectionLabel>
        <span className="font-mono text-[10px] text-faint">como la ve el usuario</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-line-2 bg-surface">
        {/* Title strip */}
        <div className="border-b border-line-3 px-4 py-3">
          <div className="truncate text-[15px] font-extrabold text-ink">{name || 'Rutina sin título'}</div>
          {model.type === 'structured' && (model.formatLabel || model.summary.length > 0) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 font-mono text-[11px] text-ink-3">
              <span className="font-semibold text-accent-dark">{model.formatLabel}</span>
              {model.summary.map((s) => (
                <span key={s}>· {s}</span>
              ))}
            </div>
          )}
        </div>

        {empty ? (
          <div className="px-4 py-10 text-center">
            <div className="text-[13px] font-semibold text-ink-3">Aún no hay nada que mostrar</div>
            <div className="mt-1 text-[12px] leading-snug text-muted">
              Añade ejercicios, un calentamiento o un enfriamiento y aparecerán aquí tal como los verá
              el usuario.
            </div>
          </div>
        ) : model.type === 'video' ? (
          <div className="px-4 py-8 text-center text-[13px] text-ink-3">
            {model.hasVideo ? 'Rutina en video' : 'Sube un video para esta rutina'}
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-4 py-4">
            {model.warmup && (
              <section className="flex flex-col gap-2">
                <SectionLabel>
                  Calentamiento{model.warmup.name ? ` · ${model.warmup.name}` : ''}
                </SectionLabel>
                {model.warmup.blocks.map((b, i) => (
                  <Block key={i} block={b} />
                ))}
              </section>
            )}

            <section className="flex flex-col gap-2">
              <SectionLabel>La rutina</SectionLabel>
              {mainHasContent ? (
                model.main
                  .filter((b) => b.items.length > 0)
                  .map((b, i) => <Block key={i} block={b} />)
              ) : (
                <div className="rounded-lg border border-dashed border-line-2 px-3 py-4 text-center text-[12px] text-muted">
                  Sin ejercicios todavía
                </div>
              )}
            </section>

            {model.cooldown && (
              <section className={cn('flex flex-col gap-2')}>
                <SectionLabel>
                  Enfriamiento{model.cooldown.name ? ` · ${model.cooldown.name}` : ''}
                </SectionLabel>
                {model.cooldown.blocks.map((b, i) => (
                  <Block key={i} block={b} />
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
