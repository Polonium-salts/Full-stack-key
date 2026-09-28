import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import { validateInput, passwordEntryInputSchema } from '@/lib/utils/validation';
import { getRequestAuthContext, makeEncryptFn, makeDecryptFn } from '@/lib/auth/context';
import {
  createPasswordEntry,
  listPasswordEntries,
  decryptEntry,
} from '@/lib/repositories/passwordRepository';
import type { PasswordListParams } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getRequestAuthContext(request);
    const { searchParams } = new URL(request.url);

    const params: PasswordListParams = {
      page: Number(searchParams.get('page')) || 1,
      perPage: Math.min(200, Number(searchParams.get('perPage')) || 50),
      search: searchParams.get('search') || undefined,
      categoryId: searchParams.get('categoryId') || undefined,
      tag: searchParams.get('tag') || undefined,
      trashed: searchParams.get('trashed') === 'true',
    };

    const result = await listPasswordEntries(ctx.ownerId, params);
    const decryptFn = makeDecryptFn(ctx);

    const decryptedItems = [];
    for (const entry of result.items) {
      try {
        decryptedItems.push(await decryptEntry(entry, decryptFn));
      } catch {
        decryptedItems.push({
          id: entry.id,
          site: entry.site,
          url: entry.url,
          username: entry.username,
          password: '[DECRYPTION_FAILED]',
          notes: undefined,
          tags: entry.tags,
          categoryId: entry.categoryId,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          version: entry.version,
          trashed: entry.trashed,
          trashedAt: entry.trashedAt,
        });
      }
    }

    return jsonSuccess(
      {
        ...result,
        items: decryptedItems,
      },
      { ownerId: ctx.ownerId }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getRequestAuthContext(request);
    const body = await request.json().catch(() => ({}));
    const data = validateInput(passwordEntryInputSchema, body);

    const encryptFn = makeEncryptFn(ctx);
    const entry = await createPasswordEntry({
      ownerId: ctx.ownerId,
      entry: data,
      encryptFn,
    });

    const decryptFn = makeDecryptFn(ctx);
    const decrypted = await decryptEntry(entry, decryptFn);

    return jsonSuccess(decrypted, undefined, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
