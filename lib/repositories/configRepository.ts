import type { AppConfig, ApiKey } from '@/lib/types';
import { getStorage } from '@/lib/storage';
import {
  ConflictError,
  AuthenticationError,
  NotFoundError,
} from '@/lib/errors';
import { DEFAULT_ITERATIONS } from '@/lib/crypto';

const CONFIG_KEY = 'pm:__config__';
const SESSIONS_PREFIX = 'pm:sessions:';

export const DEFAULT_CONFIG: Omit<AppConfig, 'masterPasswordHash' | 'masterSalt' | 'kekSalt' | 'createdAt'> = {
  initialized: false,
  pbkdf2Iterations: DEFAULT_ITERATIONS,
  apiKeys: [],
};

export async function getConfig(): Promise<AppConfig | null> {
  const storage = getStorage();
  const config = await storage.get<AppConfig>(CONFIG_KEY);
  return config ?? null;
}

export async function requireConfig(): Promise<AppConfig> {
  const config = await getConfig();
  if (!config || !config.initialized) {
    throw new AuthenticationError(
      'Application is not initialized',
      'AUTH_NOT_INITIALIZED'
    );
  }
  return config;
}

export async function isInitialized(): Promise<boolean> {
  const config = await getConfig();
  return config?.initialized ?? false;
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const storage = getStorage();
  await storage.put(CONFIG_KEY, config);
}

export async function initializeConfig(
  masterPasswordHash: string,
  masterSalt: string,
  kekSalt: string,
  pbkdf2Iterations: number,
  initialApiKey: ApiKey
): Promise<AppConfig> {
  const already = await isInitialized();
  if (already) {
    throw new ConflictError(
      'Application is already initialized',
      'AUTH_ALREADY_INITIALIZED'
    );
  }

  const config: AppConfig = {
    initialized: true,
    masterPasswordHash,
    masterSalt,
    kekSalt,
    pbkdf2Iterations,
    createdAt: new Date().toISOString(),
    apiKeys: [initialApiKey],
  };

  await saveConfig(config);
  return config;
}

export async function updateMasterPassword(
  newMasterPasswordHash: string,
  newMasterSalt: string,
  newKekSalt: string,
  newPbkdf2Iterations?: number
): Promise<AppConfig> {
  const config = await requireConfig();
  const updated: AppConfig = {
    ...config,
    masterPasswordHash: newMasterPasswordHash,
    masterSalt: newMasterSalt,
    kekSalt: newKekSalt,
    ...(newPbkdf2Iterations !== undefined && { pbkdf2Iterations: newPbkdf2Iterations }),
  };
  await saveConfig(updated);
  return updated;
}

export async function getAllApiKeys(): Promise<ApiKey[]> {
  const config = await requireConfig();
  return config.apiKeys;
}

export async function findApiKeyById(keyId: string): Promise<ApiKey | null> {
  const config = await requireConfig();
  return config.apiKeys.find((k) => k.id === keyId) ?? null;
}

export async function findApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
  const config = await requireConfig();
  return config.apiKeys.find((k) => k.keyHash === keyHash && !k.revoked) ?? null;
}

export async function addApiKey(apiKey: ApiKey): Promise<AppConfig> {
  const config = await requireConfig();
  config.apiKeys.push(apiKey);
  await saveConfig(config);
  return config;
}

export async function revokeApiKey(keyId: string): Promise<ApiKey> {
  const config = await requireConfig();
  const idx = config.apiKeys.findIndex((k) => k.id === keyId);
  if (idx === -1) {
    throw new NotFoundError(`API Key "${keyId}" not found`);
  }
  config.apiKeys[idx].revoked = true;
  await saveConfig(config);
  return config.apiKeys[idx];
}

export async function regenerateApiKey(keyId: string, newKeyHash: string): Promise<ApiKey> {
  const config = await requireConfig();
  const idx = config.apiKeys.findIndex((k) => k.id === keyId);
  if (idx === -1) {
    throw new NotFoundError(`API Key "${keyId}" not found`);
  }
  config.apiKeys[idx].keyHash = newKeyHash;
  config.apiKeys[idx].revoked = false;
  config.apiKeys[idx].lastUsedAt = undefined;
  await saveConfig(config);
  return config.apiKeys[idx];
}

export async function markApiKeyUsed(keyId: string): Promise<void> {
  const config = await requireConfig();
  const idx = config.apiKeys.findIndex((k) => k.id === keyId);
  if (idx !== -1) {
    config.apiKeys[idx].lastUsedAt = new Date().toISOString();
    await saveConfig(config);
  }
}

export interface SessionData {
  sessionId: string;
  ownerId: string;
  createdAt: string;
  expiresAt: string;
  kekSalt: string;
  encryptedMasterKey?: string;
  masterKeyIv?: string;
  masterKeyTag?: string;
}

export async function createSession(
  sessionData: SessionData,
  ttlSeconds: number
): Promise<void> {
  const storage = getStorage();
  const key = SESSIONS_PREFIX + sessionData.sessionId;
  await storage.put(key, sessionData, ttlSeconds);
}

export async function getSession(sessionId: string): Promise<SessionData | null> {
  const storage = getStorage();
  const key = SESSIONS_PREFIX + sessionId;
  return storage.get<SessionData>(key);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const storage = getStorage();
  const key = SESSIONS_PREFIX + sessionId;
  await storage.delete(key);
}
