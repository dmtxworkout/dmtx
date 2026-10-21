import { describe, expect, it } from 'vitest';
import { estimateDurationSeconds, type DurationBlock } from './duration';

const ex = (o: Partial<DurationBlock['items'][number]>): DurationBlock['items'][number] => ({ kind: 'exercise', ...o });
const group = (items: DurationBlock['items'], rounds: number | null = null): DurationBlock => ({ kind: 'group', rounds, items, blocks: [] });
const part = (format: string, formatConfig: unknown, blocks: DurationBlock[]): DurationBlock => ({
  kind: 'part', format, formatConfig, items: [], blocks,
});

describe('estimateDurationSeconds', () => {
  it('is null for an empty rutina', () => {
    expect(estimateDurationSeconds([])).toBeNull();
  });
  it('uses the timer of timed formats', () => {
    expect(estimateDurationSeconds([part('amrap', { totalSeconds: 720 }, [group([ex({ reps: 10 })])])])).toBe(720);
    expect(estimateDurationSeconds([part('emom', { intervalSeconds: 90, rounds: 8 }, [])])).toBe(720);
    expect(estimateDurationSeconds([part('tabata', { workSeconds: 20, restSeconds: 10, rounds: 8 }, [])])).toBe(240);
  });
  it('estimates content from reps, time, distance, sets and rest, rounded up to minutes', () => {
    // 3 rondas × (10 reps·3s + 5 + 30s + 5 + 400m·0.3s + 5) = 3 × 195 = 585 → 600
    const w = group([ex({ reps: 10 }), ex({ workSeconds: 30 }), ex({ distanceMeters: 400 })], 3);
    expect(estimateDurationSeconds([w])).toBe(600);
    // 5x5 with 2 min rest: 5·(5·3) + 4·120 + 5 = 560 → 600
    expect(estimateDurationSeconds([group([ex({ sets: 5, reps: 5, restBetweenSeconds: 120 })])])).toBe(600);
  });
  it('never exceeds a time cap and adds sections together', () => {
    const big = part('for_time', { timeCapSeconds: 600 }, [group([ex({ reps: 100 })], 10)]);
    expect(estimateDurationSeconds([big])).toBe(600);
    expect(estimateDurationSeconds([part('amrap', { totalSeconds: 300 }, []), big])).toBe(900);
  });
});
