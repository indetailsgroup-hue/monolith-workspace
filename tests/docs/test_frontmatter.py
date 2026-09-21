import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import yaml
ROOT = Path(__file__).resolve().parents[2]

class FrontmatterTests(unittest.TestCase):
    def run_validator(self, metadata=None, raw=None, nested=None, nested_directory="phase"):
        workflow = yaml.load((ROOT/'.github/workflows/validate-chapter-frontmatter.yml').read_text(encoding='utf-8'), Loader=yaml.BaseLoader)
        scripts=[s['run'] for j in workflow['jobs'].values() for s in j['steps'] if 'run' in s and "cat <<" in s['run']]
        self.assertEqual(len(scripts),1)
        source=scripts[0].split("\n",1)[1].rsplit('\nPYEOF',1)[0]
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            chapter='---\n'+yaml.safe_dump(metadata,allow_unicode=True)+'---\n# Content\n' if raw is None else raw
            (root/'chapter-01.md').write_text(chapter,encoding='utf-8')
            if nested is not None:
                (root/nested_directory).mkdir()
                (root/nested_directory/'chapter-02.md').write_text('---\n'+yaml.safe_dump(nested)+'---\n# Nested\n',encoding='utf-8')
            result=subprocess.run([sys.executable,'-c',source,str(root),'false'],text=True,encoding='utf-8',capture_output=True,env={**os.environ,'PYTHONIOENCODING':'utf-8','GITHUB_STEP_SUMMARY':str(root/'summary.md')})
            return result
    def valid(self):
        return dict(num=1,title='บททดสอบ',phase=1,phase_num=1,phase_label='Phase 1',mcp_tools=0,status='complete')
    def test_valid_chapter_and_delimiter_in_title(self):
        self.assertEqual(self.run_validator(self.valid()).returncode,0)
        meta=self.valid();meta['title']='Before --- after'
        result=self.run_validator(meta)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
    def test_invalid_metadata_is_annotated_not_crashed(self):
        cases=[('num',True),('phase',True),('mcp_tools',False),('num',0),('phase',-1),('phase',16),('title',None),('title',123),('status','COMPLETE'),('num',2)]
        for field,value in cases:
            with self.subTest(field=field,value=value):
                meta=self.valid();meta[field]=value
                result=self.run_validator(meta)
                self.assertEqual(result.returncode,1,result.stdout)
                self.assertIn('::error file=',result.stdout)
                self.assertNotIn('Traceback',result.stderr)
    def test_non_mapping_yaml_is_rejected_cleanly(self):
        for value in [42,['num','title'],'num']:
            with self.subTest(value=value):
                result=self.run_validator(value)
                self.assertEqual(result.returncode,1)
                self.assertIn('::error file=',result.stdout)
                self.assertNotIn('Traceback',result.stderr)

    def test_nested_invalid_chapter_is_not_ignored(self):
        nested=self.valid();nested.update(num=2,phase=False)
        result=self.run_validator(self.valid(),nested=nested)
        self.assertEqual(result.returncode,1,result.stdout)
        self.assertIn('chapter-02.md::',result.stdout)
        self.assertNotIn('Traceback',result.stderr)

    def test_hidden_nested_invalid_chapter_is_not_ignored(self):
        nested=self.valid();nested.update(num=2,phase=False)
        result=self.run_validator(self.valid(),nested=nested,nested_directory='.draft')
        self.assertEqual(result.returncode,1,result.stdout)
        self.assertIn('chapter-02.md::',result.stdout)

    def test_phase_contract_foundation_and_aliases(self):
        for phase in [0, 1, 15]:
            meta=self.valid();meta.update(phase=phase,phase_num=phase,phase_label='Foundation' if phase==0 else f'Phase {phase}')
            result=self.run_validator(meta)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        for field,value in [('phase_num',False),('phase_num',2),('phase_label','Foundation'),('phase_label',None)]:
            meta=self.valid();meta[field]=value
            result=self.run_validator(meta)
            self.assertEqual(result.returncode,1,result.stdout)
        for field in ['phase_num','phase_label']:
            meta=self.valid();del meta[field]
            self.assertEqual(self.run_validator(meta).returncode,1)
