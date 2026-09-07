#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * bypass-scan.ts - CI Bypass Pattern Scanner
 *
 * Scans codebase for forbidden patterns that bypass safety gates.
 * Reads patterns from .claude/gates/ci-bypass-patterns.txt
 *
 * Exit codes:
 *   0 = PASS (no BLOCK matches)
 *   1 = FAIL (BLOCK matches found, or --strict with HIGH/MED warnings)
 *   2 = WARN only (warnings found but no blocks)
 *
 * WARN Severity Levels:
 *   WARN-HIGH = Likely gate bypass, needs immediate attention
 *   WARN-MED  = Quality issue, fix before release
 *   WARN-LOW  = Code hygiene, fix when convenient
 *
 * Usage:
 *   npm run gate:bypass-scan              # Full scan
 *   npm run gate:bypass-scan:strict       # Fail on BLOCK/HIGH/MED findings
 *   npm run gate:bypass-scan -- --gate G10
 *   npm run gate:bypass-scan -- --gate G9 --scope
 *   npm run gate:bypass-scan:json
 *   npm run gate:bypass-scan -- -v
 *
 * @version 1.1.0
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// TYPES
// ============================================

type Severity = 'BLOCK' | 'WARN-HIGH' | 'WARN-MED' | 'WARN-LOW';

interface Pattern {
  gate: string;
  severity: Severity;
  regex: string;
  description: string;
  lineNumber: number;
  compiledRegex: RegExp;
}

interface Exception {
  pattern: string;
  fileGlob: string;
  lineNumber: number;
}

interface Match {
  file: string;
  line: number;
  content: string;
  pattern: Pattern;
}

interface WarnCounts {
  high: number;
  med: number;
  low: number;
  total: number;
}

interface ScanResult {
  passed: boolean;
  blocked: boolean;
  blockCount: number;
  warnCounts: WarnCounts;
  matches: Match[];
  patternsLoaded: number;
  filesScanned: number;
  duration: number;
  strict: boolean;
}

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  patternsFile: '.claude/gates/ci-bypass-patterns.txt',
  scanDirs: ['src'],
  fileExtensions: ['ts', 'tsx'],
  excludeDirs: ['node_modules', 'dist', '.git', 'coverage', '__tests__', 'test', 'tests', 'testkit'],
  excludeFileSuffixes: ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.stories.ts', '.stories.tsx'],
};

/**
 * Gate-specific path scopes for focused scanning.
 * When --scope is used, only these paths are scanned.
 */
const GATE_SCOPES: Record<string, string[]> = {
  'G9': [
    'src/core/store',
    'src/core/persistence',
    'src/factory/packet',
    'src/factory/state',
    'src/release/policy',
    'src/runtime',
  ],
  'G10': [
    'src/core/export',
    'src/core/gate',
    'src/cnc',
  ],
  'G10.1': [
    'src/core/export/dxf',
    'src/core/gate',
  ],
  'G10.2': [
    'src/core/export',
    'src/core/gate',
  ],
  'G10.3': [
    'src/core/export',
    'src/core/gate',
    'src/cnc',
  ],
};

/**
 * Patterns that only make sense inside a specific safety domain. Keeping these
 * scoped prevents unrelated UI formatting and general TypeScript code from
 * being mislabeled as a CNC or persistence-gate bypass.
 */
const PATTERN_SCOPES: Record<string, string[]> = {
  ':\\s*any\\s*[;,})]': GATE_SCOPES.G9,
  '\\.toFixed\\([0-3]\\)': GATE_SCOPES['G10.1'],
  'as\\s+unknown\\s+as\\s+': GATE_SCOPES.G9,
};

// ============================================
// PATTERN PARSING
// ============================================

function parsePatternLine(line: string, lineNumber: number): Pattern {
  const firstSeparator = line.indexOf('|');
  const secondSeparator = line.indexOf('|', firstSeparator + 1);
  const lastSeparator = line.lastIndexOf('|');

  if (
    firstSeparator <= 0 ||
    secondSeparator <= firstSeparator + 1 ||
    lastSeparator <= secondSeparator + 1
  ) {
    throw new Error(`Malformed bypass pattern at line ${lineNumber}`);
  }

  const gate = line.slice(0, firstSeparator);
  const rawSeverity = line.slice(firstSeparator + 1, secondSeparator);
  const regex = line.slice(secondSeparator + 1, lastSeparator);
  const description = line.slice(lastSeparator + 1);
  const normalizedSeverity = rawSeverity === 'WARN' ? 'WARN-MED' : rawSeverity as Severity;
  const validSeverities: Severity[] = ['BLOCK', 'WARN-HIGH', 'WARN-MED', 'WARN-LOW'];

  if (!validSeverities.includes(normalizedSeverity)) {
    throw new Error(`Invalid severity "${rawSeverity}" at line ${lineNumber}`);
  }

  let compiledRegex: RegExp;
  try {
    compiledRegex = new RegExp(regex, 'g');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid regex at line ${lineNumber}: ${regex} (${reason})`);
  }

  return {
    gate,
    severity: normalizedSeverity,
    regex,
    description,
    lineNumber,
    compiledRegex,
  };
}

function parseExceptionLine(line: string, lineNumber: number): Exception {
  const prefix = 'EXCEPT|';
  const lastSeparator = line.lastIndexOf('|');

  if (lastSeparator <= prefix.length) {
    throw new Error(`Malformed bypass exception at line ${lineNumber}`);
  }

  return {
    pattern: line.slice(prefix.length, lastSeparator),
    fileGlob: line.slice(lastSeparator + 1),
    lineNumber,
  };
}

export function parsePatterns(content: string): { patterns: Pattern[]; exceptions: Exception[] } {
  const patterns: Pattern[] = [];
  const exceptions: Exception[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNumber = i + 1;

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;

    // Parse exception
    if (line.startsWith('EXCEPT|')) {
      exceptions.push(parseExceptionLine(line, lineNumber));
      continue;
    }

    // Parse pattern
    patterns.push(parsePatternLine(line, lineNumber));
  }

  return { patterns, exceptions };
}

// ============================================
// FILE SCANNING
// ============================================

function walkDir(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip excluded directories
    if (entry.isDirectory()) {
      if (CONFIG.excludeDirs.includes(entry.name)) continue;
      walkDir(fullPath, files);
    } else if (entry.isFile()) {
      if (CONFIG.excludeFileSuffixes.some((suffix) => entry.name.endsWith(suffix))) {
        continue;
      }
      // Check file extension
      const ext = path.extname(entry.name).slice(1);
      if (CONFIG.fileExtensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function isPatternInScope(file: string, pattern: Pattern): boolean {
  const scopes = PATTERN_SCOPES[pattern.regex];
  if (!scopes) return true;

  const normalizedFile = file.replace(/\\/g, '/');
  return scopes.some((scope) => (
    normalizedFile === scope || normalizedFile.startsWith(`${scope}/`)
  ));
}

function isCommentOnlyLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
}

/**
 * Get list of directories to scan based on gate scope.
 * @param gateFilter - The gate to filter by (e.g., 'G9', 'G10')
 * @param useScope - Whether to use gate-specific scopes
 */
function getScanDirs(gateFilter?: string, useScope?: boolean): string[] {
  if (!useScope || !gateFilter) {
    return CONFIG.scanDirs;
  }

  const scopeDirs = GATE_SCOPES[gateFilter];
  if (scopeDirs && scopeDirs.length > 0) {
    return scopeDirs;
  }

  // Fallback to default if gate not found
  return CONFIG.scanDirs;
}

function getFilesToScan(scanDirs?: string[]): string[] {
  const files: string[] = [];
  const dirs = scanDirs || CONFIG.scanDirs;

  for (const dir of dirs) {
    walkDir(dir, files);
  }

  return files;
}

function isExcepted(file: string, pattern: Pattern, exceptions: Exception[]): boolean {
  const normalizedFile = file.replace(/\\/g, '/');

  for (const exc of exceptions) {
    // Check if pattern matches (partial match for flexibility)
    // NOTE: Do NOT normalize exc.pattern - it contains regex escapes like \.
    const patternMatches = pattern.regex.includes(exc.pattern) || exc.pattern === pattern.regex;

    if (!patternMatches) {
      continue;
    }

    // Check if file matches glob
    // Convert glob pattern to regex: ** = any path, * = any file segment
    const globRegex = exc.fileGlob
      .replace(/\\/g, '/')      // Normalize slashes
      .replace(/\./g, '\\.')    // Escape dots
      .replace(/\*\*/g, '___DOUBLESTAR___')  // Placeholder
      .replace(/\*/g, '[^/]*')  // Single star = anything except slash
      .replace(/___DOUBLESTAR___/g, '.*');   // Double star = anything

    const regex = new RegExp(globRegex);
    if (regex.test(normalizedFile)) {
      return true;
    }
  }

  return false;
}

function scanFile(
  file: string,
  patterns: Pattern[],
  exceptions: Exception[],
  gateFilter?: string
): Match[] {
  const matches: Match[] = [];
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');

  for (const pattern of patterns) {
    // Skip if gate filter doesn't match
    if (gateFilter && pattern.gate !== gateFilter && pattern.gate !== 'ALL') {
      continue;
    }

    if (!isPatternInScope(file, pattern)) {
      continue;
    }

    // Skip if file is excepted
    if (isExcepted(file, pattern, exceptions)) {
      continue;
    }

    const regex = pattern.compiledRegex;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCommentOnlyLine(line)) continue;
      if (regex.test(line)) {
        matches.push({
          file,
          line: i + 1,
          content: line.trim().substring(0, 100),
          pattern,
        });
      }
      // Reset regex lastIndex for next line
      regex.lastIndex = 0;
    }
  }

  return matches;
}

// ============================================
// REPORTING
// ============================================

export function getExitCode(
  blocked: boolean,
  warnCounts: Pick<WarnCounts, 'high' | 'med' | 'total'>,
  strict: boolean,
): number {
  if (blocked || (strict && warnCounts.high + warnCounts.med > 0)) return 1;
  if (strict) return 0;
  return warnCounts.total > 0 ? 2 : 0;
}

function formatReport(result: ScanResult, verbose: boolean): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  GATE BYPASS SCAN REPORT');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  // Summary
  const strictFailure = result.strict && result.warnCounts.high + result.warnCounts.med > 0;
  const status = result.blocked || strictFailure ? '❌ FAIL' : result.warnCounts.total > 0 ? '⚠️ WARN' : '✅ PASS';
  lines.push(`Status: ${status}`);
  lines.push(`Patterns loaded: ${result.patternsLoaded}`);
  lines.push(`Files scanned: ${result.filesScanned}`);
  lines.push(`Duration: ${result.duration}ms`);
  lines.push('');

  if (result.blockCount > 0) {
    lines.push(`🛑 BLOCK matches: ${result.blockCount}`);
  }
  if (result.warnCounts.total > 0) {
    lines.push(`⚠️  WARN matches: ${result.warnCounts.total}`);
    lines.push(`    HIGH: ${result.warnCounts.high} | MED: ${result.warnCounts.med} | LOW: ${result.warnCounts.low}`);
  }

  if (result.matches.length === 0) {
    lines.push('');
    lines.push('No forbidden patterns found. ✅');
  } else {
    lines.push('');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('MATCHES:');
    lines.push('───────────────────────────────────────────────────────────────');

    // Group by severity
    const blocks = result.matches.filter(m => m.pattern.severity === 'BLOCK');
    const warnHigh = result.matches.filter(m => m.pattern.severity === 'WARN-HIGH');
    const warnMed = result.matches.filter(m => m.pattern.severity === 'WARN-MED');
    const warnLow = result.matches.filter(m => m.pattern.severity === 'WARN-LOW');

    // Helper to format matches
    const formatMatches = (matches: Match[], header: string) => {
      if (matches.length === 0) return;
      lines.push('');
      lines.push(header);
      for (const match of matches) {
        lines.push(`  ${match.file}:${match.line}`);
        lines.push(`    Pattern: ${match.pattern.regex}`);
        lines.push(`    Gate: ${match.pattern.gate}`);
        lines.push(`    Reason: ${match.pattern.description}`);
        if (verbose) {
          lines.push(`    Content: ${match.content}`);
        }
        lines.push('');
      }
    };

    formatMatches(blocks, '🛑 BLOCK (must fix):');
    formatMatches(warnHigh, '🔴 WARN-HIGH (likely bypass, fix immediately):');
    formatMatches(warnMed, '🟡 WARN-MED (quality issue, fix before release):');
    formatMatches(warnLow, '🟢 WARN-LOW (code hygiene, fix when convenient):');
  }

  lines.push('───────────────────────────────────────────────────────────────');
  const exitCode = getExitCode(result.blocked, result.warnCounts, result.strict);
  lines.push(`Exit code: ${exitCode}`);
  lines.push('');

  return lines.join('\n');
}

function formatJson(result: ScanResult): string {
  const strictFailure = result.strict && result.warnCounts.high + result.warnCounts.med > 0;
  return JSON.stringify({
    status: result.blocked || strictFailure ? 'FAIL' : result.warnCounts.total > 0 ? 'WARN' : 'PASS',
    blocked: result.blocked,
    blockCount: result.blockCount,
    warnCounts: result.warnCounts,
    patternsLoaded: result.patternsLoaded,
    filesScanned: result.filesScanned,
    duration: result.duration,
    strict: result.strict,
    matches: result.matches.map(m => ({
      file: m.file,
      line: m.line,
      content: m.content,
      gate: m.pattern.gate,
      severity: m.pattern.severity,
      pattern: m.pattern.regex,
      description: m.pattern.description,
    })),
  }, null, 2);
}

// ============================================
// MAIN
// ============================================

export function main(): number {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const json = args.includes('--json');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const useScope = args.includes('--scope');
  const gateIndex = args.indexOf('--gate');
  const gateFilter = gateIndex >= 0 ? args[gateIndex + 1] : undefined;

  const startTime = Date.now();

  // Load patterns
  const patternsPath = path.resolve(process.cwd(), CONFIG.patternsFile);
  if (!fs.existsSync(patternsPath)) {
    console.error(`Patterns file not found: ${patternsPath}`);
    return 1;
  }

  const patternsContent = fs.readFileSync(patternsPath, 'utf-8');
  let parsed: ReturnType<typeof parsePatterns>;
  try {
    parsed = parsePatterns(patternsContent);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Failed to load bypass patterns: ${reason}`);
    return 1;
  }
  const { patterns, exceptions } = parsed;

  // Get files to scan (optionally scoped to gate-specific paths)
  const scanDirs = getScanDirs(gateFilter, useScope);
  const files = getFilesToScan(scanDirs);

  // Scan files
  const allMatches: Match[] = [];
  for (const file of files) {
    const matches = scanFile(file, patterns, exceptions, gateFilter);
    allMatches.push(...matches);
  }

  // Calculate result
  const blockMatches = allMatches.filter(m => m.pattern.severity === 'BLOCK');
  const warnHighMatches = allMatches.filter(m => m.pattern.severity === 'WARN-HIGH');
  const warnMedMatches = allMatches.filter(m => m.pattern.severity === 'WARN-MED');
  const warnLowMatches = allMatches.filter(m => m.pattern.severity === 'WARN-LOW');
  const totalWarnMatches = warnHighMatches.length + warnMedMatches.length + warnLowMatches.length;

  const result: ScanResult = {
    passed: blockMatches.length === 0 && (!strict || warnHighMatches.length + warnMedMatches.length === 0),
    blocked: blockMatches.length > 0,
    blockCount: blockMatches.length,
    warnCounts: {
      high: warnHighMatches.length,
      med: warnMedMatches.length,
      low: warnLowMatches.length,
      total: totalWarnMatches,
    },
    matches: allMatches,
    patternsLoaded: patterns.length,
    filesScanned: files.length,
    duration: Date.now() - startTime,
    strict,
  };

  // Output
  if (json) {
    console.log(formatJson(result));
  } else {
    console.log(formatReport(result, verbose));
  }

  // Exit code
  return getExitCode(result.blocked, result.warnCounts, strict);
}

// Run
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  // Do not call process.exit() here: large JSON reports may still be buffered
  // and would be truncated before stdout has finished flushing.
  process.exitCode = main();
}
