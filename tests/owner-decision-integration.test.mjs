import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve('.'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'gate-handler-'));
const owner={login:'lenchenalc-hongda'},sha='a'.repeat(40),master='b'.repeat(40);
const encode=(m,d)=>m+'\n```json\n'+JSON.stringify(d)+'\n```';
const request={request_id:'gate-test',task_id:'GLH-GATE',head_sha:sha,scope:'APPROVE_READ_ONLY_EVIDENCE: metadata only'};
const response={decision_id:'d1',request_id:request.request_id,project:'global-lead-hub',control_issue:72,task_id:request.task_id,head_sha:sha,decision_scope:request.scope,request_comment_id:1,decision:'APPROVE_READ_ONLY_EVIDENCE',decided_by:{email:'owner'},decided_at:new Date().toISOString(),production_blanket_authorization:false};
fs.mkdirSync(path.join(temp,'.github/agent-control'),{recursive:true});fs.writeFileSync(path.join(temp,'.github/agent-control/project-registry.json'),JSON.stringify({projects:{'global-lead-hub':{control_issue:72}}}));
const originalFetch=global.fetch,originalCwd=process.cwd();
async function scenario(decision){
 const state={schema_version:1,project:'global-lead-hub',status:'HUMAN_GATE',current_task_id:request.task_id,verified_head:sha,master_sha:sha,active_pr:null,active_branch:null,fix_round:0,max_fix_rounds:3,auto_merge:false,auto_production:false};
 let issue={number:72,body:'<!-- AGENT_CONTROL_STATE_START -->\n```json\n'+JSON.stringify(state)+'\n```\n<!-- AGENT_CONTROL_STATE_END -->'},comments=[{id:1,user:owner,body:encode('OWNER_DECISION_REQUEST_V1',request)},{id:2,user:owner,body:encode('OWNER_DECISION_V1',{...response,decision})}],dispatches=0,runs=[];
 const event={repository:{full_name:'lenchenalc-hongda/hongda-new-media-platform'},sender:owner,issue:{number:72},comment:comments[1]};
 fs.writeFileSync(path.join(temp,'event.json'),JSON.stringify(event));process.env.GITHUB_EVENT_PATH=path.join(temp,'event.json');process.env.GITHUB_EVENT_NAME='issue_comment';process.env.GITHUB_TOKEN='fake-local-test-token';
 global.fetch=async(url,o={})=>{const u=new URL(url),p=u.pathname.replace('/repos/lenchenalc-hongda/hongda-new-media-platform',''),method=o.method||'GET';let result;
 if(p==='/issues/72'&&method==='GET')result=structuredClone(issue);
 else if(p==='/issues/72'&&method==='PATCH'){issue={...issue,...JSON.parse(o.body)};result=issue;}
 else if(p==='/issues/comments/2')result=comments[1];
 else if(p==='/issues/72/comments'&&method==='GET')result=comments;
 else if(p==='/issues/72/comments'&&method==='POST'){result={id:comments.length+1,user:{login:'github-actions[bot]'},...JSON.parse(o.body)};comments.push(result);}
 else if(p==='/branches/master')result={commit:{sha:master}};
 else if(p==='/pulls')result=[];
 else if(p.endsWith('/dispatches')){dispatches++;const inputs=JSON.parse(o.body).inputs;runs.push({id:999,display_title:inputs.recovery_task_id,head_sha:master,created_at:new Date().toISOString(),html_url:'https://example/run/999',status:'queued'});return new Response(null,{status:204});}
 else if(p.endsWith('/runs'))result={workflow_runs:runs};
 else throw Error('Unexpected API '+method+' '+p);
 return new Response(JSON.stringify(result),{status:200});};
 const mod=await import(pathToFileURL(path.join(root,'scripts/agent-control/owner-decision-handler.mjs')).href+'?case='+decision);await mod.completion;
 assert.equal(process.exitCode||0,0);assert.equal(dispatches,decision==='HOLD'?0:1);
 const machine=JSON.parse(issue.body.match(/```json\s*([\s\S]*?)```/)[1]);
 if(decision==='HOLD'){assert.equal(machine.status,'HUMAN_GATE');assert.equal(comments.filter(c=>c.body.startsWith('AGENT_CONTROL_PROJECT_TASK_V1')).length,0);}
 else{assert.equal(machine.owner_decision.run_id,999);assert.equal(machine.runtime_status,'QUEUED');assert.equal(comments.filter(c=>c.body.startsWith('AGENT_CONTROL_PROJECT_TASK_V1')).length,1);
 const again=await import(pathToFileURL(path.join(root,'scripts/agent-control/owner-decision-handler.mjs')).href+'?case=resume');await again.completion;assert.equal(dispatches,1);}
}
try{process.chdir(temp);await scenario('HOLD');await scenario('APPROVE_READ_ONLY_EVIDENCE');console.log('Handler integration: HOLD audit/no execution, APPROVE bounded task -> dispatch -> exact Run ID, crash-safe rerun/no duplicate dispatch PASS');}finally{global.fetch=originalFetch;process.chdir(originalCwd);fs.rmSync(temp,{recursive:true,force:true});}
