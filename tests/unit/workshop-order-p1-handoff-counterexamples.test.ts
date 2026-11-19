// Offline counterexamples show WHY PR #202 is unsafe; this is NOT an attestor.
function must(value: boolean, reason: string): void { if (!value) throw new Error('PR202_COUNTEREXAMPLE_'+reason); }
const watchdogRead = 'OWNER=202;REV=10;OWNER_NOTE=none';
const foreignWriteAfterRead = 'OWNER=202;REV=11;OWNER_NOTE=new-note';
const oldFullBodyPatch = watchdogRead.replace('REV=10','REV=12');
must(foreignWriteAfterRead.includes('new-note') && !oldFullBodyPatch.includes('new-note'), 'LOST_UPDATE_NOT_REPRODUCED');
console.log('PR202_LOST_UPDATE_COUNTEREXAMPLE=PASS (protocol unsafe)');
const realWatchdogRun={id:4242001, workflowId:386198615};
const foreignClaim={bot:'github-actions[bot]', runId:4242001, actualWriter:'agent-control-owner-decision.yml'};
const oldPredicate=foreignClaim.bot==='github-actions[bot]' && foreignClaim.runId===realWatchdogRun.id && realWatchdogRun.workflowId===386198615;
must(oldPredicate && foreignClaim.actualWriter!=='agent-control-reliability-watchdog-v2.yml','FOREIGN_WORKFLOW_FORGERY_NOT_REPRODUCED');
console.log('PR202_FOREIGN_WRITER_VALID_RUN_SPOOF=PASS (protocol unsafe)');
function denyUnverifiedReceipt(receipt: { independentlySigned?: boolean; epoch?: number } | null): boolean {
  return receipt?.independentlySigned===true && Number.isSafeInteger(receipt.epoch) && receipt.epoch! > 0;
}
must(!denyUnverifiedReceipt(null) && !denyUnverifiedReceipt({epoch:1}) && !denyUnverifiedReceipt({independentlySigned:true,epoch:0}),'UNVERIFIED_RECEIPT_ACCEPTED');
console.log('PR202_MISSING_ATTESTATION_FAIL_CLOSED=PASS');
