import { Catalog } from './catalog';
import { fold } from './normalize';
import type { CatalogExercise } from './types';

export type CompletionType =
  | 'format'
  | 'exercise'
  | 'keyword'
  | 'section'
  | 'group'
  | 'create'
  | 'snippet'
  | 'rutina'
  | 'unit';

/** Named things (saved blocks, other rutinas) the editor can insert whole. */
export interface CompletionExtra {
  kind: 'snippet' | 'rutina';
  items: { id: string; name: string }[];
}

export interface CompletionOptions {
  explicit?: boolean;
  extras?: CompletionExtra[];
}

export interface Completion {
  label: string;
  detail?: string;
  type: CompletionType;
  /**
   * Text that replaces `[from, to)`. For `create`, the exercise name to create;
   * for `snippet` / `rutina`, the id of the thing to insert.
   */
  apply: string;
}

export interface CompletionResult {
  from: number;
  to: number;
  options: Completion[];
}

// --- Static option lists ------------------------------------------------------

const FORMATS: Completion[] = [
  { label: 'AMRAP', detail: 'máximas rondas en un tiempo', type: 'format', apply: 'AMRAP 12 min' },
  { label: 'EMOM', detail: 'cada minuto, al minuto', type: 'format', apply: 'EMOM 10 min' },
  { label: 'Tabata', detail: 'intervalos trabajo/descanso', type: 'format', apply: 'Tabata 8 x 20/10' },
  { label: 'For time', detail: 'completar lo más rápido posible', type: 'format', apply: 'For time' },
  { label: 'Chipper', detail: 'lista completada una vez, por tiempo', type: 'format', apply: 'Chipper' },
  { label: 'Fuerza', detail: 'series y repeticiones', type: 'format', apply: 'Fuerza' },
  { label: 'Circuito', detail: 'rondas con descanso', type: 'format', apply: 'Circuito 3 rondas' },
];

type FormatKey = 'amrap' | 'emom' | 'tabata' | 'for_time' | 'chipper' | 'strength' | 'circuit';

// What can follow the format keyword, per format.
const FORMAT_PARAMS: Record<FormatKey, Completion[]> = {
  amrap: [
    { label: '12 min', detail: 'duración', type: 'keyword', apply: '12 min' },
    { label: '20 min', detail: 'duración', type: 'keyword', apply: '20 min' },
  ],
  emom: [
    { label: '10 min', detail: '10 intervalos de 1 min', type: 'keyword', apply: '10 min' },
    { label: '10 x 90s', detail: '10 intervalos de 90 s', type: 'keyword', apply: '10 x 90s' },
    { label: '12 rondas', detail: 'intervalos de 1 min', type: 'keyword', apply: '12 rondas' },
  ],
  tabata: [
    { label: '8 x 20/10', detail: 'rondas x trabajo/descanso', type: 'keyword', apply: '8 x 20/10' },
    { label: '6 x 40/20', detail: 'rondas x trabajo/descanso', type: 'keyword', apply: '6 x 40/20' },
  ],
  for_time: [
    { label: 'cap 20 min', detail: 'tiempo límite', type: 'keyword', apply: 'cap 20 min' },
    { label: '5 rondas', detail: 'rondas del total', type: 'keyword', apply: '5 rondas' },
  ],
  chipper: [{ label: 'cap 25 min', detail: 'tiempo límite', type: 'keyword', apply: 'cap 25 min' }],
  strength: [],
  circuit: [
    { label: '3 rondas', detail: 'rondas', type: 'keyword', apply: '3 rondas' },
    { label: 'descanso 1 min', detail: 'entre rondas', type: 'keyword', apply: 'descanso 1 min' },
    { label: 'cap 30 min', detail: 'tiempo límite', type: 'keyword', apply: 'cap 30 min' },
  ],
};

// Units offered after a bare number: on an item line, and on a format line.
interface Unit {
  u: string;
  detail: string;
  /** How the unit attaches to the number: "90s" vs "12 min". */
  tight?: boolean;
  /** Long forms the author may start typing ("met" → m). */
  aliases?: string[];
}
const ITEM_UNITS: Unit[] = [
  { u: 's', detail: 'segundos', tight: true, aliases: ['seg', 'segundos'] },
  { u: 'min', detail: 'minutos', aliases: ['minutos'] },
  { u: 'm', detail: 'metros', aliases: ['metros', 'mts'] },
  { u: 'km', detail: 'kilómetros', aliases: ['kilometros'] },
  { u: 'reps', detail: 'repeticiones', aliases: ['repeticiones'] },
  { u: 'x', detail: 'series × reps (3x5)', tight: true },
];
const LOAD_UNITS: Unit[] = [
  { u: 'kg', detail: 'kilos' },
  { u: 'lb', detail: 'libras' },
];
const FORMAT_UNITS: Record<FormatKey, Unit[]> = {
  amrap: [{ u: 'min', detail: 'minutos', aliases: ['minutos'] }, { u: 's', detail: 'segundos', tight: true, aliases: ['seg'] }],
  emom: [
    { u: 'min', detail: 'minutos (1 intervalo por minuto)' },
    { u: 'x', detail: 'intervalos × duración (10 x 90s)' },
    { u: 'rondas', detail: 'intervalos' },
    { u: 's', detail: 'segundos', tight: true },
  ],
  tabata: [{ u: 'x', detail: 'rondas × trabajo/descanso (8 x 20/10)' }],
  for_time: [{ u: 'rondas', detail: 'rondas' }, { u: 'min', detail: 'minutos' }],
  chipper: [{ u: 'min', detail: 'minutos' }],
  strength: [],
  circuit: [{ u: 'rondas', detail: 'rondas' }, { u: 'min', detail: 'minutos' }],
};

const SECTIONS: Completion[] = [
  { label: 'Calentamiento', detail: 'lo indentado debajo es el calentamiento', type: 'section', apply: 'Calentamiento' },
  { label: 'Enfriamiento', detail: 'lo indentado debajo es el enfriamiento', type: 'section', apply: 'Enfriamiento' },
  { label: 'Rutina', detail: 'vuelve a la parte principal (o quita la sangría)', type: 'section', apply: 'Rutina' },
];

const LOADS: Completion[] = [
  { label: '@60 kg', detail: 'carga absoluta', type: 'keyword', apply: '@60 kg' },
  { label: '@135/95 lb', detail: 'carga hombres / mujeres', type: 'keyword', apply: '@135/95 lb' },
  { label: '@80%', detail: '% del 1RM', type: 'keyword', apply: '@80%' },
  { label: '@RPE 8', detail: 'esfuerzo percibido', type: 'keyword', apply: '@RPE 8' },
  { label: '@corporal', detail: 'peso corporal', type: 'keyword', apply: '@corporal' },
  { label: '+20 kg', detail: 'peso añadido al corporal', type: 'keyword', apply: '+20 kg' },
];

// Common tempos: hold arriba · negativa · hold abajo · positiva.
const TEMPO_PATTERNS: { p: string; detail: string }[] = [
  { p: '0-3-1-1', detail: 'bajada controlada 3 s, pausa abajo' },
  { p: '0-2-0-2', detail: 'lento y continuo' },
  { p: '0-3-0-X', detail: 'bajada 3 s, subida explosiva' },
  { p: '1-3-1-1', detail: 'pausa arriba y abajo' },
  { p: '0-4-2-1', detail: 'negativa larga' },
];
const TEMPOS: Completion[] = TEMPO_PATTERNS.map((t) => ({
  label: `tempo ${t.p}`,
  detail: t.detail,
  type: 'keyword',
  apply: `tempo ${t.p}`,
}));
const TEMPO_AFTER_WORD: Completion[] = TEMPO_PATTERNS.map((t) => ({
  label: t.p,
  detail: t.detail,
  type: 'keyword',
  apply: t.p,
}));

const MODIFIERS: Completion[] = [
  ...TEMPOS.slice(0, 2),
  { label: 'c/lado', detail: 'por cada lado', type: 'keyword', apply: 'c/lado' },
  { label: 'desc 90s', detail: 'descanso entre series', type: 'keyword', apply: 'desc 90s' },
  { label: '// nota', detail: 'nota para el usuario', type: 'keyword', apply: '// ' },
];
const ALL_MODIFIERS: Completion[] = [...LOADS, ...TEMPOS, ...MODIFIERS.slice(2)];

const REST_LINE: Completion = { label: 'descanso 60s', detail: 'descanso', type: 'keyword', apply: 'descanso 60s' };
const GROUP_LINE: Completion = { label: '3 rondas:', detail: 'bloque de rondas', type: 'group', apply: '3 rondas:' };

const prefixOf = (q: string) => (c: Completion) => q.length > 0 && fold(c.label).startsWith(q);

// Start of the exercise name: after an EMOM "min 1:" prefix, then a count with
// an optional unit ("41 ", "800 m ", "30 s ", "3x5 ").
const NAME_START_RE =
  /^\s*(?:(?:min(?:uto)?\.?\s*)?\d+\s*[:).\]]\s+)?(?:\d+\s*[x×*]\s*\d+\s*|\d+(?:[.,]\d+)?\s*(?:s|seg|segundos|min|m|km|reps?)?\s+)?/;
// A modifier that ends the name zone.
const MODIFIER_RE =
  /(@|\+\s*\d|\btempo\b|\bdesc(?:anso)?\b|\brest\b|\bc\/|\bpor lado\b|\/\/|\brpe\b|\d+\s*(?:kg|lb)|\d+\s*(?:s|seg|min|m|km)(?![a-z]))/;
const FORMAT_LINE_RE =
  /^(amrap|e\d*mom|tabata|for ?time|por tiempo|chipper|fuerza|strength|circuito|circuit)(?![a-z])(?:\s+(.*))?$/;
const NUM_TAIL_RE = /(?:^|[\s@+/])(\d+(?:[.,]\d+)?)\s*([a-z]*)$/;
/** Offset of the number inside a NUM_TAIL_RE match (skips the leading separator). */
const numStart = (m: RegExpMatchArray) => m[0].search(/\d/);

function formatKey(kw: string): FormatKey {
  if (kw.startsWith('amrap')) return 'amrap';
  if (kw.endsWith('mom')) return 'emom';
  if (kw === 'tabata') return 'tabata';
  if (kw === 'chipper') return 'chipper';
  if (kw === 'fuerza' || kw === 'strength') return 'strength';
  if (kw.startsWith('circuit')) return 'circuit';
  return 'for_time';
}

/** `12 mi` → the options "12 min", "12s", … filtered by the partial unit. */
function unitOptions(num: string, partial: string, units: Unit[]): Completion[] {
  return units
    .filter((u) => !partial || u.u.startsWith(partial) || u.aliases?.some((a) => a.startsWith(partial)))
    .map((u) => {
      const text = u.tight ? `${num}${u.u}` : `${num} ${u.u}`;
      return { label: text, detail: u.detail, type: 'unit' as const, apply: text };
    });
}

/**
 * Autocomplete options for the cursor at `offset`. Decides from the current
 * line (and whether it is the first content line of its section) what the
 * author is typing: a format and its parameters, a section, a group header,
 * an exercise, a unit after a number, or a modifier.
 */
export function completionsAt(
  text: string,
  offset: number,
  catalog: CatalogExercise[] | Catalog,
  opts: CompletionOptions = {},
): CompletionResult | null {
  const cat = catalog instanceof Catalog ? catalog : new Catalog(catalog);
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const lineEndIdx = text.indexOf('\n', offset);
  const lineEnd = lineEndIdx < 0 ? text.length : lineEndIdx;
  const before = text.slice(lineStart, offset);
  const indent = before.length - before.trimStart().length;
  const typed = fold(before);
  const atSectionStart = isSectionStart(text, lineStart);
  const wordStart = lineStart + before.lastIndexOf(' ') + 1;
  const word = fold(before.slice(before.lastIndexOf(' ') + 1));

  // A. Nothing typed yet: list what can go on this line.
  if (!typed) {
    const options: Completion[] = atSectionStart
      ? [...FORMATS, ...SECTIONS]
      : [GROUP_LINE, REST_LINE, ...SECTIONS, ...extraOptions(opts, ''), ...exerciseOptions(cat, '')];
    return { from: offset, to: offset, options };
  }

  // B. Section headers are whole-line things.
  const sections = SECTIONS.filter(prefixOf(typed));
  if (sections.length && !atSectionStart) {
    return { from: lineStart + indent, to: lineEnd, options: sections };
  }

  // C. Format line: a format can start a PART on any line. With the keyword
  // complete, offer its parameters/units; at a section start, offer formats first.
  const fm = typed.match(FORMAT_LINE_RE);
  if (fm && fm[2] !== undefined) {
    const key = formatKey(fm[1]!);
    const tail = fm[2] ?? '';
    const num = tail.match(NUM_TAIL_RE);
    if (num) {
      const from = offset - (num[0].length - numStart(num));
      const options = unitOptions(num[1]!, num[2]!, FORMAT_UNITS[key]);
      return options.length ? { from, to: offset, options } : null;
    }
    const params = FORMAT_PARAMS[key].filter((c) => !word || fold(c.label).startsWith(word));
    return params.length ? { from: wordStart, to: offset, options: params } : null;
  }
  if (atSectionStart) {
    const formats = FORMATS.filter(prefixOf(typed));
    if (formats.length || sections.length) {
      return { from: lineStart + indent, to: lineEnd, options: [...formats, ...sections] };
    }
  }

  // D. A bare number, maybe with a partial word: "3 r" → "3 rondas:", "800 met" →
  // "800 m", "41 b" → "41 Burpees". Everything replaces the whole line.
  const rawTyped = before
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trimStart();
  const bare = rawTyped.match(/^(\d+(?:[.,]\d+)?)(\s*)([a-z]*)$/);
  if (bare && !(bare[3] === '' && bare[2] !== '')) {
    const n = bare[1]!;
    const partial = bare[3]!;
    const options: Completion[] = [];
    if (partial && 'rondas'.startsWith(partial)) {
      options.push({ label: `${n} rondas:`, detail: 'bloque de rondas', type: 'group', apply: `${n} rondas:` });
    }
    options.push(...unitOptions(n, partial, ITEM_UNITS));
    // "41 bur" is an exercise being typed: leave it to the item path below.
    if (options.length) return { from: lineStart + indent, to: lineEnd, options };
  }

  // E. Item line.
  const nameStart = before.match(NAME_START_RE)?.[0].length ?? 0;
  const afterName = before.slice(nameStart);
  const prevWord = fold(before.slice(0, before.lastIndexOf(' ')).trim().split(' ').pop() ?? '');

  // E1. Modifier zone (a load, tempo, rest… already started).
  const mod = afterName.match(MODIFIER_RE);
  if (mod && mod.index != null) {
    if (word.startsWith('@')) {
      return { from: wordStart, to: offset, options: LOADS.filter(prefixOf(word)) };
    }
    if (prevWord === 'tempo') {
      const opts = TEMPO_AFTER_WORD.filter((c) => !word || c.label.toLowerCase().startsWith(word));
      return opts.length ? { from: wordStart, to: offset, options: opts } : null;
    }
    const num = afterName.match(NUM_TAIL_RE);
    if (num) {
      // "@60 k" → kg/lb; "desc 9" → s/min.
      const from = offset - (num[0].length - numStart(num));
      const isLoad = /[@+/]\s*\d+(?:[.,]\d+)?\s*[a-z]*$/.test(typed);
      const units = isLoad ? LOAD_UNITS : ITEM_UNITS.slice(0, 2);
      const options = unitOptions(num[1]!, num[2]!, units);
      return options.length ? { from, to: offset, options } : null;
    }
    if (!word) return { from: offset, to: offset, options: ALL_MODIFIERS };
    const opts = MODIFIERS.filter(prefixOf(word));
    return opts.length ? { from: wordStart, to: offset, options: opts } : null;
  }

  // E2. A number at the end ("plancha 30", "12 mi", or a bare "41") → units.
  const num = afterName.match(NUM_TAIL_RE);
  if (num) {
    const from = offset - (num[0].length - numStart(num));
    const options = unitOptions(num[1]!, num[2]!, ITEM_UNITS);
    return options.length ? { from, to: offset, options } : null;
  }

  // E3. Exercise zone.
  const query = afterName.trim();
  if (!query) {
    // "41 " → exercises (and saved blocks never: a count precedes).
    return { from: offset, to: offset, options: exerciseOptions(cat, '') };
  }
  const endsWithSpace = /\s$/.test(afterName);
  const exact = cat.resolve(query).match?.confidence === 'exact';
  // "41 Test flexión " → the exercise is complete; what can follow it.
  if (endsWithSpace && exact) return { from: offset, to: offset, options: ALL_MODIFIERS };
  // "10 burpees te" → the exercise is already written; the last word starts a modifier.
  const lastSpace = query.lastIndexOf(' ');
  if (lastSpace > 0) {
    const head = query.slice(0, lastSpace);
    const mods = ALL_MODIFIERS.filter(prefixOf(word));
    if (mods.length && cat.resolve(head).match) {
      return { from: wordStart, to: offset, options: mods };
    }
  }
  const options: Completion[] = exerciseOptions(cat, query);
  if (nameStart === 0 && 'descanso'.startsWith(fold(query))) options.unshift(REST_LINE);
  // Whole blocks / rutinas only make sense at the start of a line (no count before).
  if (nameStart === 0) options.push(...extraOptions(opts, query));
  // A new part can start here too: formats matching the first word, after the exercises.
  if (nameStart === 0 && !query.includes(' ')) options.push(...FORMATS.filter(prefixOf(fold(query))));
  // No exact match → always offer to create the exercise as written.
  if (!exact) {
    options.push({
      label: `Crear ejercicio "${query}"`,
      detail: 'nuevo en el catálogo',
      type: 'create',
      apply: query,
    });
  }
  const qFrom = lineStart + nameStart + (afterName.length - afterName.trimStart().length);
  return { from: qFrom, to: offset, options };
}

const EXTRA_DETAIL: Record<CompletionExtra['kind'], string> = {
  snippet: 'bloque guardado',
  rutina: 'rutina',
};

function extraOptions(opts: CompletionOptions, query: string): Completion[] {
  const out: Completion[] = [];
  for (const extra of opts.extras ?? []) {
    const cat = new Catalog(extra.items);
    for (const item of cat.search(query, 4)) {
      out.push({ label: item.name, detail: EXTRA_DETAIL[extra.kind], type: extra.kind, apply: item.id });
    }
  }
  return out;
}

function exerciseOptions(cat: Catalog, query: string): Completion[] {
  return cat.search(query, 8).map((ex) => ({
    label: ex.name,
    detail: ex.aliases?.length ? ex.aliases.join(', ') : undefined,
    type: 'exercise' as const,
    apply: ex.name,
  }));
}

const SECTION_LINE =
  /^\s*(calentamiento|warm ?-?up|enfriamiento|cool ?-?down|vuelta a la calma|principal|main|rutina|wod)\s*:?\s*$/;

/**
 * True when the line at `lineStart` is the first content line of its section:
 * right after a section header, or back at the header's column after an
 * indented section (that is where the main section resumes).
 */
export function isSectionStart(text: string, lineStart: number): boolean {
  const curEnd = text.indexOf('\n', lineStart);
  const cur = text.slice(lineStart, curEnd < 0 ? text.length : curEnd);
  const curIndent = cur.length - cur.trimStart().length;
  let end = lineStart - 1;
  while (end >= 0) {
    const start = text.lastIndexOf('\n', end - 1) + 1;
    const line = text.slice(start, end);
    const f = fold(line);
    if (f && !f.startsWith('#') && !f.startsWith('//')) {
      const indent = line.length - line.trimStart().length;
      // Skip lines nested deeper than us: they belong to a section we are leaving.
      if (indent > curIndent) {
        end = start - 1;
        continue;
      }
      return SECTION_LINE.test(f);
    }
    end = start - 1;
  }
  return true;
}
