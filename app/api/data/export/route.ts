import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/errors';
import { jsonSuccess } from '@/lib/utils/response';
import { getRequestAuthContext } from '@/lib/auth/context';
import { exportAllData } from '@/lib/repositories/passwordRepository';
import { getAllCategories } from '@/lib/repositories/categoryRepository';
import { getAllTags } from '@/lib/repositories/tagRepository';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getRequestAuthContext(request);

    const [categories, tags, exportData] = await Promise.all([
      getAllCategories(ctx.ownerId),
      getAllTags(ctx.ownerId),
      exportAllData(ctx.ownerId),
    ]);

    const data = {
      ...exportData,
      categories,
      tags,
      exportedAt: new Date().toISOString(),
    };

    const acceptHeader = request.headers.get('accept') || '';
    const wantDownload = acceptHeader.includes('application/octet-stream') ||
      new URL(request.url).searchParams.get('download') === 'true';

    if (wantDownload) {
      const filename = `password-manager-export-${Date.now()}.json`;
      return new Response(JSON.stringify(data, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return jsonSuccess(data);
  } catch (err) {
    return handleRouteError(err);
  }
}
