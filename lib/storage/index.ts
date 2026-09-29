import type { KVStorage, KVStorageOptions, StorageInfo } from './types';
import { storageAdapterManager } from './adapter';

export function getStorage(bindingNameOrOptions?: string | KVStorageOptions): KVStorage {
  return storageAdapterManager.getStorage(bindingNameOrOptions);
}

export function getStorageInfo(bindingNameOrOptions?: string | KVStorageOptions): StorageInfo {
  return storageAdapterManager.getStorageInfo(bindingNameOrOptions);
}

export function getStorageStats(bindingNameOrOptions?: string | KVStorageOptions): Promise<{
  fileSizeBytes: number;
  totalKeys: number;
  estimatedPayloadBytes: number;
}> {
  return storageAdapterManager.getStorageStats(bindingNameOrOptions);
}

export function resetStorageForTesting(): void {
  storageAdapterManager.reset();
}

export type {
  KVStorage,
  KVStorageOptions,
  StorageDriverType,
  ResolvedStorageDriver,
  EnvironmentType,
  StorageInfo,
} from './types';

export { MemoryKVStorage, memoryKV } from './memoryKV';
export { CloudflareKVStorage } from './cloudflareKV';
export { SQLiteKVStorage } from './sqliteKV';
export {
  detectEnvironment,
  resolveStorageDriver,
  StorageAdapterManager,
  storageAdapterManager,
} from './adapter';
