import { z } from 'zod';

/**
 * Load prescription for a workout item — how much resistance to use.
 * Discriminated on `type` so each style carries only the fields it needs.
 */
export const loadPrescriptionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('percent_1rm'), value: z.number().min(0).max(200) }),
  z.object({ type: z.literal('rpe'), value: z.number().min(1).max(10) }),
  z.object({
    type: z.literal('absolute'),
    value: z.number().min(0),
    // CrossFit-style dual prescription ("@135/95 lb"): `value` is the men's / default
    // load, `womenValue` the women's. Same unit for both.
    womenValue: z.number().min(0).optional(),
    unit: z.enum(['kg', 'lb']),
  }),
  z.object({
    type: z.literal('bodyweight'),
    addedValue: z.number().optional(),
    unit: z.enum(['kg', 'lb']).optional(),
  }),
]);
export type LoadPrescription = z.infer<typeof loadPrescriptionSchema>;
