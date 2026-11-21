import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  'docs/workshop-order-system/nonproduction-only/wos_p7_private_storage.sql',
  'utf8',
);
const count = (value: string) => sql.split(value).length - 1;

assert.equal(count('CREATE TABLE public.wos_qa_verified_image_proofs ('), 1);
assert.equal(count('CREATE OR REPLACE FUNCTION public.wos_qa_get_storage_object_for_proof('), 1);
assert.equal(count('CREATE OR REPLACE FUNCTION public.wos_register_uploaded_reference_image('), 1);
assert.equal(count('$fn$'), 2, 'registration function dollar quote must be balanced');
assert.equal(count('$wos$'), 2, 'proof lookup function dollar quote must be balanced');
assert.equal(count('$bucket$'), 2, 'bucket block dollar quote must be balanced');
assert.equal(count('BEGIN;'), 1);
assert.equal(count('COMMIT;'), 1);
assert(sql.trimEnd().endsWith('COMMIT;'));
assert(sql.includes("verified_sha256 text NOT NULL CHECK (verified_sha256 ~ '^[a-f0-9]{64}$')"));
assert(sql.includes('QA_TRUSTED_BINARY_PROOF_REQUIRED'));
assert(!sql.includes("TO authenticated;\n),\n  verified_at timestamptz"));
assert(!/^\s*GRANT\s+(INSERT|UPDATE|DELETE)\s+ON\s+storage\.objects/m.test(sql));

console.log('workshop-order-p7-storage-sql-syntax.test.ts: PASS');
console.log('WOS_P7_STORAGE_SQL_STRUCTURE=PASS');
