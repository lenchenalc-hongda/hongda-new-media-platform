import {eligibleToClaim, scopesOverlap, selectApprovedSuccessor} from './policy.mjs';

const clone = x => structuredClone(x);
const activeWriterStatuses = new Set(['DISPATCHING','CODING','PM_REVIEW','FIX_REQUIRED',
                                     'MERGE_ELIGIBLE','MERGED','RECONCILING']);
const codingStatuses = new Set(['DISPATCHING','CODING']);

/**
 * Purely in-memory transactional reference implementation for deterministic
 * fault-injection tests. This is NOT a database or distributed lock.
 * The authoritative runtime MUST implement the SQL P1 contract instead.
 */
export class MemoryControlStore {
  constructor({now=()=>Date.now(),maxCoding=2}={}) {
    this.now=now;
    this.maxCoding=maxCoding;
    this.projects=new Map(); this.epics=new Map(); this.approvals=[];
    this.tasks=new Map();this.events=new Map();this.outbox=new Map();
    this.deliveries=new Map(); this.runs=new Map();
    this._chain=Promise.resolve();
  }
  async locked(fn) {
    let unlock;
    const next = new Promise(resolve => {unlock=resolve;});
    const previous=this._chain;
    this._chain=next;
    await previous;
    try {return await fn();} finally {unlock();}
  }
  registerProject(p) {this.projects.set(p.id,clone(p));}
  addEpic(e) {this.epics.set(e.id,clone(e));}
  addApproval(a) {this.approvals.push(clone(a));}
  addTask(t) {
    if (this.tasks.has(t.id)) throw Error('DUPLICATE_TASK');
    this.tasks.set(t.id,{...clone(t),version:0,epoch:0,leaseOwner:null,leaseExpiresAt:0,
      status:t.status||'DRAFT',runId:null});
  }
  getTask(id) {const t=this.tasks.get(id);return t?clone(t):null;}
  listTasks() {return [...this.tasks.values()].map(clone);}
  listOutbox() {return [...this.outbox.values()].map(clone);}
  event(key,type,taskId,details={}) {
    if (this.events.has(key)) return false;
    this.events.set(key,{key,type,taskId,details:clone(details),at:this.now()});
    return true;
  }
  async claim(id,{expectedVersion,worker,leaseMs=900000}={}) {
    return this.locked(()=>{
      const t=this.tasks.get(id);
      if(!t || t.version!==expectedVersion || t.status!=='QUEUED')
        return {ok:false,reason:'STALE_TASK_OR_REVISION'};
      const project=this.projects.get(t.projectId),epic=this.epics.get(t.epicId);
      const blocker=eligibleToClaim({project,epic,task:t,approvals:this.approvals,now:this.now()});
      if(blocker)return {ok:false,reason:blocker};
      if(!worker || leaseMs<60000 || leaseMs>1800000)
        return {ok:false,reason:'INVALID_LEASE'};
      if(!(t.dependsOn||[]).every(d=>this.tasks.get(d)?.status==='RELEASE_VERIFIED'))
        return {ok:false,reason:'DEPENDENCIES_NOT_RELEASE_VERIFIED'};
      const coding=[...this.tasks.values()].filter(x=>codingStatuses.has(x.status) && x.leaseExpiresAt>this.now());
      if(coding.length>=this.maxCoding)return {ok:false,reason:'CODING_CAPACITY_EXHAUSTED'};
      const other=[...this.tasks.values()].filter(x=>x.id!==id&&activeWriterStatuses.has(x.status));
      if(other.some(x=>x.projectId===t.projectId))return {ok:false,reason:'ONE_ACTIVE_TASK_PER_PROJECT'};
      if(other.some(x=>x.paths.some(p=>t.paths.some(q=>scopesOverlap(p,q)))))
        return {ok:false,reason:'SHARED_SCOPE_LOCKED'};
      t.status='DISPATCHING';t.version++;t.epoch++;
      t.leaseOwner=worker;t.leaseExpiresAt=this.now()+leaseMs;
      const opKey=`dispatch:${id}:${t.epoch}`;
      this.event(`claim:${id}:${t.epoch}`,'TASK_CLAIMED',id,{epoch:t.epoch,worker});
      this.outbox.set(opKey,{opKey,taskId:id,epoch:t.epoch,kind:'GITHUB_DISPATCH',
        status:'PENDING',attempts:0,runId:null,createdAt:this.now()});
      return {ok:true,taskId:id,epoch:t.epoch,version:t.version,opKey};
    });
  }
  async startDispatch(opKey) {
    return this.locked(()=>{
      const op=this.outbox.get(opKey);const t=op&&this.tasks.get(op.taskId);
      if(!op || op.status!=='PENDING' || !t || t.epoch!==op.epoch ||
         t.status!=='DISPATCHING'||t.leaseExpiresAt<=this.now())
        return {ok:false,reason:'NOT_DISPATCHABLE_OR_ALREADY_SENT'};
      op.status='INFLIGHT';op.attempts++;
      this.event(`send-start:${opKey}`,'DISPATCH_SEND_STARTED',t.id);
      return {ok:true,op:clone(op)};
    });
  }
  async acknowledgeAmbiguous(opKey) {
    return this.locked(()=>{
      const op=this.outbox.get(opKey);if(!op||op.status!=='INFLIGHT')return false;
      op.status='AMBIGUOUS';
      this.event(`send-ambiguous:${opKey}`,'DISPATCH_UNCONFIRMED',op.taskId);
      return true;
    });
  }
  async bindAttestedRun(opKey,{runId,verified,epoch}={}) {
    return this.locked(()=>{
      const op=this.outbox.get(opKey),t=op&&this.tasks.get(op.taskId);
      if(!verified || !Number.isSafeInteger(runId) || runId<1 || !op || !t ||
         !['AMBIGUOUS','INFLIGHT'].includes(op.status) || t.epoch!==epoch ||
         op.epoch!==epoch || t.leaseExpiresAt<=this.now() || t.status!=='DISPATCHING')
        return {ok:false,reason:'UNVERIFIED_OR_STALE_RUN'};
      if(this.runs.has(runId)&&this.runs.get(runId)!==opKey)
        return {ok:false,reason:'RUN_ALREADY_BOUND'};
      op.status='ACKED';op.runId=runId;t.status='CODING';t.runId=runId;t.version++;
      this.runs.set(runId,opKey);
      this.event(`run-bound:${opKey}`,'ATTESTED_GITHUB_RUN_BOUND',t.id,{runId,epoch});
      return {ok:true};
    });
  }
  async heartbeat(id,epoch,worker,extendMs=900000) {
    return this.locked(()=>{
      const t=this.tasks.get(id);
      if(!t||t.epoch!==epoch||t.leaseOwner!==worker||t.leaseExpiresAt<=this.now()||
         !codingStatuses.has(t.status) || extendMs<60000 || extendMs>1800000)return false;
      t.leaseExpiresAt=this.now()+extendMs;return true;
    });
  }
  async expireLeases() {
    return this.locked(()=>{
      const expired=[];
      for(const t of this.tasks.values()) {
        if(!codingStatuses.has(t.status)||t.leaseExpiresAt>this.now())continue;
        t.status='RECONCILING';t.version++;
        const op=this.outbox.get(`dispatch:${t.id}:${t.epoch}`);
        if(op&&['PENDING','INFLIGHT'].includes(op.status))op.status='AMBIGUOUS';
        this.event(`lease-expired:${t.id}:${t.epoch}`,'LEASE_EXPIRED',t.id);
        expired.push(t.id);
      }
      return expired;
    });
  }
  async clearVerifiedAbsentRun(id,epoch,{attestedNoRun=false}={}) {
    return this.locked(()=>{
      const t=this.tasks.get(id);
      if(!attestedNoRun||!t||t.epoch!==epoch||t.status!=='RECONCILING')return false;
      const op=this.outbox.get(`dispatch:${id}:${epoch}`);
      if(op?.runId)return false;
      if(op)op.status='CANCELLED';
      t.status='QUEUED';t.version++;t.leaseOwner=null;t.leaseExpiresAt=0;
      this.event(`run-cleared:${id}:${epoch}`,'CONFIRMED_NO_RUN',id);
      return true;
    });
  }
  async recordVerifiedRelease(id,evidence={}) {
    return this.locked(()=>{
      const t=this.tasks.get(id);
      if(!t || t.status!=='MERGED' || !evidence.verified || !evidence.nonproduction ||
         !evidence.exactHead || !evidence.acceptancePassed) return false;
      t.status='RELEASE_VERIFIED';t.version++;
      this.event(`release:${id}:${t.version}`,'RELEASE_VERIFIED',id,evidence);
      return true;
    });
  }
  async markSimulatedMerged(id) {
    return this.locked(()=>{
      const t=this.tasks.get(id);if(!t||t.status!=='CODING')return false;
      // TEST ONLY: does not call any GitHub merge or Production deployment.
      t.status='MERGED';t.version++;
      this.event(`simulated-merge:${id}`,'SIMULATED_MERGE_ONLY',id);
      return true;
    });
  }
  nextApproved(projectId) {
    const tasks=this.listTasks().map(t=>({...t,project:this.projects.get(t.projectId)}));
    return selectApprovedSuccessor({projectId,tasks,epics:[...this.epics.values()],approvals:this.approvals,now:this.now()});
  }
  async ingestDelivery(deliveryId,eventType,digest,payload) {
    return this.locked(()=>{
      if(this.deliveries.has(deliveryId))return {stored:false,duplicate:true};
      this.deliveries.set(deliveryId,{eventType,digest,payload:clone(payload)});
      this.event(`webhook:${deliveryId}`,'INBOUND_WEBHOOK',null,{eventType});
      return {stored:true,duplicate:false};
    });
  }
}
