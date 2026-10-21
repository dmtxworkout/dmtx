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

/**
 * The PATCH schema for a create schema: every field optional and, crucially,
 * WITHOUT the create defaults. `createSchema.partial()` keeps `.default([])`,
 * so a `{ archived: true }` patch would arrive as `{ archived: true, cues: [],
 * aliases: [], … }` and wipe the lists it never mentioned.
 */
export function updateSchemaOf<T extends z.ZodRawShape>(create: z.ZodObject<T>) {
  const shape = Object.fromEntries(
    Object.entries(create.shape).map(([key, field]) => {
      const inner = field instanceof z.ZodDefault ? (field as z.ZodDefault<z.ZodTypeAny>).removeDefault() : (field as z.ZodTypeAny);
      return [key, inner.optional()];
    }),
  ) as unknown as { [K in keyof T]: z.ZodOptional<T[K] extends z.ZodDefault<infer I> ? I : T[K]> };
  return z.object(shape);
}
