import { z } from 'zod';
import { activityLevelSchema, bodyFigureSchema, genderSchema, type ActivityLevel } from '../enums';

export const ACTIVITY_LEVEL_LABEL: Record<ActivityLevel, { label: string; hint: string }> = {
  sedentary: { label: 'Sedentario', hint: 'Poco o nada de ejercicio' },
  light: { label: 'Ligero', hint: 'Ejercicio 1 a 3 días por semana' },
  moderate: { label: 'Moderado', hint: 'Ejercicio 3 a 5 días por semana' },
  active: { label: 'Activo', hint: 'Ejercicio 6 a 7 días por semana' },
  very_active: { label: 'Muy activo', hint: 'Ejercicio intenso a diario o trabajo físico' },
};

/** Whole years from a `YYYY-MM-DD` birth date to `today`. */
export function ageOn(dateOfBirth: string, today: Date = new Date()): number {
  const [year = 0, month = 1, day = 1] = dateOfBirth.split('-').map(Number);
  const hadBirthday = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  return today.getFullYear() - year - (hadBirthday ? 0 : 1);
}

export const MIN_AGE = 13;

export const dateOfBirthSchema = z.iso.date().refine((d) => {
  const age = ageOn(d);
  return age >= MIN_AGE && age <= 120;
});
export const heightCmSchema = z.number().int().min(100).max(250);
export const weightKgSchema = z.number().min(30).max(300);

/** What a member tells the app about themselves; canonical units (cm, kg). */
export const updateProfileSchema = z
  .object({
    dateOfBirth: dateOfBirthSchema,
    gender: genderSchema,
    weightKg: weightKgSchema,
    heightCm: heightCmSchema,
    activityLevel: activityLevelSchema,
    bodyFigure: bodyFigureSchema,
  })
  .partial();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
