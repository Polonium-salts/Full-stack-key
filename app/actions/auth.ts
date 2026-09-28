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
  if (!input.site || !input.username || !input.password) {
    return { ok: false, error: 'Site, username and password are required' };
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
      username: String(formData.get('username') || '') || existing.username,
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
