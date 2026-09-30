#!/usr/bin/env python3
"""Reject Slack integrations and guidance; LINE is the owner's selected channel.

Scan tracked and non-ignored new files, including filenames, generated documents,
dependencies, examples and workflows. Reviewed historical evidence, engineering
terminology and policy tests are exempt only at their exact normalized SHA-256.
Diagnostics print paths/line numbers, never matching text or credential values.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = 'tools/communication_policy_exceptions.json'
FORBIDDEN = re.compile(rb'slack', re.IGNORECASE)
CATEGORIES = {'historical-evidence', 'engineering-term', 'policy-and-regression'}


def normalized_digest(data):
    return hashlib.sha256(data.replace(b'\r\n', b'\n')).hexdigest()


def load_exceptions(root):
    document = json.loads((root / MANIFEST).read_text(encoding='utf-8'))
    if document.get('version') != 1 or not isinstance(document.get('files'), dict):
        raise ValueError('Invalid communication policy exception manifest')
    for name, entry in document['files'].items():
        path = Path(name)
        if path.is_absolute() or '..' in path.parts or '\\' in name:
            raise ValueError('Exception paths must be relative POSIX paths')
        if entry.get('category') not in CATEGORIES or not entry.get('reason'):
            raise ValueError(f'Missing reviewed exception reason: {name}')
        if not re.fullmatch(r'[0-9a-f]{64}', entry.get('sha256', '')):
            raise ValueError(f'Invalid exception digest: {name}')
    return document['files']


def repository_paths(root):
    output = subprocess.check_output(
        ['git', '-C', str(root), 'ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    return sorted(set(p.decode('utf-8') for p in output.split(b'\0') if p))


def candidate_bytes(path):
    # Avoid loading large binary assets into memory just to classify them.
    with path.open('rb') as stream:
        prefix = stream.read(8192)
        if b'\0' in prefix:
            return b''
        return prefix + stream.read()


def scan(root, paths, exceptions):
    failures = []
    for name in paths:
        if name == MANIFEST:
            continue  # Data describing reviewed exceptions, never executable code.
        path = root / name
        if not path.is_file() or path.is_symlink():
            continue  # Deleted files, submodule directories and external link targets.
        data = candidate_bytes(path)
        in_name = bool(FORBIDDEN.search(name.encode('utf-8')))
        in_content = b'\0' not in data and bool(FORBIDDEN.search(data))
        if not in_name and not in_content:
            continue
        entry = exceptions.get(name)
        if entry and entry['sha256'] == normalized_digest(data):
            continue
        if in_name:
            failures.append(f'{name}: retired provider in filename')
        if in_content:
            # One location per file keeps generated/minified documents and logs bounded.
            match = FORBIDDEN.search(data)
            line = data.count(b'\n', 0, match.start()) + 1
            failures.append(f'{name}:{line}: retired provider reference (not a reviewed exception)')
    return failures


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args(argv)
    try:
        exceptions = load_exceptions(args.root)
        paths = repository_paths(args.root)
        failures = scan(args.root, paths, exceptions)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'FAIL: communication policy could not be checked ({type(error).__name__})')
        return 2
    if failures:
        print('\n'.join(failures))
        print('FAIL: use the approved LINE communication policy; do not restore retired integrations.')
        return 1
    print(f'PASS: communication policy ({len(paths)} repository paths; reviewed exceptions pinned by digest)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
