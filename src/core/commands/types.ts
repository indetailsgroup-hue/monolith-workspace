/**
 * types.ts - P14B Command System Types
 *
 * Defines the command registry interface for gate fix suggestions.
 * Commands are identified by string IDs matching suggestedFix in gate issues.
 *
 * ARCHITECTURE:
 * - CommandId: String identifier (e.g., 'cmd:reduce_drill_depth')
 * - CommandDef: Definition with execute/canExecute/undo
 * - CommandContext: Runtime context for command execution
 * - CommandResult: Execution outcome with optional undo
 *
 * @version 0.14.5 (P14B)
 */

// ============================================================================
// Command Identifiers
// ============================================================================

/**
 * Command ID format: 'cmd:<action>_<target>'
 *
 * Examples:
 * - 'cmd:reduce_drill_depth' - Reduce a drill hole depth
 * - 'cmd:move_hole_from_edge' - Move hole away from edge band
 * - 'cmd:adjust_panel_dimensions' - Adjust panel width/height
 */
export type CommandId = `cmd:${string}`;

/**
 * Known gate fix command IDs
 */
export type GateFixCommandId =
  // Dimension adjustments
  | 'cmd:adjust_panel_dimensions'
  | 'cmd:recalculate_cut_size'
  | 'cmd:increase_panel_width'
  | 'cmd:increase_panel_height'
  | 'cmd:reduce_panel_width'
  | 'cmd:reduce_panel_height'
  | 'cmd:adjust_premill'
  // Drill fixes
  | 'cmd:reduce_drill_depth'
  | 'cmd:convert_to_through_hole'
  | 'cmd:move_hole_from_edge'
  | 'cmd:move_hole_inside'
  // Pocket/Groove fixes
  | 'cmd:reduce_pocket_depth'
  | 'cmd:reduce_groove_depth'
  | 'cmd:move_pocket_inside';

// ============================================================================
// Command Context
// ============================================================================

/**
 * Context passed to command execution.
 * Contains all data needed to execute the command.
 */
export interface CommandContext {
  /** Target FlatPart ID */
  flatPartId?: string;

  /** Target feature ID (drill, pocket, groove) */
  featureId?: string;

  /** Target edge side */
  edgeSide?: 'top' | 'bottom' | 'left' | 'right';

  /** Cabinet ID (for store updates) */
  cabinetId?: string;

  /** Panel ID (for store updates) */
  panelId?: string;

  /** Suggested value (e.g., new depth) */
  suggestedValue?: number;

  /** Additional parameters */
  params?: Record<string, unknown>;
}

/**
 * Extended context with store access
 */
export interface CommandExecutionContext extends CommandContext {
  /** Get current state */
  getState: () => unknown;

  /** Update state */
  setState: (updater: (state: unknown) => void) => void;

  /** Show notification to user */
  notify?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

// ============================================================================
// Command Definition
// ============================================================================

/**
 * Command execution result
 */
export interface CommandResult {
  /** Whether execution succeeded */
  success: boolean;

  /** Human-readable message */
  message: string;

  /** Undo function (if command is reversible) */
  undo?: () => void;

  /** Changed entity IDs (for UI refresh) */
  changedIds?: string[];
}

/**
 * Command definition
 */
export interface CommandDef {
  /** Unique command ID */
  id: CommandId;

  /** Human-readable label */
  label: string;

  /** Description of what the command does */
  description: string;

  /** Category for grouping in palette */
  category: 'dimension' | 'drill' | 'pocket' | 'groove' | 'edge' | 'material' | 'general';

  /** Keyboard shortcut (optional) */
  shortcut?: string;

  /**
   * Check if command can execute in current context.
   * @param ctx - Command context
   * @returns true if command can execute
   */
  canExecute: (ctx: CommandContext) => boolean;

  /**
   * Execute the command.
   * @param ctx - Command execution context
   * @returns Execution result
   */
  execute: (ctx: CommandExecutionContext) => CommandResult | Promise<CommandResult>;

  /**
   * Preview the command effect without applying.
   * @param ctx - Command context
   * @returns Preview description or computed value
   */
  preview?: (ctx: CommandContext) => string | { value: number; unit: string };
}

// ============================================================================
// Registry Types
// ============================================================================

/**
 * Command registry interface
 */
export interface CommandRegistry {
  /** Register a command */
  register: (command: CommandDef) => void;

  /** Unregister a command */
  unregister: (id: CommandId) => void;

  /** Get command by ID */
  get: (id: CommandId) => CommandDef | undefined;

  /** Get all commands */
  getAll: () => CommandDef[];

  /** Get commands by category */
  getByCategory: (category: CommandDef['category']) => CommandDef[];

  /** Check if command exists */
  has: (id: CommandId) => boolean;

  /** Execute command by ID */
  execute: (id: CommandId, ctx: CommandExecutionContext) => Promise<CommandResult>;

  /** Check if command can execute */
  canExecute: (id: CommandId, ctx: CommandContext) => boolean;
}

// ============================================================================
// Gate Integration Types
// ============================================================================

/**
 * Gate issue with suggested fix
 */
export interface GateIssueWithFix {
  code: string;
  severity: 'ERROR' | 'WARN' | 'INFO';
  message: string;
  location?: string;
  suggestedFix?: GateFixCommandId;
}

/**
 * Fix suggestion for UI display
 */
export interface FixSuggestion {
  commandId: GateFixCommandId;
  label: string;
  description: string;
  preview?: string;
  canExecute: boolean;
}

/**
 * Get fix suggestions for a gate issue
 */
export type GetFixSuggestions = (
  issue: GateIssueWithFix,
  ctx: CommandContext
) => FixSuggestion[];
