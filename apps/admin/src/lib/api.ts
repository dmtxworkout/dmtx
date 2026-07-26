import { createApiClient } from '@dmtx/api-client';

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export const api = createApiClient({ baseUrl });
