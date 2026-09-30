"""Keep communication removal enforceable across source and delivered documents."""
from collections import Counter
from pathlib import Path
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
import yaml

from tools import check_communication_policy as policy

ROOT = Path(__file__).resolve().parents[2]
OLD = ''.join(map(chr, (115, 108, 97, 99, 107)))


def packed(members, comment=b''):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.comment = comment
        for name, data in members.items(): archive.writestr(name, data)
    return buffer.getvalue()


class CommunicationPolicyTests(unittest.TestCase):
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

    def test_workflows_do_not_use_retired_provider(self):
        offenders = [p.name for p in (ROOT / '.github/workflows').glob('*.y*ml')
                     if OLD in p.name.lower() or OLD in p.read_text(encoding='utf-8').lower()]
        self.assertEqual(offenders, [])

    def test_actual_repository_has_no_exceptions_or_prohibited_content(self):
        self.assertFalse((ROOT / policy.REMOVED_MANIFEST).exists())
        self.assertEqual(policy.scan(ROOT, policy.repository_paths(ROOT)), [])

    def test_archive_resource_limits_fail_instead_of_skipping(self):
        data = packed({'guide.md': b'LINE' * 100})
        for budget in ([1, 100], [1000, 0]):
            with self.subTest(budget=budget):
                with self.assertRaises(ValueError): policy.inspect_payload('SOP.zip', data, Counter(), budget)
        with self.assertRaises(ValueError):
            policy.inspect_payload('SOP.zip', data, Counter(), [1000, 100], policy.MAX_ARCHIVE_DEPTH)


class CommunicationPolicyCLITests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True, capture_output=True)
        self.script = os.environ.get('COMMUNICATION_POLICY_SCRIPT', str(ROOT / 'tools/check_communication_policy.py'))

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content if isinstance(content, bytes) else content.encode('utf-8'))
        return path

    def run_check(self, root=None):
        return subprocess.run([sys.executable, '-B', self.script, '--root', str(root or self.root)],
                              capture_output=True, text=True, encoding='utf-8',
                              env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})

    def test_source_config_documents_and_history_tracked_and_untracked(self):
        names = ['src/notify.ts', 'src/notify.js', 'scripts/notify.sh', 'scripts/notify.ps1',
                 'config/notify.toml', 'monolith/example.py', 'supabase/migrations/proposed.sql',
                 'docs/guide.th.md', 'docs/current.html', 'archive/history.md', 'archive/history.txt',
                 '.env.example', 'package.json', 'docs/site/chapters.json']
        for name in names:
            for tracked in (False, True):
                with self.subTest(path=name, tracked=tracked):
                    path = self.write(name, 'ข้อความ ' + OLD.upper() + '_WEBHOOK_URL=private-value')
                    if tracked:
                        subprocess.run(['git', '-C', str(self.root), 'add', '--', name], check=True, capture_output=True)
                    result = self.run_check()
                    self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                    self.assertIn(name, result.stdout)
                    self.assertNotIn('private-value', result.stdout + result.stderr)
                    if tracked:
                        subprocess.run(['git', '-C', str(self.root), 'rm', '--cached', '--', name], check=True, capture_output=True)
                    path.unlink()

    def test_provider_in_directory_name_is_rejected(self):
        name = 'integrations/' + OLD + '/notify.yml'
        self.write(name, 'name: Notification')
        self.assertEqual(self.run_check().returncode, 1)

    def test_filename_is_checked_even_when_content_is_binary(self):
        self.write('notify-' + OLD + '.bin', b'\0binary')
        self.assertEqual(self.run_check().returncode, 1)

    def test_reference_at_end_of_large_text_is_rejected(self):
        self.write('docs/large.html', b'<p>Reviewed content.</p>\n' * 60000 + OLD.encode())
        self.assertGreater((self.root / 'docs/large.html').stat().st_size, 1024 * 1024)
        self.assertEqual(self.run_check().returncode, 1)

    def test_nul_cannot_hide_references(self):
        for data in (b'\0' + OLD.encode(), OLD.encode() + b'\0', b'\0' + b'x' * 16384 + OLD.encode()):
            with self.subTest(bytes=len(data)):
                self.write('src/notify.js', data)
                self.assertEqual(self.run_check().returncode, 1)

    def test_utf16_references_with_or_without_bom(self):
        for encoding, bom in (('utf-16-le', b'\xff\xfe'), ('utf-16-be', b'\xfe\xff')):
            for prefix in (b'', bom):
                with self.subTest(encoding=encoding, bom=bool(prefix)):
                    self.write('scripts/notify.ps1', prefix + (OLD.title() + ' private-value').encode(encoding))
                    result = self.run_check()
                    self.assertEqual(result.returncode, 1)
                    self.assertNotIn('private-value', result.stdout + result.stderr)

    def test_preservation_manifest_is_rejected_even_if_empty(self):
        self.write(policy.REMOVED_MANIFEST, '{"version":1,"files":{}}')
        self.assertEqual(self.run_check().returncode, 1)

    def test_historical_reference_cannot_be_exempted_by_digest(self):
        data = OLD.encode()
        self.write('archive/history.md', data)
        self.write(policy.REMOVED_MANIFEST, json.dumps({'version':1, 'files':{'archive/history.md':{
            'category':'historical-evidence', 'reason':'Old record', 'sha256':hashlib.sha256(data).hexdigest()}}}))
        self.assertEqual(self.run_check().returncode, 1)
        (self.root / policy.REMOVED_MANIFEST).unlink()
        self.assertEqual(self.run_check().returncode, 1)

    def test_compressed_and_nested_documents_are_checked(self):
        word = packed({'word/document.xml': '<w:t>' + OLD + '</w:t>'})
        self.write('SOP.zip', packed({'accepted.docx': word}))
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn('SOP.zip!accepted.docx!word/document.xml', result.stdout)

    def test_word_runs_and_html_entities_cannot_hide_reference(self):
        for name, data in [('word/document.xml', '<w:t>' + OLD[:2] + '</w:t><w:t>' + OLD[2:] + '</w:t>'),
                           ('guide.html', ''.join('&#' + str(ord(c)) + ';' for c in OLD))]:
            with self.subTest(member=name):
                self.write('document.docx', packed({name: data}))
                self.assertEqual(self.run_check().returncode, 1)

    def test_archive_member_names_and_comments_are_checked(self):
        for data in (packed({OLD + '/guide.txt': 'LINE'}),
                     packed({'guide.txt': 'LINE'}, OLD.encode())):
            self.write('SOP.zip', data)
            self.assertEqual(self.run_check().returncode, 1)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
            info = zipfile.ZipInfo('guide.txt'); info.comment = OLD.encode()
            archive.writestr(info, 'LINE')
        self.write('SOP.zip', buffer.getvalue())
        self.assertEqual(self.run_check().returncode, 1)

    def test_office_owner_lock_is_raw_scanned_not_mistaken_for_workbook(self):
        self.write('docs/~$ledger.xlsx', b'\x05owner' + b'\0' * 159)
        self.assertEqual(self.run_check().returncode, 0)
        self.write('docs/~$ledger.xlsx', b'\0' + OLD.encode('utf-16-le'))
        self.assertEqual(self.run_check().returncode, 1)
        self.write('docs/~$ledger.xlsx', packed({'guide.txt': OLD}))
        self.assertEqual(self.run_check().returncode, 1)

    def test_thai_path_is_reported_even_with_legacy_console_encoding(self):
        self.write('docs/การแจ้งเตือน.md', OLD)
        result = subprocess.run([sys.executable, '-B', self.script, '--root', str(self.root)],
                                capture_output=True, encoding='utf-8',
                                env={**os.environ, 'PYTHONIOENCODING': 'cp1252'})
        self.assertEqual(result.returncode, 1)
        self.assertIn('docs/การแจ้งเตือน.md', result.stdout)
        self.assertNotIn('Traceback', result.stderr)

    def test_corrupt_archive_fails_closed(self):
        self.write('broken.zip', b'not a readable archive')
        self.assertEqual(self.run_check().returncode, 1)

    def test_git_failure_is_not_a_clean_repository(self):
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_check(Path(directory))
            self.assertEqual(result.returncode, 2)
            self.assertIn('FAIL:', result.stdout)

    def test_clean_line_and_nested_documents_pass(self):
        self.write('src/notify.ts', 'const provider = "LINE OA Messaging API";')
        self.write('asset.bin', b'\0clean binary')
        self.write('SOP.zip', packed({'accepted.docx': packed({'word/document.xml':'<w:t>LINE</w:t>'})}))
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('regular files scanned=3', result.stdout)
        self.assertIn('archive members inspected=2', result.stdout)
        self.assertIn('raw payloads scanned=5', result.stdout)


if __name__ == '__main__':
    unittest.main()
