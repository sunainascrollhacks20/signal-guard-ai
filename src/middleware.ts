import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicPaths = ['/login', '/api/auth/login'];
const apiPaths = ['/api'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow API routes to handle their own auth
  if (apiPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Allow public paths
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionToken = request.cookies.get('signalguard_session');

  // If no session and trying to access protected route, redirect to login
  if (!sessionToken && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If has session and trying to access login, redirect to dashboard
  if (sessionToken && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
