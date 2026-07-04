/**
 * useGlobalHotkeys.ts - Global Keyboard Shortcut Handler
 *
 * Listens for keyboard events and dispatches to registered commands.
 * Handles Command Palette (F) and Radial Menu (number keys when open).
 *
 * USAGE:
 * ```tsx
 * // In your root component
 * import { useGlobalHotkeys } from '@/core/ui/useGlobalHotkeys';
 *
 * function App() {
 *   useGlobalHotkeys();
 *   return <Canvas />;
 * }
 * ```
 *
 * @version 1.0.0
 */

import { useEffect, useRef } from 'react';
import { useUiStore } from '../store/useUiStore';
import { useSelectionStore, selectionKeyToKind } from '../store/useSelectionStore';
import { useCabinetStore } from '../store/useCabinetStore';
import { useViewStore } from '../store/useViewStore';
import {
  findUiCommandByHotkey,
  executeUiCommand,
  eventToHotkey,
  getAllUiCommands,
} from '../commands/uiRegistry';
import {
  actionMove,
  actionRotate,
  actionMirrorX,
  actionMirrorZ,
  actionBooleanDiff,
  actionBooleanUnion,
  actionBooleanIntersect,
  actionDelete,
  actionDuplicate,
  actionSave,
} from '../commands/actions';
import { toastShortcut } from '../store/useToastStore';

// ============================================================================
// Hook
// ============================================================================

/**
 * Global hotkey handler hook.
 * Call once in your root component.
 */
export function useGlobalHotkeys(): void {
  const openCommandPalette = useUiStore((s) => s.openCommandPalette);
  const closeCommandPalette = useUiStore((s) => s.closeCommandPalette);
  const commandPaletteOpen = useUiStore((s) => s.commandPalette.isOpen);
  const radialMenuOpen = useUiStore((s) => s.radialMenu.isOpen);
  const closeRadialMenu = useUiStore((s) => s.closeRadialMenu);
  const closeAllOverlays = useUiStore((s) => s.closeAllOverlays);
  // P001: Shortcut Help Overlay
  const toggleShortcutOverlay = useUiStore((s) => s.toggleShortcutOverlay);
  const shortcutOverlayOpen = useUiStore((s) => s.shortcutOverlay.isOpen);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Skip if typing in an input
      if (isTypingInInput(e)) {
        // Allow Escape to close overlays even in inputs
        if (e.key === 'Escape') {
          closeAllOverlays();
        }
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Escape - Close all overlays
      // ─────────────────────────────────────────────────────────────────────
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAllOverlays();
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // P001: Shortcut Help Overlay - ? or Ctrl+/ (Cmd+/)
      // ─────────────────────────────────────────────────────────────────────
      if (e.key === '?' || ((e.ctrlKey || e.metaKey) && e.key === '/')) {
        e.preventDefault();
        toggleShortcutOverlay();
        return;
      }

      // Skip other hotkeys if shortcut overlay is open
      if (shortcutOverlayOpen) {
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Radial Menu number keys (1-8) when open
      // ─────────────────────────────────────────────────────────────────────
      if (radialMenuOpen) {
        const num = parseInt(e.key);
        if (num >= 1 && num <= 8) {
          e.preventDefault();
          // The RadialMenu component handles the actual execution
          // This is just a fallback / event handling coordination
          return;
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // Command Palette - F key or Cmd/Ctrl+K
      // ─────────────────────────────────────────────────────────────────────
      if (
        e.key === 'f' ||
        e.key === 'F' ||
        ((e.ctrlKey || e.metaKey) && e.key === 'k')
      ) {
        // F without modifiers opens palette
        if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault();
          if (commandPaletteOpen) {
            closeCommandPalette();
          } else {
            openCommandPalette();
          }
          return;
        }

        // Ctrl/Cmd+K opens palette
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          if (commandPaletteOpen) {
            closeCommandPalette();
          } else {
            openCommandPalette();
          }
          return;
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // Skip if Command Palette is open (it handles its own navigation)
      // ─────────────────────────────────────────────────────────────────────
      if (commandPaletteOpen) {
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Selection Mode Keys: 1/2/3/4
      // ─────────────────────────────────────────────────────────────────────
      const selKind = selectionKeyToKind(e.key);
      if (selKind) {
        e.preventDefault();
        useSelectionStore.getState().setKind(selKind);
        toastShortcut(e.key, `${selKind.charAt(0).toUpperCase() + selKind.slice(1)} mode`);
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // T015: Tab/Shift+Tab - Cycle overlapping panels
      // ─────────────────────────────────────────────────────────────────────
      if (e.key === 'Tab') {
        const { overlapCandidates, overlapIndex } = useSelectionStore.getState();
        if (overlapCandidates.length > 1) {
          e.preventDefault();
          if (e.shiftKey) {
            useSelectionStore.getState().cycleOverlapPrev();
          } else {
            useSelectionStore.getState().cycleOverlapNext();
          }
          const newIndex = e.shiftKey
            ? (overlapIndex - 1 + overlapCandidates.length) % overlapCandidates.length
            : (overlapIndex + 1) % overlapCandidates.length;
          toastShortcut('Tab', `Panel ${newIndex + 1}/${overlapCandidates.length}`);
          return;
        }
        // If no overlap candidates, let Tab work normally (e.g., for accessibility)
      }

      // ─────────────────────────────────────────────────────────────────────
      // Mirror: Alt+X, Alt+Z
      // ─────────────────────────────────────────────────────────────────────
      if (e.altKey && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        actionMirrorX();
        return;
      }
      if (e.altKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        actionMirrorZ();
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Tools: G (Move), R (Rotate)
      // ─────────────────────────────────────────────────────────────────────
      if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        actionMove();
        toastShortcut('G', 'Move tool');
        return;
      }
      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        actionRotate();
        toastShortcut('R', 'Rotate tool');
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Booleans: Q (Diff), W (Union), E (Intersect)
      // ─────────────────────────────────────────────────────────────────────
      if ((e.key === 'q' || e.key === 'Q') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        actionBooleanDiff();
        return;
      }
      if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        actionBooleanUnion();
        return;
      }
      if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        actionBooleanIntersect();
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Delete: Delete/Backspace only (D freed for dimension toggle in App.tsx)
      // ─────────────────────────────────────────────────────────────────────
      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        actionDelete();
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Duplicate: Ctrl+D
      // ─────────────────────────────────────────────────────────────────────
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        actionDuplicate();
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Save: Ctrl+S
      // ─────────────────────────────────────────────────────────────────────
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        actionSave();
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Plasticity-Style Visibility: H, Shift+H, Alt+H
      // ─────────────────────────────────────────────────────────────────────
      if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const cabinetStore = useCabinetStore.getState();
        const activeId = cabinetStore.activeCabinetId;

        if (e.altKey) {
          // Alt+H: Show all cabinets
          cabinetStore.showAllCabinets();
          toastShortcut('Alt+H', 'Show all');
        } else if (e.shiftKey) {
          // Shift+H: Hide unselected (show only active)
          if (activeId) cabinetStore.hideUnselectedCabinets(activeId);
          toastShortcut('Shift+H', 'Hide unselected');
        } else {
          // H: Hide selected cabinet
          if (activeId) cabinetStore.hideCabinet(activeId);
          toastShortcut('H', 'Hide selected');
        }
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Plasticity-Style Focus: / (slash)
      // ─────────────────────────────────────────────────────────────────────
      if (e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        const cabinetStore = useCabinetStore.getState();
        const viewStore = useViewStore.getState();
        const activeId = cabinetStore.activeCabinetId;
        const cabinet = cabinetStore.cabinets.find(c => c.id === activeId);

        if (cabinet) {
          viewStore.focusOnCabinet(cabinet.id, {
            position: (cabinet as any).scenePosition || [0, 0, 0],
            dimensions: cabinet.dimensions,
          });
          toastShortcut('/', 'Focus on cabinet');
        }
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Plasticity-Style Isolate: . (period)
      // ─────────────────────────────────────────────────────────────────────
      if (e.key === '.' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        const activeId = useCabinetStore.getState().activeCabinetId;
        if (activeId) {
          const wasIsolated = useViewStore.getState().isolatedCabinetId === activeId;
          useViewStore.getState().toggleIsolation(activeId);
          toastShortcut('.', wasIsolated ? 'Isolate off' : 'Isolate on');
        }
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Plasticity-Style Orthographic: O key
      // ─────────────────────────────────────────────────────────────────────
      if ((e.key === 'o' || e.key === 'O') && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        const wasOrtho = useViewStore.getState().isOrthographic;
        useViewStore.getState().toggleOrthographic();
        toastShortcut('O', wasOrtho ? 'Perspective' : 'Orthographic');
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // X-Ray Mode: X key (Shows Minifix drilling patterns)
      // ─────────────────────────────────────────────────────────────────────
      if ((e.key === 'x' || e.key === 'X') && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        const wasXRay = useViewStore.getState().xRayMode;
        useViewStore.getState().toggleXRay();
        toastShortcut('X', wasXRay ? 'X-Ray off' : 'X-Ray on');
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // CSG Boolean Drill Holes: Ctrl+Shift+H
      // ─────────────────────────────────────────────────────────────────────
      if ((e.key === 'h' || e.key === 'H') && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        const wasCSG = useViewStore.getState().useCSGHoles;
        useViewStore.getState().toggleCSGHoles();
        toastShortcut('Ctrl+⇧+H', wasCSG ? 'Boolean holes off' : 'Boolean holes on');
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Plasticity-Style View Presets: Numpad 1, 3, 7, 5
      // Use e.code to detect numpad keys specifically
      // ─────────────────────────────────────────────────────────────────────
      if (e.code === 'Numpad1' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        useViewStore.getState().setView('Front');
        toastShortcut('Num1', 'Front view');
        return;
      }
      if (e.code === 'Numpad3' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        useViewStore.getState().setView('Left');
        toastShortcut('Num3', 'Left view');
        return;
      }
      if (e.code === 'Numpad7' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        useViewStore.getState().setView('Factory'); // Top view
        toastShortcut('Num7', 'Top view');
        return;
      }
      if (e.code === 'Numpad5' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        const wasOrtho = useViewStore.getState().isOrthographic;
        useViewStore.getState().toggleOrthographic();
        toastShortcut('Num5', wasOrtho ? 'Perspective' : 'Orthographic');
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Try to match registered hotkey
      // ─────────────────────────────────────────────────────────────────────
      const hotkey = eventToHotkey(e);
      if (!hotkey) return;

      const command = findUiCommandByHotkey(hotkey);
      if (command) {
        e.preventDefault();
        executeUiCommand(command.id);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    openCommandPalette,
    closeCommandPalette,
    commandPaletteOpen,
    radialMenuOpen,
    closeRadialMenu,
    closeAllOverlays,
    toggleShortcutOverlay,
    shortcutOverlayOpen,
  ]);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if user is typing in an input/textarea
 */
function isTypingInInput(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement;
  const tagName = target.tagName.toLowerCase();

  // Input elements
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  // Content editable
  if (target.isContentEditable) {
    return true;
  }

  return false;
}

/**
 * Hook for registering a component-specific hotkey
 */
export function useHotkey(
  hotkey: string,
  callback: () => void,
  deps: React.DependencyList = []
): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (isTypingInInput(e)) return;

      const pressed = eventToHotkey(e);
      if (pressed === hotkey.toLowerCase()) {
        e.preventDefault();
        callback();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotkey, ...deps]);
}

// ============================================================================
// Context Menu Handler Hook
// ============================================================================

/**
 * Hook to open RadialMenu on double middle-click (scroll wheel) in canvas area
 */
export function useRadialMenuTrigger(): void {
  const openRadialMenu = useUiStore((s) => s.openRadialMenu);
  const lastMiddleClickRef = useRef<number>(0);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent): void {
      // Only middle button (scroll wheel click)
      if (e.button !== 1) return;

      const target = e.target as HTMLElement;

      // Only trigger on canvas or elements marked for radial menu
      if (
        target.tagName === 'CANVAS' ||
        target.closest('[data-radial-menu-area]')
      ) {
        e.preventDefault();
        const now = Date.now();
        if (now - lastMiddleClickRef.current < 400) {
          openRadialMenu(e.clientX, e.clientY);
          lastMiddleClickRef.current = 0; // reset after opening
        } else {
          lastMiddleClickRef.current = now;
        }
      }
    }

    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [openRadialMenu]);
}
