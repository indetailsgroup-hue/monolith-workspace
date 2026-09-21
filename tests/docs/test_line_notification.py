import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, MagicMock
from urllib.error import HTTPError, URLError

from scripts.docs.notify_line import notify


class LineNotificationTests(unittest.TestCase):
    def env(self, directory):
        return {'LINE_CHANNEL_ACCESS_TOKEN': 'private-token', 'LINE_DEPLOY_RECIPIENT_ID': 'C' + '1'*32,
                'GITHUB_REPOSITORY': 'owner/repo', 'SOURCE_RUN_ID': '123',
                'SOURCE_SHA': 'a'*40, 'SOURCE_CONCLUSION': 'success',
                'SOURCE_WORKFLOW': 'Docs "deploy" ไทย',
                'GITHUB_STEP_SUMMARY': str(Path(directory)/'summary')}

    def test_missing_config_makes_no_network_call_and_reports_skip(self):
        with tempfile.TemporaryDirectory() as d:
            env = self.env(d)
            env['LINE_DEPLOY_RECIPIENT_ID'] = ''
            sender = MagicMock()
            self.assertEqual(notify(env, sender), 0)
            sender.assert_not_called()
            self.assertIn('SKIPPED', Path(env['GITHUB_STEP_SUMMARY']).read_text())

    def test_payload_and_stable_retry_key_with_no_secret_logging(self):
        with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(io.StringIO()) as output:
            env = self.env(d)
            sender = MagicMock()
            sender.return_value.__enter__.return_value.status = 200
            self.assertEqual(notify(env, sender), 0)
            request = sender.call_args.args[0]
            body = json.loads(request.data)
            self.assertEqual(body['to'], env['LINE_DEPLOY_RECIPIENT_ID'])
            self.assertIn('Docs "deploy" ไทย', body['messages'][0]['text'])
            self.assertNotIn('SciSpace deployed', body['messages'][0]['text'])
            self.assertEqual(request.full_url, 'https://api.line.me/v2/bot/message/push')
            key = request.get_header('X-line-retry-key')
            self.assertEqual(notify(env, sender), 0)
            self.assertEqual(key, sender.call_args.args[0].get_header('X-line-retry-key'))
            self.assertEqual(sender.call_args.kwargs['timeout'], 30)
            self.assertNotIn('private-token', output.getvalue())
            env['LINE_DEPLOY_RECIPIENT_ID'] = 'C' + '2'*32
            self.assertEqual(notify(env, sender), 0)
            self.assertNotEqual(key, sender.call_args.args[0].get_header('X-line-retry-key'))

    def test_workflow_uses_trusted_main_and_scoped_credentials(self):
        import yaml
        root = Path(__file__).resolve().parents[2]
        workflow = yaml.load((root/'.github/workflows/notify-line-deploy.yml').read_text(encoding='utf-8'), Loader=yaml.BaseLoader)
        self.assertEqual(workflow['permissions'], {'contents': 'read'})
        self.assertEqual(workflow['on']['workflow_run']['branches'], ['main'])
        job = workflow['jobs']['line-notify']
        self.assertIn('head_repository.full_name == github.repository', job['if'])
        self.assertIn("head_branch == 'main'", job['if'])
        self.assertEqual(job['steps'][0]['with']['ref'], 'main')
        self.assertEqual(job['steps'][0]['with']['persist-credentials'], 'false')
        self.assertNotIn('${{', job['steps'][-1]['run'])

    def test_invalid_recipient_blocks_network(self):
        with tempfile.TemporaryDirectory() as d:
            env = self.env(d)
            env['LINE_DEPLOY_RECIPIENT_ID'] = 'not-a-recipient'
            sender = Mock()
            self.assertEqual(notify(env, sender), 1)
            sender.assert_not_called()

    def test_api_and_network_failures_are_redacted_and_fail(self):
        for error in [HTTPError('url', 401, 'private-token', {}, None), URLError('private-token')]:
            with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(io.StringIO()) as output:
                env = self.env(d)
                self.assertEqual(notify(env, Mock(side_effect=error)), 1)
                self.assertNotIn('private-token', output.getvalue())
                self.assertIn('FAILED', Path(env['GITHUB_STEP_SUMMARY']).read_text())

    def test_duplicate_retry_is_accepted_only_with_line_receipt(self):
        with tempfile.TemporaryDirectory() as d:
            env = self.env(d)
            error = HTTPError('url', 409, 'Conflict', {'x-line-accepted-request-id': 'receipt'}, None)
            self.assertEqual(notify(env, Mock(side_effect=error)), 0)
            error = HTTPError('url', 409, 'Conflict', {}, None)
            self.assertEqual(notify(env, Mock(side_effect=error)), 1)

    def test_cancelled_source_never_sends(self):
        with tempfile.TemporaryDirectory() as d:
            env = self.env(d)
            env['SOURCE_CONCLUSION'] = 'cancelled'
            sender = MagicMock()
            self.assertEqual(notify(env, sender), 0)
            sender.assert_not_called()
