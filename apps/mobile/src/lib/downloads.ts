// Rutinas saved for offline use. The list and the chosen quality live in a
// JSON file in the app's documents; the video itself is fetched by the
// hls-downloads module (the OS keeps only the variant that fits the chosen
// height). One download runs at a time, the rest wait in order, so a queue of
// several rutinas gets through on its own. Each entry keeps the rutina as it
// was when queued, so its page and its player open without network.
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

export interface Download {
  /** The rutina's id. */
  id: string;
  name: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  quality: DownloadQuality;
  status: DownloadStatus;
  /** 0..1 while downloading. */
  fraction: number;
  bytes: number | null;
  /** Where the module put it (relative; see `localVideoUri`). */
  location: string | null;
  error?: string;
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
    if (Array.isArray(p.items)) items = p.items;
  } catch {
    // Unreadable file: start empty.
  }
}

const patch = (id: string, p: Partial<Download>) => {
  items = items.map((d) => (d.id === id ? { ...d, ...p } : d));
  emit();
};

/** Start the next queued download, if nothing is downloading. */
async function pump() {
  if (items.some((d) => d.status === 'downloading')) return;
  const next = items.find((d) => d.status === 'queued');
  if (!next) return;
  patch(next.id, { status: 'downloading', fraction: 0, error: undefined });
  // The manifest URL is signed for a day; a fresh one is asked for when possible.
  let url = next.workout.videoUrl;
  try {
    const fresh = await api.workout(next.id);
    if (fresh.videoUrl) {
      url = fresh.videoUrl;
      patch(next.id, { workout: fresh, name: fresh.name, thumbnailUrl: fresh.thumbnailUrl });
    }
  } catch {
    // Offline or the API is down: try with what we have.
  }
  if (!url) {
    patch(next.id, { status: 'error', error: 'La rutina no tiene video listo' });
    save();
    void pump();
    return;
  }
  try {
    await startDownload(next.id, url, next.quality, next.name);
  } catch (e) {
    patch(next.id, { status: 'error', error: e instanceof Error ? e.message : 'No se pudo empezar la descarga' });
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
    onProgress: (e) => patch(e.id, { fraction: e.fraction, bytes: e.bytes }),
    onComplete: (e) => {
      patch(e.id, { status: 'done', fraction: 1, bytes: e.bytes, location: e.location });
      save();
      void pump();
    },
    onError: (e) => {
      patch(e.id, { status: 'error', error: e.message });
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
  // A download that was running when the app died either carries on (iOS) or starts again.
  items = items.map((d) => (d.status === 'downloading' && !active.includes(d.id) ? { ...d, status: 'queued', fraction: 0 } : d));
  emit();
  void pump();
}

/** Queue a rutina (its video) for offline use at the current quality. */
export function enqueueDownload(workout: WorkoutDetail) {
  if (items.some((d) => d.id === workout.id)) return;
  items = [
    ...items,
    {
      id: workout.id,
      name: workout.name,
      thumbnailUrl: workout.thumbnailUrl,
      durationSeconds: workout.videoDurationSeconds ?? workout.estimatedDurationSeconds,
      quality,
      status: 'queued',
      fraction: 0,
      bytes: null,
      location: null,
      workout,
      createdAt: new Date().toISOString(),
    },
  ];
  emit();
  save();
  void pump();
}

/** Try a failed download again. */
export function retryDownload(id: string) {
  const d = items.find((x) => x.id === id);
  if (!d || d.status !== 'error') return;
  patch(id, { status: 'queued', fraction: 0, error: undefined });
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
  try {
    if (d.status === 'downloading' || d.status === 'queued') await cancelDownload(id);
    else if (d.location) await removeDownload(d.location);
  } catch {
    // Best effort: the entry is gone either way.
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

/** The `file://` URI of a finished download, for expo-video. */
export const localVideoUri = (d: Download | undefined): string | null =>
  d && d.status === 'done' && d.location ? localUri(d.location) : null;

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
    localUri: (id: string) => localVideoUri(items.find((d) => d.id === id)),
  };
}
