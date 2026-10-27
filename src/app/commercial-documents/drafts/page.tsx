import { redirect } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import DocumentWorkbench from '@/components/commercial-documents/DocumentWorkbench';
import { getCurrentUserReadOnly } from '@/lib/auth/current-user';
import { canRoleAccessPage } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/** Dedicated sidebar destination: opens the existing cloud draft box on arrival. */
export default async function CommercialDraftsPage() {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect('/login');
  if (!canRoleAccessPage(user.role, 'commercial_documents')) redirect('/workspace-home');
  return (
    <AppLayout>
      <DocumentWorkbench
        userName={user.name}
        userRole={user.role}
        initialCloudListOpen
      />
    </AppLayout>
  );
}
