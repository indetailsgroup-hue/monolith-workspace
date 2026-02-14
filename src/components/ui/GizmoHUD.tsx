/**
 * GizmoHUD.tsx - On-Screen Display for Gizmo State
 *
 * Shows:
 * - Current space (LOCAL/WORLD)
 * - Active axis (X/Y/Z)
 * - Delta in mm along axis
 * - Step/Fine mode status
 * - Snap engaged/candidates
 * - Collision/Gate status
 *
 * Hotkey: H to toggle visibility
 */

import React from 'react';
import type { GizmoAxis, GizmoSpace, GizmoPlane, GizmoPlaneMode } from '../../core/gizmo/gizmoTypes';
import type { PlaneDelta2D, PlaneAxisLock } from '../../core/gizmo/translatePlaneDrag';

// ============================================
// TYPES
// ============================================

export interface GizmoHUDProps {
  visible: boolean;

  // Gizmo state
  space: GizmoSpace;
  axis: GizmoAxis;
  plane: GizmoPlane | null;
  isDragging: boolean;

  // Delta for axis
  deltaMm: number;

  // Delta for plane (2D)
  planeDelta?: PlaneDelta2D | null;

  // Plane axis lock (U/V when Shift held)
  planeLock?: PlaneAxisLock;

  // Plane mode (CENTER/U/V from handle type)
  planeMode?: GizmoPlaneMode | null;

  // Modifiers
  stepMm: number | null;
  isFine: boolean;
  isAlt?: boolean;  // Alt key for fine mode in plane

  // Snap status
  snapEnabled: boolean;
  engaged: boolean;
  candidates: number;

  // Stability pack debug (optional)
  engageStrength?: number | null;  // 0..1
  dampingAlpha?: number | null;    // 0.35..1

  // Performance/Gate (optional)
  collisionMs?: number | null;
  gateOk?: boolean | null;
}

// ============================================
// COMPONENT
// ============================================

export function GizmoHUD({
  visible,
  space,
  axis,
  plane,
  isDragging,
  deltaMm,
  planeDelta,
  planeLock,
  planeMode,
  stepMm,
  isFine,
  isAlt,
  snapEnabled,
  engaged,
  candidates,
  engageStrength,
  dampingAlpha,
  collisionMs,
  gateOk,
}: GizmoHUDProps) {
  if (!visible) return null;

  // Axis colors
  const axisColor = axis === 'X' ? '#ff4444' : axis === 'Y' ? '#44ff44' : axis === 'Z' ? '#4444ff' : '#888888';

  // Plane colors (use gradient for plane)
  const planeColor = plane === 'XY' ? '#ff44ff' : plane === 'XZ' ? '#ffff44' : plane === 'YZ' ? '#44ffff' : '#888888';

  // Determine if we're in plane mode
  const isPlaneMode = plane !== null;

  // Get axis labels for plane
  const getPlaneAxisLabels = (p: GizmoPlane): { u: string; v: string } => {
    switch (p) {
      case 'XY': return { u: 'X', v: 'Y' };
      case 'XZ': return { u: 'X', v: 'Z' };
      case 'YZ': return { u: 'Y', v: 'Z' };
    }
  };

  const planeAxes = plane ? getPlaneAxisLabels(plane) : null;

  const Line = ({ label, value, valueColor }: { label: string; value: React.ReactNode; valueColor?: string }) => (
    <div className="flex justify-between gap-3">
      <span className="text-gray-400">{label}</span>
      <span className="font-mono" style={{ color: valueColor }}>{value}</span>
    </div>
  );

  return (
    <div className="fixed left-3 bottom-3 w-72 p-3 rounded-xl bg-black/85 border border-white/10 text-white text-xs z-[99998] backdrop-blur-sm">
      {/* Header */}
      <div className="flex justify-between items-center mb-2 pb-2 border-b border-white/10">
        <span className="font-semibold text-sm">Gizmo Translate</span>
        <span className="text-gray-500 text-[10px]">H to toggle</span>
      </div>

      {/* Space & Axis/Plane */}
      <div className="space-y-1 mb-3">
        <Line
          label="Space"
          value={
            <span className={space === 'LOCAL' ? 'text-cyan-400' : 'text-orange-400'}>
              {space}
            </span>
          }
        />
        <Line
          label="Handle"
          value={
            <span className={isPlaneMode ? 'text-purple-400' : 'text-blue-400'}>
              {isPlaneMode
                ? (planeMode === 'U' ? `PLANE ${planeAxes?.u}` :
                   planeMode === 'V' ? `PLANE ${planeAxes?.v}` :
                   'PLANE CENTER')
                : 'AXIS'}
            </span>
          }
        />
        {isPlaneMode ? (
          <>
            <Line
              label="Plane"
              value={<span style={{ color: planeColor }}>{plane}</span>}
            />
            <Line
              label="Mode"
              value={
                <span className={planeMode === 'CENTER' ? 'text-green-400' : 'text-yellow-400'}>
                  {planeMode === 'U' ? `${planeAxes?.u} only` :
                   planeMode === 'V' ? `${planeAxes?.v} only` :
                   'FREE (u+v)'}
                </span>
              }
            />
            {planeMode === 'CENTER' && (
              <Line
                label="Lock"
                value={
                  planeLock ? (
                    <span className="text-yellow-400 font-semibold">
                      {planeLock === 'U' ? planeAxes?.u : planeAxes?.v}
                    </span>
                  ) : (
                    <span className="text-gray-500">— (Shift to lock)</span>
                  )
                }
              />
            )}
          </>
        ) : (
          <Line
            label="Axis"
            value={axis ? <span style={{ color: axisColor }}>{axis}</span> : <span className="text-gray-500">—</span>}
          />
        )}
        <Line
          label="Status"
          value={
            isDragging ? (
              <span className="text-green-400">DRAGGING</span>
            ) : (
              <span className="text-gray-500">IDLE</span>
            )
          }
        />
      </div>

      {/* Delta */}
      <div className="mb-3 p-2 rounded-lg bg-white/5">
        {isPlaneMode && planeDelta ? (
          // Plane mode: show 2D delta
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Δ{planeAxes?.u}</span>
              <span className="font-mono text-lg" style={{ color: planeAxes?.u === 'X' ? '#ff4444' : planeAxes?.u === 'Y' ? '#44ff44' : '#4444ff' }}>
                {planeDelta.u.toFixed(1)} <span className="text-xs text-gray-400">mm</span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Δ{planeAxes?.v}</span>
              <span className="font-mono text-lg" style={{ color: planeAxes?.v === 'Y' ? '#44ff44' : '#4444ff' }}>
                {planeDelta.v.toFixed(1)} <span className="text-xs text-gray-400">mm</span>
              </span>
            </div>
          </div>
        ) : (
          // Axis mode: show 1D delta
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Δ{axis || ''}</span>
            <span className="font-mono text-lg" style={{ color: axisColor }}>
              {deltaMm.toFixed(1)} <span className="text-xs text-gray-400">mm</span>
            </span>
          </div>
        )}
      </div>

      {/* Modifiers */}
      <div className="space-y-1 mb-3">
        <Line
          label="Step"
          value={
            stepMm ? (
              <span className="text-yellow-400">{stepMm} mm</span>
            ) : (
              <span className="text-gray-500">OFF</span>
            )
          }
        />
        {isPlaneMode ? (
          <>
            <Line
              label="Constrain"
              value={
                isFine ? (
                  <span className="text-yellow-400">Shift (lock axis)</span>
                ) : (
                  <span className="text-gray-500">OFF</span>
                )
              }
            />
            <Line
              label="Fine"
              value={
                isAlt ? (
                  <span className="text-purple-400">Alt (10%)</span>
                ) : (
                  <span className="text-gray-500">OFF</span>
                )
              }
            />
          </>
        ) : (
          <Line
            label="Fine"
            value={
              isFine ? (
                <span className="text-purple-400">Shift (10%)</span>
              ) : (
                <span className="text-gray-500">OFF</span>
              )
            }
          />
        )}
      </div>

      {/* Snap Status */}
      <div className="space-y-1 mb-3 p-2 rounded-lg bg-white/5">
        <Line
          label="Snap"
          value={
            snapEnabled ? (
              <span className="text-green-400">ENABLED</span>
            ) : (
              <span className="text-gray-500">DISABLED</span>
            )
          }
        />
        <Line
          label="Engaged"
          value={
            engaged ? (
              <span className="text-green-400 font-semibold">YES</span>
            ) : (
              <span className="text-gray-500">NO</span>
            )
          }
        />
        <Line
          label="Candidates"
          value={<span className={candidates > 0 ? 'text-blue-400' : 'text-gray-500'}>{candidates}</span>}
        />
        {/* Stability Pack Debug */}
        {engageStrength != null && (
          <Line
            label="Strength"
            value={
              <span className={engageStrength > 0.5 ? 'text-cyan-400' : 'text-gray-400'}>
                {(engageStrength * 100).toFixed(0)}%
              </span>
            }
          />
        )}
        {dampingAlpha != null && (
          <Line
            label="Damping α"
            value={
              <span className={dampingAlpha < 0.7 ? 'text-yellow-400' : 'text-gray-400'}>
                {dampingAlpha.toFixed(2)}
              </span>
            }
          />
        )}
      </div>

      {/* Performance/Gate */}
      {(collisionMs != null || gateOk != null) && (
        <div className="space-y-1 pt-2 border-t border-white/10">
          {collisionMs != null && (
            <Line
              label="Collision"
              value={
                <span className={collisionMs > 5 ? 'text-yellow-400' : 'text-green-400'}>
                  {collisionMs.toFixed(2)} ms
                </span>
              }
            />
          )}
          {gateOk != null && (
            <Line
              label="Gate"
              value={
                gateOk ? (
                  <span className="text-green-400">OK</span>
                ) : (
                  <span className="text-red-400">BLOCKED</span>
                )
              }
            />
          )}
        </div>
      )}

      {/* Hotkeys Reference */}
      <div className="mt-3 pt-2 border-t border-white/10 text-[10px] text-gray-500 leading-relaxed">
        <div><span className="text-gray-400">L</span> Toggle Local/World</div>
        <div><span className="text-gray-400">X/Y/Z</span> Lock to axis</div>
        {isPlaneMode ? (
          <>
            <div><span className="text-gray-400">Shift</span> Lock to U/V axis</div>
            <div><span className="text-gray-400">Alt</span> Fine mode (10%)</div>
          </>
        ) : (
          <div><span className="text-gray-400">Shift</span> Fine mode (10%)</div>
        )}
        <div><span className="text-gray-400">Ctrl</span> Step snap (1mm)</div>
        <div><span className="text-gray-400">1/5/0</span> Set step size</div>
      </div>
    </div>
  );
}

export default GizmoHUD;
