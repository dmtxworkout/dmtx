import { z } from 'zod';

/** A transcoded rendition of a source video stored in R2. */
export const mediaVariantSchema = z.object({
  quality: z.string(), // e.g. '1080p', '720p', '480p'
  r2Key: z.string(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  bitrate: z.number().int().optional(),
  mimeType: z.string().optional(),
});
export type MediaVariant = z.infer<typeof mediaVariantSchema>;

export const mediaVariantsSchema = z.array(mediaVariantSchema);
export type MediaVariants = z.infer<typeof mediaVariantsSchema>;
