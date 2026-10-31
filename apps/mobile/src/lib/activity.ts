import { useEffect } from 'react';
import type { TrackActivityInput } from '@dmtx/schemas';
import { api } from './api';

/** Tells the API the member opened this screen. Losing one (offline) doesn't matter. */
export function useTrackActivity(kind: TrackActivityInput['kind'], contentId: string) {
  useEffect(() => {
    api.track({ kind, contentId }).catch(() => undefined);
  }, [kind, contentId]);
}
