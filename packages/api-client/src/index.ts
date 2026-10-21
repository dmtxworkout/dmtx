import { createHttp, type HttpClientOptions } from './http';
import { exercisesApi } from './exercises';
import { mediaApi } from './media';
import { workoutsApi } from './workouts';
import { snippetsApi } from './snippets';
import { programsApi } from './programs';
import { skillsApi } from './skills';
import { subscriptionsApi } from './subscriptions';

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
    workouts: workoutsApi(http),
    snippets: snippetsApi(http),
    programs: programsApi(http),
    skills: skillsApi(http),
    subscriptions: subscriptionsApi(http),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export * from './http';
export type { Paginated, ExerciseListItem } from './exercises';
export type {
  AdminUser,
  UserSubscription,
  SubscriptionHistoryItem,
  EntitlementResult,
} from './subscriptions';
export type {
  PresignInput,
  PresignResult,
  CreateMediaInput,
  MediaAsset,
  MediaListQuery,
} from './media';
