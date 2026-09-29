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
import { NotFoundError, VersionConflictError, ValidationError } from '@/lib/errors';

/**
 * 校验密码条目引用的分类与标签是否真实存在。
 * 自由文本标签（历史上由旧版扩展写入）会被自动注册为正式标签并替换为标签 ID。
 */
async function resolveTagAndCategoryRefs(
  ownerId: string,
  refs: { categoryId?: string; tags?: string[] }
): Promise<{ categoryId?: string; tags?: string[] }> {
  const { findCategoryById } = await import('./categoryRepository');
  const { findOrCreateTag } = await import('./tagRepository');

  const categoryId = refs.categoryId;
  if (categoryId) {
    const category = await findCategoryById(ownerId, categoryId);
    if (!category) {
      throw new ValidationError(`分类 "${categoryId}" 不存在`, {
        field: 'categoryId',
      });
    }
  }

  let tags = refs.tags;
  if (tags && tags.length > 0) {
    const { findTagById } = await import('./tagRepository');
    const resolved: string[] = [];
    for (const t of tags) {
      if (!t || !t.trim()) continue;
      // 已是有效标签 ID 则直接使用；否则视为自由名称，自动注册为新标签
      const asId = await findTagById(ownerId, t);
      if (asId) {
        resolved.push(asId.id);
      } else {
        const tag = await findOrCreateTag(ownerId, t.trim());
        resolved.push(tag.id);
      }
    }
    tags = [...new Set(resolved)];
  }

  return { categoryId, tags };
}

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

  // 校验分类存在性，并把自由文本标签注册为正式标签（返回标签 ID 列表）
  const resolvedRefs = await resolveTagAndCategoryRefs(ownerId, {
    categoryId: entry.categoryId,
    tags: entry.tags,
  });

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
    tags: resolvedRefs.tags ?? [],
    categoryId: resolvedRefs.categoryId,
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

  // 校验新的分类/标签引用（仅在本次提交中指定时）
  const resolvedRefs = await resolveTagAndCategoryRefs(ownerId, {
    categoryId: update.categoryId,
    tags: update.tags,
  });

  let result: PasswordEntry = {
    ...existing,
    site: update.site ?? existing.site,
    url: update.url !== undefined ? update.url : existing.url,
    username: update.username ?? existing.username,
    tags: resolvedRefs.tags ?? existing.tags,
    categoryId:
      update.categoryId !== undefined ? resolvedRefs.categoryId : existing.categoryId,
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

export async function emptyTrash(ownerId: string): Promise<{ deletedCount: number }> {
  const storage = getStorage();
  const all = await getAllPasswordEntries(ownerId);
  const trashed = all.filter((entry) => entry.trashed);

  for (const entry of trashed) {
    const key = KEY_PREFIXES.PASSWORD(ownerId, entry.id);
    await storage.delete(key);
  }

  const indexKey = KEY_PREFIXES.PASSWORDS_INDEX(ownerId);
  const index = (await storage.get<string[]>(indexKey)) ?? [];
  const trashedIds = new Set(trashed.map((e) => e.id));
  const newIndex = index.filter((id) => !trashedIds.has(id));
  await storage.put(indexKey, newIndex);

  return { deletedCount: trashed.length };
}

export async function resetVault(ownerId: string): Promise<{
  deletedPasswords: number;
  deletedCategories: number;
  deletedTags: number;
}> {
  const storage = getStorage();

  // 1. Delete all passwords
  const pwIndexKey = KEY_PREFIXES.PASSWORDS_INDEX(ownerId);
  const pwIndex = (await storage.get<string[]>(pwIndexKey)) ?? [];
  for (const id of pwIndex) {
    await storage.delete(KEY_PREFIXES.PASSWORD(ownerId, id));
  }
  await storage.delete(pwIndexKey);

  // 2. Delete all categories
  const catIndexKey = `pm:${ownerId}:categories:__index__`;
  const catIndex = (await storage.get<string[]>(catIndexKey)) ?? [];
  for (const id of catIndex) {
    await storage.delete(`pm:${ownerId}:categories:${id}`);
  }
  await storage.delete(catIndexKey);

  // 3. Delete all tags
  const tagIndexKey = `pm:${ownerId}:tags:__index__`;
  const tagIndex = (await storage.get<string[]>(tagIndexKey)) ?? [];
  for (const id of tagIndex) {
    await storage.delete(`pm:${ownerId}:tags:${id}`);
  }
  await storage.delete(tagIndexKey);

  return {
    deletedPasswords: pwIndex.length,
    deletedCategories: catIndex.length,
    deletedTags: tagIndex.length,
  };
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
  categoriesCreated: number;
  tagsCreated: number;
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
    categoriesCreated: 0,
    tagsCreated: 0,
    errors: [],
  };

  const storage = getStorage();

  // 1. 先导入分类与标签（按名称去重），得到旧 id -> 新 id 的映射
  const { importCategories } = await import('./categoryRepository');
  const { importTags } = await import('./tagRepository');
  const catResult = await importCategories(ownerId, data.categories ?? []);
  const tagResult = await importTags(ownerId, data.tags ?? []);

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

      // 重映射分类/标签引用到当前保险库中的真实 ID
      const remappedCategoryId = entry.categoryId
        ? catResult.idMap[entry.categoryId] ?? entry.categoryId
        : undefined;
      const remappedTags = (entry.tags ?? [])
        .map((t) => tagResult.idMap[t] ?? t)
        .filter((t, i, arr) => arr.indexOf(t) === i);

      const importEntry: PasswordEntry = {
        ...entry,
        id,
        categoryId: remappedCategoryId,
        tags: remappedTags,
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

  result.categoriesCreated = catResult.created;
  result.tagsCreated = tagResult.created;

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
