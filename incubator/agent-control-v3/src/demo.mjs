import {MemoryControlStore} from './core.mjs';
import {dispatchOutboxOnce} from './dispatcher.mjs';

const now=Date.now();
const s=new MemoryControlStore();
s.registerProject({id:'demo',enabled:true,dispatchOwner:'V3'});
s.addEpic({id:'demo-epic',projectId:'demo',approvedBy:'owner',approvedUntil:now+600000,
  paths:['demo/'],risk:'SANDBOX'});
s.addApproval({epicId:'demo-epic',scope:'NONPROD_CODE_EXECUTION',approvedBy:'owner',validUntil:now+600000});
s.addTask({id:'demo-001',projectId:'demo',epicId:'demo-epic',risk:'SANDBOX',
  status:'QUEUED',paths:['demo/test.mjs'],checks:['node --test'],dependsOn:[]});
const candidate=s.nextApproved('demo');
const lease=await s.claim(candidate.id,{expectedVersion:candidate.version,worker:'synthetic-worker'});
const dispatch=await dispatchOutboxOnce({store:s,opKey:lease.opKey});
console.log(JSON.stringify({demo:'NONPRODUCTION_ONLY',task:lease.taskId,claimed:lease.ok,
  dispatch:dispatch.status,remoteDispatchEnabled:false,events:s.events.size,outbox:s.listOutbox().length,
  warning:'This is NOT an actual GitHub dispatch or database E2E.'},null,2));
