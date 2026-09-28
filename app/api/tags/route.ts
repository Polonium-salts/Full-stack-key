import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import { validateInput, tagInputSchema } from '@/lib/utils/validation';
import { getRequestAuthContext } from '@/lib/auth/context';
import {
  getAllTags,
  createTag,
} from '@/lib/repositories/tagRepository';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getRequestAuthContext(request);
    const tags = await getAllTags(ctx.ownerId);
    return jsonSuccess(tags);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getRequestAuthContext(request);
    const body = await request.json().catch(() => ({}));
    const data = validateInput(tagInputSchema, body);

    const tag = await createTag(ctx.ownerId, data.name, data.color);
    return jsonSuccess(tag, undefined, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
