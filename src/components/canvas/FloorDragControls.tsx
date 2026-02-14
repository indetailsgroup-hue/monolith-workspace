/**
 * FloorDragControls - Raycast-based cabinet dragging on floor plane
 *
 * This replaces TransformControls for translate mode because:
 * - TransformControls has sensitivity issues when camera is far
 * - TransformControls ignores our position.set() calls
 * - Raycasting gives natural, bounded movement
 *
 * How it works:
 * 1. On mouse down on cabinet, start dragging
 * 2. Raycast from mouse to floor plane (Y=0)
 * 3. Move cabinet to intersection point
 * 4. Apply snap and collision detection
 */

import { useRef, useCallback, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Plane, Vector3, Raycaster, Vector2, Group } from 'three';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import { useToolStore } from '../../core/store/useToolStore';
import { useProjectStore } from '../../core/store/useProjectStore';
import { calculateSnap, type SnapTarget } from '../../core/utils/snapSystem';

interface FloorDragControlsProps {
  cabinetId: string;
  targetRef: React.RefObject<Group | null>;
  enabled?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

// Floor plane at Y=0
const floorPlane = new Plane(new Vector3(0, 1, 0), 0);

export function FloorDragControls({
  cabinetId,
  targetRef,
  enabled = true,
  onDragStart,
  onDragEnd,
}: FloorDragControlsProps) {
  const { camera, gl, controls: orbitControls } = useThree();

  // Refs for drag state
  const isDragging = useRef(false);
  const dragOffset = useRef(new Vector3());
  const raycaster = useRef(new Raycaster());
  const mouse = useRef(new Vector2());
  const intersectPoint = useRef(new Vector3());

  // Get store actions
  const cabinets = useCabinetStore((s) => s.cabinets);
  const updateCabinetPosition = useCabinetStore((s) => s.updateCabinetPosition);
  const markDirty = useProjectStore((s) => s.markDirty);
  const setDraggingCabinetId = useToolStore((s) => s.setDraggingCabinetId);
  const snapEnabled = useToolStore((s) => s.options.snap.enabled);
  const gridSize = useToolStore((s) => s.options.snap.gridSize);

  // Get current cabinet
  const currentCabinet = cabinets.find(c => c.id === cabinetId);

  // Build snap targets from other cabinets
  const snapTargets: SnapTarget[] = cabinets
    .filter(c => c.id !== cabinetId)
    .map(c => ({
      id: c.id,
      position: (c as any).scenePosition || [0, 0, 0],
      dimensions: c.dimensions,
      rotation: (c as any).sceneRotation?.[1] || 0,
    }));

  // Convert screen coords to normalized device coords
  const updateMouse = useCallback((event: MouseEvent | PointerEvent) => {
    const rect = gl.domElement.getBoundingClientRect();
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }, [gl]);

  // Raycast to floor plane
  const raycastToFloor = useCallback((): Vector3 | null => {
    raycaster.current.setFromCamera(mouse.current, camera);
    const target = new Vector3();
    const hit = raycaster.current.ray.intersectPlane(floorPlane, target);
    return hit ? target : null;
  }, [camera]);

  // Handle pointer down
  const handlePointerDown = useCallback((event: PointerEvent) => {
    if (!enabled || !targetRef.current) return;

    // Check if clicking on this cabinet's mesh
    updateMouse(event);
    raycaster.current.setFromCamera(mouse.current, camera);

    // Get all meshes in the cabinet group
    const meshes: THREE.Object3D[] = [];
    targetRef.current.traverse((child) => {
      if ((child as any).isMesh) {
        meshes.push(child);
      }
    });

    const intersects = raycaster.current.intersectObjects(meshes, true);
    if (intersects.length === 0) return;

    // Start dragging
    isDragging.current = true;
    setDraggingCabinetId(cabinetId);

    // Disable orbit controls
    if (orbitControls) {
      (orbitControls as any).enabled = false;
    }

    // Calculate offset from cabinet center to click point
    const floorPoint = raycastToFloor();
    if (floorPoint && targetRef.current) {
      dragOffset.current.copy(targetRef.current.position).sub(floorPoint);
    }

    onDragStart?.();

    // Capture pointer for reliable drag tracking
    gl.domElement.setPointerCapture(event.pointerId);

    event.preventDefault();
    event.stopPropagation();
  }, [enabled, targetRef, camera, gl, orbitControls, cabinetId, setDraggingCabinetId, raycastToFloor, updateMouse, onDragStart]);

  // Handle pointer move
  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (!isDragging.current || !targetRef.current || !currentCabinet) return;

    updateMouse(event);
    const floorPoint = raycastToFloor();

    if (floorPoint) {
      // Apply offset to get new position
      intersectPoint.current.copy(floorPoint).add(dragOffset.current);

      // Convert to mm
      let positionMm: [number, number, number] = [
        Math.round(intersectPoint.current.x * 1000),
        0,
        Math.round(intersectPoint.current.z * 1000),
      ];

      // Clamp to reasonable bounds
      const MAX_POSITION = 10000; // 10 meters
      positionMm[0] = Math.max(-MAX_POSITION, Math.min(MAX_POSITION, positionMm[0]));
      positionMm[2] = Math.max(-MAX_POSITION, Math.min(MAX_POSITION, positionMm[2]));

      // Apply snap if enabled and there are targets
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

        positionMm = snapResult.position;
      }

      // Update mesh position directly (no fighting with TransformControls!)
      targetRef.current.position.set(
        positionMm[0] / 1000,
        0,
        positionMm[2] / 1000
      );

      // Update store
      updateCabinetPosition(cabinetId, positionMm);
    }

    event.preventDefault();
  }, [targetRef, currentCabinet, cabinetId, snapTargets, snapEnabled, gridSize, raycastToFloor, updateMouse, updateCabinetPosition]);

  // Handle pointer up
  const handlePointerUp = useCallback((event: PointerEvent) => {
    if (!isDragging.current) return;

    isDragging.current = false;
    setDraggingCabinetId(null);

    // Re-enable orbit controls
    if (orbitControls) {
      (orbitControls as any).enabled = true;
    }

    // Release pointer capture
    gl.domElement.releasePointerCapture(event.pointerId);

    markDirty();
    onDragEnd?.();
  }, [gl, orbitControls, setDraggingCabinetId, markDirty, onDragEnd]);

  // Attach event listeners
  useEffect(() => {
    if (!enabled) return;

    const canvas = gl.domElement;

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);

      // Ensure dragging state is cleared on unmount
      if (isDragging.current) {
        setDraggingCabinetId(null);
        if (orbitControls) {
          (orbitControls as any).enabled = true;
        }
      }
    };
  }, [enabled, gl, handlePointerDown, handlePointerMove, handlePointerUp, orbitControls, setDraggingCabinetId]);

  // This component doesn't render anything visual
  return null;
}

export default FloorDragControls;
