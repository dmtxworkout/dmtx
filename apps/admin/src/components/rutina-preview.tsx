'use client';

// A read-only, athlete-facing rendering of the whole rutina, driven live by the
// builder state (plus the fetched warmup/cooldown rutinas). Plain text — each
// exercise reads "{cantidad} {nombre} @{carga}". Loose exercises list tightly;
// only real blocks (multi-exercise or multi-round) get a gap + a rounds header.
export type PvItem =
  | { kind: 'rest'; seconds: number | null }
  | { kind: 'exercise'; prefix: string | null; name: string; load: string | null; tempo: string | null };
export type PvBlock = { title: string | null; rounds: number | null; items: PvItem[] };
export type PvSection = { name: string | null; blocks: PvBlock[] };
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
      {item.prefix && <span className="tabular-nums">{item.prefix} </span>}
      {item.name}
      {item.load && <span className="text-ink-3"> @{item.load}</span>}
      {item.tempo && <span className="text-ink-3"> · {item.tempo}</span>}
    </div>
  );
}

// A block counts as a "real block" (worth its own gap + rounds header) when it
// has more than one exercise or repeats for multiple rounds. Otherwise it's a
// loose exercise that should sit tight against its neighbours.
const isBlock = (b: PvBlock) => b.items.length > 1 || (b.rounds != null && b.rounds > 1);

type Unit = { rounds: number | null; loose: boolean; items: PvItem[] };

function Section({ label, blocks }: { label: string; blocks: PvBlock[] }) {
  // Build display units WITHOUT mutating the incoming block arrays (they belong
  // to the live model and must stay intact across re-renders).
  const units: Unit[] = [];
  for (const b of blocks) {
    if (b.items.length === 0) continue;
    if (isBlock(b)) {
      units.push({ rounds: b.rounds, loose: false, items: [...b.items] });
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
        <div className="flex flex-col gap-4">
          {units.map((u, i) => (
            <div key={i}>
              {u.rounds != null && u.rounds > 1 && (
                <div className="mb-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                  {u.rounds} rondas
                </div>
              )}
              {u.items.map((it, j) => (
                <Line key={j} item={it} />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function RutinaPreview({ model, name }: { model: PvModel; name: string }) {
  const mainHasContent = model.main.some((b) => b.items.length > 0);
  const empty = !model.warmup && !model.cooldown && !mainHasContent && !model.hasVideo;
  // The main section is headed by the format itself (e.g. "AMRAP 10 min").
  const mainLabel = `${model.formatLabel}${model.headline ? ` ${model.headline}` : ''}`;

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
            <Section label={mainLabel} blocks={model.main} />
            {model.cooldown && <Section label="Enfriamiento" blocks={model.cooldown.blocks} />}
          </div>
        )}
      </div>
    </div>
  );
}
