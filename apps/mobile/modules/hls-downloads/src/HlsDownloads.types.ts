/** Progress of a download in flight: `fraction` 0..1 (by duration on iOS, by segments on Android). */
export type ProgressEvent = { id: string; fraction: number; bytes: number };
/** The whole video is on disk. `location` is relative to `homeDirectory` (see `localUri`). */
export type CompleteEvent = { id: string; location: string; bytes: number };
export type ErrorEvent = { id: string; message: string };

export type HlsDownloadsModuleEvents = {
  onProgress: (e: ProgressEvent) => void;
  onComplete: (e: CompleteEvent) => void;
  onError: (e: ErrorEvent) => void;
};
