import type { Http } from './http';
import type { Paginated } from './exercises';

export interface PresignInput {
  filename: string;
  contentType: string;
  kind: 'video' | 'image';
}

export type MediaStatus = 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed';

export interface MediaAsset {
  id: string;
  kind: 'video' | 'image';
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  /** `uploading` until the bytes are in; only `ready` assets reach the app. */
  status: MediaStatus;
  viewUrl: string;
  createdAt: string;
}

export interface PresignResult {
  asset: MediaAsset;
  key: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
}

export interface MediaListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  kind?: 'video' | 'image';
}

// Files from this size up go in parts; R2 wants every part but the last to be
// the same size and at least 5 MiB.
const MULTIPART_THRESHOLD = 32 * 1024 * 1024;
const PART_SIZE = 16 * 1024 * 1024;
const PARALLEL_PARTS = 4;
const PART_ATTEMPTS = 3;

/** One PUT with upload progress (fetch has none). Resolves with the response ETag, if readable. */
function putXhr(url: string, headers: Record<string, string>, body: Blob, onProgress?: (loaded: number) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Error subiendo a R2 (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Error de red subiendo el archivo'));
    xhr.onabort = () => reject(new Error('Subida cancelada'));
    xhr.send(body);
  });
}

type PartSigner = {
  multipartSign(input: { key: string; uploadId: string; partNumbers: number[] }): Promise<{ urls: { partNumber: number; url: string }[] }>;
};

/** PUT every part of `file`, a few at a time, each one retried on its own. */
async function uploadParts(api: PartSigner, key: string, uploadId: string, file: File, onProgress?: (loaded: number, total: number) => void) {
  const count = Math.ceil(file.size / PART_SIZE);
  const { urls } = await api.multipartSign({ key, uploadId, partNumbers: Array.from({ length: count }, (_, i) => i + 1) });
  const urlOf = new Map(urls.map((u) => [u.partNumber, u.url]));
  const sent = new Array<number>(count).fill(0);
  const report = () => onProgress?.(sent.reduce((a, b) => a + b, 0), file.size);
  let next = 0;
  const worker = async () => {
    while (next < count) {
      const idx = next;
      next += 1;
      const partNumber = idx + 1;
      const blob = file.slice(idx * PART_SIZE, Math.min(file.size, (idx + 1) * PART_SIZE));
      const url = urlOf.get(partNumber);
      if (!url) throw new Error(`Falta la URL de la parte ${partNumber}`);
      for (let attempt = 1; ; attempt += 1) {
        try {
          await putXhr(url, {}, blob, (loaded) => {
            sent[idx] = loaded;
            report();
          });
          sent[idx] = blob.size;
          report();
          break;
        } catch (err) {
          if (attempt >= PART_ATTEMPTS) throw err;
          sent[idx] = 0;
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_PARTS, count) }, worker));
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
    presign(input: PresignInput): Promise<PresignResult> {
      return http.request('/api/media/presign', { method: 'POST', body: JSON.stringify(input) });
    },
    multipartStart(input: PresignInput): Promise<{ asset: MediaAsset; key: string; uploadId: string }> {
      return http.request('/api/media/multipart/start', { method: 'POST', body: JSON.stringify(input) });
    },
    multipartSign(input: { key: string; uploadId: string; partNumbers: number[] }): Promise<{ urls: { partNumber: number; url: string }[] }> {
      return http.request('/api/media/multipart/sign', { method: 'POST', body: JSON.stringify(input) });
    },
    complete(id: string, input: { uploadId?: string; sizeBytes?: number }): Promise<MediaAsset> {
      return http.request(`/api/media/${id}/complete`, { method: 'POST', body: JSON.stringify(input) });
    },
    abort(id: string, input: { uploadId?: string }): Promise<void> {
      return http.request(`/api/media/${id}/abort`, { method: 'POST', body: JSON.stringify(input) });
    },
    /**
     * Upload a file to R2. The media record exists (as `uploading`) as soon as
     * `onStarted` fires, so the caller can reference it and move on; the
     * promise resolves with the `ready` asset once the bytes are in. Small
     * files go in one PUT; big ones in parts sent in parallel, each part
     * retried on its own. On failure the record is removed again.
     */
    async upload(
      file: File,
      kind: 'video' | 'image',
      hooks: { onStarted?: (asset: MediaAsset) => void; onProgress?: (loaded: number, total: number) => void } = {},
    ): Promise<MediaAsset> {
      const contentType = file.type || 'application/octet-stream';
      if (file.size >= MULTIPART_THRESHOLD) {
        const { asset, key, uploadId } = await this.multipartStart({ filename: file.name, contentType, kind });
        hooks.onStarted?.(asset);
        try {
          await uploadParts(this, key, uploadId, file, hooks.onProgress);
          return await this.complete(asset.id, { uploadId, sizeBytes: file.size });
        } catch (err) {
          this.abort(asset.id, { uploadId }).catch(() => undefined);
          throw err;
        }
      }
      const presigned = await this.presign({ filename: file.name, contentType, kind });
      hooks.onStarted?.(presigned.asset);
      try {
        await putXhr(presigned.uploadUrl, presigned.headers, file, (loaded) => hooks.onProgress?.(loaded, file.size));
        return await this.complete(presigned.asset.id, { sizeBytes: file.size });
      } catch (err) {
        this.abort(presigned.asset.id, {}).catch(() => undefined);
        throw err;
      }
    },
    view(id: string): Promise<MediaAsset> {
      return http.request(`/api/media/${id}`);
    },
    remove(id: string): Promise<void> {
      return http.request(`/api/media/${id}`, { method: 'DELETE' });
    },
  };
}
