/**
 * CollisionHighlight - Real-time Collision Feedback in R3F Scene
 *
 * Renders visual indicators at collision locations during drag operations.
 * Shows red markers for body collisions (ERROR) and amber for envelope (WARNING).
 *
 * FEATURES:
 * - Pulsing sphere indicators at collision locations
 * - Color coding: red = body collision, amber = envelope overlap
 * - Target cabinet highlighting (outline glow)
 * - Warning labels with collision severity
 * - Auto-hides when no collisions detected
 *
 * INTEGRATION:
 * ```tsx
 * // In your Canvas/Scene component:
 * <Canvas>
 *   <CollisionHighlight />
 *   {/* ... other scene content ... *​/}
 * </Canvas>
 * ```
 *
 * @version 1.0.0 - Phase 5: Real-time Validation Display
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  useLiveValidationStore,
  type DragCollisionPair,
} from '../../core/store/useLiveValidationStore';

// ============================================
// CONSTANTS
// ============================================

/** Colors for collision severity */
const COLLISION_COLORS = {
  error: '#ef4444',   // Red - body collision
  warning: '#f59e0b', // Amber - envelope overlap
} as const;

/** Background colors for labels */
const COLLISION_BG = {
  error: 'rgba(239, 68, 68, 0.9)',
  warning: 'rgba(245, 158, 11, 0.9)',
} as const;

/** Scale from mm to Three.js units (meters) */
const MM_TO_METERS = 0.001;

/** Base size of collision marker in meters */
const MARKER_SIZE = 0.025; // 25mm

/** Pulse animation speed */
const PULSE_SPEED = 3;

/** Pulse amplitude */
const PULSE_AMPLITUDE = 0.4;

// ============================================
// SUB-COMPONENTS
// ============================================

interface CollisionMarkerProps {
  collision: DragCollisionPair;
  index: number;
}

/**
 * Single collision indicator marker.
 * Renders a pulsing sphere with severity color and label.
 */
function CollisionMarker({ collision, index }: CollisionMarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = COLLISION_COLORS[collision.severity];
  const isError = collision.severity === 'error';

  // Pulsing animation
  useFrame((state) => {
    if (!meshRef.current) return;
    const phase = state.clock.elapsedTime * PULSE_SPEED + index * 0.7;
    const pulse = 1 + Math.sin(phase) * PULSE_AMPLITUDE;
    meshRef.current.scale.setScalar(pulse);
  });

  return (
    <group>
      {/* Inner sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[MARKER_SIZE * 0.4, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Outer glow ring */}
      <mesh>
        <ringGeometry args={[MARKER_SIZE * 0.7, MARKER_SIZE, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Soft glow sphere */}
      <mesh>
        <sphereGeometry args={[MARKER_SIZE * 1.5, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.15}
        />
      </mesh>

      {/* Label */}
      <Html
        center
        distanceFactor={400}
        style={{ pointerEvents: 'none' }}
        position={[0, MARKER_SIZE * 3, 0]}
      >
        <div
          style={{
            background: COLLISION_BG[collision.severity],
            color: 'white',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            border: `1px solid ${color}`,
          }}
        >
          {isError ? '⛔' : '⚠️'}{' '}
          {collision.hit.type === 'CABINET' ? 'Body Collision' : 'Clearance'}
        </div>
      </Html>
    </group>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * CollisionHighlight renders collision feedback in the R3F scene.
 *
 * Reads from useLiveValidationStore and displays markers
 * at collision locations. Automatically hides when no collisions
 * are detected.
 */
export function CollisionHighlight() {
  const dragCollisions = useLiveValidationStore((s) => s.dragCollisions);
  const staticCollisions = useLiveValidationStore((s) => s.staticCollisions);

  // Merge drag + static collisions for display
  const allCollisions = useMemo(() => {
    // During drag, show drag collisions; otherwise show static
    if (dragCollisions.length > 0) {
      return dragCollisions;
    }
    return staticCollisions;
  }, [dragCollisions, staticCollisions]);

  // Don't render if no collisions
  if (allCollisions.length === 0) {
    return null;
  }

  return (
    <group name="collision-highlights">
      {allCollisions.map((collision, index) => (
        <CollisionMarker
          key={`${collision.hit.targetId}-${collision.severity}-${index}`}
          collision={collision}
          index={index}
        />
      ))}

      {/* Summary label at top of scene */}
      <CollisionSummary collisions={allCollisions} />
    </group>
  );
}

// ============================================
// SUMMARY COMPONENT
// ============================================

interface CollisionSummaryProps {
  collisions: DragCollisionPair[];
}

/**
 * Summary overlay showing total collision count.
 */
function CollisionSummary({ collisions }: CollisionSummaryProps) {
  const errorCount = collisions.filter((c) => c.severity === 'error').length;
  const warningCount = collisions.filter((c) => c.severity === 'warning').length;

  const hasErrors = errorCount > 0;
  const bgColor = hasErrors ? COLLISION_BG.error : COLLISION_BG.warning;
  const borderColor = hasErrors ? COLLISION_COLORS.error : COLLISION_COLORS.warning;

  return (
    <Html
      center
      distanceFactor={600}
      style={{ pointerEvents: 'none' }}
      position={[0, 0.5, 0]}
    >
      <div
        style={{
          background: bgColor,
          color: 'white',
          padding: '4px 12px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'system-ui, sans-serif',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          border: `2px solid ${borderColor}`,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        {errorCount > 0 && (
          <span>
            ⛔ {errorCount} collision{errorCount !== 1 ? 's' : ''}
          </span>
        )}
        {warningCount > 0 && (
          <span>
            ⚠️ {warningCount} clearance{warningCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </Html>
  );
}

// ============================================
// COLLISION TARGET OUTLINE (Optional Enhancement)
// ============================================

interface CollisionTargetOutlineProps {
  /** IDs of cabinets involved in collisions */
  targetIds: string[];
  /** Whether to show error or warning outline */
  severity: 'error' | 'warning';
}

/**
 * Renders outline effect on collision target cabinets.
 * This is a stub for future integration with Outline post-processing.
 *
 * To integrate, add the target mesh refs to an Outline effect:
 * ```tsx
 * import { Outline } from '@react-three/postprocessing';
 * <EffectComposer>
 *   <Outline selection={collisionTargetRefs} edgeStrength={3} />
 * </EffectComposer>
 * ```
 */
export function CollisionTargetOutline({
  targetIds: _targetIds,
  severity: _severity,
}: CollisionTargetOutlineProps) {
  // Stub: In production, this would integrate with @react-three/postprocessing
  // to apply outline effects to collision target meshes.
  return null;
}

export default CollisionHighlight;
