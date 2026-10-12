import ProjectsClient from './ProjectsClient';
import { readProjectList } from '@/lib/customer-projects/server-reads';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const result = await readProjectList();

  return (
    <ProjectsClient
      initialProjects={result.ok ? result.data : []}
      initialError={result.ok ? '' : result.message}
    />
  );
}
