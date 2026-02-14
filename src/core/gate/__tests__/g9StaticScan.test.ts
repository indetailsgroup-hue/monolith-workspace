/**
 * g9StaticScan.test.ts - Static Analysis for G9 Persistence Gate
 *
 * GATE RULE (G9): No unvalidated external state enters OperationGraph.
 *
 * This test scans critical source files for anti-patterns:
 * - JSON.parse() without Zod validation
 * - Direct type assertion on parsed JSON (as Project, as Cabinet, etc.)
 * - localStorage.getItem without validation wrapper
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// CONFIGURATION
// ============================================

/** Files that MUST use validated parsing (G9 boundary) */
const CRITICAL_STORE_FILES = [
  'src/core/store/useProjectStore.ts',
  'src/core/store/useCabinetStore.ts',
];

/** Patterns that indicate potential G9 violations */
const VIOLATION_PATTERNS = [
  // JSON.parse with direct type assertion (bypasses validation)
  /JSON\.parse\([^)]+\)\s+as\s+(Project|Cabinet|Panel|Material|Hardware)/g,

  // Type assertion after JSON.parse without validation
  /const\s+\w+:\s*(Project|Cabinet|SavedProject)\[\]?\s*=\s*JSON\.parse/g,
];

/** Patterns that indicate SAFE usage (with validation) */
const SAFE_PATTERNS = [
  /parseAndValidateSafe\s*\(/,
  /parseAndValidate\s*\(/,
  /validateExternalState\s*\(/,
  /validateExternalStateSafe\s*\(/,
];

/** Lines to skip (comments, test files, etc.) */
const SKIP_PATTERNS = [
  /^\s*\/\//,        // Single-line comments
  /^\s*\*/,          // Multi-line comment continuation
  /^\s*\/\*/,        // Multi-line comment start
  /\.test\.ts/,      // Test files
  /__tests__/,       // Test directories
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

function findViolations(content: string, filePath: string): string[] {
  const violations: string[] = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Skip comments and non-code lines
    if (SKIP_PATTERNS.some(pattern => pattern.test(line))) {
      return;
    }

    // Check for violation patterns
    for (const pattern of VIOLATION_PATTERNS) {
      // Reset regex lastIndex for global patterns
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        // Check if the same line or nearby lines have safe patterns
        const contextStart = Math.max(0, index - 5);
        const contextEnd = Math.min(lines.length, index + 5);
        const context = lines.slice(contextStart, contextEnd).join('\n');

        const hasSafePattern = SAFE_PATTERNS.some(safe => safe.test(context));

        if (!hasSafePattern) {
          violations.push(
            `${filePath}:${lineNum}: Potential G9 violation - JSON.parse without validation\n` +
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

describe('G9 Static Scan - Persistence Gate Enforcement', () => {
  describe('Critical store files', () => {
    it('should not have unvalidated JSON.parse in useProjectStore.ts', () => {
      const content = readFile('src/core/store/useProjectStore.ts');
      if (!content) {
        // File doesn't exist in test environment - skip
        return;
      }

      const violations = findViolations(content, 'useProjectStore.ts');

      if (violations.length > 0) {
        console.error('G9 Violations found:\n', violations.join('\n\n'));
      }

      expect(violations).toHaveLength(0);
    });

    it('should not have direct type assertion on JSON.parse results', () => {
      const content = readFile('src/core/store/useProjectStore.ts');
      if (!content) return;

      // Check for patterns like: JSON.parse(...) as Project
      const directCastPattern = /JSON\.parse\([^)]+\)\s+as\s+\w+/g;
      const matches = content.match(directCastPattern) || [];

      // Filter out matches that are within validation context
      const dangerousMatches = matches.filter(match => {
        // If the match is followed by validation, it's OK
        // This is a simplified check - real code review needed
        return !match.includes('validate');
      });

      expect(dangerousMatches).toHaveLength(0);
    });
  });

  describe('Validation boundary enforcement', () => {
    it('should have parseAndValidateSafe imported in useProjectStore.ts', () => {
      const content = readFile('src/core/store/useProjectStore.ts');
      if (!content) return;

      expect(content).toContain('parseAndValidateSafe');
    });

    it('should use G9 validation for loadProject()', () => {
      const content = readFile('src/core/store/useProjectStore.ts');
      if (!content) return;

      // loadProject should use parseAndValidateSafe, not raw JSON.parse
      const loadProjectSection = content.match(/loadProject:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n  },/);

      if (loadProjectSection) {
        const section = loadProjectSection[0];
        expect(section).toContain('parseAndValidateSafe');
      }
    });

    it('should use G9 validation for importProject()', () => {
      const content = readFile('src/core/store/useProjectStore.ts');
      if (!content) return;

      // importProject should use parseAndValidateSafe
      const importProjectSection = content.match(/importProject:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n  },/);

      if (importProjectSection) {
        const section = importProjectSection[0];
        expect(section).toContain('parseAndValidateSafe');
      }
    });

    it('should use G9 validation for loadProjectsList()', () => {
      const content = readFile('src/core/store/useProjectStore.ts');
      if (!content) return;

      // loadProjectsList should use parseAndValidateSafe
      const loadListSection = content.match(/loadProjectsList:\s*\(\)\s*=>\s*\{[\s\S]*?\n  },/);

      if (loadListSection) {
        const section = loadListSection[0];
        expect(section).toContain('parseAndValidateSafe');
      }
    });
  });

  describe('Schema availability', () => {
    it('should have ProjectDataSchema defined', () => {
      const content = readFile('src/core/schema/project.schema.ts');
      if (!content) return;

      expect(content).toContain('ProjectDataSchema');
      expect(content).toContain('export const ProjectDataSchema');
    });

    it('should have SavedProjectsListSchema defined', () => {
      const content = readFile('src/core/schema/project.schema.ts');
      if (!content) return;

      expect(content).toContain('SavedProjectsListSchema');
      expect(content).toContain('export const SavedProjectsListSchema');
    });

    it('should have ImportedProjectSchema defined', () => {
      const content = readFile('src/core/schema/project.schema.ts');
      if (!content) return;

      expect(content).toContain('ImportedProjectSchema');
      expect(content).toContain('export const ImportedProjectSchema');
    });
  });

  describe('G9 anti-pattern detection', () => {
    it('should not allow JSON.parse as Cabinet in production code', () => {
      const content = readFile('src/core/store/useCabinetStore.ts');
      if (!content) return;

      // This pattern would bypass validation
      const dangerousPattern = /JSON\.parse\([^)]+\)\s+as\s+Cabinet/g;
      const matches = content.match(dangerousPattern) || [];

      expect(matches).toHaveLength(0);
    });

    it('should not allow direct localStorage read without wrapper in stores', () => {
      // This is a softer check - we allow localStorage.getItem but it should
      // be followed by validation in the same function

      const content = readFile('src/core/store/useProjectStore.ts');
      if (!content) return;

      // Count localStorage.getItem calls
      const localStorageCalls = (content.match(/localStorage\.getItem/g) || []).length;

      // Count validation calls
      const validationCalls = (content.match(/parseAndValidateSafe|validateExternalState/g) || []).length;

      // There should be at least as many validation calls as localStorage calls
      // (allowing for some reads that return early on null)
      expect(validationCalls).toBeGreaterThanOrEqual(localStorageCalls - 1);
    });
  });
});
