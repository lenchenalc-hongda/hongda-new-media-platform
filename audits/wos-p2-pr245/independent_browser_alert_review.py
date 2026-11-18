#!/usr/bin/env python3
"""Independent master-derived, no-QA-credential reviewer for PR #245."""
import json, os, re, subprocess, sys, urllib.request
from pathlib import Path

REPO="lenchenalc-hongda/hongda-new-media-platform"
BRANCH="audit/wos-p2-pr245-alert-scope-20261118"
BASE="e9108d830b0c1109cce66dafdd1b0f0411484e98"
HEAD="8e8c8bee93efe3c9454dfd2f6e37eb5d21c2ba9e"
P2="89bb408d13e45458c608db29c47e2803d49b3170"
FILES={
 "protected":".github/workflows/wos-p2-pr241-protected-qa.yml",
 "ci":".github/workflows/wos-p2-qa-alert-scope-secretless-ci.yml",
 "runbook":"docs/workshop-order-system/nonproduction-only/WOS_P2_RUN_44242557421_ALERT_SCOPE_FAILURE_AND_CLOSEOUT.md",
 "chromium":"tests/e2e/wos-p2-qa-alert-isolation-secretless.cjs",
 "browser":"tests/e2e/wos-p2-qa-browser.cjs",
 "static":"tests/unit/wos-p2-protected-browser-launcher.test.cjs",
}
MUST={
 "protected":[
  "workflow_dispatch:","refs/heads/master","hongda-review-dev",
  "Protected QA authentication and organization read-only preflight",
  "Build and launch local Preview using only QA publishable key",
  "QA Preview ready, bounded Owner CAS handoff, no database writes",
  "WOS_P2_QA_PREVIEW_READY_FOR_SINGLE_OWNER_GATE_CAS=YES",
  "sleep 90",
  "Real 2-role Office/Operator test + Viewer/foreign denials",
  "Always atomically close BOTH QA DB gates with QA-admin-only RPC",
  "if: always()","wos-p2-qa-gate-failclose.cjs",
  "wos-p2-qa-browser.cjs",
  "89bb408d13e45458c608db29c47e2803d49b3170",
 ],
 "ci":[
  "qa/wos-p2-submit-alert-scope-fix-20261118",
  "persist-credentials: false",
  "playwright@1.56.1",
  "NODE_PATH=/tmp/hongda-qa-browser/node_modules",
  "WOS_P2_QA_ALERT_SCOPE_SECRETLESS_CHROMIUM=PASS",
 ],
 "runbook":[
  "44242557421",
  "UNCLASSIFIED","OFFICE_QA_SUBMIT_OR_ERROR",
  "was_enabled=false",
  "未授权","role=\"alert\"",
  "90 秒","没有连接 QA Auth",
 ],
 "chromium":[
  "const {chromium}=require('playwright')",
  "page.setContent(html)",
  "RETURNED_ORDERS_READ_FAILED",
  "const scoped=qaSubmitRegion.locator('[role=\"alert\"]')",
  "assert.equal(await scoped.count(),0",
  "QA_GATE_CLOSED",
  "WOS_P2_QA_UNRELATED_PAGE_ALERT_IGNORED=PASS",
  "WOS_P2_QA_COMPONENT_SUBMIT_ERROR_DETECTED=PASS",
  "WOS_P2_QA_BROWSER_SECRETLESS_ONLY=PASS",
 ],
 "browser":[
  "const origin='http://localhost:3000'",
  "--host-resolver-rules=MAP localhost 127.0.0.1",
  "stage='OFFICE_QA_SUBMIT_OR_ERROR'",
  "const qaSubmitRegion=office.page.locator('section[aria-label=\"隔离数据库真实下单验收\"]')",
  "const failureAlert=qaSubmitRegion.locator('[role=\"alert\"]')",
  "QA_SUBMIT_REGION_NOT_UNIQUE",
  "QA_SUBMISSION_ERROR_PRESENT_BEFORE_CLICK",
  "response.url()===origin+'/api/workshop-orders/production'",
  "WOS_P2_QA_SUBMIT_UI_ERROR_CODE=",
  "WOS_P2_PROTECTED_BROWSER_REAL_TWO_ROLE_E2E=PASS",
  "WOS_P2_PROTECTED_BROWSER_REAL_TWO_ROLE_E2E=FAIL",
 ],
 "static":[
  "WOS_P2_QA_SUBMIT_COMPONENT_ALERT_SCOPE=PASS",
  "WOS_P2_QA_PREVIEW_READY_CAS_HANDOFF_BOUNDARY=PASS",
  "WOS_P2_PROTECTED_BROWSER_NOT_EXECUTED=YES",
 ]
}
def api(path):
 token=os.getenv("GITHUB_REVIEW_TOKEN")
 if not token:raise AssertionError("GitHub read-only token missing")
 req=urllib.request.Request("https://api.github.com/repos/"+REPO+"/"+path,
  headers={"Authorization":"Bearer "+token,
  "Accept":"application/vnd.github+json",
  "User-Agent":"wos-p2-independent-pr245-alert-audit"})
 with urllib.request.urlopen(req,timeout=25) as resp:
  return json.load(resp)
def provenance():
 if os.getenv("GITHUB_REPOSITORY")!=REPO or \
    os.getenv("GITHUB_REF")!="refs/heads/"+BRANCH:
  raise AssertionError("reviewer must run on own isolated branch")
 if api("branches/master")["commit"]["sha"]!=BASE:
  raise AssertionError("master moved after candidate base")
 pr=api("pulls/245")
 if pr["head"]["sha"]!=HEAD or pr["base"]["ref"]!="master" or \
    not pr["draft"] or pr["state"]!="open" or pr["merged"]:
  raise AssertionError("PR 245 source HEAD/state changed")
 p2=api("pulls/241")
 if p2["head"]["sha"]!=P2 or not p2["draft"] or p2["merged"]:
  raise AssertionError("business PR #241 changed")
 files=api("pulls/245/files?per_page=100")
 if len(files)!=6 or {f["filename"] for f in files}!=set(FILES.values()):
  raise AssertionError("candidate contains other files")
 for id in (44243879205,44243886556):
  run=api("actions/runs/"+str(id))
  if run["head_sha"]!=HEAD or run["status"]!="completed" \
    or run["conclusion"]!="success":
   raise AssertionError("CI missing on exact candidate HEAD "+str(id))
 jobs=api("actions/runs/44243886556/jobs?per_page=100")
 if jobs["total_count"]!=2 or \
    {j["name"] for j in jobs["jobs"]}!= \
    {"lint-and-audit","glh-stage1-postgres-synthetic"} or \
    any(j["conclusion"]!="success" for j in jobs["jobs"]):
   raise AssertionError("protected CI jobs not all green")
 print("WOS_P2_PR245_EXACT_SHA_AND_ALL_CI_BOUND=PASS")
def files_at(root):
 root=Path(root).resolve(strict=True)
 actual=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
 if actual!=HEAD:raise AssertionError("unreviewed candidate checkout")
 data={}
 for k,v in FILES.items():
  p=root/v
  if p.is_symlink() or not p.is_file() or not p.resolve().is_relative_to(root):
   raise AssertionError("path escape")
  if p.stat().st_size>100000:raise AssertionError("unexpected file size")
  data[k]=p.read_text("utf-8")
 return data
def inspect(d):
 problems=[]
 for k,required in MUST.items():
  for marker in required:
   if marker not in d[k]:problems.append(k+" missing "+repr(marker))
 if "office.page.getByRole('alert').first()" in d["browser"]:
  problems.append("page-global alert false-positive restored")
 if "const origin='http://127.0.0.1:3000'" in d["browser"]:
  problems.append("old QA loopback host restored")
 if not (d["protected"].index("Protected QA authentication and organization read-only preflight")<
    d["protected"].index("Build and launch local Preview using only QA publishable key")<
    d["protected"].index("QA Preview ready, bounded Owner CAS handoff, no database writes")<
    d["protected"].index("Real 2-role Office/Operator test + Viewer/foreign denials")<
    d["protected"].index("Always atomically close BOTH QA DB gates with QA-admin-only RPC")):
  problems.append("QA identity/preview/CAS/browser/close sequence not monotonic")
 if re.search(r"(?mi)^\s*(?:push|pull_request_target)\s*:",d["protected"]):
  problems.append("privileged workflow auto-trigger")
 if "environment: hongda-review-dev" in d["ci"] or "secrets." in d["ci"]:
  problems.append("untrusted QA CI obtains protected credentials")
 if re.search(r"(?i)vercel\s+--prod|supabase\s+(?:db\s+push|migration\s+up)|gh\s+pr\s+merge",d["protected"]+"\n"+d["ci"]):
  problems.append("unapproved production/release/migration")
 if re.search(r"(?i)update\s+(?:public\.)?wos_qa_p2_(?:execution|office_execution)_gate\s+set\s+enabled\s*=\s*true",
    d["protected"]+"\n"+d["ci"]):
  problems.append("QA Runner attempts to turn Gate on")
 if re.search(r"(?i)console\.(?:log|error)\s*\(\s*(?:error|password|token|email|profile)\b",d["browser"]):
  problems.append("raw sensitive value output")
 if "page.screenshot(" in d["browser"] or "trace.zip" in d["browser"]:
  problems.append("browser evidence may capture credentials")
 if "sleep 3600" in d["protected"] or "sleep 900" in d["protected"]:
  problems.append("unbounded or wrong handoff interval")
 return problems
def negatives(d):
 n=0
 for name,required in MUST.items():
  for marker in required:
   changed=dict(d);changed[name]=changed[name].replace(marker,"")
   if not inspect(changed):raise AssertionError("reviewer missed removed protection")
   n+=1
 injections=[
  ("browser","office.page.getByRole('alert').first()"),
  ("browser","page.screenshot({path:'/tmp/qa-credentials.png'})"),
  ("browser","console.error(token)"),
  ("browser","const origin='http://127.0.0.1:3000'"),
  ("protected","\n  pull_request_target:\n"),
  ("protected","\n  push:\n"),
  ("protected","\n  run: vercel --prod\n"),
  ("protected","\n  run: supabase db push\n"),
  ("protected","\n  run: gh pr merge 241\n"),
  ("protected","\n  run: UPDATE public.wos_qa_p2_execution_gate SET enabled=true\n"),
  ("protected","\n  run: sleep 3600\n"),
  ("ci","\n  environment: hongda-review-dev\n"),
  ("ci","\n  run: echo \${{ secrets.REVIEW_DEV_ADMIN_PASSWORD }}\n"),
 ]
 for name,attack in injections:
  changed=dict(d);changed[name]=changed[name]+"\n"+attack
  if not inspect(changed):raise AssertionError("reviewer missed injected unsafe variant "+name)
  n+=1
 return n
def main():
 if len(sys.argv)!=2:raise AssertionError("candidate source checkout required")
 provenance()
 d=files_at(sys.argv[1])
 findings=inspect(d)
 if findings:
  for p in findings:print("FINDING:",p)
  print("WOS_P2_PR245_INDEPENDENT_REVIEW=FAIL")
  return 1
 count=negatives(d)
 print("WOS_P2_PR245_INDEPENDENT_REVIEW=PASS")
 print("WOS_P2_PR245_REVIEWER_NEGATIVE_TEST_COUNT="+str(count))
 print("WOS_P2_PR245_QA_SECRETS_USED=ZERO")
 print("WOS_P2_PR245_BUSINESS_WRITES=ZERO")
 print("WOS_P2_PR245_PRODUCTION_DEPLOYMENT=ZERO")
 print("WOS_P2_PR245_DRAFT_UNMERGED=YES")
 return 0
if __name__=="__main__":sys.exit(main())
