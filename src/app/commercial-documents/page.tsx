import { redirect } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import DocumentWorkbench from '@/components/commercial-documents/DocumentWorkbench';
import { getCurrentUserReadOnly } from '@/lib/auth/current-user';
import { canRoleAccessPage } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export default async function CommercialDocumentsPage() {
  // All authenticated HongdaOS roles may use the template.
  // The login gate remains enforced: this is not a publicly accessible contract editor.
  const user = await getCurrentUserReadOnly();
  if (!user) redirect('/login');
  if (!canRoleAccessPage(user.role, 'commercial_documents')) redirect('/workspace-home');

  return (
    <AppLayout>
      <DocumentWorkbench userName={user.name} userRole={user.role} />
    </AppLayout>
  );
}
