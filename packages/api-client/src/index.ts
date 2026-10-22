import { createHttp, type HttpClientOptions } from './http';
import { exercisesApi } from './exercises';
import { mediaApi } from './media';
import { workoutsApi } from './workouts';
import { reusableBlocksApi } from './reusable-blocks';
import { programsApi } from './programs';
import { skillsApi } from './skills';
import { subscriptionsApi } from './subscriptions';
import { taxonomyApi } from './taxonomy';

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
    reusableBlocks: reusableBlocksApi(http),
    programs: programsApi(http),
    skills: skillsApi(http),
    subscriptions: subscriptionsApi(http),
    taxonomy: taxonomyApi(http),
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
  MediaAsset,
  MediaStatus,
  MediaListQuery,
} from './media';
