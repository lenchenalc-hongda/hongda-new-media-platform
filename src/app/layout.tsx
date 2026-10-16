import type { Metadata } from 'next';
import { RoleProvider } from '@/components/layout/RoleProvider';
import { getCurrentUserReadOnlyCached } from '@/lib/auth/current-user';
import { canRoleAccessPage } from '@/lib/auth/roles';
import { canCreateReview } from '@/lib/review-center/permissions';
import { canReviewSubmittedDailyReports } from '@/lib/customer-projects/report-review';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hongda OS',
  description: '宏达印业数字化业务操作系统',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let canCreate = false;
  let canAccessCustomerProjectCenter = false;
  let canAccessCustomerProjectTeam = false;
  let canAccessCustomerProjectSettings = false;
  let canReviewDailyReports = false;
  try {
    const user = await getCurrentUserReadOnlyCached();
    if (user) {
      canCreate = canCreateReview(user.role);
      canAccessCustomerProjectCenter = canRoleAccessPage(
        user.role,
        'customer_project_center',
      );
      canAccessCustomerProjectTeam = canRoleAccessPage(
        user.role,
        'customer_project_center_team',
      );
      canAccessCustomerProjectSettings = canRoleAccessPage(
        user.role,
        'customer_project_center_settings',
      );
      canReviewDailyReports = canReviewSubmittedDailyReports(user.role);
    }
  } catch {}

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <RoleProvider
          canCreateReview={canCreate}
          canAccessCustomerProjectCenter={canAccessCustomerProjectCenter}
          canAccessCustomerProjectTeam={canAccessCustomerProjectTeam}
          canAccessCustomerProjectSettings={canAccessCustomerProjectSettings}
          canReviewDailyReports={canReviewDailyReports}
        >
          {children}
        </RoleProvider>
      </body>
    </html>
  );
}
