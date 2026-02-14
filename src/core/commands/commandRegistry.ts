/**
 * commandRegistry.ts - P14B Command Registry
 *
 * Central registry for all executable commands.
 * Commands are registered at startup and can be executed by ID.
 *
 * USAGE:
 * ```ts
 * // Register a command
 * registry.register(reduceDrillDepthCommand);
 *
 * // Execute by ID
 * const result = await registry.execute('cmd:reduce_drill_depth', ctx);
 *
 * // Check if executable
 * if (registry.canExecute('cmd:reduce_drill_depth', ctx)) { ... }
 * ```
 *
 * @version 0.14.5 (P14B)
 */

import type {
  CommandId,
  CommandDef,
  CommandContext,
  CommandExecutionContext,
  CommandResult,
  CommandRegistry,
} from './types';

// ============================================================================
// Registry Implementation
// ============================================================================

class CommandRegistryImpl implements CommandRegistry {
  private commands = new Map<CommandId, CommandDef>();

  /**
   * Register a command.
   * Throws if command with same ID already exists.
   */
  register(command: CommandDef): void {
    if (this.commands.has(command.id)) {
      throw new Error(`Command already registered: ${command.id}`);
    }
    this.commands.set(command.id, command);
  }

  /**
   * Unregister a command by ID.
   */
  unregister(id: CommandId): void {
    this.commands.delete(id);
  }

  /**
   * Get command definition by ID.
   */
  get(id: CommandId): CommandDef | undefined {
    return this.commands.get(id);
  }

  /**
   * Get all registered commands.
   */
  getAll(): CommandDef[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get commands by category.
   */
  getByCategory(category: CommandDef['category']): CommandDef[] {
    return this.getAll().filter((cmd) => cmd.category === category);
  }

  /**
   * Check if command is registered.
   */
  has(id: CommandId): boolean {
    return this.commands.has(id);
  }

  /**
   * Execute a command by ID.
   */
  async execute(id: CommandId, ctx: CommandExecutionContext): Promise<CommandResult> {
    const command = this.commands.get(id);

    if (!command) {
      return {
        success: false,
        message: `Unknown command: ${id}`,
      };
    }

    if (!command.canExecute(ctx)) {
      return {
        success: false,
        message: `Command cannot execute in current context: ${id}`,
      };
    }

    try {
      const result = await command.execute(ctx);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Command failed: ${message}`,
      };
    }
  }

  /**
   * Check if command can execute in given context.
   */
  canExecute(id: CommandId, ctx: CommandContext): boolean {
    const command = this.commands.get(id);
    if (!command) {
      return false;
    }
    return command.canExecute(ctx);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Global command registry instance.
 * Use this to register and execute commands.
 */
export const commandRegistry: CommandRegistry = new CommandRegistryImpl();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a command definition with defaults.
 */
export function defineCommand(
  partial: Omit<CommandDef, 'canExecute'> & {
    canExecute?: CommandDef['canExecute'];
  }
): CommandDef {
  return {
    canExecute: () => true, // Default: always executable
    ...partial,
  };
}

/**
 * Register multiple commands at once.
 */
export function registerCommands(commands: CommandDef[]): void {
  for (const command of commands) {
    commandRegistry.register(command);
  }
}

/**
 * Create a simple fix command that updates a numeric value.
 */
export function createNumericFixCommand(options: {
  id: CommandId;
  label: string;
  description: string;
  category: CommandDef['category'];
  /** Get current value */
  getValue: (ctx: CommandContext) => number | undefined;
  /** Calculate suggested new value */
  getSuggestedValue: (ctx: CommandContext, currentValue: number) => number;
  /** Apply new value */
  applyValue: (ctx: CommandExecutionContext, newValue: number) => void;
  /** Validate if fix is applicable */
  validate?: (ctx: CommandContext) => boolean;
}): CommandDef {
  const { id, label, description, category, getValue, getSuggestedValue, applyValue, validate } =
    options;

  return {
    id,
    label,
    description,
    category,

    canExecute(ctx: CommandContext): boolean {
      if (validate && !validate(ctx)) {
        return false;
      }
      const currentValue = getValue(ctx);
      return currentValue !== undefined;
    },

    preview(ctx: CommandContext): string {
      const currentValue = getValue(ctx);
      if (currentValue === undefined) {
        return 'N/A';
      }
      const newValue = getSuggestedValue(ctx, currentValue);
      return `${currentValue} → ${newValue}`;
    },

    execute(ctx: CommandExecutionContext): CommandResult {
      const currentValue = getValue(ctx);
      if (currentValue === undefined) {
        return {
          success: false,
          message: 'Cannot get current value',
        };
      }

      const newValue = getSuggestedValue(ctx, currentValue);
      const oldValue = currentValue;

      try {
        applyValue(ctx, newValue);

        return {
          success: true,
          message: `Changed from ${oldValue} to ${newValue}`,
          undo: () => {
            applyValue(ctx, oldValue);
          },
          changedIds: ctx.flatPartId ? [ctx.flatPartId] : [],
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Create a command that moves a feature.
 */
export function createMoveFeatureCommand(options: {
  id: CommandId;
  label: string;
  description: string;
  category: CommandDef['category'];
  /** Get current position */
  getPosition: (ctx: CommandContext) => { x: number; y: number } | undefined;
  /** Calculate safe position */
  getSafePosition: (ctx: CommandContext, current: { x: number; y: number }) => { x: number; y: number };
  /** Apply new position */
  applyPosition: (ctx: CommandExecutionContext, pos: { x: number; y: number }) => void;
}): CommandDef {
  const { id, label, description, category, getPosition, getSafePosition, applyPosition } = options;

  return {
    id,
    label,
    description,
    category,

    canExecute(ctx: CommandContext): boolean {
      const pos = getPosition(ctx);
      return pos !== undefined;
    },

    preview(ctx: CommandContext): string {
      const current = getPosition(ctx);
      if (!current) return 'N/A';
      const safe = getSafePosition(ctx, current);
      return `(${current.x}, ${current.y}) → (${safe.x}, ${safe.y})`;
    },

    execute(ctx: CommandExecutionContext): CommandResult {
      const current = getPosition(ctx);
      if (!current) {
        return { success: false, message: 'Cannot get current position' };
      }

      const safePos = getSafePosition(ctx, current);
      const oldPos = { ...current };

      try {
        applyPosition(ctx, safePos);

        return {
          success: true,
          message: `Moved from (${oldPos.x}, ${oldPos.y}) to (${safePos.x}, ${safePos.y})`,
          undo: () => applyPosition(ctx, oldPos),
          changedIds: ctx.featureId ? [ctx.featureId] : [],
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
