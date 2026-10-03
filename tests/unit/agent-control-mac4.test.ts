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
const mac4Start = workflowSource.indexOf('  mac4-controlled-write:');
const mac5Start = workflowSource.indexOf('  mac5-fix-existing-pr:');
const mac4Section = workflowSource.slice(
  mac4Start,
  mac5Start >= 0 ? mac5Start : undefined,
);
const codexStepStart = mac4Section.indexOf(
  '      - name: Run workspace-write Codex acceptance',
);
const tokenStepStart = mac4Section.indexOf(
  '      - name: Mint scoped GitHub App token',
);
const publishStepStart = mac4Section.indexOf(
  '      - name: Publish controlled Draft PR',
);
const codexStep = mac4Section.slice(codexStepStart, tokenStepStart);
const tokenStep = mac4Section.slice(tokenStepStart, publishStepStart);
const publishStep = mac4Section.slice(publishStepStart);

const schema = JSON.parse(
  fs.readFileSync(
    'scripts/agent-control/codex-mac4-output.schema.json',
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
  }>;
};

console.log('\n=== Agent Control MAC-4 ===');

assert(
  mac4Start >= 0
  && mac4Section.includes('needs: [validate, self-hosted-proof]')
  && mac4Section.includes("github.actor == 'lenchenalc-hongda'")
  && mac4Section.includes(
    "needs.validate.outputs.task_id == 'CPC-AUTO-001-MAC-4-ACCEPT-001'",
  ),
  'MAC-4 runs only after trusted validation/routing for the exact canary task and owner actor',
);

assert(
  mac4Section.includes(
    'runs-on: [self-hosted, macOS, X64, hongda-agent-control]',
  )
  && mac4Section.includes('timeout-minutes: 20')
  && mac4Section.includes('permissions:\n      contents: read'),
  'MAC-4 uses the dedicated runner with bounded timeout and read-only built-in token',
);

assert(
  mac4Section.includes(
    'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
  )
  && mac4Section.includes(
    'ref: ${{ needs.validate.outputs.verified_head }}',
  )
  && mac4Section.includes('persist-credentials: false')
  && mac4Section.includes('fetch-depth: 1'),
  'MAC-4 checks out the exact validated SHA without persisted credentials',
);

assert(
  codexStep.includes(
    'codex_binary="/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"',
  )
  && codexStep.includes('codex_binary="/Applications/ChatGPT.app/Contents/Resources/codex"')
  && codexStep.includes('/bin/launchctl getenv DEEPSEEK_API_KEY')
  && codexStep.includes('DEEPSEEK_API_KEY="$deepseek_api_key"')
  && codexStep.includes('"$codex_binary" exec')
  && codexStep.includes('-s workspace-write')
  && codexStep.includes(`-c 'approval_policy="never"'`)
  && codexStep.includes('--ephemeral')
  && !codexStep.includes('--ignore-user-config')
  && codexStep.includes('--ignore-rules')
  && !/danger-full-access|dangerously-bypass/.test(codexStep),
  'Codex is bounded to workspace-write with noninteractive safe controls',
);

assert(
  codexStep.includes('env -i')
  && !/\$\{\{\s*secrets\.|GH_APP_TOKEN|GITHUB_TOKEN|ACTIONS_RUNTIME_TOKEN|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(
    codexStep,
  ),
  'Codex step receives no GitHub App, GitHub, application, or Production credential',
);

assert(
  codexStep.includes('allowed_path="docs/agent-control/mac4-acceptance.md"')
  && codexStep.includes('Do not modify any other file.')
  && codexStep.includes('Do not stage files.')
  && codexStep.includes('Do not commit.')
  && codexStep.includes('Do not push.')
  && !/COMMENT_BODY|comment\.body|github\.event\.comment/.test(codexStep),
  'MAC-4 uses a fixed canary path/prompt rather than arbitrary issue prose',
);

assert(
  codexStep.includes('git_control_hash()')
  && codexStep.includes('git_control_before="$(git_control_hash)"')
  && codexStep.includes('git_control_after="$(git_control_hash)"')
  && codexStep.includes('find "$git_dir/hooks" -type f')
  && codexStep.includes('"$git_dir/info/exclude"')
  && codexStep.includes('"$git_dir/info/attributes"')
  && codexStep.includes('git diff --cached --exit-code')
  && codexStep.includes('git status --porcelain=v1 --untracked-files=all')
  && codexStep.includes('expected_content_hash=')
  && codexStep.includes('[ -L "$allowed_path" ]'),
  'post-Codex checks protect git control state, file type/content, and exact worktree shape',
);

assert(
  tokenStepStart > codexStepStart
  && tokenStep.includes(
    'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1',
  )
  && tokenStep.includes('client-id: ${{ vars.AGENT_CONTROL_APP_CLIENT_ID }}')
  && tokenStep.includes(
    'private-key: ${{ secrets.AGENT_CONTROL_APP_PRIVATE_KEY }}',
  )
  && tokenStep.includes('permission-contents: write')
  && tokenStep.includes('permission-pull-requests: write')
  && !tokenStep.includes('permission-issues:')
  && !tokenStep.includes('permission-actions:')
  && !tokenStep.includes('permission-administration:')
  && !tokenStep.includes('permission-secrets:')
  && !tokenStep.includes('permission-workflows:'),
  'GitHub App token is minted after Codex with only Contents/PR write permissions',
);

assert(
  publishStep.includes(
    'branch_name="codex/agent-control-mac4-accept-${EXPECTED_SHA:0:12}"',
  )
  && publishStep.includes('MAC4_PROTECTED_BRANCH_GUARD=FAIL')
  && publishStep.includes('git -c core.hooksPath=/dev/null push origin "HEAD:refs/heads/$branch_name"')
  && publishStep.includes('"draft":true')
  && !/git push[^\n]*(master|main)|\/merge"|gh pr merge|issues\//.test(
    publishStep,
  ),
  'trusted wrapper can only push the deterministic canary branch and create a Draft PR',
);

assert(
  publishStep.includes('GIT_ASKPASS="$askpass_file"')
  && publishStep.includes('PATH: /usr/bin:/bin:/usr/sbin:/sbin')
  && publishStep.includes('git -c core.hooksPath=/dev/null switch')
  && publishStep.includes('git -c core.hooksPath=/dev/null commit')
  && publishStep.includes('git -c core.hooksPath=/dev/null push')
  && publishStep.includes('mktemp "$RUNNER_TEMP/agent-control-mac4-askpass.XXXXXX"')
  && !publishStep.includes('remote set-url')
  && !publishStep.includes('https://x-access-token:'),
  'App token is isolated to the trusted wrapper with fixed PATH, disabled hooks, and no credential persistence',
);

assert(
  publishStep.includes('MAC4_IDEMPOTENCY=BRANCH_ALREADY_EXISTS')
  && publishStep.includes('git ls-remote --exit-code origin')
  && !/for \w+ in|while true|retry/.test(mac4Section),
  'deterministic remote branch existence fails closed without a workflow retry loop',
);

assert(
  !/uses:\s+[^\n]+@(v\d+|main|master)\b/.test(mac4Section),
  'all third-party actions in the self-hosted MAC-4 job are immutable-pinned',
);

assert(
  schema.type === 'object'
  && schema.additionalProperties === false
  && schema.required?.length === 6
  && schema.properties?.status?.type === 'string'
  && schema.properties?.status?.enum?.includes('PASS') === true
  && schema.properties?.task_id?.type === 'string'
  && schema.properties?.base_sha?.type === 'string'
  && schema.properties?.workspace_write_confirmed?.type === 'boolean'
  && schema.properties?.changed_paths?.type === 'array'
  && schema.properties?.changed_paths?.items?.type === 'string'
  && schema.properties?.acceptance_sentinel?.type === 'string',
  'MAC-4 structured output uses the portable strict schema subset',
);

const serializedSchema = JSON.stringify(schema);
assert(
  !serializedSchema.includes('"$schema"')
  && !serializedSchema.includes('"const"')
  && !serializedSchema.includes('"pattern"')
  && !serializedSchema.includes('"minLength"')
  && !serializedSchema.includes('"maxLength"'),
  'MAC-4 schema avoids compatibility-sensitive constraints',
);

console.log(`Agent Control MAC-4 tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
