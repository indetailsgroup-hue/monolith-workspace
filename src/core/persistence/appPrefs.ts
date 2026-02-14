/**
 * appPrefs.ts - Application Preferences Boundary (Soft Layer)
 *
 * G9 COMPLIANCE: Uses unsafeStorage boundary for localStorage access.
 *
 * This module handles UI-only preferences that:
 * - Don't affect manufacturing/safety
 * - Should have safe defaults (never throw)
 * - Use lightweight validation
 *
 * For CRITICAL data (stores, policies, runtime), use unsafeStorage directly.
 *
 * @version 1.0.0 - G9 App Preferences Layer
 */

import { readString, writeRaw } from './unsafeStorage';

// ============================================
// CONSTANTS
// ============================================

const LS_THEME = 'theme';

// ============================================
// THEME PREFERENCES
// ============================================

/**
 * Application theme options
 */
export type AppTheme = 'dark' | 'light';

/**
 * Default theme
 */
export const DEFAULT_THEME: AppTheme = 'dark';

/**
 * Valid theme values for validation
 */
const VALID_THEMES: readonly AppTheme[] = ['dark', 'light'] as const;

/**
 * Check if value is a valid theme
 */
function isValidTheme(value: unknown): value is AppTheme {
  return typeof value === 'string' && VALID_THEMES.includes(value as AppTheme);
}

/**
 * Read current theme from preferences.
 *
 * Never throws - returns default if missing or invalid.
 *
 * @returns Current theme or default
 */
export function readTheme(): AppTheme {
  const stored = readString(LS_THEME);
  if (stored && isValidTheme(stored)) {
    return stored;
  }
  return DEFAULT_THEME;
}

/**
 * Write theme to preferences.
 *
 * @param theme - Theme to store
 */
export function writeTheme(theme: AppTheme): void {
  if (!isValidTheme(theme)) {
    // Silently ignore invalid themes (defensive)
    return;
  }
  writeRaw(LS_THEME, theme);
}

// ============================================
// LAYOUT PREFERENCES (Future)
// ============================================

// Reserved for future layout preferences:
// - Panel sizes
// - Sidebar collapsed state
// - View preferences
// These should follow the same pattern:
// - Lightweight validation
// - Safe defaults
// - Never throw

// ============================================
// EXPORTS
// ============================================

/**
 * App preferences namespace for convenience
 */
export const AppPrefs = {
  theme: {
    read: readTheme,
    write: writeTheme,
    default: DEFAULT_THEME,
  },
} as const;
