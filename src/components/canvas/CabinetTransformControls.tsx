/**
 * CabinetTransformControls - drei TransformControls wrapper for cabinet manipulation
 *
 * Features:
 * - Move (translate) and Rotate modes
 * - Snap to grid (10mm) and rotation (90 degrees)
 * - Cabinet-to-cabinet snap with V5 session (intent, sticky, predictive)
 * - Handles OrbitControls conflict
 * - Unit conversion: mm <-> meters
 *
 * SNAP SYSTEM V5:
 * - Intent Resolution: Velocity-biased candidate selection
 * - Sticky Selection: Prevents rapid candidate switching
 * - Adaptive Lookahead: Speed-scaled prediction
 * - Local Axis Lock: Constrain to cabinet's axes
 * - Tab Cycling: Manual candidate selection (Tab/Shift+Tab)
 *
 * @version 2.0.0
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Group, Event } from 'three';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import { useToolStore, ToolId } from '../../core/store/useToolStore';
import { useProjectStore } from '../../core/store/useProjectStore';
import { useSnapStore } from '../../core/store/useSnapStore';
import { calculateSnap, type SnapTarget, type SnapGuide } from '../../core/utils/snapSystem';
import { cabinetToSnapInstance, snapResultToCornerPosition } from '../../core/utils/cabinetSnap';
import { SnapCabinetInstance, Vec3 } from '../../core/types/SnapTypes';
import { SnapGuides } from './SnapGuides';

// V5 Session imports
import {
  createSnapSessionV5,
  updateOnDragV5,
  onTabCycleV5,
  isEngagedV5,
  SnapSessionV5,
  getCabinetAxesFromRotation,
} from '../../core/snap/snapSessionV5';
import { defaultSnapGenerator } from '../../core/snap/snapCandidateGenerator';
import { useVelocityTracker } from '../../core/snap/useVelocityTracker';
import { quatFromYaw } from '../../core/math/quaternion';

interface CabinetTransformControlsProps {
  cabinetId: string;
  targetRef: React.RefObject<Group | null>;
  enabled?: boolean;
}

// Map tool IDs to TransformControls modes
const TOOL_TO_MODE: Record<ToolId, 'translate' | 'rotate' | 'scale' | null> = {
  select: null,
  move: 'translate',
  rotate: 'rotate',
  scale: 'scale',
  uv: null,
  measure: null,
  glue: null,
};

export function CabinetTransformControls({
  cabinetId,
  targetRef,
  enabled = true,
}: CabinetTransformControlsProps) {
  const controlsRef = useRef<any>(null);
  const { controls: orbitControls } = useThree();
  const [activeGuides, setActiveGuides] = useState<SnapGuide[]>([]);

  // State to track when controls are mounted and ready
  const [controlsReady, setControlsReady] = useState(false);

  // Use ref for isDragging to avoid stale closure in callbacks
  const isDraggingRef = useRef(false);

  // Track last known good position for recovery
  const lastGoodPosition = useRef<[number, number, number]>([0, 0, 0]);

  // V5 Snap Session state
  const snapSessionRef = useRef<SnapSessionV5>(createSnapSessionV5());

  // Velocity tracker for intent detection
  const velocityTracker = useVelocityTracker();

  // Get tool state and snap options
  const activeTool = useToolStore((s) => s.activeTool);
  const snapEnabled = useToolStore((s) => s.options.snap.enabled);
  const gridSize = useToolStore((s) => s.options.snap.gridSize);
  const setDraggingCabinetId = useToolStore((s) => s.setDraggingCabinetId);

  // Get store state and actions
  const cabinets = useCabinetStore((s) => s.cabinets);
  const updateCabinetPosition = useCabinetStore((s) => s.updateCabinetPosition);
  const updateCabinetRotation = useCabinetStore((s) => s.updateCabinetRotation);
  const markDirty = useProjectStore((s) => s.markDirty);

  // Get current cabinet for dimensions
  const currentCabinet = cabinets.find(c => c.id === cabinetId);

  // Get current mode from active tool
  const mode = TOOL_TO_MODE[activeTool];

  // Build snap targets from other cabinets (basic snap system)
  const snapTargets: SnapTarget[] = cabinets
    .filter(c => c.id !== cabinetId)
    .map(c => ({
      id: c.id,
      position: (c as any).scenePosition || [0, 0, 0],
      dimensions: c.dimensions,
      rotation: (c as any).sceneRotation?.[1] || 0,
    }));

  // Get anchor snap store actions
  const snapStoreEnabled = useSnapStore((s) => s.enabled);
  const snapConstants = useSnapStore((s) => s.constants);
  const defaultAlignment = useSnapStore((s) => s.defaultAlignment);
  const setActiveSnap = useSnapStore((s) => s.setActiveSnap);
  const clearActiveSnap = useSnapStore((s) => s.clearActiveSnap);
  const commitSnap = useSnapStore((s) => s.commitSnap);

  // Build anchor-based snap instances for other cabinets
  const otherSnapInstances: SnapCabinetInstance[] = cabinets
    .filter(c => c.id !== cabinetId)
    .map(c => cabinetToSnapInstance(
      c.id,
      (c as any).scenePosition || [0, 0, 0],
      c.dimensions,
      (c as any).sceneRotation?.[1] || 0
    ));

  // Effect to detect when controls ref is ready
  useEffect(() => {
    if (controlsRef.current && !controlsReady) {
      setControlsReady(true);
    }
  });

  // Handle Tab key for snap candidate cycling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isDraggingRef.current) return;
      if (e.key !== 'Tab') return;

      e.preventDefault();
      const direction = e.shiftKey ? -1 : 1;
      snapSessionRef.current = onTabCycleV5(snapSessionRef.current, direction);

      // Update store with new active candidate
      const session = snapSessionRef.current;
      if (session.preview && session.candidates.length > 0) {
        const candidate = session.candidates[session.activeIndex];
        if (candidate) {
          setActiveSnap(candidate, session.preview);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveSnap]);

  // Handle dragging state change - disable OrbitControls while transforming
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const handleDraggingChanged = (event: Event & { value?: boolean }) => {
      const dragging = event.value ?? false;
      isDraggingRef.current = dragging;

      // Set dragging cabinet ID in tool store
      setDraggingCabinetId(dragging ? cabinetId : null);

      if (orbitControls) {
        (orbitControls as any).enabled = !dragging;
      }

      // When starting to drag, capture current position and reset trackers
      if (dragging && targetRef.current) {
        const cabinet = useCabinetStore.getState().cabinets.find(c => c.id === cabinetId);
        const storePos = (cabinet as any)?.scenePosition || [0, 0, 0];
        lastGoodPosition.current = [...storePos] as [number, number, number];

        // Reset V5 session and velocity tracker
        snapSessionRef.current = createSnapSessionV5();
        velocityTracker.reset();
      }

      // When dragging ends, clear guides and commit snap if engaged
      if (!dragging) {
        setActiveGuides([]);

        // Check if snap was engaged and valid
        const session = snapSessionRef.current;
        if (isEngagedV5(session) && session.preview?.isValid) {
          // Apply snap position to cabinet
          if (currentCabinet) {
            const snappedCorner = snapResultToCornerPosition(
              session.preview,
              currentCabinet.dimensions
            );
            updateCabinetPosition(cabinetId, snappedCorner);
          }
          commitSnap();
        } else {
          clearActiveSnap();
        }

        // Reset session
        snapSessionRef.current = createSnapSessionV5();
        velocityTracker.reset();
      }
    };

    controls.addEventListener('dragging-changed', handleDraggingChanged);
    return () => {
      controls.removeEventListener('dragging-changed', handleDraggingChanged);
      setDraggingCabinetId(null);
    };
  }, [orbitControls, clearActiveSnap, commitSnap, controlsReady, cabinetId, setDraggingCabinetId, velocityTracker, currentCabinet, updateCabinetPosition]);

  // Handle transform changes - sync back to store with snap
  const handleObjectChange = useCallback(() => {
    // Only process during active drag
    if (!isDraggingRef.current) return;
    if (!targetRef.current || !currentCabinet) return;

    const target = targetRef.current;

    if (mode === 'translate') {
      // Scene uses mm units directly - no conversion needed
      let positionMm: [number, number, number] = [
        Math.round(target.position.x),
        0, // Y should ALWAYS be 0 for floor cabinets
        Math.round(target.position.z),
      ];

      // HARD CLAMP: Position should never exceed 10 meters
      const MAX_POSITION = 10000;
      positionMm[0] = Math.max(-MAX_POSITION, Math.min(MAX_POSITION, positionMm[0]));
      positionMm[2] = Math.max(-MAX_POSITION, Math.min(MAX_POSITION, positionMm[2]));

      // Update velocity tracker
      const currentVec: Vec3 = { x: positionMm[0], y: positionMm[1], z: positionMm[2] };
      const velocityWorld = velocityTracker.update(currentVec);

      // Save as last good position
      lastGoodPosition.current = [...positionMm] as [number, number, number];

      // ========================================
      // BASIC SNAP (Edge + Grid + Collision)
      // ========================================
      if (snapTargets.length > 0) {
        const movingTarget: SnapTarget = {
          id: cabinetId,
          position: positionMm,
          dimensions: currentCabinet.dimensions,
          rotation: (currentCabinet as any).sceneRotation?.[1] || 0,
        };

        const snapResult = calculateSnap(movingTarget, snapTargets, {
          gridSize,
          snapThreshold: snapEnabled ? 50 : 0,
          enableEdgeSnap: snapEnabled,
          enableGridSnap: snapEnabled,
          enableCenterSnap: false,
        });

        // Apply basic snap result (collision detection is always active)
        positionMm = snapResult.position;

        // Update guides
        if (snapEnabled && snapResult.snapped) {
          setActiveGuides(snapResult.guides);
        } else {
          setActiveGuides([]);
        }
      }

      // ========================================
      // V5 ANCHOR SNAP (Face-to-Face)
      // ========================================
      if (snapStoreEnabled && otherSnapInstances.length > 0) {
        // Create snap instance for moving cabinet
        const movingSnapInstance = cabinetToSnapInstance(
          cabinetId,
          positionMm,
          currentCabinet.dimensions,
          (currentCabinet as any).sceneRotation?.[1] || 0
        );

        // Get cabinet axes from rotation
        const rotationY = (currentCabinet as any).sceneRotation?.[1] || 0;
        const cabinetQuat = quatFromYaw(rotationY);
        const axesB = getCabinetAxesFromRotation(cabinetQuat);

        // Find the closest target for the session
        let closestTarget: SnapCabinetInstance | null = null;
        let closestDistance = Infinity;

        for (const targetInstance of otherSnapInstances) {
          const dx = targetInstance.transform.position.x - movingSnapInstance.transform.position.x;
          const dz = targetInstance.transform.position.z - movingSnapInstance.transform.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < closestDistance) {
            closestDistance = dist;
            closestTarget = targetInstance;
          }
        }

        // Only run V5 session if within snap range
        if (closestTarget && closestDistance < snapConstants.snapThresholdMm * 3) {
          // Run V5 session update
          snapSessionRef.current = updateOnDragV5({
            session: snapSessionRef.current,
            cabinetA: closestTarget,
            cabinetB: movingSnapInstance,
            axesB,
            constants: snapConstants,
            alignment: defaultAlignment,
            velocityWorld,
            generator: defaultSnapGenerator,
          });

          const session = snapSessionRef.current;

          // Update store with active candidate and preview
          if (session.candidates.length > 0 && session.preview) {
            const activeCandidate = session.candidates[session.activeIndex];
            setActiveSnap(activeCandidate, session.preview);

            // If engaged and valid, apply snap position
            if (isEngagedV5(session) && session.preview.isValid) {
              const snappedCorner = snapResultToCornerPosition(
                session.preview,
                currentCabinet.dimensions
              );
              positionMm = snappedCorner;
            }
          } else {
            setActiveSnap(null, null);
          }
        } else {
          // Too far from any target, clear snap
          setActiveSnap(null, null);
        }
      }

      // Update store with final position
      updateCabinetPosition(cabinetId, positionMm);
      markDirty();

    } else if (mode === 'rotate') {
      // Store rotation in radians
      const rotation: [number, number, number] = [
        target.rotation.x,
        target.rotation.y,
        target.rotation.z,
      ];
      updateCabinetRotation(cabinetId, rotation);
      markDirty();
    }
  }, [
    cabinetId,
    mode,
    targetRef,
    currentCabinet,
    snapEnabled,
    snapTargets,
    gridSize,
    updateCabinetPosition,
    updateCabinetRotation,
    markDirty,
    snapStoreEnabled,
    snapConstants,
    defaultAlignment,
    otherSnapInstances,
    setActiveSnap,
    velocityTracker,
  ]);

  // Don't render if no mode or not enabled
  if (!mode || !enabled || !targetRef.current) {
    return null;
  }

  // Rotation snap: 90 degrees in radians
  const rotationSnap = snapEnabled ? Math.PI / 2 : undefined;

  return (
    <>
      <TransformControls
        ref={controlsRef}
        object={targetRef.current}
        mode={mode === 'translate' ? 'translate' : mode === 'rotate' ? 'rotate' : 'scale'}
        rotationSnap={rotationSnap}
        onObjectChange={handleObjectChange}
        size={0.8}
        showX={true}
        showY={mode === 'translate' ? true : true}
        showZ={true}
      />
      {/* Render snap guides when dragging */}
      {activeGuides.length > 0 && (
        <SnapGuides guides={activeGuides} showIndicators={true} />
      )}
    </>
  );
}

export default CabinetTransformControls;
