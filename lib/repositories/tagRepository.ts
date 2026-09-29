import { nanoid } from 'nanoid';
import type { Tag } from '@/lib/types';
import { getStorage } from '@/lib/storage';
import { NotFoundError, ConflictError } from '@/lib/errors';

const KEY_PREFIXES = {
  TAG: (ownerId: string, id: string) => `pm:${ownerId}:tags:${id}`,
  TAGS_INDEX: (ownerId: string) => `pm:${ownerId}:tags:__index__`,
} as const;

export async function findTagByName(ownerId: string, name: string): Promise<Tag | null> {
  const tags = await getAllTags(ownerId);
  return tags.find((t) => t.name === name) ?? null;
}

/** 按名称查找标签，不存在时创建（可选颜色），供扩展端/导入复用 */
export async function findOrCreateTag(ownerId: string, name: string, color?: string): Promise<Tag> {
  const existing = await findTagByName(ownerId, name);
  if (existing) return existing;
  return createTag(ownerId, name, color);
}

export async function createTag(ownerId: string, name: string, color?: string): Promise<Tag> {
  const storage = getStorage();

  const duplicate = await findTagByName(ownerId, name);
  if (duplicate) {
    throw new ConflictError(`标签「${name}」已存在`, 'TAG_DUPLICATE');
  }

  const id = nanoid();
  const now = new Date().toISOString();

  const tag: Tag = {
    id,
    name,
    color,
    createdAt: now,
  };

  const key = KEY_PREFIXES.TAG(ownerId, id);
  await storage.put(key, tag);

  const indexKey = KEY_PREFIXES.TAGS_INDEX(ownerId);
  const existingIndex = (await storage.get<string[]>(indexKey)) ?? [];
  if (!existingIndex.includes(id)) {
    existingIndex.push(id);
    await storage.put(indexKey, existingIndex);
  }

  return tag;
}

export async function findTagById(ownerId: string, id: string): Promise<Tag | null> {
  const storage = getStorage();
  const key = KEY_PREFIXES.TAG(ownerId, id);
  return storage.get<Tag>(key);
}

export async function requireTagById(ownerId: string, id: string): Promise<Tag> {
  const tag = await findTagById(ownerId, id);
  if (!tag) {
    throw new NotFoundError(`Tag "${id}" not found`);
  }
  return tag;
}

export async function getAllTags(ownerId: string): Promise<Tag[]> {
  const storage = getStorage();
  const indexKey = KEY_PREFIXES.TAGS_INDEX(ownerId);
  const index = (await storage.get<string[]>(indexKey)) ?? [];

  const tags: Tag[] = [];
  for (const id of index) {
    const tag = await findTagById(ownerId, id);
    if (tag) tags.push(tag);
  }
  return tags.sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateTag(
  ownerId: string,
  id: string,
  updates: { name?: string; color?: string }
): Promise<Tag> {
  const storage = getStorage();
  const existing = await requireTagById(ownerId, id);

  if (updates.name !== undefined) {
    const duplicate = await findTagByName(ownerId, updates.name);
    if (duplicate && duplicate.id !== id) {
      throw new ConflictError(`标签「${updates.name}」已存在`, 'TAG_DUPLICATE');
    }
  }

  const updated: Tag = {
    ...existing,
    ...(updates.name !== undefined && { name: updates.name }),
    ...(updates.color !== undefined && { color: updates.color }),
  };

  const key = KEY_PREFIXES.TAG(ownerId, id);
  await storage.put(key, updated);
  return updated;
}

export async function deleteTag(ownerId: string, id: string): Promise<void> {
  const storage = getStorage();

  const { getAllPasswordEntries, KEY_PREFIXES: PW_PREFIXES } = await import('./passwordRepository');
  const allPasswords = await getAllPasswordEntries(ownerId);
  for (const pwd of allPasswords) {
    if (pwd.tags.includes(id)) {
      const updated = {
        ...pwd,
        tags: pwd.tags.filter((t) => t !== id),
        updatedAt: new Date().toISOString(),
      };
      const pwdKey = PW_PREFIXES.PASSWORD(ownerId, pwd.id);
      await storage.put(pwdKey, updated);
    }
  }

  const key = KEY_PREFIXES.TAG(ownerId, id);
  await storage.delete(key);

  const indexKey = KEY_PREFIXES.TAGS_INDEX(ownerId);
  const index = (await storage.get<string[]>(indexKey)) ?? [];
  const newIndex = index.filter((i) => i !== id);
  await storage.put(indexKey, newIndex);
}

export async function exportTags(ownerId: string): Promise<Tag[]> {
  return getAllTags(ownerId);
}

export interface TagUsageCounts {
  [tagId: string]: number;
}

/** 统计每个标签被多少条有效（非回收站）密码引用 */
export async function getTagUsageCounts(ownerId: string): Promise<TagUsageCounts> {
  const { getAllPasswordEntries } = await import('./passwordRepository');
  const allPasswords = await getAllPasswordEntries(ownerId);

  const counts: TagUsageCounts = {};
  for (const pwd of allPasswords) {
    if (pwd.trashed) continue;
    for (const tid of pwd.tags) {
      counts[tid] = (counts[tid] ?? 0) + 1;
    }
  }
  return counts;
}

export interface ImportTagsResult {
  created: number;
  skipped: number;
  idMap: Record<string, string>;
}

/**
 * 导入标签：按名称去重（已存在同名的复用现有标签），保留颜色。
 * 返回旧 id -> 现有/新 id 的映射，供密码条目重映射 tags。
 */
export async function importTags(ownerId: string, tags: Tag[]): Promise<ImportTagsResult> {
  const result: ImportTagsResult = { created: 0, skipped: 0, idMap: {} };
  const existing = await getAllTags(ownerId);
  const existingByName = new Map(existing.map((t) => [t.name, t]));

  for (const tag of tags) {
    if (!tag || typeof tag.name !== 'string' || !tag.name.trim()) continue;
    const name = tag.name.trim();
    const existingTag = existingByName.get(name);
    if (existingTag) {
      result.skipped++;
      result.idMap[tag.id] = existingTag.id;
    } else {
      const created = await createTag(ownerId, name, tag.color);
      existingByName.set(name, created);
      result.created++;
      result.idMap[tag.id] = created.id;
    }
  }

  return result;
}
