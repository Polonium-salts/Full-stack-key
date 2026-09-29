export interface KVStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  put<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<{ keys: string[]; list_complete: boolean; cursor?: string }>;
}

export type StorageDriverType =
  | 'auto'
  | 'sqlite'
  | 'cloudflare'
  | 'cloudflare-kv'
  | 'memory';

export type ResolvedStorageDriver = 'sqlite' | 'cloudflare' | 'memory';

export type EnvironmentType =
  | 'cloudflare'
  | 'node'
  | 'edge'
  | 'browser'
  | 'unknown';

export interface StorageInfo {
  driver: ResolvedStorageDriver;
  configuredType: string;
  environment: EnvironmentType;
  isPersistent: boolean;
  details: {
    dbPath?: string;
    bindingName?: string;
    description: string;
    fallbackReason?: string;
  };
}

export interface KVStorageOptions {
  bindingName?: string;
  namespaceId?: string;
  storageType?: StorageDriverType;
  dbPath?: string;
  forceNew?: boolean;
}
