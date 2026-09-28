import type {
  PasswordEntryDecrypted,
  Category,
  Tag,
  PaginatedResponse,
  ExportData,
} from '@/lib/types';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  meta?: Record<string, unknown>;
}

const API_BASE = '/api';

async function request<T>(
  path: string,
  options: RequestInit = {},
  query?: Record<string, string | number | boolean | undefined>
): Promise<ApiResponse<T>> {
  let url = path.startsWith('http') ? path : API_BASE + path;
  if (query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) params.append(k, String(v));
    });
    const qs = params.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'same-origin',
    ...options,
    cache: 'no-store',
  });

  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (!res.ok && !json.success) {
      return json;
    }
    return json;
  } catch {
    return {
      success: res.ok,
      data: (text as unknown) as T,
      ...(!res.ok && { error: { code: 'HTTP_ERROR', message: `HTTP ${res.status}` } }),
    } as ApiResponse<T>;
  }
}

export const api = {
  passwords: {
    list: (params?: {
      page?: number;
      perPage?: number;
      search?: string;
      categoryId?: string;
      tag?: string;
      trashed?: boolean;
    }) => request<PaginatedResponse<PasswordEntryDecrypted>>('/passwords', {}, params),

    get: (id: string) => request<PasswordEntryDecrypted>(`/passwords/${id}`),

    create: (data: {
      site: string;
      url?: string;
      username: string;
      password: string;
      notes?: string;
      tags?: string[];
      categoryId?: string;
    }) =>
      request<PasswordEntryDecrypted>('/passwords', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (
      id: string,
      data: {
        site?: string;
        url?: string;
        username?: string;
        password?: string;
        notes?: string;
        tags?: string[];
        categoryId?: string;
        version: number;
      }
    ) =>
      request<PasswordEntryDecrypted>(`/passwords/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string, permanent = false) => {
      if (permanent) {
        return request(`/passwords/${id}/permanent`, { method: 'DELETE' });
      }
      return request(`/passwords/${id}`, { method: 'DELETE' });
    },

    restore: (id: string) =>
      request<PasswordEntryDecrypted>(`/passwords/${id}/restore`, { method: 'POST' }),
  },

  categories: {
    list: () => request<Category[]>('/categories'),
    create: (name: string) =>
      request<Category>('/categories', { method: 'POST', body: JSON.stringify({ name }) }),
    update: (id: string, name: string) =>
      request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
    delete: (id: string) => request(`/categories/${id}`, { method: 'DELETE' }),
  },

  tags: {
    list: () => request<Tag[]>('/tags'),
    create: (name: string, color?: string) =>
      request<Tag>('/tags', { method: 'POST', body: JSON.stringify({ name, color }) }),
    update: (id: string, name: string, color?: string) =>
      request<Tag>(`/tags/${id}`, { method: 'PUT', body: JSON.stringify({ name, color }) }),
    delete: (id: string) => request(`/tags/${id}`, { method: 'DELETE' }),
  },

  auth: {
    initStatus: () => request<{ initialized: boolean }>('/auth/init'),
    apiKeys: {
      list: () => request<Array<{ id: string; name: string; keyPrefix: string; createdAt: string; revoked: boolean }>>('/auth/api-keys'),
      create: (name: string) =>
        request<{ apiKey: string; id: string; name: string }>('/auth/api-keys', {
          method: 'POST',
          body: JSON.stringify({ name }),
        }),
      revoke: (id: string) => request(`/auth/api-keys/${id}`, { method: 'DELETE' }),
      regenerate: (id: string) =>
        request<{ apiKey: string; id: string; name: string }>(`/auth/api-keys/${id}`, { method: 'POST' }),
    },
  },

  tools: {
    generatePassword: (options?: {
      length?: number;
      uppercase?: boolean;
      lowercase?: boolean;
      numbers?: boolean;
      symbols?: boolean;
    }) =>
      request<{
        password: string;
        strength: { score: 0 | 1 | 2 | 3 | 4; label: string; suggestions: string[] };
      }>('/tools/generate-password', {
        method: 'POST',
        body: JSON.stringify(options || {}),
      }),

    evaluatePassword: (password: string) =>
      request<{ score: 0 | 1 | 2 | 3 | 4; label: string; suggestions: string[] }>(
        '/tools/evaluate-password',
        { method: 'POST', body: JSON.stringify({ password }) }
      ),
  },

  data: {
    export: (download = false) =>
      request<ExportData>('/data/export', {}, { download: download ? 'true' : undefined }),
    import: (data: ExportData, strategy: 'skip' | 'overwrite' | 'duplicate' = 'skip') =>
      request<{ imported: number; skipped: number; overwritten: number; duplicated: number; errors: Array<{ id: string; message: string }> }>(
        '/data/import',
        { method: 'POST', body: JSON.stringify({ strategy, data }) }
      ),
  },
};
