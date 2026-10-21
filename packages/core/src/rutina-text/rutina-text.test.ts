import { describe, expect, it } from 'vitest';
import { completionsAt } from './completion';
import { parseRutina, toWorkoutInput, hasErrors } from './parse';
import { serializeRutina } from './serialize';
import type { CatalogExercise } from './types';

const catalog: CatalogExercise[] = [
  { id: 'burpee', name: 'Burpees', aliases: ['burpee'] },
  { id: 'pclean', name: 'Cargada de potencia', aliases: ['Power Clean'] },
  { id: 'bmu', name: 'Bar Muscle Up', aliases: ['bar muscle ups', 'BMU'] },
  { id: 'sco', name: 'Single Cross Over', aliases: ['single cross overs', 'cross overs'] },
  { id: 'pushup', name: 'Flexiones de pecho', aliases: ['push up', 'push ups', 'flexiones'] },
  { id: 'diamond', name: 'Flexiones diamante' },
  { id: 'plank', name: 'Plancha' },
  { id: 'row', name: 'Remo' },
  { id: 'run', name: 'Carrera' },
  { id: 'squat', name: 'Sentadilla' },
  { id: 'lunge', name: 'Zancadas' },
  { id: 'pullup', name: 'Dominadas', aliases: ['pull up'] },
];

const parse = (text: string) => parseRutina(text, { catalog });
const errors = (text: string) => parse(text).diagnostics.filter((d) => d.severity === 'error');
type Blocks = ReturnType<typeof toWorkoutInput>['blocks'];
/** Parts hold their blocks in `blocks`; flatten them for item-level assertions. */
const flat = (blocks: Blocks): Blocks => blocks.flatMap((b) => (b.kind === 'part' ? b.blocks : [b]));

describe('parseRutina', () => {
  it('parses the paper-style for-time example', () => {
    const p = parse(`41 burpess

3 Rondas
19 Power Clean @135/95 lb
10 Bar Muscle Ups
41 single cross overs

41 burpees
`);
    expect(hasErrors(p)).toBe(false);
    const w = toWorkoutInput(p);
    // No format header → no part: a plain sequential rutina.
    expect(w.format).toBeNull();
    expect(w.blocks).toHaveLength(3);
    const [a, b, c] = w.blocks;
    expect(a!.items[0]).toMatchObject({ exerciseId: 'burpee', reps: 41, measure: 'reps' });
    expect(b).toMatchObject({ rounds: 3, type: 'circuit' });
    expect(b!.items).toHaveLength(3);
    expect(b!.items[0]).toMatchObject({
      exerciseId: 'pclean',
      reps: 19,
      loadPrescription: { type: 'absolute', value: 135, womenValue: 95, unit: 'lb' },
    });
    expect(b!.items[1]).toMatchObject({ exerciseId: 'bmu', reps: 10 });
    expect(b!.items[2]).toMatchObject({ exerciseId: 'sco', reps: 41 });
    expect(c!.items[0]).toMatchObject({ exerciseId: 'burpee', reps: 41 });
    // "burpess" was a typo → fuzzy match, no error.
    expect(p.blocks[0]!.items[0]!.match?.confidence).toBe('fuzzy');
  });

  it('parses strength sets x reps with rest, load and tempo', () => {
    const p = parse(`Fuerza
  felxiones de pecho 3x5 desc 90s
  Sentadilla 5x5 @80% tempo 0-3-1-1
  3 x 8 dominadas +20 kg
  zancadas 3x10 c/lado @RPE 8
`);
    expect(hasErrors(p)).toBe(false);
    const w = toWorkoutInput(p);
    expect(w.format).toBe('strength');
    const blocks = flat(w.blocks);
    expect(blocks[0]!.items[0]).toMatchObject({
      exerciseId: 'pushup',
      sets: 3,
      reps: 5,
      restBetweenSeconds: 90,
    });
    expect(blocks[1]!.items[0]).toMatchObject({
      exerciseId: 'squat',
      sets: 5,
      reps: 5,
      loadPrescription: { type: 'percent_1rm', value: 80 },
      tempoOverride: { holdTop: 0, eccentric: 3, holdBottom: 1, concentric: 1 },
    });
    expect(blocks[2]!.items[0]).toMatchObject({
      exerciseId: 'pullup',
      sets: 3,
      reps: 8,
      loadPrescription: { type: 'bodyweight', addedValue: 20, unit: 'kg' },
    });
    expect(blocks[3]!.items[0]).toMatchObject({
      exerciseId: 'lunge',
      sets: 3,
      reps: 10,
      perSide: true,
      loadPrescription: { type: 'rpe', value: 8 },
    });
  });

  it('parses time and distance items', () => {
    const p = parse(`AMRAP 12 min
  plancha 30s
  400 m carrera
  remo 1 km
  3x45s plancha
  1:30 plancha
`);
    expect(hasErrors(p)).toBe(false);
    const w = toWorkoutInput(p);
    expect(w.blocks[0]).toMatchObject({ kind: 'part', formatConfig: { format: 'amrap', configVersion: 1, totalSeconds: 720 } });
    const items = flat(w.blocks).map((b) => b.items[0]!);
    expect(items[0]).toMatchObject({ exerciseId: 'plank', measure: 'time', workSeconds: 30 });
    expect(items[1]).toMatchObject({ exerciseId: 'run', measure: 'distance', distanceMeters: 400 });
    expect(items[2]).toMatchObject({ exerciseId: 'row', measure: 'distance', distanceMeters: 1000 });
    expect(items[3]).toMatchObject({ exerciseId: 'plank', sets: 3, workSeconds: 45 });
    expect(items[4]).toMatchObject({ exerciseId: 'plank', workSeconds: 90 });
  });

  it('parses EMOM with interval prefixes and tabata without counts', () => {
    const e = toWorkoutInput(parse(`EMOM 10 x 90s
  intervalo 1: 10 burpees
  min 2: 15 sentadillas
`));
    expect(e.blocks[0]!.formatConfig).toEqual({ format: 'emom', configVersion: 1, intervalSeconds: 90, rounds: 10 });
    expect(flat(e.blocks)[0]!.items[0]).toMatchObject({ intervalIndex: 0, reps: 10 });
    expect(flat(e.blocks)[1]!.items[0]).toMatchObject({ intervalIndex: 1, reps: 15, exerciseId: 'squat' });

    const e2 = toWorkoutInput(parse('EMOM 12 min\n  5 burpees'));
    expect(e2.blocks[0]!.formatConfig).toEqual({ format: 'emom', configVersion: 1, intervalSeconds: 60, rounds: 12 });

    const t = parse(`Tabata 8 x 20/10
  burpees
  plancha
`);
    expect(t.diagnostics).toEqual([]);
    const tw = toWorkoutInput(t);
    expect(tw.blocks[0]!.formatConfig).toEqual({ format: 'tabata', configVersion: 1, workSeconds: 20, restSeconds: 10, rounds: 8 });
    expect(flat(tw.blocks)[0]!.items[0]).toMatchObject({ measure: 'time', reps: null });
  });

  it('parses warmup / cooldown sections, each with its own parts', () => {
    const p = parse(`Calentamiento
  AMRAP 5 min
    10 burpees
    plancha 20s

For time cap 20 min
  3 rondas, descanso 1 min:
    10 dominadas
    20 flexiones

Enfriamiento
  plancha 1 min
`);
    expect(hasErrors(p)).toBe(false);
    const w = toWorkoutInput(p);
    expect(w.format).toBe('for_time');
    expect(w.blocks.map((b) => [b.section, b.kind])).toEqual([
      ['warmup', 'part'],
      ['main', 'part'],
      ['cooldown', 'group'],
    ]);
    expect(w.blocks[0]).toMatchObject({ format: 'amrap', formatConfig: { totalSeconds: 300 } });
    expect(w.blocks[0]!.blocks).toHaveLength(2);
    expect(w.blocks[1]).toMatchObject({ format: 'for_time', formatConfig: { timeCapSeconds: 1200 } });
    const grp = w.blocks[1]!.blocks[0]!;
    expect(grp.rounds).toBe(3);
    expect(grp.items.map((i) => i.kind)).toEqual(['exercise', 'exercise', 'rest']);
    expect(grp.items[2]).toMatchObject({ kind: 'rest', workSeconds: 60 });
  });

  it('closes an indented group when indentation ends', () => {
    const w = toWorkoutInput(parse(`3 rondas:
  10 burpees
  10 sentadillas
41 burpees
`));
    expect(w.blocks).toHaveLength(2);
    expect(w.blocks[0]!.items).toHaveLength(2);
    expect(w.blocks[1]!.items[0]).toMatchObject({ reps: 41 });
  });

  it('reports unknown exercises with suggestions', () => {
    const p = parse('10 flexiones pecho diamante\n10 saltos locos');
    const errs = p.diagnostics.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(2);
    expect(errs[1]).toMatchObject({ line: 1, code: 'unknown_exercise' });
    expect(errs[1]!.from).toBe(3);
    expect(errs[1]!.to).toBe(15);
    // Close misses still get suggestions.
    expect(errs[0]!.suggestions).toContain('Flexiones diamante');
  });

  it('warns about missing counts; a second format line is a new part, not an error', () => {
    const p = parse('For time\nburpees\nAMRAP 5 min');
    expect(p.diagnostics.map((d) => d.code)).toEqual(['missing_count']);
    expect(errors('AMRAP\n10 burpees')[0]).toMatchObject({ code: 'format_needs_config' });
  });

  it('keeps trailing notes', () => {
    const w = toWorkoutInput(parse('10 burpees // despacio, con control'));
    expect(w.blocks[0]!.items[0]!.notes).toBe('despacio, con control');
  });

  it('accepts trailing counts and Spanish time words', () => {
    const w = toWorkoutInput(parse('burpees x41\nplancha 2 minutos\n30 seg de plancha'));
    expect(w.blocks[0]!.items[0]).toMatchObject({ exerciseId: 'burpee', reps: 41 });
    expect(w.blocks[1]!.items[0]).toMatchObject({ exerciseId: 'plank', workSeconds: 120 });
    expect(w.blocks[2]!.items[0]).toMatchObject({ exerciseId: 'plank', workSeconds: 30 });
  });
});

describe('serializeRutina', () => {
  const roundTrip = (text: string) => {
    const first = toWorkoutInput(parse(text));
    const out = serializeRutina(first, catalog);
    const second = toWorkoutInput(parse(out));
    return { out, first, second };
  };

  it('round-trips the for-time example', () => {
    const { out, first, second } = roundTrip(`41 burpees

3 rondas
  19 power clean @135/95 lb
  10 bar muscle ups
  41 single cross overs

41 burpees`);
    expect(second).toEqual(first);
    expect(out).toBe(`41 Burpees

3 rondas:
  19 Cargada de potencia @135/95 lb
  10 Bar Muscle Up
  41 Single Cross Over

41 Burpees
`);
  });

  it('round-trips strength, sections, tempo, rests and notes', () => {
    const { first, second } = roundTrip(`Calentamiento
  AMRAP 5 min
    10 burpees
    descanso 30s

Fuerza
  sentadilla 5x5 @80% tempo 0-3-1-1 desc 2 min // profundo
  Superserie 3 rondas - Empuje:
    10 flexiones
    8 dominadas +10 kg
    descanso 1 min
  zancadas 3x10 c/lado
  3x400 m carrera

Enfriamiento
  Tabata 4 x 30/15
    plancha
`);
    expect(second).toEqual(first);
  });

  it('round-trips every format header', () => {
    for (const h of [
      'AMRAP 20 min',
      'EMOM 10 min',
      'EMOM 8 x 90s',
      'Tabata 8 x 20/10',
      'For time 5 rondas cap 15 min',
      'Chipper cap 25 min',
      'Fuerza',
      'Circuito 4 rondas descanso 1 min cap 30 min',
    ]) {
      const { first, second, out } = roundTrip(`${h}\n  10 burpees`);
      expect(second.blocks[0]!.formatConfig, h).toEqual(first.blocks[0]!.formatConfig);
      expect(out.split('\n')[0], h).toBe(h);
    }
  });
});

describe('completionsAt', () => {
  const at = (text: string) => completionsAt(text, text.length, catalog);

  it('suggests formats on the first line', () => {
    const c = at('AMR');
    expect(c?.options.map((o) => o.label)).toEqual(['AMRAP']);
    expect(c).toMatchObject({ from: 0, to: 3 });
    expect(at('f')?.options.map((o) => o.label)).toEqual(['For time', 'Fuerza']);
  });

  it('suggests exercises after a count, with typo tolerance', () => {
    const c = at('AMRAP 10 min\n41 bur');
    expect(c?.options[0]).toMatchObject({ label: 'Burpees', type: 'exercise' });
    expect(c).toMatchObject({ from: 16, to: 19 });
    expect(at('For time\n10 flex')?.options.filter((o) => o.type === 'exercise').map((o) => o.label)).toEqual([
      'Flexiones de pecho',
      'Flexiones diamante',
    ]);
    expect(at('For time\n10 felx')?.options[0]?.label).toBe('Flexiones de pecho');
    expect(at('For time\n10 power cl')?.options[0]?.label).toBe('Cargada de potencia');
  });

  it('suggests loads and modifiers after the exercise', () => {
    expect(at('For time\n10 burpees @1')?.options.map((o) => o.label)).toEqual(['@135/95 lb']);
    expect(at('For time\n10 burpees te')?.options[0]?.label).toBe('tempo 0-3-1-1');
  });

  it('suggests group headers and sections', () => {
    expect(at('For time\n3 r')?.options[0]).toMatchObject({ label: '3 rondas:', type: 'group' });
    expect(at('For time\n10 burpees\n\nEnf')?.options[0]?.label).toBe('Enfriamiento');
  });

  it('suggests exercises inside a group, not formats', () => {
    const c = at('For time\n3 rondas:\n  10 bur');
    expect(c?.options[0]?.label).toBe('Burpees');
  });
});

describe('completionsAt extras', () => {
  it('offers to create an unknown exercise and lists options on request', () => {
    const c = completionsAt('For time\n10 sentadilla bulgara', 'For time\n10 sentadilla bulgara'.length, catalog);
    expect(c?.options.at(-1)).toMatchObject({ type: 'create', apply: 'sentadilla bulgara' });
    expect(completionsAt('For time\n', 9, catalog)?.options[0]).toMatchObject({ type: 'group' });
    const e = completionsAt('For time\n', 9, catalog, { explicit: true });
    expect(e?.options[0]).toMatchObject({ type: 'group' });
    const f = completionsAt('', 0, catalog, { explicit: true });
    expect(f?.options[0]).toMatchObject({ type: 'format', label: 'AMRAP' });
  });
});

describe('completionsAt extras (snippets / rutinas)', () => {
  const extras = [
    { kind: 'snippet' as const, items: [{ id: 's1', name: 'Core express' }] },
    { kind: 'rutina' as const, items: [{ id: 'r1', name: 'Murph' }, { id: 'r2', name: 'Cindy' }] },
  ];
  it('suggests saved blocks and rutinas at line start, not after a count', () => {
    const t = 'For time\ncor';
    const c = completionsAt(t, t.length, catalog, { extras });
    expect(c?.options.find((o) => o.type === 'snippet')).toMatchObject({ label: 'Core express', apply: 's1' });
    const t2 = 'For time\n10 cor';
    expect(completionsAt(t2, t2.length, catalog, { extras })?.options.some((o) => o.type === 'snippet') ?? false).toBe(false);
    const t3 = 'For time\nmur';
    expect(completionsAt(t3, t3.length, catalog, { extras })?.options[0]).toMatchObject({ type: 'rutina', apply: 'r1' });
  });
});

describe('completionsAt context: units, format params, tempos, modifiers', () => {
  const at = (text: string) => completionsAt(text, text.length, catalog);
  it('suggests units after a number on a format line', () => {
    const c = at('AMRAP 12 mi');
    expect(c?.options.map((o) => o.label)).toEqual(['12 min']);
    expect(c).toMatchObject({ from: 6, to: 11 });
    expect(at('EMOM 10 ')?.options.map((o) => o.label)).toContain('10 x');
    expect(at('For time c')?.options[0]?.label).toBe('cap 20 min');
    expect(at('AMRAP 12 mi')?.options.some((o) => o.type === 'create')).toBe(false);
  });
  it('suggests units after a number on an item line', () => {
    expect(at('For time\nplancha 30')?.options.map((o) => o.label)).toEqual([
      '30s',
      '30 min',
      "30''",
      "30'",
      '30 m',
      '30 km',
      '30 reps',
      '30x',
    ]);
    expect(at('For time\n800 met')?.options[0]?.label).toBe('800 m');
    expect(at('Fuerza\nsentadilla 5x5 @60 k')?.options[0]?.label).toBe('60 kg');
    expect(at('Fuerza\nsentadilla 5x5 desc 9')?.options[0]?.label).toBe('9s');
  });
  it('suggests modifiers after a complete exercise and tempo patterns after "tempo"', () => {
    const c = at('For time\n41 burpees ');
    expect(c?.options[0]?.label).toBe('@60 kg');
    expect(c?.options.some((o) => o.label === 'tempo 0-3-1-1')).toBe(true);
    expect(at('For time\n41 burpees tempo ')?.options.map((o) => o.label)).toContain('0-3-1-1');
    expect(at('For time\n41 burpees tempo 0-2')?.options[0]?.label).toBe('0-2-0-2');
  });
  it('flags a line with a count but no exercise as missing_exercise', () => {
    const p = parseRutina('For time\n800 metros', { catalog });
    expect(p.diagnostics[0]).toMatchObject({ code: 'missing_exercise' });
    expect(flat(toWorkoutInput(p).blocks)[0]!.items[0]).toMatchObject({ distanceMeters: 800, measure: 'distance' });
  });
});

describe('indentation scoping (Python style)', () => {
  it('scopes sections by indentation and returns to main on dedent, no colons needed', () => {
    const p = parse(`Calentamiento
  AMRAP 5 min
    10 burpees
    3 rondas
      5 flexiones
      plancha 20s
    20 sentadillas

For time cap 20 min
  41 burpees

Enfriamiento
  plancha 1 min
`);
    expect(hasErrors(p)).toBe(false);
    const w = toWorkoutInput(p);
    expect(w.blocks[0]).toMatchObject({ format: 'amrap' });
    expect(w.format).toBe('for_time');
    expect(w.blocks[1]).toMatchObject({ formatConfig: { timeCapSeconds: 1200 } });
    expect(w.blocks.map((b) => [b.section, b.kind, b.blocks.length])).toEqual([
      ['warmup', 'part', 3],
      ['main', 'part', 1],
      ['cooldown', 'group', 0],
    ]);
    expect(w.blocks[0]!.blocks[1]).toMatchObject({ rounds: 3 });
  });

  it('serializes sections indented and round-trips', () => {
    const text = `Calentamiento
  AMRAP 5 min
    10 burpees

Fuerza
  sentadilla 5x5

Enfriamiento
  plancha 1 min
`;
    const first = toWorkoutInput(parse(text));
    const out = serializeRutina(first, catalog);
    expect(out).toBe(`Calentamiento
  AMRAP 5 min
    10 Burpees

Fuerza
  5x5 Sentadilla

Enfriamiento
  Plancha 1 min
`);
    expect(toWorkoutInput(parse(out))).toEqual(first);
  });

  it('offers formats on the first main line after an indented warmup', () => {
    const t = 'Calentamiento\n  10 burpees\n\nAMR';
    expect(completionsAt(t, t.length, catalog)?.options[0]?.label).toBe('AMRAP');
  });
});

describe('completion name zone after a unit', () => {
  it('starts the exercise query after "800 m"', () => {
    const t = 'For time\n800 m tor';
    const c = completionsAt(t, t.length, catalog);
    expect(c?.options.at(-1)).toMatchObject({ type: 'create', apply: 'tor' });
    expect(c).toMatchObject({ from: t.length - 3, to: t.length });
  });
});

describe('EMOM interval groups', () => {
  const text = `EMOM 8 x 1:30
  intervalo 1:
    10 burpees
    15 sentadillas
  min 2:
    20 flexiones
`;
  it('groups the work of each interval under "intervalo N:" (or "min N:")', () => {
    const p = parse(text);
    expect(hasErrors(p)).toBe(false);
    const w = toWorkoutInput(p);
    expect(w.blocks[0]!.formatConfig).toMatchObject({ format: 'emom', intervalSeconds: 90, rounds: 8 });
    const slots = w.blocks[0]!.blocks;
    expect(slots).toHaveLength(2);
    expect(slots[0]!.items.map((i) => [i.exerciseId, i.intervalIndex])).toEqual([
      ['burpee', 0],
      ['squat', 0],
    ]);
    expect(slots[1]!.items[0]).toMatchObject({ exerciseId: 'pushup', intervalIndex: 1 });
  });
  it('round-trips interval groups', () => {
    const first = toWorkoutInput(parse(text));
    const out = serializeRutina(first, catalog);
    expect(out).toBe(`EMOM 8 x 90s
  intervalo 1:
    10 Burpees
    15 Sentadilla

  intervalo 2:
    20 Flexiones de pecho
`);
    expect(toWorkoutInput(parse(out))).toEqual(first);
  });
});

describe('keyword typos and quote units', () => {
  it('flags a misspelled keyword and suggests the fix', () => {
    const p = parse('EMOM 8 x 90s\n  Intervalor 2: 20 burpees\n  3 rondsa:\n    10 burpees');
    expect(p.diagnostics.map((d) => [d.line, d.code, d.suggestions?.[0]])).toEqual([
      [1, 'unknown_keyword', 'intervalo'],
      [2, 'unknown_keyword', 'rondas'],
    ]);
    expect(p.diagnostics[0]).toMatchObject({ from: 2, to: 12 });
  });
  it("accepts ' for minutes and '' or \" for seconds", () => {
    const w = toWorkoutInput(parse("AMRAP 12'\n  plancha 30''\n  plancha 45\"\n  1'30'' plancha"));
    expect(w.blocks[0]!.formatConfig).toMatchObject({ totalSeconds: 720 });
    const items = flat(w.blocks).map((b) => b.items[0]!);
    expect(items.map((i) => i.workSeconds)).toEqual([30, 45, 90]);
  });
});
