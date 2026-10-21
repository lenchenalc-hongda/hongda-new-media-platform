import { redirect } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import MonthlyStatementWorkbench from '@/components/commercial-documents/MonthlyStatementWorkbench';
import { getCurrentUserReadOnly } from '@/lib/auth/current-user';
import { canRoleAccessPage } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export default async function MonthlyStatementPage() {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect('/login');
  if (!canRoleAccessPage(user.role, 'commercial_documents')) redirect('/workspace-home');
  return <AppLayout><MonthlyStatementWorkbench userName={user.name} /></AppLayout>;
}
