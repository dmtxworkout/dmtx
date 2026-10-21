import { fold } from './normalize';
import type { CatalogExercise, ExerciseMatch } from './types';

interface Entry {
  ex: CatalogExercise;
  /** Folded name + aliases. */
  keys: string[];
}

/** Pre-folded catalog for repeated lookups. Build once per parse. */
export class Catalog {
  private entries: Entry[];

  constructor(exercises: CatalogExercise[]) {
    this.entries = exercises.map((ex) => ({
      ex,
      keys: [ex.name, ...(ex.aliases ?? [])].map(fold).filter(Boolean),
    }));
  }

  get size() {
    return this.entries.length;
  }

  /** Best match for a free-text name, or null. */
  resolve(raw: string): { match: ExerciseMatch | null; suggestions: string[]; ambiguous: boolean } {
    const q = fold(raw);
    if (!q) return { match: null, suggestions: [], ambiguous: false };
    // An exact name still resolves when archived (rutinas written before keep
    // working); typos and suggestions only ever look at live exercises. Plural
    // and singular count as the same name ("10 sentadillas" for "Sentadilla").
    const qs = singular(q);
    const isExact = (e: Entry) => e.keys.includes(q) || e.keys.some((k) => singular(k) === qs);
    const exact = this.entries.find((e) => isExact(e) && !e.ex.archived) ?? this.entries.find(isExact);
    if (exact) {
      return {
        match: { id: exact.ex.id, name: exact.ex.name, confidence: 'exact', archived: !!exact.ex.archived },
        suggestions: [],
        ambiguous: false,
      };
    }
    const scored = this.entries
      .filter((e) => !e.ex.archived)
      .map((e) => ({ e, score: Math.max(...e.keys.map((k) => similarity(q, k))) }))
      .filter((s) => s.score >= 0.5)
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    const suggestions = scored.slice(0, 4).map((s) => s.e.ex.name);
    if (!best || best.score < 0.78) return { match: null, suggestions, ambiguous: false };
    const second = scored[1];
    const ambiguous = !!second && second.score === best.score && second.e.ex.id !== best.e.ex.id;
    return {
      match: { id: best.e.ex.id, name: best.e.ex.name, confidence: 'fuzzy' },
      suggestions,
      ambiguous,
    };
  }

  /** Ranked candidates for autocomplete (prefix / token / fuzzy). */
  search(raw: string, limit = 8): CatalogExercise[] {
    const q = fold(raw);
    const live = this.entries.filter((e) => !e.ex.archived);
    if (!q) return live.slice(0, limit).map((e) => e.ex);
    return live
      .map((e) => ({ e, score: Math.max(...e.keys.map((k) => completionScore(q, k))) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || a.e.ex.name.localeCompare(b.e.ex.name))
      .slice(0, limit)
      .map((s) => s.e.ex);
  }

  byId(id: string): CatalogExercise | undefined {
    return this.entries.find((e) => e.ex.id === id)?.ex;
  }
}

/**
 * A folded name with each word in a rough singular, so "flexiones diamante"
 * and "flexion diamante" compare equal: "-es" after a consonant comes off
 * (flexiones → flexion), otherwise a final "-s" (sentadillas → sentadilla,
 * burpees → burpee). Both sides of a comparison go through it.
 */
export function singular(folded: string): string {
  return folded
    .split(' ')
    .map((w) => {
      if (w.length <= 3) return w;
      if (/[^aeiou]es$/.test(w)) return w.slice(0, -2);
      if (w.endsWith('s')) return w.slice(0, -1);
      return w;
    })
    .join(' ');
}

/** 0..1 similarity used for resolving a complete name. */
export function similarity(q: string, k: string): number {
  if (q === k) return 1;
  // Whole-query prefix of the catalog key ("flexiones" → "flexiones de pecho").
  if (k.startsWith(q + ' ')) return 0.9;
  // Every query token is a prefix of some key token, in order.
  const qt = q.split(' ');
  const kt = k.split(' ');
  if (tokensPrefix(qt, kt)) return 0.85;
  const d = damerauLevenshtein(q, k);
  const len = Math.max(q.length, k.length);
  return len === 0 ? 0 : 1 - d / len;
}

/** Looser score for autocomplete while typing. */
function completionScore(q: string, k: string): number {
  if (k === q) return 3;
  if (k.startsWith(q)) return 2.5;
  const qt = q.split(' ');
  const kt = k.split(' ');
  if (tokensPrefix(qt, kt)) return 2;
  if (kt.some((t) => t.startsWith(qt[qt.length - 1] ?? '')) && qt.length === 1) return 1.5;
  // Typo-tolerant prefix ("felx" → "flexiones"): one edit within the same-length prefix.
  if (q.length >= 4 && damerauLevenshtein(q, k.slice(0, q.length)) <= 1) return 1.4;
  if (k.includes(q)) return 1.2;
  const sim = 1 - damerauLevenshtein(q, k) / Math.max(q.length, k.length);
  return sim >= 0.7 ? sim : 0;
}

function tokensPrefix(qt: string[], kt: string[]): boolean {
  let i = 0;
  for (const t of qt) {
    while (i < kt.length && !kt[i]!.startsWith(t)) i += 1;
    if (i >= kt.length) return false;
    i += 1;
  }
  return true;
}

/** Edit distance with adjacent transpositions (catches "felxiones"). */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) d[i]![0] = i;
  for (let j = 0; j <= n; j += 1) d[0]![j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[m]![n]!;
}
