// ===== Route Guard Middleware =====
// Protects app routes by checking for nmc_user cookie (set by login)
// and validating role-based page access.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getPageSlugFromRoute, canAccessPage } from '@/lib/auth/roles';
import { getCurrentUserAndResponseFromRequest } from '@/lib/auth/current-user';
import { AuthError } from '@/lib/auth/types';
import { isFeatureEnabled, FEATURES } from '@/lib/features';
import { copyResponseCookies } from '@/lib/supabase/middleware';

const PUBLIC_ROUTES = ['/login', '/_next', '/api/auth', '/favicon.ico', '/api/ai'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public routes
  if (PUBLIC_ROUTES.some(prefix => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Feature flag: project review center must be explicitly enabled
  if (pathname.startsWith('/review-center') && !isFeatureEnabled(FEATURES.PROJECT_REVIEW_CENTER)) {
    const featureOffUrl = new URL('/dashboard', request.url);
    featureOffUrl.searchParams.set('error', '项目复盘与改善中心尚未开放');
    return NextResponse.redirect(featureOffUrl);
  }

  // Skip static assets and API routes that don't need auth
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  // Resolve trusted user through unified bridge (mock or supabase)
  let user = null;
  let authResponse = NextResponse.next({ request });
  try {
    const resolved = await getCurrentUserAndResponseFromRequest(request);
    user = resolved.user;
    authResponse = resolved.response;
  } catch (err) {
    if (err instanceof AuthError && err.code === 'AUTH_CONFIG_MISSING') {
      const cfgUrl = new URL('/login', request.url);
      cfgUrl.searchParams.set('error', 'auth_config_missing');
      return NextResponse.redirect(cfgUrl);
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return copyResponseCookies(authResponse, NextResponse.redirect(loginUrl));
  }

  // Not authenticated → redirect to login
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return copyResponseCookies(authResponse, NextResponse.redirect(loginUrl));
  }

  // Check page-level role access (map CurrentUser -> AuthUser shape)
  const pageSlug = getPageSlugFromRoute(pathname);
  const authUser = user ? {
    id: user.id, full_name: user.name, email: user.email ?? '', role: user.role, org_id: '', department: user.department,
  } : null;
  if (pageSlug && authUser && !canAccessPage(authUser, pageSlug)) {
    // No access → redirect to dashboard with error message
    const dashboardUrl = new URL('/dashboard', request.url);
    dashboardUrl.searchParams.set('error', '您没有访问该页面的权限');
    return copyResponseCookies(authResponse, NextResponse.redirect(dashboardUrl));
  }

  return authResponse;
}

export const config = {
  matcher: [
    '/((?!api/ai|_next/static|_next/image|favicon.ico).*)',
  ],
};
