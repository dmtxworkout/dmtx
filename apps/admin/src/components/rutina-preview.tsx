'use client';

// A read-only, athlete-facing rendering of the whole rutina, driven live by the
// builder state (plus the fetched warmup/cooldown rutinas). Plain text — each
// exercise reads "{cantidad} {nombre} @{carga}". Loose exercises list tightly;
// only real blocks (multi-exercise or multi-round) get a gap + a rounds header.
export type PvItem =
  | { kind: 'rest'; seconds: number | null }
  | {
      kind: 'exercise';
      prefix: string | null;
      name: string;
      load: string | null;
      tempo: string | null;
      perSide?: boolean;
      note?: string | null;
      /** 1-based EMOM interval the item is fixed to, when written as "intervalo N:". */
      interval?: number | null;
    };
export type PvBlock = {
  title: string | null;
  rounds: number | null;
  /** A note for the athlete, under the block's (or part's) heading. */
  note?: string | null;
  items: PvItem[];
  /** A part header ("AMRAP 12 min"): rendered as a sub-heading before its blocks. */
  part?: string | null;
  /** Blocks nested inside (a part's content, or a group holding parts/blocks). */
  blocks?: PvBlock[];
  /** A run of loose exercise lines: plain lines, never boxed. */
  loose?: boolean;
};
export type PvSection = { name: string | null; formatLabel?: string | null; blocks: PvBlock[] };
export type PvModel = {
  type: 'structured' | 'video';
  hasVideo: boolean;
  formatLabel: string;
  headline: string;
  warmup: PvSection | null;
  main: PvBlock[];
  cooldown: PvSection | null;
};

function Line({ item }: { item: PvItem }) {
  if (item.kind === 'rest') {
    return (
      <div className="text-[13px] leading-6 text-muted">
        Descanso{item.seconds ? ` ${item.seconds}s` : ''}
      </div>
    );
  }
  return (
    <div className="text-[13px] leading-6 text-ink">
      {item.interval != null && (
        <span className="mr-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-accent-dark">
          Int. {item.interval}
        </span>
      )}
      {item.prefix && <span className="tabular-nums">{item.prefix} </span>}
      {item.name}
      {item.load && <span className="text-ink-3"> @{item.load}</span>}
      {item.tempo && <span className="text-ink-3"> · {item.tempo}</span>}
      {item.perSide && <span className="text-ink-3"> · c/lado</span>}
      {item.note && <div className="text-[12px] leading-5 text-muted">— {item.note}</div>}
    </div>
  );
}

const cap = (t: string) => t.replace(/^\p{L}/u, (c) => c.toUpperCase());

/**
 * Blocks at one nesting level. A part shows its header and then its blocks at
 * the same level; a group is a box with a plain heading ("3 rondas · repite
 * estos ejercicios 3 veces") holding its exercises or its own nested blocks;
 * loose exercises are plain lines. Boxes nest, so what is inside what is
 * always visible.
 */
function Blocks({ blocks }: { blocks: PvBlock[] }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => {
        if (b.part) {
          return (
            <div key={i} className="flex flex-col gap-2">
              <div>
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-accent-dark">{b.part}</div>
                {b.note && <div className="mt-1 text-[12px] italic leading-5 text-muted">{b.note}</div>}
              </div>
              {!!b.blocks?.length && <Blocks blocks={b.blocks} />}
              {b.items.map((it, j) => (
                <Line key={j} item={it} />
              ))}
            </div>
          );
        }
        const rounds = b.rounds != null && b.rounds > 1 ? b.rounds : null;
        const grouped = !b.loose && (rounds != null || !!b.title || b.items.length > 1 || !!b.blocks?.length);
        if (!grouped) {
          return (
            <div key={i}>
              {b.note && <div className="text-[12px] italic leading-5 text-muted">{b.note}</div>}
              {b.items.map((it, j) => (
                <Line key={j} item={it} />
              ))}
            </div>
          );
        }
        const title = b.title ? cap(b.title) : null;
        const nested = b.blocks?.length ? b.blocks : null;
        return (
          <div key={i} className="rounded-lg border border-line-2 bg-surface-2/70 px-3 py-2">
            <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-[13px] font-bold text-ink">{rounds != null ? `${rounds} rondas` : (title ?? 'Bloque')}</span>
              {rounds != null && title && <span className="text-[12px] text-ink-3">· {title}</span>}
              {rounds != null && <span className="text-[12px] text-muted">repite todo esto {rounds} veces</span>}
              {rounds == null && !nested && b.items.length > 1 && (
                <span className="text-[12px] text-muted">seguidos, sin descanso entre ellos</span>
              )}
            </div>
            {b.note && <div className="mb-1 text-[12px] italic leading-5 text-muted">{b.note}</div>}
            <div className="border-l-2 border-accent/40 pl-3">
              {nested ? (
                <Blocks blocks={nested} />
              ) : (
                b.items.map((it, j) => <Line key={j} item={it} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Section({ label, blocks }: { label: string; blocks: PvBlock[] }) {
  const empty = !blocks.some((b) => b.items.length || b.blocks?.length);
  return (
    <section className="px-4 py-3.5">
      <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
        {label}
      </div>
      {empty ? (
        <div className="text-[13px] text-muted">Sin ejercicios</div>
      ) : (
        <Blocks blocks={blocks} />
      )}
    </section>
  );
}

export function RutinaPreview({
  model,
  name,
  hideHeader = false,
}: {
  model: PvModel;
  name: string;
  hideHeader?: boolean;
}) {
  const mainHasContent = model.main.some((b) => b.items.length > 0);
  const empty = !model.warmup && !model.cooldown && !mainHasContent && !model.hasVideo;
  // The main section is headed by the format itself (e.g. "AMRAP 10 min").
  const mainLabel = `${model.formatLabel}${model.headline ? ` ${model.headline}` : ''}`;

  return (
    <div className="flex flex-col gap-3">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
            Vista previa
          </div>
          <span className="font-mono text-[10px] text-faint">como la ve el usuario</span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-line-2 bg-surface">
        <div className="border-b border-line-3 px-4 py-3">
          <div className="truncate text-[15px] font-extrabold text-ink">{name || 'Rutina sin título'}</div>
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
            {model.warmup && (
              <Section
                label={`Calentamiento${model.warmup.formatLabel ? ` · ${model.warmup.formatLabel}` : ''}`}
                blocks={model.warmup.blocks}
              />
            )}
            <Section label={mainLabel} blocks={model.main} />
            {model.cooldown && (
              <Section
                label={`Enfriamiento${model.cooldown.formatLabel ? ` · ${model.cooldown.formatLabel}` : ''}`}
                blocks={model.cooldown.blocks}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
