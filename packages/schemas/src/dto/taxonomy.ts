import { z } from 'zod';
import { uuidSchema } from '../common';
import { muscleZoneSchema } from '../enums';

/**
 * Muscles and equipment: the tags an exercise carries so the app can search
 * "brazos" or "sin equipo" and show what a rutina works. Each muscle belongs
 * to a body zone (Brazos → Bíceps, Tríceps…): the app browses by zone, and
 * narrows to a muscle.
 */
export const muscleSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  zone: muscleZoneSchema.nullable(),
  position: z.number().int(),
  exerciseCount: z.number().int(),
});
export type Muscle = z.infer<typeof muscleSchema>;

export const equipmentSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  position: z.number().int(),
  exerciseCount: z.number().int(),
});
export type Equipment = z.infer<typeof equipmentSchema>;

export const taxonomySchema = z.object({
  muscles: z.array(muscleSchema),
  equipment: z.array(equipmentSchema),
});
export type Taxonomy = z.infer<typeof taxonomySchema>;

export const createMuscleSchema = z.object({
  name: z.string().min(1).max(100),
  zone: muscleZoneSchema.nullish(),
});
export type CreateMuscleInput = z.infer<typeof createMuscleSchema>;
export const updateMuscleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  zone: muscleZoneSchema.nullish(),
  position: z.number().int().optional(),
});
export type UpdateMuscleInput = z.infer<typeof updateMuscleSchema>;

/** Several muscles put in one zone at once (null = «Sin zona»). */
export const setMuscleZoneSchema = z.object({
  ids: z.array(uuidSchema).min(1).max(500),
  zone: muscleZoneSchema.nullable(),
});
export type SetMuscleZoneInput = z.infer<typeof setMuscleZoneSchema>;

export const createEquipmentSchema = z.object({ name: z.string().min(1).max(100) });
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;
export const updateEquipmentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  position: z.number().int().optional(),
});
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;
