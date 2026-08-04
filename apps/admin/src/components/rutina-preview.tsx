'use client';

// A read-only, athlete-facing rendering of the whole rutina, driven live by the
// builder state (plus the fetched warmup/cooldown rutinas). Plain text — each
// exercise reads "{cantidad} {nombre} @{carga}", blocks separated by space.
export type PvItem =
  | { kind: 'rest'; seconds: number | null }
  | { kind: 'exercise'; prefix: string | null; name: string; load: string | null; tempo: string | null };
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

function Line({ item }: { item: PvItem }) {
  if (item.kind === 'rest') {
    return (
      <div className="text-[13px] leading-relaxed text-muted">
        Descanso{item.seconds ? ` ${item.seconds}s` : ''}
      </div>
    );
  }
  return (
    <div className="text-[13px] leading-relaxed text-ink">
      {item.prefix && <span className="tabular-nums">{item.prefix} </span>}
      {item.name}
      {item.load && <span className="text-ink-3"> @{item.load}</span>}
      {item.tempo && <span className="text-ink-3"> · {item.tempo}</span>}
    </div>
  );
}

function BlockText({ block }: { block: PvBlock }) {
  const head = [
    block.title,
    block.rounds != null && block.rounds > 1 ? `${block.rounds} rondas` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div>
      {head && (
        <div className="mb-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          {head}
        </div>
      )}
      {block.items.map((it, i) => (
        <Line key={i} item={it} />
      ))}
    </div>
  );
}

function Section({ label, blocks }: { label: string; blocks: PvBlock[] }) {
  const hasContent = blocks.some((b) => b.items.length > 0);
  return (
    <section className="flex flex-col gap-2">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
        {label}
      </div>
      {hasContent ? (
        <div className="flex flex-col gap-3">
          {blocks
            .filter((b) => b.items.length > 0)
            .map((b, i) => (
              <BlockText key={i} block={b} />
            ))}
        </div>
      ) : (
        <div className="text-[12px] text-muted">Sin ejercicios</div>
      )}
    </section>
  );
}

export function RutinaPreview({ model, name }: { model: PvModel; name: string }) {
  const mainHasContent = model.main.some((b) => b.items.length > 0);
  const empty = !model.warmup && !model.cooldown && !mainHasContent && !model.hasVideo;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
          Vista previa
        </div>
        <span className="font-mono text-[10px] text-faint">como la ve el usuario</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-line-2 bg-surface">
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
          <div className="flex flex-col gap-5 px-4 py-4">
            {model.warmup && <Section label="Calentamiento" blocks={model.warmup.blocks} />}
            <Section label="La rutina" blocks={model.main} />
            {model.cooldown && <Section label="Enfriamiento" blocks={model.cooldown.blocks} />}
          </div>
        )}
      </div>
    </div>
  );
}
