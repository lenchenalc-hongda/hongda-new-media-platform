import fs from 'node:fs';
import path from 'node:path';
import {
  buildAgentControlIdempotencyKey,
  isExecutableAgentControlState,
} from '../../src/lib/agent-control/control-state';
import {
  AgentControlParseError,
  parseAgentControlState,
} from '../../src/lib/agent-control/parser';

const inputPath = process.argv[2];

if (!inputPath) {
  console.error('Usage: pnpm agent-control:validate <markdown-file>');
  process.exit(2);
}

try {
  const absolutePath = path.resolve(inputPath);
  const markdown = fs.readFileSync(absolutePath, 'utf8');
  const state = parseAgentControlState(markdown);
  const executable = isExecutableAgentControlState(state);

  console.log('VALID');
  console.log(`schema_version=${state.schema_version}`);
  console.log(`status=${state.status}`);
  console.log(`current_task_id=${state.current_task_id ?? 'null'}`);
  console.log(`active_pr=${state.active_pr ?? 'null'}`);
  console.log(`fix_round=${state.fix_round}/${state.max_fix_rounds}`);
  console.log(`executable=${executable ? 'YES' : 'NO'}`);
  if (executable) {
    console.log(
      `idempotency_key=${buildAgentControlIdempotencyKey(
        'lenchenalc-hongda/hongda-new-media-platform',
        state,
      )}`,
    );
  }
} catch (error) {
  console.error('INVALID');
  if (error instanceof AgentControlParseError) {
    console.error(`error_code=${error.code}`);
    console.error(`error=${error.message}`);
  } else if (error instanceof Error) {
    console.error(`error=${error.message}`);
  } else {
    console.error('error=unknown validation failure');
  }
  process.exit(1);
}
