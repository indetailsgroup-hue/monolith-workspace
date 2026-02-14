/**
 * GlueFaceHighlights - Visual face indicators for glue tool
 *
 * Features:
 * - Shows 6 clickable face planes when in glue mode
 * - Highlights hovered face
 * - Shows selected source/target faces
 * - Face labels with keyboard shortcuts
 */

import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { DoubleSide, Mesh } from 'three';
import { useGlueStore, CabinetFace, FACE_INFO, FaceSelection } from '../../core/store/useGlueStore';
import { getFaceHighlightBounds } from '../../core/utils/glueSystem';

// ============================================
// TYPES
// ============================================

interface GlueFaceHighlightsProps {
  cabinetId: string;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  position: [number, number, number];
  insideGroup?: boolean; // When true, position relative to cabinet center
}

interface SingleFaceProps {
  cabinetId: string;
  face: CabinetFace;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  isSource: boolean;
  isTarget: boolean;
  isHovered: boolean;
  onHover: (hovered: boolean) => void;
  onClick: () => void;
}

// ============================================
// SINGLE FACE COMPONENT
// ============================================

function SingleFace({
  cabinetId,
  face,
  dimensions,
  isSource,
  isTarget,
  isHovered,
  onHover,
  onClick,
}: SingleFaceProps) {
  const faceInfo = FACE_INFO[face];
  // Increase padding to 30mm for better hit detection and visibility
  const bounds = useMemo(
    () => getFaceHighlightBounds(dimensions, face, 30),
    [dimensions, face]
  );

  // Determine color based on state
  let color = faceInfo.color;
  let opacity = 0.25; // Subtle base opacity for face indicators

  if (isSource) {
    color = '#22c55e'; // Green for source
    opacity = 0.4;
  } else if (isTarget) {
    color = '#3b82f6'; // Blue for target
    opacity = 0.4;
  } else if (isHovered) {
    color = '#fbbf24'; // Yellow for hover
    opacity = 0.35;
  }

  // IMPORTANT: Scene uses MM units, NOT meters! Don't divide by 1000!
  const positionMm: [number, number, number] = [
    bounds.position[0],
    bounds.position[1],
    bounds.position[2],
  ];

  const sizeMm: [number, number] = [
    bounds.size[0],
    bounds.size[1],
  ];

  // Refs for meshes - used to imperatively control raycast
  const meshRef1 = useRef<Mesh>(null);
  const meshRef2 = useRef<Mesh>(null);
  const originalRaycast1 = useRef<typeof Mesh.prototype.raycast | null>(null);
  const originalRaycast2 = useRef<typeof Mesh.prototype.raycast | null>(null);

  // Get current mode to check if we should disable interactions during transition
  const currentMode = useGlueStore((s) => s.mode);
  const isTransitioning = currentMode === 'idle';

  // No-op raycast function - must be stable reference
  const noopRaycast = useRef(() => {}).current;

  // CRITICAL: Use useLayoutEffect to IMMEDIATELY disable raycasting when transitioning
  // This runs synchronously before the browser paints, preventing R3F from calling raycast
  useLayoutEffect(() => {
    const mesh1 = meshRef1.current;
    const mesh2 = meshRef2.current;

    if (isTransitioning) {
      // Store original raycast functions and replace with no-op
      if (mesh1 && !originalRaycast1.current) {
        originalRaycast1.current = mesh1.raycast;
        mesh1.raycast = noopRaycast;
      }
      if (mesh2 && !originalRaycast2.current) {
        originalRaycast2.current = mesh2.raycast;
        mesh2.raycast = noopRaycast;
      }
    } else {
      // Restore original raycast functions
      if (mesh1 && originalRaycast1.current) {
        mesh1.raycast = originalRaycast1.current;
        originalRaycast1.current = null;
      }
      if (mesh2 && originalRaycast2.current) {
        mesh2.raycast = originalRaycast2.current;
        originalRaycast2.current = null;
      }
    }

    // CRITICAL: Cleanup function ensures raycast is always a valid function during unmount
    // Capture mesh references in closure since refs might be null during cleanup
    return () => {
      // Use captured references from effect, not refs (which might be null during cleanup)
      if (mesh1) {
        mesh1.raycast = noopRaycast;
      }
      if (mesh2) {
        mesh2.raycast = noopRaycast;
      }
    };
  }, [isTransitioning, noopRaycast]);

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (isTransitioning) return; // Ignore during transition
    e.stopPropagation();
    onHover(true);
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    if (isTransitioning) return; // Ignore during transition
    e.stopPropagation();
    onHover(false);
    document.body.style.cursor = 'default';
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (isTransitioning) return; // Ignore during transition
    e.stopPropagation();
    onClick();
  };

  // Use thin box instead of plane for more reliable raycasting
  // Box has 10mm thickness
  const boxArgs: [number, number, number] = [sizeMm[0], sizeMm[1], 10];

  // When transitioning, keep meshes but make them invisible and non-interactive
  // This prevents raycast errors because the Three.js objects still exist
  const isVisible = !isTransitioning;

  return (
    <group visible={isVisible}>
      {/* Face box - using box geometry for reliable raycasting */}
      <mesh
        ref={meshRef1}
        position={positionMm}
        rotation={bounds.rotation}
        onPointerOver={isVisible ? handlePointerOver : undefined}
        onPointerOut={isVisible ? handlePointerOut : undefined}
        onClick={isVisible ? handleClick : undefined}
        renderOrder={100}
        visible={isVisible}
      >
        <boxGeometry args={boxArgs} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isVisible ? opacity : 0}
          side={DoubleSide}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>

      {/* Face border - wireframe box */}
      <mesh ref={meshRef2} position={positionMm} rotation={bounds.rotation} renderOrder={101} visible={isVisible}>
        <boxGeometry args={boxArgs} />
        <meshBasicMaterial
          color={isSource || isTarget ? color : isHovered ? '#fbbf24' : '#ffffff'}
          transparent
          opacity={isVisible ? (isHovered || isSource || isTarget ? 0.9 : 0.5) : 0}
          wireframe
          side={DoubleSide}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>

      {/* Label - only show when hovered or selected */}
      {(isHovered || isSource || isTarget) && (
        <Html
          position={positionMm}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div
            className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap ${
              isSource
                ? 'bg-green-500/90 text-white'
                : isTarget
                ? 'bg-blue-500/90 text-white'
                : 'bg-yellow-500/90 text-black'
            }`}
          >
            {faceInfo.label} ({faceInfo.shortcut})
            {isSource && ' - SOURCE'}
            {isTarget && ' - TARGET'}
          </div>
        </Html>
      )}
    </group>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function GlueFaceHighlights({
  cabinetId,
  dimensions,
  position,
  insideGroup = false,
}: GlueFaceHighlightsProps) {
  const mode = useGlueStore((s) => s.mode);
  const source = useGlueStore((s) => s.source);
  const target = useGlueStore((s) => s.target);
  const selectFace = useGlueStore((s) => s.selectFace);
  const setHoveredFace = useGlueStore((s) => s.setHoveredFace);

  const [localHoveredFace, setLocalHoveredFace] = useState<CabinetFace | null>(null);

  // Track if we should render - use delayed unmount to prevent raycast errors
  const [shouldRender, setShouldRender] = useState(mode !== 'idle');

  useEffect(() => {
    if (mode === 'idle') {
      // Delay unmount to let R3F finish processing events
      // Children will be invisible during this time
      const timer = setTimeout(() => setShouldRender(false), 200);
      return () => clearTimeout(timer);
    } else {
      setShouldRender(true);
    }
  }, [mode]);

  // Don't render if not in glue mode (after delay)
  if (!shouldRender) return null;

  const faces: CabinetFace[] = ['left', 'right', 'front', 'back', 'top', 'bottom'];

  const handleFaceHover = (face: CabinetFace, hovered: boolean) => {
    setLocalHoveredFace(hovered ? face : null);
    setHoveredFace(hovered ? { cabinetId, face } : null);
  };

  const handleFaceClick = (face: CabinetFace) => {
    selectFace(cabinetId, face);
  };

  const { width, depth } = dimensions;

  // Calculate position based on whether we're inside the cabinet group or standalone
  // When insideGroup=true: position relative to cabinet group (which is at scenePosition)
  // Cabinet meshes are centered at [W/2, H/2, D/2] relative to group
  // getFaceHighlightBounds returns positions relative to cabinet XZ center
  let positionMm: [number, number, number];

  if (insideGroup) {
    // Inside cabinet group: position at cabinet center on XZ plane (MM units!)
    // Y=0 because getFaceHighlightBounds adds halfH to Y positions
    positionMm = [
      width / 2,  // Cabinet XZ center in mm (NO /1000!)
      0,
      depth / 2,
    ];
  } else {
    // Standalone: add scene position offset (MM units!)
    positionMm = [
      position[0] + width / 2,
      position[1],
      position[2] + depth / 2,
    ];
  }

  return (
    <group position={positionMm} name={`glue-faces-${cabinetId}`}>
      {faces.map((face) => {
        const isSource = source?.cabinetId === cabinetId && source?.face === face;
        const isTarget = target?.cabinetId === cabinetId && target?.face === face;
        const isHovered = localHoveredFace === face;

        return (
          <SingleFace
            key={face}
            cabinetId={cabinetId}
            face={face}
            dimensions={dimensions}
            isSource={isSource}
            isTarget={isTarget}
            isHovered={isHovered}
            onHover={(hovered) => handleFaceHover(face, hovered)}
            onClick={() => handleFaceClick(face)}
          />
        );
      })}
    </group>
  );
}

// ============================================
// GLUE MODE OVERLAY - Status bar at bottom
// ============================================

export function GlueModeOverlay() {
  const mode = useGlueStore((s) => s.mode);
  const source = useGlueStore((s) => s.source);
  const target = useGlueStore((s) => s.target);
  const cancelGlue = useGlueStore((s) => s.cancelGlue);
  const confirmGlue = useGlueStore((s) => s.confirmGlue);

  if (mode === 'idle') return null;

  let statusText = '';
  let statusColor = 'bg-amber-500/20 border-amber-500/50';

  switch (mode) {
    case 'selectSource':
      statusText = 'GLUE MODE: Click or hover a cabinet face, then press L/R/F/B/T/O to select SOURCE';
      statusColor = 'bg-amber-500/20 border-amber-500/50';
      break;
    case 'selectTarget':
      statusText = `SOURCE: ${source?.face.toUpperCase()} selected. Now select TARGET face on another cabinet`;
      statusColor = 'bg-green-500/20 border-green-500/50';
      break;
    case 'preview':
      statusText = `Aligning ${source?.face.toUpperCase()} → ${target?.face.toUpperCase()}. Press Enter to confirm, Esc to cancel`;
      statusColor = 'bg-blue-500/20 border-blue-500/50';
      break;
  }

  // Stop all pointer events from reaching the R3F canvas
  const stopEvent = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    // Also stop native event propagation
    e.nativeEvent.stopImmediatePropagation();
  };

  const handleConfirm = (e: React.MouseEvent) => {
    stopEvent(e);
    // Use requestAnimationFrame to ensure we're after the current event cycle
    // This prevents R3F raycast errors by letting the frame complete first
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        confirmGlue();
      });
    });
  };

  const handleCancel = (e: React.MouseEvent) => {
    stopEvent(e);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cancelGlue();
      });
    });
  };

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg border ${statusColor} backdrop-blur-sm z-50`}
      onPointerDown={stopEvent}
      onPointerUp={stopEvent}
      onClick={stopEvent}
    >
      <div className="flex items-center gap-4">
        <span className="text-sm text-white">{statusText}</span>
        {mode === 'preview' && (
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs rounded font-medium"
            >
              Confirm (Enter)
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1 bg-zinc-600 hover:bg-zinc-500 text-white text-xs rounded"
            >
              Cancel (Esc)
            </button>
          </div>
        )}
        {mode !== 'preview' && (
          <button
            onClick={handleCancel}
            className="px-3 py-1 bg-zinc-600 hover:bg-zinc-500 text-white text-xs rounded"
          >
            Cancel (Esc)
          </button>
        )}
      </div>
    </div>
  );
}

export default GlueFaceHighlights;
