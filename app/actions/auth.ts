'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  initializeApp,
  loginWithMasterPassword,
  logoutSession as _logoutSession,
  changeMasterPassword as _changeMasterPassword,
} from '@/lib/auth/init';
import { isInitialized, getSession } from '@/lib/repositories/configRepository';
import {
  createPasswordEntry,
  listPasswordEntries,
  requirePasswordEntryById,
  updatePasswordEntry,
  softDeletePasswordEntry,
  restorePasswordEntry,
  permanentDeletePasswordEntry,
  decryptEntry,
  exportAllData,
  importPasswords,
  getAllPasswordEntries,
  emptyTrash,
  resetVault,
} from '@/lib/repositories/passwordRepository';
import {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '@/lib/repositories/categoryRepository';
import {
  getAllTags,
  createTag,
  updateTag,
  deleteTag,
} from '@/lib/repositories/tagRepository';
import {
  listApiKeys,
  createApiKey,
  revokeExistingApiKey,
  regenerateExistingApiKey,
} from '@/lib/auth/apiKey';
import { generatePassword, evaluatePasswordStrength } from '@/lib/crypto';
import type {
  PasswordEntryInput,
  PasswordEntryUpdate,
  ExportData,
} from '@/lib/types';

interface ServerContext {
  ownerId: string;
  masterKey: CryptoKey;
}

async function getServerContext(): Promise<ServerContext> {
  const cookieStore = await cookies();
  const cookieName = process.env.SESSION_COOKIE_NAME || 'pm_session';
  const sessionId = cookieStore.get(cookieName)?.value;
  if (!sessionId) {
    redirect('/login');
  }
  const session = await getSession(sessionId);
  if (!session) {
    cookieStore.delete(cookieName);
    redirect('/login');
  }
  const { getMasterKeyFromSession } = await import('@/lib/auth/init');
  const masterKey = await getMasterKeyFromSession(session);
  return {
    ownerId: session.ownerId || 'user_default',
    masterKey,
  };
}

function makeEncrypt({ masterKey }: ServerContext) {
  return async (plaintext: string) => {
    const { encryptAESGCM } = await import('@/lib/crypto');
    const res = await encryptAESGCM(masterKey, plaintext);
    return { encrypted: res.ciphertext, iv: res.iv, tag: res.tag };
  };
}

function makeDecrypt({ masterKey }: ServerContext) {
  return async (ciphertext: string, iv: string, tag: string) => {
    const { decryptAESGCM } = await import('@/lib/crypto');
    return decryptAESGCM(masterKey, iv, ciphertext, tag);
  };
}

export async function getInitStatus(): Promise<{ initialized: boolean }> {
  return { initialized: await isInitialized() };
}

export async function initAppAction(formData: FormData) {
  const password = String(formData.get('masterPassword') || '');
  const confirm = String(formData.get('confirmPassword') || '');
  if (!password || password.length < 8) {
    return { ok: false, error: 'Master password must be at least 8 characters' };
  }
  if (password !== confirm) {
    return { ok: false, error: 'Passwords do not match' };
  }
  try {
    const already = await isInitialized();
    if (already) {
      // If already initialized, attempt to log in directly with the master password
      const login = await loginWithMasterPassword(password);
      const cookieStore = await cookies();
      const cookieName = process.env.SESSION_COOKIE_NAME || 'pm_session';
      cookieStore.set(cookieName, login.sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        expires: new Date(login.expiresAt),
      });
      return { ok: true, alreadyInitialized: true };
    }

    const result = await initializeApp(password);
    const login = await loginWithMasterPassword(password);
    const cookieStore = await cookies();
    const cookieName = process.env.SESSION_COOKIE_NAME || 'pm_session';
    cookieStore.set(cookieName, login.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: new Date(login.expiresAt),
    });
    return { ok: true, apiKey: result.apiKey };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Initialization failed' };
  }
}

export async function loginAction(formData: FormData) {
  const password = String(formData.get('masterPassword') || '');
  if (!password) {
    return { ok: false, error: 'Master password is required' };
  }
  try {
    const result = await loginWithMasterPassword(password);
    const cookieStore = await cookies();
    const cookieName = process.env.SESSION_COOKIE_NAME || 'pm_session';
    cookieStore.set(cookieName, result.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: new Date(result.expiresAt),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Login failed' };
  }
}

export async function logoutAction() {
  const cookieStore = await cookies();
  const cookieName = process.env.SESSION_COOKIE_NAME || 'pm_session';
  const sessionId = cookieStore.get(cookieName)?.value;
  if (sessionId) {
    await _logoutSession(sessionId);
  }
  cookieStore.delete(cookieName);
  redirect('/login');
}

export async function listPasswordsAction(params?: {
  search?: string;
  categoryId?: string;
  tag?: string;
  trashed?: boolean;
  page?: number;
  perPage?: number;
}) {
  const ctx = await getServerContext();
  const result = await listPasswordEntries(ctx.ownerId, params || {});
  const decryptFn = makeDecrypt(ctx);
  const items = [];
  for (const e of result.items) {
    try {
      items.push(await decryptEntry(e, decryptFn));
    } catch {
      items.push({ ...e, password: '[DECRYPTION_FAILED]', notes: undefined });
    }
  }
  return { ...result, items };
}

export async function getPasswordDetailAction(id: string) {
  const ctx = await getServerContext();
  const entry = await requirePasswordEntryById(ctx.ownerId, id);
  const decryptFn = makeDecrypt(ctx);
  return decryptEntry(entry, decryptFn);
}

export async function createPasswordAction(formData: FormData) {
  const ctx = await getServerContext();
  const tagsStr = String(formData.get('tags') || '');
  const tags = tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const input: PasswordEntryInput = {
    site: String(formData.get('site') || ''),
    url: String(formData.get('url') || '') || undefined,
    username: String(formData.get('username') || ''),
    password: String(formData.get('password') || ''),
    notes: String(formData.get('notes') || '') || undefined,
    tags,
    categoryId: String(formData.get('categoryId') || '') || undefined,
  };
  if (!input.site || !input.password) {
    return { ok: false, error: 'Site and password are required' };
  }
  const encryptFn = makeEncrypt(ctx);
  const entry = await createPasswordEntry({ ownerId: ctx.ownerId, entry: input, encryptFn });
  return { ok: true, id: entry.id };
}

export async function updatePasswordAction(id: string, formData: FormData) {
  try {
    const ctx = await getServerContext();
    const version = Number(formData.get('version') || '1');
    const tagsStr = String(formData.get('tags') || '');
    const tags = tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : [];

    const existing = await requirePasswordEntryById(ctx.ownerId, id);
    const newPassword = String(formData.get('password') || '');
    const newNotes = String(formData.get('notes') || '');

    const update: PasswordEntryUpdate = {
      site: String(formData.get('site') || '') || existing.site,
      url: formData.has('url') ? (String(formData.get('url')) || undefined) : undefined,
      username: formData.has('username') ? String(formData.get('username') || '') : existing.username,
      password: newPassword || undefined,
      notes: formData.has('notes') ? (newNotes || undefined) : undefined,
      tags: formData.has('tags') ? tags : undefined,
      categoryId: formData.has('categoryId')
        ? String(formData.get('categoryId')) || undefined
        : undefined,
      version,
    };
    const encryptFn = makeEncrypt(ctx);
    const updated = await updatePasswordEntry({
      ownerId: ctx.ownerId,
      id,
      update,
      encryptFn,
    });
    return { ok: true as const, id: updated.id };
  } catch (err) {
    return { ok: false as const, id: '', error: err instanceof Error ? err.message : 'Failed to update' };
  }
}

export async function deletePasswordAction(id: string, permanent = false) {
  const ctx = await getServerContext();
  if (permanent) {
    await permanentDeletePasswordEntry(ctx.ownerId, id);
  } else {
    await softDeletePasswordEntry(ctx.ownerId, id);
  }
  return { ok: true };
}

export async function restorePasswordAction(id: string) {
  const ctx = await getServerContext();
  await restorePasswordEntry(ctx.ownerId, id);
  return { ok: true };
}

export async function emptyTrashAction() {
  const ctx = await getServerContext();
  const res = await emptyTrash(ctx.ownerId);
  return { ok: true, deletedCount: res.deletedCount };
}

export async function resetVaultAction() {
  const ctx = await getServerContext();
  const res = await resetVault(ctx.ownerId);
  return { ok: true, ...res };
}

export async function listCategoriesAction() {
  const ctx = await getServerContext();
  return getAllCategories(ctx.ownerId);
}

export async function createCategoryAction(formData: FormData) {
  const ctx = await getServerContext();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: 'Name is required' };
  const cat = await createCategory(ctx.ownerId, name);
  return { ok: true, id: cat.id };
}

export async function updateCategoryAction(id: string, formData: FormData) {
  const ctx = await getServerContext();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: 'Name is required' };
  await updateCategory(ctx.ownerId, id, name);
  return { ok: true };
}

export async function deleteCategoryAction(id: string) {
  const ctx = await getServerContext();
  await deleteCategory(ctx.ownerId, id);
  return { ok: true };
}

export async function listTagsAction() {
  const ctx = await getServerContext();
  return getAllTags(ctx.ownerId);
}

export async function createTagAction(formData: FormData) {
  const ctx = await getServerContext();
  const name = String(formData.get('name') || '').trim();
  const color = String(formData.get('color') || '').trim() || undefined;
  if (!name) return { ok: false, error: 'Name is required' };
  const tag = await createTag(ctx.ownerId, name, color);
  return { ok: true, id: tag.id };
}

export async function updateTagAction(id: string, formData: FormData) {
  const ctx = await getServerContext();
  const name = String(formData.get('name') || '').trim();
  const color = formData.has('color') ? (String(formData.get('color')) || undefined) : undefined;
  if (!name) return { ok: false, error: 'Name is required' };
  await updateTag(ctx.ownerId, id, { name, color });
  return { ok: true };
}

export async function deleteTagAction(id: string) {
  const ctx = await getServerContext();
  await deleteTag(ctx.ownerId, id);
  return { ok: true };
}

export async function listApiKeysAction() {
  return listApiKeys();
}

export async function createApiKeyAction(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: 'Name is required' };
  const res = await createApiKey(name);
  return { ok: true, apiKey: res.apiKey, id: res.record.id, name: res.record.name };
}

export async function revokeApiKeyAction(id: string) {
  await revokeExistingApiKey(id);
  return { ok: true };
}

export async function regenerateApiKeyAction(id: string) {
  const res = await regenerateExistingApiKey(id);
  return { ok: true, apiKey: res.apiKey };
}

export async function changeMasterPasswordAction(formData: FormData) {
  const ctx = await getServerContext();
  const oldPwd = String(formData.get('oldPassword') || '');
  const newPwd = String(formData.get('newPassword') || '');
  const confirm = String(formData.get('confirmPassword') || '');
  if (!oldPwd || !newPwd) return { ok: false, error: 'All fields are required' };
  if (newPwd.length < 8) return { ok: false, error: 'New password must be at least 8 characters' };
  if (newPwd !== confirm) return { ok: false, error: 'New passwords do not match' };
  try {
    await _changeMasterPassword(oldPwd, newPwd, ctx.ownerId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed' };
  }
}

export async function exportDataAction() {
  const ctx = await getServerContext();
  const categories = await getAllCategories(ctx.ownerId);
  const tags = await getAllTags(ctx.ownerId);
  const pwd = await exportAllData(ctx.ownerId);
  return { ...pwd, categories, tags };
}

export async function importDataAction(data: ExportData, strategy: 'skip' | 'overwrite' | 'duplicate' = 'skip') {
  const ctx = await getServerContext();
  return importPasswords(ctx.ownerId, data, strategy);
}

export async function generatePasswordAction(options?: {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
}) {
  const pwd = generatePassword(options || { length: 20, uppercase: true, lowercase: true, numbers: true, symbols: true });
  const strength = evaluatePasswordStrength(pwd);
  return { password: pwd, strength };
}

export async function getStorageStatusAction() {
  await getServerContext();
  const { getStorageInfo } = await import('@/lib/storage');
  return getStorageInfo();
}

export interface DataMetrics {
  storage: {
    driver: 'sqlite' | 'cloudflare' | 'memory';
    driverName: string;
    configuredType: string;
    environment: string;
    environmentName: string;
    isPersistent: boolean;
    dbPath?: string;
    bindingName?: string;
    fallbackReason?: string;
    description: string;
    fileSizeBytes: number;
    fileSizeFormatted: string;
    totalKeys: number;
    estimatedPayloadBytes: number;
    estimatedPayloadFormatted: string;
  };
  counts: {
    totalPasswords: number;
    activePasswords: number;
    trashedPasswords: number;
    categories: number;
    tags: number;
    apiKeys: number;
  };
}

export async function getDataMetricsAction(): Promise<DataMetrics> {
  const ctx = await getServerContext();
  const { getStorageInfo, getStorageStats } = await import('@/lib/storage');

  const [info, stats, allPasswords, categories, tags, apiKeysList] = await Promise.all([
    getStorageInfo(),
    getStorageStats(),
    getAllPasswordEntries(ctx.ownerId),
    getAllCategories(ctx.ownerId),
    getAllTags(ctx.ownerId),
    listApiKeys(),
  ]);

  const activePasswords = allPasswords.filter((p) => !p.trashed).length;
  const trashedPasswords = allPasswords.filter((p) => p.trashed).length;

  const payloadStr = JSON.stringify({
    passwords: allPasswords,
    categories,
    tags,
  });
  const payloadBytes = Buffer.byteLength(payloadStr, 'utf8');
  const fileSizeBytes = stats.fileSizeBytes || payloadBytes;

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
  }

  const driverNames = {
    sqlite: 'SQLite 本地数据库',
    cloudflare: 'Cloudflare KV 键值存储',
    memory: 'MemoryKV 内存临时',
  };

  const envNames: Record<string, string> = {
    node: 'Node.js 服务端',
    cloudflare: 'Cloudflare Workers / Pages',
    edge: 'Edge 边缘计算',
    browser: '浏览器客户端',
    unknown: '未知环境',
  };

  return {
    storage: {
      driver: info.driver,
      driverName: driverNames[info.driver] || info.driver,
      configuredType: info.configuredType,
      environment: info.environment,
      environmentName: envNames[info.environment] || info.environment,
      isPersistent: info.isPersistent,
      dbPath: info.details.dbPath,
      bindingName: info.details.bindingName,
      fallbackReason: info.details.fallbackReason,
      description: info.details.description,
      fileSizeBytes,
      fileSizeFormatted: formatBytes(fileSizeBytes),
      totalKeys: stats.totalKeys,
      estimatedPayloadBytes: payloadBytes,
      estimatedPayloadFormatted: formatBytes(payloadBytes),
    },
    counts: {
      totalPasswords: allPasswords.length,
      activePasswords,
      trashedPasswords,
      categories: categories.length,
      tags: tags.length,
      apiKeys: apiKeysList.length,
    },
  };
}

export interface DatabaseTablePartition {
  id: string;
  name: string;
  type: 'physical' | 'logical';
  description: string;
  recordCount: number;
  sizeFormatted: string;
  keyPattern: string;
  columns?: Array<{
    name: string;
    type: string;
    primaryKey?: boolean;
    nullable?: boolean;
  }>;
  sampleKeys: string[];
}

export interface DatabaseDetails {
  driver: 'sqlite' | 'cloudflare' | 'memory';
  driverName: string;
  environment: string;
  environmentName: string;
  isPersistent: boolean;
  status: 'healthy' | 'warning' | 'degraded';
  description: string;
  dbPath?: string;
  bindingName?: string;
  fallbackReason?: string;
  capacity: {
    fileSizeBytes: number;
    fileSizeFormatted: string;
    totalKeys: number;
    estimatedPayloadBytes: number;
    estimatedPayloadFormatted: string;
    pageSize?: number;
    pageCount?: number;
    freePages?: number;
    journalMode?: string;
    encoding?: string;
  };
  tables: DatabaseTablePartition[];
}

export async function getDatabaseDetailsAction(): Promise<DatabaseDetails> {
  const ctx = await getServerContext();
  const { getStorageInfo, getDetailedDatabaseStats } = await import('@/lib/storage');

  const [info, detailed, allPasswords, categories, tags, apiKeysList] = await Promise.all([
    getStorageInfo(),
    getDetailedDatabaseStats(),
    getAllPasswordEntries(ctx.ownerId),
    getAllCategories(ctx.ownerId),
    getAllTags(ctx.ownerId),
    listApiKeys(),
  ]);

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
  }

  const driverNames = {
    sqlite: 'SQLite 本地数据库',
    cloudflare: 'Cloudflare KV 键值存储',
    memory: 'MemoryKV 内存临时',
  };

  const envNames: Record<string, string> = {
    node: 'Node.js 服务端',
    cloudflare: 'Cloudflare Workers / Pages',
    edge: 'Edge 边缘计算',
    browser: '浏览器客户端',
    unknown: '未知环境',
  };

  const entries = detailed.entries || [];

  const passwordEntries = entries.filter((e) => e.key.includes(':passwords:') && !e.key.endsWith(':__index__'));
  const passwordIndexEntries = entries.filter((e) => e.key.includes(':passwords:__index__'));
  const categoryEntries = entries.filter((e) => e.key.includes(':categories:') && !e.key.endsWith(':__index__'));
  const categoryIndexEntries = entries.filter((e) => e.key.includes(':categories:__index__'));
  const tagEntries = entries.filter((e) => e.key.includes(':tags:') && !e.key.endsWith(':__index__'));
  const tagIndexEntries = entries.filter((e) => e.key.includes(':tags:__index__'));
  const configEntries = entries.filter((e) => e.key === 'pm:__config__');
  const sessionEntries = entries.filter((e) => e.key.startsWith('pm:sessions:'));
  const otherEntries = entries.filter(
    (e) =>
      !passwordEntries.includes(e) &&
      !passwordIndexEntries.includes(e) &&
      !categoryEntries.includes(e) &&
      !categoryIndexEntries.includes(e) &&
      !tagEntries.includes(e) &&
      !tagIndexEntries.includes(e) &&
      !configEntries.includes(e) &&
      !sessionEntries.includes(e)
  );

  const sumBytes = (items: Array<{ length: number }>) => items.reduce((acc, curr) => acc + (curr.length || 0), 0);

  const tables: DatabaseTablePartition[] = [];

  // 1. Physical Table (if SQLite)
  if (info.driver === 'sqlite' || detailed.columns?.length) {
    tables.push({
      id: 'kv_store',
      name: '物理存储主表 (kv_store)',
      type: 'physical',
      description: '底层键值持久化表，采用复合键值对与 TTL 过期索引管理全部加密数据',
      recordCount: detailed.totalKeys,
      sizeFormatted: formatBytes(detailed.fileSizeBytes),
      keyPattern: 'TEXT PRIMARY KEY',
      columns: detailed.columns.map((c) => ({
        name: c.name,
        type: c.type,
        primaryKey: Boolean(c.pk),
        nullable: !c.notnull,
      })),
      sampleKeys: entries.slice(0, 5).map((e) => e.key),
    });
  }

  // 2. Passwords Partition
  tables.push({
    id: 'passwords',
    name: '密码数据分区 (passwords)',
    type: 'logical',
    description: '存放已加密的单项密码凭证、AES-GCM 初始化向量 (IV) 与验证标签 (TAG)',
    recordCount: allPasswords.length || passwordEntries.length,
    sizeFormatted: formatBytes(sumBytes(passwordEntries) || allPasswords.length * 512),
    keyPattern: `pm:${ctx.ownerId}:passwords:<id>`,
    sampleKeys: passwordEntries.slice(0, 5).map((e) => e.key),
  });

  // 3. Password Index Partition
  tables.push({
    id: 'passwords_index',
    name: '密码索引分区 (passwords_index)',
    type: 'logical',
    description: '维护所有密码条目的全局 ID 索引列表与物理检索指针',
    recordCount: passwordIndexEntries.length || 1,
    sizeFormatted: formatBytes(sumBytes(passwordIndexEntries) || 128),
    keyPattern: `pm:${ctx.ownerId}:passwords:__index__`,
    sampleKeys: passwordIndexEntries.map((e) => e.key),
  });

  // 4. Categories Partition
  tables.push({
    id: 'categories',
    name: '分类数据分区 (categories)',
    type: 'logical',
    description: '存放所有自定义密码分类元数据及排序索引',
    recordCount: categories.length || categoryEntries.length,
    sizeFormatted: formatBytes(sumBytes(categoryEntries) + sumBytes(categoryIndexEntries) || categories.length * 128),
    keyPattern: `pm:${ctx.ownerId}:categories:<id>`,
    sampleKeys: categoryEntries.slice(0, 5).map((e) => e.key),
  });

  // 5. Tags Partition
  tables.push({
    id: 'tags',
    name: '标签数据分区 (tags)',
    type: 'logical',
    description: '存放自定义彩色标签与色彩映射元数据',
    recordCount: tags.length || tagEntries.length,
    sizeFormatted: formatBytes(sumBytes(tagEntries) + sumBytes(tagIndexEntries) || tags.length * 128),
    keyPattern: `pm:${ctx.ownerId}:tags:<id>`,
    sampleKeys: tagEntries.slice(0, 5).map((e) => e.key),
  });

  // 6. Security Config Partition
  tables.push({
    id: 'config',
    name: '系统安全配置表 (config)',
    type: 'logical',
    description: '存放主密码 PBKDF2 哈希、KDF 盐值、加密轮数及 API 密钥授权清单',
    recordCount: configEntries.length || (apiKeysList.length ? 1 : 0),
    sizeFormatted: formatBytes(sumBytes(configEntries) || 512),
    keyPattern: 'pm:__config__',
    sampleKeys: configEntries.map((e) => e.key),
  });

  // 7. Sessions Partition
  if (sessionEntries.length > 0) {
    tables.push({
      id: 'sessions',
      name: '用户认证会话表 (sessions)',
      type: 'logical',
      description: '活跃登录会话令牌与过期时间管理',
      recordCount: sessionEntries.length,
      sizeFormatted: formatBytes(sumBytes(sessionEntries)),
      keyPattern: 'pm:sessions:<sessionToken>',
      sampleKeys: sessionEntries.slice(0, 5).map((e) => e.key),
    });
  }

  // 8. Other Partitions
  if (otherEntries.length > 0) {
    tables.push({
      id: 'other',
      name: '其他系统键值 (misc)',
      type: 'logical',
      description: '系统杂项与扩展存储数据条目',
      recordCount: otherEntries.length,
      sizeFormatted: formatBytes(sumBytes(otherEntries)),
      keyPattern: 'pm:*',
      sampleKeys: otherEntries.slice(0, 5).map((e) => e.key),
    });
  }

  const payloadStr = JSON.stringify({
    passwords: allPasswords,
    categories,
    tags,
  });
  const payloadBytes = Buffer.byteLength(payloadStr, 'utf8');
  const fileSizeBytes = detailed.fileSizeBytes || payloadBytes;

  return {
    driver: info.driver,
    driverName: driverNames[info.driver] || info.driver,
    environment: info.environment,
    environmentName: envNames[info.environment] || info.environment,
    isPersistent: info.isPersistent,
    status: info.isPersistent ? 'healthy' : 'warning',
    description: info.details.description,
    dbPath: info.details.dbPath,
    bindingName: info.details.bindingName,
    fallbackReason: info.details.fallbackReason,
    capacity: {
      fileSizeBytes,
      fileSizeFormatted: formatBytes(fileSizeBytes),
      totalKeys: detailed.totalKeys || entries.length,
      estimatedPayloadBytes: payloadBytes,
      estimatedPayloadFormatted: formatBytes(payloadBytes),
      pageSize: detailed.pageSize,
      pageCount: detailed.pageCount,
      freePages: detailed.freePages,
      journalMode: detailed.journalMode,
      encoding: detailed.encoding,
    },
    tables,
  };
}
