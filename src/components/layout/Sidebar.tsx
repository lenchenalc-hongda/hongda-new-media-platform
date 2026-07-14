'use client';
import { APP_VERSION } from "@/lib/version";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PORTAL_GROUPS, getPortalForPath } from '@/lib/constants/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  // Determine which portal is active based on current path
  const activePortal = getPortalForPath(pathname);
  const [expandedPortal, setExpandedPortal] = useState<string>(activePortal);

  const isHome = pathname === '/workspace-home';
  const portalColors: Record<string, string> = {
    media: 'border-l-blue-500 bg-blue-50 text-blue-700',
    official: 'border-l-emerald-500 bg-emerald-50 text-emerald-700',
    knowledge: 'border-l-purple-500 bg-purple-50 text-purple-700',
    admin: 'border-l-gray-500 bg-gray-100 text-gray-700',
  };

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0 overflow-hidden">
      {/* Brand */}
      <div className="px-4 py-3 border-b border-gray-200">
        <Link href="/workspace-home" className="flex items-center gap-2 no-underline">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">宏</div>
          <div>
            <p className="text-sm font-bold text-gray-800 leading-tight">宏达新媒体</p>
            <p className="text-[10px] text-gray-500">作战中台</p>
          </div>
        </Link>
      </div>

      {/* Portal Groups */}
      <nav className="flex-1 overflow-y-auto py-1">
        {/* Home link */}
        <Link href="/workspace-home"
          className={cn('flex items-center gap-2 px-4 py-2 text-sm transition-colors no-underline mx-2 rounded-lg',
            isHome ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50')}>
          <span className="text-base">🏠</span>
          <span>首页</span>
        </Link>

        <div className="h-px bg-gray-100 mx-4 my-1" />

        {PORTAL_GROUPS.map(portal => {
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
                    const isActive = pathname === item.path || pathname.startsWith(item.path);
                    return (
                      <Link key={item.path} href={item.path}
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
        <span>{APP_VERSION}</span>
        <Link href="/workspace-home" className="hover:text-blue-600 no-underline text-gray-400">首页</Link>
      </div>
    </aside>
  );
}
