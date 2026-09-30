"""Syntax regressions against actual documentation workflow scripts."""
import os
from pathlib import Path
import shutil
import subprocess
import unittest
import yaml
ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / '.github/workflows'
BASH = shutil.which('bash') if os.name != 'nt' else r'C:\Program Files\Git\bin\bash.exe'
class WorkflowScriptTests(unittest.TestCase):
    def test_generator_source_check_is_valid_shell(self):
        workflow = yaml.load((WORKFLOWS / 'generate-site-data.yml').read_text(encoding='utf-8'), Loader=yaml.BaseLoader)
        steps = next(iter(workflow['jobs'].values()))['steps']
        script = next(step['run'] for step in steps if step.get('id') == 'check')
        result = subprocess.run([BASH, '-n'], input=script, text=True, encoding="utf-8", capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
    def test_changelog_yaml_and_embedded_python_compile(self):
        workflow = yaml.load((WORKFLOWS / 'auto-update-changelog.yml').read_text(encoding='utf-8'), Loader=yaml.BaseLoader)
        scripts = [step['run'] for job in workflow['jobs'].values() for step in job['steps'] if 'run' in step and "python - << 'PYEOF'" in step['run']]
        self.assertEqual(len(scripts), 1)
        source = scripts[0].split("python - << 'PYEOF'\n", 1)[1].rsplit('\nPYEOF', 1)[0]
        compile(source, 'changelog-workflow.py', 'exec')
import json
import tempfile
NODE = shutil.which('node') or r'C:\Users\thai3\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'

def lighthouse():
    return yaml.load((WORKFLOWS / 'lighthouse-audit.yml').read_text(encoding='utf-8'), Loader=yaml.BaseLoader)
def lighthouse_steps():
    return next(iter(lighthouse()['jobs'].values()))['steps']

class LighthouseTests(unittest.TestCase):
    def test_followup_workflows_watch_actual_deploy_name(self):
        deployed = yaml.load((WORKFLOWS / 'field-app-pages.yml').read_text(encoding='utf-8'), Loader=yaml.BaseLoader)['name']
        for name in ['lighthouse-audit.yml', 'notify-slack-deploy.yml']:
            with self.subTest(workflow=name):
                workflow = yaml.load((WORKFLOWS / name).read_text(encoding='utf-8'), Loader=yaml.BaseLoader)
                self.assertEqual([deployed], workflow['on']['workflow_run']['workflows'])

    def test_exactly_one_workflow_deploys_pages(self):
        # A Pages deploy replaces the whole site. Two deployers overwrite each other:
        # the docs-only deploys took /designer/ and the Field PWA offline from 2026-09-21.
        deployers = sorted(p.name for p in WORKFLOWS.glob('*.yml') if 'actions/deploy-pages@' in p.read_text(encoding='utf-8'))
        self.assertEqual(deployers, ['field-app-pages.yml'])

    def test_threshold_boundaries_and_missing_scores(self):
        step = next(s for s in lighthouse_steps() if s.get('id') == 'threshold')
        self.assertEqual(step['continue-on-error'], 'true')
        for perf, a11y, expected in [('70','90',0),('69','90',1),('70','89',1),('N/A','90',1),('70','',1),('101','90',1)]:
            with self.subTest(perf=perf, a11y=a11y):
                script = step['run'].replace('${{ steps.audit.outputs.perf }}',perf).replace('${{ steps.audit.outputs.a11y }}',a11y)
                result = subprocess.run([BASH,'-e','-o','pipefail'], input=script, text=True, encoding='utf-8', capture_output=True, env={**os.environ,'GITHUB_OUTPUT':'/dev/null'})
                self.assertEqual(result.returncode,expected,result.stdout+result.stderr)

    def test_final_gate_propagates_threshold_failure(self):
        step = lighthouse_steps()[-1]
        self.assertEqual(step.get('id'),'enforce-threshold')
        self.assertEqual(step.get('if'),'always()')
        for outcome,expected in [('success',0),('failure',1),('skipped',1),('cancelled',1)]:
            with self.subTest(outcome=outcome):
                result = subprocess.run([BASH,'-e'],input=step['run'].replace('${{ steps.threshold.outcome }}',outcome),text=True,encoding='utf-8',capture_output=True)
                self.assertEqual(result.returncode,expected,result.stderr)

    def test_pr_comment_create_and_update_execute(self):
        step = next(s for s in lighthouse_steps() if s.get('name') == 'Post comment to PR')
        script = step['with']['script'].replace('${{ steps.pr.outputs.result }}',json.dumps({'found':True,'pr_number':42})).replace('${{ steps.comment.outputs.body_file }}','comment.md')
        for existing in [False,True]:
            with self.subTest(existing=existing), tempfile.TemporaryDirectory() as directory:
                Path(directory,'comment.md').write_text('Audit result',encoding='utf-8')
                harness = '''const assert=require('assert'); const context={repo:{owner:'fixture',repo:'docs'}};let calls=[];
const github={rest:{issues:{listComments:async()=>({data:COMMENTS}),createComment:async x=>calls.push(['create',x]),updateComment:async x=>calls.push(['update',x])}}};
(async()=>{ SCRIPT
assert.equal(calls.length,1);assert.equal(calls[0][0],EXPECTED);assert.equal(calls[0][1].body,'Audit result');assert.equal(calls[0][1][KEY],VALUE);
})().catch(e=>{console.error(e);process.exitCode=1});'''
                harness = harness.replace('COMMENTS',json.dumps([{'id':9,'user':{'type':'Bot'},'body':'🔦 Lighthouse Audit'}] if existing else [])).replace('SCRIPT',script).replace('EXPECTED',json.dumps('update' if existing else 'create')).replace('KEY',json.dumps('comment_id' if existing else 'issue_number')).replace('VALUE','9' if existing else '42')
                result = subprocess.run([NODE,'-e',harness],cwd=directory,text=True,encoding='utf-8',capture_output=True,env={**os.environ,'PR_RESULT':json.dumps({'found':True,'pr_number':42}),'COMMENT_BODY_FILE':'comment.md'})
                self.assertEqual(result.returncode,0,result.stderr)

class AllDocumentationShellTests(unittest.TestCase):
    def test_all_documentation_workflows_parse_and_shell_scripts_compile(self):
        names=['field-app-pages','deploy-docs-ci','sync-chapters','auto-update-changelog','notify-slack-deploy','lighthouse-audit','generate-site-data','validate-chapter-frontmatter']
        for name in names:
            workflow=yaml.load((WORKFLOWS/(name+'.yml')).read_text(encoding='utf-8'),Loader=yaml.BaseLoader)
            for job in workflow['jobs'].values():
                for step in job['steps']:
                    if 'run' not in step:
                        continue
                    with self.subTest(workflow=name,step=step.get('name')):
                        result=subprocess.run([BASH,'-n'],input=step['run'],text=True,encoding='utf-8',capture_output=True)
                        self.assertEqual(result.returncode,0,result.stderr)

# Required status checks on main (branch protection, read 2026-09-29). The list
# lives in GitHub settings, not in the repo, so keep it in step with them.
REQUIRED_CHECKS = {
    'TypeScript Type Check',
    'Unit Tests (people + culture)',
    'Storybook Build (CI verify)',
    'Chromatic — Visual Regression (People & Culture)',
    'Validate Site Files',
}

class RequiredCheckTriggerTests(unittest.TestCase):
    def test_required_checks_run_on_every_pull_request(self):
        # A path-filtered pull_request trigger never starts the job for PRs outside
        # the paths, so a required check waits for ever and the PR needs a bypass.
        # docs-only PRs were blocked on "Validate Site Files" this way.
        found = set()
        for path in sorted(WORKFLOWS.glob('*.yml')):
            workflow = yaml.load(path.read_text(encoding='utf-8'), Loader=yaml.BaseLoader)
            names = {job.get('name', key) for key, job in (workflow.get('jobs') or {}).items()}
            required = names & REQUIRED_CHECKS
            if not required:
                continue
            found |= required
            trigger = workflow.get('on', {}).get('pull_request')
            with self.subTest(workflow=path.name):
                self.assertIsInstance(trigger, dict, 'required check must run on pull_request')
                self.assertNotIn('paths', trigger)
                self.assertNotIn('paths-ignore', trigger)
                self.assertIn('main', trigger.get('branches', ['main']))
        self.assertEqual(found, REQUIRED_CHECKS, 'every required check must come from a workflow in this repo')

if __name__ == '__main__':
    unittest.main()
