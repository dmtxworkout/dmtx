import { z } from 'zod';
import { uuidSchema } from '../common';

/**
 * Muscles and equipment: the tags an exercise carries so the app can search
 * "pierna" or "sin equipo" and show what a rutina works. One flat list each;
 * the admin picks the granularity with the names (Pierna, Pecho, Core…).
 */
export const muscleSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
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
});
export type CreateMuscleInput = z.infer<typeof createMuscleSchema>;
export const updateMuscleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  position: z.number().int().optional(),
});
export type UpdateMuscleInput = z.infer<typeof updateMuscleSchema>;

export const createEquipmentSchema = z.object({ name: z.string().min(1).max(100) });
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;
export const updateEquipmentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  position: z.number().int().optional(),
});
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;
