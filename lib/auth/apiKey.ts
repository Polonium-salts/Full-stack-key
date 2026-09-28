import { nanoid } from 'nanoid';
import { generateAPIKey, hashAPIKey } from '@/lib/crypto';
import {
  findApiKeyByHash,
  markApiKeyUsed,
  addApiKey,
  getAllApiKeys,
  findApiKeyById,
  revokeApiKey,
  regenerateApiKey,
} from '@/lib/repositories/configRepository';
import type { ApiKey } from '@/lib/types';
import { AuthenticationError, NotFoundError } from '@/lib/errors';

export interface ValidatedApiKey {
  valid: boolean;
  apiKeyId?: string;
  keyHash?: string;
  apiKey?: ApiKey;
}

export function extractApiKeyFromRequest(request: Request): string | null {
  const headerKey = request.headers.get('X-API-Key') || request.headers.get('x-api-key');
  if (headerKey) return headerKey.trim();

  const url = new URL(request.url);
  const queryKey = url.searchParams.get('api_key') || url.searchParams.get('apiKey');
  if (queryKey) return queryKey.trim();

  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (authHeader) {
    const [scheme, value] = authHeader.split(' ', 2);
    if (scheme && value && scheme.toLowerCase() === 'apikey') {
      return value.trim();
    }
    if (scheme && value && scheme.toLowerCase() === 'bearer') {
      return value.trim();
    }
  }

  return null;
}

export async function validateRequestApiKey(request: Request): Promise<ValidatedApiKey> {
  const apiKeyStr = extractApiKeyFromRequest(request);
  if (!apiKeyStr) {
    return { valid: false };
  }
  return validateApiKey(apiKeyStr);
}

export async function validateApiKey(apiKeyStr: string): Promise<ValidatedApiKey> {
  const keyHash = await hashAPIKey(apiKeyStr);
  const storedKey = await findApiKeyByHash(keyHash);

  if (!storedKey) {
    return { valid: false };
  }

  if (storedKey.revoked) {
    return {
      valid: false,
      apiKeyId: storedKey.id,
      keyHash,
    };
  }

  try {
    await markApiKeyUsed(storedKey.id);
  } catch {
    // ignore
  }

  return {
    valid: true,
    apiKeyId: storedKey.id,
    keyHash,
    apiKey: storedKey,
  };
}

export async function createApiKey(name: string): Promise<{ apiKey: string; record: ApiKey }> {
  const rawKey = generateAPIKey();
  const keyHash = await hashAPIKey(rawKey);
  const now = new Date().toISOString();

  const record: ApiKey = {
    id: nanoid(),
    keyHash,
    name,
    createdAt: now,
    revoked: false,
  };

  await addApiKey(record);

  return {
    apiKey: rawKey,
    record,
  };
}

export async function listApiKeys(): Promise<Array<Omit<ApiKey, 'keyHash'> & { keyPrefix: string }>> {
  const keys = await getAllApiKeys();
  return keys.map((k) => {
    const { keyHash, ...rest } = k;
    return {
      ...rest,
      keyPrefix: 'pm_...' + keyHash.slice(-6),
    };
  });
}

export async function revokeExistingApiKey(keyId: string): Promise<ApiKey> {
  const key = await findApiKeyById(keyId);
  if (!key) {
    throw new NotFoundError(`API Key "${keyId}" not found`);
  }
  return revokeApiKey(keyId);
}

export async function regenerateExistingApiKey(keyId: string): Promise<{ apiKey: string; record: ApiKey }> {
  const existing = await findApiKeyById(keyId);
  if (!existing) {
    throw new NotFoundError(`API Key "${keyId}" not found`);
  }

  const newRawKey = generateAPIKey();
  const newKeyHash = await hashAPIKey(newRawKey);
  const record = await regenerateApiKey(keyId, newKeyHash);

  return {
    apiKey: newRawKey,
    record,
  };
}

export function requireApiKeyOwner(validated: ValidatedApiKey): { ownerId: string; apiKey: ApiKey } {
  if (!validated.valid || !validated.apiKey || !validated.apiKeyId) {
    throw new AuthenticationError(
      'Invalid or revoked API Key',
      'AUTH_INVALID_API_KEY'
    );
  }
  return {
    ownerId: 'user_' + validated.apiKeyId.slice(0, 12),
    apiKey: validated.apiKey,
  };
}
