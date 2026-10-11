/**
 * Agent Control bootstrap for GLH-P6-FOLLOWUP-DASHBOARD-001.
 *
 * The implementation runner must replace this bounded contract with the
 * repository-backed Phase 6 read model, UI, and focused tests. No Production
 * mutation or provider integration is authorized by this file.
 */
export const GLH_PHASE6_FOLLOWUP_DASHBOARD_SCOPE = {
  taskId: 'GLH-P6-FOLLOWUP-DASHBOARD-001',
  views: ['TODAY', 'OVERDUE', 'UPCOMING', 'DORMANT'] as const,
  managerMetrics: [
    'NEW_LEADS',
    'WAITING_FOR_HUMAN',
    'DUE_TODAY',
    'OVERDUE',
    'DORMANT',
  ] as const,
  sourceOfTruth: 'SUPABASE_POSTGRES',
  productionChanged: false,
  providerCallsAllowed: false,
} as const;
