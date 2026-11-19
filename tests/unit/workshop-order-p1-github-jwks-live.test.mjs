import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { fetchGithubIssuerJwks, verifyGithubOidc } from '../../src/lib/workshop-orders/qa-cloud-reaper/attestation.mjs';

const issuer='https://token.actions.githubusercontent.com';
const discovery={
 issuer,jwks_uri:issuer+'/.well-known/jwks',
 id_token_signing_alg_values_supported:['RS256']
};
const publicJwk=generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({format:'jwk'});
const key={...publicJwk,kty:'RSA',alg:'RS256',use:'sig',kid:'synthetic-github-kid-for-negative'};
const ok=(x)=>new Response(JSON.stringify(x),{status:200,headers:{'content-type':'application/json'}});
const mock=(d=discovery,k={keys:[key]})=>async (url)=>{
 if(url===issuer+'/.well-known/openid-configuration')return ok(d);
 if(url===issuer+'/.well-known/jwks')return ok(k);
 throw Error('UNEXPECTED_UNTRUSTED_URL');
};
function deny(name,run){
 test(name,async()=>await assert.rejects(run,/WOS_HANDOFF_PROOF_/));
}
test('fetches REAL GitHub issuer discovery and live RS256 JWKS without a JWT',async()=>{
 const keys=await fetchGithubIssuerJwks();
 assert.ok(keys.githubJwks.length>=1);
 assert.ok(keys.githubJwks.every(k=>k.kty==='RSA'&&k.alg==='RS256'));
 assert.ok(keys.githubJwks.every(k=>typeof k.kid==='string'));
 console.log('WOS_P1_REAL_GITHUB_OIDC_JWKS=PASS key_count='+keys.githubJwks.length);
});
deny('issuer discovery must not be substituted',async()=>fetchGithubIssuerJwks(mock({...discovery,issuer:'https://evil.example'})));
deny('jwks uri cannot be redirected',async()=>fetchGithubIssuerJwks(mock({...discovery,jwks_uri:'https://evil.example/jwks'})));
deny('issuer cannot offer alg none instead of RS256',async()=>fetchGithubIssuerJwks(mock({...discovery,id_token_signing_alg_values_supported:['none']})));
deny('duplicate JWKS kid cannot be trusted',async()=>fetchGithubIssuerJwks(mock(discovery,{keys:[key,key]})));
deny('missing JWT must always fail despite real trust keys',async()=>{
 const trust=await fetchGithubIssuerJwks();
 verifyGithubOidc('fake.github-actions[bot].token',trust,{},Math.floor(Date.now()/1000));
});
console.log('WOS_P1_GITHUB_ISSUER_TRUST_NEGATIVE=READY count=5');
