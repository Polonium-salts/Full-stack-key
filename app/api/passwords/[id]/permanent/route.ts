import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import { getRequestAuthContext } from '@/lib/auth/context';
import { permanentDeletePasswordEntry } from '@/lib/repositories/passwordRepository';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getRequestAuthContext(request);
    const { id } = await context.params;

    await permanentDeletePasswordEntry(ctx.ownerId, id);

    return jsonSuccess({
      id,
      deleted: true,
      permanent: true,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
