import type { Http } from './http';
import type { Paginated } from './exercises';

export interface PresignInput {
  filename: string;
  contentType: string;
  kind: 'video' | 'image';
}

export interface PresignResult {
  key: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
}

export interface CreateMediaInput {
  key: string;
  kind: 'video' | 'image';
  mimeType?: string;
  sizeBytes?: number;
}

export interface MediaAsset {
  id: string;
  kind: 'video' | 'image';
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  viewUrl: string;
  createdAt: string;
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

type MultipartApi = {
  multipartStart(input: PresignInput): Promise<{ key: string; uploadId: string }>;
  multipartSign(input: { key: string; uploadId: string; partNumbers: number[] }): Promise<{ urls: { partNumber: number; url: string }[] }>;
  multipartComplete(input: { key: string; uploadId: string }): Promise<{ ok: true }>;
  multipartAbort(input: { key: string; uploadId: string }): Promise<{ ok: true }>;
};

async function uploadMultipart(
  api: MultipartApi,
  file: File,
  kind: 'video' | 'image',
  contentType: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  const { key, uploadId } = await api.multipartStart({ filename: file.name, contentType, kind });
  const count = Math.ceil(file.size / PART_SIZE);
  const partNumbers = Array.from({ length: count }, (_, i) => i + 1);
  try {
    const { urls } = await api.multipartSign({ key, uploadId, partNumbers });
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
    await api.multipartComplete({ key, uploadId });
    return key;
  } catch (err) {
    api.multipartAbort({ key, uploadId }).catch(() => undefined);
    throw err;
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
    presign(input: PresignInput): Promise<PresignResult> {
      return http.request('/api/media/presign', { method: 'POST', body: JSON.stringify(input) });
    },
    create(input: CreateMediaInput): Promise<MediaAsset> {
      return http.request('/api/media', { method: 'POST', body: JSON.stringify(input) });
    },
    multipartStart(input: PresignInput): Promise<{ key: string; uploadId: string }> {
      return http.request('/api/media/multipart/start', { method: 'POST', body: JSON.stringify(input) });
    },
    multipartSign(input: { key: string; uploadId: string; partNumbers: number[] }): Promise<{ urls: { partNumber: number; url: string }[] }> {
      return http.request('/api/media/multipart/sign', { method: 'POST', body: JSON.stringify(input) });
    },
    multipartComplete(input: { key: string; uploadId: string }): Promise<{ ok: true }> {
      return http.request('/api/media/multipart/complete', { method: 'POST', body: JSON.stringify(input) });
    },
    multipartAbort(input: { key: string; uploadId: string }): Promise<{ ok: true }> {
      return http.request('/api/media/multipart/abort', { method: 'POST', body: JSON.stringify(input) });
    },
    /**
     * Upload a file to R2 and create its record. Small files go in one PUT;
     * big ones are split in parts sent in parallel (each part retried on its
     * own), which is both faster and tolerant of a flaky connection.
     * `onProgress` gets the bytes sent so far and the total.
     */
    async upload(file: File, kind: 'video' | 'image', onProgress?: (loaded: number, total: number) => void): Promise<MediaAsset> {
      const contentType = file.type || 'application/octet-stream';
      let key: string;
      if (file.size >= MULTIPART_THRESHOLD) {
        key = await uploadMultipart(this, file, kind, contentType, onProgress);
      } else {
        const presigned = await this.presign({ filename: file.name, contentType, kind });
        key = presigned.key;
        await putXhr(presigned.uploadUrl, presigned.headers, file, (loaded) => onProgress?.(loaded, file.size));
      }
      return this.create({ key, kind, mimeType: file.type || undefined, sizeBytes: file.size });
    },
    view(id: string): Promise<MediaAsset> {
      return http.request(`/api/media/${id}`);
    },
    remove(id: string): Promise<void> {
      return http.request(`/api/media/${id}`, { method: 'DELETE' });
    },
  };
}
