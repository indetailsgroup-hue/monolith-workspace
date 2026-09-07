import assert from 'node:assert/strict';
import test from 'node:test';

import { getExitCode, parsePatterns } from './bypass-scan.ts';

test('parses regex alternation without treating pipes as field separators', () => {
  const source = String.raw`G10.3|WARN-HIGH|getMachineProfile\([^)]*\)\s*\|\|\s*\{|Fallback profile`;
  const { patterns } = parsePatterns(source);

  assert.equal(patterns.length, 1);
  assert.equal(
    patterns[0].regex,
    String.raw`getMachineProfile\([^)]*\)\s*\|\|\s*\{`,
  );
  assert.equal(patterns[0].compiledRegex.test('getMachineProfile(id) || {'), true);
});

test('parses exception patterns containing pipes', () => {
  const source = String.raw`EXCEPT|foo\|bar|**/__tests__/**`;
  const { exceptions } = parsePatterns(source);

  assert.deepEqual(exceptions, [{
    pattern: String.raw`foo\|bar`,
    fileGlob: '**/__tests__/**',
    lineNumber: 1,
  }]);
});

test('rejects invalid regexes once while loading the pattern file', () => {
  assert.throws(
    () => parsePatterns('G9|BLOCK|(|Broken regex'),
    /Invalid regex at line 1/,
  );
});

test('strict mode blocks HIGH and MED findings but leaves LOW advisory', () => {
  assert.equal(getExitCode(false, { high: 1, med: 0, total: 1 }, true), 1);
  assert.equal(getExitCode(false, { high: 0, med: 1, total: 1 }, true), 1);
  assert.equal(getExitCode(false, { high: 0, med: 0, total: 313 }, true), 0);
});

test('non-strict mode reports warnings and every BLOCK remains fatal', () => {
  assert.equal(getExitCode(false, { high: 0, med: 0, total: 1 }, false), 2);
  assert.equal(getExitCode(true, { high: 0, med: 0, total: 0 }, false), 1);
  assert.equal(getExitCode(true, { high: 0, med: 0, total: 0 }, true), 1);
});
