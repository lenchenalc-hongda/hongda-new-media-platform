import fs from 'node:fs';
import {REPOSITORY,OWNER,stateOf,replaceState,validateDecision,boundedTask} from './owner-decision-core.mjs';
const token=process.env.GITHUB_TOKEN;
async function api(path,method='GET',body){const r=await fetch('https://api.github.com/repos/'+REPOSITORY+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('GitHub request failed: '+r.status);return r.status===204?null:r.json();}
async function comments(number){const out=[];for(let page=1;page<=20;page++){const list=await api(`/issues/${number}/comments?per_page=100&page=${page}`);out.push(...list);if(list.length<100)return out;}throw Error('Comment window exceeded');}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
 if(!token||process.env.GITHUB_EVENT_NAME!=='issue_comment'||event.repository?.full_name!==REPOSITORY||event.sender?.login!==OWNER||event.issue?.number!==72||event.issue.pull_request||event.comment?.user?.login!==OWNER)throw Error('Untrusted event');
 let issue=await api('/issues/72');const all=await comments(72),live=await api('/issues/comments/'+event.comment.id);
 if(live.body!==event.comment.body)throw Error('Decision was edited after trigger');
 const registry=JSON.parse(fs.readFileSync('.github/agent-control/project-registry.json','utf8'));
 const {response,state,resume}=validateDecision({issue,comments:all,eventComment:live,registry});
 let current=state;
 async function save(next){const latest=await api('/issues/72'),actual=stateOf(latest.body);if(JSON.stringify(actual)!==JSON.stringify(current))throw Error('Concurrent control change; no overwrite');await api('/issues/72','PATCH',{body:replaceState(latest.body,next)});current=next;}
 async function ack(status,extra={}){await api('/issues/72/comments','POST',{body:'OWNER_DECISION_ACK_V1\n```json\n'+JSON.stringify({decision_id:response.decision_id,request_id:response.request_id,task_id:current.current_task_id,status,...extra})+'\n```'});}
 if(response.decision==='HOLD'){
 if(!resume)await save({...state,status:'HUMAN_GATE',runtime_status:'WAITING_OWNER',owner_action_required:true,owner_decision:{request_id:response.request_id,response_comment_id:live.id,decision_id:response.decision_id,decision:'HOLD',phase:'HELD'}});
 await ack('HELD',{message:'该 Gate 已暂缓；未创建执行任务、未 dispatch 执行 Workflow。'});return;
 }
 if(!resume){
 const master=await api('/branches/master'),task=boundedTask(response,master.commit.sha);
 const open=await api('/pulls?state=open&per_page=100');if(open.some(p=>p.head?.ref?.startsWith('codex/glh-')))throw Error('GLH already has an active PR');
 // Save task identity before task comment. Reruns can safely finish this prepared state.
 await save({...state,status:'READY_FOR_CODEX',runtime_status:'WAITING_OWNER',current_task_id:task.taskId,current_phase:'Global Lead Hub / Owner-authorized Read-only Evidence Collection',master_sha:task.masterSha,verified_head:task.masterSha,active_pr:null,active_branch:null,fix_round:0,owner_action_required:true,production_execution_authorized:false,auto_production:false,auto_merge:false,owner_decision:{request_id:response.request_id,response_comment_id:live.id,decision_id:response.decision_id,decision:response.decision,release_sha:response.head_sha,phase:'PREPARED'}});
 }
 const task=boundedTask(response,current.master_sha);
 if(!current.owner_decision.task_comment_id){
 const existing=(await comments(72)).find(c=>c.user?.login==='github-actions[bot]'&&c.body===task.body);
 const comment=existing||await api('/issues/72/comments','POST',{body:task.body});
 await save({...current,owner_decision:{...current.owner_decision,task_comment_id:comment.id}});
 }
 const workflow='global-lead-hub-agent-control.yml';
 async function findRun(){const data=await api('/actions/workflows/'+workflow+'/runs?event=workflow_dispatch&per_page=100');return data.workflow_runs.find(r=>r.display_title===task.taskId&&r.head_sha===current.master_sha&&Date.parse(r.created_at)>=Date.parse(current.owner_decision.dispatch_intent_at||'9999-01-01'));}
 if(!current.owner_decision.dispatch_intent_at){
 const at=new Date().toISOString();await save({...current,owner_decision:{...current.owner_decision,phase:'DISPATCH_INTENT',dispatch_intent_at:at}});
 // The durable intent is written before POST. A retry never blindly redispatches.
 await api('/actions/workflows/'+workflow+'/dispatches','POST',{ref:'master',inputs:{recovery_task_id:task.taskId,recovery_expected_head:current.master_sha,recovery_attempt:'0',recovery_reason:'OWNER_APPROVED_READ_ONLY_EVIDENCE'}});
 }
 let run;for(let n=0;n<12;n++){run=await findRun();if(run)break;await sleep(5000);}
 if(!run){await ack('DISPATCH_UNCONFIRMED',{message:'决策已记录，执行 Run 尚未确认；不会自动重复 dispatch。'});throw Error('Run unconfirmed; inspect before retry');}
 await save({...current,owner_action_required:false,runtime_status:run.status==='in_progress'?'RUNNING':'QUEUED',owner_decision:{...current.owner_decision,phase:'RUN_CONFIRMED',run_id:run.id,run_url:run.html_url,started_at:run.run_started_at||run.created_at}});
 await ack('RUN_CONFIRMED',{run_id:run.id,task_id:task.taskId,started_at:run.run_started_at||run.created_at,url:run.html_url,message:'真实执行 Workflow Run 已创建；具体执行状态以 Run jobs 为准。'});
}
export const completion=main().catch(e=>{console.error(e.message);process.exitCode=1;});
