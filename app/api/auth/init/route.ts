import { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { validateInput, initSchema } from '@/lib/utils/validation';
import { jsonSuccess, jsonError } from '@/lib/utils/response';
import { initializeApp, isInitialized } from '@/lib/auth/init';
import { getStorageInfo } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const already = await isInitialized();
    if (already) {
      return jsonError(
        'AUTH_ALREADY_INITIALIZED',
        'Application is already initialized',
        undefined,
        409
      );
    }

    const body = await request.json().catch(() => ({}));
    const data = validateInput(initSchema, body);

    const result = await initializeApp(data.masterPassword);

    return jsonSuccess({
      apiKey: result.apiKey,
      apiKeyId: result.apiKeyRecord.id,
      message: 'Application initialized successfully. Store your API Key securely.',
      warning: 'This is the only time you will see the raw API Key. Store it safely!',
    }, undefined, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function GET() {
  try {
    const initialized = await isInitialized();
    const storage = getStorageInfo();
    return jsonSuccess({ initialized, storage });
  } catch (err) {
    return handleRouteError(err);
  }
}
