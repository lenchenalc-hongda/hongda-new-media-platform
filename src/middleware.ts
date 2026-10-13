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
import { logAuthPerformance } from '@/lib/auth/performance';

const PUBLIC_ROUTES = [
  '/login',
  '/_next',
  '/api/auth',
  '/api/health',
  '/favicon.ico',
  '/api/ai',
];

// These API routes enforce trusted Supabase identity and CPC authorization
// inside every route handler. Skipping the page middleware here avoids doing
// the same remote auth/profile lookup twice for a single CPC data request.
const SELF_AUTHENTICATED_API_PREFIXES = [
  '/api/customer-projects',
];

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

  // Feature flag: customer project center must be explicitly enabled
  if (pathname.startsWith('/customer-projects') && !isFeatureEnabled(FEATURES.CUSTOMER_PROJECT_CENTER)) {
    const featureOffUrl = new URL('/dashboard', request.url);
    featureOffUrl.searchParams.set('error', '客户项目中心尚未开放');
    return NextResponse.redirect(featureOffUrl);
  }

  // Skip static assets and APIs that enforce their own trusted authorization.
  if (
    pathname.startsWith('/_next')
    || pathname === '/favicon.ico'
    || SELF_AUTHENTICATED_API_PREFIXES.some(prefix => pathname.startsWith(prefix))
  ) {
    return NextResponse.next();
  }

  // Resolve trusted user through unified bridge (mock or supabase)
  let user = null;
  let authResponse = NextResponse.next({ request });
  const isCpcPageRequest = pathname.startsWith('/customer-projects');
  const authStartedAt = Date.now();
  try {
    const resolved = await getCurrentUserAndResponseFromRequest(request);
    user = resolved.user;
    authResponse = resolved.response;
    if (isCpcPageRequest) {
      logAuthPerformance({
        scope: 'middleware-cpc',
        startedAt: authStartedAt,
        outcome: user ? 'ok' : 'anonymous',
      });
    }
  } catch (err) {
    if (isCpcPageRequest) {
      logAuthPerformance({
        scope: 'middleware-cpc',
        startedAt: authStartedAt,
        outcome: err instanceof AuthError && err.code === 'AUTH_CONFIG_MISSING'
          ? 'config_error'
          : 'error',
      });
    }
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
