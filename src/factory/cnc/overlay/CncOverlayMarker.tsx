/**
 * CncOverlayMarker.tsx - Single CNC Overlay Marker Component
 *
 * Renders a single drilling/boring point as a 3D cylinder marker.
 * Shows diameter as cylinder radius, depth as cylinder height.
 *
 * Visual features:
 * - Color-coded by operation type (DRILL=green, BORE=purple, THROUGH=amber)
 * - Depth indicator extending into material
 * - Hover tooltip with details
 * - Selection highlight
 *
 * @version 1.0.0 - Phase D4.x
 */

import React, { useRef, useMemo, useState, useCallback } from 'react';
import { Cylinder, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { CncOverlayPoint, CncOverlayMarkerStyle } from './cncOverlayTypes';
import { getOverlayPointColor, OVERLAY_COLORS } from './cncOverlayTypes';
import { overlayPointToThreePosition, type OverlayPreviewState } from './overlayPreviewTransform';

// ============================================================================
// TYPES
// ============================================================================

export interface CncOverlayMarkerProps {
  /** Overlay point data */
  point: CncOverlayPoint;
  /** Style settings */
  style: CncOverlayMarkerStyle;
  /** Whether this marker is selected */
  isSelected?: boolean;
  /** Whether this marker is hovered */
  isHovered?: boolean;
  /** Preview transform state (flip/rotate) — preview-only, does not affect truth */
  previewState?: OverlayPreviewState | null;
  /** Callback when marker is clicked */
  onClick?: (pointId: string) => void;
  /** Callback when marker is hovered */
  onHover?: (pointId: string | null) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Scale factor to convert mm to Three.js units (m) */
const MM_TO_M = 0.001;

/** Minimum marker height for visibility */
const MIN_MARKER_HEIGHT = 0.002; // 2mm

/** Selection ring thickness */
const SELECTION_RING_THICKNESS = 0.002;

// ============================================================================
// COMPONENT
// ============================================================================

export const CncOverlayMarker: React.FC<CncOverlayMarkerProps> = ({
  point,
  style,
  isSelected = false,
  isHovered = false,
  previewState,
  onClick,
  onHover,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  // Calculate marker dimensions
  const markerDimensions = useMemo(() => {
    const radius = (point.diameter / 2) * MM_TO_M * style.scale;
    const height = Math.max(point.depth * MM_TO_M * style.scale, MIN_MARKER_HEIGHT);
    return { radius, height };
  }, [point.diameter, point.depth, style.scale]);

  // Calculate position with preview transform (D4.2)
  // Uses P' = A + M(P-A) in mm-space, then converts to Three.js coords
  const position = useMemo((): [number, number, number] => {
    return overlayPointToThreePosition(point, previewState, markerDimensions.height / 2);
  }, [point, previewState, markerDimensions.height]);

  // Get color based on point type
  const color = useMemo(() => {
    return getOverlayPointColor(point);
  }, [point]);

  // Create material
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: isHovered ? 1 : style.opacity,
      emissive: isSelected ? new THREE.Color(color) : new THREE.Color(0x000000),
      emissiveIntensity: isSelected ? 0.3 : 0,
    });
  }, [color, style.opacity, isHovered, isSelected]);

  // Event handlers
  const handlePointerEnter = useCallback(() => {
    setShowTooltip(true);
    onHover?.(point.id);
  }, [point.id, onHover]);

  const handlePointerLeave = useCallback(() => {
    setShowTooltip(false);
    onHover?.(null);
  }, [onHover]);

  const handleClick = useCallback((e: THREE.Event) => {
    (e as unknown as { stopPropagation?: () => void }).stopPropagation?.();
    onClick?.(point.id);
  }, [point.id, onClick]);

  return (
    <group position={position}>
      {/* Main cylinder marker */}
      <Cylinder
        ref={meshRef}
        args={[markerDimensions.radius, markerDimensions.radius, markerDimensions.height, 16]}
        material={material}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
      />

      {/* Depth indicator (wireframe outline at top) */}
      {style.showDepthIndicator && (
        <Cylinder
          args={[markerDimensions.radius * 1.1, markerDimensions.radius * 1.1, 0.001, 16]}
          position={[0, markerDimensions.height / 2, 0]}
        >
          <meshBasicMaterial
            color={color}
            wireframe
            transparent
            opacity={0.5}
          />
        </Cylinder>
      )}

      {/* Selection ring */}
      {isSelected && (
        <Cylinder
          args={[
            markerDimensions.radius + SELECTION_RING_THICKNESS,
            markerDimensions.radius + SELECTION_RING_THICKNESS,
            markerDimensions.height + 0.002,
            16,
          ]}
        >
          <meshBasicMaterial
            color="#ffffff"
            wireframe
            transparent
            opacity={0.8}
          />
        </Cylinder>
      )}

      {/* Tooltip */}
      {showTooltip && style.showLabel && (
        <Html
          position={[0, markerDimensions.height / 2 + 0.02, 0]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <MarkerTooltip point={point} />
        </Html>
      )}
    </group>
  );
};

// ============================================================================
// TOOLTIP COMPONENT
// ============================================================================

interface MarkerTooltipProps {
  point: CncOverlayPoint;
}

const MarkerTooltip: React.FC<MarkerTooltipProps> = ({ point }) => {
  const color = getOverlayPointColor(point);

  return (
    <div
      style={{
        background: 'rgba(26, 26, 46, 0.95)',
        border: `1px solid ${color}`,
        borderRadius: '4px',
        padding: '8px 12px',
        minWidth: '160px',
        fontSize: '11px',
        fontFamily: 'monospace',
        color: '#e0e0e0',
        whiteSpace: 'nowrap',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header */}
      <div
        style={{
          fontWeight: 'bold',
          marginBottom: '4px',
          color: color,
          borderBottom: '1px solid #3a3a5a',
          paddingBottom: '4px',
        }}
      >
        {point.label}
      </div>

      {/* Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <TooltipRow label="Face" value={point.face} />
        <TooltipRow label="Cycle" value={point.cycle} />
        <TooltipRow label="Feed" value={`${point.feedRate} mm/min`} />
        <TooltipRow label="RPM" value={`${point.rpm}`} />
        {point.throughHole && (
          <TooltipRow
            label="Type"
            value="Through-hole"
            valueColor={OVERLAY_COLORS.THROUGH}
          />
        )}
        {point.peckDepth && (
          <TooltipRow label="Peck" value={`${point.peckDepth}mm`} />
        )}
        {point.dwellTime && (
          <TooltipRow label="Dwell" value={`${point.dwellTime}s`} />
        )}
      </div>

      {/* Comment */}
      {point.comment && (
        <div
          style={{
            marginTop: '4px',
            paddingTop: '4px',
            borderTop: '1px solid #3a3a5a',
            fontStyle: 'italic',
            color: '#888',
            fontSize: '10px',
          }}
        >
          {point.comment}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

interface TooltipRowProps {
  label: string;
  value: string;
  valueColor?: string;
}

const TooltipRow: React.FC<TooltipRowProps> = ({ label, value, valueColor }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
    <span style={{ color: '#888' }}>{label}:</span>
    <span style={{ color: valueColor || '#e0e0e0' }}>{value}</span>
  </div>
);

export default CncOverlayMarker;
