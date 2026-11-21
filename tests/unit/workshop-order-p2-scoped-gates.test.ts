import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = 'docs/workshop-order-system/nonproduction-only/';
const operator = readFileSync(`${base}wos_p2_operator_actions_QA_ONLY_NOT_INSTALLED.sql`, 'utf8');
const office = readFileSync(`${base}wos_p2_office_revision_resubmit_QA_ONLY_NOT_INSTALLED.sql`, 'utf8');
const m2 = readFileSync(`${base}WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql`, 'utf8');
const compat = readFileSync(`${base}wos_p2_operator_revision_compat_QA_ONLY_NOT_INSTALLED.sql`, 'utf8');
const unified = readFileSync(`${base}wos_p2_qa_unified_gate_scope_QA_ONLY_NOT_INSTALLED.sql`, 'utf8');
const ui = readFileSync('src/components/workshop-orders/LiveQaWorkshopActions.tsx', 'utf8');

for (const [name, sql] of Object.entries({ operator, office, m2 })) {
  assert(sql.includes('allowed_order_id'), `${name}: missing order scope`);
  assert(sql.includes('allowed_organization_id'), `${name}: missing org scope`);
  assert(/interval\s+'15 minutes'/i.test(sql), `${name}: missing 15-minute cap`);
  assert(!/interval\s+'24 hours'/i.test(sql), `${name}: stale 24-hour cap`);
  assert(!/GRANT\s+(INSERT|UPDATE|DELETE)\s+ON\s+public\.wos_/i.test(sql),
    `${name}: broad business-table grant`);
}

assert(operator.includes('gate.allowed_order_id=p_order_id'));
assert(office.includes('g.allowed_order_id=p_order_id'));
assert(m2.includes('g.allowed_order_id=p_order_id'));
assert(operator.includes('M2_FINAL_READINESS_REQUIRED'));
assert(compat.includes('M2_FINAL_READINESS_REQUIRED'));
assert(unified.includes("RAISE EXCEPTION 'QA_GATE_EXPIRED_STILL_ENABLED'"));
assert(unified.includes('v_scope_count<>1'));
assert(unified.includes("v_order_number NOT LIKE 'QA-NONPROD-%'"));
assert(!unified.includes('d2f91453-fe42-42e9-98d4-a6a902645ded'),
  'dynamic gate scope must not regress to one hard-coded historical order');
assert(ui.includes("process.env.NEXT_PUBLIC_WOS_P2_QA_M2_ENABLED === 'true'"));
assert(ui.includes('!finalStatuses.has(value)'));

console.log('workshop-order-p2-scoped-gates.test.ts: PASS');
console.log('WOS_P2_GATE_ORDER_ORG_TTL_SCOPE=PASS');
console.log('WOS_P2_LEGACY_FINAL_BYPASS_GUARD=PASS');
