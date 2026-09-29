import type {
  KVStorage,
  KVStorageOptions,
  StorageDriverType,
  ResolvedStorageDriver,
  EnvironmentType,
  StorageInfo,
} from './types';
import { memoryKV } from './memoryKV';
import { CloudflareKVStorage } from './cloudflareKV';
import { SQLiteKVStorage } from './sqliteKV';

export function detectEnvironment(bindingName = 'PASSWORD_MANAGER_KV'): EnvironmentType {
  const g = globalThis as unknown as {
    [key: string]: unknown;
    env?: Record<string, unknown>;
    WorkerGlobalScope?: unknown;
    EdgeRuntime?: unknown;
    navigator?: { userAgent?: string };
  };

  // 1. Check Cloudflare Worker / Cloudflare Pages environment
  if (g[bindingName]) return 'cloudflare';
  if (g.env && g.env[bindingName]) return 'cloudflare';
  if (typeof g.WorkerGlobalScope !== 'undefined') return 'cloudflare';
  if (g.navigator?.userAgent?.includes?.('Cloudflare')) return 'cloudflare';
  if (typeof process !== 'undefined' && (process.env.CF_PAGES === '1' || process.env.CLOUDFLARE_WORKER === '1')) {
    return 'cloudflare';
  }

  // 2. Check Node.js runtime
  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'node';
  }

  // 3. Check Edge runtime
  if (typeof g.EdgeRuntime !== 'undefined') {
    return 'edge';
  }

  // 4. Browser environment
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'browser';
  }

  return 'unknown';
}

export function resolveStorageDriver(options?: KVStorageOptions): {
  driver: ResolvedStorageDriver;
  configuredType: string;
  environment: EnvironmentType;
  fallbackReason?: string;
} {
  const resolvedBinding = options?.bindingName || process?.env?.KV_MAIN_BINDING || 'PASSWORD_MANAGER_KV';
  const env = detectEnvironment(resolvedBinding);

  const configuredRaw = (
    options?.storageType ||
    process?.env?.STORAGE_TYPE ||
    process?.env?.STORAGE_ADAPTER ||
    process?.env?.KV_STORAGE_TYPE ||
    'auto'
  ).trim().toLowerCase();

  let configuredType: StorageDriverType = 'auto';
  if (['sqlite', 'cloudflare', 'cloudflare-kv', 'memory', 'auto'].includes(configuredRaw)) {
    configuredType = configuredRaw as StorageDriverType;
  }

  // Explicit storage driver choice
  if (configuredType === 'cloudflare' || configuredType === 'cloudflare-kv') {
    return {
      driver: 'cloudflare',
      configuredType,
      environment: env,
    };
  }

  if (configuredType === 'sqlite') {
    if (SQLiteKVStorage.isAvailable()) {
      return {
        driver: 'sqlite',
        configuredType,
        environment: env,
      };
    }
    return {
      driver: 'memory',
      configuredType,
      environment: env,
      fallbackReason: 'SQLite (node:sqlite) is not supported in this runtime environment. Automatically fell back to MemoryKV.',
    };
  }

  if (configuredType === 'memory') {
    return {
      driver: 'memory',
      configuredType,
      environment: env,
    };
  }

  // 'auto' mode: automatic selection according to environment
  if (env === 'cloudflare') {
    return {
      driver: 'cloudflare',
      configuredType: 'auto',
      environment: env,
    };
  }

  if (env === 'node') {
    if (SQLiteKVStorage.isAvailable()) {
      return {
        driver: 'sqlite',
        configuredType: 'auto',
        environment: env,
      };
    }
    return {
      driver: 'memory',
      configuredType: 'auto',
      environment: env,
      fallbackReason: 'Node.js detected but SQLite is unavailable. Automatically fell back to MemoryKV.',
    };
  }

  return {
    driver: 'memory',
    configuredType: 'auto',
    environment: env,
    fallbackReason: `Unsupported environment "${env}" for persistent storage. Automatically fell back to MemoryKV.`,
  };
}

export class StorageAdapterManager {
  private static instance: StorageAdapterManager | null = null;
  private storageInstance: KVStorage | null = null;
  private currentStorageInfo: StorageInfo | null = null;

  public static getInstance(): StorageAdapterManager {
    if (!StorageAdapterManager.instance) {
      StorageAdapterManager.instance = new StorageAdapterManager();
    }
    return StorageAdapterManager.instance;
  }

  public getStorage(optionsOrBinding?: string | KVStorageOptions): KVStorage {
    const opts: KVStorageOptions =
      typeof optionsOrBinding === 'string'
        ? { bindingName: optionsOrBinding }
        : optionsOrBinding || {};

    if (this.storageInstance && !opts.forceNew) {
      return this.storageInstance;
    }

    const resolvedBindingName =
      opts.bindingName || process?.env?.KV_MAIN_BINDING || 'PASSWORD_MANAGER_KV';
    const resolution = resolveStorageDriver(opts);

    let createdStorage: KVStorage;
    let actualDriver: ResolvedStorageDriver = resolution.driver;
    let fallbackReason = resolution.fallbackReason;
    let details: StorageInfo['details'];

    if (actualDriver === 'cloudflare') {
      try {
        createdStorage = new CloudflareKVStorage(resolvedBindingName);
        console.log(`[StorageAdapter] Initialized Cloudflare KV (binding: ${resolvedBindingName})`);
        details = {
          bindingName: resolvedBindingName,
          description: `Cloudflare KV 分布式键值存储（绑定: ${resolvedBindingName}）`,
        };
      } catch (err) {
        console.warn(
          `[StorageAdapter] Cloudflare KV binding "${resolvedBindingName}" unavailable:`,
          (err as Error).message
        );
        if (SQLiteKVStorage.isAvailable()) {
          actualDriver = 'sqlite';
          fallbackReason = `Cloudflare KV binding "${resolvedBindingName}" not found. Fell back to SQLite.`;
          console.log('[StorageAdapter] Falling back to SQLite local storage');
          createdStorage = new SQLiteKVStorage(opts.dbPath);
          details = {
            dbPath: (createdStorage as SQLiteKVStorage).getDbPath(),
            description: '本地 SQLite 数据库持久化存储（从 Cloudflare KV 回退）',
            fallbackReason,
          };
        } else {
          actualDriver = 'memory';
          fallbackReason = `Cloudflare KV binding "${resolvedBindingName}" not found and SQLite unavailable. Fell back to MemoryKV.`;
          console.log('[StorageAdapter] Falling back to In-Memory KV storage');
          createdStorage = memoryKV;
          details = {
            description: '内存易失存储（从 Cloudflare KV 回退，服务重启数据丢失）',
            fallbackReason,
          };
        }
      }
    } else if (actualDriver === 'sqlite') {
      try {
        createdStorage = new SQLiteKVStorage(opts.dbPath);
        const dbPath = (createdStorage as SQLiteKVStorage).getDbPath();
        console.log(`[StorageAdapter] Initialized local SQLite KV storage at: ${dbPath}`);
        details = {
          dbPath,
          description: `本地 SQLite 数据库持久化存储 (${dbPath})`,
          fallbackReason,
        };
      } catch (err) {
        console.warn('[StorageAdapter] SQLite storage initialization failed, falling back to MemoryKV:', err);
        actualDriver = 'memory';
        fallbackReason = `SQLite initialization failed: ${(err as Error).message}. Fell back to MemoryKV.`;
        createdStorage = memoryKV;
        details = {
          description: '内存易失存储（从 SQLite 回退，服务重启数据丢失）',
          fallbackReason,
        };
      }
    } else {
      console.log('[StorageAdapter] Using in-memory KV storage (ephemeral/test mode)');
      createdStorage = memoryKV;
      details = {
        description: '内存易失存储（服务重启数据丢失）',
        fallbackReason,
      };
    }

    this.currentStorageInfo = {
      driver: actualDriver,
      configuredType: resolution.configuredType,
      environment: resolution.environment,
      isPersistent: actualDriver === 'sqlite' || actualDriver === 'cloudflare',
      details,
    };

    if (!opts.forceNew) {
      this.storageInstance = createdStorage;
    }

    return createdStorage;
  }

  public getStorageInfo(optionsOrBinding?: string | KVStorageOptions): StorageInfo {
    if (this.currentStorageInfo) {
      return this.currentStorageInfo;
    }
    // Eagerly resolve and initialize if not done yet
    this.getStorage(optionsOrBinding);
    return this.currentStorageInfo!;
  }

  public reset(): void {
    if (this.storageInstance && 'close' in this.storageInstance && typeof (this.storageInstance as { close?: () => void }).close === 'function') {
      try {
        (this.storageInstance as { close: () => void }).close();
      } catch {}
    }
    this.storageInstance = null;
    this.currentStorageInfo = null;
  }
}

export const storageAdapterManager = StorageAdapterManager.getInstance();
