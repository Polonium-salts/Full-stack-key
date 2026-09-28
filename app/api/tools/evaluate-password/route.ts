import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import { validateInput, evaluatePasswordSchema } from '@/lib/utils/validation';
import { evaluatePasswordStrength } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const data = validateInput(evaluatePasswordSchema, body);

    const strength = evaluatePasswordStrength(data.password);
    return jsonSuccess(strength);
  } catch (err) {
    return handleRouteError(err);
  }
}
