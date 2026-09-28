import { nanoid } from 'nanoid';
import type { Category } from '@/lib/types';
import { getStorage } from '@/lib/storage';
import { NotFoundError } from '@/lib/errors';

const KEY_PREFIXES = {
  CATEGORY: (ownerId: string, id: string) => `pm:${ownerId}:categories:${id}`,
  CATEGORIES_INDEX: (ownerId: string) => `pm:${ownerId}:categories:__index__`,
} as const;

export async function createCategory(ownerId: string, name: string): Promise<Category> {
  const storage = getStorage();
  const id = nanoid();
  const now = new Date().toISOString();

  const category: Category = {
    id,
    name,
    createdAt: now,
    updatedAt: now,
  };

  const key = KEY_PREFIXES.CATEGORY(ownerId, id);
  await storage.put(key, category);

  const indexKey = KEY_PREFIXES.CATEGORIES_INDEX(ownerId);
  const existingIndex = (await storage.get<string[]>(indexKey)) ?? [];
  if (!existingIndex.includes(id)) {
    existingIndex.push(id);
    await storage.put(indexKey, existingIndex);
  }

  return category;
}

export async function findCategoryById(ownerId: string, id: string): Promise<Category | null> {
  const storage = getStorage();
  const key = KEY_PREFIXES.CATEGORY(ownerId, id);
  return storage.get<Category>(key);
}

export async function requireCategoryById(ownerId: string, id: string): Promise<Category> {
  const category = await findCategoryById(ownerId, id);
  if (!category) {
    throw new NotFoundError(`Category "${id}" not found`);
  }
  return category;
}

export async function getAllCategories(ownerId: string): Promise<Category[]> {
  const storage = getStorage();
  const indexKey = KEY_PREFIXES.CATEGORIES_INDEX(ownerId);
  const index = (await storage.get<string[]>(indexKey)) ?? [];

  const categories: Category[] = [];
  for (const id of index) {
    const category = await findCategoryById(ownerId, id);
    if (category) categories.push(category);
  }
  return categories.sort((a, b) => a.name.localeCompare(b.name));
}

export async function updateCategory(ownerId: string, id: string, name: string): Promise<Category> {
  const storage = getStorage();
  const existing = await requireCategoryById(ownerId, id);

  const updated: Category = {
    ...existing,
    name,
    updatedAt: new Date().toISOString(),
  };

  const key = KEY_PREFIXES.CATEGORY(ownerId, id);
  await storage.put(key, updated);
  return updated;
}

export async function deleteCategory(ownerId: string, id: string): Promise<void> {
  const storage = getStorage();

  const { getAllPasswordEntries, KEY_PREFIXES: PW_PREFIXES } = await import('./passwordRepository');
  const allPasswords = await getAllPasswordEntries(ownerId);
  for (const pwd of allPasswords) {
    if (pwd.categoryId === id) {
      const updated = { ...pwd, categoryId: undefined, updatedAt: new Date().toISOString() };
      const pwdKey = PW_PREFIXES.PASSWORD(ownerId, pwd.id);
      await storage.put(pwdKey, updated);
    }
  }

  const key = KEY_PREFIXES.CATEGORY(ownerId, id);
  await storage.delete(key);

  const indexKey = KEY_PREFIXES.CATEGORIES_INDEX(ownerId);
  const index = (await storage.get<string[]>(indexKey)) ?? [];
  const newIndex = index.filter((i) => i !== id);
  await storage.put(indexKey, newIndex);
}

export async function exportCategories(ownerId: string): Promise<Category[]> {
  return getAllCategories(ownerId);
}
