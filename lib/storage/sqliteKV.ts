import type { KVStorage } from './types';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface SQLiteDatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): SQLiteStatementSync;
  close(): void;
}

export interface SQLiteStatementSync {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

interface KVRow {
  key: string;
  value: string;
  expires_at: number | null;
}

interface SqliteModule {
  DatabaseSync: new (loc: string, opt?: unknown) => SQLiteDatabaseSync;
}

let _sqliteModulePromise: Promise<SqliteModule | null> | null = null;
let _sqliteModule: SqliteModule | null = null;

async function getSqliteModule(): Promise<SqliteModule | null> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    return null;
  }
  if (_sqliteModule) return _sqliteModule;
  if (!_sqliteModulePromise) {
    _sqliteModulePromise = (async () => {
      try {
        const load = new Function('return import("node:sqlite")');
        const mod = (await load()) as SqliteModule;
        _sqliteModule = mod;
        return mod;
      } catch (err) {
        console.warn('[SQLiteKV] Failed to dynamically import node:sqlite:', err);
        return null;
      }
    })();
  }
  return _sqliteModulePromise;
}

// Global cache to avoid multiple open database handles across Next.js dev HMR reloads
const globalStore = globalThis as unknown as {
  __sqlite_db_cache__?: Map<string, SQLiteDatabaseSync>;
};
if (!globalStore.__sqlite_db_cache__) {
  globalStore.__sqlite_db_cache__ = new Map();
}

export class SQLiteKVStorage implements KVStorage {
  private db: SQLiteDatabaseSync | null = null;
  private dbPath: string;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || process?.env?.SQLITE_PATH || process?.env?.SQLITE_DB_PATH || this.resolveDefaultDbPath();
  }

  private resolveDefaultDbPath(): string {
    try {
      if (typeof process !== 'undefined' && process.cwd) {
        return path.resolve(process.cwd(), '.data', 'vault.sqlite');
      }
    } catch {
      // fallback
    }
    return '.data/vault.sqlite';
  }

  static isAvailable(): boolean {
    if (typeof process === 'undefined' || !process.versions?.node) {
      return false;
    }
    const major = parseInt(process.versions.node.split('.')[0], 10);
    return major >= 22;
  }

  private async getDb(): Promise<SQLiteDatabaseSync> {
    if (this.db && this.initialized) {
      return this.db;
    }
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error(`[SQLiteKV] Failed to initialize SQLite database at "${this.dbPath}". node:sqlite is not available in this runtime.`);
    }
    return this.db;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized && this.db) return;
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        const sqliteMod = await getSqliteModule();
        if (!sqliteMod) {
          throw new Error('node:sqlite module could not be loaded.');
        }

        // Ensure directory exists if not an in-memory database
        if (this.dbPath !== ':memory:') {
          const dir = path.dirname(path.resolve(this.dbPath));
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
        }

        // Check global cache to reuse handle during Next.js development
        const cacheKey = this.dbPath;
        let cachedDb = globalStore.__sqlite_db_cache__?.get(cacheKey);

        if (!cachedDb) {
          cachedDb = new sqliteMod.DatabaseSync(this.dbPath);
          globalStore.__sqlite_db_cache__?.set(cacheKey, cachedDb);
        }

        this.db = cachedDb;

        // Initialize table and pragmas for high concurrency and resilience
        this.db.exec(`
          PRAGMA journal_mode = WAL;
          PRAGMA synchronous = NORMAL;
          PRAGMA busy_timeout = 5000;
          CREATE TABLE IF NOT EXISTS kv_store (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            expires_at INTEGER
          );
          CREATE INDEX IF NOT EXISTS idx_kv_expires_at ON kv_store(expires_at);
        `);

        this.initialized = true;
      } catch (err) {
        console.error(`[SQLiteKV] Failed to open database at "${this.dbPath}":`, err);
        this.db = null;
        this.initialized = false;
        throw err;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const db = await this.getDb();
    const row = db.prepare('SELECT value, expires_at FROM kv_store WHERE key = ?').get(key) as KVRow | undefined;

    if (!row) {
      return null;
    }

    if (row.expires_at !== null && row.expires_at !== undefined && row.expires_at <= Date.now()) {
      db.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
      return null;
    }

    try {
      return JSON.parse(row.value) as T;
    } catch {
      return row.value as unknown as T;
    }
  }

  async put<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const db = await this.getDb();
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;

    db.prepare(`
      INSERT INTO kv_store (key, value, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        expires_at = excluded.expires_at
    `).run(key, serialized, expiresAt);
  }

  async delete(key: string): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
  }

  async list(prefix?: string): Promise<{ keys: string[]; list_complete: boolean; cursor?: string }> {
    const db = await this.getDb();
    const now = Date.now();

    // Clean up expired records
    try {
      db.prepare('DELETE FROM kv_store WHERE expires_at IS NOT NULL AND expires_at <= ?').run(now);
    } catch {
      // Continue even if cleanup failed due to temporary lock
    }

    let rows: Array<{ key: string }>;
    if (prefix && prefix.length > 0) {
      rows = db.prepare('SELECT key FROM kv_store WHERE substr(key, 1, ?) = ? ORDER BY key ASC').all(
        prefix.length,
        prefix
      ) as Array<{ key: string }>;
    } else {
      rows = db.prepare('SELECT key FROM kv_store ORDER BY key ASC').all() as Array<{ key: string }>;
    }

    return {
      keys: rows.map((r) => r.key),
      list_complete: true,
    };
  }

  async clear(): Promise<void> {
    const db = await this.getDb();
    db.prepare('DELETE FROM kv_store').run();
  }

  close(): void {
    if (this.db) {
      try {
        globalStore.__sqlite_db_cache__?.delete(this.dbPath);
        this.db.close();
      } catch {}
      this.db = null;
      this.initialized = false;
    }
  }

  getDbPath(): string {
    return this.dbPath;
  }

  async getStats(): Promise<{
    fileSizeBytes: number;
    rowCount: number;
    pageCount: number;
    pageSize: number;
  }> {
    const db = await this.getDb();
    let fileSizeBytes = 0;
    try {
      if (typeof fs !== 'undefined' && fs.existsSync(this.dbPath)) {
        fileSizeBytes = fs.statSync(this.dbPath).size;
      }
    } catch {}

    let rowCount = 0;
    let pageCount = 0;
    let pageSize = 4096;

    try {
      const countRow = db.prepare('SELECT COUNT(*) as count FROM kv_store').get() as { count?: number | bigint } | undefined;
      rowCount = Number(countRow?.count || 0);

      const pragmaPageCount = db.prepare('PRAGMA page_count').get() as { page_count?: number | bigint } | undefined;
      pageCount = Number(pragmaPageCount?.page_count || 0);

      const pragmaPageSize = db.prepare('PRAGMA page_size').get() as { page_size?: number | bigint } | undefined;
      pageSize = Number(pragmaPageSize?.page_size || 4096);

      if (!fileSizeBytes && pageCount && pageSize) {
        fileSizeBytes = pageCount * pageSize;
      }
    } catch {}

    return { fileSizeBytes, rowCount, pageCount, pageSize };
  }

  async getDetailedStats(): Promise<{
    fileSizeBytes: number;
    rowCount: number;
    pageCount: number;
    pageSize: number;
    freePages: number;
    journalMode: string;
    encoding: string;
    columns: Array<{ name: string; type: string; notnull: number; pk: number }>;
    rows: Array<{ key: string; length: number; expiresAt: number | null }>;
  }> {
    const db = await this.getDb();
    let fileSizeBytes = 0;
    try {
      if (typeof fs !== 'undefined' && fs.existsSync(this.dbPath)) {
        fileSizeBytes = fs.statSync(this.dbPath).size;
      }
    } catch {}

    let rowCount = 0;
    let pageCount = 0;
    let pageSize = 4096;
    let freePages = 0;
    let journalMode = 'DELETE';
    let encoding = 'UTF-8';

    try {
      const countRow = db.prepare('SELECT COUNT(*) as count FROM kv_store').get() as { count?: number | bigint } | undefined;
      rowCount = Number(countRow?.count || 0);

      const pragmaPageCount = db.prepare('PRAGMA page_count').get() as { page_count?: number | bigint } | undefined;
      pageCount = Number(pragmaPageCount?.page_count || 0);

      const pragmaPageSize = db.prepare('PRAGMA page_size').get() as { page_size?: number | bigint } | undefined;
      pageSize = Number(pragmaPageSize?.page_size || 4096);

      const pragmaFreePages = db.prepare('PRAGMA freelist_count').get() as { freelist_count?: number | bigint } | undefined;
      freePages = Number(pragmaFreePages?.freelist_count || 0);

      const pragmaJournal = db.prepare('PRAGMA journal_mode').get() as { journal_mode?: string } | undefined;
      journalMode = (pragmaJournal?.journal_mode || 'DELETE').toUpperCase();

      const pragmaEncoding = db.prepare('PRAGMA encoding').get() as { encoding?: string } | undefined;
      encoding = pragmaEncoding?.encoding || 'UTF-8';

      if (!fileSizeBytes && pageCount && pageSize) {
        fileSizeBytes = pageCount * pageSize;
      }
    } catch {}

    let columns: Array<{ name: string; type: string; notnull: number; pk: number }> = [];
    try {
      const tableInfo = db.prepare('PRAGMA table_info(kv_store)').all() as Array<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: unknown;
        pk: number;
      }>;
      columns = tableInfo.map((c) => ({
        name: c.name,
        type: c.type,
        notnull: c.notnull,
        pk: c.pk,
      }));
    } catch {}

    let rows: Array<{ key: string; length: number; expiresAt: number | null }> = [];
    try {
      const sample = db.prepare('SELECT key, length(value) as length, expires_at as expiresAt FROM kv_store ORDER BY key ASC').all() as Array<{
        key: string;
        length: number;
        expiresAt: number | null;
      }>;
      rows = sample;
    } catch {}

    return {
      fileSizeBytes,
      rowCount,
      pageCount,
      pageSize,
      freePages,
      journalMode,
      encoding,
      columns,
      rows,
    };
  }
}
