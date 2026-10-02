import type {
  ProjectLifecycleStatus,
  ProjectPriority,
  ProjectType,
  RiskLevel,
  WaitingOn,
  WorkItemStatus,
  WorkItemType,
} from './domain';
import type {
  WorkbenchPriorityClass,
  WorkbenchQueueItem,
} from './read-models';

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  transfer_film: '花膜',
  transfer_processing: '转印加工',
  equipment: '设备',
  uv: 'UV',
  other: '其他',
};

export const PROJECT_STATUS_LABELS: Record<ProjectLifecycleStatus, string> = {
  active: '推进中',
  paused: '已暂停',
  won: '已成交',
  lost: '已流失',
  cancelled: '已取消',
};

export const PROJECT_PRIORITY_LABELS: Record<ProjectPriority, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
};

export const WAITING_ON_LABELS: Record<WaitingOn, string> = {
  none: '不等待',
  customer: '客户',
  internal: '内部同事',
  supplier: '供应商',
  quality: '品质',
  finance: '财务',
  logistics: '物流',
  other: '其他',
};

export const WORK_ITEM_TYPE_LABELS: Record<WorkItemType, string> = {
  NEXT_ACTION: '下一步',
  CUSTOMER_COMMITMENT: '客户承诺',
  INTERNAL_COLLABORATION: '内部协作',
  FOLLOW_UP: '客户回访',
  MANAGEMENT_DECISION: '管理决策',
};

export const WORK_ITEM_STATUS_LABELS: Record<WorkItemStatus, string> = {
  pending: '待处理',
  in_progress: '处理中',
  blocked: '受阻',
  completed: '已完成',
  cancelled: '已取消',
};

export const WORKBENCH_PRIORITY_LABELS: Record<WorkbenchPriorityClass, string> = {
  P0: '优先处理',
  P1: '今天推进',
  P2: '项目补齐',
  P3: '客户回访',
};

export const WORKBENCH_REASON_LABELS: Record<WorkbenchQueueItem['reason'], string> = {
  customer_commitment_due: '客户承诺到期',
  management_decision_due: '管理决策',
  critical_blocker: '关键阻塞',
  next_action_due: '下一步到期',
  waiting_check_due: '等待检查到期',
  missing_next_step: '缺少下一步',
  relationship_follow_up_due: '老客户回访',
};

export const PROGRESS_EVENT_OPTIONS = [
  { value: 'EFFECTIVE_PROGRESS_RECORDED', label: '有效推进' },
  { value: 'CUSTOMER_RESPONSE_RECEIVED', label: '收到客户反馈' },
  { value: 'CONTACT_LOGGED', label: '重要联系记录' },
  { value: 'QUOTE_SENT', label: '正式报价已发送' },
  { value: 'SAMPLE_SENT', label: '样品/打样已发送' },
  { value: 'CUSTOMER_CONFIRMED', label: '客户已确认' },
  { value: 'COMMERCIAL_CONFIRMED', label: '商务条件已确认' },
  { value: 'ORDER_CONFIRMED', label: '订单已确认' },
] as const;

export type ProgressEventType = (typeof PROGRESS_EVENT_OPTIONS)[number]['value'];

export const CONSEQUENTIAL_PROGRESS_EVENTS = new Set<ProgressEventType>([
  'QUOTE_SENT',
  'SAMPLE_SENT',
  'CUSTOMER_CONFIRMED',
  'COMMERCIAL_CONFIRMED',
  'ORDER_CONFIRMED',
]);

export function formatBusinessDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatBusinessDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function toIsoFromLocalDateTime(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function priorityClassTone(priority: WorkbenchPriorityClass): string {
  if (priority === 'P0') return 'bg-red-50 text-red-700 border-red-200';
  if (priority === 'P1') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (priority === 'P2') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-gray-50 text-gray-600 border-gray-200';
}

export function projectPriorityTone(priority: ProjectPriority): string {
  if (priority === 'critical') return 'bg-red-50 text-red-700';
  if (priority === 'high') return 'bg-amber-50 text-amber-700';
  if (priority === 'medium') return 'bg-blue-50 text-blue-700';
  return 'bg-gray-100 text-gray-600';
}
