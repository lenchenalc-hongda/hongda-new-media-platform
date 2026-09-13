import type { CaseAuditItem } from './case-schemas';

export type AuditRequestKind = 'PAGE_1' | 'REFRESH' | 'LOAD_MORE';

export type AuditRequestPlan = 'START' | 'BLOCK' | 'SUPERSEDE';

export interface AuditInflightRequest {
  requestId: number;
  kind: AuditRequestKind;
  controller: AbortController;
}

export function planAuditRequest(
  currentKind: AuditRequestKind | null,
  requestedKind: AuditRequestKind,
): AuditRequestPlan {
  if (currentKind === null) return 'START';
  if (currentKind === requestedKind) return 'BLOCK';
  if (requestedKind === 'REFRESH' && currentKind === 'LOAD_MORE') return 'SUPERSEDE';
  return 'BLOCK';
}

export function canReleaseAuditRequest(
  currentRequestId: number | null,
  ownRequestId: number,
): boolean {
  return currentRequestId === ownRequestId;
}

export function canCommitAuditResponse(
  capturedCaseVersion: number,
  latestCaseVersion: number,
  capturedGeneration: number,
  currentGeneration: number,
  ownRequestId: number,
  currentRequestId: number | null,
): boolean {
  return capturedCaseVersion === latestCaseVersion
    && capturedGeneration === currentGeneration
    && ownRequestId === currentRequestId;
}

export function nextAuditOffset(
  responseOffset: number,
  returnedItemCount: number,
): number {
  return responseOffset + returnedItemCount;
}

export function appendAuditItems(
  existing: CaseAuditItem[],
  incoming: CaseAuditItem[],
): CaseAuditItem[] {
  return [...existing, ...incoming];
}

export function shouldRefetchAuditPage1(
  loadedForCaseVersion: number | null,
  currentCaseVersion: number,
  items: CaseAuditItem[],
): boolean {
  if (loadedForCaseVersion === null) return true;
  if (loadedForCaseVersion !== currentCaseVersion) return true;
  return items.length === 0;
}
