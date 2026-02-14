/**
 * ViewportController - SPEC-08 Compliant View System
 *
 * Functionally meaningful views (not generic camera angles):
 * - Perspective: Design thinking / presentation (3D)
 * - Front: Contractor-friendly frontal view (2D ortho)
 * - Left: Side profile for depth verification (2D ortho)
 * - Install: Installation reference view (3D)
 * - Factory: Manufacturing truth (2D ortho top-down)
 * - CNC: CAM alignment (2D ortho)
 *
 * Orthographic views provide true 2D representation like 3ds Max/AutoCAD
 */

import React, { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';

// View types as per SPEC-08
export type ViewType = 'Perspective' | 'Front' | 'Left' | 'Top' | 'Install' | 'Factory' | 'CNC';

// Re-export from store (single source of truth)
import { VIEW_PRESETS } from '../../core/store/useViewStore';

interface ViewportControllerProps {
  currentView: ViewType;
  onViewChange?: (view: ViewType) => void;
  controlsRef?: React.RefObject<OrbitControlsImpl>;
}

// Hook to animate camera to view
export function useCameraView(viewType: ViewType, controlsRef?: React.RefObject<OrbitControlsImpl>) {
  const { camera } = useThree();

  useEffect(() => {
    const preset = VIEW_PRESETS[viewType];
    if (!preset) return;

    // Animate camera position
    const targetPos = new THREE.Vector3(...preset.position);
    const targetLookAt = new THREE.Vector3(...preset.target);

    // Simple instant transition (can add GSAP for smooth animation later)
    camera.position.copy(targetPos);
    camera.lookAt(targetLookAt);

    // Handle orthographic vs perspective
    if (preset.isOrtho && camera instanceof THREE.OrthographicCamera) {
      camera.zoom = preset.orthoZoom ?? 0.4;
    } else if (!preset.isOrtho && camera instanceof THREE.PerspectiveCamera) {
      camera.fov = preset.fov;
    }

    camera.updateProjectionMatrix();

    // Update controls target if available
    if (controlsRef?.current) {
      controlsRef.current.target.copy(targetLookAt);
      // Disable rotation for orthographic views
      controlsRef.current.enableRotate = !preset.isOrtho;
      controlsRef.current.update();
    }
  }, [viewType, camera, controlsRef]);
}

// View Button Component
interface ViewButtonProps {
  view: ViewType;
  currentView: ViewType;
  onClick: (view: ViewType) => void;
}

export function ViewButton({ view, currentView, onClick }: ViewButtonProps) {
  const isActive = view === currentView;
  
  return (
    <button
      onClick={() => onClick(view)}
      className={`px-3 py-1.5 text-xs font-medium transition-colors rounded
        ${isActive 
          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' 
          : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        }`}
      title={VIEW_PRESETS[view].description}
    >
      {view}
    </button>
  );
}

// View Toolbar Component
interface ViewToolbarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

export function ViewToolbar({ currentView, onViewChange }: ViewToolbarProps) {
  const views: ViewType[] = ['Front', 'Left', 'Perspective', 'Install', 'Factory', 'CNC'];
  
  return (
    <div className="flex items-center gap-1">
      {views.map((view) => (
        <ViewButton
          key={view}
          view={view}
          currentView={currentView}
          onClick={onViewChange}
        />
      ))}
    </div>
  );
}

// Camera Controller Component (inside R3F Canvas)
interface CameraControllerProps {
  viewType: ViewType;
}

export function CameraController({ viewType }: CameraControllerProps) {
  const { camera } = useThree();

  useEffect(() => {
    const preset = VIEW_PRESETS[viewType];
    if (!preset) return;

    // Set camera position
    camera.position.set(...preset.position);

    // Set look-at target
    const target = new THREE.Vector3(...preset.target);
    camera.lookAt(target);

    // Handle orthographic vs perspective camera
    if (preset.isOrtho && camera instanceof THREE.OrthographicCamera) {
      // Orthographic camera: set zoom
      camera.zoom = preset.orthoZoom ?? 0.4;
      camera.updateProjectionMatrix();
    } else if (!preset.isOrtho && camera instanceof THREE.PerspectiveCamera) {
      // Perspective camera: set FOV
      camera.fov = preset.fov;
      camera.updateProjectionMatrix();
    }
  }, [viewType, camera]);

  return null;
}

export { VIEW_PRESETS };
export default ViewToolbar;
