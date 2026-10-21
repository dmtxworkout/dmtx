import { describe, expect, it } from 'vitest';
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

Enfriamiento
  plancha 1 min // respira
`);
    expect(splitSections(doc)).toEqual(parts);
  });
  it('leaves empty sections out and tolerates a document with no headers', () => {
    expect(joinSections({ warmup: '', main: '10 burpees', cooldown: '  \n', goal: '' })).toBe('10 burpees\n');
    expect(splitSections('10 burpees\n')).toEqual({ warmup: '', main: '10 burpees\n', cooldown: '', goal: '' });
    expect(joinSections({ warmup: '', main: '', cooldown: '', goal: '' })).toBe('');
  });
});
