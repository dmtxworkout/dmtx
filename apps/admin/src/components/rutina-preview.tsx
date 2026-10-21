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

// A block counts as a "real block" (worth its own gap + rounds header) when it
// has more than one exercise or repeats for multiple rounds. Otherwise it's a
// loose exercise that should sit tight against its neighbours.
const isBlock = (b: PvBlock) => b.items.length > 1 || (b.rounds != null && b.rounds > 1);

type Unit = { rounds: number | null; loose: boolean; items: PvItem[]; part?: string; title?: string | null; note?: string | null };

function Section({ label, blocks }: { label: string; blocks: PvBlock[] }) {
  // Build display units WITHOUT mutating the incoming block arrays (they belong
  // to the live model and must stay intact across re-renders).
  const units: Unit[] = [];
  for (const b of blocks) {
    if (b.part) {
      units.push({ rounds: null, loose: false, items: [], part: b.part, note: b.note });
      continue;
    }
    if (b.items.length === 0) continue;
    if (isBlock(b) || b.title || b.note) {
      units.push({ rounds: b.rounds, loose: false, items: [...b.items], title: b.title, note: b.note });
    } else {
      const last = units[units.length - 1];
      // Merge consecutive loose exercises into one tight run.
      if (last && last.loose) last.items.push(...b.items);
      else units.push({ rounds: null, loose: true, items: [...b.items] });
    }
  }

  return (
    <section className="flex flex-col gap-1.5">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
        {label}
      </div>
      {units.length === 0 ? (
        <div className="text-[12px] text-muted">Sin ejercicios</div>
      ) : (
        <div className="flex flex-col gap-3">
          {units.map((u, i) => {
            // A part header: the format the blocks below it play on.
            if (u.part) {
              return (
                <div key={i} className="-mb-1">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-accent-dark">{u.part}</div>
                  {u.note && <div className="mt-1 text-[12px] italic leading-5 text-muted">{u.note}</div>}
                </div>
              );
            }
            const rounds = u.rounds != null && u.rounds > 1 ? u.rounds : null;
            // A run of loose exercises is never a group, however long it is.
            const grouped = !u.loose && (rounds != null || !!u.title || u.items.length > 1);
            // Loose exercises: plain lines, one after another.
            if (!grouped) {
              return (
                <div key={i}>
                  {u.note && <div className="text-[12px] italic leading-5 text-muted">{u.note}</div>}
                  {u.items.map((it, j) => (
                    <Line key={j} item={it} />
                  ))}
                </div>
              );
            }
            // A group: a box with its own heading, so it is obvious which
            // exercises repeat together and which sit outside.
            const title = u.title ? u.title.replace(/^\p{L}/u, (c) => c.toUpperCase()) : null;
            return (
              <div key={i} className="rounded-lg border border-line-2 bg-surface-2/70 px-3 py-2">
                <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-bold text-ink">{rounds != null ? `${rounds} rondas` : (title ?? 'Bloque')}</span>
                  {rounds != null && title && <span className="text-[12px] text-ink-3">· {title}</span>}
                  {rounds != null && <span className="text-[12px] text-muted">repite estos ejercicios {rounds} veces</span>}
                  {rounds == null && u.items.length > 1 && <span className="text-[12px] text-muted">seguidos, sin descanso entre ellos</span>}
                </div>
                {u.note && <div className="mb-1 text-[12px] italic leading-5 text-muted">{u.note}</div>}
                <div className="border-l-2 border-accent/40 pl-3">
                  {u.items.map((it, j) => (
                    <Line key={j} item={it} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
