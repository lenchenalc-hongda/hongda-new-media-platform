'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {run,checkEnv}=require('../e2e/wos-p2-qa-identity-readonly-preflight.cjs');

const users={
 ADMIN:{email:'qa-admin@example.invalid',id:'11111111-1111-4111-8111-111111111111',role:'admin',org:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},
 OPERATOR:{email:'qa-operator@example.invalid',id:'22222222-2222-4222-8222-222222222222',role:'operator',org:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},
 VIEWER:{email:'qa-viewer@example.invalid',id:'33333333-3333-4333-8333-333333333333',role:'viewer',org:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},
 FOREIGN:{email:'qa-foreign@example.invalid',id:'44444444-4444-4444-8444-444444444444',role:'sales',org:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},
};
const env={
 GITHUB_REPOSITORY:'lenchenalc-hongda/hongda-new-media-platform',
 GITHUB_REF:'refs/heads/master',
 WOS_P2_QA_READONLY_PREFLIGHT_ACK:'true',
 WOS_P2_REVIEWED_SHA:'89bb408d13e45458c608db29c47e2803d49b3170',
 NEXT_PUBLIC_SUPABASE_URL:'https://xulmpqaknlwqqculbsek.supabase.co',
 NEXT_PUBLIC_SUPABASE_ANON_KEY:'qa-publishable-fixture-00000000000000',
};
for(const [name,user] of Object.entries(users)){
 env['REVIEW_DEV_'+name+'_EMAIL']=user.email;
 env['REVIEW_DEV_'+name+'_PASSWORD']='synthetic-test-password-'+name;
}
const origin='https://xulmpqaknlwqqculbsek.supabase.co';
function simulatedFetch(overrides={}){
 const calls=[];
 async function fake(url,opts={}){
   assert(url.startsWith(origin+'/'),'public QA origin must be pinned');
   assert.equal(opts.redirect,'error','do not forward credentials in redirects');
   assert(!/\/rpc\/|\/wos_|\/storage\/|\/functions\//i.test(url),
     'read-only preflight cannot invoke WOS RPC, storage or Edge');
   calls.push({url,method:opts.method});
   if(url===origin+'/auth/v1/token?grant_type=password'){
     assert.equal(opts.method,'POST');
     const login=JSON.parse(opts.body);
     const name=Object.keys(users).find(k=>users[k].email===login.email);
     assert(name,'login must be one of four QA fixtures');
     const u=users[name];
     return {status:overrides.authStatus??200,json:async()=>({
       access_token:'fixture-jwt-'+name+'-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
       user:{id:u.id},
     })};
   }
   const u=new URL(url);
   assert.equal(u.pathname,'/rest/v1/profiles');
   assert.equal(opts.method,'GET');
   assert.equal(u.searchParams.get('select'),'id,org_id,user_id,role,is_active');
   assert.equal(u.searchParams.get('limit'),'2');
   const token=opts.headers.Authorization;
   const name=Object.keys(users).find(k=>token.startsWith('Bearer fixture-jwt-'+k+'-'));
   assert(name,'known authorization session');
   const user=users[name];
   assert.equal(u.searchParams.get('user_id'),'eq.'+user.id);
   return {status:overrides.profileStatus??200,json:async()=>[{
      id:user.id,user_id:user.id,org_id:name==='FOREIGN'&&overrides.foreignSameOrg?users.ADMIN.org:user.org,
      role:name==='OPERATOR'&&overrides.operatorBadRole?'viewer':user.role,is_active:true,
   }]};
 }
 return {fake,calls};
}
test('accepted QA identities and disjoint foreign organization, no business writes',async()=>{
 const {fake,calls}=simulatedFetch();
 const logged=[];
 const result=await run({env:{...env},fetchImpl:fake,emit:x=>logged.push(x)});
 assert.deepEqual(result,{ok:true});
 assert.equal(calls.length,8);
 assert.equal(calls.filter(c=>c.method==='POST').length,4);
 assert.equal(calls.filter(c=>c.method==='GET').length,4);
 assert(logged.includes('WOS_P2_QA_ORG_SEPARATION_CONFIRMED=PASS'));
 assert(logged.includes('WOS_P2_QA_FOREIGN_SALES_NOT_OPERATOR=ACKNOWLEDGED'));
 for(const item of logged){
   assert(!item.includes('@')&&!item.includes('Bearer')&&!item.includes('fixture-jwt'));
 }
});
test('reject foreign fixture in same organization',async()=>{
 const {fake}=simulatedFetch({foreignSameOrg:true});
 await assert.rejects(run({env:{...env},fetchImpl:fake,emit:()=>{}}),/QA_FOREIGN_ORGANIZATION_NOT_INDEPENDENT/);
});
test('reject Operator role mistaken for Viewer',async()=>{
 const {fake}=simulatedFetch({operatorBadRole:true});
 await assert.rejects(run({env:{...env},fetchImpl:fake,emit:()=>{}}),/QA_PROFILE_ROLE_OR_SCOPE_MISMATCH/);
});
test('reject Auth failures without returning sensitive details',async()=>{
 const {fake}=simulatedFetch({authStatus:401});
 await assert.rejects(run({env:{...env},fetchImpl:fake,emit:()=>{}}),/QA_AUTH_HTTP_STATUS/);
});
test('reject inaccessible RLS profile',async()=>{
 const {fake}=simulatedFetch({profileStatus:403});
 await assert.rejects(run({env:{...env},fetchImpl:fake,emit:()=>{}}),/QA_PROFILE_HTTP_STATUS/);
});
test('reject wrong project, arbitrary branch and missing credential before network',()=>{
 for(const patch of [
  {NEXT_PUBLIC_SUPABASE_URL:'https://another.supabase.co'},
  {GITHUB_REF:'refs/heads/codex/unreviewed'},
  {WOS_P2_REVIEWED_SHA:'a'.repeat(40)},
  {REVIEW_DEV_FOREIGN_PASSWORD:''},
 ])assert.throws(()=>checkEnv({...env,...patch}));
});
test('explicitly no WOS gate or mutation flags required to authenticate fixtures',()=>{
 assert.doesNotThrow(()=>checkEnv({...env,WOS_P2_QA_MUTATIONS_ENABLED:'false',
  WOS_P2_QA_OFFICE_REVISION_ENABLED:'false'}));
});
console.log('WOS_P2_READONLY_QA_IDENTITY_MOCK_NEGATIVE_TESTS=PASS');
