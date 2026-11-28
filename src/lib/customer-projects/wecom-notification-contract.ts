/**
 * CPC P2-A: deterministic, credential-free WeCom notification contract.
 *
 * This module NEVER calls WeCom, a scheduler, or a database. No caller may treat
 * its planned intents as a permission to send. A future server-only dispatcher
 * must re-read the CPC source, check a durable outbox lease, verified recipient
 * mapping, enterprise trusted egress and explicit production enablement.
 */
export const CPC_WECOM_P2A = {
  channel: 'wecom_app',
  policyVersion: 1,
  transportEnabled: false,
  productionDispatchEnabled: false,
  timezone: 'Asia/Shanghai',
  personalDigestFromMinute: 9 * 60,
  personalDigestUntilMinute: 9 * 60 + 15,
} as const;

export type WecomReminderKind =
  | 'formal_task'
  | 'waiting_check'
  | 'project_stalled'
  | 'new_project_gap'
  | 'missing_next_step';

export interface WecomBusinessFact {
  orgId: string;
  kind: WecomReminderKind;
  sourceId: string;
  /** Change of due time or baseline creates a new occurrence, never revives old ones. */
  effectiveAt: string;
  state: 'needs_action' | 'resolved' | 'not_due';
  projectId: string | null;
  projectOwnerProfileId: string | null;
  workAssigneeProfileId: string | null;
}

export interface VerifiedWecomMember {
  orgId: string;
  corpId: string;
  profileId: string;
  wecomUserId: string;
  verified: boolean;
  isActive: boolean;
  inAppVisibleScope: boolean;
}

export interface WecomPersonalIntent {
  channel: 'wecom_app';
  policyVersion: 1;
  orgId: string;
  sourceKind: WecomReminderKind;
  sourceId: string;
  sourceEffectiveAt: string;
  recipientProfileId: string;
  recipientWecomUserId: string;
  dispatchDateShanghai: string;
  occurrenceKey: string;
  /** Generic wording: project/customer details must be loaded only after CPC auth. */
  notificationText: string;
  cpcUrl: string;
}

export type WecomPlanDecision =
  | { status: 'planned'; intent: WecomPersonalIntent }
  | { status: 'suppressed'; reason:
    | 'invalid_input'
    | 'not_actionable'
    | 'outside_digest_window'
    | 'identity_not_bound'
    | 'identity_ambiguous'
    | 'identity_not_verified'
    | 'member_outside_scope' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WECOM_USER_ID = /^[A-Za-z0-9_.@-]{1,128}$/;

function shanghaiClock(now: Date): { weekday: string; date: string; minute: number } | null {
  if (!Number.isFinite(now.getTime())) return null;
  const pieces = new Intl.DateTimeFormat('en-US', {
    timeZone: CPC_WECOM_P2A.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => pieces.find(p => p.type === type)?.value ?? '';
  const year = value('year');
  const month = value('month');
  const day = value('day');
  const weekday = value('weekday');
  const hour = Number(value('hour'));
  const minute = Number(value('minute'));
  if (!year || !month || !day || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return { weekday, date: year + '-' + month + '-' + day, minute: hour * 60 + minute };
}

function recipientProfileId(fact: WecomBusinessFact): string | null {
  // WorkItem assignee is the real action owner, even when the project owner differs.
  return fact.kind === 'formal_task'
    ? fact.workAssigneeProfileId
    : fact.projectOwnerProfileId;
}

function isSafeSingleUserId(value: string): boolean {
  // Never accept WeCom broadcast, multi-user selectors, or control characters.
  return WECOM_USER_ID.test(value) && value.toLowerCase() !== '@all';
}

/**
 * Compiles one CPC fact into a safe, non-sendable personal notification intent.
 * Binding must come from an administrator-verified mapping, NOT name matching.
 */
export function planWecomPersonalNotification(input: {
  now: Date;
  expectedCorpId: string;
  fact: WecomBusinessFact;
  members: VerifiedWecomMember[];
}): WecomPlanDecision {
  const { fact } = input;
  const recipientId = recipientProfileId(fact);
  const ts = Date.parse(fact.effectiveAt);
  if (!UUID.test(fact.orgId) || !UUID.test(fact.sourceId)
    || !recipientId || !UUID.test(recipientId)
    || !input.expectedCorpId.trim() || !Number.isFinite(ts)
    || (fact.projectId !== null && !UUID.test(fact.projectId))) {
    return { status: 'suppressed', reason: 'invalid_input' };
  }
  if (fact.state !== 'needs_action') {
    return { status: 'suppressed', reason: 'not_actionable' };
  }

  const clock = shanghaiClock(input.now);
  if (!clock || clock.weekday === 'Sat' || clock.weekday === 'Sun'
    || clock.minute < CPC_WECOM_P2A.personalDigestFromMinute
    || clock.minute >= CPC_WECOM_P2A.personalDigestUntilMinute) {
    return { status: 'suppressed', reason: 'outside_digest_window' };
  }

  // Duplicate mappings are dangerous even when one entry is inactive.
  const matches = input.members.filter(member =>
    member.orgId === fact.orgId && member.profileId === recipientId);
  if (matches.length === 0) return { status: 'suppressed', reason: 'identity_not_bound' };
  if (matches.length !== 1) return { status: 'suppressed', reason: 'identity_ambiguous' };
  const member = matches[0];
  if (!member.verified || member.corpId !== input.expectedCorpId
    || !isSafeSingleUserId(member.wecomUserId)) {
    return { status: 'suppressed', reason: 'identity_not_verified' };
  }
  if (!member.isActive || !member.inAppVisibleScope) {
    return { status: 'suppressed', reason: 'member_outside_scope' };
  }

  const kindLabel: Record<WecomReminderKind, string> = {
    formal_task: '您有一项 CPC 正式任务需要处理',
    waiting_check: '您有一项 CPC 项目等待检查需要处理',
    project_stalled: '您有一项 CPC 项目推进建议需要核实',
    new_project_gap: '您有一项 CPC 新项目开发建议需要查看',
    missing_next_step: '您有一项 CPC 项目下一步待完善',
  };
  const occurrenceKey = JSON.stringify([
    CPC_WECOM_P2A.policyVersion, fact.orgId, recipientId,
    fact.kind, fact.sourceId, fact.effectiveAt, clock.date,
    CPC_WECOM_P2A.channel,
  ]);
  const cpcUrl = fact.projectId
    ? 'https://www.hongdaprinting.tech/customer-projects/projects/' + fact.projectId
    : 'https://www.hongdaprinting.tech/customer-projects/projects';
  return {
    status: 'planned',
    intent: {
      channel: 'wecom_app',
      policyVersion: 1,
      orgId: fact.orgId,
      sourceKind: fact.kind,
      sourceId: fact.sourceId,
      sourceEffectiveAt: fact.effectiveAt,
      recipientProfileId: recipientId,
      recipientWecomUserId: member.wecomUserId,
      dispatchDateShanghai: clock.date,
      occurrenceKey,
      notificationText: kindLabel[fact.kind] + '。请登录 HongdaOS 查看并处理。',
      cpcUrl,
    },
  };
}

/**
 * Before future dispatch, a server-side worker must re-check the authoritative
 * CPC fact. This catches completed, rescheduled, or re-assigned work.
 * It is necessary but NOT sufficient: check auth, binding and outbox lease too.
 */
export function isWecomOccurrenceCurrent(
  intent: WecomPersonalIntent,
  latestFact: WecomBusinessFact,
): boolean {
  return latestFact.state === 'needs_action'
    && intent.orgId === latestFact.orgId
    && intent.sourceKind === latestFact.kind
    && intent.sourceId === latestFact.sourceId
    && intent.sourceEffectiveAt === latestFact.effectiveAt
    && intent.recipientProfileId === recipientProfileId(latestFact);
}
