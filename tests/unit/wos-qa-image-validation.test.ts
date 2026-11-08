import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifyWosSyntheticPngBinary } from '../../src/lib/workshop-orders/qa-image-validation';

// Public, 1x1 synthetic PNG, never customer data. Same fixture as real browser QA.
const raw = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZ0AAAAASUVORK5CYII=',
  'base64',
);
const digest=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
assert.equal(verifyWosSyntheticPngBinary(raw,digest(raw)),true,'valid PNG + hash allowed');
const brokenCrc=Buffer.from(raw);brokenCrc[29]^=1;
assert.equal(verifyWosSyntheticPngBinary(brokenCrc,digest(brokenCrc)),false,'reject header CRC forgery');
const brokenIdat=Buffer.from(raw);brokenIdat[47]^=1;
assert.equal(verifyWosSyntheticPngBinary(brokenIdat,digest(brokenIdat)),false,'reject IDAT CRC forgery');
const truncated=raw.subarray(0,raw.length-8);
assert.equal(verifyWosSyntheticPngBinary(truncated,digest(truncated)),false,'reject incomplete IEND');
const wrongDigest='0'.repeat(64);
assert.equal(verifyWosSyntheticPngBinary(raw,wrongDigest),false,'reject hash mismatch');
const spoof=Buffer.concat([raw,Buffer.from('<script>bad</script>')]);
assert.equal(verifyWosSyntheticPngBinary(spoof,digest(spoof)),false,'reject trailing payload');
assert.equal(verifyWosSyntheticPngBinary(Buffer.from('not an image'),digest(Buffer.from('not an image'))),false);
const verifier=readFileSync('src/app/api/workshop-orders/qa-image-verify/route.ts','utf8');
const form=readFileSync('src/components/workshop-orders/LiveQaProductionSubmit.tsx','utf8');
assert(verifier.includes('resolveVerifiedSupabaseIdentity'));
assert(verifier.includes("isApprovedWosSandboxUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)"));
assert(verifier.includes("process.env.WOS_P7_NONPROD_SUBMIT_ENABLED!=='true'"));
assert(verifier.includes("order.data.workflow_status!=='DRAFT'"));
assert(verifier.includes('verifyWosSyntheticPngBinary(binary,x.sha256)'));
assert(verifier.includes("client.storage.from('wos-private').download(expected)"));
assert(!verifier.includes('service_role'));
assert(form.includes("fetch('/api/workshop-orders/qa-image-verify'"));
assert(form.includes("proof.code!=='QA_IMAGE_VERIFIED'"));
console.log('WOS_QA_SERVER_PNG_BINARY_INTEGRITY_UNIT=PASS');
