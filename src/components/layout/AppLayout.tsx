'use client';
import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import { APP_VERSION } from '@/lib/version';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto bg-gray-50 relative">
        <div className="absolute top-2 right-2 text-[10px] text-gray-400 z-10">{APP_VERSION}</div>
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
