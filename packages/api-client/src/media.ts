import type { Http } from './http';

export interface PresignInput {
  filename: string;
  contentType: string;
  kind: 'video' | 'image';
}

export interface PresignResult {
  assetId: string;
  key: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
}

export interface MediaAsset {
  id: string;
  kind: 'video' | 'image';
  mimeType: string | null;
  viewUrl: string;
}

export function mediaApi(http: Http) {
  return {
    presign(input: PresignInput): Promise<PresignResult> {
      return http.request('/api/media/presign', { method: 'POST', body: JSON.stringify(input) });
    },
    /** Presign + upload a file directly to R2. Returns the created asset (id, key). */
    async upload(file: File, kind: 'video' | 'image'): Promise<PresignResult> {
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
      return presigned;
    },
    /** Fetch an asset + a short-lived presigned URL to display it. */
    view(id: string): Promise<MediaAsset> {
      return http.request(`/api/media/${id}`);
    },
  };
}
