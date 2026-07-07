// ===== Route Guard Middleware =====
// Protects app routes by checking for nmc_user cookie (set by login)
// and validating role-based page access.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { deserializeUser, AuthUser, getPageSlugFromRoute, canAccessPage } from '@/lib/auth/roles';

const PUBLIC_ROUTES = ['/login', '/_next', '/api/auth', '/favicon.ico', '/api/ai'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public routes
  if (PUBLIC_ROUTES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Skip static assets and API routes that don't need auth
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  // Read auth cookie
  const userCookie = request.cookies.get('nmc_user')?.value;
  let user: AuthUser | null = null;
  if (userCookie) {
    user = deserializeUser(userCookie);
  }

  // Not authenticated → redirect to login
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check page-level role access
  const pageSlug = getPageSlugFromRoute(pathname);
  if (pageSlug && !canAccessPage(user, pageSlug)) {
    // No access → redirect to dashboard with error message
    const dashboardUrl = new URL('/dashboard', request.url);
    dashboardUrl.searchParams.set('error', '您没有访问该页面的权限');
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/ai|_next/static|_next/image|favicon.ico).*)',
  ],
};
