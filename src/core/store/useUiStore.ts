/**
 * useUiStore.ts - UI Overlay State Management
 *
 * Manages state for Command Palette, Radial Menu, and other UI overlays.
 * Centralized store for UI visibility and position.
 *
 * @version 1.1.0 - Added Immer middleware (T017)
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ============================================================================
// Types
// ============================================================================

interface RadialMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  selectedIndex: number | null;
}

interface CommandPaletteState {
  isOpen: boolean;
  query: string;
  selectedIndex: number;
}

interface ShortcutOverlayState {
  isOpen: boolean;
}

interface UiState {
  // Radial Menu
  radialMenu: RadialMenuState;
  openRadialMenu: (x: number, y: number) => void;
  closeRadialMenu: () => void;
  setRadialSelectedIndex: (index: number | null) => void;

  // Command Palette
  commandPalette: CommandPaletteState;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  setCommandPaletteQuery: (query: string) => void;
  setCommandPaletteSelectedIndex: (index: number) => void;
  toggleCommandPalette: () => void;

  // P001: Shortcut Help Overlay
  shortcutOverlay: ShortcutOverlayState;
  openShortcutOverlay: () => void;
  closeShortcutOverlay: () => void;
  toggleShortcutOverlay: () => void;

  // Global
  closeAllOverlays: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useUiStore = create<UiState>()(
  immer((set) => ({
    // ─────────────────────────────────────────────────────────────────────────
    // Radial Menu
    // ─────────────────────────────────────────────────────────────────────────
    radialMenu: {
      isOpen: false,
      position: { x: 0, y: 0 },
      selectedIndex: null,
    },

    openRadialMenu: (x, y) =>
      set((state) => {
        state.radialMenu.isOpen = true;
        state.radialMenu.position = { x, y };
        state.radialMenu.selectedIndex = null;
        // Close command palette when opening radial menu
        state.commandPalette.isOpen = false;
      }),

    closeRadialMenu: () =>
      set((state) => {
        state.radialMenu.isOpen = false;
        state.radialMenu.selectedIndex = null;
      }),

    setRadialSelectedIndex: (index) =>
      set((state) => {
        state.radialMenu.selectedIndex = index;
      }),

    // ─────────────────────────────────────────────────────────────────────────
    // Command Palette
    // ─────────────────────────────────────────────────────────────────────────
    commandPalette: {
      isOpen: false,
      query: '',
      selectedIndex: 0,
    },

    openCommandPalette: () =>
      set((state) => {
        state.commandPalette.isOpen = true;
        state.commandPalette.query = '';
        state.commandPalette.selectedIndex = 0;
        // Close radial menu when opening command palette
        state.radialMenu.isOpen = false;
      }),

    closeCommandPalette: () =>
      set((state) => {
        state.commandPalette.isOpen = false;
      }),

    setCommandPaletteQuery: (query) =>
      set((state) => {
        state.commandPalette.query = query;
        state.commandPalette.selectedIndex = 0; // Reset selection when query changes
      }),

    setCommandPaletteSelectedIndex: (index) =>
      set((state) => {
        state.commandPalette.selectedIndex = index;
      }),

    toggleCommandPalette: () =>
      set((state) => {
        const wasOpen = state.commandPalette.isOpen;
        state.commandPalette.isOpen = !wasOpen;
        state.commandPalette.query = wasOpen ? state.commandPalette.query : '';
        state.commandPalette.selectedIndex = 0;
      }),

    // ─────────────────────────────────────────────────────────────────────────
    // P001: Shortcut Help Overlay
    // ─────────────────────────────────────────────────────────────────────────
    shortcutOverlay: {
      isOpen: false,
    },

    openShortcutOverlay: () =>
      set((state) => {
        state.shortcutOverlay.isOpen = true;
        // Close other overlays
        state.radialMenu.isOpen = false;
        state.commandPalette.isOpen = false;
      }),

    closeShortcutOverlay: () =>
      set((state) => {
        state.shortcutOverlay.isOpen = false;
      }),

    toggleShortcutOverlay: () =>
      set((state) => {
        state.shortcutOverlay.isOpen = !state.shortcutOverlay.isOpen;
        if (state.shortcutOverlay.isOpen) {
          // Close other overlays when opening
          state.radialMenu.isOpen = false;
          state.commandPalette.isOpen = false;
        }
      }),

    // ─────────────────────────────────────────────────────────────────────────
    // Global
    // ─────────────────────────────────────────────────────────────────────────
    closeAllOverlays: () =>
      set((state) => {
        state.radialMenu.isOpen = false;
        state.radialMenu.position = { x: 0, y: 0 };
        state.radialMenu.selectedIndex = null;
        state.commandPalette.isOpen = false;
        state.commandPalette.query = '';
        state.commandPalette.selectedIndex = 0;
        state.shortcutOverlay.isOpen = false;
      }),
  }))
);

// ============================================================================
// Selectors
// ============================================================================

export const selectRadialMenuOpen = (state: UiState) => state.radialMenu.isOpen;
export const selectRadialMenuPosition = (state: UiState) => state.radialMenu.position;
export const selectCommandPaletteOpen = (state: UiState) => state.commandPalette.isOpen;
export const selectCommandPaletteQuery = (state: UiState) => state.commandPalette.query;
export const selectShortcutOverlayOpen = (state: UiState) => state.shortcutOverlay.isOpen;

// ============================================================================
// Export type
// ============================================================================

export type { UiState };
