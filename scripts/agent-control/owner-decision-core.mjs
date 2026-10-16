import {createHash} from 'node:crypto';
export const REPOSITORY='lenchenalc-hongda/hongda-new-media-platform';
export const OWNER='lenchenalc-hongda';
export function contract(body,marker){if(String(body).split(/\r?\n/)[0]!==marker)return null;try{return JSON.parse(body.match(/```json\s*([\s\S]*?)```/)[1]);}catch{return null;}}
export function stateOf(body){const matches=[...String(body).matchAll(/<!-- AGENT_CONTROL_STATE_START -->\s*```json\s*([\s\S]*?)```\s*<!-- AGENT_CONTROL_STATE_END -->/g)];if(matches.length!==1)throw Error('Invalid machine state');return JSON.parse(matches[0][1]);}
export function replaceState(body,state){stateOf(body);return body.replace(/<!-- AGENT_CONTROL_STATE_START -->[\s\S]*?<!-- AGENT_CONTROL_STATE_END -->/,'<!-- AGENT_CONTROL_STATE_START -->\n```json\n'+JSON.stringify(state,null,2)+'\n```\n<!-- AGENT_CONTROL_STATE_END -->');}
export function validateDecision({issue,comments,eventComment,registry}){
 if(eventComment.user?.login!==OWNER)throw Error('Untrusted decision author');
 const response=contract(eventComment.body,'OWNER_DECISION_V1');
 if(!response||!['HOLD','APPROVE_READ_ONLY_EVIDENCE'].includes(response.decision))throw Error('Unsupported decision');
 if(response.project!=='global-lead-hub'||response.control_issue!==72||registry.projects?.[response.project]?.control_issue!==issue.number)throw Error('Project/control mismatch');
 if(!response.request_id||!response.decision_id||!response.decided_at||!response.decided_by||response.production_blanket_authorization!==false)throw Error('Incomplete audit record');
 const state=stateOf(issue.body);
 const requests=comments.filter(c=>c.user?.login===OWNER).map(c=>({c,d:contract(c.body,'OWNER_DECISION_REQUEST_V1')})).filter(x=>x.d?.request_id===response.request_id);
 const active=comments.filter(c=>c.user?.login===OWNER).map(c=>({c,d:contract(c.body,'OWNER_DECISION_REQUEST_V1')})).filter(x=>x.d?.task_id===response.task_id&&x.d?.head_sha===response.head_sha).sort((a,b)=>a.c.id-b.c.id).at(-1);
 const request=requests.at(-1);if(active?.d?.request_id!==response.request_id)throw Error('Request was superseded');if(!request||request.c.id!==Number(response.request_comment_id))throw Error('Request identity changed');
 if(response.task_id!==request.d.task_id||response.head_sha!==request.d.head_sha||response.decision_scope!==request.d.scope||!/^[0-9a-f]{40}$/.test(response.head_sha)||!/APPROVE_READ_ONLY_EVIDENCE/.test(request.d.scope))throw Error('Scope/task/head mismatch');
 const prior=comments.filter(c=>c.user?.login===OWNER&&c.id<eventComment.id).map(c=>contract(c.body,'OWNER_DECISION_V1')).find(d=>d?.request_id===response.request_id&&['HOLD','APPROVE_READ_ONLY_EVIDENCE'].includes(d.decision));
 if(prior)throw Error('Gate already has a final response');
 if(state.owner_decision?.request_id===response.request_id){if(state.owner_decision.response_comment_id!==eventComment.id)throw Error('Gate already processed');return {response,state,request:request.d,resume:true};}
 if(state.status!=='HUMAN_GATE'||state.project!==response.project||state.current_task_id!==response.task_id||state.verified_head!==response.head_sha||state.active_pr!==null||state.active_branch!==null)throw Error('Gate changed; refresh required');
 return {response,state,request:request.d,resume:false};
}
export function boundedTask(response,masterSha){
 if(!/^[0-9a-f]{40}$/.test(masterSha))throw Error('Live master missing');
 const suffix=createHash('sha256').update(response.request_id).digest('hex').slice(0,12);
 const taskId='GLH-P9-READONLY-EVIDENCE-'+suffix.toUpperCase();
 const allowedPaths=['docs/global-lead-hub/owner-evidence/'+suffix+'.md'];
 const objective=['Perform only the owner-approved read-only evidence collection for release '+response.head_sha+'.','Authorization request: '+response.request_id+'.','Exact authorized scope: '+response.decision_scope,'No Production SQL/RLS/data/env/secret mutation, no secret-value reads, no Meta/WhatsApp cutover, no customer messages, no external publishing.','Use only already-authorized read-only service access. Missing credentials/capabilities must remain UNKNOWN with a precise access blocker; do not obtain credentials, weaken checks or fabricate PASS.','Write only a sanitized evidence report to the sole allowed repository path. No code, migrations, credentials, business/customer data or settings changes.'].join('\n');
 return {taskId,masterSha,allowedPaths,body:['AGENT_CONTROL_PROJECT_TASK_V1','PROJECT = global-lead-hub','TASK_ID = '+taskId,'TASK_STATUS = READY_FOR_CODEX','BASE_MASTER_SHA = '+masterSha,'EXPECTED_HEAD = '+masterSha,'FIX_ROUND = 0 / 3','ALLOWED_PATHS_JSON = '+JSON.stringify(allowedPaths),'CHECKS = typecheck,build,secret-audit,smoke','OBJECTIVE_B64 = '+Buffer.from(objective).toString('base64')].join('\n')};
}
export function trustedGeneratedTask(comment,state,comments){
 const d=state.owner_decision;
 if(comment.user?.login!=='github-actions[bot]'||!d||d.decision!=='APPROVE_READ_ONLY_EVIDENCE'||Number(d.task_comment_id)!==comment.id)return false;
 const responseComment=comments.find(c=>c.id===Number(d.response_comment_id)&&c.user?.login===OWNER);
 const response=responseComment&&contract(responseComment.body,'OWNER_DECISION_V1');
 if(!response||response.request_id!==d.request_id||response.decision!==d.decision)return false;
 const task=boundedTask(response,state.master_sha);
 return state.current_task_id===task.taskId&&state.verified_head===task.masterSha&&comment.body===task.body;
}
