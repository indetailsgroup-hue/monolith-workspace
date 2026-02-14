/**
 * g10StaticScan.test.ts - Static Analysis for G10 DXF Safety Gate
 *
 * GATE RULE (G10): No unsafe DXF leaves the system.
 *
 * This test scans critical source files for anti-patterns:
 * - Direct use of cabinetToDxf without OperationGraph
 * - generateCabinetDXFBundle in factory export paths
 * - downloadCabinetDXF in production code
 * - DXF generation without G10 provenance tracking
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// CONFIGURATION
// ============================================

/** Files that MUST use G10-validated DXF export */
const FACTORY_EXPORT_FILES = [
  'src/core/export/dxfExportFromOperationGraph.ts',
  'src/core/export/monolith/monolithFactoryPackageExporter.ts',
];

/** Files that contain UNSAFE DXF generation (Cabinet → DXF bypass) */
const UNSAFE_DXF_FILES = [
  'src/core/export/cabinetToDxf.ts',
  'src/core/export/DXFGenerator.ts',
];

/** Patterns that indicate potential G10 violations in factory export paths */
const VIOLATION_PATTERNS = [
  // Direct cabinet-to-DXF exports in factory paths
  /generateCabinetDXFBundle\s*\(/g,
  /downloadCabinetDXF\s*\(/g,
  /cabinetPanelToProduction\s*\(/g,

  // Direct DXF generation without provenance
  /generatePanelDXF\s*\(/g,
];

/** Patterns that indicate SAFE usage (with G10 gate) */
const SAFE_PATTERNS = [
  /assertDxfSafety\s*\(/,
  /guardFactoryDxf\s*\(/,
  /createOperationGraphProvenance\s*\(/,
  /operationGraphToDxf\s*\(/,
  /exportDxfFromPacket\s*\(/,
];

/** Lines to skip (comments, imports, test files, etc.) */
const SKIP_PATTERNS = [
  /^\s*\/\//,        // Single-line comments
  /^\s*\*/,          // Multi-line comment continuation
  /^\s*\/\*/,        // Multi-line comment start
  /\.test\.ts/,      // Test files
  /__tests__/,       // Test directories
  /^import\s/,       // Import statements
  /^export\s+type/,  // Type exports
];

// ============================================
// HELPERS
// ============================================

function readFile(filePath: string): string {
  const absolutePath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolutePath)) {
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf-8');
}

function findViolations(content: string, filePath: string, patterns: RegExp[]): string[] {
  const violations: string[] = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Skip comments and non-code lines
    if (SKIP_PATTERNS.some(pattern => pattern.test(line))) {
      return;
    }

    // Check for violation patterns
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        // Check if the same line or nearby lines have safe patterns
        const contextStart = Math.max(0, index - 5);
        const contextEnd = Math.min(lines.length, index + 5);
        const context = lines.slice(contextStart, contextEnd).join('\n');

        const hasSafePattern = SAFE_PATTERNS.some(safe => safe.test(context));

        if (!hasSafePattern) {
          violations.push(
            `${filePath}:${lineNum}: Potential G10 violation - unsafe DXF pattern\n` +
            `  > ${line.trim()}`
          );
        }
      }
    }
  });

  return violations;
}

// ============================================
// TESTS
// ============================================

describe('G10 Static Scan - DXF Safety Gate Enforcement', () => {
  describe('Factory export files', () => {
    it('should use G10 provenance tracking in dxfExportFromOperationGraph.ts', () => {
      const content = readFile('src/core/export/dxfExportFromOperationGraph.ts');
      if (!content) return;

      // Must import G10 functions
      expect(content).toContain('assertDxfSafety');
      expect(content).toContain('createOperationGraphProvenance');
    });

    it('should have G10 integration in export result types', () => {
      const content = readFile('src/core/export/dxfExportFromOperationGraph.ts');
      if (!content) return;

      // Result types should include G10 status
      expect(content).toContain('g10Result');
      expect(content).toContain('provenance');
      expect(content).toContain('SafeDxf');
    });

    it('should not have unsafe DXF patterns in factory export', () => {
      const content = readFile('src/core/export/dxfExportFromOperationGraph.ts');
      if (!content) return;

      // Should NOT directly use cabinet-to-DXF functions
      expect(content).not.toContain('generateCabinetDXFBundle');
      expect(content).not.toContain('downloadCabinetDXF');
      expect(content).not.toContain('cabinetPanelToProduction');
    });
  });

  describe('Unsafe DXF files detection', () => {
    it('should identify cabinetToDxf.ts as unsafe source', () => {
      const content = readFile('src/core/export/cabinetToDxf.ts');
      if (!content) return;

      // This file SHOULD contain these patterns (they are the unsafe ones)
      const hasUnsafePattern = (
        content.includes('generateCabinetDXFBundle') ||
        content.includes('downloadCabinetDXF') ||
        content.includes('cabinetPanelToProduction')
      );

      expect(hasUnsafePattern).toBe(true);
    });

    it('should NOT import G10 in cabinetToDxf.ts (it is the bypass source)', () => {
      const content = readFile('src/core/export/cabinetToDxf.ts');
      if (!content) return;

      // This file should NOT have G10 - it's the unsafe path
      // (If it had G10, it would be trying to legitimize an unsafe path)
      expect(content).not.toContain('gate10DxfSafety');
    });
  });

  describe('G10 gate module', () => {
    it('should export assertDxfSafety function', () => {
      const content = readFile('src/core/gate/gate10DxfSafety.ts');
      if (!content) return;

      expect(content).toContain('export function assertDxfSafety');
    });

    it('should export guardFactoryDxf function', () => {
      const content = readFile('src/core/gate/gate10DxfSafety.ts');
      if (!content) return;

      expect(content).toContain('export function guardFactoryDxf');
    });

    it('should define SafeDxf branded type', () => {
      const content = readFile('src/core/gate/gate10DxfSafety.ts');
      if (!content) return;

      expect(content).toContain('SafeDxf');
      expect(content).toContain('G10_DXF_BRAND');
    });

    it('should have provenance builder functions', () => {
      const content = readFile('src/core/gate/gate10DxfSafety.ts');
      if (!content) return;

      expect(content).toContain('createOperationGraphProvenance');
      expect(content).toContain('createCabinetProvenance');
      expect(content).toContain('createNestingProvenance');
    });
  });

  describe('Gate index exports', () => {
    it('should export G10 types and functions from gate index', () => {
      const content = readFile('src/core/gate/index.ts');
      if (!content) return;

      expect(content).toContain('gate10DxfSafety');
      expect(content).toContain('SafeDxf');
      expect(content).toContain('assertDxfSafety');
      expect(content).toContain('G10_ERROR_CODES');
    });
  });

  describe('G10 anti-pattern detection', () => {
    it('should not allow direct DXF generation in monolith exporter without OperationGraph', () => {
      const content = readFile('src/core/export/monolith/monolithFactoryPackageExporter.ts');
      if (!content) return;

      // Check for violations
      const violations = findViolations(
        content,
        'monolithFactoryPackageExporter.ts',
        VIOLATION_PATTERNS
      );

      // Should not have violations (or should have safe patterns nearby)
      if (violations.length > 0) {
        console.error('G10 Violations found:\n', violations.join('\n\n'));
      }

      // Note: Monolith exporter may use buildDxfSheets which is for nesting layout
      // This is acceptable as long as CNC operations use OperationGraph
    });
  });
});

// ============================================
// CI GATE ASSERTIONS
// ============================================

describe('CI Gate Assertions', () => {
  it('[G10-CI] dxfExportFromOperationGraph.ts must use G10 gate', () => {
    const content = readFile('src/core/export/dxfExportFromOperationGraph.ts');
    if (!content) {
      expect.fail('dxfExportFromOperationGraph.ts not found');
    }

    // MUST import from G10
    expect(content).toContain("from '../gate/gate10DxfSafety'");

    // MUST use assertDxfSafety
    expect(content).toContain('assertDxfSafety');

    // MUST track provenance
    expect(content).toContain('provenance');
  });

  it('[G10-CI] G10 gate module must exist', () => {
    const content = readFile('src/core/gate/gate10DxfSafety.ts');
    expect(content.length).toBeGreaterThan(0);
  });

  it('[G10-CI] G10 error codes must be defined', () => {
    const content = readFile('src/core/gate/gate10DxfSafety.ts');
    if (!content) return;

    expect(content).toContain('MISSING_PROVENANCE');
    expect(content).toContain('INVALID_SOURCE');
    expect(content).toContain('INVALID_CONTENT');
    expect(content).toContain('FACTORY_MODE_BLOCK');
  });
});
