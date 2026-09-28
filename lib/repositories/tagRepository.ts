import { nanoid } from 'nanoid';
import type { Tag } from '@/lib/types';
import { getStorage } from '@/lib/storage';
import { NotFoundError } from '@/lib/errors';

const KEY_PREFIXES = {
  TAG: (ownerId: string, id: string) => `pm:${ownerId}:tags:${id}`,
  TAGS_INDEX: (ownerId: string) => `pm:${ownerId}:tags:__index__`,
} as const;

export async function createTag(ownerId: string, name: string, color?: string): Promise<Tag> {
  const storage = getStorage();
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
