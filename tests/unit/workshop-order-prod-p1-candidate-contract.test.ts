import assert from 'node:assert/strict';
import {
  parseWosP1DraftCandidate, parseWosP1FirstSubmitCandidate, buildWosPrivateImageCandidate,
} from '../../src/lib/workshop-orders/prod-p1-candidate-contract';
const id='58888888-0000-4000-8000-000000000001';
const org='aaaaaaaa-0000-4000-8000-000000000001';
const cust='31111111-0000-4000-8000-000000000001';
const project='41111111-0000-4000-8000-000000000001';
const draft={
 requestId:id,customerId:cust,projectId:project,
 productName:'PP Bottle',productMaterial:'PP',requestedQuantity:500,priority:'MEDIUM',
};
assert.deepEqual(parseWosP1DraftCandidate(draft),draft);
assert.equal(parseWosP1DraftCandidate({...draft,organizationId:org}),null);
assert.equal(parseWosP1DraftCandidate({...draft,role:'admin'}),null);
assert.equal(parseWosP1DraftCandidate({...draft,productName:'  '}),null);
assert.equal(parseWosP1DraftCandidate({...draft,requestedQuantity:0}),null);
assert.equal(parseWosP1DraftCandidate({...draft,customerId:'not-a-uuid'}),null);
const submit={orderId:id,expectedVersion:1,idempotencyKey:cust,readinessNote:'Synthetic ready note'};
assert.deepEqual(parseWosP1FirstSubmitCandidate(submit),submit);
assert.equal(parseWosP1FirstSubmitCandidate({...submit,workflowStatus:'SUBMITTED'}),null);
assert.equal(parseWosP1FirstSubmitCandidate({...submit,expectedVersion:0}),null);
assert.equal(parseWosP1FirstSubmitCandidate({...submit,readinessNote:'short'}),null);
const good={organizationId:org,orderId:id,imageId:cust,category:'PRODUCT' as const,
 versionLabel:'V1',filename:'drawing.png',mimeType:'image/png',byteSize:1000,sha256Hex:'a'.repeat(64)};
const intent=buildWosPrivateImageCandidate(good);
assert(intent);
assert.equal(intent.storageBucket,'wos-private');
assert.equal(intent.storagePath,'organizations/'+org+'/wos/production-order/'+id
 +'/images/product/versions/V1/'+cust+'/drawing.png');
assert.equal(buildWosPrivateImageCandidate({...good,filename:'../secret.png'}),null);
assert.equal(buildWosPrivateImageCandidate({...good,filename:'drawing.exe'}),null);
assert.equal(buildWosPrivateImageCandidate({...good,mimeType:'image/jpeg'}),null);
assert.equal(buildWosPrivateImageCandidate({...good,sha256Hex:'000'}),null);
assert.equal(buildWosPrivateImageCandidate({...good,byteSize:20971521}),null);
assert.equal(buildWosPrivateImageCandidate({...good,versionLabel:'../../V1'}),null);
console.log('WOS_P0_02_DRAFT_IMAGE_PATH_AND_SUBMIT_INPUT_CONTRACT=PASS');
