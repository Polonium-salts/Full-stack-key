import {
  deriveMasterKey,
  deriveMasterKeyBytes,
  hashMasterPassword,
  generateSalt,
  generateSessionToken,
  encryptAESGCM,
  decryptAESGCM,
  importAESKey,
  DEFAULT_ITERATIONS,
} from '@/lib/crypto';
import {
  initializeConfig,
  requireConfig,
  isInitialized,
  updateMasterPassword,
  createSession,
  getSession,
  deleteSession,
} from '@/lib/repositories/configRepository';
import {
  reencryptAllPasswordEntries,
} from '@/lib/repositories/passwordRepository';
import { generateApiKeyRecord } from './apiKey';
import {
  AuthenticationError,
  ConflictError,
} from '@/lib/errors';
import type { ApiKey, PasswordEntry } from '@/lib/types';
import type { SessionData } from '@/lib/repositories/configRepository';

export interface InitResult {
  apiKey: string;
  apiKeyRecord: ApiKey;
  sessionId?: string;
}

export async function initializeApp(masterPassword: string): Promise<InitResult> {
  const already = await isInitialized();
  if (already) {
    throw new ConflictError(
      'Application is already initialized',
      'AUTH_ALREADY_INITIALIZED'
    );
  }

  if (masterPassword.length < 8) {
    throw new AuthenticationError(
      'Master password must be at least 8 characters',
      'AUTH_INVALID_PASSWORD'
    );
  }

  const masterSalt = generateSalt();
  const kekSalt = generateSalt();
  const iterations = Number(process.env.PBKDF2_ITERATIONS) || DEFAULT_ITERATIONS;

  const masterPasswordHash = await hashMasterPassword(masterPassword, masterSalt, iterations);

  const { apiKey, record: initialApiKey } = await generateApiKeyRecord('Initial API Key');

  await initializeConfig(
    masterPasswordHash,
    masterSalt,
    kekSalt,
    iterations,
    initialApiKey
  );

  return {
    apiKey,
    apiKeyRecord: initialApiKey,
  };
}

export async function verifyMasterPassword(masterPassword: string): Promise<boolean> {
  const config = await requireConfig();
  const expectedHash = await hashMasterPassword(
    masterPassword,
    config.masterSalt,
    config.pbkdf2Iterations
  );

  const a = expectedHash;
  const b = config.masterPasswordHash;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function changeMasterPassword(
  oldPassword: string,
  newPassword: string,
  ownerId: string
): Promise<void> {
  const config = await requireConfig();

  const valid = await verifyMasterPassword(oldPassword);
  if (!valid) {
    throw new AuthenticationError(
      'Current master password is incorrect',
      'AUTH_INVALID_PASSWORD'
    );
  }

  if (newPassword.length < 8) {
    throw new AuthenticationError(
      'New master password must be at least 8 characters',
      'AUTH_INVALID_PASSWORD'
    );
  }

  const oldMasterKey = await deriveMasterKey(
    oldPassword,
    config.masterSalt,
    config.pbkdf2Iterations
  );

  const newMasterSalt = generateSalt();
  const newKekSalt = generateSalt();
  const newIterations = Number(process.env.PBKDF2_ITERATIONS) || DEFAULT_ITERATIONS;
  const newMasterKey = await deriveMasterKey(newPassword, newMasterSalt, newIterations);
  const newMasterPasswordHash = await hashMasterPassword(newPassword, newMasterSalt, newIterations);

  const reencryptEntry = async (entry: PasswordEntry) => {
    let password: string;
    let notes: string | undefined;
    try {
      password = await decryptAESGCM(oldMasterKey, entry.passwordIv, entry.encryptedPassword, entry.passwordTag);
    } catch {
      password = '';
    }
    if (entry.encryptedNotes && entry.notesIv && entry.notesTag) {
      try {
        notes = await decryptAESGCM(oldMasterKey, entry.notesIv, entry.encryptedNotes, entry.notesTag);
      } catch {
        notes = undefined;
      }
    }

    const newPasswordEnc = await encryptAESGCM(newMasterKey, password);
    const result = {
      ...entry,
      encryptedPassword: newPasswordEnc.ciphertext,
      passwordIv: newPasswordEnc.iv,
      passwordTag: newPasswordEnc.tag,
      version: entry.version + 1,
      updatedAt: new Date().toISOString(),
    };

    if (notes && notes.length > 0) {
      const newNotesEnc = await encryptAESGCM(newMasterKey, notes);
      result.encryptedNotes = newNotesEnc.ciphertext;
      result.notesIv = newNotesEnc.iv;
      result.notesTag = newNotesEnc.tag;
    } else {
      result.encryptedNotes = undefined;
      result.notesIv = undefined;
      result.notesTag = undefined;
    }

    return result;
  };

  await reencryptAllPasswordEntries(ownerId, reencryptEntry);
  await updateMasterPassword(newMasterPasswordHash, newMasterSalt, newKekSalt, newIterations);
}

export interface LoginResult {
  sessionId: string;
  expiresAt: string;
}

export async function loginWithMasterPassword(
  masterPassword: string,
  options?: { durationSeconds?: number }
): Promise<LoginResult> {
  const config = await requireConfig();
  const valid = await verifyMasterPassword(masterPassword);
  if (!valid) {
    throw new AuthenticationError(
      'Master password is incorrect',
      'AUTH_INVALID_PASSWORD'
    );
  }

  const masterKeyRaw = await deriveMasterKeyBytes(
    masterPassword,
    config.masterSalt,
    config.pbkdf2Iterations
  );
  const sessionSecret = generateSalt(32);
  const sessionKey = await importAESKey(new TextEncoder().encode(sessionSecret.padEnd(32, '0').slice(0, 32)));
  const exportable = Array.from(masterKeyRaw).map((b) => b.toString(16).padStart(2, '0')).join('');
  const encryptedMasterKey = await encryptAESGCM(sessionKey, exportable);

  const duration = options?.durationSeconds || Number(process.env.SESSION_DURATION) || 86400;
  const sessionId = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + duration * 1000).toISOString();

  const sessionData: SessionData = {
    sessionId,
    ownerId: 'user_default',
    createdAt: now.toISOString(),
    expiresAt,
    kekSalt: sessionSecret,
    encryptedMasterKey: encryptedMasterKey.ciphertext,
    masterKeyIv: encryptedMasterKey.iv,
    masterKeyTag: encryptedMasterKey.tag,
  };

  await createSession(sessionData, duration);

  return {
    sessionId,
    expiresAt,
  };
}

export async function getValidSession(sessionId: string): Promise<SessionData | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const now = new Date();
  if (new Date(session.expiresAt) < now) {
    await deleteSession(sessionId);
    return null;
  }

  return session;
}

export async function logoutSession(sessionId: string): Promise<void> {
  await deleteSession(sessionId);
}

export async function getMasterKeyFromSession(session: SessionData): Promise<CryptoKey> {
  if (!session.encryptedMasterKey || !session.masterKeyIv || !session.masterKeyTag) {
    throw new AuthenticationError('Session missing master key data');
  }
  const secret = session.kekSalt.padEnd(32, '0').slice(0, 32);
  const sessionKey = await importAESKey(new TextEncoder().encode(secret));
  const hex = await decryptAESGCM(
    sessionKey,
    session.masterKeyIv,
    session.encryptedMasterKey,
    session.masterKeyTag
  );
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return importAESKey(bytes);
}

export async function getDefaultOwnerIdFromSession(session: SessionData): Promise<string> {
  return session.ownerId || 'user_default';
}

export { isInitialized };
