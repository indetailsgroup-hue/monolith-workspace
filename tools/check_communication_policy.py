#!/usr/bin/env python3
"""Enforce LINE-only communication content without preservation exceptions.

Scan regular files and recursively inspect ZIP/Office members. Match raw UTF-8
and UTF-16 bytes and visible XML/HTML text. Do not follow symlinks or traverse
submodules and nested repositories. Diagnostics contain locations, never values.
"""
import argparse
from collections import Counter
import html
import io
from pathlib import Path
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REMOVED_MANIFEST = 'tools/communication_policy_exceptions.json'
# Code points identify the prohibited provider without retaining its old content.
RETIRED = ''.join(map(chr, (115, 108, 97, 99, 107)))
FORBIDDEN = re.compile(re.escape(RETIRED), re.IGNORECASE)
CONTENT_REFERENCE = re.compile(b'|'.join(re.escape(RETIRED.encode(encoding))
                              for encoding in ('utf-8', 'utf-16-le', 'utf-16-be')), re.IGNORECASE)
MAX_ARCHIVE_DEPTH = 8
MAX_EXPANDED_BYTES = 128 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 10000
ARCHIVE_SUFFIXES = {'.zip', '.docx', '.xlsx', '.pptx', '.docm', '.xlsm', '.pptm'}


def repository_paths(root):
    output = subprocess.check_output(
        ['git', '-C', str(root), 'ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    return sorted(set(p.decode('utf-8') for p in output.split(b'\0') if p))


def inspect_payload(name, data, counts, budget, depth=0):
    failures = []
    counts['raw payloads scanned'] += 1
    if FORBIDDEN.search(name):
        failures.append(f'{name}: prohibited provider in path')
    match = CONTENT_REFERENCE.search(data)
    if match:
        failures.append(f'{name}: prohibited reference at byte offset {match.start()}')
    suffix = Path(name).suffix.lower()
    if suffix in {'.xml', '.html', '.htm', '.xhtml'}:
        # Office words may span text runs; entity escapes must not hide references.
        # Tolerates legacy exported XML while inspecting its displayed text.
        text = data.decode('utf-16' if data.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8', errors='replace')
        visible = html.unescape(re.sub(r'<[^>]*>', '', text))
        if not match and FORBIDDEN.search(visible):
            failures.append(f'{name}: prohibited reference in displayed text')
    stream = io.BytesIO(data)
    is_archive = zipfile.is_zipfile(stream)
    # Office owner-lock files are small binary records, not Office ZIP packages.
    # Their names and raw contents remain subject to the same prohibition.
    owner_lock = Path(name.rsplit('!', 1)[-1]).name.startswith('~$') and suffix != '.zip'
    if suffix in ARCHIVE_SUFFIXES and not owner_lock and not is_archive:
        raise ValueError('Unreadable archive')
    if is_archive:
        if depth >= MAX_ARCHIVE_DEPTH:
            raise ValueError('Archive nesting limit exceeded')
        with zipfile.ZipFile(stream) as archive:
            if archive.comment and CONTENT_REFERENCE.search(archive.comment):
                failures.append(f'{name}: prohibited reference in archive comment')
            for info in archive.infolist():
                member = name + '!' + info.filename
                if FORBIDDEN.search(info.filename):
                    failures.append(f'{member}: prohibited provider in member path')
                if info.comment and CONTENT_REFERENCE.search(info.comment):
                    failures.append(f'{member}: prohibited reference in member comment')
                if info.is_dir():
                    continue
                budget[0] -= info.file_size
                budget[1] -= 1
                if min(budget) < 0:
                    raise ValueError('Archive expansion limit exceeded')
                if info.flag_bits & 1:
                    raise ValueError('Encrypted archive member')
                counts['archive members inspected'] += 1
                failures.extend(inspect_payload(member, archive.read(info), counts, budget, depth + 1))
    return failures


def scan(root, paths, counts=None):
    failures = []
    if counts is None:
        counts = Counter()
    for name in paths:
        path = root / name
        if not path.is_file() or path.is_symlink():
            counts['non-regular skipped'] += 1
            if FORBIDDEN.search(name):
                failures.append(f'{name}: prohibited provider in path')
            continue
        if name == REMOVED_MANIFEST:
            failures.append(f'{name}: preservation exceptions are prohibited by owner decision')
            continue
        counts['regular files scanned'] += 1
        try:
            failures.extend(inspect_payload(name, path.read_bytes(), counts,
                                            [MAX_EXPANDED_BYTES, MAX_ARCHIVE_MEMBERS]))
        except (OSError, ValueError, RuntimeError, NotImplementedError, zipfile.BadZipFile):
            failures.append(f'{name}: contents could not be fully inspected')
    return failures


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args(argv)
    try:
        paths = repository_paths(args.root)
        counts = Counter()
        failures = scan(args.root, paths, counts)
    except (OSError, ValueError, subprocess.CalledProcessError):
        print('FAIL: repository inventory could not be read')
        return 2
    if failures:
        print('\n'.join(failures))
        print('FAIL: remove prohibited content; preservation exceptions are not permitted.')
        return 1
    print(f'PASS: communication policy (repository paths={len(paths)}; '
          + '; '.join(f'{field}={counts[field]}' for field in
                      ['regular files scanned', 'archive members inspected', 'raw payloads scanned', 'non-regular skipped']) + ')')
    print('Scope: current regular files and nested ZIP/Office contents; symlink targets, '
          'submodules, nested repositories, Git history and image OCR are not inspected. '
          'Unreadable or over-limit archives fail; other encodings and computed strings are not a semantic code audit.')
    return 0


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
