import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyHandoffProof, digest } from '../../src/lib/workshop-orders/qa-cloud-reaper/attestation.mjs';

const now=1795096200; // synthetic clock, synthetic keys, no real OIDC
const repo='lenchenalc-hongda/hongda-new-media-platform';
const head='598b8db300e43ab7011d1cb383d99af6242441c8';
const workflowSha='5ac678a50af6391efbdfb0258f037cbdeb2e18d6';
const workflowRef=repo+'/.github/workflows/wos-p1-qa-handoff-review.yml@refs/heads/master';
const expected={head,workflowRef,workflowSha,runId:33445599,runAttempt:1,
 epoch:7,toPr:300,subject:'repo:'+repo+':ref:refs/heads/master'};
const gh=generateKeyPairSync('rsa',{modulusLength:2048});
const at=generateKeyPairSync('ed25519');
const rev=generateKeyPairSync('ed25519');
const foreign=generateKeyPairSync('ed25519');
const jwk=gh.publicKey.export({format:'jwk'});
const trust={githubJwks:[{...jwk,kid:'github-oidc-test-key',alg:'RS256',use:'sig'}],
 attestorPublicKey:at.publicKey,reviewerPublicKey:rev.publicKey};
const claims={
 iss:'https://token.actions.githubusercontent.com',aud:'hongda-wos-p1-handoff-v1',
 sub:expected.subject,repository:repo,repository_id:'1286793274',
 repository_owner_id:'297604134',ref_protected:'true',
 ref:'refs/heads/master',event_name:'workflow_dispatch',
 workflow_ref:workflowRef,workflow_sha:workflowSha,sha:workflowSha,
 run_id:33445599,run_attempt:1,runner_environment:'github-hosted',
 iat:now-20,nbf:now-20,exp:now+120,jti:'synthetic-jti-unique-123456'};
const b64=s=>Buffer.from(s).toString('base64url');
function jwt(c=claims,key=gh.privateKey,h={alg:'RS256',typ:'JWT',kid:'github-oidc-test-key'}){
 const body=b64(JSON.stringify(h))+'.'+b64(JSON.stringify(c));
 return body+'.'+sign('RSA-SHA256',Buffer.from(body),key).toString('base64url');
}
function canonical(v){
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 if(v===null||typeof v!=='object')return JSON.stringify(v);
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
}
function signed(payload,privateKey){
 return {payload,signature:sign(null,Buffer.from(canonical(payload)),privateKey).toString('base64url')};
}
const a={kind:'handoff-attestor',version:1,repository:repo,repositoryId:'1286793274',
 resource:'hongda-wos-p1-shared-infra',workflowRef,head,workflowSha,runId:33445599,
 runAttempt:1,oidcJti:claims.jti,epoch:7,fromPr:202,toPr:300,
 ownerDecisionDigest:'1'.repeat(64),issuedAt:now-10,expiresAt:now+60};
const r={kind:'handoff-reviewer',version:1,repository:repo,
 resource:'hongda-wos-p1-shared-infra',head,workflowSha,epoch:7,attestorDigest:digest(a),
 decision:'PASS',reviewerIdentity:'independent-reviewer',issuedAt:now-10,expiresAt:now+60};
function proof(c=claims,pa=a,pr=r){
 return {oidcJwt:jwt(c),attestor:signed(pa,at.privateKey),reviewer:signed(pr,rev.privateKey)};
}
function deny(name,fn){test(name,()=>assert.throws(fn,/WOS_HANDOFF_PROOF_/))}
test('valid synthetic GitHub RSA+two independent Ed25519 proofs',()=>{
 const verified=verifyHandoffProof(proof(),trust,expected,now);
 assert.equal(verified.epoch,7);assert.equal(verified.toPr,300);
 assert.match(verified.operationDigest,/^[a-f0-9]{64}$/);
});
deny('foreign issuer',()=>verifyHandoffProof(proof({...claims,iss:'https://evil.test'}),trust,expected,now));
deny('foreign audience',()=>verifyHandoffProof(proof({...claims,aud:'another'}),trust,expected,now));
deny('foreign repo ID',()=>verifyHandoffProof(proof({...claims,repository_id:'77'}),trust,expected,now));
deny('wrong workflow',()=>verifyHandoffProof(proof({...claims,workflow_ref:'untrusted'}),trust,expected,now));
deny('wrong run',()=>verifyHandoffProof(proof({...claims,run_id:33445598}),trust,expected,now));
deny('wrong event',()=>verifyHandoffProof(proof({...claims,event_name:'pull_request'}),trust,expected,now));
deny('wrong branch',()=>verifyHandoffProof(proof({...claims,ref:'refs/heads/dev'}),trust,expected,now));
deny('wrong runtime master SHA',()=>verifyHandoffProof(proof({...claims,sha:'f'.repeat(40)}),trust,expected,now));
deny('expired JWT',()=>verifyHandoffProof(proof({...claims,exp:now-1}),trust,expected,now));
deny('overlong JWT',()=>verifyHandoffProof(proof({...claims,exp:now+1600}),trust,expected,now));
deny('wrong run attempt',()=>verifyHandoffProof(proof({...claims,run_attempt:2}),trust,expected,now));
deny('forged JWT signature',()=>{
 const fake=generateKeyPairSync('rsa',{modulusLength:2048});
 verifyHandoffProof({...proof(),oidcJwt:jwt(claims,fake.privateKey)},trust,expected,now);
});
deny('unknown JWK kid',()=>verifyHandoffProof({...proof(),
 oidcJwt:jwt(claims,gh.privateKey,{alg:'RS256',typ:'JWT',kid:'untrusted'})},trust,expected,now));
deny('alg none rejected',()=>verifyHandoffProof({...proof(),
 oidcJwt:jwt(claims,gh.privateKey,{alg:'none',typ:'JWT',kid:'github-oidc-test-key'})},trust,expected,now));
deny('stale epoch in attestor',()=>verifyHandoffProof(proof(claims,{...a,epoch:6}),trust,expected,now));
deny('wrong holder claim',()=>verifyHandoffProof(proof(claims,{...a,fromPr:99}),trust,expected,now));
deny('wrong target claim',()=>verifyHandoffProof(proof(claims,{...a,toPr:999}),trust,expected,now));
deny('reviewer wrong digest',()=>verifyHandoffProof(proof(claims,a,{...r,attestorDigest:'0'.repeat(64)}),trust,expected,now));
deny('reviewer BLOCKED',()=>verifyHandoffProof(proof(claims,a,{...r,decision:'BLOCKED'}),trust,expected,now));
deny('forged reviewer signature',()=>{
 const p=proof();p.reviewer=signed(r,foreign.privateKey);
 verifyHandoffProof(p,trust,expected,now);
});
deny('same signer cannot self review',()=>verifyHandoffProof(proof(),{...trust,reviewerPublicKey:at.publicKey},expected,now));
deny('expired reviewer',()=>verifyHandoffProof(proof(claims,a,{...r,expiresAt:now-1}),trust,expected,now));
deny('reviewer receipt absent',()=>verifyHandoffProof({...proof(),reviewer:null},trust,expected,now));
deny('foreign bot comment citing genuine Run ID only',()=>
 verifyHandoffProof({oidcJwt:'github-actions[bot] run_id=33445599',attestor:null,reviewer:null},trust,expected,now));
deny('wrong signed workflow SHA',()=>verifyHandoffProof(proof({...claims,workflow_sha:head}),trust,expected,now));
deny('unprotected git ref',()=>verifyHandoffProof(proof({...claims,ref_protected:'false'}),trust,expected,now));
deny('foreign repository owner ID',()=>verifyHandoffProof(proof({...claims,repository_owner_id:'123'}),trust,expected,now));
deny('attestor wrongly binds reviewed head as workflow SHA',()=>verifyHandoffProof(proof(claims,{...a,workflowSha:head}),trust,expected,now));
deny('reviewer wrong workflow SHA',()=>verifyHandoffProof(proof(claims,a,{...r,workflowSha:head}),trust,expected,now));
console.log('WOS_P1_SIGNED_WORKFLOW_PROOF_TESTS=COMPLETE');
