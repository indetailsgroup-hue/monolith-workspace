/**
 * SketchHudInput.tsx - HUD Numeric Input Display
 *
 * Displays the HUD input overlay showing:
 * - Current length and angle
 * - User input for precise dimensions
 * - Format hints
 *
 * @version 1.0.0
 */

import React from 'react';
import {
  useSketchEnabled,
  useSketchTool,
  useSketchTempPoints,
  useSketchCursorPos,
  useSketchStore,
} from '../../core/sketch';
import { distance2D, angle2D } from '../../core/sketch/projectionUtils';
import { parseHud } from '../../core/sketch/hudNumeric';

// ============================================================================
// Component
// ============================================================================

export function SketchHudInput() {
  const enabled = useSketchEnabled();
  const tool = useSketchTool();
  const tempPoints = useSketchTempPoints();
  const cursorPos = useSketchCursorPos();
  const hudInput = useSketchStore((s) => s.hudInput);

  // Don't show if sketch mode disabled or select tool active
  if (!enabled || tool === 'select') {
    return null;
  }

  // Calculate current length and angle from last point to cursor
  let length = 0;
  let angleDeg = 0;

  if (tempPoints.length > 0 && cursorPos) {
    const lastPoint = tempPoints[tempPoints.length - 1];
    length = distance2D(lastPoint, cursorPos);
    angleDeg = angle2D(lastPoint, cursorPos);
  }

  // Parse HUD input to show preview
  const hudSpec = parseHud(hudInput);
  const isValid = hudSpec.valid;

  // Show effective values (HUD overrides cursor values)
  const effectiveLength = hudSpec.length !== null ? hudSpec.length : length;
  const effectiveAngle = hudSpec.angle !== null ? hudSpec.angle : angleDeg;

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 200,
        zIndex: 100,
        backgroundColor: 'rgba(26, 26, 46, 0.95)',
        border: `1px solid ${isValid ? '#3a3a5a' : '#ef4444'}`,
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 160,
        fontFamily: 'monospace',
        fontSize: 12,
        color: '#9ca3af',
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: 10,
          color: '#6b7280',
          marginBottom: 6,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>HUD Input</span>
        <span style={{ color: '#8b5cf6' }}>Tab: toggle</span>
      </div>

      {/* Current Values */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        <div>
          <span style={{ color: '#6b7280' }}>L=</span>
          <span
            style={{
              color: hudSpec.length !== null ? '#22c55e' : '#c4b5fd',
              fontWeight: hudSpec.length !== null ? 600 : 400,
            }}
          >
            {effectiveLength.toFixed(0)}
          </span>
          <span style={{ color: '#6b7280' }}>mm</span>
        </div>
        <div>
          <span style={{ color: '#6b7280' }}>@</span>
          <span
            style={{
              color: hudSpec.angle !== null ? '#22c55e' : '#c4b5fd',
              fontWeight: hudSpec.angle !== null ? 600 : 400,
            }}
          >
            {effectiveAngle.toFixed(1)}
          </span>
          <span style={{ color: '#6b7280' }}>°</span>
        </div>
      </div>

      {/* Input Display */}
      <div
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          border: `1px solid ${isValid ? '#3a3a5a' : '#ef4444'}`,
          borderRadius: 4,
          padding: '4px 8px',
          minHeight: 24,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {hudInput ? (
          <span style={{ color: isValid ? '#fcd34d' : '#ef4444' }}>
            {hudInput}
            <span
              style={{
                display: 'inline-block',
                width: 2,
                height: 14,
                backgroundColor: '#fcd34d',
                marginLeft: 2,
                animation: 'blink 1s infinite',
              }}
            />
          </span>
        ) : (
          <span style={{ color: '#4b5563', fontStyle: 'italic' }}>
            Type: 500 or 500@30 or @45
          </span>
        )}
      </div>

      {/* Hints */}
      <div
        style={{
          fontSize: 9,
          color: '#4b5563',
          marginTop: 6,
          lineHeight: 1.4,
        }}
      >
        <div>Enter: commit | Esc: clear | Backspace: delete</div>
      </div>
    </div>
  );
}

export default SketchHudInput;
