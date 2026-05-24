import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow access to login, logout pages and static assets
  if (pathname === '/login' || pathname === '/logout' || pathname.startsWith('/_next') || pathname.startsWith('/images')) {
    return NextResponse.next();
  }

  // Check authentication from cookies (we'll set this on login)
  const isAuthenticated = request.cookies.get('isAuthenticated')?.value === 'true';

  // Redirect to login if not authenticated
  if (!isAuthenticated && pathname !== '/login') {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect root to home if authenticated
  if (pathname === '/' && isAuthenticated) {
    const homeUrl = new URL('/home', request.url);
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
