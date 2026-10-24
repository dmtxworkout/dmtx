'use client';

import {
  formatDistance,
  formatDuration,
  formatHeader,
  goalsFrom,
  loadText,
  pluralName,
  tempoText,
  type ParsedBlock,
  type ParsedItem,
  type ParsedRutina,
} from '@dmtx/core';
import type { SkillGoal } from '@dmtx/schemas';

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
/** A section that is a video: its length, or `missing` while no file is chosen. */
export type PvVideo = { seconds: number | null; missing: boolean; /** What the class does, as the admin described it. */ notes?: string };
export type PvModel = {
  /** The sections that are videos instead of text. */
  videos: Partial<Record<'warmup' | 'main' | 'cooldown', PvVideo>>;
  formatLabel: string;
  headline: string;
  warmup: PvSection | null;
  main: PvBlock[];
  cooldown: PvSection | null;
  /** A skill level: the marks that unlock the next level, as the athlete reads them. */
  goals?: string[];
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

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** A section the athlete plays as a video. */
function VideoSection({ label, video }: { label: string; video: PvVideo }) {
  return (
    <section>
      <div className="mb-2 border-b border-line-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">{label}</div>
      {video.missing ? (
        <div className="text-[13px] text-muted">Sube un video para esta sección</div>
      ) : (
        <div className="flex items-center gap-2 text-[14px] text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[10px] text-white">▶</span>
          <span className="font-medium">Clase en video</span>
          {video.seconds ? <span className="font-mono text-[12px] text-muted">{mmss(video.seconds)}</span> : null}
        </div>
      )}
      {video.notes && <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{video.notes}</p>}
    </section>
  );
}

function Section({ label, blocks }: { label: string; blocks: PvBlock[] }) {
  const empty = !blocks.some(function has(b): boolean {
    return b.items.length > 0 || (b.blocks ?? []).some(has);
  });
  return (
    <section>
      {label && (
        <div className="mb-2 border-b border-line-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
          {label}
        </div>
      )}
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
  const goals = model.goals ?? [];
  const videoCount = Object.keys(model.videos).length;
  const empty = !model.warmup && !model.cooldown && !mainHasContent && !videoCount && !goals.length;
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
        {/* Embedded (the guide's examples) with no name: no title line at all. */}
        {!(hideHeader && !name) && (
          <div className="mb-3 text-[20px] font-extrabold leading-tight tracking-tight text-ink">{name || 'Rutina sin título'}</div>
        )}

        {empty ? (
          <div className="py-8 text-center">
            <div className="text-[13px] font-semibold text-ink-3">Aún no hay nada que mostrar</div>
            <div className="mt-1 text-[12px] leading-snug text-muted">
              Añade ejercicios, un calentamiento o un estiramiento y aparecerán aquí tal como los verá
              el usuario.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {model.videos.warmup ? (
              <VideoSection label="Calentamiento" video={model.videos.warmup} />
            ) : (
              model.warmup && (
                <Section
                  label={`Calentamiento${model.warmup.formatLabel ? ` · ${model.warmup.formatLabel}` : ''}`}
                  blocks={model.warmup.blocks}
                />
              )
            )}
            {model.videos.main ? <VideoSection label={model.formatLabel || 'Rutina'} video={model.videos.main} /> : <Section label={mainLabel} blocks={model.main} />}
            {model.videos.cooldown ? (
              <VideoSection label="Estiramiento" video={model.videos.cooldown} />
            ) : (
              model.cooldown && (
                <Section
                  label={`Estiramiento${model.cooldown.formatLabel ? ` · ${model.cooldown.formatLabel}` : ''}`}
                  blocks={model.cooldown.blocks}
                />
              )
            )}
            {goals.length > 0 && (
              <section>
                <div className="mb-2 border-b border-line-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
                  Objetivo · para pasar al siguiente nivel
                </div>
                <ul className="flex flex-col gap-1">
                  {goals.map((g, i) => (
                    <li key={i} className="flex items-center gap-2 text-[14px] text-ink">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-accent text-[10px] font-bold text-accent-dark">
                        ✓
                      </span>
                      {g}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- From the parse result to the preview model -------------------------------

/** A level's goal as the athlete reads it: "3 Dominadas", "Plancha 60 s", "Sentadilla 5 reps @100 kg". */
export function skillGoalLabel(g: SkillGoal): string {
  if (g.metric === 'reps') return `${g.value} ${pluralName(g.exerciseName, g.value)}`;
  if (g.metric === 'time_seconds') return `${g.exerciseName} ${formatDuration(g.value)}`;
  if (g.metric === 'distance_meters') return `${formatDistance(g.value)} ${g.exerciseName}`;
  return `${g.exerciseName} ${g.reps ? `${g.reps} reps ` : ''}@${g.value} kg`;
}

// ---- Preview model from the parse result -------------------------------------

function pvItem(it: ParsedItem, inSlot = false): PvItem {
  if (it.kind === 'rest') return { kind: 'rest', seconds: it.workSeconds };
  const sets = it.sets && it.sets > 1 ? it.sets : null;
  let prefix: string | null = null;
  if (it.measure === 'time' && it.workSeconds != null) prefix = formatDuration(it.workSeconds);
  else if (it.measure === 'distance' && it.distanceMeters != null)
    prefix = formatDistance(it.distanceMeters);
  else if (it.reps != null) prefix = String(it.reps);
  if (sets && prefix) prefix = `${sets}×${prefix}`;
  else if (sets) prefix = `${sets} series`;
  const load = loadText(it.loadPrescription).replace(/^@/, '');
  const tempo = tempoText(it.tempoOverride).replace(/^tempo /, '');
  return {
    kind: 'exercise',
    prefix,
    // Counted reps read in plural: "20 Sentadillas" (the catalog keeps the singular).
    name: pluralName(it.match?.name ?? it.rawName ?? '…', it.measure === 'reps' ? it.reps : null),
    load: load || null,
    tempo: tempo ? tempo.replace(/-/g, '·') : null,
    perSide: it.perSide,
    note: it.notes,
    // Items under an "intervalo N:" group already sit under that heading.
    interval: !inSlot && it.intervalIndex != null ? it.intervalIndex + 1 : null,
  };
}
/** Parsed blocks → preview blocks, nesting kept (parts show their header, groups their box). */
const pvBlock = (b: ParsedBlock): PvBlock => ({
  title: b.label,
  rounds: b.rounds,
  note: b.notes,
  loose: b.loose,
  part: b.kind === 'part' ? (b.format ? formatHeader(b.format.format, b.format) : 'Parte') : null,
  // An exercise that did not resolve (typo, half-written) is an error in the
  // editor; the preview shows the rutina as the athlete would get it, without it.
  items: b.items.filter((it) => it.kind !== 'exercise' || it.match).map((it) => pvItem(it, b.type === 'emom')),
  blocks: (b.children ?? []).map(pvBlock),
});
const pvBlocks = (blocks: ParsedBlock[]): PvBlock[] => blocks.map(pvBlock);

/** Which sections are videos, with their files and lengths as the editor knows them. */
export type PvSections = {
  kinds: Record<'warmup' | 'main' | 'cooldown', 'text' | 'video'>;
  videos: Record<'warmup' | 'main' | 'cooldown', string | null>;
  durations: Record<'warmup' | 'main' | 'cooldown', number | null>;
  notes?: Record<'warmup' | 'main' | 'cooldown', string>;
};
const ALL_TEXT: PvSections = {
  kinds: { warmup: 'text', main: 'text', cooldown: 'text' },
  videos: { warmup: null, main: null, cooldown: null },
  durations: { warmup: null, main: null, cooldown: null },
};

export function previewFrom(
  parsed: ParsedRutina,
  sections: PvSections = ALL_TEXT,
  /** A reusable block is one piece of text: no "Rutina" section label over it. */
  blockMode = false,
): PvModel {
  const videos: PvModel['videos'] = {};
  for (const sec of ['warmup', 'main', 'cooldown'] as const) {
    if (sections.kinds[sec] === 'video')
      videos[sec] = { seconds: sections.durations[sec], missing: !sections.videos[sec], notes: sections.notes?.[sec]?.trim() || undefined };
  }
  // Parts carry the format headers inside the list, so the section labels are plain.
  const section = (s: 'warmup' | 'cooldown'): PvSection | null => {
    const blocks = parsed.blocks.filter((b) => b.section === s);
    if (!blocks.length) return null;
    return { name: null, formatLabel: null, blocks: pvBlocks(blocks) };
  };
  return {
    videos,
    formatLabel: blockMode ? '' : 'Rutina',
    headline: '',
    warmup: section('warmup'),
    main: pvBlocks(parsed.blocks.filter((b) => b.section === 'main')),
    cooldown: section('cooldown'),
    goals: goalsFrom(parsed).map(skillGoalLabel),
  };
}

