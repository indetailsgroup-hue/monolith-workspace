/**
 * SnapPreview.tsx - Visual feedback for cabinet snap system
 *
 * FEATURES:
 * - Ghost preview of snapped position
 * - Snap type indicator
 * - Connection line between snapped faces
 * - Color-coded by snap type
 */

import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import { DoubleSide } from 'three';
import { useSnapStore, SNAP_TYPE_LABELS, SNAP_TYPE_COLORS } from '../../core/store/useSnapStore';
import { SnapResult, CabinetDimensions, Vec3, AnchorKind } from '../../core/types/SnapTypes';

// ============================================
// TYPES
// ============================================

interface SnapPreviewProps {
  dimensions: CabinetDimensions;
  currentPosition: [number, number, number]; // Current drag position (corner-based)
}

interface SnapIndicatorProps {
  result: SnapResult;
  dimensions: CabinetDimensions;
}

// ============================================
// SNAP INDICATOR (3D label)
// ============================================

function SnapIndicator({ result, dimensions }: SnapIndicatorProps) {
  const snapType = result.candidate.type;
  const label = SNAP_TYPE_LABELS[snapType] || snapType;
  const color = SNAP_TYPE_COLORS[snapType] || '#ffffff';
  const gap = result.candidate.distanceMm;

  // Position at center of snapped cabinet
  const center = result.resolvedTransformB.position;
  const labelPos: [number, number, number] = [
    center.x,
    center.y + dimensions.height / 2 + 50, // Above cabinet
    center.z,
  ];

  return (
    <Html position={labelPos} center style={{ pointerEvents: 'none' }}>
      <div
        className="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shadow-lg"
        style={{
          backgroundColor: `${color}ee`,
          color: 'white',
          border: `2px solid ${color}`,
        }}
      >
        <div>{label}</div>
        <div className="text-[10px] opacity-80">Gap: {gap.toFixed(1)}mm</div>
        {!result.isValid && (
          <div className="text-red-200 text-[10px] mt-1">
            {result.validationErrors[0]}
          </div>
        )}
      </div>
    </Html>
  );
}

// ============================================
// FACE EDGE HIGHLIGHT
// ============================================

interface FaceEdgeHighlightProps {
  dimensions: CabinetDimensions;
  anchorKind: AnchorKind;
  color: string;
}

/**
 * Renders highlighted edges for a specific face of the cabinet.
 * Creates a glowing rectangular outline on the snapping face.
 */
function FaceEdgeHighlight({ dimensions, anchorKind, color }: FaceEdgeHighlightProps) {
  const { width, height, depth } = dimensions;
  const hw = width / 2;
  const hh = height / 2;
  const hd = depth / 2;

  // Calculate the four corner points for the face based on anchor kind
  const facePoints = useMemo(() => {
    switch (anchorKind) {
      case 'FACE_LEFT':
        // Left face (YZ plane at -X)
        return [
          [-hw, -hh, -hd],
          [-hw, -hh, hd],
          [-hw, hh, hd],
          [-hw, hh, -hd],
          [-hw, -hh, -hd], // Close the loop
        ];
      case 'FACE_RIGHT':
        // Right face (YZ plane at +X)
        return [
          [hw, -hh, -hd],
          [hw, hh, -hd],
          [hw, hh, hd],
          [hw, -hh, hd],
          [hw, -hh, -hd], // Close the loop
        ];
      case 'FACE_FRONT':
        // Front face (XY plane at +Z)
        return [
          [-hw, -hh, hd],
          [hw, -hh, hd],
          [hw, hh, hd],
          [-hw, hh, hd],
          [-hw, -hh, hd], // Close the loop
        ];
      case 'FACE_BACK':
        // Back face (XY plane at -Z)
        return [
          [-hw, -hh, -hd],
          [-hw, hh, -hd],
          [hw, hh, -hd],
          [hw, -hh, -hd],
          [-hw, -hh, -hd], // Close the loop
        ];
      case 'FACE_TOP':
        // Top face (XZ plane at +Y)
        return [
          [-hw, hh, -hd],
          [-hw, hh, hd],
          [hw, hh, hd],
          [hw, hh, -hd],
          [-hw, hh, -hd], // Close the loop
        ];
      case 'FACE_BOTTOM':
        // Bottom face (XZ plane at -Y)
        return [
          [-hw, -hh, -hd],
          [hw, -hh, -hd],
          [hw, -hh, hd],
          [-hw, -hh, hd],
          [-hw, -hh, -hd], // Close the loop
        ];
      default:
        return null;
    }
  }, [anchorKind, hw, hh, hd]);

  if (!facePoints) return null;

  const positionArray = new Float32Array(facePoints.flat() as number[]);

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={facePoints.length}
          array={positionArray}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color={color}
        linewidth={3}
        transparent
        opacity={1}
      />
    </line>
  );
}

// ============================================
// GHOST CABINET (preview of snapped position)
// ============================================

interface GhostCabinetProps {
  dimensions: CabinetDimensions;
  centerPosition: Vec3;
  color: string;
  isValid: boolean;
  snapAnchorKind?: AnchorKind;
}

function GhostCabinet({ dimensions, centerPosition, color, isValid, snapAnchorKind }: GhostCabinetProps) {
  const { width, height, depth } = dimensions;

  // Position is CENTER-based
  const position: [number, number, number] = [
    centerPosition.x,
    centerPosition.y,
    centerPosition.z,
  ];

  const opacity = isValid ? 0.3 : 0.15;
  const wireColor = isValid ? color : '#ef4444';
  const highlightColor = isValid ? '#ffffff' : '#ef4444';

  return (
    <group position={position}>
      {/* Solid fill */}
      <mesh>
        <boxGeometry args={[width, height, depth]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Wireframe outline */}
      <mesh>
        <boxGeometry args={[width, height, depth]} />
        <meshBasicMaterial
          color={wireColor}
          transparent
          opacity={0.8}
          wireframe
          side={DoubleSide}
        />
      </mesh>

      {/* Edge highlight on snapping face */}
      {snapAnchorKind && (
        <FaceEdgeHighlight
          dimensions={dimensions}
          anchorKind={snapAnchorKind}
          color={highlightColor}
        />
      )}
    </group>
  );
}

// ============================================
// SNAP CONNECTION LINE
// ============================================

interface SnapConnectionLineProps {
  from: Vec3;
  to: Vec3;
  color: string;
}

function SnapConnectionLine({ from, to, color }: SnapConnectionLineProps) {
  const points = useMemo(() => {
    return [
      [from.x, from.y, from.z] as [number, number, number],
      [to.x, to.y, to.z] as [number, number, number],
    ];
  }, [from, to]);

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={2}
          array={new Float32Array(points.flat())}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color={color}
        linewidth={2}
        transparent
        opacity={0.8}
      />
    </line>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function SnapPreview({ dimensions, currentPosition }: SnapPreviewProps) {
  const activeResult = useSnapStore((s) => s.activeResult);
  const isSnapping = useSnapStore((s) => s.isSnapping);

  // Don't render if not snapping
  if (!isSnapping || !activeResult) {
    return null;
  }

  const snapType = activeResult.candidate.type;
  const color = SNAP_TYPE_COLORS[snapType] || '#22c55e';

  // Current position as center (for connection line)
  const currentCenter: Vec3 = {
    x: currentPosition[0] + dimensions.width / 2,
    y: currentPosition[1] + dimensions.height / 2,
    z: currentPosition[2] + dimensions.depth / 2,
  };

  // Get the anchor kind for cabinet B (the one being snapped)
  const snapAnchorKind = activeResult.candidate.bAnchorKind;

  return (
    <group name="snap-preview">
      {/* Ghost cabinet at snap position */}
      <GhostCabinet
        dimensions={dimensions}
        centerPosition={activeResult.resolvedTransformB.position}
        color={color}
        isValid={activeResult.isValid}
        snapAnchorKind={snapAnchorKind}
      />

      {/* Connection line from current to snap position */}
      <SnapConnectionLine
        from={currentCenter}
        to={activeResult.resolvedTransformB.position}
        color={color}
      />

      {/* Snap type indicator */}
      <SnapIndicator
        result={activeResult}
        dimensions={dimensions}
      />
    </group>
  );
}

// ============================================
// SNAP STATUS OVERLAY (2D UI)
// ============================================

export function SnapStatusOverlay() {
  const isSnapping = useSnapStore((s) => s.isSnapping);
  const activeResult = useSnapStore((s) => s.activeResult);
  const constants = useSnapStore((s) => s.constants);

  if (!isSnapping || !activeResult) {
    return null;
  }

  const snapType = activeResult.candidate.type;
  const label = SNAP_TYPE_LABELS[snapType] || snapType;
  const color = SNAP_TYPE_COLORS[snapType] || '#22c55e';

  return (
    <div
      className="fixed top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg border backdrop-blur-sm z-50"
      style={{
        backgroundColor: `${color}20`,
        borderColor: `${color}50`,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm text-white font-medium">{label}</span>
        <span className="text-xs text-gray-400">
          Gap: {constants.minGapMm}mm
        </span>
        {!activeResult.isValid && (
          <span className="text-xs text-red-400">
            {activeResult.validationErrors[0]}
          </span>
        )}
      </div>
    </div>
  );
}

export default SnapPreview;
