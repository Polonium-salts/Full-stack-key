import { EncryptionError, DecryptionError } from '@/lib/errors';

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const TAG_LENGTH = 128;

export interface EncryptedData {
  iv: string;
  ciphertext: string;
  tag: string;
}

function ensureCrypto(): Crypto {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return crypto;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  throw new EncryptionError('Web Crypto API is not available in this environment');
}

function generateIV(): Uint8Array {
  const crypto = ensureCrypto();
  const iv = new Uint8Array(IV_LENGTH);
  crypto.getRandomValues(iv);
  return iv;
}

function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

function decodeBase64(base64: string): Uint8Array {
  let binary: string;
  if (typeof atob === 'function') {
    binary = atob(base64);
  } else {
    binary = Buffer.from(base64, 'base64').toString('binary');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function importAESKey(rawKeyBytes: Uint8Array, extractable = true): Promise<CryptoKey> {
  const crypto = ensureCrypto();
  return crypto.subtle.importKey(
    'raw',
    rawKeyBytes as unknown as BufferSource,
    { name: ALGORITHM, length: KEY_LENGTH },
    extractable,
    ['encrypt', 'decrypt']
  );
}

export async function encryptAESGCM(key: CryptoKey, plaintext: string): Promise<EncryptedData> {
  try {
    const crypto = ensureCrypto();
    const iv = generateIV();
    const plaintextBytes = encodeUtf8(plaintext);

    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv as unknown as BufferSource,
        tagLength: TAG_LENGTH,
      },
      key,
      plaintextBytes as unknown as BufferSource
    );

    const encryptedBytes = new Uint8Array(encryptedBuffer);
    const ciphertextLength = encryptedBytes.length - (TAG_LENGTH / 8);
    const ciphertextBytes = encryptedBytes.slice(0, ciphertextLength);
    const tagBytes = encryptedBytes.slice(ciphertextLength);

    return {
      iv: encodeBase64(iv),
      ciphertext: encodeBase64(ciphertextBytes),
      tag: encodeBase64(tagBytes),
    };
  } catch (cause) {
    throw new EncryptionError('Failed to encrypt data', cause instanceof Error ? cause.message : String(cause));
  }
}

export async function decryptAESGCM(
  key: CryptoKey,
  iv: string,
  ciphertext: string,
  tag: string
): Promise<string> {
  try {
    const crypto = ensureCrypto();
    const ivBytes = decodeBase64(iv);
    const ciphertextBytes = decodeBase64(ciphertext);
    const tagBytes = decodeBase64(tag);

    const combined = new Uint8Array(ciphertextBytes.length + tagBytes.length);
    combined.set(ciphertextBytes, 0);
    combined.set(tagBytes, ciphertextBytes.length);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: ivBytes as unknown as BufferSource,
        tagLength: TAG_LENGTH,
      },
      key,
      combined as unknown as BufferSource
    );

    return decodeUtf8(new Uint8Array(decryptedBuffer));
  } catch (cause) {
    throw new DecryptionError(
      'Failed to decrypt data - wrong key or corrupted data',
      cause instanceof Error ? cause.message : String(cause)
    );
  }
}

export function encryptFieldSync(key: CryptoKey, plaintext: string): Promise<EncryptedData> {
  return encryptAESGCM(key, plaintext);
}

export { generateIV as generateIVBytes };
