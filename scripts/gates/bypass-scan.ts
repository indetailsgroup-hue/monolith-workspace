#!/usr/bin/env npx ts-node
/**
 * bypass-scan.ts - CI Bypass Pattern Scanner
 *
 * Scans codebase for forbidden patterns that bypass safety gates.
 * Reads patterns from .claude/gates/ci-bypass-patterns.txt
 *
 * Exit codes:
 *   0 = PASS (no BLOCK matches)
 *   1 = FAIL (BLOCK matches found, or --strict with any WARN)
 *   2 = WARN only (warnings found but no blocks)
 *
 * WARN Severity Levels:
 *   WARN-HIGH = Likely gate bypass, needs immediate attention
 *   WARN-MED  = Quality issue, fix before release
 *   WARN-LOW  = Code hygiene, fix when convenient
 *
 * Usage:
 *   npx ts-node scripts/gates/bypass-scan.ts              # Full scan
 *   npx ts-node scripts/gates/bypass-scan.ts --strict     # Fail on any WARN
 *   npx ts-node scripts/gates/bypass-scan.ts --gate G10   # Filter by gate
 *   npx ts-node scripts/gates/bypass-scan.ts --gate G9 --scope   # Focused scan
 *   npx ts-node scripts/gates/bypass-scan.ts --json       # JSON output
 *   npx ts-node scripts/gates/bypass-scan.ts -v           # Verbose output
 *
 * @version 1.1.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

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
}

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  patternsFile: '.claude/gates/ci-bypass-patterns.txt',
  scanDirs: ['src'],
  fileExtensions: ['ts', 'tsx'],
  excludeDirs: ['node_modules', 'dist', '.git', 'coverage'],
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
};

// ============================================
// PATTERN PARSING
// ============================================

function parsePatterns(content: string): { patterns: Pattern[]; exceptions: Exception[] } {
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
      const parts = line.split('|');
      if (parts.length >= 3) {
        exceptions.push({
          pattern: parts[1],
          fileGlob: parts[2],
          lineNumber,
        });
      }
      continue;
    }

    // Parse pattern
    const parts = line.split('|');
    if (parts.length >= 4) {
      const [gate, severity, regex, description] = parts;
      // Support both old WARN and new WARN-HIGH/MED/LOW
      const validSeverities: Severity[] = ['BLOCK', 'WARN-HIGH', 'WARN-MED', 'WARN-LOW'];
      const normalizedSeverity = severity === 'WARN' ? 'WARN-MED' : severity as Severity;
      if (validSeverities.includes(normalizedSeverity)) {
        patterns.push({
          gate,
          severity: normalizedSeverity,
          regex,
          description,
          lineNumber,
        });
      }
    }
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
      // Check file extension
      const ext = path.extname(entry.name).slice(1);
      if (CONFIG.fileExtensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
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
    let globRegex = exc.fileGlob
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

    // Skip if file is excepted
    if (isExcepted(file, pattern, exceptions)) {
      continue;
    }

    try {
      const regex = new RegExp(pattern.regex, 'g');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
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
    } catch (e) {
      console.error(`Invalid regex: ${pattern.regex}`);
    }
  }

  return matches;
}

// ============================================
// REPORTING
// ============================================

function formatReport(result: ScanResult, verbose: boolean): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  GATE BYPASS SCAN REPORT');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  // Summary
  const status = result.blocked ? '❌ FAIL' : result.warnCounts.total > 0 ? '⚠️ WARN' : '✅ PASS';
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
  lines.push(`Exit code: ${result.blocked ? 1 : result.warnCounts.total > 0 ? 2 : 0}`);
  lines.push('');

  return lines.join('\n');
}

function formatJson(result: ScanResult): string {
  return JSON.stringify({
    status: result.blocked ? 'FAIL' : result.warnCounts.total > 0 ? 'WARN' : 'PASS',
    blocked: result.blocked,
    blockCount: result.blockCount,
    warnCounts: result.warnCounts,
    patternsLoaded: result.patternsLoaded,
    filesScanned: result.filesScanned,
    duration: result.duration,
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

function main(): number {
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
  const { patterns, exceptions } = parsePatterns(patternsContent);

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
    passed: blockMatches.length === 0 && (!strict || totalWarnMatches === 0),
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
  };

  // Output
  if (json) {
    console.log(formatJson(result));
  } else {
    console.log(formatReport(result, verbose));
  }

  // Exit code
  if (result.blocked) {
    return 1;
  }
  if (strict && result.warnCounts.total > 0) {
    return 1;
  }
  if (result.warnCounts.total > 0) {
    return 2;
  }
  return 0;
}

// Run
const exitCode = main();
process.exit(exitCode);
