/** WOS P1 offline cryptographic verifier.
 * Real keys must come from a separately deployed trust store; this file alone
 * DOES NOT issue a GitHub OIDC credential or an independent Reviewer approval.
 */
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';

const REPO = 'lenchenalc-hongda/hongda-new-media-platform';
const REPO_ID = '1286793274';
const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'hongda-wos-p1-handoff-v1';
const RESOURCE = 'hongda-wos-p1-shared-infra';
const need=(test,reason)=>{if(!test)throw new Error('WOS_HANDOFF_PROOF_'+reason)};
const sha40=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
const sha64=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
function decoded(s){
 need(typeof s==='string'&&/^[A-Za-z0-9_-]+$/.test(s)&&s.length>0,'INVALID_BASE64URL');
 const b=Buffer.from(s,'base64url');
 need(b.length>0&&b.toString('base64url')===s,'NONCANONICAL_BASE64URL');
 return b;
}
function objpart(s){
 let v;try{v=JSON.parse(decoded(s).toString('utf8'))}catch{throw Error('WOS_HANDOFF_PROOF_INVALID_JSON')}
 need(v&&typeof v==='object'&&!Array.isArray(v),'JSON_NOT_OBJECT');
 return v;
}
function canonical(v){
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
 if(typeof v==='number'){need(Number.isSafeInteger(v),'UNSAFE_NUMBER');return JSON.stringify(v)}
 need(v&&typeof v==='object','INVALID_JSON_VALUE');
 const keys=Object.keys(v).sort();
 need(keys.every(k=>!['__proto__','prototype','constructor'].includes(k)),'INVALID_JSON_KEY');
 return '{'+keys.map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
}
export const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
function pub(k){return k?.type==='public'?k:createPublicKey(k)}

export function verifyGithubOidc(jwt,trust,expected,now){
 need(typeof jwt==='string'&&jwt.length<=20000,'INVALID_JWT');
 const parts=jwt.split('.');
 need(parts.length===3,'INVALID_JWT_SEGMENTS');
 const [a,b,s]=parts,header=objpart(a),claim=objpart(b);
 need(header.typ==='JWT'&&header.alg==='RS256'&&typeof header.kid==='string','INVALID_JWT_HEADER');
 need(Array.isArray(trust?.githubJwks)&&trust.githubJwks.length>0,'MISSING_TRUSTED_JWKS');
 const keys=trust.githubJwks.filter(k=>k.kid===header.kid&&k.kty==='RSA'&&k.alg==='RS256'&&k.use==='sig');
 need(keys.length===1,'UNTRUSTED_GITHUB_KEY');
 let signatureOk=false;
 try{signatureOk=verifySignature('RSA-SHA256',Buffer.from(a+'.'+b),
     createPublicKey({key:keys[0],format:'jwk'}),decoded(s))}catch{}
 need(signatureOk,'INVALID_GITHUB_OIDC_SIGNATURE');
 need(Number.isSafeInteger(now)&&now>0,'INVALID_CLOCK');
 need(claim.iss===ISSUER&&claim.aud===AUDIENCE,'INVALID_ISSUER_OR_AUDIENCE');
 need(Number.isSafeInteger(claim.iat)&&Number.isSafeInteger(claim.nbf)&&Number.isSafeInteger(claim.exp)&&
    claim.iat<=now+30&&claim.nbf<=now&&claim.exp>now&&claim.exp>claim.iat&&claim.exp-claim.iat<=600,
    'EXPIRED_OR_OVERLONG_OIDC');
 const fields=[
    [claim.repository,REPO],[String(claim.repository_id),REPO_ID],
    [claim.ref,'refs/heads/master'],[claim.event_name,'workflow_dispatch'],
    [claim.workflow_ref,expected.workflowRef],[claim.sha,expected.head],
    [String(claim.run_id),String(expected.runId)],
    [String(claim.run_attempt),String(expected.runAttempt)],
    [claim.runner_environment,'github-hosted'],[claim.sub,expected.subject],
 ];
 need(fields.every(([got,want])=>got===want),'OIDC_WORKFLOW_SCOPE_DENIED');
 if(expected.workflowSha)need(claim.workflow_sha===expected.workflowSha,'OIDC_WORKFLOW_SHA_DENIED');
 if(expected.jobWorkflowRef)need(claim.job_workflow_ref===expected.jobWorkflowRef,'OIDC_REUSABLE_WORKFLOW_DENIED');
 need(sha40(expected.head)&&Number.isSafeInteger(expected.runId)&&
    Number.isSafeInteger(expected.runAttempt),'INVALID_EXPECTED_CONTEXT');
 need(typeof claim.jti==='string'&&/^[A-Za-z0-9._:-]{12,128}$/.test(claim.jti),'INVALID_OIDC_JTI');
 return claim;
}
function verifyEnvelope(env,key,kind,now){
 need(env&&typeof env==='object'&&env.payload&&typeof env.signature==='string'&&key,'MISSING_SIGNED_ENVELOPE');
 const p=env.payload;
 need(p.kind===kind&&p.version===1,'WRONG_RECEIPT_KIND');
 need(Number.isSafeInteger(p.issuedAt)&&Number.isSafeInteger(p.expiresAt)&&
    p.issuedAt<=now+30&&p.expiresAt>now&&p.expiresAt>p.issuedAt&&
    p.expiresAt-p.issuedAt<=300,'EXPIRED_OR_OVERLONG_RECEIPT');
 let ok=false;
 try{ok=verifySignature(null,Buffer.from(canonical(p)),pub(key),decoded(env.signature))}catch{}
 need(ok,'RECEIPT_SIGNATURE_INVALID');
 return p;
}
export function verifyHandoffProof({oidcJwt,attestor,reviewer},trust,expected,now){
 need(trust?.attestorPublicKey&&trust?.reviewerPublicKey,'MISSING_INDEPENDENT_KEYS');
 const ka=pub(trust.attestorPublicKey).export({format:'der',type:'spki'}).toString('hex');
 const kr=pub(trust.reviewerPublicKey).export({format:'der',type:'spki'}).toString('hex');
 need(ka!==kr,'SAME_ATTESTOR_AND_REVIEWER_KEY');
 const oidc=verifyGithubOidc(oidcJwt,trust,expected,now);
 const a=verifyEnvelope(attestor,trust.attestorPublicKey,'handoff-attestor',now);
 const r=verifyEnvelope(reviewer,trust.reviewerPublicKey,'handoff-reviewer',now);
 need(a.repository===REPO&&a.repositoryId===REPO_ID&&a.resource===RESOURCE&&
    a.workflowRef===expected.workflowRef&&a.head===expected.head&&
    a.runId===expected.runId&&a.runAttempt===expected.runAttempt&&
    a.oidcJti===oidc.jti&&a.epoch===expected.epoch&&
    a.fromPr===202&&a.toPr===expected.toPr&&sha64(a.ownerDecisionDigest),
    'ATTESTOR_BINDING_DENIED');
 need(r.repository===REPO&&r.resource===RESOURCE&&r.head===expected.head&&
    r.epoch===expected.epoch&&r.attestorDigest===digest(a)&&
    r.decision==='PASS'&&r.reviewerIdentity==='independent-reviewer',
    'REVIEWER_BINDING_DENIED');
 return Object.freeze({
    oidcJti:oidc.jti,attestorDigest:digest(a),reviewerDigest:digest(r),
    epoch:a.epoch,fromPr:a.fromPr,toPr:a.toPr,head:a.head,
    runId:a.runId,operationDigest:digest({oidcJti:oidc.jti,attestor:digest(a),reviewer:digest(r)})
 });
}
