export interface PasswordGeneratorOptions {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
  excludeAmbiguous?: boolean;
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  suggestions: string[];
  crackTimeSeconds?: number;
}

const CHAR_SETS = {
  uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  uppercaseFull: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijkmnpqrstuvwxyz',
  lowercaseFull: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '23456789',
  numbersFull: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{}|;:,.<>?',
};

function secureRandomInt(max: number): number {
  const _crypto = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : (crypto as Crypto);
  const arr = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / max) * max;
  let x: number;
  do {
    _crypto.getRandomValues(arr);
    x = arr[0];
  } while (x >= limit);
  return x % max;
}

function pickRandom(chars: string): string {
  return chars[secureRandomInt(chars.length)];
}

function shuffleString(str: string): string {
  const arr = str.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

export function generatePassword(options: PasswordGeneratorOptions = {}): string {
  const {
    length = 20,
    uppercase = true,
    lowercase = true,
    numbers = true,
    symbols = true,
    excludeAmbiguous = true,
  } = options;

  if (length < 8) {
    throw new Error('Password length must be at least 8 characters');
  }

  if (!uppercase && !lowercase && !numbers && !symbols) {
    throw new Error('At least one character set must be selected');
  }

  let pool = '';
  const requiredChars: string[] = [];

  if (uppercase) {
    const set = excludeAmbiguous ? CHAR_SETS.uppercase : CHAR_SETS.uppercaseFull;
    pool += set;
    requiredChars.push(pickRandom(set));
  }
  if (lowercase) {
    const set = excludeAmbiguous ? CHAR_SETS.lowercase : CHAR_SETS.lowercaseFull;
    pool += set;
    requiredChars.push(pickRandom(set));
  }
  if (numbers) {
    const set = excludeAmbiguous ? CHAR_SETS.numbers : CHAR_SETS.numbersFull;
    pool += set;
    requiredChars.push(pickRandom(set));
  }
  if (symbols) {
    pool += CHAR_SETS.symbols;
    requiredChars.push(pickRandom(CHAR_SETS.symbols));
  }

  let password = '';
  const remainingLength = length - requiredChars.length;
  for (let i = 0; i < remainingLength; i++) {
    password += pickRandom(pool);
  }

  password = shuffleString(password + requiredChars.join(''));
  return password;
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  const suggestions: string[] = [];
  let score = 0;

  if (!password || password.length === 0) {
    return { score: 0, label: '空', suggestions: ['请输入密码'] };
  }

  const length = password.length;

  if (length >= 8) score++;
  if (length >= 12) score++;
  if (length >= 16) score++;
  if (length >= 24) score++;

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  const varietyCount = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;

  if (varietyCount >= 2 && length >= 10) score++;
  if (varietyCount >= 3) score++;
  if (varietyCount >= 4 && length >= 14) score++;

  if (length < 12) {
    suggestions.push('建议至少 12 个字符');
  }
  if (!hasLower) suggestions.push('添加小写字母');
  if (!hasUpper) suggestions.push('添加大写字母');
  if (!hasNumber) suggestions.push('添加数字');
  if (!hasSymbol) suggestions.push('添加特殊字符（如 !@#$%）');

  const commonPatterns = [
    /(.)\1{2,}/,
    /123|abc|qwerty|password|admin|letmein/i,
    /^\d+$/,
    /^[a-z]+$/i,
  ];
  if (commonPatterns.some((p) => p.test(password))) {
    score = Math.max(0, score - 2);
    suggestions.push('避免常见模式、重复字符或字典单词');
  }

  let clampedScore: 0 | 1 | 2 | 3 | 4;
  if (score <= 0) clampedScore = 0;
  else if (score === 1) clampedScore = 1;
  else if (score <= 3) clampedScore = 2;
  else if (score <= 5) clampedScore = 3;
  else clampedScore = 4;

  const labels = ['非常弱', '弱', '一般', '强', '非常强'];

  return {
    score: clampedScore,
    label: labels[clampedScore],
    suggestions: Array.from(new Set(suggestions)).slice(0, 4),
  };
}
