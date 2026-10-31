import { describe, expect, it } from 'vitest';
import { metabolicRates } from './energy';

const today = new Date(2026, 9, 31);
const base = { dateOfBirth: '1996-10-31', heightCm: 180, weightKg: 80, activityLevel: 'moderate' } as const;

describe('metabolicRates', () => {
  it('uses Mifflin-St Jeor and the activity factor', () => {
    expect(metabolicRates({ ...base, gender: 'male' }, today)).toEqual({ basal: 1780, active: 2759 });
    expect(metabolicRates({ ...base, gender: 'female' }, today)).toEqual({ basal: 1614, active: 2502 });
  });

  it('counts a birthday still to come as a year younger', () => {
    const before = metabolicRates({ ...base, gender: 'male', dateOfBirth: '1996-11-01' }, today);
    expect(before?.basal).toBe(1785);
  });

  it('is null while data is missing', () => {
    expect(metabolicRates({ ...base, gender: null }, today)).toBeNull();
    expect(metabolicRates({ ...base, gender: 'male', weightKg: null }, today)).toBeNull();
  });
});
