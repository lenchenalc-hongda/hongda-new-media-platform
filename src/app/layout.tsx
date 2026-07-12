import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '宏达新媒体作战中台',
  description: '广东宏达印业内部新媒体运营管理系统',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
