import assert from 'node:assert/strict';
import {createEmptyProductionOrderDraft}
 from '../../src/lib/workshop-orders/office-entry';
import {parseOfficeDocumentSaveCandidate,parseImageRegistrationCandidate}
 from '../../src/lib/workshop-orders/prod-office-document-candidate';
const orderId='58888888-0000-4000-8000-0000000000bb';
const imageId='88888888-0000-4000-8000-0000000000bb';
const raw=createEmptyProductionOrderDraft();
Object.assign(raw,{
 customerName:'Synthetic Test Customer',projectName:'Synthetic Test Project',
 orderNumber:'WOS-CANDIDATE-588888880000400080000000000000bb',
 productName:'PP cup',priority:'MEDIUM',versionLabel:'V1',
 requestedQuantity:'360',currentBatchQuantity:'360',
 plannedShipDate:'2026-12-31',productMaterial:'PP',
 surfaceTreatment:'无',patternScope:'FULL',seamTolerance:'1mm',
 positionReference:'12mm from rim',customerAcceptanceStandard:'Customer signed sample V1',
 packagingMethod:'48 per carton',cartonQuantity:'48',
 labelMarkingRule:'Mark V1 on boxes',
});
const request={orderId,requestId:'68888888-0000-4000-8000-0000000000bb',
 expectedVersion:1,form:raw};
const parsed=parseOfficeDocumentSaveCandidate(request);
assert(parsed,'full Office form should parse');
assert.equal(parsed.normalized.cartonQuantity,48);
assert.equal(parsed.normalized.requestedQuantity,360);
assert.equal(parseOfficeDocumentSaveCandidate({...request,actorProfileId:orderId}),null);
assert.equal(parseOfficeDocumentSaveCandidate({...request,form:{...raw,customerAcceptanceStandard:''}}),null);
assert.equal(parseOfficeDocumentSaveCandidate({...request,form:{...raw,organizationId:orderId}}),null);
assert.equal(parseOfficeDocumentSaveCandidate({...request,expectedVersion:0}),null);
assert.equal(parseOfficeDocumentSaveCandidate({...request,form:{...raw,requestedQuantity:'abc'}}),null);
const path='organizations/aaaaaaaa-0000-4000-8000-000000000001/wos/production-order/'
 +orderId+'/images/product/versions/V1/'+imageId+'/final.png';
const reg={orderId,imageId,expectedVersion:2,storagePath:path};
assert.deepEqual(parseImageRegistrationCandidate(reg),reg);
assert.equal(parseImageRegistrationCandidate({...reg,organizationId:orderId}),null);
assert.equal(parseImageRegistrationCandidate({...reg,storagePath:path.replace('/V1/','/../')}),null);
assert.equal(parseImageRegistrationCandidate({...reg,storagePath:path.replace('final.png','final.jpg')}),null);
console.log('WOS_P0_02_02_OFFICE_FULL_FIELDS_SERVER_VALIDATION=PASS');
