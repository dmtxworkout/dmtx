// Offline copies of HLS videos, made by the operating system's own machinery:
// AVAssetDownloadTask on iOS (a .movpkg AVPlayer plays directly), and on
// Android a local copy of the chosen variant's playlists and segments that
// ExoPlayer plays from file://. Either way the caller picks a maximum height
// (480 / 720 / 1080) so a phone does not store a 1080p file it cannot show.
import HlsDownloads from './HlsDownloadsModule';
import type { CompleteEvent, ErrorEvent, ProgressEvent } from './HlsDownloads.types';

export type { CompleteEvent, ErrorEvent, ProgressEvent } from './HlsDownloads.types';

// iOS names the package after the title with percent-escapes written out literally,
// so only plain characters go in it.
export const startDownload = (id: string, url: string, maxHeight: number, title: string) =>
  HlsDownloads.start(id, url, maxHeight, title.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || id);
export const cancelDownload = (id: string) => HlsDownloads.cancel(id);
export const removeDownload = (location: string) => HlsDownloads.remove(location);
export const restoreDownloads = () => HlsDownloads.restore();

/** The `file://` URI expo-video plays, from a stored location (relative to the sandbox, or absolute as a fallback). */
export const localUri = (location: string) => {
  // The simulator reports package paths behind a `/.nofollow` prefix that AVPlayer cannot open.
  const path = encodeURI(location.replace(/^\/\.nofollow(?=\/)/, ''));
  return path.startsWith('/') ? `file://${path}` : `file://${encodeURI(HlsDownloads.homeDirectory)}/${path}`;
};

export function addDownloadListeners(handlers: {
  onProgress?: (e: ProgressEvent) => void;
  onComplete?: (e: CompleteEvent) => void;
  onError?: (e: ErrorEvent) => void;
}): () => void {
  const subs: { remove(): void }[] = [];
  if (handlers.onProgress) subs.push(HlsDownloads.addListener('onProgress', handlers.onProgress));
  if (handlers.onComplete) subs.push(HlsDownloads.addListener('onComplete', handlers.onComplete));
  if (handlers.onError) subs.push(HlsDownloads.addListener('onError', handlers.onError));
  return () => subs.forEach((s) => s.remove());
}
