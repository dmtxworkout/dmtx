import { inArray, isNull, and } from 'drizzle-orm';
import { mediaAssets } from '@dmtx/db';
import type { Database } from '@dmtx/db';
import { estimateDurationSeconds } from '@dmtx/core';
import type { BlockSection, WorkoutBlockInput, WorkoutFormat, WorkoutType } from '@dmtx/schemas';

/**
 * A rutina has three sections (warm-up, main, stretch); each is a video or
 * text. This resolves what the admin sent into what the row stores: the
 * blocks of the sections that are text (a section with a video drops any
 * text it may still carry), `type` from the main section, and the estimated
 * duration — the text's estimate plus the videos' lengths from media_assets.
 */
export interface SectionInput {
  videoAssetId?: string | null;
  warmupVideoAssetId?: string | null;
  cooldownVideoAssetId?: string | null;
  blocks: WorkoutBlockInput[];
  format?: WorkoutFormat | null;
}

export async function sectionValues(db: Database, input: SectionInput) {
  const videos: Record<Exclude<BlockSection, 'goal'>, string | null> = {
    warmup: input.warmupVideoAssetId ?? null,
    main: input.videoAssetId ?? null,
    cooldown: input.cooldownVideoAssetId ?? null,
  };
  const blocks = input.blocks.filter((b) => b.section === 'goal' || !videos[b.section]);
  const ids = Object.values(videos).filter((id): id is string => !!id);
  const durations = ids.length
    ? await db
        .select({ id: mediaAssets.id, seconds: mediaAssets.durationSeconds })
        .from(mediaAssets)
        .where(and(inArray(mediaAssets.id, ids), isNull(mediaAssets.deletedAt)))
    : [];
  const videoSeconds = durations.reduce((n, d) => n + (d.seconds ?? 0), 0);
  const textSeconds = blocks.length ? (estimateDurationSeconds(blocks) ?? 0) : 0;
  const total = videoSeconds + textSeconds;
  const type: WorkoutType = videos.main ? 'video' : 'structured';
  const hasContent = blocks.length > 0 || ids.length > 0;
  return {
    type,
    format: videos.main ? null : (input.format ?? null),
    videoAssetId: videos.main,
    warmupVideoAssetId: videos.warmup,
    cooldownVideoAssetId: videos.cooldown,
    blocks,
    estimatedDurationSeconds: total > 0 ? total : null,
    hasContent,
  };
}
