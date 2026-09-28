import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import { validateInput, importSchema } from '@/lib/utils/validation';
import { getRequestAuthContext } from '@/lib/auth/context';
import { importPasswords } from '@/lib/repositories/passwordRepository';
import type { ExportData } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getRequestAuthContext(request);
    const body = await request.json().catch(() => ({}));
    const validated = validateInput(importSchema, body);

    const result = await importPasswords(
      ctx.ownerId,
      validated.data as ExportData,
      validated.strategy ?? 'skip'
    );

    return jsonSuccess({
      ...result,
      strategy: validated.strategy,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
