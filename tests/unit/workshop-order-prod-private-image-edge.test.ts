import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { pngValid } from '../../supabase/functions/wos-mvp-verify-image-candidate/png';
import {expectedProductPngPath,matchesCurrentOrder,parseProofRequest,
  parseTrustedSnapshot,sameStorageObject} from '../../supabase/functions/wos-mvp-verify-image-candidate/contract';
const org='aaaaaaaa-0000-4000-8000-000000000001',
  orderId='58888888-0000-4000-8000-000000000001',
  imageId='88888888-0000-4000-8000-000000000001',
  profile='11111111-0000-4000-8000-000000000001',
  user='21111111-0000-4000-8000-000000000001';
const path=expectedProductPngPath({organizationId:org,orderId,imageId,
  versionLabel:'V1',filename:'sample.png'});
assert(path);
const request=parseProofRequest({orderId,imageId,expectedVersion:1,storagePath:path,sha256:'a'.repeat(64)});
assert(request);
assert.equal(parseProofRequest({...request,orgId:org}),null);
assert.equal(parseProofRequest({...request,expectedVersion:0}),null);
assert.equal(parseProofRequest({...request,sha256:'a'.repeat(63)}),null);
assert.equal(expectedProductPngPath({organizationId:org,orderId,imageId,versionLabel:'V1',filename:'../x.png'}),null);
const order={id:orderId,organization_id:org,version:1,version_label:'V1',
  workflow_status:'DRAFT',created_by_profile_id:profile,sales_owner_profile_id:profile};
const actor={id:profile,org_id:org,role:'sales'};
assert.equal(matchesCurrentOrder({order,actor,userId:user,request}),true);
assert.equal(matchesCurrentOrder({order:{...order,version:2},actor,userId:user,request}),false);
assert.equal(matchesCurrentOrder({order:{...order,version_label:'V2'},actor,userId:user,request}),false);
assert.equal(matchesCurrentOrder({order:{...order,workflow_status:'SUBMITTED'},actor,userId:user,request}),false);
assert.equal(matchesCurrentOrder({order:{...order,organization_id:'bbbbbbbb-0000-4000-8000-000000000002'},actor,userId:user,request}),false);
assert.equal(matchesCurrentOrder({order,actor:{...actor,role:'viewer'},userId:user,request}),false);
assert.equal(matchesCurrentOrder({order,actor,userId:user,request:{...request,storagePath:path.replace('/V1/','/V2/')}}),false);
assert.equal(matchesCurrentOrder({order,actor,userId:user,request:{...request,storagePath:path+'?fake'}}),false);
const meta=parseTrustedSnapshot({id:imageId,ownerId:user,objectVersion:'v1',
  objectUpdatedAt:'2026-11-18T12:00:00.000Z',mimeType:'image/png',byteSize:68});
assert(meta);
const stale=parseTrustedSnapshot({...meta,objectVersion:'v2'});assert(stale);
assert.equal(sameStorageObject(meta,stale),false);
assert.equal(parseTrustedSnapshot({...meta,byteSize:20971521}),null);
assert.equal(parseTrustedSnapshot({...meta,mimeType:'image/jpeg'}),null);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
const hash=createHash('sha256').update(png).digest('hex');
assert.equal(await pngValid(png,hash),true);
assert.equal(await pngValid(png,'0'.repeat(64)),false);
const corrupt=Buffer.from(png);corrupt[45]^=1;
assert.equal(await pngValid(corrupt,createHash('sha256').update(corrupt).digest('hex')),false);
console.log('WOS_P0_02_02_EDGE_REAL_PNG_HASH_SCOPE_AND_VERSION_CONTRACT=PASS');
