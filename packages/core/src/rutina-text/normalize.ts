/** Lowercase, strip accents, collapse whitespace. Used for every keyword/name comparison. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export const NUM = String.raw`\d+(?:[.,]\d+)?`;

const SEC_UNIT = String.raw`(?:segundos?|segs?|seconds?|secs?|s|''|")`;
const MIN_UNIT = String.raw`(?:minutos?|mins?|')`;
const HOUR_UNIT = String.raw`(?:horas?|hrs?|h)`;

/**
 * A duration, e.g. `12 min`, `90s`, `1:30`, `1 min 30 s`, `30''`, `2 h`.
 * No capture groups: feed the matched text to `parseDuration`.
 */
export const DUR = String.raw`(?:\d+:\d{2}|${NUM}\s*${HOUR_UNIT}(?![a-z])(?:\s*${NUM}\s*${MIN_UNIT}(?![a-z]))?|${NUM}\s*${MIN_UNIT}(?![a-z])(?:\s*${NUM}\s*${SEC_UNIT}(?![a-z]))?|${NUM}\s*${SEC_UNIT}(?![a-z]))`;

/** A distance, e.g. `400 m`, `1.5 km`, `1 mi`. No capture groups: see `parseDistance`. */
export const DIST = String.raw`(?:${NUM}\s*(?:kilometros?|kms?|metros?|mts?|m|millas?|mi)(?![a-z]))`;

const toNum = (s: string) => Number(s.replace(',', '.'));

/** Seconds from text matched by `DUR`, or null. */
export function parseDuration(text: string): number | null {
  const t = fold(text);
  const mmss = t.match(/^(\d+):(\d{2})$/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  let total = 0;
  let any = false;
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*([a-z]+|''|"|')/g)) {
    const v = toNum(m[1]!);
    const u = m[2]!;
    if (/^(h|hr|hrs|hora|horas)$/.test(u)) total += v * 3600;
    else if (/^(min|mins|minuto|minutos|')$/.test(u)) total += v * 60;
    else if (/^(s|seg|segs|segundo|segundos|sec|secs|second|seconds|''|")$/.test(u)) total += v;
    else return null;
    any = true;
  }
  return any ? Math.round(total) : null;
}

/** Meters from text matched by `DIST`, or null. */
export function parseDistance(text: string): number | null {
  const m = fold(text).match(/^(\d+(?:[.,]\d+)?)\s*([a-z]+)$/);
  if (!m) return null;
  const v = toNum(m[1]!);
  const u = m[2]!;
  if (/^(km|kms|kilometro|kilometros)$/.test(u)) return Math.round(v * 1000);
  if (/^(m|mt|mts|metro|metros)$/.test(u)) return Math.round(v);
  if (/^(mi|milla|millas)$/.test(u)) return Math.round(v * 1609.344);
  return null;
}

/** `90` → "90s", `120` → "2 min", `90`+ → "1:30"-style when not whole minutes. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds < 600) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000 && meters % 100 === 0) {
    const km = meters / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
  }
  return `${meters} m`;
}

const COLLAPSE = (s: string) => s.replace(/\s{2,}/g, ' ').trim();

/** Remove a regex match from `s`, returning the remainder (whitespace collapsed). */
export function cut(s: string, re: RegExp): { match: RegExpMatchArray | null; rest: string } {
  const match = s.match(re);
  if (!match || match.index == null) return { match: null, rest: s };
  const rest = COLLAPSE(s.slice(0, match.index) + ' ' + s.slice(match.index + match[0].length));
  return { match, rest };
}
