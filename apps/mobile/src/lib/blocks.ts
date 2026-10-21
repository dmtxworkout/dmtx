import type { WorkoutBlock } from './types';

/**
 * The players and lists walk one level of blocks with their items. Blocks can
 * nest deeper (a "3 rondas" group holding an AMRAP part, which holds blocks):
 * for now the inner structure plays as a plain sequence inside its group — the
 * group's rounds are kept, inner timers are not.
 */
export function flattenBlocks(blocks: WorkoutBlock[]): WorkoutBlock[] {
  const out: WorkoutBlock[] = [];
  for (const b of blocks) {
    if (!b.blocks.length) {
      out.push(b);
      continue;
    }
    if (b.kind === 'part') {
      out.push(...flattenBlocks(b.blocks));
      continue;
    }
    // A group with nested blocks: one block, every descendant item in order.
    out.push({ ...b, items: [...b.items, ...descendantItems(b.blocks)], blocks: [] });
  }
  return out;
}

function descendantItems(blocks: WorkoutBlock[]): WorkoutBlock['items'] {
  return blocks.flatMap((b) => [...b.items, ...descendantItems(b.blocks)]);
}
