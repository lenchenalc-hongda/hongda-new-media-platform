import ReminderCenterClient from './ReminderCenterClient';
import { readProjectReminderSnapshot } from '@/lib/customer-projects/project-reminder-center-server';

export const dynamic = 'force-dynamic';

export default async function ProjectRemindersPage() {
  const result = await readProjectReminderSnapshot();

  return (
    <ReminderCenterClient
      initialSnapshot={result.ok ? result.data : null}
      initialError={result.ok ? '' : result.message}
      isManagement={result.ok ? result.isManagement : false}
    />
  );
}
