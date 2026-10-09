import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

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

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ');
}

const candidateSha = '2ec626b3bc0eaf751248db0f449065bad573196a';
const docs = [
  'docs/customer-project-center/PRODUCTION_SQL_EXECUTION_MANIFEST.md',
  'docs/customer-project-center/DEV_MIGRATION_HISTORY_RECONCILIATION.md',
  'docs/customer-project-center/CLEAN_ROOM_REHEARSAL_PLAN.md',
  'docs/customer-project-center/PRODUCTION_VERCEL_DEPLOYMENT_MANIFEST.md',
  'docs/customer-project-center/PRODUCTION_GATE_CHECKLIST.md',
];

const files = [
  {
    path: 'supabase/migrations/20261001143000_customer_project_center_phase5a_core_foundation.sql',
    blob: '9a564550836e6a3d57978fe5177321b8ab39b791',
    sha256:
      '81e88dd2bf2bc89eac41d19199c54c0bf8824b801d8392b1fd2ead11287a1ad4',
  },
  {
    path: 'supabase/migrations/20261002024500_customer_project_center_phase5b_mutation_rpcs.sql',
    blob: 'e3bf4075532a6d27084b6642cad03ea4fc420404',
    sha256:
      '2dbfa413e60fdc935dbc58c4703a0aac004b165e1e5caa17daf193bdfecf26a7',
  },
  {
    path: 'supabase/migrations/20261002033500_customer_project_center_phase5d_progress_waiting_event.sql',
    blob: 'f7e5f97a6d28bc4f0241d649862c9977f87cf37d',
    sha256:
      'c44d3d313e5b7c247ee3f6406b2fa023fed2ae0f5c53dd9f4f550b26b359bb58',
  },
  {
    path: 'supabase/migrations/20261002050000_customer_project_center_phase5f_customer_followup.sql',
    blob: 'ca48610311bb06d8adc3dc7252398565cb9d5e17',
    sha256:
      '835f390a8d1cca9e7a54080d58a2ae92faa2ede760b6ffb066d81da6fa53978e',
  },
  {
    path: 'supabase/migrations/20261002065000_customer_project_center_phase6b_reschedule_rpc.sql',
    blob: 'af33ebdf7f8847846243b68e79cd0cbe3135ee48',
    sha256:
      '31c039394e142fa45f5b87dfddb675affbd5f1ea5d13c63e76ec3132b3686bef',
  },
  {
    path: 'supabase/migrations/20261002073000_customer_project_center_phase6c_ai_drafts.sql',
    blob: '31f525111c01f12bf250eaa9a7134975fd7d987a',
    sha256:
      'f75e2d58438f925f78d3309ef167101c3945d37289638d3aabeb1ad04889f4ec',
  },
  {
    path: 'supabase/migrations/20261002090000_customer_project_center_phase7a_reports.sql',
    blob: '96ce47615ed013934f70e9b439064e0aecf762c2',
    sha256:
      '2c9ad22c3183da751acc718f5a80fd6fbf1cb16dee2438b8b69e23dc9d1caf01',
  },
  {
    path: 'supabase/migrations/20261006140000_customer_project_center_pilot_env_hardening.sql',
    blob: '740b4149717a34b62aef96d3ecfdae1b05d8990c',
    sha256:
      'a7960fa80d3294ca70b180bcfe45b066e03b9fa9fbd66bb3015df5c34f1cc5a0',
  },
  {
    path: 'supabase/migrations/20261007020000_customer_project_center_project_create_replay_guard.sql',
    blob: '0ab44fb7bf63d4e23d36fcebdb2506d910e4fd4d',
    sha256:
      '9581cfc72897dd0088023f98ea672740b8dee9c550b68436555a56dcb1cae143',
  },
];

console.log('\n=== CPC Production Readiness Repository Contract ===');

for (const doc of docs) {
  assert(fs.existsSync(doc), 'readiness document exists: ' + doc);
}

const sqlManifest = fs.readFileSync(docs[0], 'utf8');
const devHistory = fs.readFileSync(docs[1], 'utf8');
const cleanRoom = fs.readFileSync(docs[2], 'utf8');
const vercelManifest = fs.readFileSync(docs[3], 'utf8');
const gateChecklist = fs.readFileSync(docs[4], 'utf8');

assert(
  sqlManifest.includes(candidateSha),
  'SQL manifest records the exact candidate master SHA',
);
assert(
  sqlManifest.includes('This document is a future human execution plan. It is not Production execution authorization.'),
  'SQL manifest disclaims execution authorization',
);
assert(
  sqlManifest.includes('Gate A permits catalog, ACL, RLS, migration-history, index, and advisor') &&
    sqlManifest.includes('Do not call `cpc_create_project` in Production') &&
    sqlManifest.includes('All write, replay, and concurrency proof is performed in the disposable'),
  'SQL manifest separates read-only Production assertions from clean-room behavior proof',
);
assert(
  devHistory.includes('MIGRATION_REPAIR_EXECUTED = NO'),
  'dev history plan explicitly does not execute repair',
);
assert(
  cleanRoom.includes('REHEARSAL_EXECUTED = NO'),
  'clean-room plan honestly records that no rehearsal was executed',
);
assert(
  cleanRoom.includes('may incur cost and requires separate') &&
    cleanRoom.includes('cost confirmation'),
  'clean-room plan records separate cost confirmation',
);
assert(
  cleanRoom.includes('Production Gate A remains read-only') &&
    cleanRoom.includes('write, replay/idempotency, stale-version, and concurrency proof results'),
  'clean-room plan owns write, replay, and concurrency proof',
);
assert(
  vercelManifest.includes('VERCEL_PRODUCTION_CHANGED = NO'),
  'Vercel manifest records no Production mutation',
);
assert(
  vercelManifest.includes('A Preview deployment is not a staged Production build') &&
    vercelManifest.includes('`vercel --prod --skip-domain`') &&
    vercelManifest.includes('requires explicit Gate B owner authorization before it is created'),
  'Vercel manifest distinguishes Preview from authorized staged Production build',
);
assert(
  vercelManifest.includes('separate live-domain promotion approval') &&
    vercelManifest.includes('This global public') &&
    vercelManifest.includes('COHORT_GATE_LIMITATION = NONE'),
  'Vercel manifest separates promotion and constrains the global feature flag',
);
assert(
  gateChecklist.includes('Gate A: Production SQL / RLS') &&
    gateChecklist.includes('Gate B: Production Vercel Env / Deployment') &&
    gateChecklist.includes('Gate C: Internal Cohort / Go-Live'),
  'gate checklist contains all three gates',
);
assert(
  gateChecklist.includes('Production Gate A is read-only') &&
    gateChecklist.includes('No write, RPC replay, or concurrency test was run against Production'),
  'gate checklist keeps Production Gate A read-only',
);
assert(
  gateChecklist.includes('Preview deployment evidence is not treated as equivalent') &&
    gateChecklist.includes('Live-domain promotion has separate owner authorization'),
  'gate checklist separates staged builds and live promotion',
);
assert(
  gateChecklist.includes('independently verified server-side cohort access gate') &&
    gateChecklist.includes('COHORT_GATE_LIMITATION = NONE') &&
    gateChecklist.includes('broad activation remains') &&
    gateChecklist.includes('CLOSED'),
  'gate checklist does not confuse a public flag with cohort restriction',
);

let previousIndex = -1;
for (const file of files) {
  const exists = fs.existsSync(file.path);
  assert(exists, 'candidate file exists: ' + file.path);
  if (!exists) continue;

  const contents = fs.readFileSync(file.path);
  const text = contents.toString('utf8');
  const gitBlob = execFileSync('git', ['hash-object', file.path], {
    encoding: 'utf8',
  }).trim();
  const sha256 = createHash('sha256').update(contents).digest('hex');

  assert(gitBlob === file.blob, 'Git blob SHA matches: ' + file.path);
  assert(sha256 === file.sha256, 'SHA-256 matches: ' + file.path);
  assert(
    sqlManifest.includes(file.path),
    'SQL manifest includes candidate path: ' + file.path,
  );
  assert(
    sqlManifest.includes(file.blob),
    'SQL manifest includes candidate blob SHA: ' + file.path,
  );
  assert(
    sqlManifest.includes(file.sha256),
    'SQL manifest includes candidate SHA-256: ' + file.path,
  );

  const orderIndex = sqlManifest.indexOf(file.path);
  assert(orderIndex > previousIndex, 'SQL manifest preserves order: ' + file.path);
  previousIndex = orderIndex;

  const executable = stripComments(text);
  assert(
    !/\bDROP\s+(?:TABLE|SCHEMA)\b/i.test(executable),
    'no executable DROP TABLE/SCHEMA: ' + file.path,
  );
  assert(
    !/\bTRUNCATE\b/i.test(executable),
    'no executable TRUNCATE: ' + file.path,
  );
  assert(
    !/\bDELETE\s+FROM\b/i.test(executable),
    'no executable DELETE FROM: ' + file.path,
  );
  assert(
    !/\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(executable),
    'no executable RLS disable: ' + file.path,
  );
}

console.log(
  'CPC production readiness repository contract: ' +
    passed +
    ' passed, ' +
    failed +
    ' failed',
);

if (failed > 0) process.exit(1);
