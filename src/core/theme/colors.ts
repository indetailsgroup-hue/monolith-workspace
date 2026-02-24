/**
 * colors.ts - MONOLITH Semantic Color Tokens
 *
 * Centralized color definitions for consistent theming.
 * Based on dark theme with purple accent.
 */

// ============================================================================
// Base Colors
// ============================================================================

export const colors = {
  // Background layers
  bg: {
    base: 'rgb(var(--surface-0))',       // Deepest background
    primary: 'rgb(var(--bg-primary))',   // Main background
    secondary: 'rgb(var(--bg-secondary))', // Elevated surfaces
    tertiary: 'rgb(var(--bg-tertiary))', // Cards, panels
    hover: 'rgb(var(--surface-3))',      // Hover states
  },

  // Border colors
  border: {
    subtle: 'rgb(var(--border-subtle))',  // Subtle separators
    default: 'rgb(var(--border-default))', // Default borders
    strong: 'rgb(var(--border-hover))',   // Emphasized borders
  },

  // Text colors
  text: {
    primary: 'rgb(var(--text-primary))',    // Primary text
    secondary: 'rgb(var(--text-secondary))', // Secondary text
    muted: 'rgb(var(--text-muted))',        // Muted/disabled text
    inverse: 'rgb(var(--text-inverse))',    // Text on light backgrounds
  },

  // Accent colors
  accent: {
    purple: 'rgb(var(--accent-purple))',        // Primary accent
    purpleHover: 'rgb(var(--accent-purple-hover))',
    purpleMuted: 'rgb(var(--accent-purple-muted))',
  },

  // Semantic colors
  success: {
    base: '#22c55e',
    bg: '#0d3320',
    border: '#166534',
    text: '#4ade80',
  },

  warning: {
    base: '#f59e0b',
    bg: '#422006',
    border: '#92400e',
    text: '#fbbf24',
  },

  error: {
    base: '#ef4444',
    bg: '#450a0a',
    border: '#991b1b',
    text: '#f87171',
  },

  info: {
    base: '#3b82f6',
    bg: '#1e3a5f',
    border: '#1d4ed8',
    text: '#60a5fa',
  },

  // Status colors (for spec states, verification, etc.)
  status: {
    draft: '#6b7280',      // Gray
    frozen: '#3b82f6',     // Blue
    released: '#22c55e',   // Green
    pending: '#f59e0b',    // Amber
    pass: '#22c55e',       // Green
    warn: '#f59e0b',       // Amber
    fail: '#ef4444',       // Red
  },

  // Role colors
  role: {
    designer: '#8b5cf6',   // Purple
    factory: '#3b82f6',    // Blue
    installer: '#22c55e',  // Green
    finance: '#f59e0b',    // Amber
    admin: '#ef4444',      // Red
  },
} as const;

// ============================================================================
// Status Color Helpers
// ============================================================================

export type StatusType = 'success' | 'warning' | 'error' | 'info' | 'neutral';
export type SpecState = 'DRAFT' | 'FROZEN' | 'RELEASED';
export type VerifyStatus = 'PASS' | 'PASS_WITH_WARN' | 'FAIL' | 'PENDING';

/**
 * Get color scheme for a status type
 */
export function getStatusColors(status: StatusType) {
  switch (status) {
    case 'success':
      return colors.success;
    case 'warning':
      return colors.warning;
    case 'error':
      return colors.error;
    case 'info':
      return colors.info;
    case 'neutral':
    default:
      return {
        base: colors.text.muted,
        bg: colors.bg.tertiary,
        border: colors.border.default,
        text: colors.text.secondary,
      };
  }
}

/**
 * Get status type from spec state
 */
export function getSpecStateStatus(state: SpecState): StatusType {
  switch (state) {
    case 'DRAFT':
      return 'neutral';
    case 'FROZEN':
      return 'info';
    case 'RELEASED':
      return 'success';
    default:
      return 'neutral';
  }
}

/**
 * Get status type from verify status
 */
export function getVerifyStatusType(status: VerifyStatus): StatusType {
  switch (status) {
    case 'PASS':
      return 'success';
    case 'PASS_WITH_WARN':
      return 'warning';
    case 'FAIL':
      return 'error';
    case 'PENDING':
    default:
      return 'neutral';
  }
}

/**
 * Get color for spec state
 */
export function getSpecStateColor(state: SpecState): string {
  switch (state) {
    case 'DRAFT':
      return colors.status.draft;
    case 'FROZEN':
      return colors.status.frozen;
    case 'RELEASED':
      return colors.status.released;
    default:
      return colors.text.muted;
  }
}

/**
 * Get color for verify status
 */
export function getVerifyStatusColor(status: VerifyStatus): string {
  switch (status) {
    case 'PASS':
      return colors.status.pass;
    case 'PASS_WITH_WARN':
      return colors.status.warn;
    case 'FAIL':
      return colors.status.fail;
    case 'PENDING':
    default:
      return colors.status.pending;
  }
}

export default colors;
