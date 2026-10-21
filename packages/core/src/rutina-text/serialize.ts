import type {
  BlockSection,
  BlockType,
  FormatConfig,
  LoadPrescription,
  MeasurementType,
  Tempo,
  WorkoutFormat,
} from '@dmtx/schemas';
import { Catalog } from './catalog';
import { formatDistance, formatDuration } from './normalize';
import type { CatalogExercise } from './types';

/*
 * Structural input types: both a saved `Workout` and a `CreateWorkoutInput`
 * satisfy them, so the serializer works from either.
 */
export interface SerializableItem {
  kind: 'exercise' | 'rest';
  exerciseId?: string | null;
  measure?: MeasurementType | null;
  sets?: number | null;
  reps?: number | null;
  workSeconds?: number | null;
  distanceMeters?: number | null;
  restBetweenSeconds?: number | null;
  tempoOverride?: Tempo | null;
  loadPrescription?: LoadPrescription | null;
  perSide?: boolean;
  intervalIndex?: number | null;
  notes?: string | null;
}
export interface SerializableBlock {
  kind: 'group' | 'rest' | 'part';
  section: BlockSection;
  type: BlockType;
  rounds?: number | null;
  label?: string | null;
  items: SerializableItem[];
  /** Parts: their format and the blocks they contain. */
  format?: WorkoutFormat | null;
  formatConfig?: FormatConfig | null;
  blocks?: SerializableBlock[];
}
export interface SerializableWorkout {
  format?: WorkoutFormat | null;
  formatConfig?: FormatConfig | null;
  warmupFormat?: WorkoutFormat | null;
  warmupFormatConfig?: FormatConfig | null;
  cooldownFormat?: WorkoutFormat | null;
  cooldownFormatConfig?: FormatConfig | null;
  blocks: SerializableBlock[];
}

const dur = formatDuration;

/** The header line for a format + config, e.g. "AMRAP 12 min". */
export function formatHeader(format: WorkoutFormat, config?: FormatConfig | null): string {
  const c = config && config.format === format ? config : null;
  switch (format) {
    case 'amrap':
      return `AMRAP ${dur(c?.format === 'amrap' ? c.totalSeconds : 600)}`;
    case 'emom': {
      const interval = c?.format === 'emom' ? c.intervalSeconds : 60;
      const rounds = c?.format === 'emom' ? c.rounds : 10;
      return interval === 60 ? `EMOM ${rounds} min` : `EMOM ${rounds} x ${dur(interval)}`;
    }
    case 'tabata': {
      const t = c?.format === 'tabata' ? c : { rounds: 8, workSeconds: 20, restSeconds: 10 };
      return `Tabata ${t.rounds} x ${t.workSeconds}/${t.restSeconds}`;
    }
    case 'strength':
      return 'Fuerza';
    case 'chipper': {
      const cap = c?.format === 'chipper' ? c.timeCapSeconds : undefined;
      return cap ? `Chipper cap ${dur(cap)}` : 'Chipper';
    }
    case 'for_time': {
      const parts = ['For time'];
      if (c?.format === 'for_time') {
        if (c.rounds) parts.push(`${c.rounds} rondas`);
        if (c.timeCapSeconds) parts.push(`cap ${dur(c.timeCapSeconds)}`);
      }
      return parts.join(' ');
    }
    case 'circuit': {
      const parts = ['Circuito'];
      if (c?.format === 'circuit') {
        if (c.rounds) parts.push(`${c.rounds} rondas`);
        if (c.restBetweenRoundsSeconds) parts.push(`descanso ${dur(c.restBetweenRoundsSeconds)}`);
        if (c.timeCapSeconds) parts.push(`cap ${dur(c.timeCapSeconds)}`);
      }
      return parts.join(' ');
    }
  }
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace('.', ','));

export function loadText(l: LoadPrescription | null | undefined): string {
  if (!l) return '';
  switch (l.type) {
    case 'absolute':
      return l.womenValue != null
        ? `@${fmtNum(l.value)}/${fmtNum(l.womenValue)} ${l.unit}`
        : `@${fmtNum(l.value)} ${l.unit}`;
    case 'percent_1rm':
      return `@${fmtNum(l.value)}%`;
    case 'rpe':
      return `@RPE ${fmtNum(l.value)}`;
    case 'bodyweight':
      return l.addedValue ? `+${fmtNum(l.addedValue)} ${l.unit ?? 'kg'}` : '@corporal';
  }
}

export function tempoText(t: Tempo | null | undefined): string {
  if (!t) return '';
  const p = (v: Tempo['holdTop']) => (v === 'X' ? 'X' : String(v));
  return `tempo ${p(t.holdTop)}-${p(t.eccentric)}-${p(t.holdBottom)}-${p(t.concentric)}`;
}

export function itemLine(it: SerializableItem, name: string, format: WorkoutFormat | null): string {
  if (it.kind === 'rest') return `descanso ${dur(it.workSeconds ?? 60)}`;
  const parts: string[] = [];
  const sets = it.sets && it.sets > 1 ? it.sets : null;
  const measure = it.measure ?? 'reps';
  if (format === 'emom' && it.intervalIndex != null) parts.push(`min ${it.intervalIndex + 1}:`);
  if (measure === 'time' && it.workSeconds != null) {
    parts.push(sets ? `${sets}x${dur(it.workSeconds)} ${name}` : `${name} ${dur(it.workSeconds)}`);
  } else if (measure === 'distance' && it.distanceMeters != null) {
    const d = formatDistance(it.distanceMeters);
    parts.push(sets ? `${sets}x${d} ${name}` : `${d} ${name}`);
  } else if (it.reps != null) {
    parts.push(sets ? `${sets}x${it.reps} ${name}` : `${it.reps} ${name}`);
  } else {
    parts.push(name);
  }
  const load = loadText(it.loadPrescription);
  if (load) parts.push(load);
  const tempo = tempoText(it.tempoOverride);
  if (tempo) parts.push(tempo);
  if (it.perSide) parts.push('c/lado');
  if (it.restBetweenSeconds) parts.push(`desc ${dur(it.restBetweenSeconds)}`);
  if (it.notes) parts.push(`// ${it.notes}`);
  return parts.join(' ');
}

const SECTION_TITLE: Record<BlockSection, string> = {
  warmup: 'Calentamiento',
  main: 'Rutina',
  cooldown: 'Enfriamiento',
};

/** Rutina → text. The inverse of `parseRutina` for every supported field. */
export function serializeRutina(
  w: SerializableWorkout,
  catalog: CatalogExercise[] | Catalog,
): string {
  const cat = catalog instanceof Catalog ? catalog : new Catalog(catalog);
  const nameOf = (id: string | null | undefined) =>
    (id && cat.byId(id)?.name) || 'ejercicio desconocido';

  const out: string[] = [];
  const bySection = (s: BlockSection) => w.blocks.filter((b) => (b.section ?? 'main') === s);

  // One block (group / loose item / rest) at indentation `pad`.
  const writeBlock = (b: SerializableBlock, pad: string, fmt: WorkoutFormat | null) => {
    const loose =
      b.kind === 'rest' || (b.items.length === 1 && !b.rounds && !b.label && b.type !== 'superset');
    if (loose) {
      const it = b.items[0];
      if (it) out.push(pad + itemLine(it, nameOf(it.exerciseId), fmt));
      return;
    }
    // A group reads better with a blank line before its header.
    if (out.length && out[out.length - 1] !== '') out.push('');
    const head: string[] = [];
    if (b.type === 'superset') head.push('Superserie');
    if (b.rounds) head.push(`${b.rounds} rondas`);
    if (!head.length) head.push('Bloque');
    let line = head.join(' ');
    if (b.label) line += ` - ${b.label}`;
    out.push(`${pad}${line}:`);
    b.items.forEach((it) => out.push(`${pad}  ${itemLine(it, nameOf(it.exerciseId), fmt)}`));
    out.push('');
  };

  // Warmup/cooldown are written Python-style: a title line, then everything
  // indented under it. Main sits at column 0 and needs no title. Inside a
  // section, each PART is its format header with its blocks indented under
  // it; blocks outside any part sit at the section's own column. Legacy
  // data (no part blocks, a section-level format) is written as one part.
  const writeSection = (
    section: BlockSection,
    format: WorkoutFormat | null | undefined,
    config: FormatConfig | null | undefined,
  ) => {
    const blocks = bySection(section);
    if (section !== 'main' && blocks.length === 0 && !format) return;
    const pad = section === 'main' ? '' : '  ';
    if (out.length) out.push('');
    if (section !== 'main') out.push(SECTION_TITLE[section]);
    const hasParts = blocks.some((b) => b.kind === 'part');
    if (!hasParts) {
      const fmt = section === 'main' ? (format ?? 'for_time') : (format ?? null);
      if (fmt) out.push(pad + formatHeader(fmt, config));
      const inner = fmt ? pad + '  ' : pad;
      blocks.forEach((b) => writeBlock(b, inner, fmt));
    } else {
      blocks.forEach((b, i) => {
        // Blank line between top-level parts/blocks, not after the section title.
        if (i > 0 && out[out.length - 1] !== '') out.push('');
        if (b.kind === 'part') {
          const fmt = b.format ?? 'for_time';
          out.push(pad + formatHeader(fmt, b.formatConfig));
          (b.blocks ?? []).forEach((c) => writeBlock(c, pad + '  ', fmt));
          out.push('');
        } else {
          writeBlock(b, pad, null);
        }
      });
    }
    while (out[out.length - 1] === '') out.pop();
  };

  writeSection('warmup', w.warmupFormat, w.warmupFormatConfig);
  writeSection('main', w.format, w.formatConfig);
  writeSection('cooldown', w.cooldownFormat, w.cooldownFormatConfig);
  return out.join('\n') + '\n';
}
