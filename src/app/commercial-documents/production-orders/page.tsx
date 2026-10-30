import { redirect } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import SupplierProductionOrderWorkbench from '@/components/commercial-documents/SupplierProductionOrderWorkbench';
import { getCurrentUserReadOnly } from '@/lib/auth/current-user';
import { canRoleAccessPage } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';
export default async function SupplierProductionOrderPage() {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect('/login');
  if (!canRoleAccessPage(user.role, 'commercial_documents')) redirect('/workspace-home');
  return <AppLayout><SupplierProductionOrderWorkbench userName={user.name} /></AppLayout>;
}
