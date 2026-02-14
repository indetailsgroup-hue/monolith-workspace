/**
 * suggestionToOverrides.ts - Convert Suggestions to Shadow Overrides
 *
 * PURPOSE:
 * - Extract proposed parameter changes from suggestions
 * - Convert to ShadowOverrides format for simulation
 * - Handle multiple suggestions and merge their overrides
 *
 * USAGE:
 * import { overridesFromSuggestions } from './suggestionToOverrides';
 *
 * const suggestions = getSuggestionEvents();
 * const overrides = overridesFromSuggestions(suggestions);
 * const report = await runShadowComparison({ input, trial: overrides });
 */

import type { ShadowOverrides } from './shadowOverrides';
import type { TuningSuggestionEvent, ProposedChange } from './tuningSuggestionTypes';

// ============================================
// PARAMETER MAPPING
// ============================================

/**
 * Map of suggestion parameter names to ShadowOverrides keys
 */
const PARAM_TO_OVERRIDE_KEY: Record<string, keyof ShadowOverrides> = {
  nearPaddingMm: 'nearPaddingMm',
  cellSizeMm: 'cellSizeMm',
  snapThresholdMm: 'snapThresholdMm',
  engageThresholdMm: 'engageThresholdMm',
  disengageThresholdMm: 'disengageThresholdMm',
  stickyScoreMargin: 'stickyScoreMargin',
  lookaheadMinMs: 'lookaheadMinMs',
  lookaheadMaxMs: 'lookaheadMaxMs',
  maxLookaheadMm: 'maxLookaheadMm',
  fixedStepHz: 'fixedStepHz',
};

// ============================================
// MAIN CONVERSION FUNCTION
// ============================================

/**
 * Convert suggestion events to shadow overrides
 *
 * Extracts proposed changes from suggestions and creates
 * a single ShadowOverrides object for simulation.
 *
 * @param suggestions - Array of suggestion events
 * @param priorityThreshold - Only include suggestions with priority >= threshold
 * @returns ShadowOverrides object with proposed values
 */
export function overridesFromSuggestions(
  suggestions: TuningSuggestionEvent[],
  priorityThreshold: number = 0
): ShadowOverrides {
  const overrides: ShadowOverrides = {};

  // Sort by priority (highest first)
  const sorted = [...suggestions].sort((a, b) => b.priority - a.priority);

  // Process each suggestion
  for (const suggestion of sorted) {
    // Skip low-priority suggestions
    if (suggestion.priority < priorityThreshold) continue;

    // Extract proposed changes
    const proposed = suggestion.proposed ?? {};

    for (const [paramName, change] of Object.entries(proposed)) {
      // Get the target override key
      const overrideKey = PARAM_TO_OVERRIDE_KEY[paramName];
      if (!overrideKey) continue;

      // Get the proposed value
      const proposedChange = change as ProposedChange;
      if (typeof proposedChange?.to !== 'number') continue;

      // Only set if not already set (higher priority wins)
      if (overrides[overrideKey] === undefined) {
        (overrides as any)[overrideKey] = proposedChange.to;
      }
    }
  }

  return overrides;
}

// ============================================
// SINGLE SUGGESTION CONVERSION
// ============================================

/**
 * Convert a single suggestion to overrides
 */
export function overridesFromSingleSuggestion(
  suggestion: TuningSuggestionEvent
): ShadowOverrides {
  return overridesFromSuggestions([suggestion]);
}

// ============================================
// EXTRACT WITH METADATA
// ============================================

export interface OverrideExtraction {
  overrides: ShadowOverrides;
  sources: Array<{
    suggestionCode: string;
    paramName: string;
    from: number;
    to: number;
    confidence: number;
  }>;
}

/**
 * Extract overrides with source tracking
 *
 * Useful for debugging and explaining where override values came from.
 */
export function extractOverridesWithSources(
  suggestions: TuningSuggestionEvent[]
): OverrideExtraction {
  const overrides: ShadowOverrides = {};
  const sources: OverrideExtraction['sources'] = [];

  const sorted = [...suggestions].sort((a, b) => b.priority - a.priority);

  for (const suggestion of sorted) {
    const proposed = suggestion.proposed ?? {};

    for (const [paramName, change] of Object.entries(proposed)) {
      const overrideKey = PARAM_TO_OVERRIDE_KEY[paramName];
      if (!overrideKey) continue;

      const proposedChange = change as ProposedChange;
      if (typeof proposedChange?.to !== 'number') continue;

      if (overrides[overrideKey] === undefined) {
        (overrides as any)[overrideKey] = proposedChange.to;

        sources.push({
          suggestionCode: suggestion.code,
          paramName,
          from: proposedChange.from,
          to: proposedChange.to,
          confidence: suggestion.confidence,
        });
      }
    }
  }

  return { overrides, sources };
}

// ============================================
// FILTER SUGGESTIONS FOR SIMULATION
// ============================================

/**
 * Filter suggestions suitable for shadow simulation
 *
 * Only includes suggestions that affect simulatable parameters.
 */
export function filterSimulatableSuggestions(
  suggestions: TuningSuggestionEvent[]
): TuningSuggestionEvent[] {
  return suggestions.filter(suggestion => {
    const proposed = suggestion.proposed ?? {};

    for (const paramName of Object.keys(proposed)) {
      if (PARAM_TO_OVERRIDE_KEY[paramName]) {
        return true;
      }
    }

    return false;
  });
}

// ============================================
// SUMMARY HELPERS
// ============================================

/**
 * Get summary of what overrides will change
 */
export function summarizeOverrides(overrides: ShadowOverrides): string[] {
  const lines: string[] = [];

  if (overrides.nearPaddingMm !== undefined) {
    lines.push(`nearPaddingMm: ${overrides.nearPaddingMm}mm`);
  }
  if (overrides.cellSizeMm !== undefined) {
    lines.push(`cellSizeMm: ${overrides.cellSizeMm}mm`);
  }
  if (overrides.snapThresholdMm !== undefined) {
    lines.push(`snapThresholdMm: ${overrides.snapThresholdMm}mm`);
  }
  if (overrides.stickyScoreMargin !== undefined) {
    lines.push(`stickyScoreMargin: ${overrides.stickyScoreMargin}`);
  }
  if (overrides.fixedStepHz !== undefined) {
    lines.push(`fixedStepHz: ${overrides.fixedStepHz}Hz`);
  }
  if (overrides.lookaheadMaxMs !== undefined) {
    lines.push(`lookaheadMaxMs: ${overrides.lookaheadMaxMs}ms`);
  }
  if (overrides.maxLookaheadMm !== undefined) {
    lines.push(`maxLookaheadMm: ${overrides.maxLookaheadMm}mm`);
  }

  return lines;
}

/**
 * Check if overrides object is empty
 */
export function hasSimulatableOverrides(overrides: ShadowOverrides): boolean {
  return Object.values(overrides).some(v => v !== undefined);
}
