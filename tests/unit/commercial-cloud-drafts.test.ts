import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialDraft, isDraftShape, type CommercialDocumentDraft } from '../../src/lib/commercial-documents/template';
import { safeDraft, draftMetadata } from '../../src/lib/commercial-documents/cloud-drafts';

const blank = initialDraft('Sales');
assert.equal(blank.buyerName, '');
assert.equal(blank.sections[0].items[0].unitPrice, '');
assert(isDraftShape(blank), 'Blank, incomplete quote is still a valid draft shape');
const saved = safeDraft(blank, 'Sales');
assert(saved, 'Cloud saves must accept incomplete quotation drafts');
assert.equal(saved.buyerName, '');
assert.equal(saved.sections[0].items[0].unitPrice, '');
assert.deepEqual(draftMetadata(saved), {
  document_no: blank.documentNo, buyer_name: '',
  project_name: '', language: 'zh',
});
const english: CommercialDocumentDraft = { ...blank, language: 'en' };
assert.equal(safeDraft(english, 'Sales')?.language, 'en');
assert.equal(safeDraft({ ...blank, kind: 'machine_contract' }, 'Sales'), null,
  'Machine contracts must stay on existing flow until expressly integrated');
assert.equal(safeDraft({ ...blank, accountDetails: 'FORGED_ACCOUNT' }, 'Sales')?.accountDetails, '',
  'Client JSON must not inject manually entered account details');
assert.equal(safeDraft({ ...blank, sellerName: 'Forged seller' }, 'Sales')?.sellerName, '广东宏达印业股份有限公司');
assert.equal(safeDraft({ ...blank, buyerName: 'A'.repeat(220_000) }, 'Sales'), null);
const api = readFileSync(new URL('../../src/app/api/commercial-documents/drafts/route.ts', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../../src/app/api/commercial-documents/drafts/[id]/route.ts', import.meta.url), 'utf8');
const db = readFileSync(new URL('../../supabase/migrations/20261027073000_commercial_quotation_drafts.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../src/components/commercial-documents/DocumentWorkbench.tsx', import.meta.url), 'utf8');
assert(api.includes('draftContext()') && detail.includes('draftContext()'));
assert(api.includes("owner_profile_id") && detail.includes("owner_profile_id"));
assert(detail.includes(".eq('revision', payload.revision as number)"), 'No last-write-wins draft updates');
assert(detail.includes('REVISION_CONFLICT') && detail.includes('409'));
assert(detail.includes("status: 'deleted'"), 'Draft deletion is only a soft delete');
assert(db.includes('enable row level security') && db.includes('quotation_drafts_select'));
assert(db.includes('quotation_drafts_update') && db.includes('p.id=commercial_quotation_drafts.owner_profile_id'));
assert(ui.includes('保存到草稿箱 / Save Draft') && ui.includes('云端草稿箱'));
assert(ui.includes('setCloudId') && ui.includes('setCloudRevision'));
assert(!api.includes('localStorage') && !detail.includes('localStorage'));
console.log('commercial-cloud-drafts.test.ts: PASS');
