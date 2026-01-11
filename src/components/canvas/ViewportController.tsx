/**
 * ViewportController - SPEC-08 Compliant View System
 * 
 * Functionally meaningful views (not generic camera angles):
 * - Perspective: Design thinking / presentation
 * - Front: Contractor-friendly frontal view
 * - Left: Side profile for depth verification
 * - Install: Installation reference view
 * - Factory: Manufacturing truth (panel/op-aligned)
 * - CNC: CAM alignment (machine coordinate space)
 */

import React, { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Vector3 } from 'three';

// View types as per SPEC-08
export type ViewType = 'Perspective' | 'Front' | 'Left' | 'Install' | 'Factory' | 'CNC';

// Camera presets for each view
const VIEW_PRESETS: Record<ViewType, {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  description: string;
}> = {
  Perspective: {
    position: [1500, 1200, 2000],
    target: [0, 400, 0],
    fov: 45,
    description: 'Design thinking / presentation view'
  },
  Front: {
    position: [0, 400, 2500],
    target: [0, 400, 0],
    fov: 45,
    description: 'Contractor-friendly frontal view'
  },
  Left: {
    position: [-2500, 400, 0],
    target: [0, 400, 0],
    fov: 45,
    description: 'Side profile for depth verification'
  },
  Install: {
    position: [1200, 800, 1200],
    target: [0, 300, 0],
    fov: 50,
    description: 'Installation reference view (3/4 angle)'
  },
  Factory: {
    position: [0, 2500, 0],
    target: [0, 0, 0],
    fov: 45,
    description: 'Manufacturing truth - top-down panel view'
  },
  CNC: {
    position: [0, 0, 2500],
    target: [0, 0, 0],
    fov: 35,
    description: 'CAM alignment - machine coordinate space'
  }
};

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
    const targetPos = new Vector3(...preset.position);
    const targetLookAt = new Vector3(...preset.target);
    
    // Simple instant transition (can add GSAP for smooth animation later)
    camera.position.copy(targetPos);
    camera.lookAt(targetLookAt);
    (camera as any).fov = preset.fov;
    camera.updateProjectionMatrix();
    
    // Update controls target if available
    if (controlsRef?.current) {
      controlsRef.current.target.copy(targetLookAt);
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
    
    camera.position.set(...preset.position);
    camera.lookAt(new Vector3(...preset.target));
    (camera as any).fov = preset.fov;
    camera.updateProjectionMatrix();
  }, [viewType, camera]);
  
  return null;
}

export { VIEW_PRESETS };
export default ViewToolbar;
