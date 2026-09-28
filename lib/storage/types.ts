export interface KVStorage {
  get<T = unknown>(key: string): Promise<T | null>;
  put<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<{ keys: string[]; list_complete: boolean; cursor?: string }>;
}

export interface KVStorageOptions {
  bindingName?: string;
  namespaceId?: string;
}
