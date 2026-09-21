"""Regression coverage for protected-main documentation automation."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[2]

def workflow(name):
    return yaml.load((ROOT / '.github/workflows' / name).read_text(encoding='utf-8'), Loader=yaml.BaseLoader)

def steps(name):
    return next(iter(workflow(name)['jobs'].values()))['steps']

class AutomationPRTests(unittest.TestCase):
    def test_publication_is_signed_scoped_draft_pr_not_direct_push(self):
        for name,paths in [
            ('generate-site-data.yml', ['${{ env.OUTPUT_PATH }}/chapters.json', '${{ env.OUTPUT_PATH }}/search_index.json', '.github/chapter-cache.json']),
            ('auto-update-changelog.yml', ['docs/manufacturing-os-site/changelog.html']),
        ]:
            with self.subTest(workflow=name):
                w=workflow(name)
                self.assertEqual(w['permissions']['pull-requests'],'write')
                self.assertEqual(w['concurrency']['cancel-in-progress'],'false')
                publish=next(s for s in steps(name) if 'create-pull-request@' in s.get('uses',''))
                self.assertEqual(publish['with']['base'],'main')
                self.assertEqual(publish['with']['sign-commits'],'true')
                self.assertEqual(publish['with']['draft'],'always-true')
                self.assertEqual(publish['with']['add-paths'].splitlines(),paths)
                self.assertIn('close and reopen',publish['with']['body'])
                for step in steps(name):
                    self.assertNotRegex(step.get('run',''),r'git\s+(push|commit)\b')

    def test_generator_dry_run_cannot_publish_and_branches_are_deterministic(self):
        generator=next(s for s in steps('generate-site-data.yml') if 'create-pull-request@' in s.get('uses',''))
        self.assertIn("env.DRY_RUN != 'true'",generator['if'])
        self.assertEqual(generator['with']['branch'],'codex/automated-site-data')
        changelog=next(s for s in steps('auto-update-changelog.yml') if 'create-pull-request@' in s.get('uses',''))
        self.assertEqual(changelog['with']['branch'],'codex/changelog-${{ github.sha }}')
        self.assertIn("steps.diff.outputs.changed_files != ''",changelog['if'])

    def test_changelog_rerun_is_idempotent_and_preserves_other_entries(self):
        step=next(s for s in steps('auto-update-changelog.yml') if s.get('id')=='insert')
        script=step['run'].split("python - << 'PYEOF'\n",1)[1].rsplit('\nPYEOF',1)[0]
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);site=root/'docs/manufacturing-os-site';site.mkdir(parents=True)
            path=site/'changelog.html';path.write_text('<div class="timeline"><!-- COMMIT_LOG_INSERT_HERE --></div>')
            env={**os.environ,'COMMIT_SHA':'a'*40,'COMMIT_MSG':'example <unsafe>','COMMIT_AUTH':'fixture','COMMIT_TS':'2026-09-21T12:00:00+07:00','CHANGED':'docs/manufacturing-os-site/index.html','RUN_URL':'https://example.invalid/commit','GITHUB_OUTPUT':str(root/'output')}
            def run():
                r=subprocess.run([sys.executable,'-c',script],cwd=root,env=env,capture_output=True,text=True)
                self.assertEqual(r.returncode,0,r.stderr)
            run();first=path.read_bytes();run();self.assertEqual(path.read_bytes(),first)
            self.assertIn('05:00 UTC',first.decode())
            self.assertIn('&lt;unsafe&gt;',first.decode())
            env['COMMIT_SHA']='b'*40;run()
            self.assertIn('a'*40,path.read_text(encoding='utf-8'));self.assertIn('b'*40,path.read_text(encoding='utf-8'))

    def test_cache_only_pr_runs_required_docs_check(self):
        w=workflow('deploy-docs-ci.yml')
        self.assertIn('.github/chapter-cache.json',w['on']['pull_request']['paths'])

if __name__=='__main__':unittest.main()
