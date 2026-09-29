import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import { validateInput, tagInputSchema } from '@/lib/utils/validation';
import { getRequestAuthContext } from '@/lib/auth/context';
import {
  getAllTags,
  createTag,
  findTagByName,
} from '@/lib/repositories/tagRepository';
import { getTagUsageCounts } from '@/lib/repositories/tagRepository';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getRequestAuthContext(request);
    const [tags, counts] = await Promise.all([
      getAllTags(ctx.ownerId),
      getTagUsageCounts(ctx.ownerId),
    ]);

    return jsonSuccess(
      tags.map((t) => ({ ...t, usageCount: counts[t.id] ?? 0 })),
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
    const data = validateInput(tagInputSchema, body);

    // Find-or-create 语义：同名标签已存在时直接返回（幂等），便于扩展端/客户端并发创建
    const existing = await findTagByName(ctx.ownerId, data.name.trim());
    if (existing) {
      return jsonSuccess(existing, { existing: true }, { status: 200 });
    }

    const tag = await createTag(ctx.ownerId, data.name.trim(), data.color);
    return jsonSuccess(tag, undefined, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
