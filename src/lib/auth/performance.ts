export type AuthPerfOutcome =
  | 'ok'
  | 'anonymous'
  | 'unavailable'
  | 'config_error'
  | 'error';

export function logAuthPerformance(input: {
  scope: 'middleware-cpc' | 'server-readonly';
  startedAt: number;
  outcome: AuthPerfOutcome;
}) {
  console.info('[auth-perf]', JSON.stringify({
    scope: input.scope,
    outcome: input.outcome,
    totalMs: Math.max(0, Date.now() - input.startedAt),
  }));
}
