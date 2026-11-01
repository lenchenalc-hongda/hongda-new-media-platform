import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import {MemoryControlStore} from '../src/core.mjs';
import {verifyGithubDelivery,ingestGithubDelivery} from '../src/github-webhook.mjs';
import {verifyGithubOidc} from '../src/oidc.mjs';

const secret='synthetic-nonproduction-webhook-secret-value';
const delivery='ab4a7e44-4c9e-4899-a918-3e3f17c496a1';
function signedDelivery(raw,{overrideSignature,event='workflow_run'}={}) {
  return {raw,secret,headers:{
    'x-github-event':event,'x-github-delivery':delivery,
    'x-hub-signature-256':overrideSignature||'sha256='+createHmac('sha256',secret).update(raw).digest('hex'),
  }};
}

test('P2: signature is validated against original raw body, duplicate GitHub delivery is idempotent',async()=>{
  const raw=Buffer.from('{"action":"completed","workflow_run":{"id":4}}');
  const verified=verifyGithubDelivery(signedDelivery(raw));
  assert.equal(verified.ok,true);
  const store=new MemoryControlStore();
  assert.deepEqual(await ingestGithubDelivery(store,verified),{accepted:true,duplicate:false});
  assert.deepEqual(await ingestGithubDelivery(store,verified),{accepted:true,duplicate:true});
  assert.equal(store.events.size,1);
  assert.equal(verifyGithubDelivery(signedDelivery(Buffer.from('{"action":"different"}'),{
    overrideSignature:signedDelivery(raw).headers['x-hub-signature-256'],
  })).reason,'SIGNATURE_MISMATCH');
  assert.equal(verifyGithubDelivery(signedDelivery(raw,{event:'issues'})).reason,'EVENT_NOT_ALLOWLISTED');
});

const audience='hongda-agent-control-v3-nonproduction';
const repo='lenchenalc-hongda/hongda-new-media-platform';
const sha='f'.repeat(40),runId=12345678;
const ref='refs/heads/master';
const workflowRef=`${repo}/.github/workflows/agent-control-v3-worker.yml@${ref}`;
const expected={audience,repositoryId:'984321',repositoryOwnerId:'91213',repository:repo,
  ref,sha,workflowRef,runId};

async function jwtFixture(overrides={}) {
  const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await webcrypto.subtle.exportKey('jwk',pair.publicKey);
  jwk.kid='synthetic-testing-key';jwk.alg='RS256';jwk.use='sig';
  const now=Math.floor(Date.now()/1000);
  const payload={iss:'https://token.actions.githubusercontent.com',aud:audience,
    repository_id:expected.repositoryId,repository_owner_id:expected.repositoryOwnerId,
    repository:repo,event_name:'workflow_dispatch',ref,sha,workflow_ref:workflowRef,
    run_id:String(runId),iat:now,nbf:now,exp:now+300,...overrides};
  const header={typ:'JWT',alg:'RS256',kid:jwk.kid};
  const a=Buffer.from(JSON.stringify(header)).toString('base64url');
  const b=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,Buffer.from(`${a}.${b}`));
  return {token:`${a}.${b}.${Buffer.from(signature).toString('base64url')}`,jwks:{keys:[jwk]}};
}

test('P2: signed OIDC JWT binds exact repository ID, workflow, master, HEAD and run ID',async()=>{
  const {token,jwks}=await jwtFixture();
  const correct=await verifyGithubOidc(token,{jwks,expected});
  assert.equal(correct.ok,true);
  assert.equal(correct.identity.runId,String(runId));
  assert.equal((await verifyGithubOidc(token,{jwks,expected:{...expected,runId:runId+1}})).reason,
    'REPOSITORY_WORKFLOW_REF_SHA_OR_RUN_MISMATCH');
  assert.equal((await verifyGithubOidc(token,{jwks,expected:{...expected,repositoryId:'other'}})).ok,false);
  assert.equal((await verifyGithubOidc(token,{jwks,expected:{...expected,sha:'a'.repeat(40)}})).ok,false);
  const parts=token.split('.');
  const payload=JSON.parse(Buffer.from(parts[1],'base64url'));
  payload.repository='attacker/repo';
  parts[1]=Buffer.from(JSON.stringify(payload)).toString('base64url');
  assert.equal((await verifyGithubOidc(parts.join('.'),{jwks,expected})).reason,'SIGNATURE_INVALID');
});

test('P2: signed token from a foreign workflow or wrong event is rejected',async()=>{
  const foreign=await jwtFixture({workflow_ref:`${repo}/.github/workflows/owner-decision.yml@${ref}`});
  assert.equal((await verifyGithubOidc(foreign.token,{jwks:foreign.jwks,expected})).ok,false);
  const wrongEvent=await jwtFixture({event_name:'issue_comment'});
  assert.equal((await verifyGithubOidc(wrongEvent.token,{jwks:wrongEvent.jwks,expected})).ok,false);
  const expired=await jwtFixture({iat:Math.floor(Date.now()/1000)-700,exp:Math.floor(Date.now()/1000)-600});
  assert.equal((await verifyGithubOidc(expired.token,{jwks:expired.jwks,expected})).ok,false);
});
