import type { Http } from './http';
import type { Paginated } from './exercises';

export type MediaKind = 'video' | 'image';
export type MediaStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  /** `uploading` until the bytes are in, `processing` while Stream encodes; only `ready` assets reach the app. */
  status: MediaStatus;
  /** Image: delivery URL (1600 px); video: HLS manifest. Null until ready. */
  viewUrl: string | null;
  /** A 400 px square (image) or the video's poster frame. Null until ready. */
  thumbnailUrl: string | null;
  /** Video only: Stream's player, for an iframe. */
  embedUrl: string | null;
  createdAt: string;
}

export interface CreateUploadInput {
  filename: string;
  contentType: string;
  kind: MediaKind;
  sizeBytes: number;
}

export interface CreateUploadResult {
  asset: MediaAsset;
  uploadUrl: string;
  /** `form`: one multipart POST with the file (images); `tus`: resumable PATCHes (videos). */
  protocol: 'form' | 'tus';
}

export interface MediaListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  kind?: MediaKind;
}

export interface UploadHooks {
  /** The record exists: the caller can reference its id and move on. */
  onStarted?: (asset: MediaAsset) => void;
  onProgress?: (loaded: number, total: number) => void;
  /** The bytes are in; Stream is encoding (videos only). */
  onProcessing?: (asset: MediaAsset) => void;
  /** Abort it: the transfer stops (or the encoding is dropped) and the file is deleted at Cloudflare. Rejects with an `AbortError`. */
  signal?: AbortSignal;
}

/** Whether `upload` failed because its signal was aborted (not a real error). */
export const isUploadCancelled = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';
const cancelled = () => new DOMException('Subida cancelada', 'AbortError');
/** Wait, unless the signal fires first. */
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(t);
      reject(cancelled());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });

// Stream wants tus chunks that are a multiple of 256 KiB and at least 5 MiB;
// bigger chunks mean fewer round trips, smaller ones finer progress.
const TUS_CHUNK = 32 * 1024 * 1024;
const TUS_ATTEMPTS = 5;
const POLL_MS = 3000;
const POLL_LIMIT_MS = 2 * 3600 * 1000;

/** One XHR with upload progress (fetch has none). Resolves with the response. */
function xhr(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: XMLHttpRequestBodyInit | null,
  onProgress?: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<XMLHttpRequest> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    const req = new XMLHttpRequest();
    const onAbort = () => req.abort();
    const settle = () => signal?.removeEventListener('abort', onAbort);
    req.open(method, url);
    for (const [k, v] of Object.entries(headers)) req.setRequestHeader(k, v);
    req.upload.onprogress = (e) => onProgress?.(e.loaded);
    req.onload = () => {
      settle();
      if (req.status >= 200 && req.status < 300) resolve(req);
      else reject(new Error(`Cloudflare rechazó la subida (${req.status})`));
    };
    req.onerror = () => {
      settle();
      reject(new Error('Error de red subiendo el archivo'));
    };
    req.onabort = () => {
      settle();
      reject(cancelled());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    req.send(body);
  });
}

/** Where a tus upload stands, straight from the server. */
async function tusOffset(url: string): Promise<number> {
  const res = await fetch(url, { method: 'HEAD', headers: { 'tus-resumable': '1.0.0' } });
  const offset = Number(res.headers.get('upload-offset'));
  if (!res.ok || !Number.isFinite(offset)) throw new Error('No se pudo retomar la subida');
  return offset;
}

/** PATCH the file in chunks; a failed chunk is retried from the offset the server reports. */
async function tusUpload(url: string, file: File, onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal) {
  let offset = 0;
  let attempts = 0;
  while (offset < file.size) {
    if (signal?.aborted) throw cancelled();
    const chunk = file.slice(offset, Math.min(file.size, offset + TUS_CHUNK));
    const start = offset;
    try {
      const res = await xhr(
        'PATCH',
        url,
        { 'tus-resumable': '1.0.0', 'upload-offset': String(offset), 'content-type': 'application/offset+octet-stream' },
        chunk,
        (loaded) => onProgress?.(start + loaded, file.size),
        signal,
      );
      const next = Number(res.getResponseHeader('upload-offset'));
      offset = Number.isFinite(next) && next > offset ? next : offset + chunk.size;
      attempts = 0;
      onProgress?.(offset, file.size);
    } catch (err) {
      if (isUploadCancelled(err)) throw err;
      attempts += 1;
      if (attempts >= TUS_ATTEMPTS) throw err;
      await sleep(1000 * attempts, signal);
      offset = await tusOffset(url).catch(() => offset);
    }
  }
}

export function mediaApi(http: Http) {
  return {
    list(query?: MediaListQuery): Promise<Paginated<MediaAsset>> {
      const params = new URLSearchParams();
      if (query?.page) params.set('page', String(query.page));
      if (query?.pageSize) params.set('pageSize', String(query.pageSize));
      if (query?.search) params.set('search', query.search);
      if (query?.kind) params.set('kind', query.kind);
      const qs = params.toString();
      return http.request(`/api/media${qs ? `?${qs}` : ''}`);
    },
    createUpload(input: CreateUploadInput): Promise<CreateUploadResult> {
      return http.request('/api/media/uploads', { method: 'POST', body: JSON.stringify(input) });
    },
    complete(id: string): Promise<MediaAsset> {
      return http.request(`/api/media/${id}/complete`, { method: 'POST' });
    },
    abort(id: string): Promise<void> {
      return http.request(`/api/media/${id}/abort`, { method: 'POST' });
    },
    view(id: string): Promise<MediaAsset> {
      return http.request(`/api/media/${id}`);
    },
    remove(id: string): Promise<void> {
      return http.request(`/api/media/${id}`, { method: 'DELETE' });
    },
    /**
     * Upload a file to Cloudflare (Images for images, Stream for videos). The
     * media record exists (as `uploading`) as soon as `onStarted` fires, so
     * the caller can reference it and move on; the promise resolves with the
     * `ready` asset: for a video that includes Stream's encoding, polled every
     * few seconds. On failure the record is removed again; so is it when
     * `hooks.signal` aborts (the file is deleted at Cloudflare, whatever stage
     * it had reached), and the promise then rejects with an `AbortError`.
     */
    async upload(file: File, kind: MediaKind, hooks: UploadHooks = {}): Promise<MediaAsset> {
      const contentType = file.type || 'application/octet-stream';
      const { asset, uploadUrl, protocol } = await this.createUpload({ filename: file.name, contentType, kind, sizeBytes: file.size });
      hooks.onStarted?.(asset);
      const { signal } = hooks;
      try {
        if (protocol === 'tus') {
          await tusUpload(uploadUrl, file, hooks.onProgress, signal);
        } else {
          const form = new FormData();
          form.set('file', file, file.name);
          await xhr('POST', uploadUrl, {}, form, (loaded) => hooks.onProgress?.(Math.min(loaded, file.size), file.size), signal);
        }
        hooks.onProgress?.(file.size, file.size);
        if (signal?.aborted) throw cancelled();
        let current = await this.complete(asset.id);
        if (current.status === 'processing') hooks.onProcessing?.(current);
        const until = Date.now() + POLL_LIMIT_MS;
        while (current.status === 'processing' && Date.now() < until) {
          await sleep(POLL_MS, signal);
          current = await this.view(asset.id);
        }
        if (signal?.aborted) throw cancelled();
        if (current.status === 'failed') throw new Error('Cloudflare Stream no pudo procesar el video');
        if (current.status !== 'ready') throw new Error('El video sigue en proceso; vuelve a abrirlo más tarde');
        return current;
      } catch (err) {
        // The record goes, with the file at Cloudflare. A cancel is awaited so
        // the caller can refresh its lists once the asset is really gone; if the
        // upload had already finished (abort says 404), the asset is deleted instead.
        const discard = this.abort(asset.id).catch(() => this.remove(asset.id).catch(() => undefined));
        if (isUploadCancelled(err)) await discard;
        throw err;
      }
    },
  };
}
