import WorkbenchClient from './WorkbenchClient';
import { readWorkbenchSnapshot } from '@/lib/customer-projects/server-reads';

export const dynamic = 'force-dynamic';

export default async function CustomerProjectsPage() {
  const result = await readWorkbenchSnapshot();

  return (
    <WorkbenchClient
      initialSnapshot={result.ok ? result.data : null}
      initialError={result.ok ? '' : result.message}
    />
  );
}
