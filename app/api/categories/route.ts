import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import { validateInput, categoryInputSchema } from '@/lib/utils/validation';
import { getRequestAuthContext } from '@/lib/auth/context';
import {
  getAllCategories,
  createCategory,
  findCategoryByName,
  getCategoryUsageCounts,
} from '@/lib/repositories/categoryRepository';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getRequestAuthContext(request);
    const [categories, counts] = await Promise.all([
      getAllCategories(ctx.ownerId),
      getCategoryUsageCounts(ctx.ownerId),
    ]);

    return jsonSuccess(
      categories.map((c) => ({ ...c, usageCount: counts[c.id] ?? 0 })),
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
    const data = validateInput(categoryInputSchema, body);

    // Find-or-create 语义：同名分类已存在时直接返回（幂等）
    const existing = await findCategoryByName(ctx.ownerId, data.name.trim());
    if (existing) {
      return jsonSuccess(existing, { existing: true }, { status: 200 });
    }

    const category = await createCategory(ctx.ownerId, data.name.trim());
    return jsonSuccess(category, undefined, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
