/**
 * telemetryHotkeys.ts - Keyboard Shortcuts for Telemetry
 *
 * SHORTCUTS:
 * - Ctrl+Shift+T: Toggle telemetry on/off
 * - Ctrl+Shift+R: Reset telemetry (clear events)
 * - Ctrl+Shift+D: Toggle debug level (INFO ↔ DEBUG)
 *
 * USAGE:
 * import { installTelemetryHotkeys } from './telemetryHotkeys';
 *
 * // In app init
 * installTelemetryHotkeys();
 */

import { TELEMETRY } from './telemetrySingleton';
import { ALERTS, resetPipeline, togglePipeline } from './telemetryPipeline';

// ============================================
// HOTKEY HANDLER
// ============================================

let installed = false;

/**
 * Install telemetry hotkeys
 * Safe to call multiple times (only installs once)
 *
 * HOTKEYS:
 * - Ctrl+Shift+T: Toggle telemetry + alerts
 * - Ctrl+Shift+R: Reset telemetry + alerts
 * - Ctrl+Shift+D: Toggle debug level (INFO ↔ DEBUG)
 * - Ctrl+Shift+A: Toggle alerts only
 */
export function installTelemetryHotkeys(): void {
  if (installed) return;
  if (typeof window === 'undefined') return;

  window.addEventListener('keydown', handleTelemetryHotkey);
  installed = true;
}

/**
 * Uninstall telemetry hotkeys
 */
export function uninstallTelemetryHotkeys(): void {
  if (!installed) return;
  if (typeof window === 'undefined') return;

  window.removeEventListener('keydown', handleTelemetryHotkey);
  installed = false;
}

/**
 * Handle hotkey events
 */
function handleTelemetryHotkey(e: KeyboardEvent): void {
  // Ignore if in input/textarea
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return;
  }

  // Ctrl+Shift+T: Toggle telemetry + alerts
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 't') {
    e.preventDefault();
    const newState = togglePipeline();
    console.log(`[Telemetry] ${newState ? 'Enabled' : 'Disabled'} (with alerts)`);
    return;
  }

  // Ctrl+Shift+R: Reset telemetry + alerts
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    resetPipeline();
    console.log('[Telemetry] Reset (including alerts)');
    return;
  }

  // Ctrl+Shift+D: Toggle debug level
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    const cfg = TELEMETRY.getConfig();
    const newLevel = cfg.minLevel === 'DEBUG' ? 'INFO' : 'DEBUG';
    TELEMETRY.setMinLevel(newLevel);
    console.log(`[Telemetry] Level: ${newLevel}`);
    return;
  }

  // Ctrl+Shift+A: Toggle alerts only
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    const newState = !ALERTS.isEnabled();
    ALERTS.setEnabled(newState);
    console.log(`[Alerts] ${newState ? 'Enabled' : 'Disabled'}`);
    return;
  }
}

// ============================================
// PROGRAMMATIC TOGGLE
// ============================================

/**
 * Toggle telemetry and return new state
 */
export function toggleTelemetry(): boolean {
  const newState = !TELEMETRY.isEnabled();
  TELEMETRY.setEnabled(newState);
  return newState;
}

/**
 * Quick enable telemetry
 */
export function enableTelemetry(): void {
  TELEMETRY.setEnabled(true);
}

/**
 * Quick disable telemetry
 */
export function disableTelemetry(): void {
  TELEMETRY.setEnabled(false);
}

// ============================================
// CONSOLE COMMANDS (for browser console)
// ============================================

/**
 * Install console commands for debugging
 *
 * After calling this, you can use in browser console:
 * - window.telemetry.enable()
 * - window.telemetry.disable()
 * - window.telemetry.toggle()
 * - window.telemetry.reset()
 * - window.telemetry.snapshot(100)
 * - window.telemetry.counters()
 */
export function installConsoleCommands(): void {
  if (typeof window === 'undefined') return;

  (window as any).telemetry = {
    enable: () => {
      TELEMETRY.setEnabled(true);
      console.log('[Telemetry] Enabled');
    },
    disable: () => {
      TELEMETRY.setEnabled(false);
      console.log('[Telemetry] Disabled');
    },
    toggle: () => {
      const newState = !TELEMETRY.isEnabled();
      TELEMETRY.setEnabled(newState);
      console.log(`[Telemetry] ${newState ? 'Enabled' : 'Disabled'}`);
      return newState;
    },
    reset: () => {
      TELEMETRY.reset();
      console.log('[Telemetry] Reset');
    },
    snapshot: (limit: number = 100) => {
      return TELEMETRY.snapshot(limit);
    },
    counters: () => {
      return { ...TELEMETRY.counters };
    },
    status: () => {
      const cfg = TELEMETRY.getConfig();
      return {
        enabled: cfg.enabled,
        minLevel: cfg.minLevel,
        ringSize: cfg.ringSize,
        eventCount: TELEMETRY.totalCount(),
        counters: { ...TELEMETRY.counters },
      };
    },
  };

  console.log('[Telemetry] Console commands installed. Use window.telemetry.status() to check.');
}
