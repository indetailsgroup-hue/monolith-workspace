/**
 * commands/index.ts - P14B Command System Module
 *
 * Exports the command registry and gate fix commands.
 *
 * USAGE:
 * ```ts
 * import { commandRegistry, gateFixCommands, registerCommands } from '@/core/commands';
 *
 * // Register all gate fix commands at app startup
 * registerCommands(gateFixCommands);
 *
 * // Execute a fix command
 * const result = await commandRegistry.execute('cmd:reduce_drill_depth', {
 *   featureId: 'drill_0',
 *   params: { currentDepth: 20, coreThickness: 18 },
 *   getState: () => store.getState(),
 *   setState: store.setState,
 * });
 * ```
 *
 * @version 0.14.5 (P14B)
 */

// ============================================================================
// Types
// ============================================================================

export type {
  CommandId,
  GateFixCommandId,
  CommandContext,
  CommandExecutionContext,
  CommandResult,
  CommandDef,
  CommandRegistry,
  GateIssueWithFix,
  FixSuggestion,
  GetFixSuggestions,
} from './types';

// ============================================================================
// Registry
// ============================================================================

export {
  commandRegistry,
  defineCommand,
  registerCommands,
  createNumericFixCommand,
  createMoveFeatureCommand,
} from './commandRegistry';

// ============================================================================
// Gate Fix Commands
// ============================================================================

export {
  // Individual commands
  adjustPanelDimensions,
  recalculateCutSize,
  increasePanelWidth,
  increasePanelHeight,
  reducePanelWidth,
  reducePanelHeight,
  adjustPremill,
  reduceDrillDepth,
  convertToThroughHole,
  moveHoleFromEdge,
  moveHoleInside,
  reducePocketDepth,
  movePocketInside,
  reduceGrooveDepth,

  // All commands array
  gateFixCommands,

  // Lookup helpers
  gateFixCommandMap,
  getGateFixCommand,
  isGateFixCommandId,
} from './gateFixCommands';

// ============================================================================
// Initialization Helper
// ============================================================================

import { commandRegistry, registerCommands } from './commandRegistry';
import { gateFixCommands } from './gateFixCommands';

/**
 * Initialize the command system.
 * Call this at app startup to register all gate fix commands.
 *
 * @example
 * ```ts
 * // In App.tsx or main.ts
 * import { initializeCommands } from '@/core/commands';
 * initializeCommands();
 * ```
 */
export function initializeCommands(): void {
  registerCommands(gateFixCommands);
}

/**
 * Check if commands are initialized
 */
export function isCommandSystemReady(): boolean {
  return commandRegistry.has('cmd:reduce_drill_depth');
}

// ============================================================================
// Gate Issue → Fix Suggestion Helper
// ============================================================================

import type { GateIssueWithFix, FixSuggestion, CommandContext } from './types';
import { getGateFixCommand, isGateFixCommandId } from './gateFixCommands';

/**
 * Get fix suggestions for a gate issue.
 *
 * @param issue - Gate issue with suggestedFix
 * @param ctx - Command context
 * @returns Array of fix suggestions for UI display
 *
 * @example
 * ```tsx
 * const suggestions = getFixSuggestionsForIssue(issue, {
 *   featureId: issue.location,
 *   params: { currentDepth: drill.depth, coreThickness: 18 },
 * });
 *
 * return suggestions.map(s => (
 *   <Button key={s.commandId} onClick={() => executeCommand(s.commandId)}>
 *     {s.label}
 *   </Button>
 * ));
 * ```
 */
export function getFixSuggestionsForIssue(
  issue: GateIssueWithFix,
  ctx: CommandContext
): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];

  if (!issue.suggestedFix) {
    return suggestions;
  }

  if (!isGateFixCommandId(issue.suggestedFix)) {
    return suggestions;
  }

  const command = getGateFixCommand(issue.suggestedFix);
  if (!command) {
    return suggestions;
  }

  // Build context with issue location
  const fullCtx: CommandContext = {
    ...ctx,
    featureId: ctx.featureId || issue.location,
  };

  const canExecute = command.canExecute(fullCtx);
  const preview = command.preview ? command.preview(fullCtx) : undefined;

  suggestions.push({
    commandId: issue.suggestedFix,
    label: command.label,
    description: command.description,
    preview: typeof preview === 'string' ? preview : preview ? `${preview.value} ${preview.unit}` : undefined,
    canExecute,
  });

  return suggestions;
}

/**
 * Execute a fix for a gate issue.
 *
 * @param issue - Gate issue with suggestedFix
 * @param ctx - Command execution context
 * @returns Command result
 */
export async function executeFixForIssue(
  issue: GateIssueWithFix,
  ctx: import('./types').CommandExecutionContext
): Promise<import('./types').CommandResult> {
  if (!issue.suggestedFix || !isGateFixCommandId(issue.suggestedFix)) {
    return {
      success: false,
      message: 'No fix available for this issue',
    };
  }

  // Build context with issue location
  const fullCtx: import('./types').CommandExecutionContext = {
    ...ctx,
    featureId: ctx.featureId || issue.location,
  };

  return commandRegistry.execute(issue.suggestedFix, fullCtx);
}
