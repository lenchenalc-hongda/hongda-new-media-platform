'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, getStatusBadgeClass } from '@/lib/utils';
import { NAV_ITEMS } from '@/lib/constants';

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (path: string) => pathname.startsWith(path);

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
      <div className="px-4 py-4 border-b border-gray-200">
        <Link href="/dashboard" className="text-lg font-bold text-gray-800 no-underline">
          宏达新媒体
        </Link>
        <p className="text-xs text-gray-500 mt-0.5">作战中台</p>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm transition-colors no-underline',
              isActive(item.path)
                ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
            )}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-gray-200 text-xs text-gray-400">
        v0.1 MVP
      </div>
    </aside>
  );
}
