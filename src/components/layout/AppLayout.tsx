'use client';
import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import { APP_VERSION } from '@/lib/version';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto bg-gray-50 p-4 pt-20 relative md:p-6">
        <div className="absolute top-2 right-2 z-10 hidden text-[10px] text-gray-400 md:block">{APP_VERSION}</div>
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
