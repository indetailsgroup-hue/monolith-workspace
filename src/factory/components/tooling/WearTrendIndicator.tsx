/**
 * WearTrendIndicator.tsx - Mini Sparkline for Tool Wear Trend
 *
 * Displays a visual micro-sparkline showing recent wear progression.
 * Shows last N data points as a mini line chart.
 *
 * D6.2: Real-Time Tool Degradation Monitoring
 * @version 1.0.0
 */

import React, { useMemo } from 'react';
import type { WearDataPoint } from '../../tooling';

export interface WearTrendIndicatorProps {
  /** Recent wear data points */
  wearHistory: WearDataPoint[];
  /** Max wear units for normalization */
  maxWearUnits: number;
  /** Current health percentage */
  healthPct: number;
  /** Trend direction */
  trend?: 'STABLE' | 'INCREASING' | 'RAPID';
  /** Size variant */
  size?: 'sm' | 'md';
  /** Show trend arrow */
  showArrow?: boolean;
}

const sizeConfig = {
  sm: { width: 32, height: 14, strokeWidth: 1.5 },
  md: { width: 48, height: 18, strokeWidth: 2 },
};

/**
 * Get color based on health and trend.
 */
function getTrendColor(healthPct: number, trend?: string): string {
  // Critical health - always red
  if (healthPct <= 15) return '#ef4444';

  // Rapid degradation - orange/red
  if (trend === 'RAPID') return '#f97316';

  // Nearing limit - amber
  if (healthPct <= 30) return '#f59e0b';

  // Increasing wear - yellow
  if (trend === 'INCREASING') return '#eab308';

  // Stable/OK - green
  return '#22c55e';
}

/**
 * Get trend arrow character.
 */
function getTrendArrow(trend?: string): string {
  switch (trend) {
    case 'RAPID':
      return '⬆'; // Up arrow (rapid degradation)
    case 'INCREASING':
      return '↗'; // Diagonal up
    case 'STABLE':
    default:
      return '→'; // Right arrow (stable)
  }
}

export function WearTrendIndicator({
  wearHistory,
  maxWearUnits,
  healthPct,
  trend = 'STABLE',
  size = 'sm',
  showArrow = true,
}: WearTrendIndicatorProps): React.ReactElement | null {
  const config = sizeConfig[size];
  const color = getTrendColor(healthPct, trend);

  // Build SVG path from wear history
  const pathData = useMemo(() => {
    if (wearHistory.length < 2) return null;

    const points = wearHistory.slice(-5); // Last 5 points
    if (points.length < 2) return null;

    // Normalize to SVG coordinates
    const padding = 2;
    const innerWidth = config.width - padding * 2;
    const innerHeight = config.height - padding * 2;

    // Find min/max for scaling (use max threshold as ceiling)
    const minWear = Math.min(...points.map((p) => p.wearUnits));
    const maxWear = Math.max(...points.map((p) => p.wearUnits), maxWearUnits * 0.5);
    const range = maxWear - minWear || 1;

    // Generate path points
    const coords = points.map((p, i) => {
      const x = padding + (i / (points.length - 1)) * innerWidth;
      // Invert Y (SVG 0,0 is top-left)
      const normalizedY = (p.wearUnits - minWear) / range;
      const y = padding + (1 - normalizedY) * innerHeight;
      return `${x},${y}`;
    });

    return `M ${coords.join(' L ')}`;
  }, [wearHistory, maxWearUnits, config.width, config.height]);

  // Not enough data - show placeholder
  if (!pathData) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          fontSize: size === 'sm' ? 8 : 9,
          color: '#666',
          opacity: 0.6,
        }}
        title="Not enough data for trend"
      >
        <svg width={config.width} height={config.height} viewBox={`0 0 ${config.width} ${config.height}`}>
          <line
            x1={2}
            y1={config.height / 2}
            x2={config.width - 2}
            y2={config.height / 2}
            stroke="#444"
            strokeWidth={1}
            strokeDasharray="2,2"
          />
        </svg>
        {showArrow && <span style={{ opacity: 0.5 }}>—</span>}
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
      }}
      title={`Trend: ${trend.toLowerCase()} (${wearHistory.length} data points)`}
    >
      {/* Mini sparkline */}
      <svg
        width={config.width}
        height={config.height}
        viewBox={`0 0 ${config.width} ${config.height}`}
        style={{
          backgroundColor: `${color}10`,
          borderRadius: 2,
        }}
      >
        {/* Trend line */}
        <path
          d={pathData}
          fill="none"
          stroke={color}
          strokeWidth={config.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Current point dot */}
        {wearHistory.length > 0 && (
          <circle
            cx={config.width - 2}
            cy={(() => {
              const points = wearHistory.slice(-5);
              const lastPoint = points[points.length - 1];
              const minWear = Math.min(...points.map((p) => p.wearUnits));
              const maxWear = Math.max(...points.map((p) => p.wearUnits), maxWearUnits * 0.5);
              const range = maxWear - minWear || 1;
              const normalizedY = (lastPoint.wearUnits - minWear) / range;
              return 2 + (1 - normalizedY) * (config.height - 4);
            })()}
            r={size === 'sm' ? 1.5 : 2}
            fill={color}
          />
        )}
      </svg>

      {/* Trend arrow */}
      {showArrow && (
        <span
          style={{
            fontSize: size === 'sm' ? 9 : 11,
            color: color,
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {getTrendArrow(trend)}
        </span>
      )}
    </span>
  );
}

export default WearTrendIndicator;
