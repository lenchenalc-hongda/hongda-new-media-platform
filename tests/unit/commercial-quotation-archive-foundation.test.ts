import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20261020170000_commercial_quotation_archive_v2.sql', 'utf8');
const route = readFileSync('src/app/api/commercial-documents/archives/route.ts', 'utf8');
const detail = readFileSync('src/app/api/commercial-documents/archives/[id]/route.ts', 'utf8');
const ui = readFileSync('src/components/commercial-documents/QuotationArchiveList.tsx', 'utf8');
const workbench = readFileSync('src/components/commercial-documents/DocumentWorkbench.tsx', 'utf8');

for (const clause of [
  'CREATE TABLE public.commercial_quotation_archives',
  'UNIQUE (org_id,document_no,version)',
  'ALTER TABLE public.commercial_quotation_archives ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE public.commercial_quotation_archives FORCE ROW LEVEL SECURITY',
  "p.role IN ('admin','manager')",
  "VALUES ('hongda-commercial-pdfs','hongda-commercial-pdfs',false",
  'REVOKE INSERT, UPDATE, DELETE',
  'snapshot jsonb NOT NULL',
  'pdf_storage_path text NOT NULL UNIQUE',
  'CONSTRAINT fk_commercial_quotation_owner FOREIGN KEY (owner_profile_id)',
  'REFERENCES public.profiles(id)',
  'CREATE TRIGGER commercial_quotation_owner_org_guard',
  'BEFORE INSERT OR UPDATE OF owner_profile_id, org_id',
  'p.org_id = NEW.org_id',
  'p.is_active = true',
]) assert(migration.includes(clause), 'Missing archive database protection: ' + clause);

assert(!migration.includes('REFERENCES public.profiles(id,org_id)'), 'Do not assume a composite unique key in profiles');

for (const clause of [
  "user.authSource !== 'supabase'",
  "profile?.is_active",
  "draft.kind !== 'quotation'",
  "draft.salespersonName !== user.name",
  "pdf.subarray(0, 5).toString('ascii') !== '%PDF-'",
  "createHash('sha256')",
  "upsert: false",
  "pdf_storage_path: path",
  "snapshot: draft",
  "error?.code !== '23505'",
  "owner_profile_id', profile.id",
]) assert(route.includes(clause), 'Missing API security check: ' + clause);

for (const clause of [
  'profile.org_id',
  'row.owner_profile_id !== profile.id',
  "'admin','manager'",
  'createSignedUrl',
  '60, { download:',
]) assert(detail.includes(clause), 'Missing archive download boundary: ' + clause);

assert(ui.includes('历史报价档案'));
assert(ui.includes('source') || ui.includes('onReuse'));
assert(ui.includes('下载PDF'));
assert(ui.includes('V{row.version}'));
assert(workbench.includes('QuotationArchiveList'));
assert(workbench.includes('setSourceArchiveId(archiveId)'));

// No false-positive automatic archive claim: the current browser print is still print-only.
// This is a deliberately incomplete Stage A until identical PDF generation is implemented.
assert(workbench.includes('window.print()'));
assert(!workbench.includes('归档并导出 PDF'), 'The automatic archive button must not be enabled without PDF bytes');
console.log('commercial-quotation-archive-foundation.test.ts: PASS (Stage A only)');
