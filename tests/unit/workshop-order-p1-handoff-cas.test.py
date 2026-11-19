"""Real simultaneous SQLite transactions; synthetic-only security regression."""
import importlib.util
import tempfile
import threading
import unittest
from pathlib import Path
from queue import Queue

SOURCE = Path(__file__).resolve().parents[2] / "src/lib/workshop-orders/qa-cloud-reaper/handoff_ledger_sqlite.py"
spec = importlib.util.spec_from_file_location("wos_cas_proto", str(SOURCE))
cas = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cas)
OLD = "b3f382976049eacabefc7965cbb90312fd6903cc"
MASTER = "5ac678a50af6391efbdfb0258f037cbdeb2e18d6"
NEW = "0"*39 + "1"


def args(n=1):
    return dict(old_epoch=7, old_pr=202, old_head=OLD,
                master_head=MASTER, new_pr=300, new_head=NEW,
                operation_id="operation-long-"+str(n),
                oidc_jti="synthetic-unique-jti-"+str(n),
                attestor_proof=f"{n:064x}",
                reviewer_proof=f"{n+1000:064x}",
                request_digest=f"{n+2000:064x}")


class CasTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp=tmp.name
        self.path=Path(tmp.name)/"ledger.sqlite"
        cas.init_test_database(self.path, OLD, MASTER)

    def test_initial_state_blocked(self):
        self.assertEqual((cas.snapshot(self.path)["epoch"],cas.snapshot(self.path)["owner_pr"]), (7,202))

    def test_single_cas_commits_only_review(self):
        self.assertEqual(cas.transfer(self.path, **args()), "CAS_COMMITTED_REVIEW_REQUIRED")
        self.assertEqual((cas.snapshot(self.path)["epoch"],cas.snapshot(self.path)["outbox"]), (8,1))
        self.assertEqual(cas.snapshot(self.path)["status"], "REVIEW_PENDING")

    def test_stale_epoch(self):
        self.assertEqual(cas.transfer(self.path, **{**args(),"old_epoch":6}),"CAS_REJECTED_STALE_OR_BLOCKED")

    def test_wrong_owner(self):
        self.assertEqual(cas.transfer(self.path, **{**args(),"old_pr":999}),"CAS_REJECTED_STALE_OR_BLOCKED")

    def test_wrong_head(self):
        self.assertEqual(cas.transfer(self.path, **{**args(),"old_head":"a"*40}),"CAS_REJECTED_STALE_OR_BLOCKED")

    def test_wrong_master(self):
        self.assertEqual(cas.transfer(self.path, **{**args(),"master_head":"a"*40}),"CAS_REJECTED_STALE_OR_BLOCKED")

    def test_exact_replay(self):
        cas.transfer(self.path, **args())
        self.assertEqual(cas.transfer(self.path, **args()),"ALREADY_COMMITTED_NO_REDISPATCH")
        self.assertEqual(cas.snapshot(self.path)["outbox"],1)

    def test_same_operation_forged_digest(self):
        cas.transfer(self.path, **args())
        self.assertEqual(cas.transfer(self.path, **{**args(),"request_digest":"f"*64}),"REPLAY_REJECTED")

    def test_same_operation_forged_jti(self):
        cas.transfer(self.path, **args())
        self.assertEqual(cas.transfer(self.path, **{**args(),"oidc_jti":"forged-jti-9999"}),"REPLAY_REJECTED")

    def test_reused_jti(self):
        cas.transfer(self.path, **args())
        self.assertEqual(cas.transfer(self.path, **{**args(2),"oidc_jti":args()["oidc_jti"]}),"REPLAY_REJECTED")

    def test_reused_attestor_proof(self):
        cas.transfer(self.path, **args())
        self.assertEqual(cas.transfer(self.path, **{**args(2),"attestor_proof":args()["attestor_proof"]}),"REPLAY_REJECTED")

    def test_reused_reviewer_proof(self):
        cas.transfer(self.path, **args())
        self.assertEqual(cas.transfer(self.path, **{**args(2),"reviewer_proof":args()["reviewer_proof"]}),"REPLAY_REJECTED")

    def test_crash_before_commit_rollback(self):
        with self.assertRaisesRegex(RuntimeError,"BEFORE_COMMIT"):
            cas.transfer(self.path, **args(), crash_before_commit=True)
        self.assertEqual((cas.snapshot(self.path)["epoch"],cas.snapshot(self.path)["receipts"]),(7,0))

    def test_crash_after_commit_idempotency(self):
        with self.assertRaisesRegex(RuntimeError,"AFTER_COMMIT"):
            cas.transfer(self.path, **args(), crash_after_commit=True)
        self.assertEqual(cas.transfer(self.path, **args()),"ALREADY_COMMITTED_NO_REDISPATCH")
        self.assertEqual(cas.snapshot(self.path)["outbox"],1)

    def test_invalid_sha(self):
        with self.assertRaisesRegex(ValueError,"TRANSITION_FORMAT_INVALID"):
            cas.transfer(self.path, **{**args(),"new_head":"invalid"})

    def test_no_github_issue_write(self):
        self.assertFalse(hasattr(cas,"update_issue"))

    def test_20_real_concurrent_races_have_one_winner(self):
        for trial in range(20):
            path=Path(self.tmp)/f"parallel-{trial}.sqlite"
            cas.init_test_database(path,OLD,MASTER)
            gate=threading.Barrier(3)
            results=Queue()
            def writer(n):
                gate.wait()
                try:results.put(cas.transfer(path, **args(100+trial*2+n)))
                except Exception as exc:results.put("UNEXPECTED:"+str(exc))
            a=threading.Thread(target=writer,args=(0,))
            b=threading.Thread(target=writer,args=(1,))
            a.start();b.start();gate.wait()
            a.join(timeout=10);b.join(timeout=10)
            self.assertFalse(a.is_alive() or b.is_alive())
            self.assertEqual(sorted([results.get(),results.get()]),
                ["CAS_COMMITTED_REVIEW_REQUIRED","CAS_REJECTED_STALE_OR_BLOCKED"])
            self.assertEqual((cas.snapshot(path)["epoch"],cas.snapshot(path)["outbox"]),(8,1))


if __name__=="__main__":
    unittest.main(verbosity=2)
