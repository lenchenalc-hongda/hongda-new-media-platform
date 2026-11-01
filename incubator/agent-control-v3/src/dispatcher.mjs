import {verifyGithubOidc} from './oidc.mjs';

/**
 * P2 dispatch uses the durable outbox. A 204 response has no Run ID: never
 * treat it as successful execution or automatically retry a timed-out POST.
 * No network call runs unless remoteDispatchEnabled is explicitly true.
 */
export async function dispatchOutboxOnce({store,github,opKey,remoteDispatchEnabled=false}) {
  if(!remoteDispatchEnabled)return {status:'DISABLED_SAFE_DEFAULT'};
  if(!github || typeof github.dispatchWorkflow!=='function')
    return {status:'BLOCKED_MISSING_GITHUB_ADAPTER'};
  const claim=await store.startDispatch(opKey);
  if(!claim.ok)return {status:'NOT_DISPATCHABLE',reason:claim.reason};
  try {
    const reply=await github.dispatchWorkflow({
      taskId:claim.op.taskId,leaseEpoch:claim.op.epoch,opKey,
    });
    await store.acknowledgeAmbiguous(opKey);
    return {status:'AWAITING_SIGNED_RUN_PROOF',httpAccepted:reply?.status===204};
  } catch {
    await store.acknowledgeAmbiguous(opKey);
    return {status:'RECONCILING_AMBIGUOUS_HTTP',retryDispatch:false};
  }
}

/**
 * A GitHub action run number, bot comment, metadata record or boolean flag is
 * insufficient. Require a validated exact workflow OIDC JWT for this proof.
 * Caller supplies expectedIdentity and trusted JWKS from SERVER configuration.
 */
export async function reconcileGithubRun({store,github,opKey,expectedIdentity,jwks}) {
  if(!github || typeof github.findRunProof!=='function' || !expectedIdentity || !jwks)
    return {status:'BLOCKED_NO_IDENTITY_CONFIGURATION'};
  const op=store.listOutbox().find(o=>o.opKey===opKey);
  if(!op || op.status!=='AMBIGUOUS')return {status:'NOT_RECONCILABLE'};
  const proof=await github.findRunProof({opKey,expectedIdentity});
  if(!proof || proof.opKey!==opKey || proof.epoch!==op.epoch ||
     !Number.isSafeInteger(proof.runId) || !proof.oidcJwt)
    return {status:'AMBIGUOUS_HOLD',retryDispatch:false};
  const identity=await verifyGithubOidc(proof.oidcJwt,{
    jwks,expected:{...expectedIdentity,runId:proof.runId},
  });
  if(!identity.ok)return {status:'UNTRUSTED_RUN_PROOF',reason:identity.reason,
    retryDispatch:false};
  const bound=await store.bindAttestedRun(opKey,{
    epoch:op.epoch,runId:proof.runId,verified:true,
  });
  return bound.ok?{status:'RUN_BOUND',runId:proof.runId}:
    {status:'RECONCILING',reason:bound.reason};
}
