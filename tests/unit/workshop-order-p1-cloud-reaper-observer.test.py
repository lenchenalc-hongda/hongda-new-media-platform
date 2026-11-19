import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest import mock
spec=importlib.util.spec_from_file_location(
    'reaper', str(Path(__file__).resolve().parents[2]/'src/lib/workshop-orders/qa-cloud-reaper/observer.py'))
reaper=importlib.util.module_from_spec(spec)
spec.loader.exec_module(reaper)
REAL_REQUEST = reaper.request

class CloudTest(unittest.TestCase):
    def setUp(self):
        self.remote=True
        self.deadline=None
        self.fail=False
        self.calls=[]
        self.rotation=None
        env=mock.patch.dict(os.environ,{
            'GITHUB_REPOSITORY':reaper.REPO,'GITHUB_REF':'refs/heads/master',
            'GITHUB_EVENT_NAME':'schedule'},clear=False)
        env.start()
        self.addCleanup(env.stop)
        def requester(method,url):
            self.calls.append((method,url))
            if self.fail:
                raise RuntimeError('GITHUB_REQUEST_DENIED')
            if url==reaper.endpoint('secrets/'+reaper.SECRET):
                if method=='GET':
                    if self.remote:
                        return 200,json.dumps({'name':reaper.SECRET}).encode()
                    return 404,b''
                if method=='DELETE':
                    self.remote=False
                    return 204,b''
            if url==reaper.endpoint('variables/'+reaper.DEADLINE_VAR) and method=='GET':
                if self.rotation is not None:
                    fn=self.rotation
                    self.rotation=None
                    fn()
                if self.deadline is not None:
                    return 200,json.dumps({
                        'name':reaper.DEADLINE_VAR,'value':str(self.deadline)}).encode()
                return 404,b''
            raise AssertionError((method,url))
        p=mock.patch.object(reaper,'request',side_effect=requester)
        p.start()
        self.addCleanup(p.stop)

    def test_absent_secret(self):
        self.remote=False
        self.assertEqual(reaper.run(),'CLOUD_REAPER_SECRET_ABSENT=PASS')

    def test_orphan_secret_deleted(self):
        with self.assertRaisesRegex(RuntimeError,'DELETE_DISABLED_UNSERIALIZED_WRITERS'):
            reaper.run()
        self.assertTrue(self.remote)
        self.assertFalse(any(method=='DELETE' for method,url in self.calls))

    def test_active_lease_preserved(self):
        self.deadline=1300
        with mock.patch.object(reaper.time,'time',return_value=1000):
            self.assertEqual(reaper.run(),'CLOUD_REAPER_ACTIVE_BOUNDED_LEASE=PASS')
        self.assertTrue(self.remote)

    def test_expired_lease_deleted(self):
        self.deadline=999
        with mock.patch.object(reaper.time,'time',return_value=1000):
            with self.assertRaisesRegex(RuntimeError,'DELETE_DISABLED_UNSERIALIZED_WRITERS'):
                reaper.run()
        self.assertFalse(any(method=='DELETE' for method,url in self.calls))

    def test_overlong_lease_deleted(self):
        self.deadline=3500
        with mock.patch.object(reaper.time,'time',return_value=1000):
            with self.assertRaisesRegex(RuntimeError,'DELETE_DISABLED_UNSERIALIZED_WRITERS'):
                reaper.run()
        self.assertFalse(any(method=='DELETE' for method,url in self.calls))

    def test_bad_deadline_deleted(self):
        self.deadline='bad'
        with self.assertRaisesRegex(RuntimeError,'DELETE_DISABLED_UNSERIALIZED_WRITERS'):
            reaper.run()
        self.assertFalse(any(method=='DELETE' for method,url in self.calls))

    def test_wrong_repo_refused(self):
        with mock.patch.dict(os.environ,{'GITHUB_REPOSITORY':'other/repo'}):
            with self.assertRaisesRegex(RuntimeError,'REPOSITORY_GUARD_DENIED'):
                reaper.run()

    def test_wrong_branch_refused(self):
        with mock.patch.dict(os.environ,{'GITHUB_REF':'refs/heads/other'}):
            with self.assertRaisesRegex(RuntimeError,'BRANCH_GUARD_DENIED'):
                reaper.run()

    def test_wrong_event_refused(self):
        with mock.patch.dict(os.environ,{'GITHUB_EVENT_NAME':'pull_request'}):
            with self.assertRaisesRegex(RuntimeError,'EVENT_GUARD_DENIED'):
                reaper.run()

    def test_network_denial_fails_closed(self):
        self.fail=True
        with self.assertRaisesRegex(RuntimeError,'GITHUB_REQUEST_DENIED'):
            reaper.run()

    def test_network_recovers_on_retry(self):
        self.fail=True
        with self.assertRaisesRegex(RuntimeError,'GITHUB_REQUEST_DENIED'):
            reaper.run()
        self.fail=False
        with self.assertRaisesRegex(RuntimeError,'DELETE_DISABLED_UNSERIALIZED_WRITERS'):
            reaper.run()
        self.assertFalse(any(method=='DELETE' for method,url in self.calls))

    def test_delete_target_only_exact_qa_secret(self):
        with self.assertRaisesRegex(RuntimeError,'DELETE_DISABLED_UNSERIALIZED_WRITERS'):
            reaper.run()
        self.assertFalse(any(method=='DELETE' for method,url in self.calls))

    def test_unrelated_api_target_denied(self):
        with mock.patch.object(reaper,'request',wraps=REAL_REQUEST):
            with self.assertRaisesRegex(RuntimeError,'GITHUB_API_SCOPE_DENIED'):
                reaper.request('DELETE','https://api.github.com/repos/other/repo')

    def test_other_environment_secret_target_denied(self):
        with mock.patch.object(reaper,'request',wraps=REAL_REQUEST):
            with self.assertRaisesRegex(RuntimeError,'GITHUB_API_SCOPE_DENIED'):
                reaper.request('DELETE',reaper.endpoint('secrets/UNRELATED'))


    def test_absent_secret_twice(self):
        self.remote=False
        self.assertEqual(reaper.run(),'CLOUD_REAPER_SECRET_ABSENT=PASS')
        self.assertEqual(reaper.run(),'CLOUD_REAPER_SECRET_ABSENT=PASS')

    def test_expired_many_runs_refuse_delete(self):
        self.deadline=0
        for i in range(5):
            with self.assertRaisesRegex(RuntimeError,'DELETE_DISABLED_UNSERIALIZED_WRITERS'):
                reaper.run()
        self.assertFalse(any(method=='DELETE' for method,url in self.calls))

    def test_rotation_interleaving_no_delete(self):
        self.deadline=0
        self.rotation=lambda: setattr(self,'deadline',1300)
        with mock.patch.object(reaper.time,'time',return_value=1000):
            self.assertEqual(reaper.run(),'CLOUD_REAPER_ACTIVE_BOUNDED_LEASE=PASS')
        self.assertTrue(self.remote)
        self.assertFalse(any(method=='DELETE' for method,url in self.calls))

    def test_rotated_after_expired_observation_no_delete(self):
        self.deadline=999
        with mock.patch.object(reaper.time,'time',return_value=1000):
            with self.assertRaisesRegex(RuntimeError,'DELETE_DISABLED_UNSERIALIZED_WRITERS'):
                reaper.run()
        self.deadline=1300
        self.assertTrue(self.remote)
        self.assertFalse(any(method=='DELETE' for method,url in self.calls))

    def test_direct_put_refused(self):
        with mock.patch.object(reaper,'request',wraps=REAL_REQUEST):
            with self.assertRaisesRegex(RuntimeError,'GITHUB_API_SCOPE_DENIED'):
                reaper.request('PUT',reaper.endpoint('secrets/'+reaper.SECRET))

    def test_missing_token_refused(self):
        with mock.patch.object(reaper,'request',wraps=REAL_REQUEST):
            with mock.patch.dict(os.environ,{'WOS_P1_CLEANUP_APP_TOKEN':''}):
                with self.assertRaisesRegex(RuntimeError,'APP_TOKEN_MISSING'):
                    reaper.request('GET',reaper.endpoint('secrets/'+reaper.SECRET))

if __name__=='__main__':
    unittest.main(verbosity=2)
