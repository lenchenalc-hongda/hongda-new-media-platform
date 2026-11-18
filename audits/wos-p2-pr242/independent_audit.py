#!/usr/bin/env python3
"""Independent technical review of PR242. Static pass is NOT permission to merge or execute."""
import json,os,re,sys,subprocess,urllib.request
from pathlib import Path
REPO="lenchenalc-hongda/hongda-new-media-platform"
PIN="79d64514799401a2df98844ddc5be11ddc49697d"
BASE="b4edd93bb16f7a651ca37864a51a158727fd23f2"
BRANCH="audit/wos-p2-pr242-protected-runner-20261118"
FILES=[
".github/workflows/wos-p2-browser-design-secretless-ci.yml",
".github/workflows/wos-p2-pr241-protected-qa.yml",
"docs/workshop-order-system/nonproduction-only/WOS_P2_PROTECTED_BROWSER_QA_RUNBOOK.md",
"tests/e2e/wos-p2-qa-browser.cjs",
"tests/unit/wos-p2-protected-browser-launcher.test.cjs",
"docs/workshop-order-system/nonproduction-only/wos_p2_qa_gate_failclose_NOT_FOR_PRODUCTION.sql",
"tests/e2e/wos-p2-qa-gate-failclose.cjs",
"tests/sql/wos-p2-gate-failclose-pg17-fixture.sql",
"tests/sql/wos-p2-gate-failclose-pg17-assertions.sql"]
CHECKS={
"workflow":["workflow_dispatch:","github.ref == 'refs/heads/master'",
 "environment: hongda-review-dev","cancel-in-progress: false","persist-credentials: false",
 "path: app","path: trusted","test \"$GITHUB_SHA\" = \"$TRUSTED_MASTER\"",
 "89bb408d13e45458c608db29c47e2803d49b3170","actions/runs/44127583534",
 "actions/runs/44128682235","secrets.REVIEW_DEV_ADMIN_PASSWORD",
 "secrets.REVIEW_DEV_OPERATOR_PASSWORD","secrets.REVIEW_DEV_VIEWER_PASSWORD",
 "secrets.REVIEW_DEV_FOREIGN_PASSWORD","WOS_P2_QA_MUTATIONS_ENABLED: 'true'",
 "WOS_P2_QA_OFFICE_REVISION_ENABLED: 'true'","if: always()",
 "kill \"$(cat /tmp/wos-p2-next.pid)\""],
"browser":["WOS_P2_REVIEWED_SHA","WOS_P2_PROTECTED_BROWSER_E2E_ACK",
 "WOS_QA_BROWSER_ACK_TEST_WRITES","OFFICE_UI_SYNTHETIC_SUBMISSION_HTTP_AND_RECEIPT",
 "OPERATOR_RETURN_BLOCKER_TRANSACTION","OFFICE_SIX_FIELD_VERSIONED_SAVE_AND_SNAPSHOT",
 "OFFICE_STALE_VERSION_REJECTED","OFFICE_RESUBMIT_SAVED_REVISION_WITHOUT_DUPLICATING_P1_INBOX",
 "OPERATOR_REVIEW_CORRECTION_ONLY_RESOLVED_DOCUMENT_BLOCKER",
 "OLD_SIGNED_SAMPLE_BLOCKED_FOR_CURRENT_REVISION",
 "VIEWER_AND_FOREIGN_DENIED_WITHOUT_SIDE_EFFECTS"],
"runbook":["xulmpqaknlwqqculbsek","OPERATOR_WRITES","OFFICE_WRITES","NOT INSTALLED"],
"design_ci":["branches:","persist-credentials: false","node --check"],
"design_test":["WOS_P2_PROTECTED_BROWSER_LAUNCHER_STATIC_SECURITY=PASS",
 "WOS_P2_QA_FAILCLOSE_STATIC_GUARDS=PASS"],
"close_sql":["CREATE FUNCTION public.wos_qa_p2_failclose",
 "SECURITY DEFINER SET search_path = ''","role = 'admin'",
 "wos_qa_safety.reap_expired_p2_gates",
 "wos_qa_safety.p2_gate_close_receipts",
 "v_is_replay := true","SET enabled=false",
 "REVOKE ALL ON FUNCTION public.wos_qa_p2_failclose"],
"closer":["WOS_P2_QA_CLOSURE_ENABLED",
 "WOS_P2_GATE_CLOSE_REASON","GITHUB_RUN_ID",
 "REVIEW_DEV_ADMIN_PASSWORD","/auth/v1/token?grant_type=password",
 "/rest/v1/rpc/wos_qa_p2_failclose",
 "AbortSignal.timeout","WOS_P2_QA_GATE_CLOSE_ONLY_RPC=PASS"],
"fixture":["CREATE ROLE authenticated","CREATE ROLE anon",
 "wos_qa_p2_execution_gate","wos_qa_p2_office_execution_gate"],
"pg_assertions":["WOS_P2_PG17_NORMAL_FAILURE_CLOSE_BOTH_GATES=PASS",
 "WOS_P2_PG17_REPLAY_REQUIRES_REAL_CLOSE=PASS",
 "WOS_P2_PG17_RUNNER_LOSS_EXPIRY_WATCHDOG=PASS",
 "WOS_P2_PG17_NO_PREMATURE_WATCHDOG_CLOSE=PASS"]}
def gh(path):
 token=os.environ.get("GH_READ_TOKEN","")
 if not token:raise AssertionError("missing read-only github token")
 request=urllib.request.Request(
  "https://api.github.com/repos/"+REPO+"/"+path,
  headers={"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json",
   "User-Agent":"wos-p2-independent-technical-review"})
 with urllib.request.urlopen(request,timeout=25) as response:return json.load(response)
def trust():
 if os.getenv("GITHUB_REPOSITORY")!=REPO or os.getenv("GITHUB_REF")!="refs/heads/"+BRANCH:
  raise AssertionError("reviewer identity mismatch")
 pr=gh("pulls/242")
 if pr["head"]["sha"]!=PIN or pr["base"]["ref"]!="master" or not pr["draft"] or pr["merged"]:
  raise AssertionError("PR242 not exact reviewed draft")
 if gh("branches/master")["commit"]["sha"]!=BASE:raise AssertionError("master baseline moved")
 files=gh("pulls/242/files?per_page=100")
 if len(files)!=9 or {f["filename"] for f in files}!=set(FILES):raise AssertionError("unexpected files")
 for runid in [44206114970,44206121630]:
  run=gh("actions/runs/"+str(runid))
  if run["head_sha"]!=PIN or run["conclusion"]!="success" or run["status"]!="completed":
   raise AssertionError("CI run not pinned or green")
 jobs=gh("actions/runs/44206121630/jobs?per_page=100")
 names={job["name"] for job in jobs["jobs"]}
 if names!={"lint-and-audit","glh-stage1-postgres-synthetic"} or not all(j["conclusion"]=="success" for j in jobs["jobs"]):
  raise AssertionError("required CI jobs absent")
 print("WOS_P2_PR242_INDEPENDENT_LIVE_GITHUB_SHA_CI_BINDING=PASS")
def read(root):
 root=root.resolve(strict=True)
 if subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()!=PIN:
  raise AssertionError("wrong candidate checkout")
 result={}
 for key,path in zip(["design_ci","workflow","runbook","browser","design_test","close_sql","closer","fixture","pg_assertions"],FILES):
  f=root/path
  if f.is_symlink() or not f.is_file() or not f.resolve().is_relative_to(root):
   raise AssertionError("invalid source path")
  result[key]=f.read_text(encoding="utf-8")
 return result
def assess(doc):
 errors=[]
 for key,checks in CHECKS.items():
  for check in checks:
   if check not in doc[key]:errors.append(key+" missing "+check)
 wf=doc["workflow"]
 for pattern,label in [
  (r"(?m)^\s*pull_request_target:", "privileged PR target"),
  (r"(?m)^\s*push:", "auto-triggered protected workflow"),
  (r"(?i)vercel\s+--prod|supabase\s+db\s+push", "production/db command"),
  (r"(?i)SUPABASE_SERVICE_ROLE_KEY|VERCEL_TOKEN", "privileged credential"),
  (r"(?i)gh\s+pr\s+merge", "unapproved merge")]:
  if re.search(pattern,wf):errors.append(label)
 if "secrets." in doc["design_ci"]:errors.append("untrusted design CI reads secrets")
 if re.search(r"(?i)SET\\s+enabled\\s*=\\s*true",doc["close_sql"]):
  errors.append("failclose code can activate gate")
 if "SERVICE_ROLE_KEY" in doc["closer"] or "console.log(error)" in doc["closer"]:
  errors.append("privileged credential or raw error in cleanup client")
 if re.search(r"console\.(?:log|error)\s*\(\s*(?:error|password|token)\b",doc["browser"]):
  errors.append("browser logs secret-capable error")
 if "page.screenshot(" in doc["browser"]:errors.append("unprotected screenshots")
 return errors
def mutations(doc):
 count=0
 for key,checks in CHECKS.items():
  for check in checks:
   candidate=dict(doc)
   candidate[key]=doc[key].replace(check,"")
   if not assess(candidate):raise AssertionError("mutation not detected "+key+" "+check)
   count+=1
 for key,payload in [("workflow","\n  pull_request_target:\n"),
  ("workflow","\n  push:\n"),("workflow","\n vercel --prod\n"),
  ("workflow","\n supabase db push\n"),("workflow","\n gh pr merge 241\n"),
  ("browser","\nconsole.log(error)\n"),("browser","\npage.screenshot({})\n"),
  ("design_ci","\n# secrets.REVIEW_DEV_ADMIN_PASSWORD\n")]:
  candidate=dict(doc);candidate[key]=doc[key]+payload
  if not assess(candidate):raise AssertionError("injection not detected")
  count+=1
 return count
def main():
 if len(sys.argv)!=2:raise AssertionError("missing candidate dir")
 trust()
 source=read(Path(sys.argv[1]))
 findings=assess(source)
 if findings:
  for f in findings:print("FINDING:",f)
  print("WOS_P2_PR242_INDEPENDENT_STATIC_REVIEW=FAIL")
  return 1
 print("WOS_P2_PR242_INDEPENDENT_STATIC_REVIEW=PASS")
 print("WOS_P2_PR242_NEGATIVE_CASES="+str(mutations(source)))
 print("WOS_P2_PR242_CANDIDATE_CODE_EXECUTED=NO")
 print("WOS_P2_PR242_QA_SECRETS_ACCESSED=NO")
 print("WOS_P2_PR242_NO_PROD_RELEASE_PROOF=PENDING")
 print("WOS_P2_PR242_FAIL_CLOSE_DB_AND_PG17=VERIFIED")
 print("WOS_P2_PR242_PROTECTED_HTTP_EXECUTION=NOT_RUN")
 print("WOS_P2_PR242_CURRENT_VERCEL_IGNORE_BUILD_CONFIG=UNVERIFIED")
 print("WOS_P2_PR242_HUMAN_REVIEW=NOT_GRANTED")
 print("WOS_P2_PR242_MERGE_DISPATCH_APPROVAL=WITHHELD")
 return 0
if __name__=="__main__":sys.exit(main())
