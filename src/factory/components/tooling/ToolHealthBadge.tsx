/**
 * ToolHealthBadge.tsx - Tool Health Warning Badge
 *
 * Small badge showing count of tools needing attention.
 * For use next to Generate button or in headers.
 *
 * D6-E.2: Factory Intelligence UI
 * @version 1.0.0
 */

import React, { useEffect, useState } from 'react';
import { listNearingLimitTools } from '../../tooling';

export interface ToolHealthBadgeProps {
  /** Callback when badge is clicked */
  onClick?: () => void;
  /** Show even when count is 0 (default: false) */
  showZero?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
}

const sizeStyles = {
  sm: {
    padding: '1px 5px',
    fontSize: 9,
    minWidth: 16,
  },
  md: {
    padding: '2px 6px',
    fontSize: 10,
    minWidth: 18,
  },
};

export function ToolHealthBadge({
  onClick,
  showZero = false,
  size = 'sm',
}: ToolHealthBadgeProps): React.ReactElement | null {
  const [count, setCount] = useState(0);
  const [hasOverLimit, setHasOverLimit] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const tools = await listNearingLimitTools();
        if (mounted) {
          setCount(tools.length);
          setHasOverLimit(tools.some((t) => t.status === 'OVER_LIMIT'));
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setCount(0);
          setHasOverLimit(false);
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const sizeStyle = sizeStyles[size];

  // Don't render if loading or count is 0 (unless showZero)
  if (loading) return null;
  if (count === 0 && !showZero) return null;

  // Color based on severity
  const color = hasOverLimit ? '#ef4444' : '#f59e0b';
  const bgColor = hasOverLimit ? '#ef444420' : '#f59e0b20';

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        padding: sizeStyle.padding,
        minWidth: sizeStyle.minWidth,
        backgroundColor: bgColor,
        border: `1px solid ${color}40`,
        borderRadius: '9999px',
        fontSize: sizeStyle.fontSize,
        fontWeight: 600,
        color: color,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background-color 0.15s',
      }}
      title={`${count} tool${count !== 1 ? 's' : ''} need${count === 1 ? 's' : ''} attention`}
    >
      <span style={{ fontSize: sizeStyle.fontSize }}>⚠</span>
      <span>{count}</span>
    </button>
  );
}

// ============================================================================
// Inline Tool Warning (text-based)
// ============================================================================

export interface ToolWarningTextProps {
  /** Custom prefix text */
  prefix?: string;
}

/**
 * Text-based warning for inline use.
 * Example: "⚠ 2 tools nearing limit"
 */
export function ToolWarningText({
  prefix = '',
}: ToolWarningTextProps): React.ReactElement | null {
  const [count, setCount] = useState(0);
  const [hasOverLimit, setHasOverLimit] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const tools = await listNearingLimitTools();
        if (mounted) {
          setCount(tools.length);
          setHasOverLimit(tools.some((t) => t.status === 'OVER_LIMIT'));
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setCount(0);
          setHasOverLimit(false);
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading || count === 0) return null;

  const color = hasOverLimit ? '#ef4444' : '#f59e0b';
  const text = hasOverLimit
    ? `${count} tool${count !== 1 ? 's' : ''} over limit`
    : `${count} tool${count !== 1 ? 's' : ''} nearing limit`;

  return (
    <span style={{ color, fontSize: 11 }}>
      {prefix}⚠ {text}
    </span>
  );
}

export default ToolHealthBadge;
