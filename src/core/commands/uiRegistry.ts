/**
 * uiRegistry.ts - UI Command Registry
 *
 * Centralized command system for Command Palette and Radial Menu.
 * Separate from gate fix commands - focused on user-facing actions.
 *
 * USAGE:
 * ```ts
 * import { uiCommands, registerUiCommand, executeUiCommand } from './uiRegistry';
 *
 * // Register a command
 * registerUiCommand({
 *   id: 'tool:select',
 *   title: 'Select Tool',
 *   group: 'Tools',
 *   hotkey: 'V',
 *   run: () => setTool('select'),
 * });
 *
 * // Execute by ID
 * executeUiCommand('tool:select');
 * ```
 *
 * @version 1.0.0
 */

// ============================================================================
// Types
// ============================================================================

export interface UiCommand {
  /** Unique command ID (e.g., 'tool:select', 'cabinet:duplicate') */
  id: string;

  /** Display title for palette/menu */
  title: string;

  /** Group for categorization in palette */
  group?: string;

  /** Icon (emoji or component) */
  icon?: string;

  /** Keyboard shortcut (e.g., 'V', 'Ctrl+D', 'Delete') */
  hotkey?: string;

  /** Execute the command */
  run: () => Promise<void> | void;

  /** Check if command can execute (optional, defaults to true) */
  canExecute?: () => boolean;

  /** Keywords for search filtering */
  keywords?: string[];
}

// ============================================================================
// Registry
// ============================================================================

const commands = new Map<string, UiCommand>();
const listeners = new Set<() => void>();

/**
 * Register a UI command
 */
export function registerUiCommand(command: UiCommand): void {
  commands.set(command.id, command);
  notifyListeners();
}

/**
 * Unregister a UI command
 */
export function unregisterUiCommand(id: string): void {
  commands.delete(id);
  notifyListeners();
}

/**
 * Get a command by ID
 */
export function getUiCommand(id: string): UiCommand | undefined {
  return commands.get(id);
}

/**
 * Get all registered commands
 */
export function getAllUiCommands(): UiCommand[] {
  return Array.from(commands.values());
}

/**
 * Get commands by group
 */
export function getUiCommandsByGroup(group: string): UiCommand[] {
  return getAllUiCommands().filter((cmd) => cmd.group === group);
}

/**
 * Get all unique groups
 */
export function getUiCommandGroups(): string[] {
  const groups = new Set<string>();
  for (const cmd of commands.values()) {
    if (cmd.group) groups.add(cmd.group);
  }
  return Array.from(groups);
}

/**
 * Execute a command by ID
 */
export async function executeUiCommand(id: string): Promise<boolean> {
  const command = commands.get(id);
  if (!command) {
    console.warn(`[uiRegistry] Unknown command: ${id}`);
    return false;
  }

  if (command.canExecute && !command.canExecute()) {
    console.warn(`[uiRegistry] Command cannot execute: ${id}`);
    return false;
  }

  try {
    await command.run();
    // Track execution for telemetry
    try {
      const { useCommandTelemetry } = await import('./telemetry');
      useCommandTelemetry.getState().bump(id);
    } catch {
      // Telemetry not available, ignore
    }
    return true;
  } catch (error) {
    console.error(`[uiRegistry] Command failed: ${id}`, error);
    return false;
  }
}

/**
 * Check if a command can execute
 */
export function canExecuteUiCommand(id: string): boolean {
  const command = commands.get(id);
  if (!command) return false;
  if (command.canExecute) return command.canExecute();
  return true;
}

/**
 * Find command by hotkey
 */
export function findUiCommandByHotkey(hotkey: string): UiCommand | undefined {
  const normalized = normalizeHotkey(hotkey);
  for (const cmd of commands.values()) {
    if (cmd.hotkey && normalizeHotkey(cmd.hotkey) === normalized) {
      return cmd;
    }
  }
  return undefined;
}

/**
 * Search commands by query
 */
export function searchUiCommands(query: string): UiCommand[] {
  const q = query.toLowerCase().trim();
  if (!q) return getAllUiCommands();

  return getAllUiCommands().filter((cmd) => {
    if (cmd.title.toLowerCase().includes(q)) return true;
    if (cmd.group?.toLowerCase().includes(q)) return true;
    if (cmd.keywords?.some((kw) => kw.toLowerCase().includes(q))) return true;
    return false;
  });
}

// ============================================================================
// Subscription (for React hooks)
// ============================================================================

function notifyListeners(): void {
  listeners.forEach((fn) => fn());
}

/**
 * Subscribe to registry changes
 */
export function subscribeToUiCommands(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ============================================================================
// Hotkey Helpers
// ============================================================================

/**
 * Normalize hotkey string for comparison
 * 'Ctrl+D' -> 'ctrl+d'
 * 'ctrl+shift+s' -> 'ctrl+shift+s'
 */
function normalizeHotkey(hotkey: string): string {
  return hotkey
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .sort((a, b) => {
      // Sort modifiers first
      const order = ['ctrl', 'alt', 'shift', 'meta'];
      const aIdx = order.indexOf(a);
      const bIdx = order.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    })
    .join('+');
}

/**
 * Parse keyboard event to hotkey string
 */
export function eventToHotkey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');

  // Get the key
  let key = e.key;
  if (key === ' ') key = 'space';
  if (key === 'Escape') key = 'escape';
  if (key === 'Enter') key = 'enter';
  if (key === 'Delete') key = 'delete';
  if (key === 'Backspace') key = 'backspace';
  if (key === 'ArrowUp') key = 'up';
  if (key === 'ArrowDown') key = 'down';
  if (key === 'ArrowLeft') key = 'left';
  if (key === 'ArrowRight') key = 'right';

  // Skip modifier-only events
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    return '';
  }

  parts.push(key.toLowerCase());
  return parts.join('+');
}

// ============================================================================
// Default Commands
// ============================================================================

import { useToolStore, type ToolId } from '../store/useToolStore';
import { useCabinetStore } from '../store/useCabinetStore';
import { useViewStore } from '../store/useViewStore';
import { useSelectionStore, type SelectionKind } from '../store/useSelectionStore';
import { useModelingStore } from '../modeling';
import type { SelectionType } from '../modeling/types';

/**
 * Get current selection type from modeling store
 */
export function getCurrentSelectionType(): SelectionType {
  const selection = useModelingStore.getState().selection;
  return selection?.type || 'none';
}

/**
 * Check if selection matches required types
 */
export function selectionMatches(required: SelectionType[]): boolean {
  const current = getCurrentSelectionType();
  return required.includes(current);
}

/**
 * Register default UI commands.
 * Call this at app startup.
 */
export function registerDefaultUiCommands(): void {
  const toolStore = useToolStore.getState();

  // ─────────────────────────────────────────────────────────────────────────
  // Tool commands (with number key shortcuts)
  // ─────────────────────────────────────────────────────────────────────────
  const tools: Array<{ id: ToolId; title: string; hotkey: string; numKey?: string; icon: string }> = [
    { id: 'select', title: 'Select Tool', hotkey: 'V', numKey: '1', icon: '↖' },
    { id: 'move', title: 'Move Tool', hotkey: 'G', numKey: '2', icon: '✥' },
    { id: 'rotate', title: 'Rotate Tool', hotkey: 'R', numKey: '3', icon: '↻' },
    { id: 'scale', title: 'Scale Tool', hotkey: 'S', numKey: '4', icon: '⤡' },
    { id: 'glue', title: 'Glue Tool', hotkey: 'J', icon: '⊞' },
  ];

  for (const tool of tools) {
    // Main hotkey
    registerUiCommand({
      id: `tool:${tool.id}`,
      title: tool.title,
      group: 'Tools',
      icon: tool.icon,
      hotkey: tool.hotkey,
      keywords: ['tool', tool.id],
      run: () => useToolStore.getState().setTool(tool.id),
    });

    // Number key shortcut (additional binding)
    if (tool.numKey) {
      registerUiCommand({
        id: `tool:${tool.id}:num`,
        title: `${tool.title} (${tool.numKey})`,
        group: 'Tools',
        icon: tool.icon,
        hotkey: tool.numKey,
        keywords: [],
        run: () => useToolStore.getState().setTool(tool.id),
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cabinet actions
  // ─────────────────────────────────────────────────────────────────────────
  registerUiCommand({
    id: 'cabinet:duplicate',
    title: 'Duplicate Cabinet',
    group: 'Edit',
    icon: '⧉',
    hotkey: 'Ctrl+D',
    keywords: ['copy', 'clone', 'duplicate'],
    canExecute: () => !!useCabinetStore.getState().activeCabinetId,
    run: () => {
      const id = useCabinetStore.getState().activeCabinetId;
      if (id) useCabinetStore.getState().duplicateCabinet(id);
    },
  });

  registerUiCommand({
    id: 'cabinet:delete',
    title: 'Delete Cabinet',
    group: 'Edit',
    icon: '🗑',
    hotkey: 'Delete',
    keywords: ['remove', 'delete', 'trash'],
    canExecute: () => !!useCabinetStore.getState().activeCabinetId,
    run: () => {
      const id = useCabinetStore.getState().activeCabinetId;
      if (id) useCabinetStore.getState().removeCabinet(id);
    },
  });

  registerUiCommand({
    id: 'cabinet:rotate-cw',
    title: 'Rotate 90° CW',
    group: 'Transform',
    icon: '↻',
    hotkey: 'Shift+R',
    keywords: ['rotate', 'clockwise', '90'],
    canExecute: () => !!useCabinetStore.getState().activeCabinetId,
    run: () => {
      const id = useCabinetStore.getState().activeCabinetId;
      if (id) useCabinetStore.getState().rotateCabinet90?.(id, 'cw');
    },
  });

  registerUiCommand({
    id: 'cabinet:rotate-ccw',
    title: 'Rotate 90° CCW',
    group: 'Transform',
    icon: '↺',
    hotkey: 'Alt+R',
    keywords: ['rotate', 'counter', 'ccw'],
    canExecute: () => !!useCabinetStore.getState().activeCabinetId,
    run: () => {
      const id = useCabinetStore.getState().activeCabinetId;
      if (id) useCabinetStore.getState().rotateCabinet90?.(id, 'ccw');
    },
  });

  registerUiCommand({
    id: 'cabinet:mirror',
    title: 'Mirror Cabinet (X)',
    group: 'Transform',
    icon: '⧎',
    hotkey: 'Alt+X',
    keywords: ['mirror', 'flip', 'reflect', 'x'],
    canExecute: () => !!useCabinetStore.getState().activeCabinetId,
    run: () => {
      const id = useCabinetStore.getState().activeCabinetId;
      if (id) {
        const mirrored = useCabinetStore.getState().mirrorCabinet(id, 'x');
        if (mirrored) {
          console.log('[Command] Mirror X:', mirrored.name);
        }
      }
    },
  });

  registerUiCommand({
    id: 'cabinet:mirror-z',
    title: 'Mirror Cabinet (Z)',
    group: 'Transform',
    icon: '⥂',
    hotkey: 'Alt+Z',
    keywords: ['mirror', 'flip', 'reflect', 'z', 'depth'],
    canExecute: () => !!useCabinetStore.getState().activeCabinetId,
    run: () => {
      const id = useCabinetStore.getState().activeCabinetId;
      if (id) {
        const mirrored = useCabinetStore.getState().mirrorCabinet(id, 'z');
        if (mirrored) {
          console.log('[Command] Mirror Z:', mirrored.name);
        }
      }
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Edge Operations (require edge selection)
  // ─────────────────────────────────────────────────────────────────────────
  registerUiCommand({
    id: 'edge:profile',
    title: 'Apply Edge Profile',
    group: 'Edge',
    icon: '◗',
    keywords: ['profile', 'finger', 'pull', 'edge', 'router'],
    canExecute: () => selectionMatches(['edge']),
    run: () => {
      useModelingStore.getState().executeCommand('apply-edge-profile');
    },
  });

  registerUiCommand({
    id: 'edge:bevel',
    title: 'Bevel Edge',
    group: 'Edge',
    icon: '◢',
    keywords: ['bevel', 'angle', 'chamfer', '45'],
    canExecute: () => selectionMatches(['edge']),
    run: () => {
      useModelingStore.getState().executeCommand('bevel-edge');
    },
  });

  registerUiCommand({
    id: 'edge:round',
    title: 'Round Edge (Fillet)',
    group: 'Edge',
    icon: '◠',
    keywords: ['round', 'fillet', 'radius', 'smooth'],
    canExecute: () => selectionMatches(['edge']),
    run: () => {
      useModelingStore.getState().executeCommand('round-edge');
    },
  });

  registerUiCommand({
    id: 'edge:band',
    title: 'Add Edge Banding',
    group: 'Edge',
    icon: '▬',
    keywords: ['band', 'edgeband', 'tape', 'pvc', 'abs'],
    canExecute: () => selectionMatches(['edge']),
    run: () => {
      useModelingStore.getState().executeCommand('add-edge-band');
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Face/Panel Operations
  // ─────────────────────────────────────────────────────────────────────────
  registerUiCommand({
    id: 'face:groove',
    title: 'Add Groove',
    group: 'Face',
    icon: '▭',
    keywords: ['groove', 'slot', 'channel', 'dado'],
    canExecute: () => selectionMatches(['face', 'panel']),
    run: () => {
      useModelingStore.getState().executeCommand('add-groove');
    },
  });

  registerUiCommand({
    id: 'face:dado',
    title: 'Add Dado',
    group: 'Face',
    icon: '╦',
    keywords: ['dado', 'housing', 'cross', 'groove'],
    canExecute: () => selectionMatches(['face', 'panel']),
    run: () => {
      useModelingStore.getState().executeCommand('add-dado');
    },
  });

  registerUiCommand({
    id: 'face:rabbet',
    title: 'Add Rabbet',
    group: 'Face',
    icon: '⌐',
    keywords: ['rabbet', 'rebate', 'step', 'back'],
    canExecute: () => selectionMatches(['edge', 'panel']),
    run: () => {
      useModelingStore.getState().executeCommand('add-rabbet');
    },
  });

  registerUiCommand({
    id: 'panel:kerf',
    title: 'Kerf Bend Panel',
    group: 'Panel',
    icon: '◜',
    keywords: ['kerf', 'bend', 'curve', 'flexible'],
    canExecute: () => selectionMatches(['panel']),
    run: () => {
      useModelingStore.getState().executeCommand('kerf-bend');
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Hole Operations
  // ─────────────────────────────────────────────────────────────────────────
  registerUiCommand({
    id: 'hole:shelf-pins',
    title: 'Add Shelf Pin Holes',
    group: 'Holes',
    icon: '○○',
    keywords: ['shelf', 'pin', 'hole', '32mm', 'system'],
    canExecute: () => selectionMatches(['panel', 'face']),
    run: () => {
      useModelingStore.getState().executeCommand('add-shelf-pin-holes');
    },
  });

  registerUiCommand({
    id: 'hole:hinge-bore',
    title: 'Add Hinge Bore',
    group: 'Holes',
    icon: '◎',
    keywords: ['hinge', 'bore', '35mm', 'cup', 'blum'],
    canExecute: () => selectionMatches(['panel']),
    run: () => {
      useModelingStore.getState().executeCommand('add-hinge-bore');
    },
  });

  registerUiCommand({
    id: 'hole:system',
    title: 'Add System Hole',
    group: 'Holes',
    icon: '●',
    keywords: ['system', 'hole', 'dowel', 'cam', 'confirmat'],
    canExecute: () => selectionMatches(['panel', 'edge']),
    run: () => {
      useModelingStore.getState().executeCommand('add-system-hole');
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Pattern Operations
  // ─────────────────────────────────────────────────────────────────────────
  registerUiCommand({
    id: 'pattern:slat',
    title: 'Apply Slat Pattern',
    group: 'Pattern',
    icon: '|||',
    keywords: ['slat', 'batten', 'vertical', 'horizontal', 'wall'],
    canExecute: () => selectionMatches(['face', 'panel']),
    run: () => {
      useModelingStore.getState().executeCommand('apply-slat-pattern');
    },
  });

  registerUiCommand({
    id: 'pattern:wainscoting',
    title: 'Apply Wainscoting',
    group: 'Pattern',
    icon: '▤',
    keywords: ['wainscot', 'panel', 'wall', 'classic'],
    canExecute: () => selectionMatches(['face', 'panel']),
    run: () => {
      useModelingStore.getState().executeCommand('apply-wainscoting');
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // View Commands
  // ─────────────────────────────────────────────────────────────────────────
  registerUiCommand({
    id: 'view:isolate',
    title: 'Focus / Isolate',
    group: 'View',
    icon: '◉',
    hotkey: 'I',
    keywords: ['isolate', 'focus', 'hide', 'others'],
    canExecute: () => !!useCabinetStore.getState().activeCabinetId,
    run: () => {
      const cabinetId = useCabinetStore.getState().activeCabinetId;
      if (cabinetId) {
        const cabinet = useCabinetStore.getState().cabinets.find(c => c.id === cabinetId);
        if (cabinet) {
          const position = (cabinet as any).scenePosition || [0, 0, 0];
          useViewStore.getState().focusOnCabinet(cabinetId, {
            position,
            dimensions: cabinet.dimensions,
          });
          console.log('[Command] Isolate cabinet:', cabinet.name);
        }
      }
    },
  });

  registerUiCommand({
    id: 'view:show-all',
    title: 'Show All',
    group: 'View',
    icon: '◎',
    hotkey: 'Shift+I',
    keywords: ['show', 'all', 'clear', 'isolation'],
    run: () => {
      useViewStore.getState().clearIsolation();
      console.log('[Command] Show all cabinets');
    },
  });

  registerUiCommand({
    id: 'view:reset',
    title: 'Reset View',
    group: 'View',
    icon: '⌂',
    hotkey: 'Home',
    keywords: ['reset', 'home', 'view', 'camera'],
    run: () => {
      useViewStore.getState().resetView();
      console.log('[Command] Reset view to Perspective');
    },
  });

  // View presets
  const viewPresets: Array<{ id: string; view: 'Front' | 'Left' | 'Perspective' | 'Factory' | 'CNC'; key: string }> = [
    { id: 'view:front', view: 'Front', key: 'Numpad1' },
    { id: 'view:left', view: 'Left', key: 'Numpad3' },
    { id: 'view:top', view: 'Factory', key: 'Numpad7' },
    { id: 'view:perspective', view: 'Perspective', key: 'Numpad5' },
  ];

  for (const preset of viewPresets) {
    registerUiCommand({
      id: preset.id,
      title: `${preset.view} View`,
      group: 'View',
      icon: preset.view === 'Front' ? '⬒' : preset.view === 'Left' ? '⬓' : preset.view === 'Factory' ? '⬔' : '◐',
      hotkey: preset.key,
      keywords: ['view', preset.view.toLowerCase()],
      run: () => {
        useViewStore.getState().setView(preset.view);
      },
    });
  }

  console.log('[uiRegistry] Default commands registered');
}

// ============================================================================
// Context-Aware Radial Menu Items
// ============================================================================

export interface RadialSlot {
  id: string;
  label: string;
  icon: string;
  shortcut?: string;
  commandId?: string;
  disabled?: boolean;
  theme?: 'default' | 'primary' | 'danger';
}

/**
 * Get current selection mode from selection store
 */
export function getSelectionMode(): SelectionKind {
  return useSelectionStore.getState().kind;
}

/**
 * Get radial menu items based on current selection type and mode
 */
export function getContextAwareRadialItems(): RadialSlot[] {
  const selectionType = getCurrentSelectionType();
  const selectionMode = getSelectionMode();
  const activeTool = useToolStore.getState().activeTool;
  const hasCabinet = !!useCabinetStore.getState().activeCabinetId;

  // Default items (tools)
  const defaultItems: RadialSlot[] = [
    { id: 'select', label: 'Select', icon: '↖', shortcut: 'V', commandId: 'tool:select', theme: activeTool === 'select' ? 'primary' : 'default' },
    { id: 'move', label: 'Move', icon: '✥', shortcut: 'G', commandId: 'tool:move', theme: activeTool === 'move' ? 'primary' : 'default' },
    { id: 'rotate', label: 'Rotate', icon: '↻', shortcut: 'R', commandId: 'tool:rotate', theme: activeTool === 'rotate' ? 'primary' : 'default' },
    { id: 'scale', label: 'Scale', icon: '⤡', shortcut: 'S', commandId: 'tool:scale', theme: activeTool === 'scale' ? 'primary' : 'default' },
    { id: 'duplicate', label: 'Duplicate', icon: '⧉', shortcut: 'Ctrl+D', commandId: 'cabinet:duplicate', disabled: !hasCabinet },
    { id: 'delete', label: 'Delete', icon: '🗑', shortcut: 'Del', commandId: 'cabinet:delete', disabled: !hasCabinet, theme: 'danger' },
    { id: 'palette', label: 'Commands', icon: '⌨', shortcut: 'F' },
    { id: 'glue', label: 'Glue', icon: '⊞', shortcut: 'J', commandId: 'tool:glue', theme: activeTool === 'glue' ? 'primary' : 'default' },
  ];

  // Context-specific items based on selection
  switch (selectionType) {
    case 'edge':
      return [
        { id: 'profile', label: 'Profile', icon: '◗', commandId: 'edge:profile' },
        { id: 'bevel', label: 'Bevel', icon: '◢', commandId: 'edge:bevel' },
        { id: 'round', label: 'Fillet', icon: '◠', commandId: 'edge:round' },
        { id: 'band', label: 'Edge Band', icon: '▬', commandId: 'edge:band' },
        { id: 'rabbet', label: 'Rabbet', icon: '⌐', commandId: 'face:rabbet' },
        { id: 'delete', label: 'Delete', icon: '🗑', shortcut: 'Del', commandId: 'cabinet:delete', theme: 'danger' },
        { id: 'palette', label: 'More...', icon: '⌨', shortcut: 'F' },
        { id: 'select', label: 'Deselect', icon: '↖', shortcut: 'Esc', commandId: 'tool:select' },
      ];

    case 'face':
    case 'panel':
      return [
        { id: 'groove', label: 'Groove', icon: '▭', commandId: 'face:groove' },
        { id: 'dado', label: 'Dado', icon: '╦', commandId: 'face:dado' },
        { id: 'kerf', label: 'Kerf Bend', icon: '◜', commandId: 'panel:kerf' },
        { id: 'holes', label: 'Shelf Pins', icon: '○○', commandId: 'hole:shelf-pins' },
        { id: 'pattern', label: 'Pattern', icon: '▤', commandId: 'pattern:wainscoting' },
        { id: 'delete', label: 'Delete', icon: '🗑', shortcut: 'Del', commandId: 'cabinet:delete', theme: 'danger' },
        { id: 'palette', label: 'More...', icon: '⌨', shortcut: 'F' },
        { id: 'select', label: 'Deselect', icon: '↖', shortcut: 'Esc', commandId: 'tool:select' },
      ];

    case 'cabinet':
      return [
        { id: 'move', label: 'Move', icon: '✥', shortcut: 'G', commandId: 'tool:move', theme: activeTool === 'move' ? 'primary' : 'default' },
        { id: 'rotate', label: 'Rotate', icon: '↻', shortcut: 'R', commandId: 'tool:rotate', theme: activeTool === 'rotate' ? 'primary' : 'default' },
        { id: 'duplicate', label: 'Duplicate', icon: '⧉', shortcut: 'Ctrl+D', commandId: 'cabinet:duplicate' },
        { id: 'mirror', label: 'Mirror', icon: '⧎', shortcut: 'Alt+X', commandId: 'cabinet:mirror' },
        { id: 'isolate', label: 'Isolate', icon: '◉', shortcut: 'I', commandId: 'view:isolate' },
        { id: 'delete', label: 'Delete', icon: '🗑', shortcut: 'Del', commandId: 'cabinet:delete', theme: 'danger' },
        { id: 'palette', label: 'Commands', icon: '⌨', shortcut: 'F' },
        { id: 'select', label: 'Deselect', icon: '↖', shortcut: 'Esc', commandId: 'tool:select' },
      ];

    default:
      // Check selection mode from useSelectionStore when no modeling selection
      if (selectionMode === 'point') {
        return [
          { id: 'move', label: 'Move', icon: '✥', shortcut: 'G', commandId: 'tool:move', theme: activeTool === 'move' ? 'primary' : 'default' },
          { id: 'rotate', label: 'Rotate', icon: '↻', shortcut: 'R', commandId: 'tool:rotate', theme: activeTool === 'rotate' ? 'primary' : 'default' },
          { id: 'mirror', label: 'Mirror', icon: '⧎', shortcut: 'Alt+X', commandId: 'cabinet:mirror' },
          { id: 'edge-mode', label: 'Edge (2)', icon: '—', shortcut: '2' },
          { id: 'diff', label: 'Diff', icon: '−', shortcut: 'Q' },
          { id: 'union', label: 'Union', icon: '+', shortcut: 'W' },
          { id: 'intersect', label: 'Intersect', icon: '∩', shortcut: 'E' },
          { id: 'object-mode', label: 'Object (4)', icon: '▢', shortcut: '4' },
        ];
      }
      if (selectionMode === 'edge') {
        return [
          { id: 'move', label: 'Move', icon: '✥', shortcut: 'G', commandId: 'tool:move', theme: activeTool === 'move' ? 'primary' : 'default' },
          { id: 'rotate', label: 'Rotate', icon: '↻', shortcut: 'R', commandId: 'tool:rotate', theme: activeTool === 'rotate' ? 'primary' : 'default' },
          { id: 'mirror', label: 'Mirror', icon: '⧎', shortcut: 'Alt+X', commandId: 'cabinet:mirror' },
          { id: 'face-mode', label: 'Face (3)', icon: '▣', shortcut: '3' },
          { id: 'diff', label: 'Diff', icon: '−', shortcut: 'Q' },
          { id: 'union', label: 'Union', icon: '+', shortcut: 'W' },
          { id: 'intersect', label: 'Intersect', icon: '∩', shortcut: 'E' },
          { id: 'object-mode', label: 'Object (4)', icon: '▢', shortcut: '4' },
        ];
      }
      if (selectionMode === 'face') {
        return [
          { id: 'move', label: 'Move', icon: '✥', shortcut: 'G', commandId: 'tool:move', theme: activeTool === 'move' ? 'primary' : 'default' },
          { id: 'rotate', label: 'Rotate', icon: '↻', shortcut: 'R', commandId: 'tool:rotate', theme: activeTool === 'rotate' ? 'primary' : 'default' },
          { id: 'mirror', label: 'Mirror', icon: '⧎', shortcut: 'Alt+X', commandId: 'cabinet:mirror' },
          { id: 'instance', label: 'Instance', icon: '⌘', commandId: 'instance:make' },
          { id: 'diff', label: 'Diff', icon: '−', shortcut: 'Q' },
          { id: 'union', label: 'Union', icon: '+', shortcut: 'W' },
          { id: 'intersect', label: 'Intersect', icon: '∩', shortcut: 'E' },
          { id: 'object-mode', label: 'Object (4)', icon: '▢', shortcut: '4' },
        ];
      }
      if (selectionMode === 'sketch') {
        return [
          { id: 'move', label: 'Move', icon: '✥', shortcut: 'G', commandId: 'tool:move', theme: activeTool === 'move' ? 'primary' : 'default' },
          { id: 'rotate', label: 'Rotate', icon: '↻', shortcut: 'R', commandId: 'tool:rotate', theme: activeTool === 'rotate' ? 'primary' : 'default' },
          { id: 'object-mode', label: 'Object (4)', icon: '▢', shortcut: '4' },
          { id: 'isolate', label: 'Isolate', icon: '◉', shortcut: 'I', commandId: 'view:isolate' },
          { id: 'diff', label: 'Diff', icon: '−', shortcut: 'Q' },
          { id: 'union', label: 'Union', icon: '+', shortcut: 'W' },
          { id: 'instance', label: 'Instance', icon: '⌘', commandId: 'instance:make' },
          { id: 'select', label: 'Select', icon: '↖', shortcut: 'V', commandId: 'tool:select' },
        ];
      }
      // Default: object mode
      return defaultItems;
  }
}
