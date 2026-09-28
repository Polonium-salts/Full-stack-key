import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import { validateInput, tagInputSchema } from '@/lib/utils/validation';
import { getRequestAuthContext } from '@/lib/auth/context';
import {
  requireTagById,
  updateTag,
  deleteTag,
} from '@/lib/repositories/tagRepository';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getRequestAuthContext(request);
    const { id } = await context.params;
    const tag = await requireTagById(ctx.ownerId, id);
    return jsonSuccess(tag);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getRequestAuthContext(request);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const data = validateInput(tagInputSchema, body);

    const tag = await updateTag(ctx.ownerId, id, { name: data.name, color: data.color });
    return jsonSuccess(tag);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getRequestAuthContext(request);
    const { id } = await context.params;
    await deleteTag(ctx.ownerId, id);
    return jsonSuccess({ id, deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
