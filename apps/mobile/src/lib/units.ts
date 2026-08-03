/**
 * Unit preferences. Data is stored canonically (weight in kg, distance in
 * meters); we convert ONLY at the display/input boundary based on the user's
 * chosen units. Default: pounds + kilometers.
 */
export type WeightUnit = 'kg' | 'lb';
export type DistanceUnit = 'km' | 'mi';
export interface Units {
  weight: WeightUnit;
  distance: DistanceUnit;
}
export const DEFAULT_UNITS: Units = { weight: 'lb', distance: 'km' };

const KG_PER_LB = 0.45359237;
const M_PER_KM = 1000;
const M_PER_MI = 1609.344;

const round1 = (n: number) => Math.round(n * 10) / 10;
/** Trim to at most 2 decimals, dropping trailing zeros (0.80 → 0.8, 5.00 → 5). */
const trim = (n: number) => parseFloat(n.toFixed(2));
/** Number → string without a trailing ".0". */
export const fmtNum = (n: number) => String(trim(n));

// ---- Weight ---------------------------------------------------------------
export const kgToWeight = (kg: number, u: WeightUnit) => (u === 'lb' ? kg / KG_PER_LB : kg);
export const weightToKg = (v: number, u: WeightUnit) => (u === 'lb' ? v * KG_PER_LB : v);
/** Plate-friendly stepper increment in display units. */
export const weightStep = (u: WeightUnit) => (u === 'lb' ? 5 : 2.5);
/** Prescribed kg → a clean value in display units for prefilling a stepper. */
export const weightPrefill = (kg: number, u: WeightUnit) =>
  u === 'lb' ? Math.round(kgToWeight(kg, u)) : round1(kg);
/** Canonical kg → display string, e.g. "220 lb" / "100 kg". */
export function formatWeight(kg: number | null | undefined, u: WeightUnit): string {
  if (kg == null) return '';
  const v = u === 'lb' ? Math.round(kgToWeight(kg, u)) : round1(kg);
  return `${fmtNum(v)} ${u}`;
}

// ---- Distance -------------------------------------------------------------
// Distance is entered in meters; only the *display* of results is converted.
const mToDistance = (m: number, u: DistanceUnit) => (u === 'mi' ? m / M_PER_MI : m / M_PER_KM);
/** Canonical meters → display string, e.g. "0.8 km" / "3.1 mi". */
export function formatDistance(m: number | null | undefined, u: DistanceUnit): string {
  if (m == null) return '';
  return `${fmtNum(mToDistance(m, u))} ${u}`;
}
