#!/usr/bin/env python3
"""Independent GitHub-hosted cleanup of only WOS P1 QA expired Environment Secret."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

REPO = "lenchenalc-hongda/hongda-new-media-platform"
ENVIRONMENT = "wos-p1-qa-preflight"
SECRET = "WOS_QA_READONLY_DSN"
DEADLINE_VAR = "WOS_P1_QA_SECRET_EXPIRES_AT"
MAX_FUTURE_SECONDS = 35 * 60
BASE = "https://api.github.com/repos/" + REPO + "/environments/" + ENVIRONMENT + "/"

def endpoint(suffix: str) -> str:
    return BASE + suffix

def request(method: str, url: str):
    if method not in ("GET", "DELETE") or url not in (
        endpoint("secrets/" + SECRET), endpoint("variables/" + DEADLINE_VAR)
    ) or (method == "DELETE" and url != endpoint("secrets/" + SECRET)):
        raise RuntimeError("GITHUB_API_SCOPE_DENIED")
    token = os.environ.get("WOS_P1_CLEANUP_APP_TOKEN", "")
    if not token or len(token) < 20:
        raise RuntimeError("APP_TOKEN_MISSING")
    req = urllib.request.Request(url, method=method, headers={
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Hongda-WOS-P1-QA-Secret-Reaper",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.status, response.read(2048)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return 404, b""
        raise RuntimeError("GITHUB_REQUEST_DENIED") from None
    except (OSError, TimeoutError):
        raise RuntimeError("GITHUB_REQUEST_UNAVAILABLE") from None

def secret_exists() -> bool:
    status, body = request("GET", endpoint("secrets/" + SECRET))
    if status == 404:
        return False
    if status != 200:
        raise RuntimeError("SECRET_QUERY_FAILED")
    try:
        data = json.loads(body)
        if data["name"] != SECRET:
            raise ValueError()
    except (KeyError, ValueError, TypeError):
        raise RuntimeError("SECRET_METADATA_INVALID") from None
    return True

def expires_at() -> int | None:
    status, body = request("GET", endpoint("variables/" + DEADLINE_VAR))
    if status == 404:
        return None
    if status != 200:
        raise RuntimeError("DEADLINE_QUERY_FAILED")
    try:
        data = json.loads(body)
        if data["name"] != DEADLINE_VAR:
            raise ValueError()
        raw = data["value"]
        if (not isinstance(raw, str) or not raw.isascii()
                or not raw.isdecimal() or len(raw) > 12):
            raise ValueError()
        return int(raw)
    except (KeyError, TypeError, ValueError):
        return None

def run() -> str:
    if os.environ.get("GITHUB_REPOSITORY") != REPO:
        raise RuntimeError("REPOSITORY_GUARD_DENIED")
    if os.environ.get("GITHUB_REF") != "refs/heads/master":
        raise RuntimeError("BRANCH_GUARD_DENIED")
    if os.environ.get("GITHUB_EVENT_NAME") not in ("schedule", "workflow_dispatch"):
        raise RuntimeError("EVENT_GUARD_DENIED")
    now = int(time.time())
    if not secret_exists():
        return "CLOUD_REAPER_SECRET_ABSENT=PASS"
    expiry = expires_at()
    if expiry is not None and now < expiry <= now + MAX_FUTURE_SECONDS:
        return "CLOUD_REAPER_ACTIVE_BOUNDED_LEASE=PASS"
    status, _ = request("DELETE", endpoint("secrets/" + SECRET))
    if status != 204:
        raise RuntimeError("DELETE_REJECTED")
    if secret_exists():
        raise RuntimeError("DELETE_UNVERIFIED")
    return "CLOUD_REAPER_SECRET_REMOVED=PASS"

if __name__ == "__main__":
    try:
        print(run())
    except Exception as exc:
        print("CLOUD_REAPER_FAIL_CLOSED=" + str(exc), file=sys.stderr)
        raise SystemExit(1)
