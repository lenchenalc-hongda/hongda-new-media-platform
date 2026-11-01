/**
 * The P2 dispatcher uses an outbox, never a GitHub Issue JSON write. A 204
 * workflow dispatch has no run ID: outcomes are AMBIGUOUS until separately
 * correlated with signed run identity. No network operation runs in dry-run.
 */
export async function dispatchOutboxOnce({store,github,opKey,remoteDispatchEnabled=false}) {
  if(!remoteDispatchEnabled)return {status:'DISABLED_SAFE_DEFAULT'};
  if(!github || typeof github.dispatchWorkflow!=='function')
    return {status:'BLOCKED_MISSING_GITHUB_ADAPTER'};
  const claim=await store.startDispatch(opKey);
  if(!claim.ok)return {status:'NOT_DISPATCHABLE',reason:claim.reason};
  try {
    const reply=await github.dispatchWorkflow({
      taskId:claim.op.taskId,
      leaseEpoch:claim.op.epoch,
      opKey,
    });
    await store.acknowledgeAmbiguous(opKey);
    return {status:'AWAITING_ATTESTED_RUN',httpAccepted:reply?.status===204};
  } catch {
    await store.acknowledgeAmbiguous(opKey);
    return {status:'RECONCILING_AMBIGUOUS_HTTP',retryDispatch:false};
  }
}

export async function reconcileGithubRun({store,github,opKey,expectedIdentity}) {
  if(!github || typeof github.findAttestedRun!=='function')
    return {status:'BLOCKED_NO_RUN_ATTESTATION'};
  const op=store.listOutbox().find(o=>o.opKey===opKey);
  if(!op || op.status!=='AMBIGUOUS')return {status:'NOT_RECONCILABLE'};
  const proof=await github.findAttestedRun({opKey,expectedIdentity});
  if(!proof || proof.status!=='ATTESTED' || proof.opKey!==opKey ||
     proof.epoch!==op.epoch || !Number.isSafeInteger(proof.runId))
    return {status:'AMBIGUOUS_HOLD',retryDispatch:false};
  const bound=await store.bindAttestedRun(opKey,{
    epoch:op.epoch,runId:proof.runId,verified:true,
  });
  return bound.ok?{status:'RUN_BOUND',runId:proof.runId}:
    {status:'RECONCILING',reason:bound.reason};
}
