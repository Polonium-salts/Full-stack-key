import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import { validateInput, passwordGeneratorSchema } from '@/lib/utils/validation';
import { generatePassword, evaluatePasswordStrength } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const options = validateInput(passwordGeneratorSchema, body);

    const password = generatePassword(options);
    const strength = evaluatePasswordStrength(password);

    return jsonSuccess({
      password,
      strength,
      options,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const length = Number(searchParams.get('length')) || 20;
    const uppercase = searchParams.get('uppercase') !== 'false';
    const lowercase = searchParams.get('lowercase') !== 'false';
    const numbers = searchParams.get('numbers') !== 'false';
    const symbols = searchParams.get('symbols') !== 'false';

    const password = generatePassword({
      length: Math.max(8, Math.min(128, length)),
      uppercase,
      lowercase,
      numbers,
      symbols,
    });
    const strength = evaluatePasswordStrength(password);

    return jsonSuccess({ password, strength });
  } catch (err) {
    return handleRouteError(err);
  }
}
