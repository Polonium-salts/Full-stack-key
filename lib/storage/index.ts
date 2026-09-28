import type { KVStorage } from './types';
import { memoryKV } from './memoryKV';
import { CloudflareKVStorage } from './cloudflareKV';

let _instance: KVStorage | null = null;

function isCloudflareEnvironment(): boolean {
  const g = globalThis as unknown as {
    [key: string]: unknown;
    env?: Record<string, unknown>;
    WorkerGlobalScope?: unknown;
    navigator?: { userAgent?: string };
  };

  const bindingName = process?.env?.KV_MAIN_BINDING || 'PASSWORD_MANAGER_KV';

  if (g[bindingName]) return true;
  if (g.env && g.env[bindingName]) return true;

  if (typeof g.WorkerGlobalScope !== 'undefined') return true;
  if (g.navigator && g.navigator.userAgent?.includes?.('Cloudflare')) return true;

  return false;
}

export function getStorage(bindingName?: string): KVStorage {
  if (_instance) return _instance;

  const resolvedBindingName = bindingName || process?.env?.KV_MAIN_BINDING || 'PASSWORD_MANAGER_KV';

  if (isCloudflareEnvironment()) {
    try {
      _instance = new CloudflareKVStorage(resolvedBindingName);
      console.log('[Storage] Using Cloudflare KV storage');
      return _instance;
    } catch (err) {
      console.warn('[Storage] Cloudflare KV not available, falling back to MemoryKV:', (err as Error).message);
    }
  }

  console.log('[Storage] Using in-memory KV storage (local/dev mode)');
  _instance = memoryKV;
  return _instance;
}

export function resetStorageForTesting(): void {
  _instance = null;
}

export type { KVStorage } from './types';
export { MemoryKVStorage, memoryKV } from './memoryKV';
export { CloudflareKVStorage } from './cloudflareKV';
