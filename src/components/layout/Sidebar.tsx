'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  getActiveNavItemPath,
  getPortalForPath,
  getVisiblePortalGroups,
} from '@/lib/constants/navigation';
import { isFeatureEnabled, FEATURES } from '@/lib/features';
import { APP_VERSION } from '@/lib/version';
import {
  useCanAccessCustomerProjectCenter,
  useCanAccessCustomerProjectSettings,
  useCanAccessCustomerProjectTeam,
  useCanCreateReview,
  useCurrentUserRole,
} from './RoleProvider';
import { applyCreateVisibility } from '@/lib/review-center/navigation';

export default function Sidebar() {
  const pathname = usePathname();
  const canCreateReview = useCanCreateReview();
  const canAccessCustomerProjectCenter = useCanAccessCustomerProjectCenter();
  const canAccessCustomerProjectTeam = useCanAccessCustomerProjectTeam();
  const canAccessCustomerProjectSettings = useCanAccessCustomerProjectSettings();
  const currentUserRole = useCurrentUserRole();

  // Determine which portal is active based on current path
  const baseGroups = getVisiblePortalGroups({
    projectReviewCenterEnabled: isFeatureEnabled(FEATURES.PROJECT_REVIEW_CENTER),
    customerProjectCenterEnabled: isFeatureEnabled(FEATURES.CUSTOMER_PROJECT_CENTER),
    canAccessCustomerProjectCenter,
    canAccessCustomerProjectTeam,
    canAccessCustomerProjectSettings,
    currentRole: currentUserRole,
  });
  const enabledGroups = applyCreateVisibility(baseGroups, canCreateReview);
  const activePortal = getPortalForPath(pathname);
  const [expandedPortal, setExpandedPortal] = useState<string>(activePortal);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const wasMobileOpenRef = useRef(false);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => {
      setIsMobileViewport(query.matches);
      if (!query.matches) setMobileOpen(false);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen || !isMobileViewport) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileViewport, mobileOpen]);

  useEffect(() => {
    if (!mobileOpen || !isMobileViewport) return;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !sidebarRef.current) return;
      const focusable = Array.from(sidebarRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter(element => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileViewport, mobileOpen]);

  useEffect(() => {
    if (wasMobileOpenRef.current && !mobileOpen && isMobileViewport) {
      window.requestAnimationFrame(() => {
        (previouslyFocusedRef.current ?? openButtonRef.current)?.focus();
      });
    }
    wasMobileOpenRef.current = mobileOpen;
  }, [isMobileViewport, mobileOpen]);

  const openMobileNav = () => {
    if (!isMobileViewport) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setMobileOpen(true);
  };

  const closeMobileNav = () => {
    setMobileOpen(false);
  };

  const isHome = pathname === '/workspace-home';
  const portalColors: Record<string, string> = {
    media: 'border-l-blue-500 bg-blue-50 text-blue-700',
    official: 'border-l-emerald-500 bg-emerald-50 text-emerald-700',
    knowledge: 'border-l-purple-500 bg-purple-50 text-purple-700',
    admin: 'border-l-gray-500 bg-gray-100 text-gray-700',
    review: 'border-l-orange-500 bg-orange-50 text-orange-700',
    sales: 'border-l-cyan-500 bg-cyan-50 text-cyan-700',
    commercial: 'border-l-red-600 bg-red-50 text-red-800',
    glh: 'border-l-emerald-600 bg-emerald-50 text-emerald-800',
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-3 md:hidden">
        <button
          type="button"
          ref={openButtonRef}
          id="mobile-navigation-trigger"
          aria-label="打开主导航"
          aria-expanded={mobileOpen}
          aria-controls="app-sidebar"
          onClick={openMobileNav}
          className="flex h-10 w-10 items-center justify-center rounded-md border border-gray-200 text-gray-700"
        >
          <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/workspace-home" className="flex min-w-0 items-center gap-2 no-underline">
          <img src="/hongda-os-original-emblem.png" alt="" className="h-7 w-7 shrink-0 object-contain" width={28} height={28} />
          <span className="truncate text-sm font-bold text-gray-800">Hongda OS</span>
        </Link>
        <span className="ml-auto text-[10px] text-gray-400">{APP_VERSION}</span>
      </header>

      <button
        type="button"
        aria-label="关闭主导航遮罩"
        onClick={closeMobileNav}
        className={cn(
          'fixed inset-0 z-40 bg-black/30 md:hidden',
          mobileOpen ? 'block' : 'hidden',
        )}
      />

      {(!isMobileViewport || mobileOpen) && (
        <aside
          ref={sidebarRef}
          id="app-sidebar"
          aria-label="主导航"
          role={isMobileViewport && mobileOpen ? 'dialog' : undefined}
          aria-modal={isMobileViewport && mobileOpen ? true : undefined}
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-56 flex-col overflow-hidden border-r border-gray-200 bg-white shadow-xl transition-transform duration-200 md:static md:z-auto md:h-screen md:translate-x-0 md:shadow-none',
            mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full md:visible',
          )}
        >
      {/* Brand */}
      <div className="flex items-center border-b border-gray-200 px-4 py-3">
        <Link href="/workspace-home" onClick={closeMobileNav} className="flex items-center gap-2 no-underline">
          <img src="/hongda-os-original-emblem.png" alt="宏达印业 Logo" className="w-7 h-7 object-contain shrink-0" width={28} height={28} />
          <div>
            <p className="text-sm font-bold text-gray-800 leading-tight">Hongda OS</p>
            <p className="text-[10px] text-gray-500">宏达印业数字化业务系统</p>
          </div>
        </Link>
        <button
          type="button"
          ref={closeButtonRef}
          aria-label="关闭主导航"
          onClick={closeMobileNav}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-md text-gray-500 md:hidden"
        >
          <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Portal Groups */}
      <nav className="flex-1 overflow-y-auto py-1">
        {/* Home link */}
        <Link href="/workspace-home"
          onClick={closeMobileNav}
          className={cn('flex items-center gap-2 px-4 py-2 text-sm transition-colors no-underline mx-2 rounded-lg',
            isHome ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50')}>
          <span className="text-base">🏠</span>
          <span>首页</span>
        </Link>

        <div className="h-px bg-gray-100 mx-4 my-1" />

        {enabledGroups.map(portal => {
          const isActiveGroup = activePortal === portal.id;
          const isExpanded = expandedPortal === portal.id;

          return (
            <div key={portal.id} className="mb-0.5">
              {/* Portal header */}
              <button
                onClick={() => setExpandedPortal(isExpanded ? '' : portal.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-4 py-2 text-xs font-medium transition-colors no-underline group',
                  isActiveGroup ? 'text-gray-800' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <span className="text-sm">{portal.icon}</span>
                <span className="flex-1 text-left">{portal.label}</span>
                <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Portal items */}
              {isExpanded && (
                <div className="ml-1 space-y-0.5">
                  {portal.items.map(item => {
                    const activeItemPath = getActiveNavItemPath(pathname, portal.items);
                    const isActive = activeItemPath === item.path;
                    if (item.disabled) {
                      return (
                        <div
                          key={item.path}
                          aria-disabled="true"
                          title="暂未开放"
                          className="flex items-center gap-2 px-4 py-1.5 text-xs border-l-2 border-l-transparent ml-4 text-gray-300 cursor-not-allowed"
                        >
                          <span>{item.icon}</span>
                          <span className="flex-1">{item.label}</span>
                          <span className="text-[10px] text-gray-400">暂未开放</span>
                        </div>
                      );
                    }
                    return (
                      <Link key={item.path} href={item.path}
                        onClick={closeMobileNav}
                        className={cn(
                          'flex items-center gap-2 px-4 py-1.5 text-xs transition-colors no-underline border-l-2 ml-4',
                          isActive
                            ? portalColors[portal.id]
                            : 'border-l-transparent text-gray-500 hover:text-gray-700 hover:border-l-gray-300'
                        )}>
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-4 py-2 border-t border-gray-200 text-[10px] text-gray-400 flex items-center justify-between">
        <span>宏达印业</span>
        <div className="flex items-center gap-2">
          <Link href="/workspace-home" onClick={closeMobileNav} className="hover:text-blue-600 no-underline text-gray-400">首页</Link>
          <button
            type="button"
            onClick={async () => {
              try {
                await fetch('/api/auth/logout', { method: 'POST' });
              } catch {}
              window.location.href = '/login';
            }}
            className="hover:text-red-600 no-underline text-gray-400"
          >
            退出
          </button>
        </div>
      </div>
        </aside>
      )}
    </>
  );
}
