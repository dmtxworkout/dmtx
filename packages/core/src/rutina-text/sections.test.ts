import { describe, expect, it } from 'vitest';
import { Catalog } from './catalog';
import { parseRutina } from './parse';
import { joinSections, splitSections } from './sections';

describe('section texts', () => {
  const parts = {
    warmup: '# suave\nAMRAP 5 min\n  10 burpees\n',
    main: 'For time cap 20 min\n  3 rondas:\n    10 dominadas\n\n40 burpees\n',
    cooldown: 'plancha 1 min // respira\n',
    goal: '',
  };
  it('joins into one indented document and splits back to the same texts', () => {
    const doc = joinSections(parts);
    expect(doc).toBe(`Calentamiento
  # suave
  AMRAP 5 min
    10 burpees

For time cap 20 min
  3 rondas:
    10 dominadas

40 burpees

Estiramiento
  plancha 1 min // respira
`);
    expect(splitSections(doc)).toEqual(parts);
  });
  it('keeps each tab in its own section when the main lines have no indentation', () => {
    for (const main of ['3x10 flexiones\n3x12 flexiones inclinadas\n', 'Fuerza\n3x10 flexiones\n3x12 flexiones inclinadas\n']) {
      const doc = joinSections({ warmup: '12 caterpillar\n', main, cooldown: '20s cobra\n20s pose del niño\n', goal: '' });
      const blocks = parseRutina(doc, { catalog: new Catalog([]) }).blocks;
      const names = (section: string) =>
        blocks
          .filter((b) => b.section === section)
          .flatMap((b) => [b, ...(b.children ?? [])])
          .flatMap((b) => b.items.map((i) => i.rawName));
      expect(names('warmup')).toEqual(['caterpillar']);
      expect(names('main')).toEqual(['flexiones', 'flexiones inclinadas']);
      expect(names('cooldown')).toEqual(['cobra', 'pose del niño']);
    }
  });
  it('leaves empty sections out and tolerates a document with no headers', () => {
    expect(joinSections({ warmup: '', main: '10 burpees', cooldown: '  \n', goal: '' })).toBe('10 burpees\n');
    expect(splitSections('10 burpees\n')).toEqual({ warmup: '', main: '10 burpees\n', cooldown: '', goal: '' });
    expect(joinSections({ warmup: '', main: '', cooldown: '', goal: '' })).toBe('');
  });
});
