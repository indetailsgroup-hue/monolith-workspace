/**
 * Deterministic ID Generator for Gate Issues
 *
 * @module gate/utils/idGen
 * @version 0.1.0
 *
 * Creates stable, reproducible IDs for gate validation issues.
 * Deterministic IDs are crucial for:
 * - Comparing gate reports across runs
 * - Tracking issue resolution over time
 * - Deduplicating repeated issues
 *
 * ## ID Formats
 * - Deterministic: `issue_a1b2c3d4` (FNV-1a hash of code + context)
 * - Sequential: `issue_code_0001` (counter-based, reset per run)
 *
 * @example
 * // Same inputs always produce same ID
 * issueId('B_DRILL_DEPTH', 'op-123', 15.5);  // issue_8f2a4b6c
 * issueId('B_DRILL_DEPTH', 'op-123', 15.5);  // issue_8f2a4b6c (same!)
 */

/**
 * FNV-1a hash algorithm for deterministic ID generation.
 *
 * FNV-1a is a non-cryptographic hash that's fast and produces
 * well-distributed values. Used instead of random UUIDs to ensure
 * the same issue always gets the same ID.
 *
 * @param input - String to hash
 * @returns 32-bit unsigned integer hash
 *
 * @internal
 */
function fnv1a(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0; // unsigned 32-bit
}

/**
 * Creates a deterministic issue ID from rule code and context values.
 *
 * The ID is based on a hash of all input values, ensuring the same
 * issue (same code, same location, same values) always gets the same ID.
 *
 * @param code - Issue code (e.g., 'B_DRILL_DEPTH', 'W_PREMILL_GT_EDGE')
 * @param contextParts - Additional context values for uniqueness
 * @returns Deterministic ID in format `issue_XXXXXXXX`
 *
 * @example
 * // Drill depth issue for operation 'op-123' at depth 15.5mm
 * const id = issueId('B_DRILL_DEPTH', 'op-123', 15.5);
 * // Returns: 'issue_8f2a4b6c'
 *
 * @example
 * // Margin issue at coordinates (5, 10) on part 'panel-1'
 * const id = issueId('B_MIN_MARGIN_DRILL', 'panel-1', 5, 10);
 *
 * @see {@link nextIssueId} for non-deterministic sequential IDs
 */
export function issueId(code: string, ...contextParts: (string | number)[]): string {
  const input = [code, ...contextParts].join('|');
  const hash = fnv1a(input).toString(16).padStart(8, '0');
  return `issue_${hash}`;
}

/** Counter for sequential IDs within a gate run */
let runCounter = 0;

/**
 * Resets the sequential issue counter.
 *
 * Call this at the start of each gate validation run to ensure
 * sequential IDs start from 1.
 *
 * @example
 * function runGateValidation(input: GateInput) {
 *   resetIssueCounter(); // Start fresh
 *   const issues = validateAll(input);
 *   return issues;
 * }
 *
 * @see {@link nextIssueId} for generating sequential IDs
 */
export function resetIssueCounter(): void {
  runCounter = 0;
}

/**
 * Generates a sequential issue ID.
 *
 * Use this when deterministic hashing isn't needed (e.g., aggregate
 * summary issues, informational notes). IDs are unique within a
 * single gate run.
 *
 * @param code - Issue code prefix
 * @returns Sequential ID in format `issue_code_XXXX`
 *
 * @example
 * resetIssueCounter();
 * nextIssueId('INFO'); // 'issue_info_0001'
 * nextIssueId('INFO'); // 'issue_info_0002'
 * nextIssueId('WARN'); // 'issue_warn_0003'
 *
 * @see {@link resetIssueCounter} to reset between runs
 * @see {@link issueId} for deterministic IDs
 */
export function nextIssueId(code: string): string {
  runCounter++;
  return `issue_${code.toLowerCase()}_${String(runCounter).padStart(4, '0')}`;
}
