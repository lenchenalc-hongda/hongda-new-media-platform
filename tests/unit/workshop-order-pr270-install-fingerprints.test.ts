import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const files = [
  'docs/workshop-order-system/nonproduction-only/WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql',
  'docs/workshop-order-system/codex-v1-integration/rc-sql/qa_m2_install_rollback.sql',
  'docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_NOT_INSTALLED.sql',
  'docs/workshop-order-system/nonproduction-only/wos_qa_revision_images_QA_ONLY_ROLLBACK_NOT_INSTALLED.sql',
] as const;

function fingerprints(path: string) {
  const bytes = readFileSync(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const gitBlob = createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
  return { sha256, gitBlob };
}

const installPlan = readFileSync(
  'docs/workshop-order-system/codex-v1-integration/RC_QA_INSTALL_PLAN.md',
  'utf8',
);
const manifest = readFileSync(
  'docs/workshop-order-system/codex-v1-integration/RC_MANIFEST.md',
  'utf8',
);
const pg17Script = readFileSync(
  'tests/sql/wos-pr270-p1-p2-regression-pg17.sh',
  'utf8',
);

assert(installPlan.includes('CURRENT_PR: #270'));
assert(installPlan.includes('PR269_STATUS: `CLOSED_UNMERGED_HISTORICAL`'));
assert(installPlan.includes('INSTALL_STATUS: `NOT_AUTHORIZED`'));
assert(installPlan.includes('INSTALL_AUTHORIZED: NO'));
assert(installPlan.includes('QA_INSTALL_AUTHORIZED: NO'));
assert(!installPlan.includes('f4058b51caccc27805c89a74bfa8d0cd49238b82'));
assert(!installPlan.includes('3f356f7b12d385b1fff370cad7f064649eb4e90ddb193c79d13fa0f35524e298'));
assert(manifest.includes('ACTIVE_DRAFT_PR: #270'));
assert(!manifest.includes('FIX_HEAD_NOT_PUSHED'));
assert(manifest.includes(
  'SOURCE_REVIEW_HEAD_6003371530: `b168044ea95019d620b8aefade1a3afa6665f894`',
));
assert(manifest.includes(
  'TECHNICAL_REVIEW_6003584584_HEAD: `a08523f525e6649f7489018ace4546e217917e7e`',
));
assert(installPlan.includes(
  'HISTORICAL_SOURCE_REVIEW_HEAD_6003371530: `b168044ea95019d620b8aefade1a3afa6665f894`',
));
assert(installPlan.includes(
  'TECHNICAL_REVIEW_6003584584_HEAD: `a08523f525e6649f7489018ace4546e217917e7e`',
));
assert(manifest.includes('git rev-parse HEAD'));
assert(installPlan.includes('git rev-parse HEAD'));
assert(/CURRENT_DRAFT_INTEGRATION_CANDIDATE/.test(manifest));
assert(/current effective Draft integration candidate/.test(manifest));
assert(/current effective Draft integration candidate/.test(installPlan));
assert(!/CURRENT_(INTEGRATION|INSTALL)_HEAD:\s*`?[0-9a-f]{40}/.test(manifest));
assert(!/CURRENT_(INTEGRATION|INSTALL)_HEAD:\s*`?[0-9a-f]{40}/.test(installPlan));
assert(!pg17Script.includes('\n  else\n    psql '));
assert(pg17Script.includes("WOS_PG_DOCKER_CONTAINER_REQUIRED"));
assert(pg17Script.includes("LOCAL_DOCKER_SOCKET_REQUIRED"));
assert(pg17Script.includes("CONTAINER_IMAGE_NOT_POSTGRES17_ALPINE"));
assert(pg17Script.includes("CONTAINER_NETWORK_NOT_DISABLED"));
assert(pg17Script.includes("DISPOSABLE_CONTAINER_LABEL_REQUIRED"));
assert(pg17Script.includes("TEST_PURPOSE_LABEL_REQUIRED"));
assert(pg17Script.includes("current_setting('server_version_num')"));
assert(pg17Script.includes('shobj_description'));
assert(pg17Script.includes('WOS_PG17_CLEANUP_REFUSED_NOT_OWNED'));
assert(
  pg17Script.indexOf("WOS_PG_DOCKER_CONTAINER_REQUIRED")
    < pg17Script.indexOf('CREATE DATABASE'),
);
assert(
  pg17Script.indexOf("CONTAINER_NETWORK_NOT_DISABLED")
    < pg17Script.indexOf('CREATE DATABASE'),
);

for (const path of files) {
  const actual = fingerprints(path);
  assert(
    installPlan.includes(actual.gitBlob),
    `install plan missing current Git blob for ${path}`,
  );
  assert(
    installPlan.includes(actual.sha256),
    `install plan missing current SHA-256 for ${path}`,
  );
  assert(
    manifest.includes(actual.gitBlob) && manifest.includes(actual.sha256),
    `manifest missing current fingerprint for ${path}`,
  );
}

for (const historical of [
  'RC_GITHUB_HANDOFF_FINAL.md',
  'RC_GITHUB_INTEGRATION_PLAN.md',
  'RC_INDEPENDENT_AUDIT_SUBSTITUTE_REQUEST.md',
  'RC_INDEPENDENT_AUDIT_RESULT_20261121.md',
  'RC_OWNER_APPROVAL_REQUEST.md',
  'RC_OWNER_WRITER_CONTRACT_EXCEPTION.md',
  'RC_RELEASE_BLOCKERS.md',
  'RC_SECURITY_AUDIT.md',
]) {
  const text = readFileSync(
    `docs/workshop-order-system/codex-v1-integration/${historical}`,
    'utf8',
  );
  assert(text.includes('HISTORICAL_ARCHIVE: YES'), `${historical} not marked historical`);
  assert(text.includes('PR269_STATUS: CLOSED_UNMERGED'), `${historical} PR269 status stale`);
  assert(
    text.includes('NOT_CURRENT_INSTALL_AUTHORITY'),
    `${historical} still appears current`,
  );
}

console.log('workshop-order-pr270-install-fingerprints.test.ts: PASS');
console.log('WOS_PR270_CURRENT_SQL_FINGERPRINTS=PASS');
