import fs from 'node:fs';
import path from 'node:path';
import {
  buildAgentControlIdempotencyKey,
  isExecutableAgentControlState,
  type AgentControlState,
} from '../../src/lib/agent-control/control-state';
import {
  AGENT_CONTROL_STATE_END,
  AGENT_CONTROL_STATE_START,
  AgentControlParseError,
  parseAgentControlState,
} from '../../src/lib/agent-control/parser';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

function fixture(name: string): string {
  return fs.readFileSync(
    path.resolve('tests/fixtures/agent-control', name),
    'utf8',
  );
}

function markdownFor(state: unknown): string {
  return [
    '# Control',
    AGENT_CONTROL_STATE_START,
    '```json',
    JSON.stringify(state, null, 2),
    '```',
    AGENT_CONTROL_STATE_END,
  ].join('\n');
}

function expectParseError(
  markdown: string,
  expectedCode: AgentControlParseError['code'],
  label: string,
) {
  try {
    parseAgentControlState(markdown);
    assert(false, label + ': expected parse error');
  } catch (error) {
    assert(
      error instanceof AgentControlParseError && error.code === expectedCode,
      label + ': expected error code ' + expectedCode,
    );
  }
}

const repository = 'lenchenalc-hongda/hongda-new-media-platform';
const readyState = parseAgentControlState(fixture('valid-ready.md'));
const fixState = parseAgentControlState(fixture('valid-fix.md'));
const approvedState = parseAgentControlState(fixture('valid-approved.md'));

console.log('\n=== Agent Control ===');

assert(readyState.status === 'READY_FOR_CODEX', 'valid READY_FOR_CODEX parsed');
assert(fixState.status === 'FIX_REQUIRED', 'valid FIX_REQUIRED parsed');
assert(approvedState.status === 'APPROVED_FOR_MERGE', 'valid APPROVED_FOR_MERGE parsed');
assert(isExecutableAgentControlState(readyState), 'READY_FOR_CODEX executable');
assert(isExecutableAgentControlState(fixState), 'FIX_REQUIRED executable');
assert(!isExecutableAgentControlState(approvedState), 'APPROVED_FOR_MERGE not executable');

for (const status of [
  'APPROVED_FOR_MERGE',
  'MERGED',
  'BLOCKED',
  'NEEDS_DECISION',
  'FAILED',
] as const) {
  const state: AgentControlState = {
    ...readyState,
    status,
    current_task_id: status === 'MERGED' ? null : readyState.current_task_id,
  };
  assert(
    !isExecutableAgentControlState(state),
    `${status} is not executable`,
  );
}

expectParseError(
  fixture('invalid-missing-block.md'),
  'MISSING_BLOCK',
  'missing block',
);
expectParseError(
  fixture('invalid-duplicate-block.md'),
  'DUPLICATE_BLOCK',
  'duplicate block',
);
expectParseError(
  fixture('invalid-malformed-json.md'),
  'MALFORMED_JSON',
  'malformed JSON',
);
expectParseError(
  fixture('invalid-unknown-field.md'),
  'INVALID_SCHEMA',
  'unknown field',
);
expectParseError(
  fixture('invalid-fix-round.md'),
  'INVALID_SCHEMA',
  'FIX_REQUIRED requires nonzero fix round',
);
expectParseError(
  fixture('invalid-auto-merge-true.md'),
  'INVALID_SCHEMA',
  'auto_merge true rejected',
);
expectParseError(
  fixture('invalid-auto-production-true.md'),
  'INVALID_SCHEMA',
  'auto_production true rejected',
);

expectParseError(
  markdownFor({ ...readyState, schema_version: 2 }),
  'INVALID_SCHEMA',
  'unsupported schema version',
);
expectParseError(
  markdownFor({ ...readyState, verified_head: 'abc123' }),
  'INVALID_SCHEMA',
  'bad SHA',
);
expectParseError(
  markdownFor({ ...readyState, fix_round: 4 }),
  'INVALID_SCHEMA',
  'fix_round greater than max',
);
expectParseError(
  markdownFor({ ...readyState, current_task_id: null }),
  'INVALID_SCHEMA',
  'READY_FOR_CODEX missing task id',
);
expectParseError(
  markdownFor({
    ...readyState,
    status: 'APPROVED_FOR_MERGE',
    active_pr: null,
  }),
  'INVALID_SCHEMA',
  'APPROVED_FOR_MERGE requires active PR',
);

const duplicateFence = [
  AGENT_CONTROL_STATE_START,
  '```json',
  JSON.stringify(readyState),
  '```',
  '```json',
  JSON.stringify(readyState),
  '```',
  AGENT_CONTROL_STATE_END,
].join('\n');
expectParseError(duplicateFence, 'DUPLICATE_JSON_FENCE', 'duplicate JSON fence');

const proseOverride = [
  '# Control',
  'STATUS = BLOCKED',
  '```json',
  JSON.stringify({ ...readyState, status: 'BLOCKED' }),
  '```',
  AGENT_CONTROL_STATE_START,
  '```json',
  JSON.stringify(readyState),
  '```',
  AGENT_CONTROL_STATE_END,
  'STATUS = FAILED',
].join('\n');
assert(
  parseAgentControlState(proseOverride).status === 'READY_FOR_CODEX',
  'prose outside markers cannot override state',
);

const keyA = buildAgentControlIdempotencyKey(repository, readyState);
const keyB = buildAgentControlIdempotencyKey(repository, { ...readyState });
const keyTask = buildAgentControlIdempotencyKey(repository, {
  ...readyState,
  current_task_id: 'CPC-AUTO-001-IMPL-002',
});
const keyHead = buildAgentControlIdempotencyKey(repository, {
  ...readyState,
  verified_head: 'dddddddddddddddddddddddddddddddddddddddd',
});

assert(keyA === keyB, 'same repo/task/head has identical idempotency key');
assert(keyA !== keyTask, 'different task has different idempotency key');
assert(keyA !== keyHead, 'different head has different idempotency key');

console.log(`Agent Control tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
