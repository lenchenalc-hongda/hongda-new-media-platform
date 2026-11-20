import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseWosP2M2Action,canActOnWosP2M2,isWosP2M2QaEnabled,
  wosP2M2RpcArgs,isWosP2M2RpcResult,
} from '../../src/lib/workshop-orders/p2-m2-action-contract';

const order='22222222-2222-4222-8222-222222222222';
const request='55555555-5555-4555-8555-555555555555';
const baseline='66666666-6666-4666-8666-666666666666';
const img1='77777777-7777-4777-8777-777777777777';
const img2='88888888-8888-4888-8888-888888888888';
const img3='99999999-9999-4999-8999-999999999999';
const at='2026-11-20T04:00:00.000Z';
const base={orderId:order,requestId:request,expectedVersion:7,
 productionVersionLabel:'QA-R6',note:'车间现场独立核对生产资料及签样证据已记录'};
const material={...base,action:'MATERIAL_RECORD',resourceType:'FILM',
 resourceStatus:'VERSION_VERIFIED',expectedAt:at,arrivedAt:at,
 quantityExpected:null,quantityArrived:null,physicalCheckAttested:true};
const parsed=parseWosP2M2Action(material);
assert(parsed&&parsed.action==='MATERIAL_RECORD');
const filmArgs=wosP2M2RpcArgs(parsed);
assert.equal(filmArgs.p_action,'MATERIAL_RECORD');
assert.equal(filmArgs.p_expected_version,7);
assert.equal(filmArgs.p_payload.productionVersionLabel,'QA-R6');
assert(!('organizationId' in filmArgs.p_payload));
assert(!('actorProfileId' in filmArgs.p_payload));
assert(!('digest' in filmArgs.p_payload));
const fixtures=[
 {...material,resourceType:'FIXTURE',resourceStatus:'FIT_VERIFIED'},
 {...material,resourceType:'SIGNED_SAMPLE',resourceStatus:'VERIFIED'},
 {...material,resourceType:'INCOMING_MATERIAL',resourceStatus:'QUANTITY_VERIFIED',
  quantityExpected:200,quantityArrived:200},
];
for(const valid of fixtures)assert(parseWosP2M2Action(valid),'valid QA material action must parse');
const selected={...base,action:'BASELINE_SELECT',imageIds:[img1,img2,img3]};
const office={...base,action:'BASELINE_OFFICE_CONFIRM',baselineId:baseline};
const workshop={...base,action:'BASELINE_WORKSHOP_CONFIRM',baselineId:baseline};
for(const good of [selected,office,workshop]) {
 const parsedGood=parseWosP2M2Action(good);
 assert(parsedGood,'valid QA baseline action must parse');
 assert.equal(wosP2M2RpcArgs(parsedGood).p_action,good.action);
}
const negative:Array<[string,unknown]>=[
 ['anonymous object',{}],
 ['array',[]],['null',null],
 ['unknown action',{...material,action:'START_PRODUCTION'}],
 ['missing auth request ID',{...material,requestId:null}],
 ['invalid order ID',{...material,orderId:'foreign'}],
 ['missing numeric version',{...material,expectedVersion:0}],
 ['fractional version',{...material,expectedVersion:7.5}],
 ['overflow version',{...material,expectedVersion:2147483647}],
 ['stale note',{...material,note:'too short'}],
 ['payload substitutes organization',{...material,organizationId:order}],
 ['payload supplies digest',{...material,specDigest:'a'.repeat(64)}],
 ['film arrived falsely final',{...material,resourceStatus:'ARRIVED',physicalCheckAttested:false,arrivedAt:null}],
 ['film not attested',{...material,physicalCheckAttested:false}],
 ['film no actual arrival',{...material,arrivedAt:null}],
 ['film wrong state',{...material,resourceStatus:'FIT_VERIFIED'}],
 ['fixture not physically checked',{...fixtures[0],physicalCheckAttested:false}],
 ['fixture wrong material state',{...fixtures[0],resourceStatus:'QUANTITY_VERIFIED'}],
 ['signed sample uploaded not verified',{...fixtures[1],resourceStatus:'UPLOADED',physicalCheckAttested:false,arrivedAt:null,quantityArrived:1}],
 ['sample final not attested',{...fixtures[1],physicalCheckAttested:false}],
 ['incoming missing expected',{...fixtures[2],quantityExpected:null}],
 ['incoming missing actual',{...fixtures[2],quantityArrived:null}],
 ['incoming negative actual',{...fixtures[2],quantityArrived:-1}],
 ['incoming decimal expected',{...fixtures[2],quantityExpected:200.5}],
 ['incoming actual shortfall',{...fixtures[2],quantityArrived:199}],
 ['incoming zero actual',{...fixtures[2],quantityArrived:0}],
 ['incoming wrong status',{...fixtures[2],resourceStatus:'VERSION_VERIFIED'}],
 ['unexpected film quantity',{...material,quantityExpected:100}],
 ['timestamp malformed',{...material,arrivedAt:'tomorrow'}],
 ['unexpected QA client actor',{...material,actorRole:'admin'}],
 ['duplicate image IDs',{...selected,imageIds:[img1,img1,img2]}],
 ['missing required images',{...selected,imageIds:[img1,img2]}],
 ['unknown image ID',{...selected,imageIds:[img1,img2,'wrong']}],
 ['image array with extra field',{...selected,autoStart:true}],
 ['missing office baseline ID',{...office,baselineId:null}],
 ['office tries workshop title',{...office,action:'BASELINE_WORKSHOP_CONFIRM',actorRole:'admin'}],
 ['workshop tries changing approved data',{...workshop,productionSpecDigest:'x'}],
];
for(const [name,bad] of negative)assert.equal(parseWosP2M2Action(bad),null,name);
const roleNeg:Array<[string,string,'MATERIAL_RECORD'|'BASELINE_SELECT'|'BASELINE_OFFICE_CONFIRM'|'BASELINE_WORKSHOP_CONFIRM']>=[
 ['viewer cannot record material','viewer','MATERIAL_RECORD'],
 ['sales cannot record material','sales','MATERIAL_RECORD'],
 ['viewer cannot choose images','viewer','BASELINE_SELECT'],
 ['operator cannot choose office images','operator','BASELINE_SELECT'],
 ['operator cannot office-confirm','operator','BASELINE_OFFICE_CONFIRM'],
 ['sales cannot workshop-confirm','sales','BASELINE_WORKSHOP_CONFIRM'],
 ['viewer cannot workshop-confirm','viewer','BASELINE_WORKSHOP_CONFIRM'],
 ['unknown role cannot record','office','MATERIAL_RECORD'],
];
for(const [name,role,action] of roleNeg)assert.equal(canActOnWosP2M2(role,action),false,name);
assert.equal(canActOnWosP2M2('sales','BASELINE_OFFICE_CONFIRM'),true);
assert.equal(canActOnWosP2M2('operator','BASELINE_WORKSHOP_CONFIRM'),true);
const env={vercelEnv:'preview',flag:'true',supabaseUrl:'https://xulmpqaknlwqqculbsek.supabase.co'};
assert.equal(isWosP2M2QaEnabled(env),true);
const gateNeg=[
 {...env,vercelEnv:'production'},
 {...env,vercelEnv:'development'},
 {...env,flag:'false'},
 {...env,flag:undefined},
 {...env,supabaseUrl:'https://another.supabase.co'},
 {...env,supabaseUrl:'https://xulmpqaknlwqqculbsek.supabase.co.evil.com'},
 {...env,supabaseUrl:'https://xulmpqaknlwqqculbsek.supabase.co/query'},
 {...env,supabaseUrl:'http://xulmpqaknlwqqculbsek.supabase.co'},
];
for(const x of gateNeg)assert.equal(isWosP2M2QaEnabled(x),false);
const result={
 status:'APPLIED',requestId:request,orderId:order,version:8,productionVersionLabel:'QA-R6',
 preSpecDigest:'a'.repeat(64),postSpecDigest:'a'.repeat(64),
 receiptDigest:'b'.repeat(64),proofStatus:'UNVERIFIED',canStart:false,
};
assert(parsed&&isWosP2M2RpcResult(result,parsed));
const responseNeg=[
 {...result,version:9}, {...result,requestId:order},{...result,orderId:request},
 {...result,productionVersionLabel:'QA-R7'},{...result,preSpecDigest:'broken'},
 {...result,postSpecDigest:'broken'},{...result,receiptDigest:'broken'},
 {...result,canStart:true},{...result,proofStatus:'VERIFIED'},
 {...result,status:'STARTED'},
];
for(const r of responseNeg)assert(parsed&&!isWosP2M2RpcResult(r,parsed));
// Source audits do not substitute for real offline SQL execution or independent
// review, but force gate/role/replay/no-GRANT constraints into versioned CI.
const sql=readFileSync('docs/workshop-order-system/nonproduction-only/WOS_P2_M2_NONPROD_SQL_NOT_INSTALLED.sql','utf8');
const route=readFileSync('src/app/api/workshop-orders/p2/m2/route.ts','utf8');
const ui=readFileSync('src/components/workshop-orders/LiveQaWorkshopM2.tsx','utf8');
const parent=readFileSync('src/components/workshop-orders/LiveQaWorkshopReadiness.tsx','utf8');
for(const token of [
 'NOT INSTALLED','SECURITY DEFINER SET search_path','M2_OPERATOR_WRITES',
 'M2_OFFICE_WRITES','enabled_until<=pg_catalog.clock_timestamp()+interval \'15 minutes\'',
 'pg_advisory_xact_lock','FOR UPDATE','IDEMPOTENCY_CONFLICT','VERSION_CONFLICT',
 'wos_qa_p2_m2_spec_digest','before_spec_digest','after_spec_digest',
 'confirmed_by_office_profile_id<>v_actor.id','canStart\',false',
 'REVOKE ALL ON FUNCTION public.wos_qa_p2_m2_action',
])assert(sql.includes(token),'review-only SQL missing '+token);
assert(!/\bGRANT\s+EXECUTE\s+ON\s+FUNCTION[^\n]+TO\s+authenticated\s*;/i.test(sql),
 'proposal must not grant executable RPC access');
assert(route.includes('WOS_P2_M2_QA_MUTATIONS_ENABLED'));
assert(!route.includes("client.rpc('wos_qa_p2_operator_action'"));
assert(route.includes("client.rpc('wos_qa_p2_m2_action'"));
assert(ui.includes('NEXT_PUBLIC_WOS_P2_M2_QA_MUTATIONS_ENABLED'));
assert(parent.includes('LiveQaWorkshopM2'));
const m2Page=readFileSync('src/app/workshop-orders/qa-m2/page.tsx','utf8');
const m2Picker=readFileSync('src/components/workshop-orders/LiveQaM2OrderPicker.tsx','utf8');
assert(m2Page.includes("process.env.AUTH_MODE==='supabase'"));
assert(m2Page.includes('WOS_P2_M2_QA_MUTATIONS_ENABLED'));
assert(m2Page.includes('NEXT_PUBLIC_WOS_P2_M2_QA_MUTATIONS_ENABLED'));
assert(m2Picker.includes("db.auth.getUser()"));
assert(m2Picker.includes(".eq('organization_id',p.org_id)"));
assert(m2Picker.includes("startsWith('QA-')"));
assert(m2Picker.includes('QA_ORDER_DENIED_OR_UNVERIFIED'));
assert(!/\\.insert\\s*\\(|\\.upsert\\s*\\(|\\.update\\s*\\(|\\.delete\\s*\\(/.test(m2Picker));
assert(ui.includes('canActOnWosP2M2(actorRole,action)'));

assert(!/\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(/.test(ui));
console.log('workshop-order-p2-m2.test.ts: PASS');
console.log('WOS_P2_M2_REQUEST_NEGATIVE_CASES='+negative.length);
console.log('WOS_P2_M2_ROLE_NEGATIVE_CASES='+roleNeg.length);
console.log('WOS_P2_M2_GATE_NEGATIVE_CASES='+gateNeg.length);
console.log('WOS_P2_M2_RESPONSE_NEGATIVE_CASES='+responseNeg.length);
console.log('WOS_P2_M2_SQL_INSTALL=NOT_AUTHORIZED');
console.log('WOS_P2_M2_REAL_QA_WRITE=NOT_PERFORMED');
