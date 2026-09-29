import { nanoid } from 'nanoid';
import type { Category } from '@/lib/types';
import { getStorage } from '@/lib/storage';
import { NotFoundError, ConflictError } from '@/lib/errors';

const KEY_PREFIXES = {
  CATEGORY: (ownerId: string, id: string) => `pm:${ownerId}:categories:${id}`,
  CATEGORIES_INDEX: (ownerId: string) => `pm:${ownerId}:categories:__index__`,
} as const;

export async function findCategoryByName(ownerId: string, name: string): Promise<Category | null> {
  const categories = await getAllCategories(ownerId);
  return categories.find((c) => c.name === name) ?? null;
}

export async function createCategory(ownerId: string, name: string): Promise<Category> {
  const storage = getStorage();

  const duplicate = await findCategoryByName(ownerId, name);
  if (duplicate) {
    throw new ConflictError(`分类「${name}」已存在`, 'CATEGORY_DUPLICATE');
  }

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

  const duplicate = await findCategoryByName(ownerId, name);
  if (duplicate && duplicate.id !== id) {
    throw new ConflictError(`分类「${name}」已存在`, 'CATEGORY_DUPLICATE');
  }

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

export interface CategoryUsageCounts {
  [categoryId: string]: number;
}

/** 统计每个分类被多少条有效（非回收站）密码引用 */
export async function getCategoryUsageCounts(ownerId: string): Promise<CategoryUsageCounts> {
  const { getAllPasswordEntries } = await import('./passwordRepository');
  const allPasswords = await getAllPasswordEntries(ownerId);

  const counts: CategoryUsageCounts = {};
  for (const pwd of allPasswords) {
    if (pwd.trashed || !pwd.categoryId) continue;
    counts[pwd.categoryId] = (counts[pwd.categoryId] ?? 0) + 1;
  }
  return counts;
}

export interface ImportMetaResult {
  created: number;
  skipped: number;
  idMap: Record<string, string>;
}

/**
 * 导入分类：按名称去重（已存在同名的复用现有分类）。
 * 返回旧 id -> 现有/新 id 的映射，供密码条目重映射 categoryId。
 */
export async function importCategories(
  ownerId: string,
  categories: Category[]
): Promise<ImportMetaResult> {
  const result: ImportMetaResult = { created: 0, skipped: 0, idMap: {} };
  const existing = await getAllCategories(ownerId);
  const existingByName = new Map(existing.map((c) => [c.name, c]));

  for (const cat of categories) {
    if (!cat || typeof cat.name !== 'string' || !cat.name.trim()) continue;
    const name = cat.name.trim();
    const existingCat = existingByName.get(name);
    if (existingCat) {
      result.skipped++;
      result.idMap[cat.id] = existingCat.id;
    } else {
      const created = await createCategory(ownerId, name);
      existingByName.set(name, created);
      result.created++;
      result.idMap[cat.id] = created.id;
    }
  }

  return result;
}
