import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { validateInput, loginSchema } from '@/lib/utils/validation';
import { jsonSuccess } from '@/lib/utils/response';
import { loginWithMasterPassword, logoutSession } from '@/lib/auth/init';
import { validateRequestApiKey } from '@/lib/auth/apiKey';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const data = validateInput(loginSchema, body);

    const result = await loginWithMasterPassword(data.masterPassword);

    const cookieName = process.env.SESSION_COOKIE_NAME || 'pm_session';
    const cookieStore = await cookies();
    cookieStore.set(cookieName, result.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: new Date(result.expiresAt),
    });

    return jsonSuccess({
      success: true,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const cookieName = process.env.SESSION_COOKIE_NAME || 'pm_session';
    const sessionId = cookieStore.get(cookieName)?.value;
    if (sessionId) {
      await logoutSession(sessionId);
    }
    cookieStore.delete(cookieName);
    return jsonSuccess({ success: true });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function GET() {
  try {
    const validated = await validateRequestApiKey(
      new Request('http://localhost', { headers: { 'x-api-key': '' } })
    );
    return jsonSuccess({
      authenticated: validated.valid,
      ...(validated.valid && { apiKeyId: validated.apiKeyId }),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
