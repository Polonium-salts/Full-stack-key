import { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import {
  validateRequestApiKey,
  requireApiKeyOwner,
  revokeExistingApiKey,
  regenerateExistingApiKey,
} from '@/lib/auth/apiKey';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const validated = await validateRequestApiKey(request);
    requireApiKeyOwner(validated);
    const { id } = await context.params;

    const revoked = await revokeExistingApiKey(id);
    return jsonSuccess({
      id: revoked.id,
      name: revoked.name,
      revoked: true,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const validated = await validateRequestApiKey(request);
    requireApiKeyOwner(validated);
    const { id } = await context.params;

    const { apiKey, record } = await regenerateExistingApiKey(id);
    return jsonSuccess(
      {
        apiKey,
        id: record.id,
        name: record.name,
        createdAt: record.createdAt,
      },
      {
        warning: 'This is the only time you will see the new raw API Key. Store it safely!',
      }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
