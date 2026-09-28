import type { KVStorage } from './types';

interface CloudflareKVBinding {
  get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<unknown>;
  put(
    key: string,
    value: string | ArrayBuffer | ReadableStream<Uint8Array>,
    options?: {
      expiration?: number;
      expirationTtl?: number;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    keys: Array<{ name: string; expiration?: number; metadata?: Record<string, unknown> }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

interface CloudflareGlobal {
  [key: string]: unknown;
  env?: Record<string, unknown>;
  process?: { env?: Record<string, unknown> };
}

export class CloudflareKVStorage implements KVStorage {
  private binding: CloudflareKVBinding;
  private bindingName: string;

  constructor(bindingName = 'PASSWORD_MANAGER_KV') {
    this.bindingName = bindingName;
    let binding: CloudflareKVBinding | undefined;

    const g = globalThis as unknown as CloudflareGlobal;

    if (g[bindingName]) {
      binding = g[bindingName] as CloudflareKVBinding;
    } else if (g.env && g.env[bindingName]) {
      binding = g.env[bindingName] as CloudflareKVBinding;
    } else if (g.process?.env?.[bindingName]) {
      binding = g.process.env[bindingName] as CloudflareKVBinding;
    }

    if (!binding) {
      throw new Error(
        `Cloudflare KV binding "${bindingName}" not found. ` +
          `Make sure it's defined in wrangler.toml kv_namespaces bindings.`
      );
    }

    this.binding = binding;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const result = await this.binding.get(key, 'json');
      return result as T | null;
    } catch {
      const text = (await this.binding.get(key, 'text')) as string | null;
      if (text === null || text === undefined) return null;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }
  }

  async put<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const options: { expirationTtl?: number } = {};
    if (ttlSeconds) {
      options.expirationTtl = ttlSeconds;
    }
    await this.binding.put(key, serialized, Object.keys(options).length ? options : undefined);
  }

  async delete(key: string): Promise<void> {
    await this.binding.delete(key);
  }

  async list(prefix?: string): Promise<{ keys: string[]; list_complete: boolean; cursor?: string }> {
    const result = await this.binding.list({
      prefix,
      limit: 1000,
    });
    return {
      keys: result.keys.map((k) => k.name),
      list_complete: result.list_complete,
      cursor: result.cursor,
    };
  }
}
