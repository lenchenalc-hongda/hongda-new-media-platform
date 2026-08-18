import type { Metadata } from 'next';
import { RoleProvider } from '@/components/layout/RoleProvider';
import { getCurrentUserReadOnly } from '@/lib/auth/current-user';
import { canCreateReview } from '@/lib/review-center/permissions';
import './globals.css';

export const metadata: Metadata = {
  title: '宏达新媒体作战中台',
  description: '广东宏达印业内部新媒体运营管理系统',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let canCreate = false;
  try {
    const user = await getCurrentUserReadOnly();
    if (user) canCreate = canCreateReview(user.role);
  } catch {}

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <RoleProvider canCreateReview={canCreate}>{children}</RoleProvider>
      </body>
    </html>
  );
}
