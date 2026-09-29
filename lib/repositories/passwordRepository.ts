import { nanoid } from 'nanoid';
import type {
  PasswordEntry,
  PasswordEntryInput,
  PasswordEntryUpdate,
  PasswordListParams,
  PaginatedResponse,
  SyncResponse,
  ExportData,
  PasswordEntryDecrypted,
} from '@/lib/types';
import { getStorage } from '@/lib/storage';
import { NotFoundError, VersionConflictError } from '@/lib/errors';

export type { EncryptedPasswordEntry } from '@/lib/types';

export const KEY_PREFIXES = {
  PASSWORD: (ownerId: string, id: string) => `pm:${ownerId}:passwords:${id}`,
  PASSWORDS_INDEX: (ownerId: string) => `pm:${ownerId}:passwords:__index__`,
} as const;

export interface CreateOptions {
  ownerId: string;
  entry: PasswordEntryInput;
  encryptFn: (plaintext: string) => Promise<{
    encrypted: string;
    iv: string;
    tag: string;
  }>;
}

export interface UpdateOptions {
  ownerId: string;
  id: string;
  update: PasswordEntryUpdate;
  encryptFn?: (plaintext: string) => Promise<{
    encrypted: string;
    iv: string;
    tag: string;
  }>;
  reencryptAllFn?: (entry: PasswordEntry) => Promise<PasswordEntry>;
}

export interface DecryptOptions {
  entry: PasswordEntry;
  decryptFn: (ciphertext: string, iv: string, tag: string) => Promise<string>;
}

export async function decryptEntry(
  entry: PasswordEntry,
  decryptFn: (ciphertext: string, iv: string, tag: string) => Promise<string>
): Promise<PasswordEntryDecrypted> {
  const password = await decryptFn(entry.encryptedPassword, entry.passwordIv, entry.passwordTag);
  let notes: string | undefined;
  if (entry.encryptedNotes && entry.notesIv && entry.notesTag) {
    notes = await decryptFn(entry.encryptedNotes, entry.notesIv, entry.notesTag);
  }
  // 解构剔除加密字段，保留其余明文元数据（site/url/username/tags 等）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { encryptedPassword, passwordIv, passwordTag, encryptedNotes, notesIv, notesTag, ...rest } = entry;
  return {
    ...rest,
    password,
    notes,
  };
}

export async function createPasswordEntry({ ownerId, entry, encryptFn }: CreateOptions): Promise<PasswordEntry> {
  const storage = getStorage();
  const id = nanoid();
  const now = new Date().toISOString();

  const passwordEncrypted = await encryptFn(entry.password);
  let notesEncrypted: { encrypted: string; iv: string; tag: string } | null = null;
  if (entry.notes && entry.notes.length > 0) {
    notesEncrypted = await encryptFn(entry.notes);
  }

  const newEntry: PasswordEntry = {
    id,
    site: entry.site,
    url: entry.url,
    username: entry.username || '',
    encryptedPassword: passwordEncrypted.encrypted,
    passwordIv: passwordEncrypted.iv,
    passwordTag: passwordEncrypted.tag,
    encryptedNotes: notesEncrypted?.encrypted,
    notesIv: notesEncrypted?.iv,
    notesTag: notesEncrypted?.tag,
    tags: entry.tags ?? [],
    categoryId: entry.categoryId,
    createdAt: now,
    updatedAt: now,
    version: 1,
    trashed: false,
  };

  const key = KEY_PREFIXES.PASSWORD(ownerId, id);
  await storage.put(key, newEntry);

  const indexKey = KEY_PREFIXES.PASSWORDS_INDEX(ownerId);
  const existingIndex = (await storage.get<string[]>(indexKey)) ?? [];
  if (!existingIndex.includes(id)) {
    existingIndex.push(id);
    await storage.put(indexKey, existingIndex);
  }

  return newEntry;
}

export async function findPasswordEntryById(ownerId: string, id: string): Promise<PasswordEntry | null> {
  const storage = getStorage();
  const key = KEY_PREFIXES.PASSWORD(ownerId, id);
  const entry = await storage.get<PasswordEntry>(key);
  return entry ?? null;
}

export async function requirePasswordEntryById(ownerId: string, id: string): Promise<PasswordEntry> {
  const entry = await findPasswordEntryById(ownerId, id);
  if (!entry) {
    throw new NotFoundError(`Password entry "${id}" not found`);
  }
  return entry;
}

export async function getAllPasswordEntries(ownerId: string): Promise<PasswordEntry[]> {
  const storage = getStorage();
  const indexKey = KEY_PREFIXES.PASSWORDS_INDEX(ownerId);
  const index = (await storage.get<string[]>(indexKey)) ?? [];

  const entries: PasswordEntry[] = [];
  for (const id of index) {
    const entry = await findPasswordEntryById(ownerId, id);
    if (entry) entries.push(entry);
  }
  return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listPasswordEntries(
  ownerId: string,
  params: PasswordListParams = {}
): Promise<PaginatedResponse<PasswordEntry>> {
  const { page = 1, perPage = 50, search, categoryId, tag, trashed = false } = params;

  let all = await getAllPasswordEntries(ownerId);

  all = all.filter((e) => e.trashed === trashed);

  if (categoryId) {
    all = all.filter((e) => e.categoryId === categoryId);
  }

  if (tag) {
    all = all.filter((e) => e.tags.includes(tag));
  }

  if (search && search.trim().length > 0) {
    const query = search.trim().toLowerCase();
    all = all.filter((e) => {
      return (
        e.site.toLowerCase().includes(query) ||
        (e.url && e.url.toLowerCase().includes(query)) ||
        e.username.toLowerCase().includes(query)
      );
    });
  }

  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * perPage;
  const items = all.slice(start, start + perPage);

  return {
    items,
    total,
    page: safePage,
    perPage,
    totalPages,
  };
}

export async function updatePasswordEntry({
  ownerId,
  id,
  update,
  encryptFn,
  reencryptAllFn,
}: UpdateOptions): Promise<PasswordEntry> {
  const storage = getStorage();
  const existing = await requirePasswordEntryById(ownerId, id);

  if (existing.version !== update.version) {
    throw new VersionConflictError({ expected: update.version, actual: existing.version });
  }

  let result: PasswordEntry = {
    ...existing,
    site: update.site ?? existing.site,
    url: update.url !== undefined ? update.url : existing.url,
    username: update.username ?? existing.username,
    tags: update.tags ?? existing.tags,
    categoryId: update.categoryId !== undefined ? update.categoryId : existing.categoryId,
    updatedAt: new Date().toISOString(),
    version: existing.version + 1,
  };

  if (update.password !== undefined && encryptFn) {
    const enc = await encryptFn(update.password);
    result.encryptedPassword = enc.encrypted;
    result.passwordIv = enc.iv;
    result.passwordTag = enc.tag;
  }

  if (update.notes !== undefined && encryptFn) {
    if (update.notes && update.notes.length > 0) {
      const enc = await encryptFn(update.notes);
      result.encryptedNotes = enc.encrypted;
      result.notesIv = enc.iv;
      result.notesTag = enc.tag;
    } else {
      result.encryptedNotes = undefined;
      result.notesIv = undefined;
      result.notesTag = undefined;
    }
  }

  if (reencryptAllFn) {
    result = await reencryptAllFn(result);
  }

  const key = KEY_PREFIXES.PASSWORD(ownerId, id);
  await storage.put(key, result);
  return result;
}

export async function softDeletePasswordEntry(ownerId: string, id: string): Promise<PasswordEntry> {
  const storage = getStorage();
  const existing = await requirePasswordEntryById(ownerId, id);

  const updated: PasswordEntry = {
    ...existing,
    trashed: true,
    trashedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: existing.version + 1,
  };

  const key = KEY_PREFIXES.PASSWORD(ownerId, id);
  await storage.put(key, updated);
  return updated;
}

export async function restorePasswordEntry(ownerId: string, id: string): Promise<PasswordEntry> {
  const storage = getStorage();
  const existing = await requirePasswordEntryById(ownerId, id);

  const updated: PasswordEntry = {
    ...existing,
    trashed: false,
    trashedAt: undefined,
    updatedAt: new Date().toISOString(),
    version: existing.version + 1,
  };

  const key = KEY_PREFIXES.PASSWORD(ownerId, id);
  await storage.put(key, updated);
  return updated;
}

export async function permanentDeletePasswordEntry(ownerId: string, id: string): Promise<void> {
  const storage = getStorage();
  const key = KEY_PREFIXES.PASSWORD(ownerId, id);
  await storage.delete(key);

  const indexKey = KEY_PREFIXES.PASSWORDS_INDEX(ownerId);
  const index = (await storage.get<string[]>(indexKey)) ?? [];
  const newIndex = index.filter((i) => i !== id);
  await storage.put(indexKey, newIndex);
}

export async function getPasswordEntriesForSync(
  ownerId: string,
  sinceISO: string
): Promise<SyncResponse> {
  const all = await getAllPasswordEntries(ownerId);
  const since = new Date(sinceISO).getTime();
  const syncedAt = new Date().toISOString();

  const created: PasswordEntry[] = [];
  const updated: PasswordEntry[] = [];
  const deleted: PasswordEntry[] = [];

  for (const entry of all) {
    const createdAt = new Date(entry.createdAt).getTime();
    const updatedAt = new Date(entry.updatedAt).getTime();
    const trashedAt = entry.trashedAt ? new Date(entry.trashedAt).getTime() : 0;

    if (entry.trashed && trashedAt >= since) {
      deleted.push(entry);
    } else if (createdAt >= since && entry.version === 1) {
      created.push(entry);
    } else if (updatedAt >= since) {
      updated.push(entry);
    }
  }

  return {
    created,
    updated,
    deleted,
    syncedAt,
  };
}

export async function exportAllData(ownerId: string): Promise<ExportData> {
  const { exportCategories } = await import('./categoryRepository');
  const { exportTags } = await import('./tagRepository');

  const [categories, tags, passwords] = await Promise.all([
    exportCategories(ownerId),
    exportTags(ownerId),
    getAllPasswordEntries(ownerId),
  ]);

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    categories,
    tags,
    passwords,
  };
}

export interface ImportResult {
  imported: number;
  skipped: number;
  overwritten: number;
  duplicated: number;
  errors: Array<{ id: string; message: string }>;
}

export async function importPasswords(
  ownerId: string,
  data: ExportData,
  strategy: 'skip' | 'overwrite' | 'duplicate'
): Promise<ImportResult> {
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    overwritten: 0,
    duplicated: 0,
    errors: [],
  };

  const storage = getStorage();
  const indexKey = KEY_PREFIXES.PASSWORDS_INDEX(ownerId);
  const index = (await storage.get<string[]>(indexKey)) ?? [];
  const existingIds = new Set(index);

  for (const entry of data.passwords) {
    try {
      let id = entry.id;
      const entryExists = existingIds.has(id);

      if (entryExists) {
        if (strategy === 'skip') {
          result.skipped++;
          continue;
        } else if (strategy === 'duplicate') {
          id = nanoid();
          result.duplicated++;
        } else {
          result.overwritten++;
        }
      } else {
        result.imported++;
      }

      const importEntry: PasswordEntry = {
        ...entry,
        id,
      };

      const key = KEY_PREFIXES.PASSWORD(ownerId, id);
      await storage.put(key, importEntry);

      if (!existingIds.has(id)) {
        index.push(id);
        existingIds.add(id);
      }
    } catch (err) {
      result.errors.push({
        id: entry.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await storage.put(indexKey, index);
  return result;
}

export async function reencryptAllPasswordEntries(
  ownerId: string,
  reencryptFn: (entry: PasswordEntry) => Promise<PasswordEntry>
): Promise<number> {
  const storage = getStorage();
  const all = await getAllPasswordEntries(ownerId);

  for (const entry of all) {
    const reencrypted = await reencryptFn(entry);
    const key = KEY_PREFIXES.PASSWORD(ownerId, entry.id);
    await storage.put(key, reencrypted);
  }

  return all.length;
}

export async function clearAllPasswordEntries(ownerId: string): Promise<number> {
  const storage = getStorage();
  const all = await getAllPasswordEntries(ownerId);

  for (const entry of all) {
    const key = KEY_PREFIXES.PASSWORD(ownerId, entry.id);
    await storage.delete(key);
  }

  const indexKey = KEY_PREFIXES.PASSWORDS_INDEX(ownerId);
  await storage.put(indexKey, []);

  return all.length;
}
