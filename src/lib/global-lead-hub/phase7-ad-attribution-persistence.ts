/**
 * Phase 7 attribution persistence bootstrap boundary.
 *
 * Repository migration authoring only. It must not execute Production SQL/RLS,
 * connect a real provider, or mutate Production data/environment/secrets.
 */
export const GLH_PHASE7_ATTRIBUTION_PERSISTENCE_SCOPE = {
  taskId: 'GLH-P7-AD-PERSISTENCE-002',
  additiveMigrationOnly: true,
  productionExecution: false,
  providerCalls: false,
  destructiveChanges: false,
} as const;
