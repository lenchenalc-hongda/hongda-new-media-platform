import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateOaPrivilegedAccess,isOaSimulationAllowed } from '../../src/lib/oa/oa-access-policy';
const valid={role:'admin',active:true,authSource:'supabase'};
assert.equal(evaluateOaPrivilegedAccess('supabase',valid).allowed,true);
assert.equal(evaluateOaPrivilegedAccess('supabase',{...valid,role:'manager'}).allowed,true);
assert.equal(evaluateOaPrivilegedAccess('mock',valid).allowed,false);
assert.equal(evaluateOaPrivilegedAccess('supabase',null).status,401);
assert.equal(evaluateOaPrivilegedAccess('supabase',{...valid,active:false}).status,403);
assert.equal(evaluateOaPrivilegedAccess('supabase',{...valid,authSource:'mock'}).status,403);
for(const role of ['operator','sales','viewer','unknown'])
  assert.equal(evaluateOaPrivilegedAccess('supabase',{...valid,role}).status,403);
assert.equal(isOaSimulationAllowed('production','production'),false);
assert.equal(isOaSimulationAllowed(undefined,'production'),false);
assert.equal(isOaSimulationAllowed('preview','production'),true);
assert.equal(isOaSimulationAllowed(undefined,'development'),true);
const read=(p:string)=>fs.readFileSync(path.join(process.cwd(),p),'utf8');
const publish=read('src/app/api/oa/publish/route.ts');
for(const action of ["case 'publish':","case 'save_draft':","case 'retry':"])
  assert.ok(publish.includes(action),'locked action '+action);
assert.ok(publish.includes('return oaWechatWriteLocked()'));
assert.ok(publish.includes('guardOaPrivilegedRequest(req)'));
assert.equal(publish.includes("publishStatus: 'approved'"),false);
assert.equal(publish.includes('executePublishJob'),false);
assert.equal(publish.includes('createPublishJob'),false);
for(const file of ['save-draft/route.ts','upload-media/route.ts','publish-status/[id]/route.ts']) {
  const source=read('src/app/api/oa/'+file);
  assert.ok(source.includes('guardOaPrivilegedRequest(req)'));
  assert.ok(source.includes('oaWechatWriteLocked()'));
  assert.equal(source.includes('getAccessToken'),false);
}
const connect=read('src/app/api/oa/connect/route.ts');
assert.equal(connect.includes('checkConnection()'),false);
assert.equal(connect.includes('Object.keys(process.env)'),false);
assert.equal(connect.includes('wechat_proxy_url'),false);
const mock=read('src/app/api/oa/mock-publish/route.ts');
assert.ok(mock.includes('isOaSimulationAllowed'));
assert.equal(mock.includes('mp.weixin.qq.com/mock/'),false);
console.log('OA P0: trusted admin/manager, no fake WeChat write, preview-only simulation PASS');
