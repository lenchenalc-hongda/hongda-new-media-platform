import TasksClient from './TasksClient';
import { readTaskList } from '@/lib/customer-projects/server-reads';

export const dynamic = 'force-dynamic';

export default async function CustomerProjectTasksPage() {
  const result = await readTaskList();

  return (
    <TasksClient
      initialTasks={result.ok ? result.data : []}
      initialError={result.ok ? '' : result.message}
    />
  );
}
