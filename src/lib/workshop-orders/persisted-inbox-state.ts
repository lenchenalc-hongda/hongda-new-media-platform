import type {
  WosInboxItem,
  WosInboxReadDetail,
} from './api-contract';

export interface WosInboxVersionIdentity {
  readonly entityType: WosInboxItem['entityType'];
  readonly id: string;
  readonly version: number;
  readonly versionLabel: string;
  readonly workflowStatus: string;
}

export interface WosInboxEvidenceState {
  readonly details: Record<string, WosInboxReadDetail>;
  readonly expanded: Record<string, boolean>;
  readonly loading: Record<string, boolean>;
  readonly errors: Record<string, string>;
}

export function emptyWosInboxEvidenceState(): WosInboxEvidenceState {
  return { details: {}, expanded: {}, loading: {}, errors: {} };
}

export function wosInboxVersionIdentity(item: WosInboxItem): WosInboxVersionIdentity {
  return {
    entityType: item.entityType,
    id: item.id,
    version: item.version,
    versionLabel: item.versionLabel,
    workflowStatus: item.workflowStatus,
  };
}

export function wosInboxVersionKey(identity: WosInboxVersionIdentity): string {
  return JSON.stringify([
    identity.entityType,
    identity.id,
    identity.version,
    identity.versionLabel,
    identity.workflowStatus,
  ]);
}

export function sameWosInboxVersion(
  left: WosInboxVersionIdentity | null | undefined,
  right: WosInboxVersionIdentity | null | undefined,
): boolean {
  return Boolean(left && right
    && left.entityType === right.entityType
    && left.id === right.id
    && left.version === right.version
    && left.versionLabel === right.versionLabel
    && left.workflowStatus === right.workflowStatus);
}

export function wosInboxDetailMatchesItem(
  detail: WosInboxReadDetail | null | undefined,
  item: WosInboxItem | null | undefined,
): detail is WosInboxReadDetail {
  if (!detail || !item || detail.canStart !== false) return false;
  if (!sameWosInboxVersion(wosInboxVersionIdentity(detail.item), wosInboxVersionIdentity(item))) {
    return false;
  }
  return detail.production.id === item.id
    && detail.production.organization_id === item.organizationId
    && detail.production.version === item.version
    && detail.production.version_label === item.versionLabel
    && detail.production.workflow_status === item.workflowStatus;
}

export function shouldApplyWosInboxListResponse(input: {
  readonly responseGeneration: number;
  readonly currentGeneration: number;
}): boolean {
  return Number.isSafeInteger(input.responseGeneration)
    && Number.isSafeInteger(input.currentGeneration)
    && input.responseGeneration === input.currentGeneration;
}

export function canApplyWosInboxDetailResponse(input: {
  readonly requestListGeneration: number;
  readonly currentListGeneration: number;
  readonly requestDetailGeneration: number;
  readonly currentDetailGeneration: number | undefined;
  readonly expectedItem: WosInboxItem;
  readonly currentItem: WosInboxItem | null | undefined;
  readonly detail: WosInboxReadDetail | null | undefined;
}): input is typeof input & { readonly detail: WosInboxReadDetail } {
  return input.requestListGeneration === input.currentListGeneration
    && input.requestDetailGeneration === input.currentDetailGeneration
    && Boolean(input.currentItem)
    && sameWosInboxVersion(
      wosInboxVersionIdentity(input.expectedItem),
      wosInboxVersionIdentity(input.currentItem as WosInboxItem),
    )
    && wosInboxDetailMatchesItem(input.detail, input.currentItem);
}
