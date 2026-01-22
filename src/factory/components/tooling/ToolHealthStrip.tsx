/**
 * ToolHealthStrip.tsx - Tool Health Status Strip
 *
 * Displays tool health status in a horizontal strip.
 * Shows OVER_LIMIT and NEARING_LIMIT tools prominently.
 *
 * D6-E.2: Factory Intelligence UI
 * @version 1.0.0
 */

import React, { useEffect, useState } from 'react';
import type { ToolHealth } from '../../tooling';
import { listNearingLimitTools, listToolHealth } from '../../tooling';

export interface ToolHealthStripProps {
  /** Maximum number of tools to show (default: 4) */
  maxTools?: number;
  /** Show all tools or only those needing attention (default: false) */
  showAllTools?: boolean;
  /** Callback when a tool is clicked */
  onToolClick?: (tool: ToolHealth) => void;
  /** Size variant */
  size?: 'sm' | 'md';
}

const sizeStyles = {
  sm: {
    gap: 6,
    padding: '4px 8px',
    fontSize: 10,
    dotSize: 6,
  },
  md: {
    gap: 8,
    padding: '6px 10px',
    fontSize: 11,
    dotSize: 8,
  },
};

/**
 * Get color for tool health status.
 */
function getStatusColor(status: ToolHealth['status']): string {
  switch (status) {
    case 'OVER_LIMIT':
      return '#ef4444'; // red
    case 'NEARING_LIMIT':
      return '#f59e0b'; // amber
    case 'OK':
      return '#22c55e'; // green
  }
}

/**
 * Format percentage for display (showing wear %, not health %).
 */
function formatWearPct(healthPct: number): string {
  const wearPct = Math.round(100 - healthPct);
  return `${wearPct}%`;
}

export function ToolHealthStrip({
  maxTools = 4,
  showAllTools = false,
  onToolClick,
  size = 'md',
}: ToolHealthStripProps): React.ReactElement | null {
  const [tools, setTools] = useState<ToolHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const data = showAllTools
          ? await listToolHealth()
          : await listNearingLimitTools();

        if (mounted) {
          setTools(data.slice(0, maxTools));
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setTools([]);
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [maxTools, showAllTools]);

  const sizeStyle = sizeStyles[size];

  // Don't render anything if loading or no tools
  if (loading) return null;
  if (tools.length === 0 && !showAllTools) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: sizeStyle.gap,
        padding: sizeStyle.padding,
        backgroundColor: '#1a1a2e',
        border: '1px solid #3a3a5a',
        borderRadius: '6px',
      }}
    >
      {/* Label */}
      <span
        style={{
          fontSize: sizeStyle.fontSize,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginRight: 4,
        }}
      >
        Tools
      </span>

      {/* Tool chips */}
      {tools.map((tool) => (
        <ToolChip
          key={tool.toolId}
          tool={tool}
          size={size}
          onClick={onToolClick ? () => onToolClick(tool) : undefined}
        />
      ))}

      {/* Empty state */}
      {tools.length === 0 && showAllTools && (
        <span style={{ fontSize: sizeStyle.fontSize, color: '#666' }}>
          No tools tracked
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Tool Chip
// ============================================================================

interface ToolChipProps {
  tool: ToolHealth;
  size: 'sm' | 'md';
  onClick?: () => void;
}

function ToolChip({ tool, size, onClick }: ToolChipProps): React.ReactElement {
  const sizeStyle = sizeStyles[size];
  const color = getStatusColor(tool.status);

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        backgroundColor: `${color}15`,
        border: `1px solid ${color}40`,
        borderRadius: '4px',
        fontSize: sizeStyle.fontSize,
        fontWeight: 500,
        color: color,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background-color 0.15s',
      }}
      title={`${tool.toolId}: ${formatWearPct(tool.healthPct)} worn`}
    >
      {/* Status dot */}
      <span
        style={{
          width: sizeStyle.dotSize,
          height: sizeStyle.dotSize,
          borderRadius: '50%',
          backgroundColor: color,
          animation: tool.status !== 'OK' ? 'tool-pulse 2s infinite' : undefined,
        }}
      />

      {/* Tool ID (shortened) */}
      <span>{shortenToolId(tool.toolId)}</span>

      {/* Wear percentage */}
      <span style={{ opacity: 0.8 }}>{formatWearPct(tool.healthPct)}</span>

      {/* Pulse animation */}
      <style>{`
        @keyframes tool-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </button>
  );
}

/**
 * Shorten tool ID for display.
 * DRILL_5 → D5, BORE_35 → B35
 */
function shortenToolId(toolId: string): string {
  const match = toolId.match(/^(DRILL|BORE)_(\d+)$/i);
  if (match) {
    const prefix = match[1].toUpperCase() === 'DRILL' ? 'D' : 'B';
    return `${prefix}${match[2]}`;
  }
  // Fallback: first 6 chars
  return toolId.length > 6 ? toolId.slice(0, 6) : toolId;
}

export default ToolHealthStrip;
