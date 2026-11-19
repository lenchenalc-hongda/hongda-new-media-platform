-- DOCUMENTATION ONLY: NOT EXECUTED, NOT A MIGRATION.
-- Target requires a NEW, independently authorized isolated nonproduction
-- PostgreSQL project; NOT WOS QA, Production or Agent Control V3.
-- Separate OIDC+Ed25519 Attestor/Reviewer validation service must establish
-- caller identity BEFORE it may write. SHA digests are NOT signatures.
BEGIN;
CREATE SCHEMA IF NOT EXISTS wos_p1_handoff;
REVOKE ALL ON SCHEMA wos_p1_handoff FROM PUBLIC;

CREATE TABLE IF NOT EXISTS wos_p1_handoff.authority (
 resource text PRIMARY KEY CHECK(resource='hongda-wos-p1-shared-infra'),
 epoch bigint NOT NULL CHECK(epoch>=1),
 owner_pr integer NOT NULL CHECK(owner_pr>0),
 owner_head text NOT NULL CHECK(owner_head ~ '^[a-f0-9]{40}$'),
 master_head text NOT NULL CHECK(master_head ~ '^[a-f0-9]{40}$'),
 state text NOT NULL CHECK(state IN ('BLOCKED','REVIEW_PENDING'))
);
CREATE TABLE IF NOT EXISTS wos_p1_handoff.receipts (
 operation_id text PRIMARY KEY,
 oidc_jti text NOT NULL UNIQUE,
 attestor_digest text NOT NULL UNIQUE CHECK(attestor_digest ~ '^[a-f0-9]{64}$'),
 reviewer_digest text NOT NULL UNIQUE CHECK(reviewer_digest ~ '^[a-f0-9]{64}$'),
 request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 resulting_epoch bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS wos_p1_handoff.outbox (
 operation_id text PRIMARY KEY REFERENCES wos_p1_handoff.receipts(operation_id),
 state text NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK(state='REVIEW_REQUIRED')
);
REVOKE ALL ON ALL TABLES IN SCHEMA wos_p1_handoff FROM PUBLIC, anon, authenticated;
ALTER TABLE wos_p1_handoff.authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE wos_p1_handoff.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wos_p1_handoff.outbox ENABLE ROW LEVEL SECURITY;

-- Private SECURITY DEFINER is permitted only after independent hardening,
-- a nonlogin dedicated owner, no exposed schema and a verified gateway.
-- No trusted login, grants, seeding or invocation are included here.
CREATE OR REPLACE FUNCTION wos_p1_handoff.try_transfer(
 e bigint, old_pr integer, old_sha text, master_sha text,
 new_pr integer, new_sha text, operation text, jti text,
 attestor text, reviewer text, digest text, expires timestamptz
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, wos_p1_handoff
AS $fn$
DECLARE r bigint; seen record;
BEGIN
 -- Deliberate hard stop until an independent identity-bound session role
 -- is defined and approved; do not remove as a shortcut.
 RAISE EXCEPTION 'HANDOFF_AUTH_IDENTITY_GATE_NOT_INSTALLED'
 USING ERRCODE='42501';
 -- Future reviewed implementation must require verified caller context
 -- before entering this transaction and may then use the following:
 SELECT request_digest,resulting_epoch,oidc_jti,attestor_digest,reviewer_digest
 INTO seen FROM wos_p1_handoff.receipts WHERE operation_id=operation;
 IF FOUND THEN
   IF seen.request_digest=digest AND seen.resulting_epoch=e+1 AND
      seen.oidc_jti=jti AND seen.attestor_digest=attestor AND
      seen.reviewer_digest=reviewer THEN
     RETURN 'ALREADY_COMMITTED_NO_REDISPATCH';
   END IF;
   RETURN 'REPLAY_REJECTED';
 END IF;
 IF e IS NULL OR e<1 OR old_pr IS DISTINCT FROM 202 OR
    new_pr IS NULL OR new_pr<=0 OR new_pr=old_pr OR
    old_sha !~ '^[a-f0-9]{40}$' OR master_sha !~ '^[a-f0-9]{40}$' OR
    new_sha !~ '^[a-f0-9]{40}$' OR digest !~ '^[a-f0-9]{64}$' OR
    attestor !~ '^[a-f0-9]{64}$' OR reviewer !~ '^[a-f0-9]{64}$' OR
    expires IS NULL OR expires<=clock_timestamp() OR
    expires>clock_timestamp()+interval '5 minutes' THEN
   RETURN 'SCOPE_OR_PROOF_INVALID';
 END IF;
 IF EXISTS (SELECT 1 FROM wos_p1_handoff.receipts
    WHERE oidc_jti=jti OR attestor_digest=attestor OR reviewer_digest=reviewer) THEN
   RETURN 'REPLAY_REJECTED';
 END IF;
 UPDATE wos_p1_handoff.authority
 SET epoch=epoch+1,owner_pr=new_pr,owner_head=new_sha,state='REVIEW_PENDING'
 WHERE resource='hongda-wos-p1-shared-infra'
   AND epoch=e AND owner_pr=old_pr AND owner_head=old_sha
   AND master_head=master_sha AND state='BLOCKED'
 RETURNING epoch INTO r;
 IF NOT FOUND THEN RETURN 'CAS_REJECTED_STALE_OR_BLOCKED'; END IF;
 INSERT INTO wos_p1_handoff.receipts
 (operation_id,oidc_jti,attestor_digest,reviewer_digest,request_digest,resulting_epoch)
 VALUES (operation,jti,attestor,reviewer,digest,r);
 INSERT INTO wos_p1_handoff.outbox(operation_id,state)
 VALUES (operation,'REVIEW_REQUIRED');
 RETURN 'CAS_COMMITTED_REVIEW_REQUIRED';
END $fn$;
REVOKE ALL ON FUNCTION wos_p1_handoff.try_transfer(
 bigint,integer,text,text,integer,text,text,text,text,text,text,timestamptz)
 FROM PUBLIC, anon, authenticated;
-- No grants, no real owner row or actor binding: cannot be used for handoff.
COMMIT;
