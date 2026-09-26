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

console.log('\n=== Agent Control MAC-3 ===');

assert(
  codexSection.includes('needs: [validate, self-hosted-proof]')
  && codexSection.includes(
    "needs.validate.outputs.task_id == 'CPC-AUTO-001-MAC-3-READONLY-CODEX'",
  ),
  'Codex job depends on trusted validation and routing proof',
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
  && codexSection.includes('--ask-for-approval never')
  && codexSection.includes('--ephemeral')
  && codexSection.includes('--ignore-user-config')
  && codexSection.includes('--ignore-rules'),
  'Codex job uses the verified read-only noninteractive control set',
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
