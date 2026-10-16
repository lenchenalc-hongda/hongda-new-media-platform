import TeamClient from './TeamClient';
import { readTeamBoardSnapshot } from '@/lib/customer-projects/team-board-server';

export const dynamic = 'force-dynamic';

export default async function CustomerProjectTeamPage() {
  const result = await readTeamBoardSnapshot();

  return (
    <TeamClient
      snapshot={result.ok ? result.data : null}
      error={result.ok ? '' : result.message}
    />
  );
}
