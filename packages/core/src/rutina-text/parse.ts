import type {
  BlockSection,
  BlockType,
  CreateWorkoutInput,
  FormatConfig,
  LoadPrescription,
  MeasurementType,
  Tempo,
  TempoPhase,
  WorkoutFormat,
} from '@dmtx/schemas';
import { Catalog } from './catalog';
import { DIST, DUR, NUM, parseDistance, parseDuration } from './normalize';
import type {
  CatalogExercise,
  Diagnostic,
  LineInfo,
  ParsedBlock,
  ParsedItem,
  ParsedRutina,
  SectionFormat,
} from './types';

/*
 * Rutina text grammar (line based, Spanish/English keywords, case- and
 * accent-insensitive). See docs/rutina-text.md for the human version.
 *
 *   Calentamiento               section header (also Enfriamiento, Rutina)
 *   AMRAP 12 min                a PART: a format + the blocks indented under it
 *   3 rondas, descanso 1 min    group header; items follow until a blank line
 *   41 burpees                  item: count + exercise + modifiers
 *   descanso 90s                rest line
 *   // nota                     comment (whole line) or trailing note
 */

// Like `fold` but keeps every character position (no trim/collapse) so column
// ranges computed on the folded line map back to the original.
function foldKeep(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const WS = (n: number) => ' '.repeat(n);

/** Replace the first match with spaces (same length) so positions are stable. */
function mask(s: string, re: RegExp): { m: RegExpMatchArray | null; s: string } {
  const m = s.match(re);
  if (!m || m.index == null) return { m: null, s };
  return { m, s: s.slice(0, m.index) + WS(m[0].length) + s.slice(m.index + m[0].length) };
}

const SECTION_RE =
  /^\s*(calentamiento|warm ?-?up|enfriamiento|cool ?-?down|vuelta a la calma|principal|main|rutina|wod)\s*:?\s*$/;
const SECTION_OF: Record<string, BlockSection> = {
  calentamiento: 'warmup',
  warmup: 'warmup',
  'warm-up': 'warmup',
  'warm up': 'warmup',
  enfriamiento: 'cooldown',
  cooldown: 'cooldown',
  'cool-down': 'cooldown',
  'cool down': 'cooldown',
  'vuelta a la calma': 'cooldown',
  principal: 'main',
  main: 'main',
  rutina: 'main',
  wod: 'main',
};

const FORMAT_RE =
  /^\s*(amrap|e(\d+)?mom|tabata|for ?time|por tiempo|chipper|fuerza|strength|circuito|circuit)(?![a-z])\s*:?\s*(.*?)\s*$/;

const GROUP_KW = String.raw`(superserie|super serie|superset|circuito|circuit|bloque|block)`;
const GROUP_RE = new RegExp(
  String.raw`^\s*(?:${GROUP_KW}\s*)?(?:[x×]\s*)?(\d+)\s*(rondas?|rounds?|vueltas?|series?|sets?|veces)(?![a-z])(?:\s*(?:de|of))?\s*[:\-–,]?\s*(.*?)\s*$`,
);
const GROUP_KW_RE = new RegExp(
  String.raw`^\s*${GROUP_KW}(?![a-z])(?:\s*[x×]?\s*(\d+))?\s*[:\-–,]?\s*(.*?)\s*$`,
);

const REST_KW = String.raw`(?:descanso|desc|rest|pausa|recuperacion)`;
const REST_LINE_RE = new RegExp(
  String.raw`^\s*(?:${REST_KW}\.?\s*:?\s*(?:de\s+)?(${DUR})|(${DUR})\s*(?:de\s+)?${REST_KW})\s*$`,
);

const UNIT = String.raw`(kg|kgs|kilos|lb|lbs|libras)`;
const ROUNDS_WORD = String.raw`(?:rondas?|rounds?|vueltas?)`;
const CAP_RE = new RegExp(
  String.raw`(?:time ?cap|cap|tiempo limite|tiempo maximo|limite|tope|max(?:imo)?)\s*:?\s*(?:de\s+)?(${DUR})`,
);

const phase = (c: string): TempoPhase => (c === 'x' ? 'X' : Number(c));
const unitOf = (u: string | undefined): 'kg' | 'lb' => (u && /^l/.test(u) ? 'lb' : 'kg');
const num = (s: string) => Number(s.replace(',', '.'));

interface Ctx {
  catalog: Catalog;
  diagnostics: Diagnostic[];
}

function diag(ctx: Ctx, d: Diagnostic) {
  ctx.diagnostics.push(d);
}

// --- Format headers ----------------------------------------------------------

function parseFormat(
  ctx: Ctx,
  line: number,
  kw: string,
  emomMinutes: string | undefined,
  rest: string,
): SectionFormat | null {
  const needs = (what: string) =>
    diag(ctx, {
      line,
      from: 0,
      to: 0,
      severity: 'error',
      code: 'format_needs_config',
      message: what,
    });
  const dur = (s: string) => {
    const m = s.match(new RegExp(DUR));
    return m ? parseDuration(m[0]) : null;
  };
  const roundsOf = (s: string) => {
    const m = s.match(new RegExp(String.raw`(\d+)\s*${ROUNDS_WORD}`));
    return m ? Number(m[1]) : null;
  };
  const capOf = (s: string) => {
    const m = s.match(CAP_RE);
    return m ? (parseDuration(m[1]!) ?? undefined) : undefined;
  };
  const cfg = (c: FormatConfig): SectionFormat => ({ format: c.format, config: c, line });

  if (kw === 'amrap') {
    const total = dur(rest);
    if (!total) {
      needs('AMRAP necesita una duración, p. ej. "AMRAP 12 min".');
      return null;
    }
    return cfg({ format: 'amrap', configVersion: 1, totalSeconds: total });
  }
  if (kw.endsWith('mom')) {
    let interval = emomMinutes ? Number(emomMinutes) * 60 : 60;
    let rounds: number | null = null;
    const nx = rest.match(new RegExp(String.raw`(\d+)\s*[x×]\s*(${DUR})`));
    if (nx) {
      rounds = Number(nx[1]);
      interval = parseDuration(nx[2]!) ?? interval;
    } else {
      const total = dur(rest);
      const r = roundsOf(rest) ?? (rest.match(/^(\d+)\s*$/) ? Number(rest) : null);
      if (r) rounds = r;
      else if (total) rounds = Math.max(1, Math.round(total / interval));
    }
    if (!rounds) {
      needs('EMOM necesita duración o rondas, p. ej. "EMOM 10 min" o "EMOM 10 x 90s".');
      return null;
    }
    return cfg({ format: 'emom', configVersion: 1, intervalSeconds: interval, rounds });
  }
  if (kw === 'tabata') {
    let rounds = 8;
    let work = 20;
    let restS = 10;
    const full = rest.match(/(\d+)\s*[x×]\s*(\d+)\s*\/\s*(\d+)/);
    const wr = rest.match(/(\d+)\s*\/\s*(\d+)/);
    if (full) {
      rounds = Number(full[1]);
      work = Number(full[2]);
      restS = Number(full[3]);
    } else if (wr) {
      work = Number(wr[1]);
      restS = Number(wr[2]);
      rounds = roundsOf(rest) ?? rounds;
    } else {
      rounds = roundsOf(rest) ?? rounds;
    }
    return cfg({ format: 'tabata', configVersion: 1, workSeconds: work, restSeconds: restS, rounds });
  }
  if (kw === 'fuerza' || kw === 'strength') {
    return cfg({ format: 'strength', configVersion: 1 });
  }
  if (kw === 'chipper') {
    const timeCapSeconds = capOf(rest) ?? dur(rest) ?? undefined;
    return cfg({ format: 'chipper', configVersion: 1, timeCapSeconds });
  }
  if (kw === 'circuito' || kw === 'circuit') {
    const rounds = roundsOf(rest) ?? undefined;
    const rb = rest.match(new RegExp(String.raw`${REST_KW}\.?\s*:?\s*(?:de\s+)?(${DUR})`));
    const restBetweenRoundsSeconds = rb ? (parseDuration(rb[1]!) ?? undefined) : undefined;
    const timeCapSeconds = capOf(rest);
    return cfg({
      format: 'circuit',
      configVersion: 1,
      rounds,
      restBetweenRoundsSeconds,
      timeCapSeconds,
    });
  }
  // for time / por tiempo
  const rounds = roundsOf(rest) ?? undefined;
  const timeCapSeconds = capOf(rest) ?? dur(rest.replace(/(\d+)\s*rondas?/, '')) ?? undefined;
  return cfg({ format: 'for_time', configVersion: 1, rounds, timeCapSeconds });
}

// --- Items -------------------------------------------------------------------

const emptyItem = (line: number): ParsedItem => ({
  line,
  kind: 'exercise',
  rawName: '',
  nameRange: null,
  match: null,
  measure: 'reps',
  sets: null,
  reps: null,
  workSeconds: null,
  distanceMeters: null,
  restBetweenSeconds: null,
  tempoOverride: null,
  loadPrescription: null,
  perSide: false,
  intervalIndex: null,
  notes: null,
});

const TEMPO_WORD_RE =
  /\btempo\s*:?\s*([0-9x])\s*[-/. ]?\s*([0-9x])\s*[-/. ]?\s*([0-9x])\s*[-/. ]?\s*([0-9x])(?![\w])/;
const TEMPO_AT_RE = /@\s*([0-9x]{4})(?![\w%/.,])/;
const PERCENT_RE = new RegExp(String.raw`@\s*(${NUM})\s*%`);
const RPE_RE = new RegExp(String.raw`@?\s*\brpe\s*:?\s*(${NUM})`);
const BW_RE = /@\s*(?:bw|pc|corporal|peso corporal|bodyweight)(?![a-z])/;
const ADDED_RE = new RegExp(String.raw`\+\s*(${NUM})\s*${UNIT}(?![a-z])`);
const ABS_AT_RE = new RegExp(String.raw`@\s*(${NUM})(?:\s*/\s*(${NUM}))?\s*${UNIT}?(?![a-z%])`);
const ABS_BARE_RE = new RegExp(
  String.raw`(?:\b(?:con|with|a)\s+)?(${NUM})(?:\s*/\s*(${NUM}))?\s*${UNIT}(?![a-z])`,
);
const PER_SIDE_RE =
  /\bc\/\s?(?:lado|u|l|pierna|brazo)\b|\b(?:por|cada|x) (?:lado|pierna|brazo)\b|\b(?:per|each) (?:side|leg|arm)\b/;
const INLINE_REST_RE = new RegExp(String.raw`\b${REST_KW}\.?\s*:?\s*(?:de\s+)?(${DUR})`);
const SETS_TIME_RE = new RegExp(String.raw`\b(\d+)\s*[x×*]\s*(${DUR})`);
const SETS_DIST_RE = new RegExp(String.raw`\b(\d+)\s*[x×*]\s*(${DIST})`);
const SETS_REPS_RE = /\b(\d+)\s*[x×*]\s*(\d+)(?![\w:'"%/])/;
const SERIES_RE = /\b(\d+)\s*(?:series?|sets?)\s*(?:de|of|[x×])?\s*(\d+)(?![\w:'"%/])/;
const REPS_WORD_RE = /\b(\d+)\s*(?:reps?|repeticiones|repes)(?![a-z])/;
const DUR_RE = new RegExp(String.raw`(?<![\w.,])${DUR}`);
const DIST_RE = new RegExp(String.raw`(?<![\w.,])${DIST}`);
const LEAD_COUNT_RE = /^\s*(\d+)\s+(?=\S)/;
const TRAIL_COUNT_RE = /\s+[x×]?\s*(\d+)\s*$/;
const MAX_RE = /\b(?:max|maximas?|maximo|al fallo|failure|amrap)\b/;
const INTERVAL_RE = /^\s*(?:min(?:uto)?\.?\s*)?(\d+)\s*[:).\]]\s+/;
const NOTE_RE = /\/\/(.*)$/;

export function parseItemLine(
  original: string,
  line: number,
  ctx: Ctx,
  opts: { format: WorkoutFormat | null },
): ParsedItem {
  const it = emptyItem(line);
  let s = foldKeep(original);
  let r: ReturnType<typeof mask>;

  r = mask(s, NOTE_RE);
  s = r.s;
  if (r.m) it.notes = r.m[1]!.trim() || null;

  r = mask(s, INTERVAL_RE);
  s = r.s;
  if (r.m && opts.format === 'emom') it.intervalIndex = Math.max(0, Number(r.m[1]) - 1);

  r = mask(s, TEMPO_WORD_RE);
  if (!r.m) r = mask(s, TEMPO_AT_RE);
  s = r.s;
  if (r.m) {
    const digits = r.m.length === 5 ? r.m.slice(1, 5) : r.m[1]!.split('');
    it.tempoOverride = {
      holdTop: phase(digits[0]!),
      eccentric: phase(digits[1]!),
      holdBottom: phase(digits[2]!),
      concentric: phase(digits[3]!),
    } satisfies Tempo;
  }

  // Load: one of percent / RPE / bodyweight / added / absolute.
  const load = ((): { m: RegExpMatchArray | null; s: string; load: LoadPrescription | null } => {
    let x = mask(s, PERCENT_RE);
    if (x.m) return { ...x, load: { type: 'percent_1rm', value: num(x.m[1]!) } };
    x = mask(s, RPE_RE);
    if (x.m) return { ...x, load: { type: 'rpe', value: num(x.m[1]!) } };
    x = mask(s, BW_RE);
    if (x.m) return { ...x, load: { type: 'bodyweight' } };
    x = mask(s, ADDED_RE);
    if (x.m)
      return { ...x, load: { type: 'bodyweight', addedValue: num(x.m[1]!), unit: unitOf(x.m[2]) } };
    x = mask(s, ABS_AT_RE);
    if (!x.m) x = mask(s, ABS_BARE_RE);
    if (x.m) {
      const women = x.m[2] ? num(x.m[2]) : undefined;
      return {
        ...x,
        load: {
          type: 'absolute',
          value: num(x.m[1]!),
          ...(women != null ? { womenValue: women } : {}),
          unit: unitOf(x.m[3]),
        },
      };
    }
    return { m: null, s, load: null };
  })();
  s = load.s;
  it.loadPrescription = load.load;

  r = mask(s, PER_SIDE_RE);
  s = r.s;
  if (r.m) it.perSide = true;

  r = mask(s, INLINE_REST_RE);
  s = r.s;
  if (r.m) it.restBetweenSeconds = parseDuration(r.m[1]!);

  r = mask(s, SETS_TIME_RE);
  s = r.s;
  if (r.m) {
    it.sets = Number(r.m[1]);
    it.workSeconds = parseDuration(r.m[2]!);
  } else {
    r = mask(s, SETS_DIST_RE);
    s = r.s;
    if (r.m) {
      it.sets = Number(r.m[1]);
      it.distanceMeters = parseDistance(r.m[2]!);
    } else {
      r = mask(s, SETS_REPS_RE);
      if (!r.m) r = mask(s, SERIES_RE);
      s = r.s;
      if (r.m) {
        it.sets = Number(r.m[1]);
        it.reps = Number(r.m[2]);
      }
    }
  }

  r = mask(s, REPS_WORD_RE);
  s = r.s;
  if (r.m) it.reps = Number(r.m[1]);

  if (it.workSeconds == null && it.distanceMeters == null) {
    r = mask(s, DUR_RE);
    s = r.s;
    if (r.m) it.workSeconds = parseDuration(r.m[0]);
    else {
      r = mask(s, DIST_RE);
      s = r.s;
      if (r.m) it.distanceMeters = parseDistance(r.m[0]);
    }
  }

  r = mask(s, MAX_RE);
  s = r.s;
  if (r.m) it.notes = it.notes ? `${r.m[0]} · ${it.notes}` : r.m[0];

  // A bare count: leading ("41 burpees") or trailing ("burpees x41").
  const count = (n: number) => {
    if (it.workSeconds != null || it.distanceMeters != null) {
      if (it.sets == null) it.sets = n;
    } else if (it.reps == null) it.reps = n;
    else if (it.sets == null) it.sets = n;
  };
  r = mask(s, LEAD_COUNT_RE);
  s = r.s;
  if (r.m) count(Number(r.m[1]));
  else {
    r = mask(s, TRAIL_COUNT_RE);
    s = r.s;
    if (r.m) count(Number(r.m[1]));
  }

  it.measure = (
    it.workSeconds != null ? 'time' : it.distanceMeters != null ? 'distance' : 'reps'
  ) satisfies MeasurementType;

  // What's left is the exercise name.
  let from = s.search(/\S/);
  let to = s.replace(/\s+$/, '').length;
  if (from < 0) {
    diag(ctx, {
      line,
      from: 0,
      to: original.length,
      severity: 'error',
      code: 'missing_exercise',
      message:
        it.distanceMeters != null || it.workSeconds != null || it.reps != null
          ? 'Falta el ejercicio: escribe qué se hace, p. ej. "800 m carrera".'
          : 'Falta el nombre del ejercicio.',
    });
    return it;
  }
  let name = s.slice(from, to).replace(/\s{2,}/g, ' ');
  // Trim connector words and punctuation left behind by the modifiers.
  const lead = name.match(/^(?:[-–:,.;x×]+\s*|(?:de|of|del)\s+)+/);
  if (lead) {
    from += lead[0].length;
    name = name.slice(lead[0].length);
  }
  const trail = name.match(/(?:\s*[-–:,.;]+|\s+(?:de|of|del|x|×))+$/);
  if (trail) {
    to -= trail[0].length;
    name = name.slice(0, name.length - trail[0].length);
  }
  it.rawName = original.slice(from, to);
  it.nameRange = [from, to];

  const res = ctx.catalog.resolve(name);
  it.match = res.match;
  if (!res.match) {
    diag(ctx, {
      line,
      from,
      to,
      severity: 'error',
      code: 'unknown_exercise',
      // Suggestions travel separately so the UI can make each one clickable.
      message: `Ejercicio no encontrado: "${it.rawName}".`,
      suggestions: res.suggestions.slice(0, 3),
    });
  } else if (res.ambiguous) {
    diag(ctx, {
      line,
      from,
      to,
      severity: 'warning',
      code: 'ambiguous_exercise',
      message: `"${it.rawName}" coincide con varios ejercicios; se usó "${res.match.name}".`,
      suggestions: res.suggestions,
    });
  }

  if (
    it.reps == null &&
    it.workSeconds == null &&
    it.distanceMeters == null &&
    opts.format !== 'tabata' &&
    !it.notes?.match(MAX_RE)
  ) {
    diag(ctx, {
      line,
      from,
      to,
      severity: 'warning',
      code: 'missing_count',
      message: 'Sin cantidad: agrega repeticiones, tiempo o distancia (p. ej. "10 burpees").',
    });
  }
  if (opts.format === 'tabata') it.measure = 'time';
  return it;
}

// --- Document ----------------------------------------------------------------

export interface ParseOptions {
  catalog: CatalogExercise[] | Catalog;
}

export function parseRutina(text: string, opts: ParseOptions): ParsedRutina {
  const catalog = opts.catalog instanceof Catalog ? opts.catalog : new Catalog(opts.catalog);
  const ctx: Ctx = { catalog, diagnostics: [] };
  const rawLines = text.split(/\r?\n/);
  const lines: LineInfo[] = [];
  const blocks: ParsedBlock[] = [];
  const formats: Record<BlockSection, SectionFormat | null> = {
    main: null,
    warmup: null,
    cooldown: null,
  };
  const seen: Record<BlockSection, boolean> = { main: false, warmup: false, cooldown: false };

  let section: BlockSection = 'main';
  // Python-style scoping: content indented under a section header belongs to
  // it; dedenting back to the header's column returns to the main section.
  // A section whose first content line is NOT indented runs in "flat" mode
  // (until the next header), which keeps the older colon style working.
  let sectionHeaderIndent = -1;
  let sectionMode: 'indent' | 'flat' | null = null;
  let group: ParsedBlock | null = null;
  let groupIndent: number | null = null;
  let groupHeaderIndent = 0;
  // The open part (a format header + what is indented under it). A part whose
  // first content line is not indented runs "flat" until the next format line
  // or section header (the older style). Parts never nest.
  let part: ParsedBlock | null = null;
  let partIndent = -1;
  let partMode: 'indent' | 'flat' | null = null;

  const closeGroup = () => {
    group = null;
    groupIndent = null;
  };
  const closePart = () => {
    part = null;
    partIndent = -1;
    partMode = null;
  };
  /** Append a block to the open part, or to the section. */
  const pushBlock = (b: ParsedBlock) => {
    if (part) (part.children ??= []).push(b);
    else blocks.push(b);
  };
  const kindOf = (k: string | undefined, rounds: number | null): BlockType => {
    const f = k ? foldKeep(k).replace(/\s+/g, '') : '';
    if (f.startsWith('super')) return 'superset';
    if (f.startsWith('circuit')) return 'circuit';
    if (f) return 'single';
    return rounds ? 'circuit' : 'single';
  };
  const openGroup = (line: number, kw: string | undefined, rounds: number | null, tail: string) => {
    closeGroup();
    const b: ParsedBlock = {
      line,
      section,
      kind: 'group',
      type: kindOf(kw, rounds),
      rounds,
      label: null,
      items: [],
      loose: false,
    };
    groupHeaderIndent = rawLines[line]!.length - rawLines[line]!.trimStart().length;
    // "3 rondas, descanso 1 min · Pierna" → trailing rest item + label.
    let t = tail;
    const rb = t.match(new RegExp(String.raw`${REST_KW}\.?\s*:?\s*(?:de\s+)?(${DUR})`));
    let restAfter: number | null = null;
    if (rb) {
      restAfter = parseDuration(rb[1]!);
      t = (t.slice(0, rb.index) + ' ' + t.slice(rb.index! + rb[0].length)).trim();
    }
    t = t.replace(/^[-–:,.;·]+\s*|\s*[-–:,.;·]+$/g, '').trim();
    if (t) b.label = t;
    pushBlock(b);
    group = b;
    groupIndent = null;
    return { block: b, restAfter };
  };
  // Pending "descanso" from a group header, appended after the group's items.
  let pendingGroupRest: { block: ParsedBlock; seconds: number } | null = null;
  const flushGroupRest = () => {
    if (pendingGroupRest) {
      pendingGroupRest.block.items.push({
        ...emptyItem(pendingGroupRest.block.line),
        kind: 'rest',
        measure: 'time',
        workSeconds: pendingGroupRest.seconds,
      });
      pendingGroupRest = null;
    }
  };

  rawLines.forEach((raw, i) => {
    const f = foldKeep(raw);
    const trimmed = f.trim();
    const indent = f.length - f.trimStart().length;
    const info = (kind: LineInfo['kind']) => lines.push({ kind, section });

    if (!trimmed) {
      flushGroupRest();
      closeGroup();
      return info('blank');
    }
    if (/^\s*(#|\/\/)/.test(f)) return info('comment');

    const sec = trimmed.match(SECTION_RE);
    if (sec) {
      flushGroupRest();
      closeGroup();
      closePart();
      section = SECTION_OF[sec[1]!.replace(/\s+/g, ' ')] ?? 'main';
      sectionHeaderIndent = indent;
      sectionMode = null;
      return info('section');
    }

    // Content line: resolve the section's mode, or leave it on dedent.
    if (section !== 'main') {
      if (sectionMode === null) sectionMode = indent > sectionHeaderIndent ? 'indent' : 'flat';
      else if (sectionMode === 'indent' && indent <= sectionHeaderIndent) {
        flushGroupRest();
        closeGroup();
        closePart();
        section = 'main';
        sectionMode = null;
        sectionHeaderIndent = -1;
      }
    }
    // A part scopes by indentation too: dedenting to its header's column leaves it.
    if (part) {
      if (partMode === null) partMode = indent > partIndent ? 'indent' : 'flat';
      else if (partMode === 'indent' && indent <= partIndent) {
        flushGroupRest();
        closeGroup();
        closePart();
      }
    }
    // A group whose items are indented past its header closes on dedent.
    if (group && groupIndent != null && groupIndent > groupHeaderIndent && indent <= groupHeaderIndent) {
      flushGroupRest();
      closeGroup();
    }

    const fm = f.match(FORMAT_RE);
    if (fm) {
      const kw = fm[1]!.replace(/\s+/g, ' ');
      // "Circuito 3 rondas" inside existing content is a group, not a new part.
      const isCircuitGroup = /^circuit/.test(kw) && seen[section] && /\d/.test(fm[3] ?? '');
      if (!isCircuitGroup) {
        flushGroupRest();
        closeGroup();
        closePart();
        const parsed = parseFormat(ctx, i, kw, fm[2], fm[3] ?? '');
        if (parsed) {
          if (!formats[section]) formats[section] = parsed;
          const b: ParsedBlock = {
            line: i,
            section,
            kind: 'part',
            type: 'single',
            rounds: null,
            label: null,
            items: [],
            loose: false,
            format: parsed.config,
            children: [],
          };
          blocks.push(b);
          part = b;
          partIndent = indent;
          partMode = null;
        }
        seen[section] = true;
        return info('format');
      }
    }

    const rest = trimmed.match(REST_LINE_RE);
    if (rest) {
      const seconds = parseDuration(rest[1] ?? rest[2] ?? '') ?? 0;
      const item: ParsedItem = { ...emptyItem(i), kind: 'rest', measure: 'time', workSeconds: seconds };
      if (group) {
        if (groupIndent == null) groupIndent = indent;
        (group as ParsedBlock).items.push(item);
      } else {
        flushGroupRest();
        closeGroup();
        pushBlock({
          line: i,
          section,
          kind: 'rest',
          type: 'single',
          rounds: null,
          label: null,
          items: [item],
          loose: true,
        });
      }
      seen[section] = true;
      return info('rest');
    }

    const g = f.match(GROUP_RE) ?? null;
    const gk = g ? null : f.match(GROUP_KW_RE);
    if (g || gk) {
      flushGroupRest();
      const kw = g ? g[1] : gk![1];
      const rounds = g ? Number(g[2]) : gk![2] ? Number(gk![2]) : null;
      const tail = g ? (g[4] ?? '') : (gk![3] ?? '');
      const { block, restAfter } = openGroup(i, kw, rounds, tail);
      if (restAfter) pendingGroupRest = { block, seconds: restAfter };
      seen[section] = true;
      return info('group');
    }

    // Exercise line.
    const item = parseItemLine(raw, i, ctx, { format: part?.format?.format ?? null });
    if (group) {
      if (groupIndent == null) groupIndent = indent;
      (group as ParsedBlock).items.push(item);
    } else {
      pushBlock({
        line: i,
        section,
        kind: 'group',
        type: 'single',
        rounds: null,
        label: null,
        items: [item],
        loose: true,
      });
    }
    seen[section] = true;
    return info('item');
  });
  flushGroupRest();

  return {
    main: formats.main,
    warmup: formats.warmup,
    cooldown: formats.cooldown,
    blocks,
    diagnostics: ctx.diagnostics.sort((a, b) => a.line - b.line || a.from - b.from),
    lines,
  };
}

export const hasErrors = (p: ParsedRutina) => p.diagnostics.some((d) => d.severity === 'error');

export type RutinaStructureInput = Pick<
  CreateWorkoutInput,
  | 'format'
  | 'formatConfig'
  | 'warmupFormat'
  | 'warmupFormatConfig'
  | 'cooldownFormat'
  | 'cooldownFormatConfig'
  | 'blocks'
>;

type BlockInput = CreateWorkoutInput['blocks'][number];

function blockInput(b: ParsedBlock): BlockInput {
  return {
    kind: b.kind,
    section: b.section,
    type: b.type,
    rounds: b.rounds,
    label: b.label,
    notes: null,
    format: b.kind === 'part' ? (b.format?.format ?? null) : null,
    formatConfig: b.kind === 'part' ? (b.format ?? null) : null,
    blocks: b.kind === 'part' ? (b.children ?? []).map(blockInput) : [],
    items: b.items.map((it) => {
      const rest = it.kind === 'rest';
      return {
        kind: it.kind,
        exerciseId: rest ? null : (it.match?.id ?? null),
        measure: rest ? null : it.measure,
        sets: rest ? null : it.sets,
        reps: rest ? null : it.reps,
        workSeconds: it.workSeconds,
        distanceMeters: rest ? null : it.distanceMeters,
        restBetweenSeconds: rest ? null : it.restBetweenSeconds,
        tempoOverride: rest ? null : it.tempoOverride,
        loadPrescription: rest ? null : it.loadPrescription,
        perSide: it.perSide,
        intervalIndex: it.intervalIndex,
        notes: it.notes,
      };
    }),
  };
}

/**
 * The API payload fields for the parsed structure. Unresolved exercises get
 * `exerciseId: null`. The workout-level format is the first part's (for lists
 * and filters); each part carries its own on its block.
 */
export function toWorkoutInput(p: ParsedRutina): RutinaStructureInput {
  const main = p.main ?? {
    format: 'for_time' as const,
    config: { format: 'for_time' as const, configVersion: 1 },
  };
  return {
    format: main.format,
    formatConfig: main.config,
    warmupFormat: p.warmup?.format ?? null,
    warmupFormatConfig: p.warmup?.config ?? null,
    cooldownFormat: p.cooldown?.format ?? null,
    cooldownFormatConfig: p.cooldown?.config ?? null,
    blocks: p.blocks.map(blockInput),
  };
}
