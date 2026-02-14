/**
 * DesignerCanvasRoot.tsx - Complete 3D canvas setup for cabinet designer
 *
 * Self-contained canvas component that includes:
 * - SceneRegistryProvider for world bounding box calculations
 * - Proper lighting setup (ambient, directional, hemisphere)
 * - Infinite grid floor
 * - Cabinet rendering with auto-registration
 * - Snap guides visualization
 * - OrbitControls with sensible defaults
 * - Global hotkeys and command registry
 *
 * @version 2.0.0
 */

import { Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Grid } from '@react-three/drei';
import { SceneRegistryProvider } from '../../components/canvas/scene';
import { Cabinet3D } from '../../components/canvas/Cabinet3D';
import { SnapGuides } from '../../components/canvas/SnapGuides';
import { ConstructionPlane } from '../../components/canvas/ConstructionPlane';
import { SceneToolbar } from '../../components/ui/SceneToolbar';
import { RadialMenu, useRadialMenuHandler } from '../../components/ui/RadialMenu';
import { CommandPalette } from '../../components/ui/CommandPalette';
import { SketchToolbar, SketchHUD, CPlaneSelector } from '../../components/ui/SketchOverlay';
import { SketchInputLayer } from '../../components/canvas/SketchInputLayer';
import { SketchPreview } from '../../components/canvas/SketchPreview';
import { SketchSnapGlyphs } from '../../components/canvas/SketchSnapGlyphs';
import { SketchHudInput } from '../../components/ui/SketchHudInput';
import { FlatPartPreview2D } from '../../components/canvas/FlatPartPreview2D';
import { RightInspector } from './RightInspector';
import { HardwareEditPanel } from '../../components/ui/HardwareEditPanel';
import { useRehydrateToolStoreOnProjectChange } from '../../core/store/useRehydrateToolStoreOnProjectChange';
import { useRehydrateSnapStoreOnProjectChange } from '../../core/store/useRehydrateSnapStoreOnProjectChange';
import { useGlobalHotkeys, useRadialMenuTrigger } from '../../core/ui/useGlobalHotkeys';
import { registerDefaultUiCommands } from '../../core/commands/uiRegistry';

// ============================================
// TYPES
// ============================================

export interface DesignerCanvasRootProps {
  /**
   * Show dimension labels on cabinets
   */
  showDimensions?: boolean;

  /**
   * Hide tooltip on hover
   */
  hideTooltip?: boolean;

  /**
   * Called when a panel is double-clicked (for editing)
   */
  onDoubleClickPanel?: () => void;

  /**
   * Camera position [x, y, z] in mm
   */
  cameraPosition?: [number, number, number];

  /**
   * Camera target (look-at point) [x, y, z] in mm
   */
  cameraTarget?: [number, number, number];

  /**
   * Field of view in degrees
   */
  fov?: number;

  /**
   * Show the scene toolbar overlay
   */
  showToolbar?: boolean;

  /**
   * Show snap guides when moving cabinets
   */
  showSnapGuides?: boolean;

  /**
   * Background color (CSS color string)
   */
  backgroundColor?: string;

  /**
   * Show the right inspector panel
   */
  showInspector?: boolean;
}

// ============================================
// LIGHTING SETUP
// ============================================

function SceneLighting() {
  return (
    <>
      {/* Ambient light for base illumination */}
      <ambientLight intensity={0.4} />

      {/* Main directional light (sun) - from top-front-right */}
      <directionalLight
        position={[2000, 3000, 2000]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={10000}
        shadow-camera-left={-2000}
        shadow-camera-right={2000}
        shadow-camera-top={2000}
        shadow-camera-bottom={-2000}
      />

      {/* Fill light from opposite side */}
      <directionalLight
        position={[-1500, 1000, -1000]}
        intensity={0.3}
      />

      {/* Hemisphere light for natural sky/ground color blending */}
      <hemisphereLight
        args={['#87ceeb', '#3d3d3d', 0.3]}  // sky blue, dark ground, intensity
      />
    </>
  );
}

// ============================================
// FLOOR GRID
// ============================================

function FloorGrid() {
  return (
    <Grid
      position={[0, -0.5, 0]}
      args={[10000, 10000]}  // 10m x 10m in mm
      cellSize={100}        // 100mm cells
      cellThickness={0.5}
      cellColor="#404040"
      sectionSize={1000}    // 1000mm (1m) sections
      sectionThickness={1}
      sectionColor="#606060"
      fadeDistance={8000}
      fadeStrength={1}
      followCamera={false}
      infiniteGrid={true}
    />
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

// Initialize command registry once
let commandsRegistered = false;

export function DesignerCanvasRoot({
  showDimensions = false,
  hideTooltip = false,
  onDoubleClickPanel,
  cameraPosition = [2000, 1500, 2000],
  cameraTarget = [400, 400, 300],
  fov = 45,
  showToolbar = true,
  showSnapGuides = true,
  backgroundColor = '#0a0a0a',
  showInspector = true,
}: DesignerCanvasRootProps) {
  // Register default commands on mount
  useEffect(() => {
    if (!commandsRegistered) {
      registerDefaultUiCommands();
      commandsRegistered = true;
    }
  }, []);

  // Rehydrate stores when project changes
  useRehydrateToolStoreOnProjectChange();
  useRehydrateSnapStoreOnProjectChange();

  // Enable global keyboard shortcuts (F for palette, tool hotkeys)
  useGlobalHotkeys();

  // Enable right-click radial menu on canvas
  useRadialMenuHandler();
  useRadialMenuTrigger();

  return (
    <div className="relative w-full h-full" data-radial-menu-area>
      <Canvas
        shadows
        camera={{
          position: cameraPosition,
          fov,
          near: 1,
          far: 100000,
        }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: backgroundColor }}
      >
        <SceneRegistryProvider>
          <Suspense fallback={null}>
            {/* Lighting */}
            <SceneLighting />

            {/* Environment for reflections */}
            <Environment preset="studio" />

            {/* Floor grid */}
            <FloorGrid />

            {/* Construction Plane for sketching */}
            <ConstructionPlane />

            {/* Sketch input layer (handles mouse events) */}
            <SketchInputLayer />

            {/* Sketch preview (shows line/rect preview while drawing) */}
            <SketchPreview />

            {/* Sketch snap glyphs (endpoint/midpoint indicators) */}
            <SketchSnapGlyphs />

            {/* FlatPart 2D preview on CPlane */}
            <FlatPartPreview2D />

            {/* Cabinets - uses CabinetNode internally for registration */}
            <Cabinet3D
              showDimensions={showDimensions}
              hideTooltip={hideTooltip}
              onDoubleClickPanel={onDoubleClickPanel}
            />

            {/* Snap guides - shows alignment lines when dragging */}
            {showSnapGuides && <SnapGuides />}

            {/* Camera controls */}
            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.05}
              minDistance={500}
              maxDistance={10000}
              target={cameraTarget}
              maxPolarAngle={Math.PI / 2 - 0.05}  // Prevent going below floor
            />
          </Suspense>
        </SceneRegistryProvider>
      </Canvas>

      {/* Scene toolbar overlay */}
      {showToolbar && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
          <SceneToolbar />
        </div>
      )}

      {/* Sketch Toolbar (top-left) */}
      <SketchToolbar />

      {/* Sketch HUD (bottom-left) */}
      <SketchHUD />

      {/* CPlane Selector (top-right) */}
      <CPlaneSelector />

      {/* Sketch HUD Input (numeric input display) */}
      <SketchHudInput />

      {/* Command Palette (F or Space to open) */}
      <CommandPalette />

      {/* Radial Menu (right-click to open) */}
      <RadialMenu />

      {/* Right Inspector Panel */}
      {showInspector && <RightInspector />}

      {/* Hardware Edit Panel - shows when hardware is clicked */}
      <HardwareEditPanel />
    </div>
  );
}

// ============================================
// EXPORTS
// ============================================

export default DesignerCanvasRoot;
