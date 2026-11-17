#!/usr/bin/env python3
"""Independent, READ-ONLY GitHub-hosted audit of *data* at a pinned WOS P2 SHA.
This auditor is from a separate master-based audit branch, NEVER from PR #241.
No PR-supplied code/tests/SQL are executed, no Supabase secrets or connections.
"""
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

REPO = "lenchenalc-hongda/hongda-new-media-platform"
PIN = "d75a39f7bfea212edcb2fd9ba5645f83d7aff184"
P1 = "6a72b446ccc517a5ff14e531b8a6663b4a70a77e"
BASE = "b4edd93bb16f7a651ca37864a51a158727fd23f2"
CI_RUN = 44095421001
BRANCH = "audit/wos-p2-pr241-exact-20261117"
EXPECTED_FILES = {
    ".github/workflows/wos-p2-secretless-contract-ci.yml",
    "docs/workshop-order-system/nonproduction-only/wos_p2_operator_actions_QA_ONLY_NOT_INSTALLED.sql",
    "src/app/api/workshop-orders/p2/actions/route.ts",
    "src/app/api/workshop-orders/p2/returns/route.ts",
    "src/app/workshop-orders/production/new/page.tsx",
    "src/components/workshop-orders/LiveQaReturnedOrders.tsx",
    "src/components/workshop-orders/LiveQaWorkshopActions.tsx",
    "src/components/workshop-orders/LiveQaWorkshopInbox.tsx",
    "src/components/workshop-orders/LiveQaWorkshopReadiness.tsx",
    "src/lib/workshop-orders/api-server.ts",
    "src/lib/workshop-orders/p2-action-contract.ts",
    "src/lib/workshop-orders/p2-qa-readiness.ts",
    "tests/sql/wos-p2-pg17-concurrency.sh",
    "tests/sql/wos-p2-pg17-synthetic-assertions.sql",
    "tests/sql/wos-p2-pg17-synthetic-schema.sql",
    "tests/unit/workshop-order-p1-inbox-integrity.test.ts",
    "tests/unit/workshop-order-p2-actions-contract.test.ts",
    "tests/unit/workshop-order-p2-office-returns.test.ts",
    "tests/unit/workshop-order-p2-qa-readiness.test.ts",
    "tests/unit/workshop-order-suite.test.ts",
}
FILES = {
    "sql": "docs/workshop-order-system/nonproduction-only/wos_p2_operator_actions_QA_ONLY_NOT_INSTALLED.sql",
    "api": "src/app/api/workshop-orders/p2/actions/route.ts",
    "contract": "src/lib/workshop-orders/p2-action-contract.ts",
    "actions": "src/components/workshop-orders/LiveQaWorkshopActions.tsx",
    "return_api": "src/app/api/workshop-orders/p2/returns/route.ts",
    "return_ui": "src/components/workshop-orders/LiveQaReturnedOrders.tsx",
    "readiness": "src/lib/workshop-orders/p2-qa-readiness.ts",
    "workflow": ".github/workflows/wos-p2-secretless-contract-ci.yml",
}
# Exact required sources, checked independently from PR-owned test assertions.
REQUIRED = {
    "sql": [
        "CREATE TABLE IF NOT EXISTS public.wos_qa_p2_execution_gate",
        "enabled boolean NOT NULL DEFAULT false",
        "gate.enabled=true",
        "gate.enabled_until>pg_catalog.clock_timestamp()",
        "gate.enabled_until<=pg_catalog.clock_timestamp()+INTERVAL '24 hours'",
        "REVOKE ALL ON public.wos_qa_p2_execution_gate FROM PUBLIC, anon, authenticated;",
        "CREATE TABLE IF NOT EXISTS public.wos_qa_p2_action_receipts",
        "REVOKE ALL ON public.wos_qa_p2_action_receipts FROM PUBLIC, anon, authenticated;",
        "SECURITY DEFINER SET search_path = ''",
        "auth.uid()",
        "role IN ('admin','manager','operator')",
        "v_order.order_number NOT LIKE 'QA-%'",
        "pg_catalog.pg_advisory_xact_lock",
        "FOR UPDATE",
        "pg_catalog.sha256(",
        "payload_fingerprint<>v_fingerprint",
        "RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'",
        "RAISE EXCEPTION 'VERSION_CONFLICT'",
        "wos_workshop_inbox i",
        "r.source_revision=i.source_revision",
        "i.workflow_status='SUBMITTED'",
        "v_order.version<>p_expected_version",
        "p_action='ACCEPT'",
        "v_next:='WORKSHOP_REVIEW'",
        "v_next:='NEEDS_INFORMATION'",
        "v_next:='WAITING_MATERIAL'",
        "v_next:='READINESS_CHECK'",
        "v_actor.role IN ('manager','admin')",
        "p_resource_type='INCOMING_MATERIAL'",
        "p_quantity_arrived<p_quantity_expected",
        "v_required_img:=",
        "img.image_status='READY'",
        "img.storage_bucket='wos-private'",
        "'FILM_PATTERN'",
        "'SIGNED_SAMPLE'",
        "v_ready_count=4",
        "wos_visual_baselines vb",
        "wos_status_history(",
        "version=version+1",
        "REVOKE ALL ON FUNCTION public.wos_qa_p2_operator_action(",
        "FROM PUBLIC,anon,authenticated;",
        "GRANT EXECUTE ON FUNCTION public.wos_qa_p2_operator_action(",
        "TO authenticated;",
        "COMMIT;",
    ],
    "api": [
        "isWosP2QaMutationEnabled",
        "WOS_P2_QA_MUTATIONS_ENABLED",
        "NEXT_PUBLIC_SUPABASE_URL",
        "req.headers.get('origin')",
        "req.headers.get('x-wos-p2-action')",
        "resolveVerifiedSupabaseIdentity",
        "canActOnWosP2",
        ".eq('organization_id',actor.org_id)",
        "client.rpc('wos_qa_p2_operator_action'",
        "QA_P2_UNVERIFIED_RESPONSE",
        "QA_P2_RPC_NOT_AUTHORIZED",
    ],
    "contract": [
        "const identity =",
        "expectedVersion: z.number().int().positive()",
        "requestId: z.string().uuid()",
        "canActOnWosP2",
        "env.vercelEnv !== 'preview'",
        "https://xulmpqaknlwqqculbsek.supabase.co",
        "WOS_P2_RESOURCE_TYPES",
        "isWosP2RpcResult",
    ],
    "actions": [
        "NEXT_PUBLIC_WOS_P2_QA_MUTATIONS_ENABLED",
        "disabled={!canAttempt||!legal||sending}",
        "crypto.randomUUID()",
        "pendingRef.current?.key===key",
        "/api/workshop-orders/p2/actions",
    ],
    "return_api": [
        "isApprovedWosSandboxUrl",
        "process.env.VERCEL_ENV!=='preview'",
        "resolveVerifiedSupabaseIdentity",
        ".eq('organization_id',actor.org_id)",
        ".eq('workflow_status','NEEDS_INFORMATION')",
        "query=query.eq('created_by_profile_id',actor.id)",
        "RETURN_REASON_MISSING",
    ],
    "return_ui": [
        "/api/workshop-orders/p2/returns",
        "setItems([])",
        "再次提交正在开发",
    ],
    "readiness": [
        "canStart: false",
        "SIGNED_SAMPLE",
        "FILM",
        "FIXTURE",
        "INCOMING_MATERIAL",
        "versionLabel",
        "issues.length === 0",
    ],
    "workflow": [
        "name: WOS P2 secretless business contract CI",
        "permissions:",
        "contents: read",
        "persist-credentials: false",
        "PGDATABASE: wos_p2_synthetic",
        "WOS_P2_QA_MUTATIONS_ENABLED: 'false'",
        "image: postgres:17",
    ],
}
FORBIDDEN = [
    (r"(?im)^\s*(?:DROP\s+TABLE|TRUNCATE\s+|DELETE\s+FROM\s+)public\.wos_", "SQL destructive WOS DML/DDL"),
    (r"(?is)\bGRANT\s+(?:UPDATE|INSERT|DELETE|ALL)\b.{0,300}\bON\s+(?:TABLE\s+)?public\.wos_.{0,250}\bTO\s+(?:PUBLIC|anon|authenticated)\b", "blanket WOS table write grants"),
    (r"(?is)\bGRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.wos_qa_p2_operator_action.{0,350}\bTO\s+(?:PUBLIC|anon)\b", "public/anon elevated function grant"),
    (r"(?i)\b(?:dblink|http_post|pg_read_file|pg_execute_server_program|COPY\s+.+PROGRAM)\b", "network/server-side program primitives"),
]

def gh(path: str) -> object:
    token = os.environ.get("GH_READ_TOKEN", "")
    if not token:
        raise RuntimeError("Missing read-only GitHub run token")
    request = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/{path}",
        headers={"Authorization": f"Bearer {token}",
                 "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28",
                 "User-Agent": "wos-p2-independent-readonly-reviewer"},
        method="GET")
    with urllib.request.urlopen(request, timeout=20) as rsp:
        return json.load(rsp)

def github_trust() -> None:
    if os.environ.get("GITHUB_REPOSITORY") != REPO:
        raise AssertionError("wrong GitHub repository")
    if os.environ.get("GITHUB_REF") != f"refs/heads/{BRANCH}":
        raise AssertionError("reviewer is not on isolated audit branch")
    pr = gh("pulls/241")
    p1 = gh("pulls/238")
    master = gh("branches/master")
    if (pr["head"]["sha"] != PIN or not pr["draft"] or pr["merged"]
            or pr["base"]["ref"] != "feature/wos-p1-qa-transaction-inbox-20261117"):
        raise AssertionError("PR241 moved/unmerged-contract invalid; old reviewer SHA not reusable")
    if p1["head"]["sha"] != P1 or p1["merged"]:
        raise AssertionError("P1 predecessor changed")
    if master["commit"]["sha"] != BASE:
        raise AssertionError("protected master moved; renew audit baseline")
    changed = gh("pulls/241/files?per_page=100")
    if not isinstance(changed,list) or len(changed) >= 100:
        raise AssertionError("incomplete PR241 changed-file pagination")
    filenames = {p["filename"] for p in changed}
    if len(changed) != len(filenames) or filenames != EXPECTED_FILES:
        raise AssertionError("unreviewed files in PR241 delta: " +
                             str(sorted(filenames.symmetric_difference(EXPECTED_FILES))))
    run = gh(f"actions/runs/{CI_RUN}")
    if (run["head_sha"] != PIN or run["event"] != "push"
            or run["path"] != ".github/workflows/wos-p2-secretless-contract-ci.yml"
            or run["conclusion"] != "success"):
        raise AssertionError("wrong or incomplete pinned technical CI")
    jobs = gh(f"actions/runs/{CI_RUN}/jobs?per_page=100")
    byname = {job["name"]: job for job in jobs["jobs"]}
    if (jobs["total_count"] != 2
            or set(byname) != {"wos-p2-contract","wos-p2-pg17-audit"}
            or any(job["conclusion"] != "success" for job in byname.values())):
        raise AssertionError("secretless CI jobs not both successful")
    print("WOS_P2_REVIEWER_INDEPENDENT_GITHUB_PR_AND_CI_BINDING=PASS")
    print(f"WOS_P2_REVIEWER_PINNED_PR_HEAD={PIN}")
    print(f"WOS_P2_REVIEWER_PINNED_TECHNICAL_CI_RUN={CI_RUN}")
    print("WOS_P2_REVIEWER_SCOPE_EXACT_20_FILES=PASS")

def read_candidate(root: Path) -> dict[str,str]:
    root = root.resolve(strict=True)
    if subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip() != PIN:
        raise AssertionError("candidate checkout does not match exact PIN")
    result={}
    for k,p in FILES.items():
        f=root/p
        if f.is_symlink() or not f.is_file() or not f.resolve().is_relative_to(root):
            raise AssertionError(f"unsafe candidate path: {p}")
        if f.stat().st_size>250000:
            raise AssertionError("unexpected huge source file")
        result[k]=f.read_text(encoding="utf-8")
    return result

def inspect(contents: dict[str,str]) -> list[str]:
    faults=[]
    for name,needles in REQUIRED.items():
        for token in needles:
            if token not in contents[name]:
                faults.append(name + ": missing " + repr(token))
    sql=contents["sql"]
    for pattern,description in FORBIDDEN:
        if re.search(pattern,sql):
            faults.append(description)
    if re.search(r"(?im)^\s*(?:DROP|TRUNCATE|DELETE)\s+",sql):
        faults.append("destructive SQL")
    # Anonymous access and unexpected privilege expansion forbidden.
    if re.search(r"(?i)\b(?:service_role|SUPABASE_SERVICE_ROLE_KEY)\b", contents["api"]):
        faults.append("service-role reference in operator API")
    if re.search(r"(?i)pull_request_target|secrets\s*\.|supabase\s+db\s+push|vercel\s+--prod",
                 contents["workflow"]):
        faults.append("privileged CI step in untrusted feature branch")
    if ".insert(" in contents["return_api"] or ".update(" in contents["return_api"] or ".rpc(" in contents["return_api"]:
        faults.append("office returns path contains writes")
    if re.search(r"(?im)^\s*GRANT\s+(?:UPDATE|INSERT|DELETE)\s+",
                 contents["sql"]):
        faults.append("unexpected table DML grant")
    if "wos_workshop_inbox" in sql and re.search(
            r"(?i)\bUPDATE\s+public\.wos_workshop_inbox\b",sql):
        faults.append("immutable P1 workshop Inbox mutated")
    if "WOS_P2_QA_MUTATIONS_ENABLED" not in contents["api"]:
        faults.append("missing independent server flag")
    return faults

def negative_mutations(original:dict[str,str]) -> int:
    # Independent mutation battery: remove every mandatory SQL safety condition,
    # one at a time. The *reviewer* must reject it, not just trust PR tests.
    cases=[]
    for name in ["sql","api","contract","actions","return_api","readiness","workflow"]:
        for token in REQUIRED[name]:
            cases.append((name,token))
    for name,token in cases:
        if token not in original[name]:
            raise AssertionError("precondition missing for negative mutation")
        tampered=dict(original)
        tampered[name]=tampered[name].replace(token,"")
        if not inspect(tampered):
            raise AssertionError("reviewer failed to detect removal: "+name+" "+repr(token))
    # Explicit privilege attack mutations beyond missing-string cases.
    injections=[
        ("sql","\nGRANT UPDATE ON public.wos_production_orders TO authenticated;\n"),
        ("sql","\nGRANT EXECUTE ON FUNCTION public.wos_qa_p2_operator_action(uuid,integer,uuid,text,text,text,integer,integer,text) TO anon;\n"),
        ("sql","\nDROP TABLE public.wos_workshop_inbox;\n"),
        ("api","\n// SUPABASE_SERVICE_ROLE_KEY is forbidden here\n"),
        ("workflow","\n# pull_request_target is forbidden\n"),
        ("return_api","\n// do not call db.rpc('x')\n"),
    ]
    for name,injection in injections:
        tampered=dict(original)
        tampered[name]+=injection
        if not inspect(tampered):
            raise AssertionError("reviewer failed to detect privilege injection")
    return len(cases)+len(injections)

def main() -> int:
    if len(sys.argv)!=2:
        raise SystemExit("Usage: independent_audit.py <checked-out-pinned-candidate>")
    github_trust()
    candidate=read_candidate(Path(sys.argv[1]))
    problems=inspect(candidate)
    if problems:
        print("WOS_P2_REVIEWER_STATIC_SECURITY_AUDIT=FAIL")
        for p in problems:
            print("REVIEWER_FINDING "+p)
        return 1
    print("WOS_P2_REVIEWER_STATIC_SECURITY_AUDIT=PASS")
    n=negative_mutations(candidate)
    print(f"WOS_P2_REVIEWER_NEGATIVE_CASES={n}")
    print("WOS_P2_REVIEWER_NEGATIVE_TESTS=PASS")
    print("WOS_P2_REVIEWER_QA_CREDENTIALS_USED=NO")
    print("WOS_P2_REVIEWER_QA_DATABASE_DDL_OR_DML=NONE")
    print("WOS_P2_REVIEWER_NOT_HUMAN_APPROVAL=YES")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
