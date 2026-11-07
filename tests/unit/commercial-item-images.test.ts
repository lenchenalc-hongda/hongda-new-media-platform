import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canAccessQuotationImagePath, collectQuotationImagePaths, hasAuthorizedQuotationImages,
  imageExtension, isQuotationImagePath, QUOTATION_IMAGE_BUCKET,
  validImageSignature, MAX_IMAGE_UPLOAD_BYTES,
} from '../../src/lib/commercial-documents/item-images';
import { blankItem, initialDraft, isDraftShape, normalizeImportedDraft } from '../../src/lib/commercial-documents/template';

const org='0ff53d93-2b9e-48b9-8113-a4768c39cdd2';
const owner='f8adf44a-f04e-44b4-9c82-8b96508097bb';
const colleague='3639e6ab-5676-4f64-a83a-faef0c627083';
const outside='fbdb0989-ae25-4ba4-92f9-3266cc845977';
const imageId='c1d14e2a-f72f-4f95-8370-9ccb44b71c5e';
const path=`${org}/${owner}/${imageId}.jpg`;
assert(isQuotationImagePath(path));
assert(!isQuotationImagePath('https://example.com/a.jpg'));
assert(!isQuotationImagePath('data:image/png;base64,ABC'));
assert(!isQuotationImagePath('/'+path));
assert(!isQuotationImagePath(`${org}/${owner}/../../test.jpg`));
assert(!isQuotationImagePath(`${org}/${owner}/a.svg`));
assert(canAccessQuotationImagePath(path,org,owner,'sales'));
assert(!canAccessQuotationImagePath(path,org,colleague,'sales'));
assert(canAccessQuotationImagePath(path,org,colleague,'manager'));
assert(!canAccessQuotationImagePath(path,outside,colleague,'admin'));
assert.equal(QUOTATION_IMAGE_BUCKET,'commercial-quotation-item-images');
assert.equal(imageExtension('image/svg+xml'),null);
assert.equal(imageExtension('image/jpeg'),'jpg');
const jpeg=new Uint8Array([255,216,255,1,2,3,4,5,6,7,8,9]);
const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
const webp=new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]);
assert(validImageSignature(jpeg,'image/jpeg'));
assert(validImageSignature(png,'image/png'));
assert(validImageSignature(webp,'image/webp'));
assert(!validImageSignature(png,'image/jpeg'));
assert(!validImageSignature(jpeg,'image/svg+xml'));
assert(!validImageSignature(new Uint8Array(MAX_IMAGE_UPLOAD_BYTES + 1),'image/jpeg'));
const draft=initialDraft('QA');
draft.sections=[{id:'section',title:'花膜',items:[{...blankItem('item'),name:'Film',quantity:'100',unitPrice:'0.0064'}]}];
assert(isDraftShape(draft));
assert.equal(collectQuotationImagePaths(draft).length,0);
draft.sections[0].items[0].photoPath=path;
assert(isDraftShape(draft));
assert.deepEqual(collectQuotationImagePaths(draft),[path]);
assert(hasAuthorizedQuotationImages(draft,org,owner,'sales'));
assert(!hasAuthorizedQuotationImages(draft,org,colleague,'sales'));
assert(hasAuthorizedQuotationImages(draft,org,colleague,'manager'));
assert.equal(normalizeImportedDraft(draft,'QA').sections[0].items[0].photoPath,path);
const historic = JSON.parse(JSON.stringify(draft));
assert.equal(historic.sections[0].items[0].photoPath,path,'Confirmed archive must retain immutable object path');
draft.sections[0].items[0].photoPath='';
assert.equal(collectQuotationImagePaths(draft).length,0);
assert(isDraftShape(draft),'No-photo quotation remains valid');
draft.sections[0].items[0].photoPath='data:image/png;base64,AAAA';
assert(!isDraftShape(draft),'Never persist base64 photo data');
const sql=readFileSync(new URL('../../supabase/migrations/20261107142700_commercial_quotation_item_images.sql',import.meta.url),'utf8');
const route=readFileSync(new URL('../../src/app/api/commercial-documents/item-images/route.ts',import.meta.url),'utf8');
const workbench=readFileSync(new URL('../../src/components/commercial-documents/DocumentWorkbench.tsx',import.meta.url),'utf8');
for(const guard of ['public=false','quotation_item_image_insert','quotation_item_image_select','for insert to authenticated','for select to authenticated']) {
  assert(sql.includes(guard),'Missing Storage protection: '+guard);
}
assert(sql.includes("storage.foldername(name)"));
assert(!sql.includes('for delete to authenticated') && !sql.includes('for update to authenticated'));
assert(route.includes('draftContext()') && route.includes('createSignedUrl') && route.includes('validImageSignature'));
assert(route.includes('upsert: false') && route.includes('canAccessQuotationImagePath'));
assert(workbench.includes('Product photo (optional)') && workbench.includes('产品照片（选填）'));
assert(workbench.includes('collectQuotationImagePaths(draft).some(path => !photoUrls[path])'));
for(const filename of [
  'src/app/api/commercial-documents/drafts/route.ts',
  'src/app/api/commercial-documents/drafts/[id]/route.ts',
  'src/app/api/commercial-documents/confirmed/route.ts',
]){
  const source=readFileSync(new URL('../../'+filename,import.meta.url),'utf8');
  assert(source.includes('hasAuthorizedQuotationImages('),'Missing server ownership check: '+filename);
}
console.log('commercial-item-images.test.ts: PASS');
