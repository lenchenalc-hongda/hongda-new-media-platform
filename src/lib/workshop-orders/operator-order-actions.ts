import type {
  WosInboxItem,
  WosInboxReadDetail,
} from './api-contract';

export const WOS_OPERATOR_WORKFLOW_ACTIONS = [
  'ACCEPT',
  'RETURN_FOR_INFORMATION',
  'REVIEW_CORRECTION',
] as const;

export type WosOperatorWorkflowAction =
  (typeof WOS_OPERATOR_WORKFLOW_ACTIONS)[number];

export interface WosOperatorWorkflowActionOption {
  readonly action: WosOperatorWorkflowAction;
  readonly label: string;
  readonly description: string;
  readonly defaultNote: string;
}

const OPTIONS: Readonly<Record<WosOperatorWorkflowAction, WosOperatorWorkflowActionOption>> = {
  ACCEPT: {
    action: 'ACCEPT',
    label: '确认接单',
    description: '接单只进入车间审阅，不代表准许开工。',
    defaultNote: '已核对当前版本订单资料，确认接单并进入车间审阅。',
  },
  RETURN_FOR_INFORMATION: {
    action: 'RETURN_FOR_INFORMATION',
    label: '退回补资料',
    description: '必须写明需要办公室补充或更正的具体内容。',
    defaultNote: '',
  },
  REVIEW_CORRECTION: {
    action: 'REVIEW_CORRECTION',
    label: '复核最新修订',
    description: '核对办公室重新提交的当前版本，并解除对应资料阻塞。',
    defaultNote: '已核对办公室重新提交的当前版本及退回原因，确认进入物料准备。',
  },
};

function metadataInteger(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function metadataRequestId(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const value = metadata?.requestId ?? metadata?.idempotencyKey;
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export function hasCurrentWosResubmission(
  item: Pick<
    WosInboxItem,
    'entityType' | 'id' | 'version' | 'versionLabel' | 'workflowStatus'
  >,
  detail: Pick<WosInboxReadDetail, 'item' | 'history'>,
): boolean {
  if (item.entityType !== 'PRODUCTION_ORDER'
    || detail.item.entityType !== item.entityType
    || detail.item.id !== item.id
    || detail.item.version !== item.version
    || detail.item.versionLabel !== item.versionLabel
    || detail.item.workflowStatus !== item.workflowStatus
    || item.workflowStatus !== 'WORKSHOP_REVIEW') {
    return false;
  }
  const currentResubmissions = detail.history.filter(event =>
    metadataInteger(event.metadata, 'expectedVersion') === item.version - 1
    && metadataInteger(event.metadata, 'newVersion') === item.version);
  if (currentResubmissions.length !== 1) return false;
  const event = currentResubmissions[0];
  return event.previous_status === 'NEEDS_INFORMATION'
    && event.next_status === 'WORKSHOP_REVIEW'
    && event.reason_code === 'QA_P2_OFFICE_RESUBMIT_CORRECTION'
    && event.metadata?.newVersionLabel === item.versionLabel
    && metadataRequestId(event.metadata) !== null;
}

export function getWosOperatorWorkflowActions(
  item: Pick<
    WosInboxItem,
    'entityType' | 'id' | 'version' | 'versionLabel' | 'workflowStatus'
  >,
  detail: Pick<WosInboxReadDetail, 'item' | 'history'> | null,
): readonly WosOperatorWorkflowActionOption[] {
  if (item.entityType !== 'PRODUCTION_ORDER') return [];
  if (item.workflowStatus === 'SUBMITTED') {
    return [OPTIONS.ACCEPT, OPTIONS.RETURN_FOR_INFORMATION];
  }
  if (item.workflowStatus === 'WORKSHOP_REVIEW') {
    return [
      ...(detail && hasCurrentWosResubmission(item, detail)
        ? [OPTIONS.REVIEW_CORRECTION]
        : []),
      OPTIONS.RETURN_FOR_INFORMATION,
    ];
  }
  return [];
}

export function wosOperatorActionNote(
  action: WosOperatorWorkflowAction,
): string {
  return OPTIONS[action].defaultNote;
}
