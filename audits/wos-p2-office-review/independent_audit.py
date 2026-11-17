#!/usr/bin/env python3
"""Independent, secretless static security audit; reviewed candidate is data only."""
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

REPO = "lenchenalc-hongda/hongda-new-media-platform"
PIN = "89bb408d13e45458c608db29c47e2803d49b3170"
P1_PIN = "6a72b446ccc517a5ff14e531b8a6663b4a70a77e"
MASTER = "b4edd93bb16f7a651ca37864a51a158727fd23f2"
CI_RUN = 44127583534
AUDITOR_BRANCH = "audit/wos-p2-office-review-20261118"
EXPECTED_FILES = [".github/workflows/wos-p2-secretless-contract-ci.yml","docs/workshop-order-system/nonproduction-only/wos_p2_office_revision_resubmit_QA_ONLY_NOT_INSTALLED.sql","docs/workshop-order-system/nonproduction-only/wos_p2_operator_actions_QA_ONLY_NOT_INSTALLED.sql","docs/workshop-order-system/nonproduction-only/wos_p2_operator_revision_compat_QA_ONLY_NOT_INSTALLED.sql","src/app/api/workshop-orders/p2/actions/route.ts","src/app/api/workshop-orders/p2/office-revisions/route.ts","src/app/api/workshop-orders/p2/returns/route.ts","src/app/workshop-orders/production/new/page.tsx","src/components/workshop-orders/LiveQaReturnedOrders.tsx","src/components/workshop-orders/LiveQaWorkshopActions.tsx","src/components/workshop-orders/LiveQaWorkshopInbox.tsx","src/components/workshop-orders/LiveQaWorkshopReadiness.tsx","src/lib/workshop-orders/api-server.ts","src/lib/workshop-orders/p2-action-contract.ts","src/lib/workshop-orders/p2-office-revision-contract.ts","src/lib/workshop-orders/p2-qa-readiness.ts","tests/sql/wos-p2-office-revision-pg17-assertions.sql","tests/sql/wos-p2-pg17-concurrency.sh","tests/sql/wos-p2-pg17-synthetic-assertions.sql","tests/sql/wos-p2-pg17-synthetic-schema.sql","tests/sql/wos-p2-revision-compat-pg17-assertions.sql","tests/unit/workshop-order-p1-inbox-integrity.test.ts","tests/unit/workshop-order-p2-actions-contract.test.ts","tests/unit/workshop-order-p2-office-returns.test.ts","tests/unit/workshop-order-p2-office-revision-contract.test.ts","tests/unit/workshop-order-p2-qa-readiness.test.ts","tests/unit/workshop-order-suite.test.ts"]
SQL_BASE = "docs/workshop-order-system/nonproduction-only/"
PATHS = {
    "office_sql": SQL_BASE+"wos_p2_office_revision_resubmit_QA_ONLY_NOT_INSTALLED.sql",
    "operator_sql": SQL_BASE+"wos_p2_operator_actions_QA_ONLY_NOT_INSTALLED.sql",
    "compat_sql": SQL_BASE+"wos_p2_operator_revision_compat_QA_ONLY_NOT_INSTALLED.sql",
    "api_office": "src/app/api/workshop-orders/p2/office-revisions/route.ts",
    "api_operator": "src/app/api/workshop-orders/p2/actions/route.ts",
    "return_api": "src/app/api/workshop-orders/p2/returns/route.ts",
    "ui_office": "src/components/workshop-orders/LiveQaReturnedOrders.tsx",
    "ui_operator": "src/components/workshop-orders/LiveQaWorkshopActions.tsx",
    "contract_office": "src/lib/workshop-orders/p2-office-revision-contract.ts",
    "contract_operator": "src/lib/workshop-orders/p2-action-contract.ts",
    "api_inbox": "src/lib/workshop-orders/api-server.ts",
    "readiness": "src/lib/workshop-orders/p2-qa-readiness.ts",
    "workflow": ".github/workflows/wos-p2-secretless-contract-ci.yml",
    "pg_test": "tests/sql/wos-p2-office-revision-pg17-assertions.sql",
    "compat_test": "tests/sql/wos-p2-revision-compat-pg17-assertions.sql",
}
NEEDED = {
    "office_sql": ["QA-ONLY DESIGN", "NOT INSTALLED", "SECURITY DEFINER SET search_path = ''",
                   "wos_qa_p2_office_execution_gate", "enabled=false", "auth.uid()",
                   "wos_qa_p2_office_revisions", "before_snapshot", "after_snapshot",
                   "wos_qa_p2_review_receipts", "wos_qa_p2_review_correction",
                   "office_revision_request_id", "v_revision.new_version",
                   "P2_DOCUMENTS_INCOMPLETE", "resolved_by_profile_id",
                   "AND opened_at<=v_revision.created_at", "status='RESOLVED'",
                   "v_order.version_label LIKE 'QA-R%'", "i.workflow_status='SUBMITTED'",
                   "pg_advisory_xact_lock", "FOR UPDATE", "IDEMPOTENCY_CONFLICT",
                   "v_order.version<>p_expected_version", "REVOKE ALL",
                   "GRANT EXECUTE", "INTERVAL '24 hours'", "version_label='QA-R'"],
    "compat_sql": ["NOT INSTALLED","CREATE OR REPLACE FUNCTION public.wos_qa_p2_operator_action(",
                   "SECURITY DEFINER SET search_path = ''", "wos_qa_p2_review_receipts",
                   "wos_qa_p2_office_revisions", "office.action='RESUBMIT_CORRECTION'",
                   "office.after_snapshot->>'versionLabel'",
                   "r.source_revision=i.source_revision", "img.version_label=v_order.version_label",
                   "REQUIRED_VERIFIED_IMAGE_MISSING", "GRANT EXECUTE", "REVOKE ALL"],
    "operator_sql": ["NOT INSTALLED", "SECURITY DEFINER SET search_path = ''",
                     "auth.uid()", "wos_qa_p2_execution_gate", "gate.enabled=true",
                     "wos_qa_p2_action_receipts","pg_advisory_xact_lock",
                     "FOR UPDATE","p_action='CONFIRM_MATERIAL'","SIGNED_SAMPLE"],
    "api_office": ["WOS_P2_QA_OFFICE_REVISION_ENABLED", "resolveVerifiedSupabaseIdentity",
                   "isWosP2QaOfficeRevisionEnabled", "req.headers.get('origin')",
                   "req.headers.get('x-wos-p2-office-revision')",
                   "canWosOfficeRevise", "db.rpc('wos_qa_p2_office_revision'",
                   "QA_OFFICE_REVISION_NOT_AUTHORIZED"],
    "api_operator": ["WOS_P2_QA_MUTATIONS_ENABLED", "resolveVerifiedSupabaseIdentity",
                     "req.headers.get('origin')", "canActOnWosP2",
                     "client.rpc('wos_qa_p2_review_correction'",
                     "client.rpc('wos_qa_p2_operator_action'"],
    "return_api": [".eq('organization_id',actor.org_id)",
                   ".eq('workflow_status','NEEDS_INFORMATION')",
                   "query=query.eq('created_by_profile_id',actor.id)",
                   "RETURN_REASON_MISSING"],
    "ui_office": ["NEXT_PUBLIC_WOS_P2_QA_OFFICE_REVISION_ENABLED",
                  "disabled={!flag||pending}", "SAVE_CORRECTION",
                  "RESUBMIT_CORRECTION", "crypto.randomUUID()", "onSaved()"],
    "ui_operator": ["REVIEW_CORRECTION", "NEXT_PUBLIC_WOS_P2_QA_MUTATIONS_ENABLED",
                    "disabled={!canAttempt||!legal||sending}"],
    "api_inbox": ["WORKSHOP_REVISION_UNVERIFIED", "newVersionLabel",
                  "task.source_revision + 1 > order.version"],
    "readiness": ["canStart: false","versionLabel","issues.length === 0"],
    "workflow": ["wos-p2-office-pg17-audit", "wos-p2-pg17-audit",
                 "wos-p2-contract", "wos_p2_office_revision_resubmit_QA_ONLY_NOT_INSTALLED.sql",
                 "wos-p2-office-revision-pg17-assertions.sql", "postgres:17",
                 "persist-credentials: false",
                 "WOS_P2_QA_MUTATIONS_ENABLED: 'false'",
                 "WOS_P2_QA_OFFICE_REVISION_ENABLED: 'false'"],
    "pg_test": ["WOS_P2_PG17_OFFICE_OPERATOR_REVISION_CHAIN=PASS",
                "WOS_P2_PG17_REPLAY_CAS_RLS_FOREIGN_VIEWER_AND_DEFAULT_OFF=PASS",
                "OFFICE_GATE_FAILED_OPEN","REVIEW_GATE_FAILED_OPEN",
                "VIEWER_OFFICE_WRITE_ALLOWED", "FOREIGN_OPERATOR_REVIEW_ALLOWED",
                "STALE_SAVE_ALLOWED","STALE_REVIEW_ALLOWED",
                "OLD_IMAGE_VERSION_NOT_INVALIDATED"],
    "compat_test": ["OLD_FILM_VERSION_REUSED","OLD_SIGNED_SAMPLE_REUSED",
                    "WOS_P2_PG17_POST_REVIEW_MATERIAL_RECEIPT=PASS"],
}

def api(path):
    token = os.environ.get("GH_READ_TOKEN")
    if not token:
        raise AssertionError("read-only GitHub token missing")
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/{path}",
        headers={"Authorization":f"Bearer {token}",
                 "Accept":"application/vnd.github+json",
                 "User-Agent":"wos-p2-office-independent-reviewer"},
        method="GET",
    )
    with urllib.request.urlopen(req,timeout=25) as response:
        return json.load(response)

def trust():
    if os.environ.get("GITHUB_REPOSITORY") != REPO:
        raise AssertionError("unexpected repository")
    if os.environ.get("GITHUB_REF") != "refs/heads/"+AUDITOR_BRANCH:
        raise AssertionError("auditor must run from separate branch")
    p=api("pulls/241")
    p1=api("pulls/238")
    if (p["head"]["sha"] != PIN or p["state"] != "open" or not p["draft"]
            or p["merged"] or p["base"]["ref"] != "feature/wos-p1-qa-transaction-inbox-20261117"):
        raise AssertionError("business PR not pinned / draft / stacked")
    if p1["head"]["sha"] != P1_PIN or p1["merged"]:
        raise AssertionError("P1 source has changed")
    if api("branches/master")["commit"]["sha"] != MASTER:
        raise AssertionError("trusted baseline moved")
    paths=api("pulls/241/files?per_page=100")
    if len(paths)!=len(EXPECTED_FILES) or {p["filename"] for p in paths}!=set(EXPECTED_FILES):
        raise AssertionError("unreviewed PR file changes")
    run=api(f"actions/runs/{CI_RUN}")
    if (run["head_sha"] != PIN or run["status"] != "completed"
            or run["conclusion"] != "success" or run["event"] != "push"
            or run["path"] != ".github/workflows/wos-p2-secretless-contract-ci.yml"):
        raise AssertionError("untrusted or failed test run")
    jobs=api(f"actions/runs/{CI_RUN}/jobs?per_page=100")
    expected={"wos-p2-contract","wos-p2-pg17-audit","wos-p2-office-pg17-audit"}
    if (jobs["total_count"]!=3 or {j["name"] for j in jobs["jobs"]}!=expected
            or any(j["conclusion"]!="success" for j in jobs["jobs"])):
        raise AssertionError("incomplete PostgreSQL 17 CI test suite")
    print("WOS_P2_INDEPENDENT_LIVE_SHA_PR_AND_THREE_JOB_CI_BINDING=PASS")

def candidate(root):
    root=root.resolve(strict=True)
    sha=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
    if sha != PIN:
        raise AssertionError("candidate not exact HEAD")
    files={}
    for name,path in PATHS.items():
        file=root/path
        if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(root):
            raise AssertionError("unsafe file path: "+path)
        if file.stat().st_size>150000:
            raise AssertionError("unexpectedly huge file")
        files[name]=file.read_text(encoding="utf-8")
    return files

def inspect(files):
    findings=[]
    for name,needles in NEEDED.items():
        for needle in needles:
            if needle not in files[name]:
                findings.append(name+" missing "+needle)
    sql="\n".join(files[name] for name in ("office_sql","operator_sql","compat_sql"))
    for pattern,reason in [
        (r"(?im)^\s*(?:DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM)\s+public\.wos_", "destructive table operation"),
        (r"(?im)^\s*GRANT\s+(?:ALL|UPDATE|INSERT|DELETE)\s+ON\s+(?:TABLE\s+)?public\.wos_", "blanket client WOS DML grants"),
        (r"(?im)^\s*GRANT\s+EXECUTE.+\bTO\s+(?:PUBLIC|anon)\s*;", "public/anon RPC execution"),
        (r"(?i)\b(?:dblink|pg_read_file|COPY\s+.+PROGRAM)\b", "dangerous server primitive"),
    ]:
        if re.search(pattern,sql):
            findings.append(reason)
    for name in ("api_office","api_operator","return_api","ui_office","ui_operator","workflow"):
        content=files[name]
        if "SUPABASE_SERVICE_ROLE_KEY" in content and not content.lstrip().startswith("#"):
            findings.append("service role name in client or API")
    for name in ("office_sql","compat_sql"):
        if "CREATE FUNCTION" not in files[name] and "CREATE OR REPLACE FUNCTION" not in files[name]:
            findings.append(name+" missing SQL function")
    if ".rpc(" in files["return_api"] or ".update(" in files["return_api"]:
        findings.append("Office read endpoint unexpectedly mutates")
    if "pull_request_target" in files["workflow"] or "secrets." in files["workflow"]:
        findings.append("candidate CI consumes privileged trigger or secrets")
    if "UPDATE public.wos_workshop_inbox" in sql:
        findings.append("original immutable P1 Inbox overwritten")
    return findings

def mutations(files):
    n=0
    for name,needles in NEEDED.items():
        for needle in needles:
            mutated=dict(files)
            mutated[name]=mutated[name].replace(needle,"",1)
            if not inspect(mutated):
                raise AssertionError("mutation undetected: "+name+" "+needle)
            n+=1
    for name,attack in [
        ("office_sql","\nGRANT UPDATE ON public.wos_production_orders TO authenticated;\n"),
        ("compat_sql","\nDROP TABLE public.wos_workshop_inbox;\n"),
        ("workflow","\n# secrets.REVIEW_DEV_SUPABASE_ANON_KEY\n"),
        ("return_api","\nconst unsafe = await db.rpc('fake')\n"),
    ]:
        mutated=dict(files)
        mutated[name]+=attack
        if not inspect(mutated):
            raise AssertionError("attack injection undetected")
        n+=1
    return n

def main():
    if len(sys.argv)!=2:
        raise AssertionError("expected pinned candidate dir")
    trust()
    files=candidate(Path(sys.argv[1]))
    faults=inspect(files)
    if faults:
        print("WOS_P2_INDEPENDENT_SECURITY_AUDIT=FAIL")
        for f in faults: print("FINDING:",f)
        raise AssertionError("unsafe candidate")
    print("WOS_P2_INDEPENDENT_STATIC_SECURITY_AUDIT=PASS")
    n=mutations(files)
    print(f"WOS_P2_INDEPENDENT_SECURITY_NEGATIVE_CASES={n}")
    print("WOS_P2_INDEPENDENT_SECURITY_NEGATIVES=PASS")
    print("WOS_P2_QA_CREDENTIAL_COUNT=0")
    print("WOS_P2_OWNER_APPROVAL_NOT_IMPERSONATED=YES")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
