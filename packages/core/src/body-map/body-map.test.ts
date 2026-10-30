import { describe, expect, it } from 'vitest';
import { BODY_PART } from '@dmtx/schemas';
import { BODY_FIGURES } from './index';

describe('BODY_FIGURES', () => {
  it.each(['male', 'female'] as const)('draws every body part on the %s figure', (kind) => {
    const { front, back } = BODY_FIGURES[kind];
    for (const part of BODY_PART) {
      expect([...(front.parts[part] ?? []), ...(back.parts[part] ?? [])].length, part).toBeGreaterThan(0);
    }
  });
});
