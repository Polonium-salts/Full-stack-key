import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import { validateInput, passwordEntryUpdateSchema } from '@/lib/utils/validation';
import { getRequestAuthContext, makeEncryptFn, makeDecryptFn } from '@/lib/auth/context';
import {
  requirePasswordEntryById,
  updatePasswordEntry,
  softDeletePasswordEntry,
  decryptEntry,
} from '@/lib/repositories/passwordRepository';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getRequestAuthContext(request);
    const { id } = await context.params;

    const entry = await requirePasswordEntryById(ctx.ownerId, id);
    const decryptFn = makeDecryptFn(ctx);
    const decrypted = await decryptEntry(entry, decryptFn);

    return jsonSuccess(decrypted);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getRequestAuthContext(request);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const data = validateInput(passwordEntryUpdateSchema, body);

    const encryptFn = makeEncryptFn(ctx);
    const updated = await updatePasswordEntry({
      ownerId: ctx.ownerId,
      id,
      update: data,
      encryptFn,
    });

    const decryptFn = makeDecryptFn(ctx);
    const decrypted = await decryptEntry(updated, decryptFn);

    return jsonSuccess(decrypted);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getRequestAuthContext(request);
    const { id } = await context.params;

    const deleted = await softDeletePasswordEntry(ctx.ownerId, id);
    return jsonSuccess({
      id: deleted.id,
      trashed: deleted.trashed,
      trashedAt: deleted.trashedAt,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
