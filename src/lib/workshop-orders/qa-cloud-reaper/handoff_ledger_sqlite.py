"""Offline transactional CAS prototype for WOS P1, NOT the live authority.

The caller must validate exact OIDC + independent signed attestor/reviewer
receipts before entering this module. This disposable SQLite store proves
atomic lease and idempotent outbox behavior, not PostgreSQL deployment.
It never writes GitHub Issues, triggers Actions, or touches real secrets.
"""
import re
import sqlite3
import time
from pathlib import Path

RESOURCE = "hongda-wos-p1-shared-infra"
HEX40 = re.compile(r"[a-f0-9]{40}\Z")
HEX64 = re.compile(r"[a-f0-9]{64}\Z")


def connect(path):
    db = sqlite3.connect(str(path), timeout=10, isolation_level=None)
    db.execute("PRAGMA busy_timeout=10000")
    db.execute("PRAGMA foreign_keys=ON")
    return db


def init_test_database(path, initial_head, master_head):
    if not (HEX40.fullmatch(initial_head) and HEX40.fullmatch(master_head)):
        raise ValueError("INITIAL_SHA_INVALID")
    with connect(path) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript("""
          CREATE TABLE IF NOT EXISTS authority(
            resource TEXT PRIMARY KEY CHECK(resource='hongda-wos-p1-shared-infra'),
            epoch INTEGER NOT NULL, owner_pr INTEGER NOT NULL,
            head TEXT NOT NULL, master_head TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('BLOCKED','REVIEW_PENDING')));
          CREATE TABLE IF NOT EXISTS receipts(
            operation_id TEXT PRIMARY KEY, oidc_jti TEXT NOT NULL UNIQUE,
            attestor_proof TEXT NOT NULL UNIQUE, reviewer_proof TEXT NOT NULL UNIQUE,
            request_digest TEXT NOT NULL, epoch INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS outbox(
            operation_id TEXT PRIMARY KEY REFERENCES receipts(operation_id),
            status TEXT NOT NULL CHECK(status='REVIEW_REQUIRED'));
        """)
        db.execute("INSERT OR IGNORE INTO authority VALUES (?,?,?,?,?,?)",
                   (RESOURCE, 7, 202, initial_head, master_head, "BLOCKED"))


def transfer(path, *, old_epoch, old_pr, old_head, master_head,
             new_pr, new_head, operation_id, oidc_jti, attestor_proof,
             reviewer_proof, request_digest, crash_before_commit=False,
             crash_after_commit=False):
    if not (isinstance(old_epoch, int) and old_epoch >= 1
            and isinstance(old_pr, int) and old_pr > 0
            and isinstance(new_pr, int) and new_pr > 0 and new_pr != old_pr
            and all(HEX40.fullmatch(x or "") for x in (old_head, master_head, new_head))
            and all(HEX64.fullmatch(x or "") for x in
                    (attestor_proof, reviewer_proof, request_digest))
            and isinstance(operation_id, str) and 12 <= len(operation_id) <= 100
            and isinstance(oidc_jti, str) and 12 <= len(oidc_jti) <= 100):
        raise ValueError("TRANSITION_FORMAT_INVALID")
    db = connect(path)
    try:
        db.execute("BEGIN IMMEDIATE")
        old = db.execute(
            "SELECT request_digest,epoch,oidc_jti,attestor_proof,reviewer_proof "
            "FROM receipts WHERE operation_id=?", (operation_id,)).fetchone()
        if old:
            if old != (request_digest, old_epoch + 1, oidc_jti,
                       attestor_proof, reviewer_proof):
                db.execute("ROLLBACK")
                return "REPLAY_REJECTED"
            db.execute("COMMIT")
            return "ALREADY_COMMITTED_NO_REDISPATCH"
        if db.execute(
            "SELECT 1 FROM receipts WHERE oidc_jti=? OR attestor_proof=? OR reviewer_proof=?",
            (oidc_jti, attestor_proof, reviewer_proof)).fetchone():
            db.execute("ROLLBACK")
            return "REPLAY_REJECTED"
        result = db.execute("""
          UPDATE authority SET epoch=epoch+1, owner_pr=?, head=?, status='REVIEW_PENDING'
          WHERE resource=? AND epoch=? AND owner_pr=? AND head=?
                AND master_head=? AND status='BLOCKED'
          RETURNING epoch
        """, (new_pr, new_head, RESOURCE, old_epoch, old_pr, old_head,
              master_head)).fetchone()
        if result is None:
            db.execute("ROLLBACK")
            return "CAS_REJECTED_STALE_OR_BLOCKED"
        db.execute("INSERT INTO receipts VALUES (?,?,?,?,?,?)", (
            operation_id, oidc_jti, attestor_proof, reviewer_proof,
            request_digest, result[0]))
        db.execute("INSERT INTO outbox VALUES (?, 'REVIEW_REQUIRED')", (operation_id,))
        if crash_before_commit:
            raise RuntimeError("SIMULATED_CRASH_BEFORE_COMMIT")
        db.execute("COMMIT")
        if crash_after_commit:
            raise RuntimeError("SIMULATED_CRASH_AFTER_COMMIT_ACK")
        return "CAS_COMMITTED_REVIEW_REQUIRED"
    except BaseException:
        if db.in_transaction:
            db.execute("ROLLBACK")
        raise
    finally:
        db.close()


def snapshot(path):
    with connect(path) as db:
        row = db.execute("SELECT epoch,owner_pr,head,status FROM authority").fetchone()
        receipts = db.execute("SELECT count(*) FROM receipts").fetchone()[0]
        outbox = db.execute("SELECT count(*) FROM outbox").fetchone()[0]
        return dict(epoch=row[0], owner_pr=row[1], head=row[2], status=row[3],
                    receipts=receipts, outbox=outbox)
