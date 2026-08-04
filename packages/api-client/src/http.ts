export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface HttpClientOptions {
  baseUrl: string;
  /** Override fetch (e.g. for SSR / tests). Defaults to global fetch. */
  fetch?: typeof fetch;
}

export interface ApiErrorBody {
  error?: string;
  issues?: unknown;
}

export function createHttp({ baseUrl, fetch: fetchImpl = fetch }: HttpClientOptions) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : undefined;

    if (!res.ok) {
      const message = (body as ApiErrorBody | undefined)?.error ?? res.statusText;
      throw new ApiError(res.status, message, body);
    }
    return body as T;
  }

  return { request, baseUrl };
}

export type Http = ReturnType<typeof createHttp>;

/** Build a `?page=&pageSize=&search=` query string (empty when no params). */
export function listQuery(query?: {
  page?: number;
  pageSize?: number;
  search?: string;
  kind?: string;
}): string {
  const p = new URLSearchParams();
  if (query?.page) p.set('page', String(query.page));
  if (query?.pageSize) p.set('pageSize', String(query.pageSize));
  if (query?.search) p.set('search', query.search);
  if (query?.kind) p.set('kind', query.kind);
  const s = p.toString();
  return s ? `?${s}` : '';
}
