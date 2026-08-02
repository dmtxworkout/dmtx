import { z } from 'zod';

export const uuidSchema = z.uuid();

export const slugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido (usa minúsculas, números y guiones)');

/** Standard list query for admin tables. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  search: z.string().trim().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Wrap an item schema in a paginated envelope. */
export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });
}

// Combining diacritical marks (U+0300–U+036F), built from an escape string so
// the source stays pure ASCII.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/** Turn "Flexiones de pecho" into "flexiones-de-pecho". */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
