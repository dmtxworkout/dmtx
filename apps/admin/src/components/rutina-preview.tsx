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
 * Blocks at one nesting level, written the way a coach writes a WOD on the
 * whiteboard: a header line ("3 RONDAS:", "AMRAP 12 MIN"), the movements
 * listed one per line indented under it, and a thin bracket down the left of
 * what belongs to the header. Nesting indents again. No boxes.
 */
function Blocks({ blocks }: { blocks: PvBlock[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((b, i) => {
        if (b.part) {
          return (
            <div key={i}>
              <div className="text-[13px] font-extrabold uppercase tracking-[0.04em] text-accent-dark">{b.part}</div>
              {b.note && <div className="text-[12px] italic leading-5 text-muted">{b.note}</div>}
              <div className="mt-1 border-l-2 border-line-2 pl-3">
                {!!b.blocks?.length && <Blocks blocks={b.blocks} />}
                {b.items.map((it, j) => (
                  <Line key={j} item={it} />
                ))}
              </div>
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
        const head = rounds != null ? `${rounds} rondas${title ? ` · ${title}` : ''}` : (title ?? 'Bloque');
        const nested = b.blocks?.length ? b.blocks : null;
        return (
          <div key={i}>
            <div className="text-[13px] font-extrabold uppercase tracking-[0.04em] text-ink">{head}:</div>
            {b.note && <div className="text-[12px] italic leading-5 text-muted">{b.note}</div>}
            <div className="mt-0.5 border-l-2 border-line-2 pl-3">
              {nested ? <Blocks blocks={nested} /> : b.items.map((it, j) => <Line key={j} item={it} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Section({ label, blocks }: { label: string; blocks: PvBlock[] }) {
  const empty = !blocks.some(function has(b): boolean {
    return b.items.length > 0 || (b.blocks ?? []).some(has);
  });
  return (
    <section>
      <div className="mb-2 border-b border-line-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
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
  const hasContent = (blocks: PvBlock[]): boolean => blocks.some((b) => b.items.length > 0 || hasContent(b.blocks ?? []));
  const mainHasContent = hasContent(model.main);
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

      <div>
        <div className="mb-3 text-[20px] font-extrabold leading-tight tracking-tight text-ink">{name || 'Rutina sin título'}</div>

        {empty ? (
          <div className="py-8 text-center">
            <div className="text-[13px] font-semibold text-ink-3">Aún no hay nada que mostrar</div>
            <div className="mt-1 text-[12px] leading-snug text-muted">
              Añade ejercicios, un calentamiento o un enfriamiento y aparecerán aquí tal como los verá
              el usuario.
            </div>
          </div>
        ) : model.type === 'video' ? (
          <div className="py-8 text-center text-[13px] text-ink-3">
            {model.hasVideo ? 'Rutina en video' : 'Sube un video para esta rutina'}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
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
