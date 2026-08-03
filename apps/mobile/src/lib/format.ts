import type { LoadPrescription, Tempo } from '@dmtx/schemas';
import type { WorkoutItem } from './types';

/** Seconds → "M:SS". */
export function mmss(total: number): string {
  const s = Math.max(0, Math.round(total));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Seconds → "18 min" (rounded, min 1). */
export function durationLabel(seconds: number | null | undefined): string {
  if (!seconds) return '';
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

/** Weight → "100" or "102.5" (drops the trailing .0). */
export function fmtKg(w: number): string {
  return Number.isInteger(w) ? String(w) : w.toFixed(1);
}

const phase = (v: number | 'X'): string => (v === 'X' ? 'X' : String(v));

/** Tempo → "0-3-1-X" (holdTop-eccentric-holdBottom-concentric). */
export function tempoDash(t: Tempo | null | undefined): string {
  if (!t) return '';
  return [t.holdTop, t.eccentric, t.holdBottom, t.concentric].map(phase).join('-');
}

/** Tempo → compact "31X" (drops a leading 0), used in the small player card. */
export function tempoCompact(t: Tempo | null | undefined): string {
  if (!t) return '';
  const joined = [t.holdTop, t.eccentric, t.holdBottom, t.concentric].map(phase).join('');
  return joined.length === 4 && joined.startsWith('0') ? joined.slice(1) : joined;
}

/** Load prescription → short label, e.g. "+10 kg", "corp", "RPE 8", "70%". */
export function loadLabel(load: LoadPrescription | null | undefined): string {
  if (!load) return '';
  switch (load.type) {
    case 'bodyweight':
      return load.addedValue ? `+${load.addedValue} ${load.unit ?? 'kg'}` : 'corp';
    case 'absolute':
      return `${load.value} ${load.unit}`;
    case 'percent_1rm':
      return `${load.value}%`;
    case 'rpe':
      return `RPE ${load.value}`;
    default:
      return '';
  }
}

/** The prescription target shown next to an exercise, e.g. "3 reps", "2 × 45 s". */
export function targetLabel(item: WorkoutItem): string {
  const mt = item.exercise?.measurementType;
  const sets = item.sets && item.sets > 1 ? item.sets : null;
  if (mt === 'time' && item.workSeconds != null) {
    const unit = item.workSeconds >= 60 ? mmss(item.workSeconds) : `${item.workSeconds} s`;
    return sets ? `${sets} × ${unit}` : unit;
  }
  if (mt === 'distance' && item.distanceMeters != null) {
    return sets ? `${sets} × ${item.distanceMeters} m` : `${item.distanceMeters} m`;
  }
  if (item.reps != null) {
    return sets ? `${sets} × ${item.reps}` : `${item.reps} reps`;
  }
  if (item.workSeconds != null) return `${item.workSeconds} s`;
  return sets ? `${sets} series` : '';
}
