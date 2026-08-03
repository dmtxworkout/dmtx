import { z } from 'zod';
import { measurementTypeSchema, workoutFormatSchema } from '../enums';

/** One logged mark within a session (per exercise instance/round/set). */
export const setResultInputSchema = z.object({
  exerciseId: z.uuid(),
  exerciseName: z.string(),
  position: z.number().int().nonnegative().default(0),
  round: z.number().int().positive().nullish(),
  setNumber: z.number().int().positive().nullish(),
  measure: measurementTypeSchema.nullish(),
  reps: z.number().int().nonnegative().nullish(),
  seconds: z.number().int().nonnegative().nullish(),
  distanceMeters: z.number().int().nonnegative().nullish(),
  loadKg: z.number().nonnegative().nullish(),
});
export type SetResultInput = z.infer<typeof setResultInputSchema>;

/** Payload the mobile player sends after a workout. */
export const createWorkoutLogSchema = z.object({
  workoutId: z.uuid(),
  workoutName: z.string(),
  format: workoutFormatSchema.nullish(),
  startedAt: z.iso.datetime().nullish(),
  completedAt: z.iso.datetime().nullish(),
  durationSeconds: z.number().int().nonnegative().nullish(),
  roundsCompleted: z.number().int().nonnegative().nullish(),
  totalVolume: z.number().nonnegative().nullish(),
  notes: z.string().nullish(),
  results: z.array(setResultInputSchema),
});
export type CreateWorkoutLogInput = z.infer<typeof createWorkoutLogSchema>;
