import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const api=readFileSync('src/app/api/workshop-orders/production/cpc-drafts/route.ts','utf8');
const component=readFileSync('src/components/workshop-orders/LiveQaCpcDraft.tsx','utf8');
const browser=readFileSync('tests/e2e/wos-qa-real-browser.cjs','utf8');
const workflow=readFileSync(
  'docs/workshop-order-system/nonproduction-only/wos_p1_pr238_protected_qa_workflow_PROPOSAL.yml.txt',
  'utf8',
);
assert(api.includes("process.env.WOS_P1_QA_REVISION_ENABLED !== 'true'"));
assert(api.includes('export async function PATCH(req: NextRequest)'));
assert(api.includes("revisionRequestSchema.safeParse(JSON.parse(body))"));
assert(api.includes("client.rpc('wos_qa_amend_cpc_draft'") === false);
assert(api.includes("auth.client.rpc('wos_qa_amend_cpc_draft'"));
assert(api.includes("order.data.created_by_profile_id !== auth.actor.id"));
assert(api.includes("order.data.workflow_status !== 'DRAFT'"));
assert(api.includes("QA_DRAFT_REVISION_RPC_UNAVAILABLE"));
assert(api.includes("QA_DRAFT_REVISION_UNVERIFIED"));
assert(component.includes("NEXT_PUBLIC_WOS_P1_QA_DRAFT_REVISION_ENABLED === 'true'"));
assert(component.includes("pendingRevision.current = null"));
assert(component.includes("QA_DRAFT_REVISION_RESPONSE_UNKNOWN_RETRY_SAME_REQUEST"));
assert(component.includes("QA_DRAFT_REVISION_COMMITTED_TO_DATABASE"));
assert(component.includes("QA_DRAFT_IMAGE_BASELINE_VERSION_IMMUTABLE"));
assert(browser.includes("OPERATOR_PRIVATE_IMAGE_BYTES_UNVERIFIED"));
assert(browser.includes("OPERATOR_ORDER_DETAILS_AND_VERSION"));
assert(workflow.includes("NOT A RUNNABLE WORKFLOW"));
assert(workflow.includes("REPLACE_WITH_OWNER_APPROVED_EXACT_SHA"));
assert(workflow.includes("environment: hongda-review-dev"));
assert(workflow.includes("if: github.ref == 'refs/heads/master'"));
assert(workflow.includes('and .commit_id==$sha'));
assert(workflow.includes("secretless-source-review:"));
assert(workflow.includes("needs: [independent-gate, secretless-source-review]"));
assert(workflow.includes("WOS_QA_SOAK_ROUNDS: '1'"));
assert(!existsSync('.github/workflows/wos-p1-pr238-protected-qa.yml'));
console.log('workshop-order-p1-protected-e2e-preparation.test.ts: PASS (no secret workflow enabled)');
