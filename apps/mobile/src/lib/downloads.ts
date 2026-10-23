// Rutinas saved for offline use. The list and the chosen quality live in a
// JSON file in the app's documents; the videos themselves are fetched by the
// hls-downloads module (the OS keeps only the variant that fits the chosen
// height). A rutina may have up to three videos (warm-up, class, stretch):
// they are its entry's `videos`, fetched one at a time, and the entry is
// «done» when all of them are. One video downloads at a time across the
// whole queue, so several rutinas get through on their own. Each entry keeps
// the rutina as it was when queued, so its page and its player open offline.
import { useEffect, useState } from 'react';
import { File, Paths } from 'expo-file-system';
import {
  addDownloadListeners,
  cancelDownload,
  localUri,
  removeDownload,
  restoreDownloads,
  startDownload,
} from '../../modules/hls-downloads/src';
import { api } from './api';
import type { WorkoutDetail } from './types';

export type DownloadQuality = 480 | 720 | 1080;
export const QUALITIES: { value: DownloadQuality; label: string; hint: string }[] = [
  // Measured on Stream's encodes: a 9-minute class at 720p took 50 MB.
  { value: 480, label: 'Baja', hint: '480p · unos 100 MB por cada 30 min' },
  { value: 720, label: 'Media', hint: '720p · unos 180 MB por cada 30 min' },
  { value: 1080, label: 'Alta', hint: '1080p · unos 350 MB por cada 30 min' },
];
export type DownloadStatus = 'queued' | 'downloading' | 'done' | 'error';
export type VideoSection = 'warmup' | 'main' | 'cooldown';
const SECTION_LABEL: Record<VideoSection, string> = { warmup: 'Calentamiento', main: 'Rutina', cooldown: 'Estiramiento' };

export interface DownloadVideo {
  section: VideoSection;
  status: DownloadStatus;
  /** 0..1 while downloading. */
  fraction: number;
  bytes: number | null;
  /** Where the module put it (relative; see `localVideoUri`). */
  location: string | null;
  error?: string;
}

export interface Download {
  /** The rutina's id. */
  id: string;
  name: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  quality: DownloadQuality;
  /** Of the whole entry: done when every video is, error when any failed. */
  status: DownloadStatus;
  fraction: number;
  bytes: number | null;
  error?: string;
  videos: DownloadVideo[];
  /** The rutina as it was when queued, for offline pages. */
  workout: WorkoutDetail;
  createdAt: string;
}

interface Persisted {
  quality: DownloadQuality;
  items: Download[];
}

let quality: DownloadQuality = 720;
let items: Download[] = [];
let initialized = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const file = () => new File(Paths.document, 'downloads.json');

// The module identifies a video by `<rutina id>#<section>`.
const nativeId = (id: string, section: VideoSection) => `${id}#${section}`;
const parseNativeId = (native: string): { id: string; section: VideoSection } | null => {
  const at = native.lastIndexOf('#');
  if (at < 0) return null;
  const section = native.slice(at + 1);
  if (section !== 'warmup' && section !== 'main' && section !== 'cooldown') return null;
  return { id: native.slice(0, at), section };
};

/** The videos a rutina has, by section, with their (signed) manifests. */
export function sectionVideos(w: WorkoutDetail): { section: VideoSection; url: string }[] {
  const out: { section: VideoSection; url: string }[] = [];
  if (w.warmupVideoUrl) out.push({ section: 'warmup', url: w.warmupVideoUrl });
  if (w.videoUrl) out.push({ section: 'main', url: w.videoUrl });
  if (w.cooldownVideoUrl) out.push({ section: 'cooldown', url: w.cooldownVideoUrl });
  return out;
}

function save() {
  try {
    const f = file();
    if (!f.exists) f.create({ intermediates: true });
    f.write(JSON.stringify({ quality, items } satisfies Persisted));
  } catch {
    // Disk trouble: the list lives on in memory for this session.
  }
}

function load() {
  try {
    const f = file();
    if (!f.exists) return;
    const p = JSON.parse(f.textSync()) as Partial<Persisted>;
    if (p.quality === 480 || p.quality === 720 || p.quality === 1080) quality = p.quality;
    if (Array.isArray(p.items)) items = p.items.filter((d) => Array.isArray(d.videos));
  } catch {
    // Unreadable file: start empty.
  }
}

/** The entry's status, progress and size follow its videos. */
function rollup(d: Download): Download {
  const failed = d.videos.find((v) => v.status === 'error');
  const status: DownloadStatus = failed
    ? 'error'
    : d.videos.every((v) => v.status === 'done')
      ? 'done'
      : d.videos.some((v) => v.status === 'downloading')
        ? 'downloading'
        : 'queued';
  const fraction = d.videos.length ? d.videos.reduce((n, v) => n + (v.status === 'done' ? 1 : v.fraction), 0) / d.videos.length : 0;
  const known = d.videos.filter((v) => v.bytes != null);
  const bytes = known.length ? known.reduce((n, v) => n + (v.bytes ?? 0), 0) : null;
  return { ...d, status, fraction, bytes, error: failed?.error };
}

const patchVideo = (id: string, section: VideoSection, p: Partial<DownloadVideo>) => {
  items = items.map((d) => (d.id === id ? rollup({ ...d, videos: d.videos.map((v) => (v.section === section ? { ...v, ...p } : v)) }) : d));
  emit();
};
const patchItem = (id: string, p: Partial<Download>) => {
  items = items.map((d) => (d.id === id ? rollup({ ...d, ...p }) : d));
  emit();
};

/** Start the next queued video, if nothing is downloading. */
async function pump() {
  if (items.some((d) => d.videos.some((v) => v.status === 'downloading'))) return;
  const next = items.find((d) => d.videos.some((v) => v.status === 'queued'));
  const video = next?.videos.find((v) => v.status === 'queued');
  if (!next || !video) return;
  patchVideo(next.id, video.section, { status: 'downloading', fraction: 0, error: undefined });
  // The manifest URLs are signed for a day; fresh ones are asked for when possible.
  let workout = next.workout;
  try {
    workout = await api.workout(next.id);
    patchItem(next.id, { workout, name: workout.name, thumbnailUrl: workout.thumbnailUrl });
  } catch {
    // Offline or the API is down: try with what we have.
  }
  const url = sectionVideos(workout).find((v) => v.section === video.section)?.url;
  if (!url) {
    patchVideo(next.id, video.section, { status: 'error', error: 'El video no está listo' });
    save();
    void pump();
    return;
  }
  try {
    await startDownload(nativeId(next.id, video.section), url, next.quality, `${next.name} · ${SECTION_LABEL[video.section]}`);
  } catch (e) {
    patchVideo(next.id, video.section, { status: 'error', error: e instanceof Error ? e.message : 'No se pudo empezar la descarga' });
    save();
    void pump();
  }
}

/** Read the saved list, re-attach to downloads the OS kept going, and resume the queue. Once per launch. */
export async function initDownloads() {
  if (initialized) return;
  initialized = true;
  load();
  // Listeners first: a download that finished while the app was away is reported as soon as the session wakes up.
  addDownloadListeners({
    onProgress: (e) => {
      const k = parseNativeId(e.id);
      if (k) patchVideo(k.id, k.section, { fraction: e.fraction, bytes: e.bytes });
    },
    onComplete: (e) => {
      const k = parseNativeId(e.id);
      if (k) patchVideo(k.id, k.section, { status: 'done', fraction: 1, bytes: e.bytes, location: e.location });
      save();
      void pump();
    },
    onError: (e) => {
      const k = parseNativeId(e.id);
      if (k) patchVideo(k.id, k.section, { status: 'error', error: e.message });
      save();
      void pump();
    },
  });
  let active: string[] = [];
  try {
    active = await restoreDownloads();
  } catch {
    // Module missing (web, or an old build): downloads just do not run.
  }
  // A video that was downloading when the app died either carries on (iOS) or starts again.
  items = items.map((d) =>
    rollup({
      ...d,
      videos: d.videos.map((v) => (v.status === 'downloading' && !active.includes(nativeId(d.id, v.section)) ? { ...v, status: 'queued', fraction: 0 } : v)),
    }),
  );
  emit();
  void pump();
}

/** Queue a rutina's videos for offline use at the current quality. */
export function enqueueDownload(workout: WorkoutDetail) {
  if (items.some((d) => d.id === workout.id)) return;
  const videos = sectionVideos(workout);
  if (!videos.length) return;
  items = [
    ...items,
    rollup({
      id: workout.id,
      name: workout.name,
      thumbnailUrl: workout.thumbnailUrl,
      durationSeconds: workout.estimatedDurationSeconds ?? workout.videoDurationSeconds,
      quality,
      status: 'queued',
      fraction: 0,
      bytes: null,
      videos: videos.map((v) => ({ section: v.section, status: 'queued' as const, fraction: 0, bytes: null, location: null })),
      workout,
      createdAt: new Date().toISOString(),
    }),
  ];
  emit();
  save();
  void pump();
}

/** Try the failed videos again. */
export function retryDownload(id: string) {
  const d = items.find((x) => x.id === id);
  if (!d || d.status !== 'error') return;
  patchItem(id, { videos: d.videos.map((v) => (v.status === 'error' ? { ...v, status: 'queued', fraction: 0, error: undefined } : v)) });
  save();
  void pump();
}

/** Stop and forget a download at any stage (the files go too). */
export async function removeDownloadEntry(id: string) {
  const d = items.find((x) => x.id === id);
  if (!d) return;
  items = items.filter((x) => x.id !== id);
  emit();
  save();
  for (const v of d.videos) {
    try {
      if (v.status === 'downloading' || v.status === 'queued') await cancelDownload(nativeId(id, v.section));
      else if (v.location) await removeDownload(v.location);
    } catch {
      // Best effort: the entry is gone either way.
    }
  }
  void pump();
}

export async function removeAllDownloads() {
  for (const d of [...items]) await removeDownloadEntry(d.id);
}

export function setDownloadQuality(q: DownloadQuality) {
  quality = q;
  emit();
  save();
}

/** The `file://` URI of a section's finished download, for expo-video. */
export const localVideoUri = (d: Download | undefined, section: VideoSection = 'main'): string | null => {
  const v = d?.videos.find((x) => x.section === section);
  return v && v.status === 'done' && v.location ? localUri(v.location) : null;
};

export const formatBytes = (n: number | null | undefined): string =>
  n == null ? '' : n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1048576))} MB`;

function useStore<T>(select: () => T): T {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return select();
}

export const useDownloads = () => useStore(() => items);
export const useDownload = (id: string | null | undefined) => useStore(() => (id ? items.find((d) => d.id === id) : undefined));
export const useDownloadQuality = () => useStore(() => quality);

// Debugging aid: the store is reachable from the Hermes debugger in a dev
// build (`__dmtxDownloads.list()` and so on), so a download can be driven
// without tapping through the UI.
declare const __DEV__: boolean;
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  (globalThis as unknown as { __dmtxDownloads: unknown }).__dmtxDownloads = {
    list: () => items,
    quality: () => quality,
    setQuality: setDownloadQuality,
    enqueue: enqueueDownload,
    retry: retryDownload,
    remove: removeDownloadEntry,
    removeAll: removeAllDownloads,
    localUri: (id: string, section: VideoSection = 'main') => localVideoUri(items.find((d) => d.id === id), section),
  };
}
