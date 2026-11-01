import {webcrypto} from 'node:crypto';
import {sha40} from './policy.mjs';

const decode = part => JSON.parse(Buffer.from(part,'base64url').toString('utf8'));
const issuer='https://token.actions.githubusercontent.com';

/**
 * Validate a signed GitHub-issued ID token against a SERVER-provided trusted
 * JWKS and an exact expected workflow identity. Never load JWK URLs out of the
 * untrusted JWT header. Deployment must fetch & cache JWKS from a pinned issuer.
 */
export async function verifyGithubOidc(jwt,{jwks,expected,nowSeconds=Math.floor(Date.now()/1000)}={}) {
  const block=reason=>({ok:false,reason});
  if(typeof jwt!=='string'||jwt.length>12000||!jwks?.keys||!expected)
    return block('BAD_TOKEN_OR_TRUST_CONFIGURATION');
  const parts=jwt.split('.');
  if(parts.length!==3)return block('MALFORMED_JWT');
  let header,claims;
  try {header=decode(parts[0]);claims=decode(parts[1]);}catch{return block('INVALID_JWT_JSON');}
  if(header.alg!=='RS256'||header.typ!=='JWT'||typeof header.kid!=='string')
    return block('UNSUPPORTED_JWT_ALGORITHM');
  const jwk=jwks.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig'&&
                                k.alg==='RS256');
  if(!jwk)return block('UNTRUSTED_JWK_KEY');
  let validSignature=false;
  try {
    const publicKey=await webcrypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    validSignature=await webcrypto.subtle.verify('RSASSA-PKCS1-v1_5',publicKey,
      Buffer.from(parts[2],'base64url'),Buffer.from(`${parts[0]}.${parts[1]}`));
  } catch {return block('JWK_SIGNATURE_VERIFICATION_ERROR');}
  if(!validSignature)return block('SIGNATURE_INVALID');
  if(claims.iss!==issuer||claims.aud!==expected.audience||
     !Number.isSafeInteger(claims.iat)||!Number.isSafeInteger(claims.exp)||
     claims.exp<=nowSeconds||claims.iat>nowSeconds+60||
     claims.exp-claims.iat>900 ||
     (claims.nbf!==undefined&&claims.nbf>nowSeconds+60))
    return block('CLAIM_TIME_ISSUER_OR_AUDIENCE_INVALID');
  if(claims.repository_id!==String(expected.repositoryId)||
     claims.repository!==expected.repository||
     claims.repository_owner_id!==String(expected.repositoryOwnerId)||
     claims.event_name!=='workflow_dispatch'||
     claims.ref!==expected.ref||
     claims.workflow_ref!==expected.workflowRef||
     claims.sha!==expected.sha||
     claims.run_id!==String(expected.runId)||
     !sha40.test(String(claims.sha||'')))
    return block('REPOSITORY_WORKFLOW_REF_SHA_OR_RUN_MISMATCH');
  if(!/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(claims.ref)||
     !claims.workflow_ref.endsWith('@'+claims.ref) ||
     expected.ref!=='refs/heads/master')return block('WORKFLOW_REF_NOT_PROTECTED_MASTER');
  // No reliance on github-actions[bot] comments, timestamps or run metadata alone.
  return {ok:true,reason:'GITHUB_SIGNED_EXACT_RUN_IDENTITY',identity:{
    repository:claims.repository,repositoryId:claims.repository_id,runId:claims.run_id,
    sha:claims.sha,workflowRef:claims.workflow_ref,ref:claims.ref,
  }};
}
