#!/usr/bin/env python3
"""Independently sourced, exact-head, secretless WOS P2 QA preflight review."""
import json,os,re,subprocess,sys,urllib.request
from pathlib import Path
REPO="lenchenalc-hongda/hongda-new-media-platform"
BRANCH="audit/wos-p2-pr244-qa-identity-20261118"
MASTER="fb94a4f7a0e263fbddf5c588d2782802ebf02157"
PIN="5f5767b2088203d6433a361244911fcd487723ef"
P2="89bb408d13e45458c608db29c47e2803d49b3170"
FILES=[
 ".github/workflows/wos-p2-identity-readonly-secretless-ci.yml",
 ".github/workflows/wos-p2-pr241-protected-qa.yml",
 "docs/workshop-order-system/nonproduction-only/WOS_P2_READONLY_QA_IDENTITY_PREFLIGHT_BASELINE.md",
 "tests/e2e/wos-p2-qa-identity-readonly-preflight.cjs",
 "tests/unit/wos-p2-qa-identity-readonly-preflight.test.cjs",
]
NEEDED={
"identity":[
 "QA_ORIGIN='https://xulmpqaknlwqqculbsek.supabase.co'",
 "EXACT_P2='"+P2+"'",
 "GITHUB_REF,'refs/heads/master'",
 "WOS_P2_QA_READONLY_PREFLIGHT_ACK",
 "'ADMIN',expected:'admin'","'OPERATOR',expected:'operator'",
 "'VIEWER',expected:'viewer'","'FOREIGN',expected:'sales'",
 "/auth/v1/token?grant_type=password",
 "/rest/v1/profiles?","user_id:'eq.'+auth.user.id",
 "is_active:'eq.true'","limit:'2'",
 "redirect:'error'",
 "QA_PROFILE_ROLE_OR_SCOPE_MISMATCH",
 "QA_FOREIGN_ORGANIZATION_NOT_INDEPENDENT",
 "QA_ACCOUNTS_ARE_NOT_FOUR_DISTINCT_IDENTITIES",
 "WOS_P2_QA_AUTHENTICATION_PREFLIGHT_NO_BUSINESS_WRITES=PASS",
 "method:'GET'","method:'POST'",
 "Never log email, passwords, JWT",
],
"protected":[
 "workflow_dispatch:","github.ref == 'refs/heads/master'",
 "environment: hongda-review-dev","persist-credentials: false",
 "Protected QA authentication and organization read-only preflight",
 "WOS_P2_QA_READONLY_PREFLIGHT_ACK: 'true'",
 "node tests/e2e/wos-p2-qa-identity-readonly-preflight.cjs",
 "Real 2-role Office/Operator test + Viewer/foreign denials",
 "Always atomically close BOTH QA DB gates with QA-admin-only RPC",
 "if: always()",
 "WOS_P2_REVIEWED_SHA: ",
 "xulmpqaknlwqqculbsek.supabase.co"
],
"syntheticCI":[
 "qa/wos-p2-readonly-identity-preflight-20261118",
 "persist-credentials: false","node --check",
 "node --test tests/unit/wos-p2-qa-identity-readonly-preflight.test.cjs",
 "WOS_P2_QA_READONLY_PREFLIGHT_SECRETLESS=PASS",
],
"tests":[
 "foreignSameOrg:true","operatorBadRole:true",
 "authStatus:401","profileStatus:403",
 "QA_FOREIGN_ORGANIZATION_NOT_INDEPENDENT",
 "QA_PROFILE_ROLE_OR_SCOPE_MISMATCH",
 "WOS_P2_QA_MUTATIONS_ENABLED:'false'",
 "read-only preflight cannot invoke WOS RPC",
 ],
"runbook":[
 "xulmpqaknlwqqculbsek","不授权启动第二轮 E2E",
 "Foreign","sales","另一个组织",
 "两个 Gate","单次 15 分钟",
]
}
KEYS=["syntheticCI","protected","runbook","identity","tests"]
def fetch_api(path):
 token=os.getenv("GH_REVIEW_TOKEN")
 if not token:raise AssertionError("no read-only GitHub token")
 req=urllib.request.Request("https://api.github.com/repos/"+REPO+"/"+path,
  headers={"Authorization":"Bearer "+token,
           "Accept":"application/vnd.github+json",
           "User-Agent":"wos-p2-independent-qa-readonly-source-review"})
 with urllib.request.urlopen(req,timeout=20) as resp:
  return json.load(resp)
def verify_provenance():
 if os.getenv("GITHUB_REPOSITORY")!=REPO or \
    os.getenv("GITHUB_REF")!="refs/heads/"+BRANCH:
  raise AssertionError("reviewer not isolated from candidate branch")
 if fetch_api("branches/master")["commit"]["sha"]!=MASTER:
  raise AssertionError("master changed; reviewer needs new base")
 pr=fetch_api("pulls/244")
 if pr["head"]["sha"]!=PIN or pr["base"]["ref"]!="master" or \
    not pr["draft"] or pr["merged"] or pr["state"]!="open":
  raise AssertionError("PR #244 current state or SHA not approved for review")
 files=fetch_api("pulls/244/files?per_page=100")
 if len(files)!=len(FILES) or {v["filename"] for v in files}!=set(FILES):
  raise AssertionError("unexpected PR #244 file scope")
 for id in (44241067022,44241096367):
  run=fetch_api("actions/runs/"+str(id))
  if run["head_sha"]!=PIN or run["status"]!="completed" or run["conclusion"]!="success":
   raise AssertionError("new SHA CI not completed successfully")
 jobs=fetch_api("actions/runs/44241096367/jobs?per_page=100")
 if jobs["total_count"]!=2 or {j["name"] for j in jobs["jobs"]} != \
    {"lint-and-audit","glh-stage1-postgres-synthetic"} or \
    any(j["conclusion"]!="success" for j in jobs["jobs"]):
  raise AssertionError("required protected checks missing")
 print("WOS_P2_PR244_REVIEWER_EXACT_SHA_AND_CI_BINDING=PASS")
def load_source(directory):
 root=Path(directory).resolve(strict=True)
 sha=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
 if sha!=PIN:raise AssertionError("untrusted source wrong SHA")
 output={}
 for key,path in zip(KEYS,FILES):
  f=root/path
  if f.is_symlink() or not f.is_file() or not f.resolve().is_relative_to(root):
   raise AssertionError("bad file locator")
  if f.stat().st_size>100000:raise AssertionError("file too large")
  output[key]=f.read_text(encoding="utf-8")
 return output
def inspect(doc):
 findings=[]
 for key,terms in NEEDED.items():
  for term in terms:
   if term not in doc[key]:findings.append(key+" missing "+repr(term))
 script=doc["identity"]
 wf=doc["protected"]
 fake=doc["syntheticCI"]
 if "SUPABASE_SERVICE_ROLE_KEY" in script or "VERCEL_TOKEN" in script:
  findings.append("privileged secret in identity preflight")
 if re.search(r"(?i)(?:rest/v1/rpc|storage/v1|functions/v1|supabase\s+db\s+push|vercel\s+--prod)",script):
  findings.append("business mutation or elevated API in preflight")
 if re.search(r"(?i)console\.(?:log|error)\s*\(\s*(?:error|email|password|token|user|profile)\b",script):
  findings.append("secret-capable raw output")
 if re.search(r"(?mi)^\s*(?:push|pull_request_target)\s*:",wf):
  findings.append("secret-bearing workflow unsafe auto trigger")
 if re.search(r"(?i)vercel\s+--prod|supabase\s+db\s+push|gh\s+pr\s+merge",wf):
  findings.append("unapproved release or DB mutation")
 if "secrets." in fake or "environment: hongda-review-dev" in fake:
  findings.append("untrusted branch CI reads protected environment secrets")
 if script.count("/auth/v1/token?grant_type=password")!=1:
  findings.append("unexpected Auth endpoint count")
 if script.count("/rest/v1/profiles?")!=1:
  findings.append("unexpected Profile endpoint count")
 pos=[wf.find(i) for i in (
 "Protected QA authentication and organization read-only preflight",
 "Build and launch local Preview using only QA publishable key",
 "Real 2-role Office/Operator test + Viewer/foreign denials",
 "Always atomically close BOTH QA DB gates with QA-admin-only RPC"
 )]
 if any(p<0 for p in pos) or pos!=sorted(pos):
  findings.append("read-only preflight not before any business write")
 return findings
def mutations(doc):
 total=0
 for key,terms in NEEDED.items():
  for term in terms:
   d=dict(doc);d[key]=d[key].replace(term,"")
   if not inspect(d):raise AssertionError("reviewer missed removal "+key+" "+repr(term))
   total+=1
 for key,addition in [
  ("identity","console.log(token)"),
  ("identity","return fetch('/rest/v1/rpc/wos_open_both_gates')"),
  ("identity","const SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY"),
  ("protected","\n  pull_request_target:\n"),
  ("protected","\n  push:\n"),
  ("protected","\n  run: vercel --prod\n"),
  ("protected","\n  run: gh pr merge 241\n"),
  ("syntheticCI","secrets.REVIEW_DEV_ADMIN_PASSWORD"),
  ("syntheticCI","environment: hongda-review-dev"),
 ]:
  d=dict(doc);d[key]=doc[key]+"\n"+addition
  if not inspect(d):raise AssertionError("reviewer missed injected attack")
  total+=1
 return total
def main():
 if len(sys.argv)!=2:raise AssertionError("pass only candidate checkout path")
 verify_provenance()
 docs=load_source(sys.argv[1])
 issues=inspect(docs)
 if issues:
  for issue in issues:print("FINDING:",issue)
  print("WOS_P2_PR244_INDEPENDENT_SECURITY_REVIEW=FAIL")
  return 1
 count=mutations(docs)
 print("WOS_P2_PR244_INDEPENDENT_SECURITY_REVIEW=PASS")
 print("WOS_P2_PR244_NEGATIVE_TEST_COUNT="+str(count))
 print("WOS_P2_PR244_CANDIDATE_CODE_EXECUTED=NO")
 print("WOS_P2_PR244_QA_CREDENTIALS_USED=ZERO")
 print("WOS_P2_PR244_SECOND_LIVE_E2E_EXECUTED=NO")
 print("WOS_P2_PR244_OWNER_MERGE_APPROVAL=NOT_GIVEN")
 return 0
if __name__=="__main__":sys.exit(main())
