import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import yaml
ROOT=Path(__file__).resolve().parents[2]

class SiteDataTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        (self.root/'docs/chapters').mkdir(parents=True)
        (self.root/'docs/manufacturing-os-site').mkdir(parents=True)
        (self.root/'.github').mkdir()
        self.env={**os.environ,'PYTHONIOENCODING':'utf-8','PYTHONPATH':str(ROOT)+os.pathsep+os.environ.get('PYTHONPATH',''),'CHAPTERS_PATH':'docs/chapters','OUTPUT_PATH':'docs/manufacturing-os-site','GITHUB_OUTPUT':str(self.root/'outputs'),'FORCE_REBUILD':'false'}
        self.write_chapter(1);self.write_chapter(2)
    def write_chapter(self,num,extra=''):
        (self.root/f'docs/chapters/chapter-{num:02}.md').write_text(f'---\nnum: {num}\ntitle: Chapter {num}\nphase: 1\nmcp_tools: 0\nstatus: complete\n---\n# Chapter {num}\n\n**Content** & more.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n'+extra,encoding='utf-8')
    def steps(self,name):
        w=yaml.load((ROOT/'.github/workflows'/name).read_text(encoding='utf-8'),Loader=yaml.BaseLoader)
        return next(iter(w['jobs'].values()))['steps']
    def run_step(self,step):
        source=step['run'].split("<< 'PYEOF'\n",1)[1].rsplit('\nPYEOF',1)[0]
        source=source.replace('/tmp/changed_chapters.txt',(self.root/'changed.txt').as_posix())
        result=subprocess.run([sys.executable,'-c',source],cwd=self.root,env=self.env,text=True,encoding='utf-8',capture_output=True)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
    def generate(self):
        steps=self.steps('generate-site-data.yml')
        (self.root/'outputs').write_text('',encoding='utf-8')
        self.run_step(next(s for s in steps if s.get('id')=='cache'))
        outputs=dict(line.split('=',1) for line in (self.root/'outputs').read_text().splitlines())
        if outputs['has_changes']=='true':
            self.run_step(next(s for s in steps if s.get('id')=='generate'))
            shutil.copyfile(self.root/'.github/chapter-hashes-pending.json',self.root/'.github/chapter-cache.json')
        return outputs
    def payload(self,name='chapters.json'):
        return json.loads((self.root/'docs/manufacturing-os-site'/name).read_text(encoding='utf-8'))
    def test_cold_warm_edit_force(self):
        self.assertEqual(self.generate()['changed_count'],'2')
        before=self.payload();self.assertIn('<table>',before['1'])
        self.assertEqual(self.generate()['has_changes'],'false')
        self.write_chapter(2,'Updated content')
        self.assertEqual(self.generate()['changed_count'],'1')
        self.assertEqual(self.payload()['1'],before['1'])
        self.assertIn('Updated content',self.payload()['2'])
        self.env['FORCE_REBUILD']='true'
        self.assertEqual(self.generate()['changed_count'],'2')
    def test_deletion_and_readdition(self):
        self.generate(); (self.root/'docs/chapters/chapter-02.md').unlink()
        self.assertEqual(self.generate()['has_changes'],'true')
        self.assertEqual(set(self.payload()),{'1'})
        self.assertEqual([x['num'] for x in self.payload('search_index.json')],[1])
        self.write_chapter(2);self.generate();self.assertEqual(set(self.payload()),{'1','2'})
    def test_missing_or_corrupt_outputs_rebuild(self):
        for file,value in [('chapters.json',None),('search_index.json',None),('chapters.json','[]'),('search_index.json','[]')]:
            with self.subTest(file=file,value=value):
                self.generate()
                path=self.root/'docs/manufacturing-os-site'/file
                path.unlink() if value is None else path.write_text(value)
                self.assertEqual(self.generate()['has_changes'],'true')
                self.assertEqual(set(self.payload()),{'1','2'})
                self.assertEqual(len(self.payload('search_index.json')),2)
    def test_non_object_cache_recovers(self):
        self.generate();(self.root/'.github/chapter-cache.json').write_text('[]')
        self.assertEqual(self.generate()['has_changes'],'true')
    def test_release_sync_matches_generator_bytes(self):
        self.generate()
        site=self.root/'docs/manufacturing-os-site'
        expected={f:(site/f).read_bytes() for f in ['chapters.json','search_index.json']}
        steps=self.steps('sync-chapters.yml')
        for name in ['Build chapters.json','Build search_index.json']:
            self.run_step(next(s for s in steps if s.get('name')==name))
        for f,content in expected.items():
            self.assertEqual((site/f).read_bytes(),content,f)

    def test_real_55_chapters_rebuild_without_mutating_sources(self):
        sources=list((ROOT/'docs/chapters').rglob('*.md'))
        self.assertEqual(len(sources),55)
        self.assertEqual({p.name for p in sources},{f'chapter-{n:02}.md' for n in range(1,56)})
        for path in sources:
            shutil.copyfile(path,self.root/'docs/chapters'/path.name)
        self.assertEqual(self.generate()['total_count'],'55')
        self.assertEqual(set(self.payload()),{str(n) for n in range(1,56)})
        self.assertEqual(len(self.payload('search_index.json')),55)
        self.assertEqual(self.generate()['has_changes'],'false')
    def test_nested_sources_and_duplicate_number_rejection(self):
        nested=self.root/'docs/chapters/phase';nested.mkdir()
        (self.root/'docs/chapters/chapter-02.md').rename(nested/'chapter-02.md')
        self.assertEqual(self.generate()['total_count'],'2')
        shutil.copyfile(nested/'chapter-02.md',self.root/'docs/chapters/chapter-02.md')
        with self.assertRaisesRegex(AssertionError, "duplicate chapter numbers"):
            self.generate()

    def test_legacy_exported_code_blocks_render_as_code(self):
        self.write_chapter(1,'\n[code] \n    if (a < b) {\n      print("<tag> & value");\n    }\n[/code]\n')
        self.generate()
        content=self.payload()['1']
        self.assertNotIn('[code]',content)
        self.assertIn('<pre><code>',content)
        self.assertIn('a &lt; b',content)
        self.assertIn('&lt;tag&gt; &amp; value',content)

    def test_native_fence_with_literal_legacy_markers_is_preserved(self):
        self.write_chapter(1,'\n```text\n[code]\nexample <tag>\n[/code]\n```\n')
        self.generate()
        content=self.payload()['1']
        self.assertIn('[code]',content)
        self.assertIn('&lt;tag&gt;',content)
        self.assertNotIn('&lt;pre&gt;',content)

    def test_native_fence_inside_legacy_block_remains_literal(self):
        self.write_chapter(1,'\n[code]\n```html\n<script>alert(1)</script>\n```\n[/code]\n')
        self.generate()
        content=self.payload()['1']
        self.assertEqual(content.count('<pre'),1)
        self.assertEqual(content.count('```'),2)
        self.assertIn('&lt;script&gt;',content)
        self.assertNotIn('<script>',content)
