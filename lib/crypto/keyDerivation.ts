const PBKDF2_ALGORITHM = 'PBKDF2';
const HASH_ALGORITHM = 'SHA-256';
const DERIVED_KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const DEFAULT_ITERATIONS = 200000;
const API_KEY_LENGTH = 32;

function ensureCrypto(): Crypto {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return crypto;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API is not available in this environment');
}

function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function decodeHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function encodeHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function generateSalt(length = SALT_LENGTH): string {
  const crypto = ensureCrypto();
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return encodeHex(bytes);
}

export async function deriveMasterKey(
  password: string,
  salt: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<CryptoKey> {
  const crypto = ensureCrypto();
  const passwordBytes = encodeUtf8(password) as unknown as BufferSource;
  const saltBytes = (typeof salt === 'string' ? decodeHex(salt) : (salt as unknown as Uint8Array)) as unknown as BufferSource;

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    { name: PBKDF2_ALGORITHM },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: PBKDF2_ALGORITHM,
      salt: saltBytes,
      iterations,
      hash: HASH_ALGORITHM,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function deriveMasterKeyBytes(
  password: string,
  salt: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<Uint8Array> {
  const crypto = ensureCrypto();
  const passwordBytes = encodeUtf8(password) as unknown as BufferSource;
  const saltBytes = (typeof salt === 'string' ? decodeHex(salt) : (salt as unknown as Uint8Array)) as unknown as BufferSource;

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    { name: PBKDF2_ALGORITHM },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: PBKDF2_ALGORITHM,
      salt: saltBytes,
      iterations,
      hash: HASH_ALGORITHM,
    },
    baseKey,
    DERIVED_KEY_LENGTH * 8
  );

  return new Uint8Array(derivedBits);
}

export async function hashMasterPassword(
  password: string,
  salt: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<string> {
  const keyBytes = await deriveMasterKeyBytes(password, salt, iterations);
  return encodeHex(keyBytes);
}

export async function hashAPIKey(apiKey: string): Promise<string> {
  const crypto = ensureCrypto();
  const bytes = encodeUtf8(apiKey) as unknown as BufferSource;
  const hashBuffer = await crypto.subtle.digest(HASH_ALGORITHM, bytes);
  return encodeHex(new Uint8Array(hashBuffer));
}

export function generateAPIKey(): string {
  const crypto = ensureCrypto();
  const bytes = new Uint8Array(API_KEY_LENGTH);
  crypto.getRandomValues(bytes);
  const base64 = encodeHex(bytes);
  return `pm_${base64}`;
}

export function generateSessionToken(): string {
  const crypto = ensureCrypto();
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return encodeHex(bytes);
}

export { DEFAULT_ITERATIONS, SALT_LENGTH, API_KEY_LENGTH };
