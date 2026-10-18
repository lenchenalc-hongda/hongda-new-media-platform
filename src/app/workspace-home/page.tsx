'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  getVisiblePortalGroups,
  isPortalItemEnabled,
  WORKSPACE_PORTAL_STYLES,
} from '@/lib/constants/navigation';
import { isFeatureEnabled, FEATURES } from '@/lib/features';
import EnvStatusBadge from '@/components/system/EnvStatusBadge';
import {
  useCanAccessCustomerProjectCenter,
  useCanAccessCustomerProjectSettings,
  useCanAccessCustomerProjectTeam,
  useCanCreateReview,
  useCurrentUserName,
  useCurrentUserRole,
} from '@/components/layout/RoleProvider';
import { applyCreateVisibility } from '@/lib/review-center/navigation';

function PortalLineIcon({
  portalId,
  className = 'h-5 w-5',
}: {
  portalId: string;
  className?: string;
}) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (portalId === 'media') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <rect x="3.5" y="5" width="17" height="14" rx="2.5" {...common} />
        <path d="m10 9 5 3-5 3V9Z" {...common} />
      </svg>
    );
  }

  if (portalId === 'official') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M4 13.5V10l11-4v11l-11-3.5Z" {...common} />
        <path d="M15 9.5h2.5a2.5 2.5 0 0 1 0 5H15" {...common} />
        <path d="m6.5 14.2 1 4.3h3" {...common} />
      </svg>
    );
  }

  if (portalId === 'knowledge') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" {...common} />
        <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" {...common} />
      </svg>
    );
  }

  if (portalId === 'review') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="m14.5 5.5 4 4" {...common} />
        <path d="m12.5 7.5 4 4" {...common} />
        <path d="M5 19l5.5-5.5 4 4L9 23H5v-4Z" {...common} />
        <path d="m16.5 7.5 2-2a2.8 2.8 0 0 0-4-4l-2 2" {...common} />
      </svg>
    );
  }

  if (portalId === 'sales') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="8" cy="8" r="3" {...common} />
        <circle cx="16.5" cy="9" r="2.5" {...common} />
        <path d="M3.5 19c.5-3.2 2.3-5 4.5-5s4 1.8 4.5 5" {...common} />
        <path d="M13.5 18.5c.4-2.4 1.6-3.8 3.5-3.8 1.8 0 3 1.2 3.5 3.8" {...common} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" {...common} />
      <path d="M19 13.5v-3l-2-.8a7.2 7.2 0 0 0-.6-1.5l.8-2-2.1-2.1-2 .8a7.2 7.2 0 0 0-1.5-.6L10.5 2h-3l-.8 2a7.2 7.2 0 0 0-1.5.6l-2-.8L1.1 5.9l.8 2a7.2 7.2 0 0 0-.6 1.5L-.7 10.5v3l2 .8a7.2 7.2 0 0 0 .6 1.5l-.8 2 2.1 2.1 2-.8a7.2 7.2 0 0 0 1.5.6l.8 2h3l.8-2a7.2 7.2 0 0 0 1.5-.6l2 .8 2.1-2.1-.8-2a7.2 7.2 0 0 0 .6-1.5l2.3-.8Z" {...common} />
    </svg>
  );
}

function ItemLineIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2.25" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 6h6M5 9h4.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type HomeIconName =
  | 'review'
  | 'publish'
  | 'progress'
  | 'health'
  | 'script'
  | 'article'
  | 'knowledge'
  | 'topic'
  | 'import';

function HomeLineIcon({
  name,
  className = 'h-4 w-4',
}: {
  name: HomeIconName;
  className?: string;
}) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (name === 'review') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M3.5 12s3.2-5 8.5-5 8.5 5 8.5 5-3.2 5-8.5 5-8.5-5-8.5-5Z" {...common} />
        <circle cx="12" cy="12" r="2.4" {...common} />
      </svg>
    );
  }

  if (name === 'publish') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="m5 13 4 4L19 7" {...common} />
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4" {...common} />
      </svg>
    );
  }

  if (name === 'progress') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" {...common} />
      </svg>
    );
  }

  if (name === 'health') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M3 12h4l2-4 3.5 8 2.5-5h6" {...common} />
        <circle cx="12" cy="12" r="9" {...common} />
      </svg>
    );
  }

  if (name === 'script' || name === 'article') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M6 3h8l4 4v14H6V3Z" {...common} />
        <path d="M14 3v5h5M9 12h6M9 16h6" {...common} />
      </svg>
    );
  }

  if (name === 'knowledge') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" {...common} />
        <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" {...common} />
      </svg>
    );
  }

  if (name === 'topic') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d="M5 5h14v14H5V5Z" {...common} />
        <path d="M8 9h8M8 13h8M8 17h5" {...common} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" {...common} />
      <path d="M5 18.5h14" {...common} />
    </svg>
  );
}

export default function WorkspaceHome() {
  const canCreateReview = useCanCreateReview();
  const canAccessCustomerProjectCenter = useCanAccessCustomerProjectCenter();
  const canAccessCustomerProjectTeam = useCanAccessCustomerProjectTeam();
  const canAccessCustomerProjectSettings = useCanAccessCustomerProjectSettings();
  const currentUserName = useCurrentUserName();
  const currentUserRole = useCurrentUserRole();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const baseGroups = getVisiblePortalGroups({
    projectReviewCenterEnabled: isFeatureEnabled(FEATURES.PROJECT_REVIEW_CENTER),
    customerProjectCenterEnabled: isFeatureEnabled(FEATURES.CUSTOMER_PROJECT_CENTER),
    canAccessCustomerProjectCenter,
    canAccessCustomerProjectTeam,
    canAccessCustomerProjectSettings,
    currentRole: currentUserRole,
  });
  const enabledGroups = applyCreateVisibility(baseGroups, canCreateReview);
  const totalTodos = enabledGroups.reduce((sum, g) => sum + g.items.length, 0);

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">宏</div>
            <div>
              <h1 className="text-base font-bold text-gray-800">Hongda OS</h1>
              <p className="text-[10px] text-gray-400">宏达印业数字化业务操作系统</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <EnvStatusBadge />
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(open => !open)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
              >
                <span className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-xs text-blue-700 font-semibold">
                  {currentUserName?.charAt(0) || 'U'}
                </span>
                <span className="hidden sm:inline">{currentUserName || '用户'}</span>
                <ChevronDownIcon />
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-44 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
                >
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-700 truncate">{currentUserName || '用户'}</p>
                    <p className="text-[11px] text-gray-400">当前登录账号</p>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={logout}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-xs text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-6 lg:px-8 py-7 space-y-8">
        {/* === FIRST SCREEN: Portal Cards === */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">选择工作门户</h2>
            <span className="text-xs text-gray-400">共 {totalTodos} 个功能模块</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {enabledGroups.map(portal => {
              const styles = WORKSPACE_PORTAL_STYLES[portal.color] ?? WORKSPACE_PORTAL_STYLES.gray;
              const pendingCount = 0;

              return (
                <div
                  key={portal.id}
                  className={`rounded-xl border ${styles.background} overflow-hidden shadow-sm hover:shadow-md transition-all duration-200`}
                >
                  <div className="px-4 pt-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/80 bg-white/70 text-gray-700 shadow-sm">
                          <PortalLineIcon portalId={portal.id} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-gray-900 font-bold text-base leading-6">{portal.label}</h3>
                          <p className="text-gray-500 text-xs mt-0.5 leading-5">{portal.description}</p>
                        </div>
                      </div>

                      {pendingCount > 0 && (
                        <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                          {pendingCount}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="px-3.5 pb-3.5">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 mb-2">
                      <span>{portal.items.length} 个模块</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      {portal.items.slice(0, 4).map(item => {
                        if (!isPortalItemEnabled(item)) {
                          return (
                            <span
                              key={item.path}
                              aria-disabled="true"
                              title="暂未开放"
                              className="flex items-center gap-1.5 text-xs text-gray-300 px-2 py-1.5 rounded-lg bg-white/45 cursor-not-allowed"
                            >
                              <ItemLineIcon />
                              <span className="truncate">{item.label}</span>
                            </span>
                          );
                        }

                        return (
                          <Link
                            key={item.path}
                            href={item.path}
                            className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-blue-700 px-2 py-1.5 rounded-lg bg-white/55 hover:bg-white transition-colors no-underline"
                          >
                            <ItemLineIcon />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        );
                      })}

                      {portal.items.length > 4 && (
                        <span className="text-[11px] text-gray-400 px-2 py-1.5">
                          +{portal.items.length - 4} 更多
                        </span>
                      )}
                    </div>

                    <div className="pt-2.5">
                      <Link
                        href={portal.items[0]?.path || '#'}
                        className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors no-underline ${styles.button}`}
                      >
                        进入{portal.label}
                        <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {currentUserRole !== 'sales' && (
          <>
          {/* === FOURTH SCREEN: Quick Actions === */}
          <section>
            <h2 className="text-lg font-bold text-gray-800 mb-4">快速新建</h2>
            <div className="flex flex-wrap gap-3">
              {[
                { label: '新建脚本', icon: 'script' as HomeIconName, path: '/scripts', color: 'text-blue-700 hover:border-blue-200 hover:bg-blue-50' },
                { label: '新建文章', icon: 'article' as HomeIconName, path: '/official/article-factory', color: 'text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50' },
                { label: '新建知识卡', icon: 'knowledge' as HomeIconName, path: '/knowledge', color: 'text-purple-700 hover:border-purple-200 hover:bg-purple-50' },
                { label: '新建选题', icon: 'topic' as HomeIconName, path: '/topics', color: 'text-amber-700 hover:border-amber-200 hover:bg-amber-50' },
                { label: '导入CSV', icon: 'import' as HomeIconName, path: '/settings', color: 'text-gray-700 hover:border-gray-300 hover:bg-gray-50' },
              ].map(btn => (
                <Link
                  key={btn.label}
                  href={btn.path}
                  className={`inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium shadow-sm transition-colors no-underline ${btn.color}`}
                >
                  <HomeLineIcon name={btn.icon} className="h-4 w-4" />
                  {btn.label}
                </Link>
              ))}
            </div>
          </section>
  
          </>
        )}
      </main>
    </div>
  );
}
