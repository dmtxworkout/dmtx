# Offline downloads (mobile)

Video rutinas can be saved on the device so they play without network. The video is Cloudflare Stream's HLS, and the **operating system** stores it, keeping only the variant that fits the quality the user picked, so a phone never stores a 1080p file it cannot show.

## Pieces

| Where | What |
|---|---|
| `apps/mobile/modules/hls-downloads` | Local Expo module. `start(id, url, maxHeight, title)`, `cancel(id)`, `remove(location)`, `restore()`; events `onProgress` / `onComplete` / `onError`; constant `homeDirectory`. Locations are stored **relative** to it (the sandbox path changes between installs). |
| `ios/HlsDownloadsModule.swift` | A background `AVAssetDownloadURLSession`. `AVAssetDownloadConfiguration` with a variant qualifier `presentationHeight <= maxHeight`; iOS writes a `.movpkg` that `AVURLAsset` (so expo-video) plays from `file://`. Tasks carry the id in `taskDescription` and survive the app being killed; `restore()` re-attaches to them. The AppDelegate subscriber hands over the background completion handler. |
| `android/.../HlsDownloadsModule.kt` | Mirrors one variant: picks the tallest `#EXT-X-STREAM-INF` at or under `maxHeight` (plus its audio group), downloads the media playlists, init sections and segments four at a time into `filesDir/hls-downloads/<id>/`, rewrites URIs to local names and writes `master.m3u8`, which ExoPlayer plays from `file://` (`contentType: 'hls'`). Segments already on disk are skipped, so starting again resumes. The work runs in `HlsDownloadEngine` (a process-wide singleton, so a JS reload finds the downloads still running and `restore()` reports them; results that arrive with no listener wait for the next one) and `HlsDownloadService`, a foreground service of type `dataSync` started with the first download and stopped after the last, whose notification shows the title, the percentage and how many wait in the queue. Android 13+ asks for the notification permission the first time a download starts. |
| `apps/mobile/src/lib/downloads.ts` | The list and the quality, persisted in `documents/downloads.json`. An entry is a rutina with its `videos` (warm-up, class, stretch — whichever sections are videos; module ids are `<rutina id>#<section>`); one video downloads at a time across the queue and the entry is done when all of its videos are. Each entry keeps the `WorkoutDetail` as it was when queued, so the rutina page and the player open offline. `initDownloads()` (root layout) re-queues what was running on a device that lost it. Before starting, the signed manifest URL is refreshed from the API when reachable (tokens last 24 h). |
| UI | `DownloadButton` in the rutina page (↓ · % · ✓ · !; shown when the rutina has any video), **Perfil → Descargas** (quality Baja/Media/Alta = 480/720/1080p, default Media; link to the list), `/(app)/descargas` (list with size, cancel/delete one or all). Playing happens in `/(app)/entrenar/[id]`: `VideoPhase` (expo-video, native controls, fullscreen) plays each video section — warm-up before the exercises, the class instead of them, the stretch after — preferring the local copy; a section with notes («Qué se hace en el video» in the admin) keeps the video at 16:9 and shows them under it, and the rutina page shows them under «Clase en video». |

## Flow

1. Rutina page → ↓ → `enqueueDownload(workout)` writes the entry as `queued` and `pump()` starts it if nothing is downloading.
2. The module fetches; `onProgress` updates `fraction` (by duration on iOS, by segment count on Android) and `bytes`.
3. `onComplete` stores `location` and the size; `pump()` takes the next one. `onError` marks the entry and moves on; the user can retry or remove it.
4. Playing: `localVideoUri(download, section)` wins over the section's streaming URL.

## Limits and next steps

- Only a rutina's own videos (its video sections) download. Exercise demo clips of text sections are not stored offline yet; same module, more entries.
- Signed URLs: the HLS token is only needed while downloading; the saved copy plays forever. Deleting the asset in the admin does not reach devices (expected).
- The quality labels' size hints come from a measurement: a 9-minute 1080p source took 50 MB at 720p (Stream encodes at roughly 0.8 Mbps for 720p), so 480p / 720p / 1080p are quoted as about 100 / 180 / 350 MB per 30 minutes.
- iOS names the `.movpkg` after the download title with percent-escapes written literally, so the title passed to the module is reduced to plain characters, and `localUri` percent-encodes the path. On the simulator the reported path carries a `/.nofollow` prefix; both sides strip it.
