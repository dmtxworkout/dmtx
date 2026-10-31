import { ageOn, type ActivityLevel, type Gender } from '@dmtx/schemas';

/** Harris-Benedict activity multipliers, as commonly applied to the basal rate. */
const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export interface EnergyInput {
  gender: Gender | null;
  dateOfBirth: string | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
}

/**
 * Basal rate by Mifflin-St Jeor and active rate (basal × activity), in kcal/day.
 * Null while any of the data is missing.
 */
export function metabolicRates(p: EnergyInput, today: Date = new Date()): { basal: number; active: number } | null {
  if (!p.gender || !p.dateOfBirth || !p.heightCm || !p.weightKg || !p.activityLevel) return null;
  const basal = 10 * p.weightKg + 6.25 * p.heightCm - 5 * ageOn(p.dateOfBirth, today) + (p.gender === 'male' ? 5 : -161);
  return { basal: Math.round(basal), active: Math.round(basal * ACTIVITY_FACTOR[p.activityLevel]) };
}
