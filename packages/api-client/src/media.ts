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
    /** Presign → PUT to R2 → create the record. Returns the new asset. */
    async upload(file: File, kind: 'video' | 'image'): Promise<MediaAsset> {
      const presigned = await this.presign({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        kind,
      });
      const res = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        headers: presigned.headers,
        body: file,
      });
      if (!res.ok) throw new Error(`Error subiendo a R2 (${res.status})`);
      return this.create({
        key: presigned.key,
        kind,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
      });
    },
    view(id: string): Promise<MediaAsset> {
      return http.request(`/api/media/${id}`);
    },
    remove(id: string): Promise<void> {
      return http.request(`/api/media/${id}`, { method: 'DELETE' });
    },
  };
}
