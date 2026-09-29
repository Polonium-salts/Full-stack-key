import type { KVStorage } from './types';

interface MemoryEntry {
  value: string;
  expiresAt?: number;
}

const _globalStore = new Map<string, MemoryEntry>();

export class MemoryKVStorage implements KVStorage {
  private store: Map<string, MemoryEntry>;

  constructor() {
    this.store = _globalStore;
  }

  private isExpired(entry: MemoryEntry | undefined): boolean {
    if (!entry) return true;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      return true;
    }
    return false;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (this.isExpired(entry)) {
      if (entry) this.store.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry!.value) as T;
    } catch {
      return entry!.value as unknown as T;
    }
  }

  async put<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const entry: MemoryEntry = {
      value: serialized,
    };
    if (ttlSeconds) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
    this.store.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(prefix?: string): Promise<{ keys: string[]; list_complete: boolean; cursor?: string }> {
    const allKeys = Array.from(this.store.keys());
    const now = Date.now();

    const validKeys: string[] = [];
    for (const key of allKeys) {
      const entry = this.store.get(key);
      if (!entry) continue;
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key);
        continue;
      }
      if (!prefix || key.startsWith(prefix)) {
        validKeys.push(key);
      }
    }

    return {
      keys: validKeys.sort(),
      list_complete: true,
    };
  }

  clear(): void {
    this.store.clear();
  }

  getStats(): {
    keysCount: number;
    estimatedBytes: number;
  } {
    let bytes = 0;
    for (const [key, entry] of this.store.entries()) {
      bytes += key.length * 2 + (entry.value?.length || 0) * 2;
    }
    return {
      keysCount: this.store.size,
      estimatedBytes: bytes,
    };
  }
}

export const memoryKV = new MemoryKVStorage();
