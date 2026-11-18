#!/usr/bin/env python3
"""Independent reviewer-owned, secretless QA CAS + exact order reuse audit.
Source is checked out from a master-derived auditor branch. Candidate bytes
are never executed by this script. No Supabase QA or Production secrets.
"""
import json, os, re, subprocess, sys, urllib.request
from pathlib import Path

REPO="lenchenalc-hongda/hongda-new-media-platform"
AUDITOR="audit/wos-p2-pr246-owner-cas-reuse-order-20261118"
BASE="4cda5481d075dd928b6a68d85513fffe90e6dd10"
HEAD="39f76d1ed2158c4b0d4f6f8e316587fd8f2d5684"
P2="89bb408d13e45458c608db29c47e2803d49b3170"
P1="6a72b446ccc517a5ff14e531b8a6663b4a70a77e"
RUNS=(44260440435,44260449908)
FILES={
 "workflow":".github/workflows/wos-p2-pr241-protected-qa.yml",
 "ci":".github/workflows/wos-p2-owner-cas-reuse-secretless-ci.yml",
 "doc":"docs/workshop-order-system/nonproduction-only/WOS_P2_OWNER_CAS_ATTEST_AND_REUSE_ORDER_BASELINE.md",
 "sql":"docs/workshop-order-system/nonproduction-only/wos_p2_owner_cas_attest_PROPOSED_QA_ONLY.sql",
 "chromium":"tests/e2e/wos-p2-qa-alert-isolation-secretless.cjs",
 "browser":"tests/e2e/wos-p2-qa-browser.cjs",
 "attestor":"tests/e2e/wos-p2-qa-owner-cas-attest.cjs",
 "pgsetup":"tests/sql/wos-p2-owner-cas-pg17-setup.sql",
 "pgtests":"tests/sql/wos-p2-owner-cas-pg17-tests.sql",
 "mock":"tests/unit/wos-p2-owner-cas-attest.test.cjs",
 "contract":"tests/unit/wos-p2-protected-browser-launcher.test.cjs"
}
NEEDED={
 "workflow":[
  "workflow_dispatch:","refs/heads/master",
  'test "$GITHUB_RUN_ATTEMPT" = "1"',
  "environment: hongda-review-dev",
  "protected-source-gate",
  "Protected QA authentication and organization read-only preflight",
  "Build and launch local Preview using only QA publishable key",
  "Await live read-only Owner CAS proof for existing order",
  "WOS_P2_QA_LIVE_OWNER_CAS_VERIFIED_BEFORE_BROWSER=PASS",
  "node tests/e2e/wos-p2-qa-owner-cas-attest.cjs",
  "WOS_P2_REUSE_EXISTING_ORDER_ONLY: 'true'",
  "WOS_P2_OWNER_CAS_READONLY_ACK: 'true'",
  "Real 2-role Office/Operator test + Viewer/foreign denials",
  "Always atomically close BOTH QA DB gates with QA-admin-only RPC",
  "if: always()","wos-p2-qa-gate-failclose.cjs",
 ],
 "sql":[
  "NOT INSTALLED",
  "SECURITY DEFINER","SET search_path = pg_catalog, public, auth, wos_qa_safety",
  "auth.uid()",
  "'953d2204-3e65-4b75-b10e-c6e97f1bbb56'::uuid",
  "'QA-NONPROD-d2f91453-fe42-42e9-98d4-a6a902645ded'",
  "'89bb408d13e45458c608db29c47e2803d49b3170'",
  "wos_qa_safety.p2_gate_close_receipts",
  "public.wos_submission_receipts",
  "public.wos_workshop_inbox",
  "public.wos_qa_p2_action_receipts",
  "v_operator.enabled IS DISTINCT FROM TRUE",
  "v_office.enabled IS DISTINCT FROM TRUE",
  "v_expected_ref := 'OWNER_RUN_' || p_github_run_id",
  "v_operator.enabled_until <= v_now + interval '120 seconds'",
  "v_operator.enabled_until > v_now + interval '15 minutes'",
  "RETURN pg_catalog.jsonb_build_object('status','WAITING')",
  "'status','READY'",
  "REVOKE ALL ON FUNCTION public.wos_qa_p2_owner_cas_attest",
  "GRANT EXECUTE ON FUNCTION public.wos_qa_p2_owner_cas_attest",
  "TO authenticated",
 ],
 "attestor":[
  "MAX_POLL_MS=600000",
  "INTERVAL_MS=5000",
  "GITHUB_RUN_ATTEMPT,'1'",
  "WOS_P2_REUSE_EXISTING_ORDER_ONLY",
  "WOS_P2_OWNER_CAS_READONLY_ACK",
  "QA_OWNER_CAS_NOT_ATTESTED_BEFORE_DEADLINE",
  "wos_qa_p2_owner_cas_attest",
  "p_github_run_id:c.runId",
  "p_order_id:EXISTING_ORDER_ID",
  "operatorEnabled!==true",
  "officeEnabled!==true",
  "WOS_P2_OWNER_CAS_LIVE_DB_RUN_BOUND_PROOF=PASS",
 ],
 "browser":[
  "const orderId=EXISTING_ORDER_ID",
  "const orderNumber=EXISTING_ORDER_NUMBER",
  "stage='OWNER_CAS_REVERIFY_BEFORE_ANY_BROWSER_ACTION'",
  "await checkOnce()",
  "stage='OPERATOR_EXISTING_ORDER_INBOX'",
  "stage='OPERATOR_ACCEPT'",
  "stage='OPERATOR_RETURN'",
  "stage='OFFICE_LOGIN_AFTER_RETURN'",
  "OFFICE_SIX_FIELD_VERSIONED_SAVE_AND_SNAPSHOT",
  "OPERATOR_REVIEW_CORRECTION_ONLY_RESOLVED_DOCUMENT_BLOCKER",
  "VIEWER_AND_FOREIGN_DENIED_WITHOUT_SIDE_EFFECTS",
  "WOS_P2_PROTECTED_BROWSER_REAL_TWO_ROLE_E2E=PASS",
 ],
 "ci":[
  "persist-credentials: false",
  "pg17-ephemeral-attestation",
  "postgres:17-alpine",
  "wos-p2-owner-cas-pg17-setup.sql",
  "wos-p2-owner-cas-pg17-tests.sql",
  "wos-p2-owner-cas-attest.test.cjs",
  "WOS_P2_PG17_LIVE_SQL_TESTS_EPHEMERAL_ONLY=PASS",
 ],
 "pgtests":[
  "WOS_P2_QA_PG17_BOTH_OFF_WAITING=PASS",
  "WOS_P2_QA_PG17_RUN_BOUND_DUAL_GATE_READY=PASS",
  "WOS_P2_QA_PG17_OPERATOR_NOT_PRIVILEGED=PASS",
  "WOS_P2_QA_PG17_CROSS_ORG_ADMIN_DENIED=PASS",
  "WOS_P2_QA_PG17_PARTIAL_GATE_DENIED=PASS",
  "WOS_P2_QA_PG17_EXPIRED_GATE_DENIED=PASS",
  "WOS_P2_QA_PG17_CLOSED_RUN_REPLAY_DENIED=PASS",
  "WOS_P2_QA_PG17_ATTESTOR_ZERO_BUSINESS_WRITES=PASS",
 ],
 "mock":[
  "missing Owner CAS times out closed without writing anything",
  "independent Owner CAS proof rejects spoofing, partial Gate and time drift",
  "GITHUB_RUN_ATTEMPT:'2'",
  "QA_OWNER_CAS_NOT_ATTESTED_BEFORE_DEADLINE",
 ],
 "contract":[
  "WOS_P2_QA_EXISTING_ORDER_NO_DUPLICATE_P1=PASS",
  "WOS_P2_OWNER_CAS_RUN_BOUND_LIVE_PROOF_ORDERING=PASS",
  "WOS_P2_PROTECTED_BROWSER_NOT_EXECUTED=YES",
 ],
 "chromium":[
  "WOS_P2_CHROMIUM_REUSE_ORDER_NO_QA_NETWORK=PASS",
  "QA-NONPROD-unrelated-other-order",
 ],
 "doc":[
  "尚未安装",
  "953d2204-3e65-4b75-b10e-c6e97f1bbb56",
  "不允许再次提交办公室新生产订单",
  "明确迁移授权",
 ],
 "pgsetup":["CREATE ROLE anon","CREATE ROLE authenticated","CREATE SCHEMA auth","CREATE TABLE public.wos_qa_p2_execution_gate"],
}
def api(path):
  token=os.getenv("GH_AUDIT_READ_TOKEN")
  if not token:raise AssertionError("independent reviewer lacks GitHub read token")
  req=urllib.request.Request("https://api.github.com/repos/"+REPO+"/"+path,
    headers={"Authorization":"Bearer "+token,
      "Accept":"application/vnd.github+json",
      "User-Agent":"wos-p2-pr246-reviewer-owned-static-audit"})
  with urllib.request.urlopen(req,timeout=25) as response:
    return json.load(response)
def attest_provenance():
  if os.getenv("GITHUB_REPOSITORY")!=REPO or \
     os.getenv("GITHUB_REF")!="refs/heads/"+AUDITOR:
    raise AssertionError("auditor not isolated")
  if api("branches/master")["commit"]["sha"]!=BASE:
    raise AssertionError("base master has changed")
  pr=api("pulls/246")
  if pr["state"]!="open" or not pr["draft"] or pr["merged"] or \
     pr["head"]["sha"]!=HEAD or pr["base"]["ref"]!="master":
    raise AssertionError("candidate PR exact HEAD/state mismatch")
  for n,head in ((238,P1),(241,P2)):
    prx=api("pulls/"+str(n))
    if prx["head"]["sha"]!=head or prx["merged"] or not prx["draft"]:
      raise AssertionError("business PR changed: "+str(n))
  changed=api("pulls/246/files?per_page=100")
  if len(changed)!=len(FILES) or {f["filename"] for f in changed}!=set(FILES.values()):
    raise AssertionError("unreviewed file scope")
  for rid in RUNS:
    run=api("actions/runs/"+str(rid))
    if run["head_sha"]!=HEAD or run["status"]!="completed" \
       or run["conclusion"]!="success":
      raise AssertionError("latest HEAD CI not green: "+str(rid))
  jobs=api("actions/runs/44260440435/jobs?per_page=100")
  if jobs["total_count"]!=2 or \
     {j["name"] for j in jobs["jobs"]}!={
       "secretless-runtime-contract","pg17-ephemeral-attestation"} or \
     any(j["conclusion"]!="success" for j in jobs["jobs"]):
    raise AssertionError("QA isolated SQL/Chromium CI not both green")
  jobs=api("actions/runs/44260449908/jobs?per_page=100")
  if jobs["total_count"]!=2 or \
     {j["name"] for j in jobs["jobs"]}!={"lint-and-audit","glh-stage1-postgres-synthetic"} or \
     any(j["conclusion"]!="success" for j in jobs["jobs"]):
    raise AssertionError("complete protected CI not green")
  print("WOS_P2_PR246_REVIEWER_EXACT_HEAD_AND_ALL_CI=PASS")
def load(candidate):
  root=Path(candidate).resolve(strict=True)
  head=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
  if head!=HEAD:raise AssertionError("candidate checkout HEAD drift")
  out={}
  for name,path in FILES.items():
    obj=root/path
    if obj.is_symlink() or not obj.is_file() or not obj.resolve().is_relative_to(root):
      raise AssertionError("unsafe file source: "+name)
    if obj.stat().st_size>80000:raise AssertionError("unexpected large file")
    out[name]=obj.read_text("utf-8")
  return out
def inspect(v):
  bad=[]
  for name,required in NEEDED.items():
    for token in required:
      if token not in v[name]:
        bad.append(name+" missing "+repr(token))
  if re.search(r"(?mi)^\s*(?:push|pull_request_target)\s*:",v["workflow"]):
    bad.append("protected QA workflow auto triggers")
  if "sleep 90" in v["workflow"] or "OWNER_CAS_HANDOFF_ELAPSED" in v["workflow"]:
    bad.append("fixed 90sec handoff retained")
  if v["workflow"].find("Await live read-only Owner CAS proof for existing order") > \
     v["workflow"].find("Real 2-role Office/Operator test + Viewer/foreign denials"):
    bad.append("cas proof occurs after browser write")
  if v["browser"].find("await checkOnce()") > \
     v["browser"].find("const browser=await chromium.launch"):
    bad.append("browser opens before re-attestation")
  if re.search(r"(?i)setInputFiles\s*\(|上传图片并提交 QA 订单|OFFICE_UI_SYNTHETIC_SUBMISSION_HTTP_AND_RECEIPT",
    v["browser"]):
    bad.append("new P1 submission still present")
  if re.search(r"(?i)UPDATE\s+(?:public\.)?wos_qa_p2_(?:office_)?execution_gate\s+SET\s+enabled\s*=\s*true",
     v["sql"]+"\n"+v["workflow"]+"\n"+v["attestor"]):
    bad.append("QA read-only attestor enables database gate")
  if re.search(r"(?i)GRANT\s+(?:SELECT|UPDATE|ALL)\s+ON\s+(?:TABLE\s+)?public\.wos_qa_p2_",
    v["sql"]):
    bad.append("broad Gate table grant")
  if "SUPABASE_SERVICE_ROLE_KEY" in v["attestor"] or \
     "service_role" in v["attestor"]:
    bad.append("privileged Supabase key in Node attestor")
  if "secrets." in v["ci"] or "environment: hongda-review-dev" in v["ci"]:
    bad.append("untrusted branch gets protected QA secrets")
  if re.search(r"(?i)vercel\s+--prod|supabase\s+db\s+push|gh\s+pr\s+merge",
    v["workflow"]+"\n"+v["ci"]):
    bad.append("unapproved deploy or database change")
  if "console.log(error)" in v["browser"] or "console.error(error)" in v["browser"] \
     or "page.screenshot(" in v["browser"]:
    bad.append("secret-containing browser evidence")
  return bad
def mutations(v):
  counter=0
  for name,required in NEEDED.items():
    for token in required:
      variant=dict(v);variant[name]=variant[name].replace(token,"")
      if not inspect(variant):raise AssertionError("reviewer missed deletion "+name)
      counter+=1
  attacks=[
    ("workflow","\n  pull_request_target:\n"),
    ("workflow","\n  push:\n"),
    ("workflow","\n    run: sleep 90\n"),
    ("workflow","\n    run: vercel --prod\n"),
    ("workflow","\n    run: gh pr merge 241\n"),
    ("ci","\n  environment: hongda-review-dev\n"),
    ("ci","\n  env: { ADMIN: \${{ secrets.REVIEW_DEV_ADMIN_PASSWORD }} }\n"),
    ("browser","await page.setInputFiles('input[type=file]','secret.png')"),
    ("browser","console.log(error)"),
    ("browser","page.screenshot({path:'/tmp/creds.png'})"),
    ("sql","GRANT SELECT ON public.wos_qa_p2_execution_gate TO authenticated;"),
    ("sql","UPDATE public.wos_qa_p2_execution_gate SET enabled=true;"),
    ("attestor","const service_role='fake';"),
  ]
  for name,attack in attacks:
    variant=dict(v);variant[name]=variant[name]+"\n"+attack
    if not inspect(variant):raise AssertionError("reviewer missed attack "+name)
    counter+=1
  return counter
def main():
  if len(sys.argv)!=2:raise AssertionError("candidate checkout required")
  attest_provenance()
  docs=load(sys.argv[1])
  findings=inspect(docs)
  if findings:
    for finding in findings:print("FINDING",finding)
    print("WOS_P2_PR246_INDEPENDENT_SECURITY_AUDIT=FAIL")
    return 1
  n=mutations(docs)
  print("WOS_P2_PR246_INDEPENDENT_SECURITY_AUDIT=PASS")
  print("WOS_P2_PR246_REVIEWER_NEGATIVE_TESTS="+str(n))
  print("WOS_P2_PR246_QA_CREDENTIALS_USED=ZERO")
  print("WOS_P2_PR246_CANDIDATE_CODE_EXECUTED=NO")
  print("WOS_P2_PR246_LIVE_QA_WRITE_ATTEMPTS=ZERO")
  print("WOS_P2_PR246_NO_PRODUCTION_OR_MERGE=PASS")
  return 0
if __name__=="__main__":sys.exit(main())
