import { redirect, notFound } from 'next/navigation';
import { supplierOrdersEnabled } from '@/lib/commercial-supplier-orders/availability';
import AppLayout from '@/components/layout/AppLayout';
import SupplierProductionOrderWorkbench from '@/components/commercial-documents/SupplierProductionOrderWorkbench';
import { getCurrentUserReadOnly } from '@/lib/auth/current-user';
import { canRoleAccessPage } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';
export default async function SupplierProductionOrderPage() {
  if (!supplierOrdersEnabled()) notFound();
  const user = await getCurrentUserReadOnly();
  if (!user) redirect('/login');
  if (!canRoleAccessPage(user.role, 'commercial_documents')) redirect('/workspace-home');
  return <AppLayout><SupplierProductionOrderWorkbench userName={user.name} /></AppLayout>;
}
