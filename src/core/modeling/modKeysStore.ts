/**
 * Modifier Keys Store - Track Shift/Alt/Ctrl state
 *
 * Plasticity-style modifier key tracking for:
 * - Shift = Snap mode (precision increments)
 * - Alt = Clone/duplicate mode
 * - Ctrl/Meta = Constrain mode
 *
 * v1.0: Initial modifier key store
 */

import { create } from 'zustand';

interface ModKeysState {
  shift: boolean;
  alt: boolean;
  ctrlOrMeta: boolean;
  set: (partial: Partial<Pick<ModKeysState, 'shift' | 'alt' | 'ctrlOrMeta'>>) => void;
}

export const useModKeysStore = create<ModKeysState>((set) => ({
  shift: false,
  alt: false,
  ctrlOrMeta: false,
  set: (partial) => set((state) => ({ ...state, ...partial })),
}));

// Selector hooks for performance
export const useShiftKey = () => useModKeysStore((s) => s.shift);
export const useAltKey = () => useModKeysStore((s) => s.alt);
export const useCtrlKey = () => useModKeysStore((s) => s.ctrlOrMeta);

/**
 * Install global keyboard listeners for modifier keys.
 * Call on app mount, returns cleanup function.
 */
export function installModKeysListeners(): () => void {
  const setKeys = useModKeysStore.getState().set;

  const updateKeys = (e: KeyboardEvent) => {
    setKeys({
      shift: e.shiftKey,
      alt: e.altKey,
      ctrlOrMeta: e.ctrlKey || e.metaKey,
    });
  };

  // Also handle focus loss (reset all)
  const onBlur = () => {
    setKeys({ shift: false, alt: false, ctrlOrMeta: false });
  };

  window.addEventListener('keydown', updateKeys);
  window.addEventListener('keyup', updateKeys);
  window.addEventListener('blur', onBlur);

  return () => {
    window.removeEventListener('keydown', updateKeys);
    window.removeEventListener('keyup', updateKeys);
    window.removeEventListener('blur', onBlur);
  };
}
