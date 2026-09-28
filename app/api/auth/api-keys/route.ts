import { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { validateInput, apiKeyCreateSchema } from '@/lib/utils/validation';
import { jsonSuccess } from '@/lib/utils/response';
import { validateRequestApiKey, requireApiKeyOwner, listApiKeys, createApiKey } from '@/lib/auth/apiKey';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const validated = await validateRequestApiKey(request);
    requireApiKeyOwner(validated);

    const keys = await listApiKeys();
    return jsonSuccess(keys);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const validated = await validateRequestApiKey(request);
    requireApiKeyOwner(validated);

    const body = await request.json().catch(() => ({}));
    const data = validateInput(apiKeyCreateSchema, body);

    const { apiKey, record } = await createApiKey(data.name);
    return jsonSuccess(
      {
        apiKey,
        id: record.id,
        name: record.name,
        createdAt: record.createdAt,
      },
      {
        warning: 'This is the only time you will see the raw API Key. Store it safely!',
      },
      { status: 201 }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
