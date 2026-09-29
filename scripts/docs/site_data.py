"""Shared Markdown rendering and JSON contract for both documentation builders.

Phase semantics are validated separately by the frontmatter workflow. Rendering
requires canonical chapter numbers and titles, without inventing a phase mapping.
"""
import hashlib
import html
import json
from pathlib import Path
import re
import markdown
from markdown.extensions import Extension
from markdown.preprocessors import Preprocessor
import yaml

FRONT_RE = re.compile(r'\A---[ \t]*\n(.*?)\n---[ \t]*(?:\n|\Z)', re.DOTALL)

def parse_file(path):
    raw = Path(path).read_text(encoding='utf-8')
    match = FRONT_RE.match(raw)
    if not match:
        raise ValueError(f'{path}: missing or unclosed YAML frontmatter')
    meta = yaml.safe_load(match.group(1))
    if not isinstance(meta, dict):
        raise ValueError(f'{path}: frontmatter must be a mapping')
    if type(meta.get('num')) is not int or not 1 <= meta['num'] <= 55:
        raise ValueError(f'{path}: num must be an integer in 1..55')
    if not isinstance(meta.get('title'), str) or not meta['title'].strip():
        raise ValueError(f'{path}: title must be a non-empty string')
    get_num(meta, path)
    return meta, raw[match.end():]

def get_num(meta, filename):
    match = re.fullmatch(r'chapter-(\d{2})\.md', Path(filename).name)
    if not match or not 1 <= int(match.group(1)) <= 55:
        raise ValueError(f'{filename}: expected chapter-01.md through chapter-55.md')
    num = int(match.group(1))
    if meta and (type(meta.get('num')) is not int or meta['num'] != num):
        raise ValueError(f'{filename}: filename number differs from frontmatter num')
    return num

class LegacyCodeBlocks(Preprocessor):
    """Protect the outer code block before either syntax interprets its content."""
    def run(self, lines):
        result = []
        index = 0
        while index < len(lines):
            line = lines[index]
            fence = re.match(r'^(`{3,}|~{3,})', line)
            if fence:
                marker = fence.group(1)
                closing = re.compile(r'^' + re.escape(marker[0]) + '{' + str(len(marker)) + r',}[ \t]*$')
                result.append(line)
                index += 1
                while index < len(lines):
                    line = lines[index]
                    result.append(line)
                    index += 1
                    if closing.fullmatch(line):
                        break
                continue
            if line.rstrip(' \t') == '[code]':
                end = index + 1
                while end < len(lines) and lines[end].rstrip(' \t') != '[/code]':
                    end += 1
                if end < len(lines):
                    code = '\n'.join(lines[index + 1:end]) + '\n'
                    block = '<pre><code>' + html.escape(code) + '</code></pre>'
                    result.extend(['', self.md.htmlStash.store(block), ''])
                    index = end + 1
                    continue
            result.append(line)
            index += 1
        return result

class LegacyCodeExtension(Extension):
    def extendMarkdown(self, md):
        # Resolve outer blocks before native fenced_code (priority 25).
        md.preprocessors.register(LegacyCodeBlocks(md), 'legacy_code_blocks', 26)

def render_body(meta, body, num):
    result = markdown.markdown(body, extensions=['extra', 'toc', 'codehilite', 'nl2br', LegacyCodeExtension()],
        extension_configs={'toc': {'permalink': True}, 'codehilite': {'guess_lang': False, 'use_pygments': False}})
    if not result.strip().startswith('<h1'):
        result = f'<h1 id="{num}">{num}. {html.escape(meta["title"])}</h1>\n' + result
    return result

def render_chapters(source):
    result = {}
    for path in sorted(Path(source).rglob('*.md')):
        meta, body = parse_file(path)
        num = get_num(meta, path)
        if str(num) in result:
            raise ValueError(f'{path}: duplicate chapter number {num}')
        result[str(num)] = render_body(meta, body, num)
    if not result:
        raise ValueError('No chapter sources found')
    return dict(sorted(result.items(), key=lambda item: int(item[0])))

def search_index(chapters):
    result = []
    for key, content in sorted(chapters.items(), key=lambda item: int(item[0])):
        plain = html.unescape(re.sub(r'<[^>]+>', ' ', content))
        plain = re.sub(r'\s+', ' ', plain).strip()
        result.append({'num': int(key), 'text': plain[:6000]})
    return result

def validate_data(chapters, search, expected=None):
    if not isinstance(chapters, dict) or not chapters:
        raise ValueError('chapters.json must be a non-empty object')
    for key, value in chapters.items():
        if not isinstance(key, str) or not key.isdecimal() or str(int(key)) != key or not 1 <= int(key) <= 55:
            raise ValueError(f'Invalid chapter key: {key!r}')
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f'Empty/non-string chapter HTML: {key}')
    if expected is not None and set(chapters) != set(expected):
        raise ValueError('Chapter keys differ from expected source inventory')
    if not isinstance(search, list) or any(not isinstance(entry, dict) or type(entry.get('num')) is not int or not isinstance(entry.get('text'), str) for entry in search):
        raise ValueError('search_index.json must be an array of num:int and text:string')
    if search != search_index(chapters):
        raise ValueError('Search index differs from chapter HTML')

def write_json(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8', newline='\n')

def rendering_fingerprint():
    # A renderer/workflow/dependency change invalidates warm chapter hashes.
    workflow = Path(__file__).resolve().parents[2] / '.github/workflows/generate-site-data.yml'
    data = Path(__file__).read_bytes() + workflow.read_bytes()
    data += f'{markdown.__version__}:{yaml.__version__}'.encode()
    return hashlib.sha256(data).digest()

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Validate the published 55-chapter site data')
    parser.add_argument('--site', default='docs/manufacturing-os-site')
    args = parser.parse_args()
    site = Path(args.site)
    validate_data(json.loads((site / 'chapters.json').read_text(encoding='utf-8')),
                  json.loads((site / 'search_index.json').read_text(encoding='utf-8')),
                  {str(n) for n in range(1, 56)})
    print('PASS: 55 chapter HTML entries and matching search index')
