import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isWosQaRevisionImageUploadEnabled } from '../../src/lib/workshop-orders/api-contract';
import {
  evaluateWosQaRevisionImageAccess,
  type WosQaRevisionAccessCode,
  verifyWosSyntheticPngBinary,
} from '../../src/lib/workshop-orders/qa-image-validation';
import {
  evaluateWosQaRevisionImageAccess as evaluateEdgeQaRevisionImageAccess,
} from '../../supabase/functions/wos-p7-verify-image/png';

// Public, 1x1 synthetic PNG, never customer data. Same fixture as real browser QA.
const raw = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
const digest=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
assert.equal(verifyWosSyntheticPngBinary(raw,digest(raw)),true,'valid PNG + hash allowed');
const oldInvalidFixture=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZ0AAAAASUVORK5CYII=','base64');
assert.equal(verifyWosSyntheticPngBinary(oldInvalidFixture,digest(oldInvalidFixture)),false,
  'historical browser fixture has invalid IDAT CRC');
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

const qaUrl='https://xulmpqaknlwqqculbsek.supabase.co';
const organizationId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherOrganizationId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ownerProfileId='11111111-1111-4111-8111-111111111111';
const otherSalesProfileId='22222222-2222-4222-8222-222222222222';
const orderId='33333333-3333-4333-8333-333333333333';
const ownerProfile={id:ownerProfileId,org_id:organizationId,role:'sales'} as const;
const ownerOrder={
  id:orderId,
  organization_id:organizationId,
  created_by_profile_id:ownerProfileId,
  sales_owner_profile_id:ownerProfileId,
  order_number:`QA-NONPROD-${orderId}`,
  version_label:'QA-R6',
  workflow_status:'WAITING_MATERIAL',
} as const;
type AccessInput=Parameters<typeof evaluateWosQaRevisionImageAccess>[0];
const accessCases:Array<[string,AccessInput,WosQaRevisionAccessCode]>=[
  ['QA Preview QA-R6',{
    runtimeAuthorized:true,localRevisionAuthorized:false,qaRevisionAuthorized:true,
    profile:ownerProfile,order:ownerOrder,
  },'ALLOWED_REVISION'],
  ['QA switch off',{
    runtimeAuthorized:true,localRevisionAuthorized:false,qaRevisionAuthorized:false,
    profile:ownerProfile,order:ownerOrder,
  },'REVISION_AUTH_REQUIRED'],
  ['production or wrong project runtime',{
    runtimeAuthorized:false,localRevisionAuthorized:false,qaRevisionAuthorized:true,
    profile:ownerProfile,order:ownerOrder,
  },'RUNTIME_DENIED'],
  ['viewer',{
    runtimeAuthorized:true,localRevisionAuthorized:false,qaRevisionAuthorized:true,
    profile:{...ownerProfile,role:'viewer'},order:ownerOrder,
  },'ROLE_FORBIDDEN'],
  ['cross-organization sales',{
    runtimeAuthorized:true,localRevisionAuthorized:false,qaRevisionAuthorized:true,
    profile:ownerProfile,order:{...ownerOrder,organization_id:otherOrganizationId},
  },'ORGANIZATION_DENIED'],
  ['same-organization non-owner sales',{
    runtimeAuthorized:true,localRevisionAuthorized:false,qaRevisionAuthorized:true,
    profile:{...ownerProfile,id:otherSalesProfileId},order:ownerOrder,
  },'OWNER_DENIED'],
  ['unauthorized DRAFT QA revision',{
    runtimeAuthorized:true,localRevisionAuthorized:false,qaRevisionAuthorized:false,
    profile:ownerProfile,order:{...ownerOrder,workflow_status:'DRAFT'},
  },'DRAFT_VERSION_INVALID'],
  ['ordinary DRAFT V1',{
    runtimeAuthorized:true,localRevisionAuthorized:false,qaRevisionAuthorized:false,
    profile:ownerProfile,order:{...ownerOrder,version_label:'V1',workflow_status:'DRAFT'},
  },'ALLOWED_DRAFT'],
  ['authorized WAITING_MATERIAL with non-revision version',{
    runtimeAuthorized:true,localRevisionAuthorized:false,qaRevisionAuthorized:true,
    profile:ownerProfile,order:{...ownerOrder,version_label:'V1'},
  },'REVISION_VERSION_INVALID'],
  ['local revision authorization',{
    runtimeAuthorized:true,localRevisionAuthorized:true,qaRevisionAuthorized:false,
    profile:ownerProfile,order:ownerOrder,
  },'ALLOWED_REVISION'],
  ['manager boundary',{
    runtimeAuthorized:true,localRevisionAuthorized:false,qaRevisionAuthorized:true,
    profile:{...ownerProfile,role:'manager'},order:ownerOrder,
  },'ALLOWED_REVISION'],
  ['admin boundary',{
    runtimeAuthorized:true,localRevisionAuthorized:false,qaRevisionAuthorized:true,
    profile:{...ownerProfile,role:'admin'},order:ownerOrder,
  },'ALLOWED_REVISION'],
  ['non-QA synthetic order',{
    runtimeAuthorized:true,localRevisionAuthorized:false,qaRevisionAuthorized:true,
    profile:ownerProfile,order:{...ownerOrder,order_number:`REAL-${orderId}`},
  },'ORDER_NUMBER_INVALID'],
  ['unsupported workflow status',{
    runtimeAuthorized:true,localRevisionAuthorized:false,qaRevisionAuthorized:true,
    profile:ownerProfile,order:{...ownerOrder,workflow_status:'SUBMITTED'},
  },'STATUS_INVALID'],
];
for(const [label,input,code] of accessCases){
  const nodeDecision=evaluateWosQaRevisionImageAccess(input);
  const edgeDecision=evaluateEdgeQaRevisionImageAccess(input);
  assert.deepEqual(nodeDecision,{allowed:code.startsWith('ALLOWED_'),code},
    `Next.js API decision: ${label}`);
  assert.deepEqual(edgeDecision,nodeDecision,
    `Edge and Next.js API decisions must match: ${label}`);
}
const environmentCases:Array<[
  string,Parameters<typeof isWosQaRevisionImageUploadEnabled>[0],boolean
]>=[
  ['QA Preview production-mode QA',{
    enabled:'true',vercelEnv:'preview',nodeEnv:'production',supabaseUrl:qaUrl,
  },true],
  ['QA revision switch off',{
    enabled:'false',vercelEnv:'preview',nodeEnv:'production',supabaseUrl:qaUrl,
  },false],
  ['Production runtime',{
    enabled:'true',vercelEnv:'production',nodeEnv:'production',supabaseUrl:qaUrl,
  },false],
  ['wrong Supabase project',{
    enabled:'true',vercelEnv:'preview',nodeEnv:'production',
    supabaseUrl:'https://amqpvxrurenevniilhtl.supabase.co',
  },false],
];
for(const [label,input,expected] of environmentCases){
  assert.equal(isWosQaRevisionImageUploadEnabled(input),expected,label);
}

const verifier=readFileSync('src/app/api/workshop-orders/qa-image-verify/route.ts','utf8');
const form=readFileSync('src/components/workshop-orders/LiveQaProductionSubmit.tsx','utf8');
const edge=readFileSync('supabase/functions/wos-p7-verify-image/index.ts','utf8');
assert(verifier.includes('resolveVerifiedSupabaseIdentity'));
assert(verifier.includes("isApprovedWosSandboxUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)"));
assert(verifier.includes("process.env.WOS_P7_NONPROD_SUBMIT_ENABLED!=='true'"));
assert(verifier.includes("process.env.WOS_ALLOW_LOCAL_SUPABASE==='true'"));
assert(verifier.includes('evaluateWosQaRevisionImageAccess'));
assert(!verifier.includes("!localRevisionUpload && !/^V[1-9]"));
assert(verifier.includes('verifyWosSyntheticPngBinary(binary,x.sha256)'));
assert(verifier.includes("client.storage.from('wos-private').download(expected)"));
assert(!verifier.includes('service_role'));
assert(form.includes("fetch('/api/workshop-orders/qa-image-verify'"));
assert(form.includes("proof.code!=='QA_IMAGE_VERIFIED'"));
assert(verifier.includes('WOS_QA_IMAGE_CATEGORIES')===false);
assert(verifier.includes('buildWosQaImageObjectPath'));
assert(verifier.includes('category:x.category'));
assert(edge.includes("Deno.env.get('WOS_ALLOW_LOCAL_SUPABASE')!=='true'"));
assert(edge.includes("value==='http://kong:8000'"));
assert(edge.includes('evaluateWosQaRevisionImageAccess'));
assert(!edge.includes("!localRevision&&!/^V[1-9]"));
assert(edge.includes("url.hostname==='127.0.0.1'"));
assert(edge.includes("FILM_PATTERN:'film-pattern'"));
console.log(`WOS_QA_REVISION_ACCESS_CASES=${accessCases.length}`);
console.log(`WOS_QA_REVISION_ENVIRONMENT_CASES=${environmentCases.length}`);
console.log('WOS_QA_REVISION_NODE_EDGE_PARITY=PASS');
console.log('WOS_QA_REVISION_GATE_CLOSED_DB_PROOF=PG17_SUITE');
console.log('WOS_QA_SERVER_PNG_BINARY_INTEGRITY_UNIT=PASS');
