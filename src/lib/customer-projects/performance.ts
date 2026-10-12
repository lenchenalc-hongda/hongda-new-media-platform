import 'server-only';

type PerfOutcome = 'ok' | 'db_unavailable' | 'unauthorized' | 'forbidden' | 'limit' | 'error';

type PerfCounts = Record<string, number>;

export function createCpcReadTiming(view: string) {
  const startedAt = Date.now();
  const stages: Record<string, number> = {};

  return {
    mark(stage: string, stageStartedAt: number) {
      stages[stage] = Math.max(0, Date.now() - stageStartedAt);
    },
    finish(outcome: PerfOutcome, counts: PerfCounts = {}) {
      console.info('[cpc-perf]', JSON.stringify({
        view,
        outcome,
        totalMs: Math.max(0, Date.now() - startedAt),
        stages,
        counts,
      }));
    },
  };
}
