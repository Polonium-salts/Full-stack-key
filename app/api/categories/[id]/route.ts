import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import { validateInput, categoryInputSchema } from '@/lib/utils/validation';
import { getRequestAuthContext } from '@/lib/auth/context';
import {
  requireCategoryById,
  updateCategory,
  deleteCategory,
} from '@/lib/repositories/categoryRepository';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getRequestAuthContext(request);
    const { id } = await context.params;
    const category = await requireCategoryById(ctx.ownerId, id);
    return jsonSuccess(category);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getRequestAuthContext(request);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const data = validateInput(categoryInputSchema, body);

    const category = await updateCategory(ctx.ownerId, id, data.name);
    return jsonSuccess(category);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getRequestAuthContext(request);
    const { id } = await context.params;
    await deleteCategory(ctx.ownerId, id);
    return jsonSuccess({ id, deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
