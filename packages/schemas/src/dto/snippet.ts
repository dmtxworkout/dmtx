import { z } from 'zod';
import { uuidSchema } from '../common';

/**
 * A saved block ("bloque guardado"): a reusable piece of rutina text (one or
 * more lines in the rutina notation) the editor can insert by name. Stored as
 * text because the editor is text-first; the parser validates it on insert.
 */
export const createSnippetSchema = z.object({
  name: z.string().min(1).max(200),
  text: z.string().min(1).max(20000),
});
export type CreateSnippetInput = z.infer<typeof createSnippetSchema>;

export const updateSnippetSchema = createSnippetSchema.partial();
export type UpdateSnippetInput = z.infer<typeof updateSnippetSchema>;

export const snippetSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  text: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Snippet = z.infer<typeof snippetSchema>;
