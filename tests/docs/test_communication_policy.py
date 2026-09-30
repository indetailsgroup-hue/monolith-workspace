"""Prevent retired communication integrations from returning through automation."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import unittest
import yaml

from tools import check_communication_policy as policy

ROOT = Path(__file__).resolve().parents[2]


class CommunicationPolicyTests(unittest.TestCase):
    def test_workflows_do_not_use_retired_provider(self):
        offenders = [p.name for p in (ROOT / '.github/workflows').glob('*.y*ml')
                     if 'slack' in p.name.lower() or 'slack' in p.read_text(encoding='utf-8').lower()]
        self.assertEqual(offenders, [], 'MONOLITH communication uses LINE; remove retired workflows and references')

    def test_required_check_enforces_policy_on_every_pr(self):
        workflow = yaml.load((ROOT / '.github/workflows/deploy-docs-ci.yml').read_text(encoding='utf-8'), Loader=yaml.BaseLoader)
        trigger = workflow['on']['pull_request']
        self.assertNotIn('paths', trigger)
        self.assertNotIn('paths-ignore', trigger)
        job = workflow['jobs']['validate']
        self.assertEqual(job['name'], 'Validate Site Files')
        step = next(s for s in job['steps'] if s.get('run') == 'python tools/check_communication_policy.py')
        self.assertNotIn('if', step)
        self.assertNotIn('continue-on-error', step)

    def test_actual_repository_matches_policy(self):
        self.assertEqual(policy.scan(ROOT, policy.repository_paths(ROOT), policy.load_exceptions(ROOT)), [])

    def test_detects_workflow_sdk_config_guidance_generated_output_and_filename(self):
        examples = {
            '.github/workflows/notify.yml': 'uses: slackapi/slack-github-action@v2',
            'package.json': '{"dependencies":{"@slack/web-api":"1"}}',
            '.env.example': 'SLACK_WEBHOOK_URL=https://example.invalid/private-value',
            'docs/guide.md': 'Use Slack for deploy notifications.',
            'docs/site/chapters.json': '{"1":"<p>Notify SLACK</p>"}',
            'tools/inject.py': 'example = "Shared Slack channel"',
            '.github/workflows/notify-slack.yml': 'name: Notification',
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, content in examples.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding='utf-8')
                with self.subTest(path=name):
                    failures = policy.scan(root, [name], {})
                    self.assertTrue(failures)
                    self.assertTrue(all('private-value' not in item for item in failures))

    def test_exception_is_bound_to_path_and_content_not_a_blanket_allowlist(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            name = 'history.md'
            data = b'Historical note: Slack was removed.\n'
            (root / name).write_bytes(data)
            exceptions = {name: {'sha256': policy.normalized_digest(data)}}
            self.assertEqual(policy.scan(root, [name], exceptions), [])
            (root / name).write_bytes(data.replace(b'\n', b'\r\n'))
            self.assertEqual(policy.scan(root, [name], exceptions), [])
            (root / name).write_bytes(data + b'Restore Slack notifications.\n')
            self.assertTrue(policy.scan(root, [name], exceptions))
            (root / 'active.md').write_bytes(data)
            self.assertTrue(policy.scan(root, ['active.md'], exceptions))

    def test_cli_checks_untracked_files_and_returns_failure_without_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(['git', 'init', '-q', directory], check=True, capture_output=True)
            (root / 'tools').mkdir()
            (root / policy.MANIFEST).write_text(json.dumps({'version': 1, 'files': {}}), encoding='utf-8')
            candidate = root / 'new.env'
            candidate.write_text('SLACK_WEBHOOK_URL=private-value', encoding='utf-8')
            command = [sys.executable, '-B', str(ROOT / 'tools/check_communication_policy.py'), '--root', directory]
            result = subprocess.run(command, capture_output=True, text=True, env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            self.assertIn('new.env', result.stdout)
            self.assertNotIn('private-value', result.stdout)
            candidate.write_text('LINE_CHANNEL_ACCESS_TOKEN=', encoding='utf-8')
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
