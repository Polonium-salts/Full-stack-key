import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import {
  getValidSession,
  getMasterKeyFromSession,
} from './init';
import { requireConfig } from '@/lib/repositories/configRepository';
import { deriveMasterKey } from '@/lib/crypto';
import { validateRequestApiKey, requireApiKeyOwner } from './apiKey';
import { AuthenticationError } from '@/lib/errors';

export interface AuthContext {
  ownerId: string;
  masterKey: CryptoKey;
  apiKeyId?: string;
  sessionId?: string;
  isSessionAuth: boolean;
}

function extractMasterPassword(request: Request): string | null {
  const header = request.headers.get('X-Master-Password') || request.headers.get('x-master-password');
  if (header) return header;

  const url = new URL(request.url);
  const query = url.searchParams.get('master_password') || url.searchParams.get('masterPassword');
  if (query) return query;

  return null;
}

export async function getMasterKeyFromPassword(password: string): Promise<CryptoKey> {
  const config = await requireConfig();
  return deriveMasterKey(password, config.masterSalt, config.pbkdf2Iterations);
}

export async function getSessionAuthContext(): Promise<AuthContext | null> {
  try {
    const cookieStore = await cookies();
    const cookieName = process.env.SESSION_COOKIE_NAME || 'pm_session';
    const sessionId = cookieStore.get(cookieName)?.value;

    if (!sessionId) return null;

    const session = await getValidSession(sessionId);
    if (!session) return null;

    const masterKey = await getMasterKeyFromSession(session);
    return {
      ownerId: session.ownerId || 'user_default',
      masterKey,
      sessionId,
      isSessionAuth: true,
    };
  } catch {
    return null;
  }
}

export async function getRequestAuthContext(request: NextRequest | Request): Promise<AuthContext> {
  const sessionCtx = await getSessionAuthContext();
  if (sessionCtx) return sessionCtx;

  const validated = await validateRequestApiKey(request as Request);
  if (validated.valid) {
    const { ownerId } = requireApiKeyOwner(validated);
    const masterPassword = extractMasterPassword(request as Request);

    if (!masterPassword) {
      throw new AuthenticationError(
        'API Key authentication requires X-Master-Password header for encryption',
        'AUTH_MISSING_MASTER_PASSWORD'
      );
    }

    const masterKey = await getMasterKeyFromPassword(masterPassword);
    return {
      ownerId,
      masterKey,
      apiKeyId: validated.apiKeyId,
      isSessionAuth: false,
    };
  }

  throw new AuthenticationError(
    'Authentication required: provide valid session or API Key + X-Master-Password header',
    'AUTH_UNAUTHORIZED'
  );
}

export function makeEncryptFn(ctx: { masterKey: CryptoKey }) {
  return async (plaintext: string) => {
    const { encryptAESGCM } = await import('@/lib/crypto');
    const result = await encryptAESGCM(ctx.masterKey, plaintext);
    return {
      encrypted: result.ciphertext,
      iv: result.iv,
      tag: result.tag,
    };
  };
}

export function makeDecryptFn(ctx: { masterKey: CryptoKey }) {
  return async (ciphertext: string, iv: string, tag: string) => {
    const { decryptAESGCM } = await import('@/lib/crypto');
    return decryptAESGCM(ctx.masterKey, iv, ciphertext, tag);
  };
}
