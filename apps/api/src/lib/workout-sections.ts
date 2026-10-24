import { inArray, isNull, and } from 'drizzle-orm';
import { mediaAssets } from '@dmtx/db';
import type { Database } from '@dmtx/db';
import { estimateDurationSeconds } from '@dmtx/core';
import type { WorkoutBlockInput, WorkoutFormat } from '@dmtx/schemas';

/**
 * A rutina has three sections (warm-up, main, stretch); each is written
 * (blocks), a video, or both — with both, the app lets the user follow the
 * class or be guided exercise by exercise. This resolves what the admin sent
 * into what the row stores: the blocks, `hasVideo` / `isGuided` from the main
 * section, the format (the main section's first part's), and the estimated
 * duration — per section, the video's length when it has one (that is how
 * long the class runs), else the written rutina's estimate.
 */
export interface SectionInput {
  videoAssetId?: string | null;
  warmupVideoAssetId?: string | null;
  cooldownVideoAssetId?: string | null;
  blocks: WorkoutBlockInput[];
  format?: WorkoutFormat | null;
}

const SECTIONS = ['warmup', 'main', 'cooldown'] as const;

export async function sectionValues(db: Database, input: SectionInput) {
  const videos: Record<(typeof SECTIONS)[number], string | null> = {
    warmup: input.warmupVideoAssetId ?? null,
    main: input.videoAssetId ?? null,
    cooldown: input.cooldownVideoAssetId ?? null,
  };
  const blocks = input.blocks;
  const ids = Object.values(videos).filter((id): id is string => !!id);
  const rows = ids.length
    ? await db
        .select({ id: mediaAssets.id, seconds: mediaAssets.durationSeconds })
        .from(mediaAssets)
        .where(and(inArray(mediaAssets.id, ids), isNull(mediaAssets.deletedAt)))
    : [];
  const lengths = new Map(rows.map((r) => [r.id, r.seconds ?? 0]));
  let total = 0;
  for (const sec of SECTIONS) {
    const own = blocks.filter((b) => b.section === sec);
    const video = videos[sec];
    total += video ? (lengths.get(video) ?? 0) : own.length ? (estimateDurationSeconds(own) ?? 0) : 0;
  }
  const isGuided = blocks.some((b) => b.section === 'main');
  const hasVideo = !!videos.main;
  return {
    hasVideo,
    isGuided,
    format: isGuided ? (input.format ?? null) : null,
    videoAssetId: videos.main,
    warmupVideoAssetId: videos.warmup,
    cooldownVideoAssetId: videos.cooldown,
    blocks,
    estimatedDurationSeconds: total > 0 ? total : null,
    hasContent: blocks.some((b) => b.section !== 'goal') || ids.length > 0,
  };
}
