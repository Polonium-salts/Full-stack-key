import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import { validateInput, categoryInputSchema } from '@/lib/utils/validation';
import { getRequestAuthContext } from '@/lib/auth/context';
import {
  getAllCategories,
  createCategory,
} from '@/lib/repositories/categoryRepository';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getRequestAuthContext(request);
    const categories = await getAllCategories(ctx.ownerId);
    return jsonSuccess(categories);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getRequestAuthContext(request);
    const body = await request.json().catch(() => ({}));
    const data = validateInput(categoryInputSchema, body);

    const category = await createCategory(ctx.ownerId, data.name);
    return jsonSuccess(category, undefined, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
