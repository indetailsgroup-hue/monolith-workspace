/**
 * Numeric Entry Key Handler - CAD-style Keyboard Capture
 *
 * Captures numeric input when tool is active:
 * - Type 0-9, ., - to input value
 * - Tab to switch field (X ↔ Y)
 * - Enter to apply
 * - Escape to cancel
 * - Backspace to delete
 *
 * v1.0: Initial numeric entry keys
 */

import { useNumericEntryStore, NumericField } from './numericEntryStore';

export interface NumericEntryOptions {
  /** Function to check if a tool is currently active */
  isToolActive: () => boolean;
  /** Callback when value is applied */
  applyValue: (field: NumericField, value: number) => void;
  /** Optional callback when entry mode opens */
  onOpen?: (field: NumericField) => void;
  /** Optional callback when entry mode closes */
  onClose?: () => void;
}

/**
 * Install global keyboard listener for numeric entry.
 * Call on app mount, returns cleanup function.
 */
export function installNumericEntryKeys(opts: NumericEntryOptions): () => void {
  const isNumericKey = (key: string) => /^[0-9]$/.test(key);
  const isAllowedKey = (key: string) =>
    isNumericKey(key) || key === '.' || key === '-';

  const onKeyDown = (e: KeyboardEvent) => {
    // Ignore if tool not active
    if (!opts.isToolActive()) return;

    // Ignore if focused on input/textarea
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    if (target.isContentEditable) return;

    const store = useNumericEntryStore.getState();
    const { active, buffer, parsedValue, field } = store;

    // Start capture when user types a number (or . -)
    if (!active && isAllowedKey(e.key)) {
      e.preventDefault();
      store.open(field);
      useNumericEntryStore.getState().append(e.key);
      opts.onOpen?.(field);
      return;
    }

    // Tab opens numeric entry even if not started
    if (!active && e.key === 'Tab') {
      e.preventDefault();
      store.open(field);
      opts.onOpen?.(field);
      return;
    }

    // Only process remaining keys if active
    if (!active) return;

    // Allowed numeric characters
    if (isAllowedKey(e.key)) {
      e.preventDefault();
      // Prevent multiple dots
      if (e.key === '.' && buffer.includes('.')) return;
      // Prevent minus not at start
      if (e.key === '-' && buffer.length > 0) return;
      store.append(e.key);
      return;
    }

    // Backspace
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (buffer.length > 0) {
        store.backspace();
      } else {
        store.close();
        opts.onClose?.();
      }
      return;
    }

    // Tab = switch field
    if (e.key === 'Tab') {
      e.preventDefault();
      store.toggleField();
      return;
    }

    // Escape = cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      store.close();
      opts.onClose?.();
      return;
    }

    // Enter = apply value
    if (e.key === 'Enter') {
      e.preventDefault();
      if (parsedValue !== null) {
        opts.applyValue(field, parsedValue);
      }
      store.close();
      opts.onClose?.();
      return;
    }
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}

/**
 * Default apply handler that maps field to tool params.
 * Use with useToolStore.
 */
export function createToolApplyHandler(
  getToolState: () => { tool: string; depthMm?: number; offsetMm?: number; gapMm?: number },
  setToolState: (state: Partial<{ depthMm: number; offsetMm: number; gapMm: number }>) => void
): (field: NumericField, value: number) => void {
  return (field, value) => {
    const tool = getToolState();

    if (field === 'Y') {
      // Y = depth for all tools
      setToolState({ depthMm: value });
    } else if (field === 'X') {
      // X = offset/gap depending on tool
      if (tool.tool === 'GROOVE') {
        setToolState({ offsetMm: value });
      } else if (tool.tool === 'REVEAL') {
        setToolState({ gapMm: value });
      } else {
        // EDGE_PROFILE only has depth, map X to depth too
        setToolState({ depthMm: value });
      }
    }
  };
}
