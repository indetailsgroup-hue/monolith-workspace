/**
 * Cursor HUD - Plasticity-Style Floating Parameter Display
 *
 * Shows live parameter values floating next to the cursor during drag:
 * - Depth: 3.2mm (vertical drag)
 * - Offset: 12.5mm (horizontal drag)
 * - Fine mode indicator (Shift held)
 *
 * v1.0: Initial cursor HUD
 */

import type { CursorHUDData } from '@/core/modeling/dragInteraction';

interface CursorHUDProps {
  data: CursorHUDData;
}

export function CursorHUD({ data }: CursorHUDProps) {
  if (!data.visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: data.x + 20,
        top: data.y - 10,
        zIndex: 10000,
        pointerEvents: 'none',
        transform: 'translateY(-50%)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: '8px 12px',
          backgroundColor: 'rgba(26, 26, 46, 0.95)',
          border: '1px solid rgba(139, 92, 246, 0.5)',
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {data.values.map((item, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: '#8b5cf6',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                minWidth: 50,
              }}
            >
              {item.label}
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#fff',
                fontFamily: 'monospace',
              }}
            >
              {item.value.toFixed(1)}
            </span>
            <span
              style={{
                fontSize: 11,
                color: '#6b7280',
              }}
            >
              {item.unit}
            </span>
          </div>
        ))}

        {/* Snap mode indicator */}
        {data.shiftHeld && (
          <div
            style={{
              marginTop: 4,
              paddingTop: 4,
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: '#f59e0b',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Snap Mode
            </span>
            <span
              style={{
                fontSize: 9,
                color: '#6b7280',
              }}
            >
              ({data.snapValue ?? 0.5}mm steps)
            </span>
          </div>
        )}

        {/* Drag hint */}
        <div
          style={{
            marginTop: 4,
            display: 'flex',
            gap: 8,
            fontSize: 9,
            color: '#6b7280',
          }}
        >
          <span>↕ Depth</span>
          <span>↔ Offset</span>
          <span>Shift=Snap</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact single-value HUD (for single-axis drag)
 */
interface SingleValueHUDProps {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  value: number;
  unit: string;
  fineMode?: boolean;
  color?: string;
}

export function SingleValueHUD({
  visible,
  x,
  y,
  label,
  value,
  unit,
  fineMode = false,
  color = '#8b5cf6',
}: SingleValueHUDProps) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: x + 16,
        top: y - 16,
        zIndex: 10000,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          backgroundColor: 'rgba(26, 26, 46, 0.95)',
          border: `1px solid ${color}60`,
          borderRadius: 6,
          boxShadow: `0 2px 8px ${color}40`,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
            fontFamily: 'monospace',
          }}
        >
          {value.toFixed(1)}
        </span>
        <span style={{ fontSize: 10, color: '#6b7280' }}>{unit}</span>
        {fineMode && (
          <span
            style={{
              fontSize: 8,
              color: '#22c55e',
              fontWeight: 600,
              marginLeft: 4,
            }}
          >
            FINE
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Axis indicator arrows (shows drag direction)
 */
interface AxisIndicatorProps {
  visible: boolean;
  x: number;
  y: number;
  showVertical?: boolean;
  showHorizontal?: boolean;
}

export function AxisIndicator({
  visible,
  x,
  y,
  showVertical = true,
  showHorizontal = true,
}: AxisIndicatorProps) {
  if (!visible) return null;

  return (
    <svg
      style={{
        position: 'fixed',
        left: x - 30,
        top: y - 30,
        width: 60,
        height: 60,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      {/* Center point */}
      <circle cx="30" cy="30" r="3" fill="#8b5cf6" />

      {/* Vertical axis (depth) */}
      {showVertical && (
        <>
          <line
            x1="30"
            y1="8"
            x2="30"
            y2="52"
            stroke="#8b5cf6"
            strokeWidth="2"
            strokeDasharray="4,2"
            opacity="0.6"
          />
          <polygon
            points="30,4 26,12 34,12"
            fill="#8b5cf6"
            opacity="0.8"
          />
          <polygon
            points="30,56 26,48 34,48"
            fill="#8b5cf6"
            opacity="0.8"
          />
        </>
      )}

      {/* Horizontal axis (offset) */}
      {showHorizontal && (
        <>
          <line
            x1="8"
            y1="30"
            x2="52"
            y2="30"
            stroke="#22c55e"
            strokeWidth="2"
            strokeDasharray="4,2"
            opacity="0.6"
          />
          <polygon
            points="4,30 12,26 12,34"
            fill="#22c55e"
            opacity="0.8"
          />
          <polygon
            points="56,30 48,26 48,34"
            fill="#22c55e"
            opacity="0.8"
          />
        </>
      )}
    </svg>
  );
}

export default CursorHUD;
