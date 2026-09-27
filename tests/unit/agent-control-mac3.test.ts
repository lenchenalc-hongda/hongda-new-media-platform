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
const mac3Start = workflowSource.indexOf('  mac3-readonly-codex:');
const mac4Start = workflowSource.indexOf('  mac4-controlled-write:');
const codexSection = workflowSource.slice(
  mac3Start,
  mac4Start >= 0 ? mac4Start : undefined,
);
const schema = JSON.parse(
  fs.readFileSync(
    'scripts/agent-control/codex-readonly-output.schema.json',
    'utf8',
  ),
) as {
  type?: string;
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, {
    type?: string;
    enum?: string[];
    items?: { type?: string };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
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
  && codexSection.includes('codex_login_status="UNAVAILABLE_OR_CONFIG_ERROR"')
  && codexSection.includes("printf 'CODEX_LOGIN_STATUS=%s\\n'")
  && !codexSection.includes('cat "$login_log"')
  && !codexSection.includes('tail "$login_log"'),
  'Codex job checks login availability without overclaiming or printing auth output',
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
  && !codexSection.includes('cat "$failure_event_log"')
  && !codexSection.includes('tail "$event_log"')
  && !codexSection.includes('tail "$error_log"')
  && !codexSection.includes('tail "$failure_event_log"'),
  'Codex job never prints raw Codex diagnostic logs',
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
  schema.type === 'object'
  && schema.additionalProperties === false
  && schema.required?.length === 8
  && schema.required?.includes('acceptance_sentinel') === true
  && schema.required?.includes('read_only_confirmed') === true,
  'output schema keeps a strict required root object',
);
assert(
  schema.properties?.status?.type === 'string'
  && schema.properties?.status?.enum?.includes('PASS') === true
  && schema.properties?.task_id?.type === 'string'
  && schema.properties?.head_sha?.type === 'string'
  && schema.properties?.acceptance_sentinel?.type === 'string'
  && schema.properties?.findings?.type === 'array'
  && schema.properties?.findings?.items?.type === 'string'
  && schema.properties?.risks?.type === 'array'
  && schema.properties?.recommended_next_action?.type === 'string',
  'output schema uses the portable Structured Outputs type subset',
);
const serializedSchema = JSON.stringify(schema);
assert(
  !serializedSchema.includes('"$schema"')
  && !serializedSchema.includes('"const"')
  && !serializedSchema.includes('"minLength"')
  && !serializedSchema.includes('"maxLength"')
  && !serializedSchema.includes('"pattern"')
  && !serializedSchema.includes('"minItems"')
  && !serializedSchema.includes('"maxItems"'),
  'output schema avoids nonessential compatibility-sensitive constraints',
);
assert(
  codexSection.includes(
    '"acceptance_sentinel"[[:space:]]*:[[:space:]]*"CODEX_READONLY_PROOF=PASS"',
  )
  && codexSection.includes('"head_sha"[[:space:]]*:[[:space:]]*"')
  && codexSection.includes('"task_id"[[:space:]]*:[[:space:]]*"')
  && codexSection.includes('"read_only_confirmed"[[:space:]]*:[[:space:]]*true'),
  'exact acceptance identity remains enforced after model output',
);

console.log(`Agent Control MAC-3 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
