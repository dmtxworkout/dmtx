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
  // A video that is no longer in the library (deleted before deletes were
  // refused while in use) counts as no video: the row never points at a file
  // that is gone, and has_video says the truth.
  const missing: (typeof SECTIONS)[number][] = [];
  for (const sec of SECTIONS) {
    const id = videos[sec];
    if (id && !lengths.has(id)) {
      missing.push(sec);
      videos[sec] = null;
    }
  }
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
    hasContent: blocks.some((b) => b.section !== 'goal') || Object.values(videos).some(Boolean),
    /** The sections whose video was no longer in the library (dropped above). */
    missing,
  };
}

export const SECTION_LABEL: Record<(typeof SECTIONS)[number], string> = {
  warmup: 'Calentamiento',
  main: 'Rutina',
  cooldown: 'Estiramiento',
};

/**
 * Publishing is refused while a rutina points at a video that is no longer
 * in the library: says which (for a program, which day) so the admin can pick
 * another or take it off. Null when every video exists.
 */
export async function missingVideosMessage(
  db: Database,
  rutinas: { label?: string; warmupVideoAssetId?: string | null; videoAssetId?: string | null; cooldownVideoAssetId?: string | null }[],
): Promise<string | null> {
  const wanted = new Set<string>();
  for (const r of rutinas) for (const id of [r.warmupVideoAssetId, r.videoAssetId, r.cooldownVideoAssetId]) if (id) wanted.add(id);
  if (!wanted.size) return null;
  const rows = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(and(inArray(mediaAssets.id, [...wanted]), isNull(mediaAssets.deletedAt)));
  const present = new Set(rows.map((r) => r.id));
  for (const r of rutinas) {
    const ids = { warmup: r.warmupVideoAssetId, main: r.videoAssetId, cooldown: r.cooldownVideoAssetId };
    for (const sec of SECTIONS) {
      const id = ids[sec];
      if (id && !present.has(id)) {
        return `${r.label ? `${r.label}: l` : 'L'}a sección ${SECTION_LABEL[sec]} tiene un video que ya no está en la biblioteca. Elige otro o quítalo antes de publicar.`;
      }
    }
  }
  return null;
}
