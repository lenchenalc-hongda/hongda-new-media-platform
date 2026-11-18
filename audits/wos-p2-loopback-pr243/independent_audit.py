#!/usr/bin/env python3
"""Reviewer-owned secretless QA browser source audit; no E2E execution."""
import json, os, re, subprocess, sys, urllib.request
from pathlib import Path

REPO = "lenchenalc-hongda/hongda-new-media-platform"
AUDITOR_BRANCH = "audit/wos-p2-run44232596314-localhost-fix-20261118"
MASTER = "82ae36421a727417606a559bf1588f117930ee48"
QA_FIX = "035b18e56d69398542f086dae4d2303b8c0ea1e0"
BUSINESS = "89bb408d13e45458c608db29c47e2803d49b3170"
FILES = {
 "browser": "tests/e2e/wos-p2-qa-browser.cjs",
 "contract": "tests/unit/wos-p2-protected-browser-launcher.test.cjs",
 "workflow": ".github/workflows/wos-p2-loopback-qa-secretless-ci.yml",
 "runbook": "docs/workshop-order-system/nonproduction-only/WOS_P2_RUN_44232596314_FAILURE_AND_LOOPBACK_FIX.md"
}
REQUIRED = {
 "browser": [
  "const origin='http://localhost:3000'",
  "--host-resolver-rules=MAP localhost 127.0.0.1",
  "const qaUrl='https://xulmpqaknlwqqculbsek.supabase.co'",
  "const exactHead='"+BUSINESS+"'",
  "WOS_P2_PROTECTED_BROWSER_E2E_ACK",
  "WOS_QA_BROWSER_ACK_TEST_WRITES",
  "stage='OFFICE_QA_PAGE_VISIBLE'",
  "stage='OFFICE_FILL_SYNTHETIC_SAMPLE'",
  "stage='OFFICE_SELECT_QA_IMAGE'",
  "stage='OFFICE_QA_LOCAL_VALIDATION'",
  "stage='OFFICE_QA_SUBMIT_OR_ERROR'",
  "failureAlert.waitFor({state:'visible',timeout:45000})",
  "response.url()===origin+'/api/workshop-orders/production'",
  "WOS_P2_QA_SUBMIT_UI_ERROR_CODE=",
  "QA_OFFICE_UI_REJECTED_BEFORE_POST",
  "QA_OFFICE_SUBMIT_NO_HTTP_RESPONSE",
  "WOS_P2_PROTECTED_BROWSER_REAL_TWO_ROLE_E2E=PASS",
  "WOS_P2_PROTECTED_BROWSER_REAL_TWO_ROLE_E2E=FAIL"
 ],
 "contract": [
  "WOS_P2_QA_LOCALHOST_HOST_GUARD_REGRESSION=PASS",
  "WOS_P2_QA_FAILURE_STAGE_AND_NO_SECRET_DIAGNOSTICS=PASS",
  "const origin='http://localhost:3000'",
  "--host-resolver-rules=MAP localhost 127.0.0.1",
 ],
 "workflow": [
  "qa/wos-p2-e2e-localhost-guard-fix-20261118",
  "persist-credentials: false",
  "node --check tests/e2e/wos-p2-qa-browser.cjs",
  "node tests/unit/wos-p2-protected-browser-launcher.test.cjs",
  "WOS_P2_LOOPBACK_QA_GUARD_FIX_SECRETLESS=PASS",
 ],
 "runbook": [
  "44232596314", "127.0.0.1", "localhost", "QA_ENVIRONMENT_NOT_PINNED",
  "110 seconds", "04:41:09", "83 orders", "81 P1 Inbox",
  "no second real E2E dispatch"
 ],
 "business": [
  "window.location.hostname === 'localhost'",
  "process.env.NEXT_PUBLIC_WOS_QA_LOCAL_TEST === 'true'",
  "window.location.hostname.endsWith('.vercel.app')",
  "QA_ENVIRONMENT_NOT_PINNED",
  "https://xulmpqaknlwqqculbsek.supabase.co"
 ],
}
def api(path):
 token = os.environ.get("GH_READ_TOKEN")
 if not token: raise AssertionError("read-only GitHub token missing")
 url = "https://api.github.com/repos/"+REPO+"/"+path
 req = urllib.request.Request(url, headers={
  "Authorization":"Bearer "+token, "Accept":"application/vnd.github+json",
  "User-Agent":"wos-p2-independent-loopback-auditor"})
 with urllib.request.urlopen(req,timeout=25) as response:
  return json.load(response)
def trust():
 if os.environ.get("GITHUB_REPOSITORY")!=REPO or \
    os.environ.get("GITHUB_REF")!="refs/heads/"+AUDITOR_BRANCH:
  raise AssertionError("untrusted reviewer identity")
 p = api("pulls/243")
 if p["state"]!="open" or not p["draft"] or p["merged"] \
   or p["head"]["sha"]!=QA_FIX or p["base"]["ref"]!="master":
  raise AssertionError("unexpected PR243 HEAD/state")
 if api("branches/master")["commit"]["sha"]!=MASTER:
  raise AssertionError("master security base changed")
 business=api("pulls/241")
 if business["head"]["sha"]!=BUSINESS or business["merged"]:
  raise AssertionError("business candidate changed")
 changes=api("pulls/243/files?per_page=100")
 if len(changes)!=4 or {i["filename"] for i in changes}!=set(FILES.values()):
  raise AssertionError("changed file scope exceeded")
 for rid in (44239538079,44239565536):
  run=api("actions/runs/"+str(rid))
  if run["head_sha"]!=QA_FIX or run["conclusion"]!="success" \
    or run["status"]!="completed":
   raise AssertionError("HEAD-bound secretless CI not green "+str(rid))
 jobs=api("actions/runs/44239565536/jobs?per_page=100")
 if jobs["total_count"]!=2 or \
    {j["name"] for j in jobs["jobs"]}!={"lint-and-audit","glh-stage1-postgres-synthetic"} \
    or any(j["conclusion"]!="success" for j in jobs["jobs"]):
  raise AssertionError("protected CI incomplete")
 print("WOS_P2_PR243_EXACT_SHA_AND_CI_INDEPENDENT_BINDING=PASS")
def load(base,sha,path):
 base=Path(base).resolve(strict=True)
 got=subprocess.check_output(["git","-C",str(base),"rev-parse","HEAD"],text=True).strip()
 if got!=sha:raise AssertionError("checkout HEAD mismatch")
 full=base/path
 if full.is_symlink() or not full.is_file() or not full.resolve().is_relative_to(base):
  raise AssertionError("unsafe checked file path")
 if full.stat().st_size>100000:raise AssertionError("unexpected source size")
 return full.read_text(encoding="utf-8")
def inspect(v):
 findings=[]
 for name,markers in REQUIRED.items():
  for marker in markers:
   if marker not in v[name]:findings.append(name+": missing "+repr(marker))
 for k in ("browser","contract","workflow","runbook"):
  if "SUPABASE_SERVICE_ROLE_KEY" in v[k] and k!="workflow":
   # The workflow's negative proof checks absence of the environment secret.
   findings.append(k+": unexpected service-role secret")
 if "const origin='http://127.0.0.1:3000'" in v["browser"]:
  findings.append("original browser host regression")
 if "timeout:110000" in v["browser"]:
  findings.append("old silent 110s timeout")
 if "page.screenshot(" in v["browser"] or "trace.zip" in v["browser"]:
  findings.append("sensitive browser recordings")
 if re.search(r"(?i)console\.(?:log|error)\s*\(\s*(?:error|token|password|response)\b",v["browser"]):
  findings.append("raw potentially-secret log")
 if re.search(r"(?mi)^\s*(?:pull_request_target|workflow_dispatch)\s*:",v["workflow"]):
  findings.append("unexpected privileged workflow trigger")
 if "secrets." in v["workflow"] or "environment: hongda-review-dev" in v["workflow"]:
  findings.append("untrusted QA branch accesses protected environment")
 if re.search(r"(?i)vercel\s+--prod|supabase\s+(?:db\s+push|migration)|gh\s+pr\s+merge",v["workflow"]):
  findings.append("deployment/migration/merge command")
 if "window.location.hostname === '127.0.0.1'" in v["business"]:
  findings.append("business QA guard changed outside reviewed scope")
 return findings
def mutations(v):
 total=0
 for name,markers in REQUIRED.items():
  for marker in markers:
   x=dict(v);x[name]=x[name].replace(marker,"")
   if not inspect(x):raise AssertionError("reviewer missed "+name+" marker "+marker)
   total+=1
 for name,attack in [
  ("browser","const origin='http://127.0.0.1:3000';"),
  ("browser","page.screenshot({path:'/tmp/qa-login.png'})"),
  ("browser","console.log(token)"),
  ("workflow","  pull_request_target:\n"),
  ("workflow","      environment: hongda-review-dev\n"),
  ("workflow","      QA_PASSWORD: "+'$'+"{{ secrets.REVIEW_DEV_ADMIN_PASSWORD }}"),
  ("workflow","      run: vercel --prod\n"),
  ("workflow","      run: gh pr merge 241\n"),
  ("workflow","      run: supabase db push\n"),
 ]:
  x=dict(v);x[name]=x[name]+"\n"+attack
  if not inspect(x):raise AssertionError("reviewer missed injected attack")
  total+=1
 return total
def main():
 if len(sys.argv)!=3:raise AssertionError("reviewer needs candidate and business checkout paths")
 trust()
 values={k:load(sys.argv[1],QA_FIX,p) for k,p in FILES.items()}
 values["business"]=load(sys.argv[2],BUSINESS,"src/components/workshop-orders/LiveQaProductionSubmit.tsx")
 findings=inspect(values)
 if findings:
  for f in findings:print("FINDING:",f)
  print("WOS_P2_PR243_INDEPENDENT_TECHNICAL_AUDIT=FAIL")
  return 1
 print("WOS_P2_PR243_INDEPENDENT_TECHNICAL_AUDIT=PASS")
 print("WOS_P2_PR243_REVIEWER_NEGATIVE_TESTS="+str(mutations(values)))
 print("WOS_P2_PR243_QA_SECRETS_USED=ZERO")
 print("WOS_P2_PR243_REAL_BROWSER_RERUN=NOT_AUTHORIZED")
 print("WOS_P2_PR243_MERGE=NOT_AUTHORIZED")
 return 0
if __name__=="__main__":sys.exit(main())
