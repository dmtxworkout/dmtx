import { z } from 'zod';
import { uuidSchema } from '../common';

/**
 * A reusable block ("bloque reutilizable"): a reusable piece of rutina text (one or
 * more lines in the rutina notation) the editor can insert by name. Stored as
 * text because the editor is text-first; the parser validates it on insert.
 */
export const createReusableBlockSchema = z.object({
  name: z.string().min(1).max(200),
  text: z.string().min(1).max(20000),
});
export type CreateReusableBlockInput = z.infer<typeof createReusableBlockSchema>;

export const updateReusableBlockSchema = createReusableBlockSchema.partial();
export type UpdateReusableBlockInput = z.infer<typeof updateReusableBlockSchema>;

export const reusableBlockSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  text: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ReusableBlock = z.infer<typeof reusableBlockSchema>;
