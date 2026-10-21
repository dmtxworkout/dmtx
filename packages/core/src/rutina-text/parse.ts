import type {
  BlockSection,
  SkillGoal,
  BlockType,
  CreateWorkoutInput,
  FormatConfig,
  LoadPrescription,
  MeasurementType,
  Tempo,
  TempoPhase,
  WorkoutFormat,
} from '@dmtx/schemas';
import { Catalog, damerauLevenshtein } from './catalog';
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
  /^\s*(calentamiento|warm ?-?up|enfriamiento|cool ?-?down|vuelta a la calma|principal|main|rutina|wod|objetivo|objetivos|goal|goals)\s*:?\s*$/;
const SECTION_OF: Record<string, BlockSection> = {
  objetivo: 'goal',
  objetivos: 'goal',
  goal: 'goal',
  goals: 'goal',
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
// Keywords a misspelled first word is checked against ("Intervalor 2:" → intervalo).
const KEYWORDS = [
  'intervalo',
  'descanso',
  'rondas',
  'superserie',
  'calentamiento',
  'enfriamiento',
  'rutina',
  'amrap',
  'emom',
  'tabata',
  'chipper',
  'fuerza',
  'circuito',
  'bloque',
];
/** The keyword the first word of `line` was probably meant to be, if any. */
function keywordTypo(line: string, catalog: Catalog): { word: string; from: number; keyword: string } | null {
  const m = line.match(/^(\s*(?:\d+\s+)?)([a-z]{4,})/);
  if (!m) return null;
  const word = m[2]!;
  if (KEYWORDS.includes(word)) return null;
  // A real exercise name ("remo", "rondas de box") is never a keyword typo.
  if (catalog.resolve(word).match) return null;
  // Short words need a closer match: "remo" is not a typo of "emom".
  const maxD = word.length >= 6 ? 2 : 1;
  let best: { keyword: string; d: number } | null = null;
  for (const kw of KEYWORDS) {
    const d = damerauLevenshtein(word, kw);
    if (d <= maxD && (!best || d < best.d)) best = { keyword: kw, d };
  }
  return best ? { word, from: m[1]!.length, keyword: best.keyword } : null;
}

// "intervalo 2:" (or "min 2:") on its own line: the work for that EMOM interval.
const SLOT_RE = /^\s*(?:min(?:uto)?|intervalo)\.?\s*(\d+)\s*:?\s*$/;
/** "descanso 1 min" at the start of a line, whatever follows. */
const REST_START_RE = new RegExp(String.raw`^${REST_KW}\.?\s*:?\s*(?:de\s+)?(?:${DUR})`);
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

/** "intervalo N:" only means something under an EMOM header; elsewhere it is ignored. */
function intervalOutsideEmom(ctx: Ctx, line: number, raw: string, matched: string) {
  const from = Math.max(0, raw.search(/\S/));
  diag(ctx, {
    line,
    from,
    to: from + matched.trim().length,
    severity: 'warning',
    code: 'interval_outside_emom',
    message: 'Los intervalos solo aplican dentro de un EMOM; aquí se ignora.',
  });
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
const INTERVAL_RE = /^\s*(?:(?:min(?:uto)?|intervalo)\.?\s*)?(\d+)\s*[:).\]]\s+/;
// Trailing markers: "# texto" is an internal comment (dropped, always to the end
// of the line); "// texto" before it is a note the athlete sees.
const COMMENT_RE = /#.*$/;
const NOTE_RE = /\/\/(.*)$/;

export function parseItemLine(
  original: string,
  line: number,
  ctx: Ctx,
  opts: { format: WorkoutFormat | null; goal?: boolean },
): ParsedItem {
  const it = emptyItem(line);
  let s = foldKeep(original);
  let r: ReturnType<typeof mask>;

  r = mask(s, COMMENT_RE);
  s = r.s;
  r = mask(s, NOTE_RE);
  s = r.s;
  // Keep the note as written (accents, case): slice the original, not the fold.
  if (r.m) it.notes = original.slice(r.m.index! + 2).split('#')[0]!.trim() || null;

  r = mask(s, INTERVAL_RE);
  s = r.s;
  if (r.m) {
    if (opts.format === 'emom') it.intervalIndex = Math.max(0, Number(r.m[1]) - 1);
    else intervalOutsideEmom(ctx, line, original, r.m[0]);
  }

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
  // Only a name written exactly (or an alias) counts: a typo or a partial name
  // is an error with the real name as the fix, so nothing half-written reaches
  // the rutina or its preview.
  const exact = (m: typeof res.match) => (m && m.confidence === 'exact' ? m : null);
  it.match = exact(res.match);
  // "10 burpees 20 sentadillas": the name does not resolve but, split at the
  // inner count, both halves do — two exercises on one line.
  const split = !it.match ? it.rawName.match(/^(.*?\S)\s+(\d+(?:\s*[x×]\s*\d+)?)\s+(\S.*)$/) : null;
  if (split && exact(ctx.catalog.resolve(split[1]!).match) && exact(ctx.catalog.resolve(split[3]!).match)) {
    diag(ctx, {
      line,
      from,
      to,
      severity: 'error',
      code: 'two_items',
      message: `Un ejercicio por línea: pon "${split[2]} ${split[3]}" en la línea siguiente.`,
    });
  } else if (!it.match) {
    // The closest name first: a typo's fix is usually the top suggestion.
    const suggestions = [...new Set([...(res.match ? [res.match.name] : []), ...res.suggestions])].slice(0, 3);
    diag(ctx, {
      line,
      from,
      to,
      severity: 'error',
      code: 'unknown_exercise',
      // Suggestions travel separately so the UI can make each one clickable.
      message: `Ejercicio no encontrado: "${it.rawName}".`,
      suggestions,
    });
  } else if (it.match.archived) {
    diag(ctx, {
      line,
      from,
      to,
      severity: 'warning',
      code: 'archived_exercise',
      message: `"${it.match.name}" está archivado: ya no se sugiere. Restáuralo en Ejercicios si lo vas a seguir usando.`,
    });
  } else if (res.ambiguous) {
    diag(ctx, {
      line,
      from,
      to,
      severity: 'warning',
      code: 'ambiguous_exercise',
      message: `"${it.rawName}" coincide con varios ejercicios; se usó "${it.match.name}".`,
      suggestions: res.suggestions,
    });
  }

  if (
    it.reps == null &&
    it.workSeconds == null &&
    it.distanceMeters == null &&
    opts.format !== 'tabata' &&
    !opts.goal &&
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
    goal: null,
  };
  const seen: Record<BlockSection, boolean> = { main: false, warmup: false, cooldown: false, goal: false };

  let section: BlockSection = 'main';
  // Python-style scoping: content indented under a section header belongs to
  // it; dedenting back to the header's column returns to the main section.
  let sectionHeaderIndent = -1;

  // Open containers, innermost last. A container is a part (format header) or
  // a group (rounds / "intervalo N:" header); anything indented past its header
  // belongs to it, so parts and groups nest freely.
  type Frame = {
    block: ParsedBlock;
    indent: number;
    /** "intervalo N:" group: the 0-based slot stamped on its exercises. */
    slot: number | null;
    /** "3 rondas, descanso 1 min": a rest item appended when the group closes. */
    pendingRest: number | null;
  };
  const stack: Frame[] = [];
  const top = (): Frame | null => stack[stack.length - 1] ?? null;
  /** The innermost open part: the format the exercises play on. */
  const innerFormat = (): WorkoutFormat | null => {
    for (let k = stack.length - 1; k >= 0; k -= 1) {
      const b = stack[k]!.block;
      if (b.kind === 'part') return b.format?.format ?? null;
    }
    return null;
  };
  const innerSlot = (): number | null => {
    for (let k = stack.length - 1; k >= 0; k -= 1) {
      const slot = stack[k]!.slot;
      if (slot != null) return slot;
    }
    return null;
  };
  /** The list the next block lands in: the innermost container's children, or the section. */
  const siblings = (): ParsedBlock[] => {
    const t = top();
    if (!t) return blocks;
    return (t.block.children ??= []);
  };
  const looseRun = (line: number): ParsedBlock => ({
    line,
    section,
    kind: 'group',
    type: 'single',
    rounds: null,
    label: null,
    notes: null,
    items: [],
    loose: true,
  });
  /** A group holds either exercise lines or child blocks: once it has children,
   *  further lines become loose runs among them (order kept). A part always
   *  holds blocks, so its lines are loose runs from the start. */
  const holdsItems = (t: Frame | null) => !!t && t.block.kind !== 'part' && !t.block.children?.length;
  const addItem = (item: ParsedItem, line: number) => {
    const t = top();
    const slot = innerSlot();
    if (slot != null && item.intervalIndex == null && item.kind === 'exercise') item.intervalIndex = slot;
    if (holdsItems(t)) {
      t!.block.items.push(item);
      return;
    }
    const list = siblings();
    const last = list[list.length - 1];
    if (last?.loose && last.kind !== 'rest') last.items.push(item);
    else list.push({ ...looseRun(line), items: [item] });
  };
  const openContainer = (block: ParsedBlock, indent: number, slot: number | null, pendingRest: number | null) => {
    const t = top();
    // Items already in the container move into a loose run so the new block follows them.
    if (t && t.block.items.length) {
      const run = { ...looseRun(t.block.items[0]!.line), items: t.block.items };
      t.block.items = [];
      (t.block.children ??= []).push(run);
    }
    siblings().push(block);
    stack.push({ block, indent, slot, pendingRest });
  };
  const closeTop = () => {
    const t = stack.pop();
    if (!t) return;
    const b = t.block;
    if (t.pendingRest) {
      const rest: ParsedItem = { ...emptyItem(b.line), kind: 'rest', measure: 'time', workSeconds: t.pendingRest };
      if (b.children?.length) b.children.push({ ...looseRun(b.line), kind: 'rest', items: [rest] });
      else b.items.push(rest);
    }
    // A group header with nothing indented under it is almost always a missed indent.
    const hasWork = b.items.some((it) => it.kind === 'exercise') || (b.children?.length ?? 0) > 0;
    if (b.kind === 'group' && !hasWork) {
      const headerLine = rawLines[b.line] ?? '';
      diag(ctx, {
        line: b.line,
        from: headerLine.length - headerLine.trimStart().length,
        to: headerLine.trimEnd().length,
        severity: 'warning',
        code: 'empty_group',
        message: 'Este bloque está vacío: indenta debajo los ejercicios que van dentro.',
      });
    }
  };
  /** Close every container whose header sits at `indent` or deeper. */
  const dedentTo = (indent: number) => {
    while (top() && indent <= top()!.indent) closeTop();
  };
  const closeAll = () => {
    while (top()) closeTop();
  };
  const kindOf = (k: string | undefined, rounds: number | null): BlockType => {
    const f = k ? foldKeep(k).replace(/\s+/g, '') : '';
    if (f.startsWith('super')) return 'superset';
    if (f.startsWith('circuit')) return 'circuit';
    if (f) return 'single';
    return rounds ? 'circuit' : 'single';
  };
  const openGroup = (line: number, indent: number, kw: string | undefined, rounds: number | null, tail: string) => {
    const b: ParsedBlock = {
      line,
      section,
      kind: 'group',
      type: kindOf(kw, rounds),
      rounds,
      label: null,
      notes: null,
      items: [],
      loose: false,
    };
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
    openContainer(b, indent, null, restAfter);
    return b;
  };

  rawLines.forEach((raw, i) => {
    // Structural lines (headers, rests) may end in "# comentario" (dropped) or
    // "// nota" (kept as the block's note); items handle their own tails.
    const bare = raw.replace(/#.*$/, '');
    const headerNote = bare.match(/\/\/(.*)$/)?.[1]?.trim() || null;
    const f = foldKeep(bare.replace(/\/\/.*$/, ''));
    const trimmed = f.trim();
    const indent = raw.length - raw.trimStart().length;
    const info = (kind: LineInfo['kind']) => lines.push({ kind, section });

    // Blank lines separate nothing: only indentation scopes (as in Python).
    if (!raw.trim()) return info('blank');
    if (/^\s*#/.test(raw)) return info('comment');

    const sec = trimmed.match(SECTION_RE);
    if (sec) {
      closeAll();
      section = SECTION_OF[sec[1]!.replace(/\s+/g, ' ')] ?? 'main';
      sectionHeaderIndent = indent;
      return info('section');
    }

    // Content line: dedenting to the section header's column returns to main.
    if (section !== 'main' && indent <= sectionHeaderIndent) {
      closeAll();
      section = 'main';
      sectionHeaderIndent = -1;
    }
    // Dedenting to a container's header column leaves it (and anything inside).
    dedentTo(indent);

    // The "Objetivo" section (skills) holds marks to reach: one exercise per
    // line with its amount. Structure (formats, rondas, descansos) has no
    // meaning there.
    if (section === 'goal') {
      const structural =
        FORMAT_RE.test(f) || REST_START_RE.test(trimmed) || GROUP_RE.test(f) || GROUP_KW_RE.test(f) || SLOT_RE.test(trimmed);
      if (structural) {
        diag(ctx, {
          line: i,
          from: indent,
          to: indent + trimmed.length,
          severity: 'error',
          code: 'goal_structure',
          message: 'En Objetivo solo van ejercicios con su marca, p. ej. "3 Dominadas" o "Plancha 60s".',
        });
        return info('item');
      }
      if (/^\/\//.test(trimmed)) return info('note');
      const it = parseItemLine(raw, i, ctx, { format: null, goal: true });
      if (it.match && it.reps == null && it.workSeconds == null && it.distanceMeters == null && !it.loadPrescription) {
        diag(ctx, {
          line: i,
          from: indent,
          to: indent + trimmed.length,
          severity: 'error',
          code: 'goal_needs_amount',
          message: `¿Cuánto? Pon la marca a alcanzar: "10 ${it.match.name}", "${it.match.name} 60s" o "${it.match.name} 5x5 @100 kg".`,
        });
      }
      siblings().push({ ...looseRun(i), items: [it] });
      seen.goal = true;
      return info('item');
    }

    // "// texto" alone on a line: a note the athlete sees, attached to what is
    // right above it — the last exercise or block in the open container (or
    // the container itself when it is still empty).
    const noteLine = raw.trim().match(/^\/\/([^#]*)/);
    if (noteLine) {
      const text = noteLine[1]!.trim();
      const t = top();
      let target: { notes: string | null } | null;
      if (t && t.block.items.length) target = t.block.items[t.block.items.length - 1]!;
      else {
        const list = siblings();
        const last = list[list.length - 1];
        target = last ? (last.loose ? last.items[last.items.length - 1]! : last) : (t?.block ?? null);
      }
      if (!target) {
        diag(ctx, {
          line: i,
          from: indent,
          to: indent + trimmed.length,
          severity: 'warning',
          code: 'orphan_note',
          message: 'La nota necesita un ejercicio, un bloque o una parte encima.',
        });
      } else if (text) {
        target.notes = target.notes ? `${target.notes} · ${text}` : text;
      }
      return info('note');
    }

    const fm = f.match(FORMAT_RE);
    if (fm) {
      const kw = fm[1]!.replace(/\s+/g, ' ');
      // "Circuito 3 rondas" inside existing content is a group, not a new part.
      const isCircuitGroup = /^circuit/.test(kw) && seen[section] && /\d/.test(fm[3] ?? '');
      if (!isCircuitGroup) {
        const parsed = parseFormat(ctx, i, kw, fm[2], fm[3] ?? '');
        if (parsed) {
          if (!formats[section] && stack.length === 0) formats[section] = parsed;
          const b: ParsedBlock = {
            line: i,
            section,
            kind: 'part',
            type: 'single',
            rounds: null,
            label: null,
            notes: null,
            items: [],
            loose: false,
            format: parsed.config,
            children: [],
          };
          b.notes = headerNote;
          openContainer(b, indent, null, null);
        }
        seen[section] = true;
        return info('format');
      }
    }

    // A rest line is a rest and nothing else: "descanso 1 min bicep 30" is two
    // things on one line, which the notation never allows.
    const restStart = trimmed.match(REST_START_RE);
    if (restStart && !REST_LINE_RE.test(trimmed)) {
      diag(ctx, {
        line: i,
        from: indent + restStart[0].length,
        to: indent + trimmed.length,
        severity: 'error',
        code: 'rest_with_more',
        message: 'Un descanso va solo en su línea. Pon lo demás en la línea siguiente.',
      });
      seen[section] = true;
      return info('item');
    }
    const rest = trimmed.match(REST_LINE_RE);
    if (rest) {
      const seconds = parseDuration(rest[1] ?? rest[2] ?? '') ?? 0;
      const item: ParsedItem = { ...emptyItem(i), kind: 'rest', measure: 'time', workSeconds: seconds, notes: headerNote };
      if (holdsItems(top())) top()!.block.items.push(item);
      else siblings().push({ ...looseRun(i), kind: 'rest', items: [item] });
      seen[section] = true;
      return info('rest');
    }

    // "intervalo 2:" (or "min 2:") alone → a group holding that interval's work.
    const slot = trimmed.match(SLOT_RE);
    if (slot) {
      if (innerFormat() !== 'emom') intervalOutsideEmom(ctx, i, raw, trimmed);
      const n = Number(slot[1]);
      const b = openGroup(i, indent, undefined, null, `intervalo ${n}`);
      b.type = 'emom';
      b.notes = headerNote;
      top()!.slot = Math.max(0, n - 1);
      seen[section] = true;
      return info('group');
    }

    const g = f.match(GROUP_RE) ?? null;
    const gk = g ? null : f.match(GROUP_KW_RE);
    if (g || gk) {
      const kw = g ? g[1] : gk![1];
      const rounds = g ? Number(g[2]) : gk![2] ? Number(gk![2]) : null;
      const tail = g ? (g[4] ?? '') : (gk![3] ?? '');
      openGroup(i, indent, kw, rounds, tail).notes = headerNote;
      seen[section] = true;
      return info('group');
    }

    // A misspelled keyword ("Intervalor 2:", "3 rondsa:", "Calentamineto")? Flag
    // just that word, with the fix, when the corrected line would be structural.
    const typo = keywordTypo(f, ctx.catalog);
    if (typo) {
      const fixed = f.slice(0, typo.from) + typo.keyword + f.slice(typo.from + typo.word.length);
      const ft = fixed.trim();
      const structural =
        SECTION_RE.test(ft) ||
        FORMAT_RE.test(fixed) ||
        REST_LINE_RE.test(ft) ||
        GROUP_RE.test(fixed) ||
        GROUP_KW_RE.test(fixed) ||
        SLOT_RE.test(ft) ||
        INTERVAL_RE.test(fixed);
      if (structural) {
        diag(ctx, {
          line: i,
          from: typo.from,
          to: typo.from + typo.word.length,
          severity: 'error',
          code: 'unknown_keyword',
          message: `"${raw.slice(typo.from, typo.from + typo.word.length)}" no es una palabra de la notación.`,
          suggestions: [typo.keyword],
        });
        return info('item');
      }
    }

    // Exercise line.
    addItem(parseItemLine(raw, i, ctx, { format: innerFormat() }), i);
    seen[section] = true;
    return info('item');
  });
  closeAll();

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

export type RutinaStructureInput = Pick<CreateWorkoutInput, 'format' | 'blocks'>;

type BlockInput = CreateWorkoutInput['blocks'][number];

/** A parsed block as API blocks: a loose run becomes one single-item block per line. */
function blockInputs(b: ParsedBlock): BlockInput[] {
  if (b.loose && b.items.length > 1) return b.items.map((it) => blockInput({ ...b, items: [it] }));
  return [blockInput(b)];
}

function blockInput(b: ParsedBlock): BlockInput {
  return {
    kind: b.kind,
    section: b.section,
    type: b.type,
    rounds: b.rounds,
    label: b.label,
    notes: b.notes,
    format: b.kind === 'part' ? (b.format?.format ?? null) : null,
    formatConfig: b.kind === 'part' ? (b.format ?? null) : null,
    blocks: (b.children ?? []).flatMap(blockInputs),
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
 * `exerciseId: null`. Each part carries its own format; the workout-level
 * `format` is the main section's first part (for lists and filters), or null
 * when the main section has no part (a plain sequential rutina).
 */
export function toWorkoutInput(p: ParsedRutina): RutinaStructureInput {
  return {
    format: p.main?.format ?? null,
    // The "Objetivo" section is not training: it becomes the level's goals (see `goalsFrom`).
    blocks: p.blocks.filter((b) => b.section !== 'goal').flatMap(blockInputs),
  };
}

/**
 * The goals written in the "Objetivo" section, one per resolved exercise line:
 * the metric follows what was written (reps, time, distance, or a load for N
 * reps). Lines that did not resolve or carry no amount are left out (they are
 * errors already).
 */
export function goalsFrom(p: ParsedRutina): SkillGoal[] {
  const out: SkillGoal[] = [];
  for (const b of p.blocks) {
    if (b.section !== 'goal') continue;
    for (const it of b.items) {
      if (it.kind !== 'exercise' || !it.match) continue;
      const base = { exerciseId: it.match.id, exerciseName: it.match.name };
      const load = it.loadPrescription;
      if (load && load.type === 'absolute' && load.value > 0) {
        const kg = load.unit === 'lb' ? Math.round(load.value * 0.45359237 * 10) / 10 : load.value;
        out.push({ ...base, metric: 'load_kg', value: kg, reps: it.reps ?? null });
      } else if (it.workSeconds != null && it.workSeconds > 0) out.push({ ...base, metric: 'time_seconds', value: it.workSeconds, reps: null });
      else if (it.distanceMeters != null && it.distanceMeters > 0) out.push({ ...base, metric: 'distance_meters', value: it.distanceMeters, reps: null });
      else if (it.reps != null && it.reps > 0) out.push({ ...base, metric: 'reps', value: it.reps, reps: null });
    }
  }
  return out;
}
