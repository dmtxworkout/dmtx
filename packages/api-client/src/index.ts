import { createHttp, type HttpClientOptions } from './http';
import { exercisesApi } from './exercises';
import { mediaApi } from './media';

/**
 * Typed client for the DMTX API. Types come from `@dmtx/schemas` (the single
 * source of truth shared with the server), so there is no codegen step and no
 * Hono `hc` cross-workspace inference issue.
 */
export function createApiClient(options: HttpClientOptions) {
  const http = createHttp(options);
  return {
    exercises: exercisesApi(http),
    media: mediaApi(http),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export * from './http';
export type { Paginated, ExerciseListItem } from './exercises';
export type { PresignInput, PresignResult, MediaAsset } from './media';
