import { NativeModule, requireNativeModule } from 'expo';

import type { HlsDownloadsModuleEvents } from './HlsDownloads.types';

declare class HlsDownloadsModule extends NativeModule<HlsDownloadsModuleEvents> {
  /** Where downloads live; `location`s are relative to it (it can change between installs, so it is never stored). */
  homeDirectory: string;
  /** Start downloading the HLS stream at `url`, keeping the best variant whose height is at most `maxHeight`. */
  start(id: string, url: string, maxHeight: number, title: string): Promise<void>;
  /** Stop a download in flight and delete what was fetched. No event follows. */
  cancel(id: string): Promise<void>;
  /** Delete a finished download from disk. */
  remove(location: string): Promise<void>;
  /** Ids of downloads still running from before the app was relaunched (iOS carries them on; Android starts over). */
  restore(): Promise<string[]>;
}

export default requireNativeModule<HlsDownloadsModule>('HlsDownloads');
