import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent, NextProxy } from 'next/server';

const PUBLIC_PATHS = [
  '/api/auth/init',
  '/api/auth/login',
  '/api/tools/generate-password',
  '/api/tools/evaluate-password',
  '/docs',
  '/login',
  '/favicon.ico',
];

const STATIC_PATH_PREFIXES = [
  '/_next/',
  '/next.svg',
  '/vercel.svg',
  '/file.svg',
  '/globe.svg',
  '/window.svg',
];

function isPublicPath(pathname: string): boolean {
  for (const prefix of STATIC_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  for (const p of PUBLIC_PATHS) {
    if (pathname === p || pathname.startsWith(p + '/')) {
      return true;
    }
  }
  if (pathname === '/' || pathname === '') return true;
  return false;
}

function getCorsHeaders(request: NextRequest): Record<string, string> {
  const allowedOriginsEnv = process.env.CORS_ALLOWED_ORIGINS || '*';
  const requestOrigin = request.headers.get('origin') || '';

  let allowOrigin = '*';
  if (allowedOriginsEnv !== '*') {
    const allowedList = allowedOriginsEnv.split(',').map((s) => s.trim());
    allowOrigin = allowedList.includes(requestOrigin) ? requestOrigin : 'null';
  } else if (requestOrigin) {
    allowOrigin = requestOrigin;
  }

  const allowCredentials = process.env.CORS_ALLOW_CREDENTIALS !== 'false';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-API-Key, X-Master-Password, X-Requested-With, Accept, Origin',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Type, X-Total-Count, X-Page-Count',
    ...(allowCredentials && { 'Access-Control-Allow-Credentials': 'true' }),
    'Access-Control-Max-Age': '86400',
  };
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
  ],
};

// Next.js 16 proxy 签名要求第二参数 event，本实现无需使用
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const proxy: NextProxy = async (request: NextRequest, _event: NextFetchEvent) => {
  const { pathname, origin } = request.nextUrl;
  const method = request.method;

  const corsHeaders = getCorsHeaders(request);

  if (method === 'OPTIONS') {
    return NextResponse.json({}, { status: 200, headers: corsHeaders });
  }

  if (!pathname.startsWith('/api/')) {
    const cookieName = process.env.SESSION_COOKIE_NAME || 'pm_session';
    const hasSessionCookie = !!request.cookies.get(cookieName)?.value;

    if (!hasSessionCookie && !isPublicPath(pathname)) {
      const loginUrl = new URL('/login', origin);
      loginUrl.searchParams.set('next', pathname);
      const resp = NextResponse.redirect(loginUrl);
      Object.entries(corsHeaders).forEach(([k, v]) => resp.headers.set(k, v));
      return resp;
    }

    if (pathname === '/login' && hasSessionCookie) {
      const resp = NextResponse.redirect(new URL('/dashboard', origin));
      Object.entries(corsHeaders).forEach(([k, v]) => resp.headers.set(k, v));
      return resp;
    }

    if (pathname === '/' || pathname === '') {
      const target = hasSessionCookie ? '/dashboard' : '/login';
      const resp = NextResponse.redirect(new URL(target, origin));
      Object.entries(corsHeaders).forEach(([k, v]) => resp.headers.set(k, v));
      return resp;
    }

    const resp = NextResponse.next();
    Object.entries(corsHeaders).forEach(([k, v]) => resp.headers.set(k, v));
    return resp;
  }

  const resp = NextResponse.next();
  Object.entries(corsHeaders).forEach(([k, v]) => resp.headers.set(k, v));
  resp.headers.set('X-Content-Type-Options', 'nosniff');
  resp.headers.set('X-Frame-Options', 'DENY');
  resp.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return resp;
};

export default proxy;
