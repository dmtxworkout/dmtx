'use client';

// Background uploads. `startUpload` hands back the media asset's id as soon
// as its record exists (before any byte is sent), so a form can point at it
// and the admin can save, switch day or leave the page while the file keeps
// going. The bytes travel in a module-level queue that survives in-app
// navigation (the app is a single page); only a reload or closing the tab
// loses it, and the tray warns before that.
import { useEffect, useState } from 'react';
import type { MediaAsset } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { prepareImage } from '@/lib/prepare-image';

export type UploadStatus = 'uploading' | 'processing' | 'done' | 'error';
export interface UploadEntry {
  assetId: string;
  name: string;
  kind: 'image' | 'video';
  loaded: number;
  total: number;
  status: UploadStatus;
  error?: string;
  /** The ready asset, once done. */
  asset?: MediaAsset;
}

let entries: UploadEntry[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const patch = (assetId: string, p: Partial<UploadEntry>) => {
  entries = entries.map((e) => (e.assetId === assetId ? { ...e, ...p } : e));
  emit();
};

/**
 * Upload `file` in the background. Resolves with the asset id once the record
 * exists; rejects only if the upload could not even start. Progress and the
 * outcome are read through `useUploads`.
 */
export function startUpload(original: File, kind: 'image' | 'video'): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let assetId: string | null = null;
    // An image over Cloudflare Images' 10 MB is re-encoded first (see prepare-image).
    (kind === 'image' ? prepareImage(original) : Promise.resolve(original))
      .then((file) =>
        api.media.upload(file, kind, {
          onStarted: (asset) => {
            assetId = asset.id;
            entries = [...entries, { assetId: asset.id, name: file.name, kind, loaded: 0, total: file.size, status: 'uploading' }];
            emit();
            resolve(asset.id);
          },
          onProgress: (loaded, total) => {
            if (assetId) patch(assetId, loaded >= total ? { loaded: total, total, status: 'processing' } : { loaded, total });
          },
        }),
      )
      .then((asset) => {
        patch(asset.id, { status: 'done', loaded: asset.sizeBytes ?? original.size, total: asset.sizeBytes ?? original.size, asset });
        // Finished uploads leave the tray after a moment.
        window.setTimeout(() => {
          entries = entries.filter((e) => e.assetId !== asset.id);
          emit();
        }, 4000);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'No se pudo subir el archivo';
        if (!assetId) {
          reject(err instanceof Error ? err : new Error(message));
          return;
        }
        patch(assetId, { status: 'error', error: message });
      });
  });
}

/** Drop a finished or failed entry from the tray. */
export function dismissUpload(assetId: string) {
  entries = entries.filter((e) => e.assetId !== assetId);
  emit();
}

/** Every upload the tray knows about (re-rendered on each change). */
export function useUploads(): UploadEntry[] {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return entries;
}

/** The upload of one asset, if it is in flight (or just finished / failed). */
export function useUpload(assetId: string | null): UploadEntry | undefined {
  const all = useUploads();
  return assetId ? all.find((e) => e.assetId === assetId) : undefined;
}

export const uploadPct = (e: UploadEntry) => Math.round((e.loaded / Math.max(1, e.total)) * 100);
export const formatBytes = (n: number) =>
  n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : `${(n / 1048576).toFixed(n >= 104857600 ? 0 : 1)} MB`;
