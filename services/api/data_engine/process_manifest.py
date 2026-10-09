"""Sanitized collector-boundary evidence. Never stores provider bodies or secrets.

The fsync'd JSONL journal survives individual collector failures. It is a local
spool, not a claim that a private ingestion service or infinite retention exists.
"""
from __future__ import annotations
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import sys
from threading import Lock
from uuid import uuid4

SCHEMA = 'wave.process-run/1'

def now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

def digest(value):
    return sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=True).encode()).hexdigest()

def timestamp(value):
    if not isinstance(value, str): return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.isoformat() if parsed.tzinfo else None
    except ValueError: return None

def safe_label(value):
    # Source labels are code-owned, not HTTP requests. URLs/credentials are not accepted.
    value = str(value or '')
    return value[:120] if re.fullmatch(r'[\w .:/+?=&%()\-]{1,120}', value) and not re.search(r'https?://|token|secret|password|authorization|@', value, re.I) else 'not_recorded'

class Manifest:
    def __init__(self, path, run_id=None):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.journal = self.path.with_suffix('.jsonl')
        self.lock = Lock()
        self.ids = set()
        attempt = os.getenv('GITHUB_RUN_ATTEMPT', '1')
        attempt = int(attempt) if attempt.isdigit() else 1
        ci_id = os.getenv('GITHUB_RUN_ID', '')
        run_id = run_id or ('github-' + ci_id + '-' + str(attempt) if ci_id.isdigit() else 'local-' + str(uuid4()))
        commit = os.getenv('GITHUB_SHA', '')
        self.data = {'schema_version': SCHEMA, 'run': {
            'id': run_id, 'process_id': 'data-engine', 'process_version': 'collector-boundary-v1',
            'attempt': attempt, 'commit': commit if re.fullmatch('[a-f0-9]{40}', commit) else None,
            'kind': 'observed', 'status': 'running', 'telemetry_status': 'complete', 'started_at': now(), 'completed_at': None,
            'expected_cutoff': None, 'observed_cutoff': None,
        }, 'events': [], 'observations': [], 'transformations': [], 'outputs': [], 'decisions': []}
        # A run attempt may be replayed into a fresh file; events retain stable IDs.
        # Append preserves a previous interrupted journal. Ingest must deduplicate IDs.
        self.event('run', 'started', 'running')
        self.save()

    def event(self, step, stage, status, **fields):
        with self.lock:
            event_id = sha256((self.data['run']['id'] + ':' + step + ':' + stage).encode()).hexdigest()
            if event_id in self.ids: return
            event = {'id': event_id, 'run_id': self.data['run']['id'], 'step_id': safe_label(step), 'stage': stage,
                     'status': status, 'at': now(), **fields}
            with self.journal.open('a', encoding='utf-8') as file:
                file.write(json.dumps(event, ensure_ascii=False) + '\n')
                file.flush(); os.fsync(file.fileno())
            self.ids.add(event_id)
            self.data['events'].append(event)

    def skip(self, key, reason):
        self.event(key, 'skipped', 'skipped', cache='fresh_snapshot' if reason == 'fresh' else 'not_checked', error_code=reason)

    def collect(self, key, collect):
        self.event(key, 'collection_started', 'running', cache='unknown')
        try:
            started = now()  # Exclude journal/fsync delay from the collection window.
            snapshot = collect()
            ended = now()
            identifier = sha256((self.data['run']['id'] + ':' + key).encode()).hexdigest()
            observation_id, transform_id, output_id = ('obs-' + identifier, 'calc-' + identifier, 'out-' + identifier)
            status = snapshot.get('status', 'ok')
            status = status if status in ('ok', 'partial', 'error') else 'partial'
            payload_digest = digest(snapshot['data'])
            observation = {'id': observation_id, 'source_id': safe_label(snapshot.get('source')),
                           'fetch_started_at': started, 'fetch_completed_at': ended,
                           'source_timestamp': timestamp(snapshot.get('source_timestamp')),
                           'source_date_kind': 'collector_reported', 'digest': payload_digest,
                           'coverage': 'collector_boundary', 'manifest_date': None}
            transformation = {'id': transform_id, 'rule_version': safe_label(snapshot.get('logic_version')),
                              'inputs': [observation_id], 'status': status, 'output_digest': payload_digest,
                              'units': None, 'period': None, 'null_reason': 'not_recorded'}
            output = {'id': output_id, 'dataset_key': key, 'run_id': self.data['run']['id'],
                      'transformation_ids': [transform_id], 'observation_ids': [observation_id],
                      'digest': payload_digest, 'artifact_version': safe_label(snapshot.get('logic_version')),
                      'publication_status': 'not_attempted'}
            with self.lock:
                self.data['observations'].append(observation)
                self.data['transformations'].append(transformation)
                self.data['outputs'].append(output)
            self.event(key, 'collection_completed', status, cache='unknown',
                       observation_id=observation_id, transformation_id=transform_id, output_id=output_id)
            self.save()
            return snapshot
        except Exception as exc:
            # Deliberately never include exception messages, response bodies, headers or URLs.
            self.event(key, 'collection_completed', 'error', cache='unknown', error_code=type(exc).__name__)
            self.save()
            raise

    def finish(self, fatal=False, statuses=None):
        statuses = statuses if statuses is not None else [e['status'] for e in self.data['events'] if e['stage'] == 'collection_completed']
        good = statuses.count('ok')
        bad = len(statuses) - good
        status = 'failed' if fatal or (bad and not good and all(s == 'error' for s in statuses)) else 'partial' if bad else 'ok' if good else 'skipped'
        self.data['run'].update(status=status, completed_at=now())
        self.event('run', 'completed', status)
        self.save()

    def save(self):
        with self.lock:
            temporary = self.path.with_suffix('.tmp')
            with temporary.open('w', encoding='utf-8') as file:
                json.dump(self.data, file, ensure_ascii=False, separators=(',', ':'))
                file.flush(); os.fsync(file.fileno())
            temporary.replace(self.path)


class Recorder:
    """Fail-open adapter: observation failures must never discard market data."""
    def __init__(self, path):
        self.manifest = None
        self.statuses = []
        try:
            self.manifest = Manifest(path)
        except Exception as exc:
            self.warn(exc)

    def warn(self, exc):
        # Exception class only; filesystem paths, URLs and response bodies stay out.
        print('WARN process evidence incomplete: ' + type(exc).__name__, file=sys.stderr)
        if self.manifest is not None:
            self.manifest.data['run']['telemetry_status'] = 'incomplete'

    def skip(self, key, reason):
        if self.manifest is not None:
            try: self.manifest.skip(key, reason)
            except Exception as exc: self.warn(exc)

    def collect(self, key, collector):
        result = None
        called = False
        succeeded = False
        original_error = None
        def tracked():
            nonlocal result, called, succeeded, original_error
            called = True
            try:
                result = collector()
                succeeded = True
                return result
            except Exception as exc:
                original_error = exc
                raise
        try:
            if self.manifest is None:
                result = tracked()
            else:
                try:
                    result = self.manifest.collect(key, tracked)
                except Exception as exc:
                    if original_error is not None:
                        if exc is not original_error: self.warn(exc)
                        raise original_error
                    self.warn(exc)
                    # A failed journal/start must not stop collection; a failed
                    # completion write must not rerun an already-successful source.
                    if not called: result = tracked()
                    elif not succeeded: raise
            status = result.get('status', 'ok')
            self.statuses.append(status if status in ('ok', 'partial', 'error') else 'partial')
            return result
        except Exception:
            self.statuses.append('error')
            raise

    def finish(self, fatal=False):
        if self.manifest is not None:
            try: self.manifest.finish(fatal=fatal, statuses=self.statuses)
            except Exception as exc: self.warn(exc)
