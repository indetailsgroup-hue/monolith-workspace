/**
 * RULGauge — SVG ring gauge showing Remaining Useful Life as a percentage
 *
 * Renders a circular arc where:
 *   100% = full scale (η characteristic life, no degradation)
 *   0%   = imminent failure
 */
import React from 'react';

interface RULGaugeProps {
  /** RUL remaining in hours */
  rulHours: number;
  /** Scale (characteristic life) for this component in hours */
  scaleHours: number;
  /** Confidence in the prediction (0–1) */
  confidence: number;
  /** Overall component health status */
  status: string;
  /** Size in px (default 96) */
  size?: number;
}

const STATUS_COLORS: Record<string, string> = {
  HEALTHY: '#22c55e',
  DEGRADING: '#84cc16',
  WARNING: '#f59e0b',
  CRITICAL: '#ef4444',
  FAILED: '#7f1d1d',
};

export function RULGauge({
  rulHours,
  scaleHours,
  confidence,
  status,
  size = 96,
}: RULGaugeProps): React.ReactElement {
  const pct = Math.min(1, Math.max(0, rulHours / scaleHours));
  const color = STATUS_COLORS[status] ?? '#6b7280';

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const stroke = size * 0.09;
  const circumference = 2 * Math.PI * r;
  const dash = pct * circumference;

  // Format hours
  const label =
    rulHours >= 1000
      ? `${(rulHours / 1000).toFixed(1)}k`
      : `${Math.round(rulHours)}`;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#1a1a2e"
          strokeWidth={stroke}
        />
        {/* Fill */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>

      {/* Center label */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0,
        }}
      >
        <span style={{ color, fontSize: size * 0.19, fontWeight: 800, lineHeight: 1 }}>
          {label}
        </span>
        <span style={{ color: '#9ca3af', fontSize: size * 0.11, lineHeight: 1.2 }}>h</span>
        <span
          style={{
            color: '#6b7280',
            fontSize: size * 0.09,
            marginTop: 2,
            lineHeight: 1,
          }}
        >
          {Math.round(confidence * 100)}% conf
        </span>
      </div>
    </div>
  );
}
