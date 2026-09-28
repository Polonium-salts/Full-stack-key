import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import { getRequestAuthContext, makeDecryptFn } from '@/lib/auth/context';
import { getPasswordEntriesForSync, decryptEntry } from '@/lib/repositories/passwordRepository';
import type { PasswordEntry } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getRequestAuthContext(request);
    const { searchParams } = new URL(request.url);
    const since = searchParams.get('since') || new Date(0).toISOString();

    const result = await getPasswordEntriesForSync(ctx.ownerId, since);
    const decryptFn = makeDecryptFn(ctx);

    const decryptAll = async (arr: PasswordEntry[]) => {
      const out = [];
      for (const entry of arr) {
        try {
          out.push(await decryptEntry(entry, decryptFn));
        } catch {
          out.push(entry);
        }
      }
      return out;
    };

    return jsonSuccess({
      created: await decryptAll(result.created),
      updated: await decryptAll(result.updated),
      deleted: result.deleted.map((e) => ({ id: e.id, trashedAt: e.trashedAt })),
      syncedAt: result.syncedAt,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
