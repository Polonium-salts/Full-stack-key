import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import { getRequestAuthContext, makeDecryptFn } from '@/lib/auth/context';
import { restorePasswordEntry, decryptEntry } from '@/lib/repositories/passwordRepository';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getRequestAuthContext(request);
    const { id } = await context.params;

    const restored = await restorePasswordEntry(ctx.ownerId, id);
    const decryptFn = makeDecryptFn(ctx);
    const decrypted = await decryptEntry(restored, decryptFn);

    return jsonSuccess(decrypted);
  } catch (err) {
    return handleRouteError(err);
  }
}
