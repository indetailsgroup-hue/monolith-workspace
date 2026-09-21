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
        deployed = yaml.load((WORKFLOWS / 'deploy-docs-pages.yml').read_text(encoding='utf-8'), Loader=yaml.BaseLoader)['name']
        for name in ['lighthouse-audit.yml', 'notify-line-deploy.yml']:
            with self.subTest(workflow=name):
                workflow = yaml.load((WORKFLOWS / name).read_text(encoding='utf-8'), Loader=yaml.BaseLoader)
                self.assertIn(deployed, workflow['on']['workflow_run']['workflows'])
                if name == 'lighthouse-audit.yml':
                    self.assertIn('Auto-Deploy SciSpace Site',workflow['on']['workflow_run']['workflows'])

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
    def test_all_nine_workflows_parse_and_shell_scripts_compile(self):
        names=['deploy-docs-pages','deploy-docs-ci','sync-chapters','auto-update-changelog','notify-line-deploy','lighthouse-audit','generate-site-data','auto-deploy-scispace','validate-chapter-frontmatter']
        for name in names:
            workflow=yaml.load((WORKFLOWS/(name+'.yml')).read_text(encoding='utf-8'),Loader=yaml.BaseLoader)
            for job in workflow['jobs'].values():
                for step in job['steps']:
                    if 'run' not in step:
                        continue
                    with self.subTest(workflow=name,step=step.get('name')):
                        result=subprocess.run([BASH,'-n'],input=step['run'],text=True,encoding='utf-8',capture_output=True)
                        self.assertEqual(result.returncode,0,result.stderr)

if __name__ == '__main__':
    unittest.main()
