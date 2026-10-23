'use client';

// Background uploads. `startUpload` hands back the media asset's id as soon
// as its record exists (before any byte is sent), so a form can point at it
// and the admin can save, switch day or leave the page while the file keeps
// going. The bytes travel in a module-level queue that survives in-app
// navigation (the app is a single page); only a reload or closing the tab
// loses it, and the tray warns before that. An upload can be cancelled (one
// or all): the transfer stops and the record and the file at Cloudflare go.
import { createElement, Fragment, useEffect, useState } from 'react';
import { isUploadCancelled, type MediaAsset } from '@dmtx/api-client';
import { api } from '@/lib/api';
import { prepareImage } from '@/lib/prepare-image';
import { confirm } from '@/components/ui/confirm';

export type UploadStatus = 'uploading' | 'processing' | 'done' | 'error' | 'cancelled';
export interface UploadEntry {
  assetId: string;
  name: string;
  kind: 'image' | 'video';
  loaded: number;
  total: number;
  status: UploadStatus;
  /** Cancel asked; the record is being removed (status is still uploading/processing until it is). */
  cancelling?: boolean;
  error?: string;
  /** The ready asset, once done. */
  asset?: MediaAsset;
}

let entries: UploadEntry[] = [];
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const patch = (assetId: string, p: Partial<UploadEntry>) => {
  entries = entries.map((e) => (e.assetId === assetId ? { ...e, ...p } : e));
  emit();
};
const dropLater = (assetId: string) =>
  window.setTimeout(() => {
    entries = entries.filter((e) => e.assetId !== assetId);
    emit();
  }, 4000);

export const isActiveUpload = (e: UploadEntry) => e.status === 'uploading' || e.status === 'processing';

/** The admin chose not to upload (a duplicate name): not an error to show. */
export class UploadDeclined extends Error {
  constructor() {
    super('Subida cancelada');
    this.name = 'UploadDeclined';
  }
}
export const isUploadDeclined = (err: unknown) => err instanceof UploadDeclined;

/**
 * A file with the same name is probably the same file uploaded twice (each
 * copy is billed): say so and let the admin decide before any byte moves.
 */
async function checkDuplicate(file: File, kind: 'image' | 'video') {
  const name = file.name.trim().toLowerCase();
  const found = await api.media
    .list({ search: file.name, kind, pageSize: 50 })
    .then((r) => r.data.find((m) => m.name.trim().toLowerCase() === name))
    .catch(() => undefined);
  if (!found) return;
  const when = new Date(found.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  const ok = await confirm({
    title: 'Ya existe un archivo con ese nombre',
    message: createElement(
      Fragment,
      null,
      createElement('strong', null, found.name),
      ` ya está en la biblioteca (subido el ${when}). Si es el mismo archivo, elígelo de la biblioteca en vez de subirlo otra vez: cada copia ocupa espacio y se cobra.`,
    ),
    confirmLabel: 'Subir de todos modos',
    cancelLabel: 'No subir',
  });
  if (!ok) throw new UploadDeclined();
}

/**
 * Upload `file` in the background. Resolves with the asset id once the record
 * exists; rejects only if the upload could not even start (or the admin
 * declined a duplicate: `isUploadDeclined`). Progress and the outcome are read
 * through `useUploads`.
 */
export function startUpload(original: File, kind: 'image' | 'video'): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let assetId: string | null = null;
    const controller = new AbortController();
    // A duplicate name asks first; an image over Cloudflare Images' 10 MB is re-encoded (see prepare-image).
    checkDuplicate(original, kind)
      .then(() => (kind === 'image' ? prepareImage(original) : original))
      .then((file) =>
        api.media.upload(file, kind, {
          signal: controller.signal,
          onStarted: (asset) => {
            assetId = asset.id;
            controllers.set(asset.id, controller);
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
        controllers.delete(asset.id);
        patch(asset.id, { status: 'done', loaded: asset.sizeBytes ?? original.size, total: asset.sizeBytes ?? original.size, asset });
        // Finished uploads leave the tray after a moment.
        dropLater(asset.id);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'No se pudo subir el archivo';
        if (!assetId) {
          reject(err instanceof Error ? err : new Error(message));
          return;
        }
        controllers.delete(assetId);
        if (isUploadCancelled(err)) {
          // The record and the file are gone by now (the client waited for it).
          patch(assetId, { status: 'cancelled', cancelling: false });
          dropLater(assetId);
          return;
        }
        patch(assetId, { status: 'error', error: message });
      });
  });
}

/** Stop one upload (or a video Stream is encoding): its record and file are deleted. */
export function cancelUpload(assetId: string) {
  const controller = controllers.get(assetId);
  if (!controller) return;
  patch(assetId, { cancelling: true });
  controller.abort();
}

/** Stop every upload in flight. */
export function cancelAllUploads() {
  for (const e of entries) if (isActiveUpload(e)) cancelUpload(e.assetId);
}

/** Drop a finished, failed or cancelled entry from the tray. */
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

/** The upload of one asset, if it is in flight (or just finished / failed / cancelled). */
export function useUpload(assetId: string | null): UploadEntry | undefined {
  const all = useUploads();
  return assetId ? all.find((e) => e.assetId === assetId) : undefined;
}

export const uploadPct = (e: UploadEntry) => Math.round((e.loaded / Math.max(1, e.total)) * 100);
export const formatBytes = (n: number) =>
  n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : `${(n / 1048576).toFixed(n >= 104857600 ? 0 : 1)} MB`;
