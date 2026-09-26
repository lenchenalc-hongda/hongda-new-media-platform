import fs from 'node:fs';

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

const workflowSource = fs.readFileSync(
  '.github/workflows/agent-control-dry-run.yml',
  'utf8',
);
const codexSection = workflowSource.slice(
  workflowSource.indexOf('  mac3-readonly-codex:'),
);
const schema = JSON.parse(
  fs.readFileSync(
    'scripts/agent-control/codex-readonly-output.schema.json',
    'utf8',
  ),
) as {
  required?: string[];
  properties?: Record<string, { const?: string }>;
};

const expectedTaskId = 'CPC-AUTO-001-MAC-3-READONLY-CODEX';
const expectedHeadSha = 'c04252f7e2b394c26534da3acb8364ee01ec3689';

function passesExactIdentityChecks(payload: string): boolean {
  return new RegExp(
    `"task_id"\\s*:\\s*"${expectedTaskId}"`,
  ).test(payload)
    && new RegExp(
      '"acceptance_sentinel"\\s*:\\s*"CODEX_READONLY_PROOF=PASS"',
    ).test(payload)
    && new RegExp(
      `"head_sha"\\s*:\\s*"${expectedHeadSha}"`,
    ).test(payload)
    && /"status"\s*:\s*"PASS"/.test(payload)
    && /"read_only_confirmed"\s*:\s*true/.test(payload);
}

console.log('\n=== Agent Control MAC-3 ===');

assert(
  codexSection.includes('needs: [validate, self-hosted-proof]')
  && codexSection.includes(
    "needs.validate.outputs.task_id == 'CPC-AUTO-001-MAC-3-ACCEPT-001'",
  ),
  'Codex job depends on trusted validation and routing proof',
);
assert(
  !codexSection.includes('CPC-AUTO-001-MAC-3-READONLY-CODEX')
  && !codexSection.includes('CPC-AUTO-001-MAC-3-EXACT-IDENTITY-001')
  && !codexSection.includes('CPC-AUTO-001-MAC-3-ACCEPT-GATE-001'),
  'Codex job gate blocks implementation and fix task IDs',
);
assert(
  codexSection.includes(
    'runs-on: [self-hosted, macOS, X64, hongda-agent-control]',
  ),
  'Codex job uses dedicated Mac runner labels',
);
assert(
  codexSection.includes(
    'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
  )
  && codexSection.includes(
    'ref: ${{ needs.validate.outputs.verified_head }}',
  )
  && codexSection.includes('persist-credentials: false')
  && codexSection.includes('fetch-depth: 1'),
  'Codex job checks out exact validated SHA with pinned checkout action',
);
assert(
  codexSection.includes('permissions:\n      contents: read'),
  'Codex job has read-only permissions',
);
assert(
  codexSection.includes(
    'codex_binary="/Applications/ChatGPT.app/Contents/Resources/codex"',
  )
  && codexSection.includes('"$codex_binary" exec')
  && codexSection.includes('-s read-only')
  && codexSection.includes('-c \'approval_policy="never"\'')
  && !codexSection.includes('--ask-for-approval')
  && codexSection.includes('--ephemeral')
  && codexSection.includes('--ignore-user-config')
  && codexSection.includes('--ignore-rules'),
  'Codex job uses the version-compatible read-only noninteractive control set',
);
assert(
  !/workspace-write|danger-full-access|dangerously-bypass/.test(codexSection),
  'Codex job rejects writable or bypass sandbox modes',
);
assert(
  !/\$\{\{\s*secrets\.|OPENAI_API_KEY|CODEX_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY/.test(
    codexSection,
  ),
  'Codex job contains no application or fallback secrets',
);
assert(
  !/issues: write|pull-requests: write|contents: write|id-token: write/.test(
    codexSection,
  ),
  'Codex job contains no GitHub write permissions',
);
assert(
  !/git (commit|push|branch)|gh (pr|issue|api)|curl|wget/.test(codexSection),
  'Codex job contains no repository or GitHub write commands',
);
assert(
  codexSection.includes('verify_repository_state')
  && (codexSection.match(/verify_repository_state/g)?.length ?? 0) >= 3,
  'Codex job performs pre/post repository integrity checks',
);
assert(
  codexSection.includes('git diff --exit-code')
  && codexSection.includes('git diff --cached --exit-code')
  && codexSection.includes('git status --porcelain'),
  'Codex job validates clean HEAD/status/diff',
);
assert(
  codexSection.includes('"task_id"[[:space:]]*:[[:space:]]*"')
  && codexSection.includes('"$TASK_ID"')
  && codexSection.includes(
    '"acceptance_sentinel"[[:space:]]*:[[:space:]]*"CODEX_READONLY_PROOF=PASS"',
  )
  && !codexSection.includes('grep -Fq "\\"$TASK_ID\\""'),
  'Codex job checks exact top-level task identity and sentinel keys',
);
const falsePositive = JSON.stringify({
  status: 'PASS',
  task_id: 'WRONG-TASK-ID',
  head_sha: expectedHeadSha,
  read_only_confirmed: true,
  acceptance_sentinel: 'CODEX_READONLY_PROOF=PASS',
  findings: [expectedTaskId],
  risks: [],
  recommended_next_action: 'none',
});
const trueIdentity = JSON.stringify({
  status: 'PASS',
  task_id: expectedTaskId,
  head_sha: expectedHeadSha,
  read_only_confirmed: true,
  acceptance_sentinel: 'CODEX_READONLY_PROOF=PASS',
  findings: [],
  risks: [],
  recommended_next_action: 'none',
});
assert(
  !passesExactIdentityChecks(falsePositive)
  && passesExactIdentityChecks(trueIdentity),
  'wrong top-level task ID with expected ID in findings is rejected',
);
const postInvokeVerify = codexSection.indexOf(
  "printf 'POST_CODEX_REPOSITORY_STATE=PASS\\n'",
);
const failureBranch = codexSection.indexOf(
  'if [ "$codex_exit_status" -ne 0 ]; then',
);
assert(
  postInvokeVerify >= 0
  && failureBranch >= 0
  && postInvokeVerify < failureBranch,
  'Codex job verifies repository integrity before handling non-zero exit',
);
assert(
  codexSection.includes('"$codex_binary" login status')
  && codexSection.includes("printf 'CODEX_LOGIN_STATUS=%s\\n'")
  && !codexSection.includes('cat "$login_log"'),
  'Codex job checks login availability without printing authentication output',
);
assert(
  codexSection.includes("printf 'CODEX_FAILURE_CLASS=%s\\n'")
  && codexSection.includes("printf 'CODEX_LAST_EVENT_TYPE=%s\\n'")
  && codexSection.includes('"$failure_event_log" "$error_log"')
  && !codexSection.includes('"$failure_event_log" "$error_log" "$login_log"'),
  'Codex job classifies only fatal events and stderr, not successful login text',
);
assert(
  !codexSection.includes('cat "$event_log"')
  && !codexSection.includes('cat "$error_log"')
  && !codexSection.includes('tail "$event_log"')
  && !codexSection.includes('tail "$error_log"'),
  'Codex job never prints raw Codex event or error logs',
);

assert(
  codexSection.includes('timeout-minutes: 15')
  && !/retry|for i in|while true/.test(codexSection),
  'Codex job has a fixed timeout and no retry loop',
);
assert(
  !/COMMENT_BODY|comment\.body|github\.event\.comment/.test(codexSection),
  'Codex job does not forward arbitrary issue-comment prose',
);
assert(
  codexSection.includes('env -i')
  && !codexSection.includes('GITHUB_TOKEN')
  && !codexSection.includes('ACTIONS_RUNTIME_TOKEN'),
  'Codex process receives a minimal environment without GitHub credentials',
);
assert(
  !codexSection.includes('actions/checkout@v4')
  && !/uses:\s+[^\n]+@(v\d+|main|master)\b/.test(codexSection),
  'Codex job uses no mutable third-party action tag',
);

assert(
  schema.required?.includes('acceptance_sentinel') === true
  && schema.required?.includes('read_only_confirmed') === true,
  'output schema requires deterministic read-only proof fields',
);
assert(
  schema.properties?.acceptance_sentinel?.const === 'CODEX_READONLY_PROOF=PASS',
  'output schema fixes the acceptance sentinel',
);

console.log(`Agent Control MAC-3 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
