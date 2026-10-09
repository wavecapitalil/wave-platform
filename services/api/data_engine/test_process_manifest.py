import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from datetime import datetime, timezone, timedelta
from process_manifest import Manifest
import run


def snapshot(status='ok'):
    return {'data': {'value': 3}, 'source': 'Synthetic public source', 'logic_version': 'test-v1', 'status': status, 'source_timestamp': '2026-01-01T00:00:00Z'}

class ManifestTests(unittest.TestCase):
    def test_lineage_and_no_raw_payload_or_error_message(self):
        with TemporaryDirectory() as temp:
            m=Manifest(Path(temp)/'manifest.json', 'test-run')
            m.collect('market:core', snapshot)
            def fail(): raise ValueError('Bearer private-secret@example.com')
            with self.assertRaises(ValueError): m.collect('risk:composite', fail)
            m.finish()
            content=Path(m.path).read_text()
            self.assertNotIn('private-secret',content)
            self.assertNotIn('"value"',content)
            data=json.loads(content)
            self.assertEqual(data['run']['status'],'partial')
            self.assertEqual(data['outputs'][0]['run_id'],'test-run')
            self.assertEqual(data['outputs'][0]['observation_ids'],data['transformations'][0]['inputs'])
            self.assertEqual(data['outputs'][0]['digest'],data['transformations'][0]['output_digest'])
            self.assertEqual(data['events'][-2]['error_code'],'ValueError')
            self.assertTrue(m.journal.exists())

    def test_stable_idempotency_and_attempt_identity(self):
        with TemporaryDirectory() as temp:
            with patch.dict('os.environ',{'GITHUB_RUN_ID':'123','GITHUB_RUN_ATTEMPT':'2'}):
                m=Manifest(Path(temp)/'a.json');m.skip('market:core','fresh');m.skip('market:core','fresh')
                n=Manifest(Path(temp)/'b.json');n.skip('market:core','fresh')
            self.assertEqual(m.data['run']['id'],'github-123-2')
            self.assertEqual(len(m.data['events']),2)
            self.assertEqual(m.data['events'][1]['id'],n.data['events'][1]['id'])

    def execute(self, registry, current=None):
        temp=TemporaryDirectory();self.addCleanup(temp.cleanup)
        args=SimpleNamespace(output=str(Path(temp.name)/'snapshots.json'),force=False,only=[])
        m=Manifest(Path(temp.name)/'manifest.json','test-execute')
        with patch.object(run,'REGISTRY',registry),patch.object(run,'existing_expiries',return_value=current or {}):
            code=run.execute(args,m)
        return code,m,json.loads(Path(args.output).read_text())

    def test_full_partial_and_all_failed_runs_preserve_public_payload(self):
        good=lambda:{**snapshot(),'_snapshot_status':'ok'}
        partial=lambda:{**snapshot(),'_snapshot_status':'partial'}
        def fail(): raise RuntimeError('provider error')
        for registry,expected,code in [({'a':('market',60,good)},'ok',0),({'a':('market',60,partial)},'partial',0),({'a':('market',60,good),'api:b':('api',60,fail)},'partial',0),({'a':('market',60,fail)},'failed',2)]:
            actual,m,payload=self.execute(registry)
            self.assertEqual(actual,code);self.assertEqual(m.data['run']['status'],expected)
            self.assertEqual(set(payload),{'generated_at','snapshots','failures'})
            self.assertNotIn('manifest',payload)
            if expected=='failed': self.assertEqual(payload['snapshots'],[])

    def test_fresh_skip_has_no_invented_fetch_or_output(self):
        def fail(): self.fail('fresh collector must not run')
        _,m,_=self.execute({'a':('market',60,fail)},{'a':{'status':'ok','calculated_at':datetime.now(timezone.utc).isoformat()}})
        self.assertEqual(m.data['run']['status'],'skipped')
        self.assertEqual(m.data['observations'],[])
        self.assertEqual(m.data['outputs'],[])
        self.assertEqual(m.data['events'][1]['cache'],'fresh_snapshot')

    def test_fetched_at_is_actual_dispatch_not_run_start(self):
        old=datetime.now(timezone.utc)-timedelta(hours=1)
        result=run.build_snapshot('a','market',60,snapshot,old)
        self.assertGreater(datetime.fromisoformat(result['fetched_at'].replace('Z','+00:00')),old+timedelta(minutes=59))

    def test_fatal_and_unknown_provider_cache_are_explicit(self):
        with TemporaryDirectory() as temp:
            m=Manifest(Path(temp)/'manifest.json','fatal');m.finish(fatal=True)
            self.assertEqual(m.data['run']['status'],'failed')
            n=Manifest(Path(temp)/'n.json','test');n.collect('a',snapshot)
            self.assertEqual(n.data['events'][-1]['cache'],'unknown')


class RecorderFaultIsolationTests(unittest.TestCase):
    def test_success_survives_completion_save_failure_without_second_fetch(self):
        from process_manifest import Recorder
        with TemporaryDirectory() as temp:
            recorder=Recorder(Path(temp)/'manifest.json')
            calls=[]
            def collect(): calls.append(True);return snapshot()
            with patch.object(recorder.manifest,'save',side_effect=OSError('private-path')):
                result=recorder.collect('market:core',collect)
            self.assertEqual(result,snapshot());self.assertEqual(len(calls),1)
            recorder.finish()
            saved=json.loads(recorder.manifest.path.read_text())
            self.assertEqual(saved['run']['status'],'ok')
            self.assertEqual(saved['run']['telemetry_status'],'incomplete')

    def test_init_start_skip_and_finish_failures_do_not_stop_snapshot_pipeline(self):
        from process_manifest import Recorder
        with TemporaryDirectory() as temp:
            with patch('process_manifest.Manifest',side_effect=OSError('private-path')):
                recorder=Recorder(Path(temp)/'missing.json')
            self.assertEqual(recorder.collect('a',snapshot),snapshot())
            recorder.skip('a','fresh');recorder.finish()
            recorder=Recorder(Path(temp)/'manifest.json')
            with patch.object(recorder.manifest,'event',side_effect=OSError('private-path')):
                self.assertEqual(recorder.collect('a',snapshot),snapshot())
                recorder.skip('b','fresh');recorder.finish()
            self.assertEqual(recorder.statuses,['ok'])

    def test_original_collector_failure_survives_telemetry_failure(self):
        from process_manifest import Recorder
        with TemporaryDirectory() as temp:
            recorder=Recorder(Path(temp)/'manifest.json')
            def fail(): raise LookupError('provider down')
            with patch.object(recorder.manifest,'save',side_effect=OSError('disk')):
                with self.assertRaises(LookupError):recorder.collect('a',fail)
            recorder.finish()
            self.assertEqual(recorder.manifest.data['run']['status'],'failed')

    def test_execute_keeps_snapshot_payload_when_recorder_disk_fails(self):
        from process_manifest import Recorder
        with TemporaryDirectory() as temp:
            recorder=Recorder(Path(temp)/'manifest.json')
            args=SimpleNamespace(output=str(Path(temp)/'snapshots.json'),force=True,only=[])
            with patch.object(run,'REGISTRY',{'a':('market',60,snapshot)}),patch.object(run,'existing_expiries',return_value={}),patch.object(recorder.manifest,'save',side_effect=OSError('disk')):
                self.assertEqual(run.execute(args,recorder),0)
            payload=json.loads(Path(args.output).read_text())
            self.assertEqual(len(payload['snapshots']),1)
            self.assertEqual(payload['failures'],[])

if __name__=='__main__': unittest.main()
