import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  evaluateWosP2HandoffTimeline,
  WOS_P2_HANDOFF_STEPS,
  type WosP2HandoffHistory,
  type WosP2HandoffInput,
} from '../../src/lib/workshop-orders/p2-handoff-timeline';

function requestId(index: number): string {
  return `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function event(input: {
  index: number;
  from: string;
  to: string;
  role: string;
  reason: string;
  expectedVersion: number;
  request?: string;
  metadata?: Record<string, unknown> | null;
}): WosP2HandoffHistory {
  return {
    previous_status: input.from,
    next_status: input.to,
    actor_role: input.role,
    reason_code: input.reason,
    created_at: new Date(Date.UTC(2026, 10, 20, 12, 0, input.index)).toISOString(),
    metadata: input.metadata === undefined ? {
      requestId: input.request ?? requestId(input.index),
      expectedVersion: input.expectedVersion,
      newVersion: input.expectedVersion + 1,
    } : input.metadata,
  };
}

const base: WosP2HandoffHistory[] = WOS_P2_HANDOFF_STEPS.map((step, index) => event({
  index,
  from: step.from,
  to: step.to,
  role: index === 0 || index === 3 || index === 4 ? 'sales' : 'operator',
  reason: step.reason,
  expectedVersion: index + 1,
}));

const linked: WosP2HandoffHistory[] = [
  event({ index: 6, from: 'WAITING_MATERIAL', to: 'WAITING_MATERIAL',
    role: 'operator', reason: 'QA_M2_MATERIAL_RECORD', expectedVersion: 7 }),
  event({ index: 7, from: 'WAITING_MATERIAL', to: 'WAITING_MATERIAL',
    role: 'sales', reason: 'QA_M2_BASELINE_SELECT', expectedVersion: 8 }),
  event({ index: 8, from: 'WAITING_MATERIAL', to: 'WAITING_MATERIAL',
    role: 'sales', reason: 'QA_M2_BASELINE_OFFICE_CONFIRM', expectedVersion: 9 }),
  event({ index: 9, from: 'WAITING_MATERIAL', to: 'WAITING_MATERIAL',
    role: 'operator', reason: 'QA_M2_BASELINE_WORKSHOP_CONFIRM', expectedVersion: 10 }),
  event({ index: 10, from: 'WAITING_MATERIAL', to: 'READINESS_CHECK',
    role: 'operator', reason: 'QA_M2_FINAL_READINESS_CONFIRM', expectedVersion: 11 }),
];
const current: WosP2HandoffInput = {
  history: [...base, ...linked].reverse(),
  currentStatus: 'READINESS_CHECK',
  currentVersion: 12,
  readVerified: true,
};
const good = evaluateWosP2HandoffTimeline(current);
assert.equal(good.historySequenceVerified, true);
assert.equal(good.steps.filter(step => step.verifiedByHistory).length, 6);
assert.equal(good.canStart, false);
assert.equal(good.source, 'QA_RLS_STATUS_HISTORY_VERSION_BOUND');
assert(good.nextAction.includes('禁止自动开工'));

const legacyWithoutMetadata = base.map(row => ({ ...row, metadata: null }));
const negatives: Array<[string, WosP2HandoffInput]> = [
  ['read verification missing', { ...current, readVerified: false }],
  ['legacy v7 rows have no metadata', {
    ...current, history: legacyWithoutMetadata,
    currentVersion: 7, currentStatus: 'WAITING_MATERIAL',
  }],
  ['v7 six-step history cannot authorize v11', {
    ...current, history: [...base, ...linked].reverse(),
    currentVersion: 11, currentStatus: 'WAITING_MATERIAL',
  }],
  ['missing accept', { ...current, history: current.history.filter(row => row.reason_code !== 'QA_P2_ACCEPT') }],
  ['duplicate review', { ...current, history: [...current.history, linked[3]] }],
  ['out-of-order signoff versions', {
    ...current,
    history: current.history.map(row => {
      if (row.reason_code === 'QA_M2_BASELINE_OFFICE_CONFIRM') {
        return { ...row, metadata: { ...row.metadata, expectedVersion: 10, newVersion: 11 } };
      }
      if (row.reason_code === 'QA_M2_BASELINE_WORKSHOP_CONFIRM') {
        return { ...row, metadata: { ...row.metadata, expectedVersion: 9, newVersion: 10 } };
      }
      return row;
    }),
  }],
  ['wrong request identity', {
    ...current,
    history: current.history.map(row => row.reason_code === 'QA_M2_FINAL_READINESS_CONFIRM'
      ? { ...row, metadata: { ...row.metadata, requestId: 'not-a-uuid' } } : row),
  }],
  ['contradictory extra transition', {
    ...current,
    history: [...current.history, event({
      index: 11, from: 'WAITING_MATERIAL', to: 'DRAFT', role: 'operator',
      reason: 'QA_UNKNOWN_TRANSITION', expectedVersion: 12,
    })],
  }],
  ['missing first material event', {
    ...current, history: [...base, ...linked.slice(1)],
  }],
  ['current version advanced without history', { ...current, currentVersion: 13 }],
  ['current status differs from final history', { ...current, currentStatus: 'WAITING_MATERIAL' }],
  ['final event bound to wrong version', {
    ...current,
    history: current.history.map(row => row.reason_code === 'QA_M2_FINAL_READINESS_CONFIRM'
      ? { ...row, metadata: { ...row.metadata, expectedVersion: 10, newVersion: 11 } } : row),
  }],
  ['fractional version', { ...current, currentVersion: 12.5 }],
  ['too many/truncated rows', {
    ...current,
    history: [
      ...current.history,
      ...Array.from({ length: 100 }, (_, index) => event({
        index: 20 + index, from: 'READINESS_CHECK', to: 'WAITING_MATERIAL',
        role: 'operator', reason: 'QA_M2_EVIDENCE_INVALIDATED',
        expectedVersion: 12 + index,
      })),
    ],
  }],
];

for (const [label, input] of negatives) {
  const result = evaluateWosP2HandoffTimeline(input);
  assert.equal(result.historySequenceVerified, false, label);
  assert(result.steps.every(step => !step.verifiedByHistory), label);
  assert.equal(result.canStart, false, label);
}

const unchanged = JSON.stringify(current);
evaluateWosP2HandoffTimeline(current);
assert.equal(JSON.stringify(current), unchanged);

const source = readFileSync('src/components/workshop-orders/LiveQaWorkshopReadiness.tsx', 'utf8');
assert(source.includes('metadata'));
console.log('WOS_P2_VERSION_BOUND_HANDOFF_NORMAL=PASS');
console.log('WOS_P2_VERSION_BOUND_HANDOFF_NEGATIVE_CASES=' + negatives.length);
console.log('WOS_P2_HANDOFF_NO_AUTO_START=PASS');
