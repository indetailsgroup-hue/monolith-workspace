/**
 * Monolith Designer Workspace - Main App
 *
 * SPEC-08 Compliant Architecture:
 * - Left Panel: Designer Intent (Catalog, Materials, Hardware, Versions)
 * - Viewport: R3F Canvas with Cabinet3D + View System
 * - Right Panel: Parametric Contract (Dimensions, Rules, Safety)
 * 
 * Features:
 * - View System (Front/Left/Perspective/Install/Factory/CNC)
 * - Panel Selection & Override
 * - Hardware System
 * - Gate & Export System
 * - Safety & Gate Page (Manufacturing OS Theme)
 * - Save/Load Project System
 */

import { useState, Suspense, useEffect, useRef, lazy } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { AppShell } from './components/layout/AppShell';
import { DesignerIntentPanel } from './components/layout/DesignerIntentPanel';
import { ParametricContractPanel } from './components/layout/ParametricContractPanel';
import { Cabinet3D, SceneRaycastPolicy } from './components/canvas/Cabinet3D';
import { InfiniteGrid } from './components/canvas/InfiniteGrid';
import { UnderlayPlane } from './components/canvas/UnderlayPlane';
import { DxfUnderlay } from './components/canvas/DxfUnderlay';
import { ReferenceWalls } from './components/canvas/ReferenceWalls';
import { useUnderlayStore } from './core/store/useUnderlayStore';
import { mountWorktopReconciler } from './core/worktop/worktopReconciler';
import { CameraController, ViewType, VIEW_PRESETS } from './components/canvas/ViewportController';
import { ProjectToolbar } from './components/ui/ProjectToolbar';
import { GateToolbar } from './components/ui/GateToolbar';
import { SceneToolbar } from './components/ui/SceneToolbar';
import { readWorkItemFromUrl } from './bridge/fieldBridge';
import { FieldBridgeButton } from './bridge/FieldBridgeButton';
import { useCabinetStore } from './core/store/useCabinetStore';
import { useProjectStore } from './core/store/useProjectStore';
import { useIntentPanelStore } from './designer/state/useIntentPanelStore';
import { useSpecStore, useSpecState, useGateStatus } from './core/store/useSpecStore';
import { useToolStore, handleToolHotkey, useToolHotkeys } from './core/store/useToolStore';
import { GlueModeOverlay } from './components/canvas/GlueFaceHighlights';
import { useGlueStore } from './core/store/useGlueStore';
import { calculateGlueAlignment, CabinetBounds } from './core/utils/glueSystem';
import { GizmoHUD } from './components/ui/GizmoHUD';
import { useGizmoStore } from './core/store/useGizmoStore';
import { useSnapStore } from './core/store/useSnapStore';
import { ContextToolbar } from './components/ui/ContextToolbar';
import { useGlobalHotkeys, useRadialMenuTrigger } from './core/ui/useGlobalHotkeys';
import { useModelingStore } from './core/modeling';
import { SceneRegistryProvider } from './components/canvas/scene';
import { SketchInputLayer } from './components/canvas/SketchInputLayer';
import { SketchPreview, SketchEntitiesRenderer } from './components/canvas/SketchPreview';
import { SketchSnapGlyphs } from './components/canvas/SketchSnapGlyphs';
import { SketchToolbar, SketchHUD, CPlaneSelector } from './components/ui/SketchOverlay';
import { ConstructionPlane } from './components/canvas/ConstructionPlane';
import { SnapGuides } from './components/canvas/SnapGuides';
import { MeasureLayer } from './components/tools/MeasureLayer';
import { ToastContainer } from './components/ui/ToastContainer';
import { AppGateProvider } from './components/gate/AppGateProvider';
import { handleSafetyHotkey } from './components/gate/safetyHotkey';
import { exportFactoryPacketWithToasts } from './components/export/exportFactoryPacketWithToasts';
import { useDrillMapStore } from './core/store/useDrillMapStore';
import { useViewStore } from './core/store/useViewStore';
import { useSelectionStore } from './core/store/useSelectionStore';
import { usePreloadTextures } from './core/materials/useMaterialStore';
import { readTheme, writeTheme, type AppTheme } from './core/persistence/appPrefs';

// ============================================
// T018: LAZY-LOADED COMPONENTS (Code Splitting)
// These components are conditionally rendered, so we lazy-load them
// to reduce initial bundle size. Each gets its own chunk.
// ============================================

// Heavy modal - only shown when editing panel
const PanelConfigModal = lazy(() =>
  import('./components/ui/PanelOverrideModal').then(m => ({ default: m.PanelConfigModal }))
);

// Heavy view - only shown when CAD view enabled
const CADDrillMapView = lazy(() =>
  import('./components/canvas/CADDrillMapView').then(m => ({ default: m.CADDrillMapView }))
);

// Command palette - only shown on Space/Cmd+K
const CommandPalette = lazy(() =>
  import('./components/ui/CommandPalette').then(m => ({ default: m.CommandPalette }))
);

// Radial menu - only shown on right-click
const RadialMenu = lazy(() =>
  import('./components/ui/RadialMenu').then(m => ({ default: m.RadialMenu }))
);

// Hardware context menu - only shown on hardware right-click
const HardwareContextMenu = lazy(() =>
  import('./components/ui/HardwareContextMenu').then(m => ({ default: m.HardwareContextMenu }))
);

// P001: Shortcut help overlay - shown on ? or Ctrl+/
const ShortcutOverlay = lazy(() =>
  import('./components/ui/ShortcutOverlay').then(m => ({ default: m.ShortcutOverlay }))
);

// ============================================
// GLOBAL ERROR SUPPRESSION FOR R3F RAYCAST
// ============================================
// R3F sometimes tries to raycast against disposed meshes during component unmount
// This is a known issue that doesn't affect functionality - suppress these errors
const suppressedErrorPatterns = [
  'object.raycast is not a function',
  'raycast is not a function',
];

const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args[0]?.toString?.() || '';
  if (suppressedErrorPatterns.some(pattern => message.includes(pattern))) {
    // Silently suppress raycast errors from R3F mesh disposal
    return;
  }
  originalConsoleError.apply(console, args);
};

// Also suppress in window error handler for uncaught errors
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const message = event.message || event.error?.message || '';
    if (suppressedErrorPatterns.some(pattern => message.includes(pattern))) {
      event.preventDefault();
      return true;
    }
  });
}

// View Toolbar Component
function ViewToolbar({
  currentView,
  onViewChange
}: {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}) {
  const views: ViewType[] = ['Front', 'Left', 'Top', 'Perspective', 'Install', 'Factory', 'CNC'];

  return (
    <div className="flex items-center gap-1">
      {views.map((view) => {
        const preset = VIEW_PRESETS[view];
        const isOrtho = preset.isOrtho ?? false;

        return (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            className={`relative px-3 py-1.5 text-xs font-medium transition-all duration-200 rounded-md
              ${view === currentView
                ? isOrtho
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' // 2D views: cyan
                  : 'bg-green-500/10 text-green-400 border border-green-500/30' // 3D views: green
                : 'text-gray-500 hover:text-white hover:bg-surface-3'
              }`}
            title={preset.description}
          >
            {view}
            {/* Show 2D badge for orthographic views */}
            {isOrtho && (
              <span className="absolute -top-1 -right-1 text-[8px] bg-cyan-500/30 text-cyan-300 px-1 rounded font-mono">
                2D
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Get user's preferred theme (G9 compliant via appPrefs boundary)
 */
function getPreferredTheme(): AppTheme {
  // Always respect stored preference; default is 'dark'
  return readTheme();
}

// R3F Viewport Component with View System
interface ViewportProps {
  currentView: ViewType;
  showDimensions?: boolean;
  hideTooltip?: boolean;
  onDoubleClickPanel?: () => void;
}

// Gizmo HUD Container - connects to store and renders when in move mode
function GizmoHUDContainer() {
  const activeTool = useToolStore((s) => s.activeTool);
  const gizmoState = useGizmoStore((s) => ({
    showHUD: s.showHUD,
    space: s.space,
    axisOverride: s.axisOverride,
    activeAxis: s.session.activeAxis,
    activePlane: s.session.activePlane,
    planeMode: s.session.planeMode,
    isDragging: s.session.phase === 'dragging',
    stepMmOverride: s.stepMmOverride,
    isFine: s.isFine,
    isAlt: s.isAlt,
    freeDeltaWorld: s.session.freeDeltaWorld,
    planeDelta2D: s.session.planeDelta2D,
    planeLock: s.session.planeDragState?.locked ?? null,
  }));

  // Get snap state from useSnapStore
  const snapState = useSnapStore((s) => ({
    enabled: s.enabled,
    isSnapping: s.isSnapping,
    activeCandidate: s.activeCandidate,
  }));

  // Only show HUD in move mode
  if (activeTool !== 'move') return null;

  // Get delta distance along active axis
  const deltaDistance = Math.sqrt(
    gizmoState.freeDeltaWorld.x ** 2 +
    gizmoState.freeDeltaWorld.y ** 2 +
    gizmoState.freeDeltaWorld.z ** 2
  );

  // Determine effective axis (active drag axis takes precedence over keyboard override)
  const effectiveAxis = gizmoState.activeAxis ?? gizmoState.axisOverride;

  // Determine effective plane (from active drag)
  const effectivePlane = gizmoState.activePlane ?? null;

  return (
    <GizmoHUD
      visible={gizmoState.showHUD}
      space={gizmoState.space}
      axis={effectiveAxis}
      plane={effectivePlane}
      isDragging={gizmoState.isDragging}
      deltaMm={deltaDistance}
      planeDelta={gizmoState.planeDelta2D}
      planeLock={gizmoState.planeLock}
      planeMode={gizmoState.planeMode}
      stepMm={gizmoState.stepMmOverride}
      isFine={gizmoState.isFine}
      isAlt={gizmoState.isAlt}
      snapEnabled={snapState.enabled}
      engaged={snapState.isSnapping}
      candidates={snapState.activeCandidate ? 1 : 0}
    />
  );
}

function Viewport({ currentView, showDimensions = false, hideTooltip = false, onDoubleClickPanel }: ViewportProps) {
  const preset = VIEW_PRESETS[currentView];
  const isOrtho = preset.isOrtho ?? false;
  const orthoZoom = preset.orthoZoom ?? 0.4;

  // Field deep link (ADR-057 Phase 1): DesignerHome เปิดมาพร้อม ?work_item= — จำไว้ให้ bridge ใช้
  useEffect(() => { readWorkItemFromUrl(); }, []);

  // WebGL context loss recovery - increment key to force Canvas remount
  const [contextLossCount, setContextLossCount] = useState(0);
  const lastRecoveryTime = useRef(0);

  // Handle WebGL context loss with cooldown to prevent rapid recoveries
  useEffect(() => {
    let mounted = true;

    const handleContextLost = (event: Event) => {
      event.preventDefault();

      // Cooldown: Don't recover more than once per 2 seconds
      const now = Date.now();
      if (now - lastRecoveryTime.current < 2000) {
        console.warn('[WebGL] Context lost, but recovery cooldown active');
        return;
      }

      console.warn('[WebGL] Context lost, attempting recovery in 500ms...');
      lastRecoveryTime.current = now;

      // Wait longer before remounting to let GPU resources settle
      setTimeout(() => {
        if (mounted) {
          setContextLossCount(c => c + 1);
        }
      }, 500);
    };

    const handleContextRestored = () => {
      console.log('[WebGL] Context restored');
    };

    // Use MutationObserver to handle canvas element changes after remount
    const attachListeners = () => {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        canvas.addEventListener('webglcontextlost', handleContextLost);
        canvas.addEventListener('webglcontextrestored', handleContextRestored);
        return canvas;
      }
      return null;
    };

    // Initial attachment
    let canvas = attachListeners();

    // If canvas not found yet, wait for it
    if (!canvas) {
      const timer = setTimeout(() => {
        canvas = attachListeners();
      }, 100);
      return () => {
        mounted = false;
        clearTimeout(timer);
      };
    }

    return () => {
      mounted = false;
      if (canvas) {
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      }
    };
  }, [contextLossCount]);

  // Key forces Canvas re-mount when switching between ortho/perspective OR on context loss
  const cameraKey = `${isOrtho ? 'ortho' : 'persp'}-${contextLossCount}`;

  return (
    <Canvas
      key={cameraKey}
      shadows
      orthographic={isOrtho}
      camera={isOrtho ? {
        position: preset.position,
        zoom: orthoZoom,
        near: 1,
        far: 100000,
      } : {
        position: preset.position,
        fov: preset.fov,
        near: 1,
        far: 100000
      }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',  // Use dedicated GPU
        failIfMajorPerformanceCaveat: false,  // Don't fail on low-end GPUs
      }}
      style={{ background: 'rgb(var(--surface-0))' }}
    >
      <SceneRegistryProvider>
        <Suspense fallback={null}>
          {/* Camera Controller - handles view transitions */}
          <CameraController viewType={currentView} />

          {/* Raycast Policy - configures layer filtering for X-Ray mode */}
          <SceneRaycastPolicy />

          {/* Lighting */}
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[2000, 3000, 2000]}
            intensity={1.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />
          <directionalLight
            position={[-1500, 1000, -1000]}
            intensity={0.3}
          />

          {/* Environment removed - was causing WebGL Context Lost
              Simple lighting is sufficient for cabinet visualization */}

          {/* Construction Plane for sketching */}
          <ConstructionPlane />

          {/* Sketch input layer (handles mouse events for sketching) */}
          <SketchInputLayer />

          {/* Sketch preview (shows line/rect preview while drawing) */}
          <SketchPreview showDimensions={showDimensions} />

          {/* Sketch committed entities (shows drawn shapes) */}
          <SketchEntitiesRenderer showDimensions={showDimensions} />

          {/* Sketch snap glyphs (endpoint/midpoint indicators) */}
          <SketchSnapGlyphs />

          {/* Cabinet */}
          <Cabinet3D showDimensions={showDimensions} hideTooltip={hideTooltip} onDoubleClickPanel={onDoubleClickPanel} />

          {/* Snap guides and point glyphs */}
          <SnapGuides />

          {/* Measure Tool Layer */}
          <MeasureLayer />

          {/* Infinite Grid - hide in Left view (grid appears as horizontal lines when viewed edge-on) */}
          {currentView !== 'Left' && <InfiniteGrid />}

          {/* FP-1 (ADR-062): แปลนอ้างอิงรองพื้น — render-only ไม่แตะ manufacturing */}
          <UnderlayPlane />
          <DxfUnderlay />
          <ReferenceWalls />

          {/* Controls - disable rotation for 2D ortho views */}
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.05}
            minDistance={isOrtho ? 100 : 500}
            maxDistance={isOrtho ? 50000 : 10000}
            enableRotate={!isOrtho}
            target={preset.target}
          />
        </Suspense>
      </SceneRegistryProvider>
    </Canvas>
  );
}

export function App() {
  // Use Zustand store for view state (syncs with Cabinet3D dimensions filtering)
  const currentView = useViewStore((s) => s.currentView);
  const setCurrentView = useViewStore((s) => s.setView);
  const showPanelModal = useSelectionStore((s) => s.showPanelConfigModal);
  const openPanelConfigModal = useSelectionStore((s) => s.openPanelConfigModal);
  const closePanelConfigModal = useSelectionStore((s) => s.closePanelConfigModal);
  const [showDimensions, setShowDimensions] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(() => getPreferredTheme());

  const cabinet = useCabinetStore((s) => s.cabinet);
  const selectedPanelId = useCabinetStore((s) => s.selectedPanelId);

  // CAD View state
  const showCADView = useDrillMapStore((s) => s.showCADView);
  const drillMap = useDrillMapStore((s) => s.drillMap);
  const toggleShowCADView = useDrillMapStore((s) => s.toggleShowCADView);

  // T016: Preload only active material's texture (not all)
  usePreloadTextures();

  // Enable tool hotkeys (including glue mode shortcuts)
  useToolHotkeys();

  // Enable global hotkeys (F for Command Palette, G/R, Q/W/E, etc.)
  useGlobalHotkeys();

  // Enable radial menu on right-click
  useRadialMenuTrigger();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeTheme(theme); // G9 compliant via appPrefs boundary
  }, [theme]);

  // S15-3: hydrate spec state จาก server ตอนเปิด/สลับโปรเจกต์ — server เป็น authority (ADR-060)
  // ไม่งั้น reload แล้ว client เชื่อ DRAFT ทั้งที่ server FROZEN → spec drift
  const projectId = useProjectStore((s) => s.metadata?.id);
  useEffect(() => {
    if (projectId) {
      void useSpecStore.getState().syncWithServer();
    }
  }, [projectId]);

  // Worktops are DERIVED from cabinet placement, never persisted, so they have
  // to be re-derived whenever the scene geometry moves. One subscription covers
  // every mutating action; its signature excludes WORKTOP panels, so the pass
  // cannot re-trigger itself. See core/worktop/worktopReconciler.ts.
  useEffect(() => mountWorktopReconciler(), []);

  // Glue confirmation effect - moves target cabinet when glue is confirmed
  // Subscribe to glue confirmation - when mode goes to 'idle' after 'preview', move cabinet
  useEffect(() => {
    const unsubscribe = useGlueStore.subscribe((state, prevState) => {
      // ONLY trigger when transitioning from 'preview' to 'idle' (user pressed Enter)
      const isPreviewToIdle = prevState.mode === 'preview' && state.mode === 'idle';
      const hasSource = !!prevState.source;
      const hasTarget = !!prevState.target;

      if (isPreviewToIdle && hasSource && hasTarget) {
        // Capture values before the async delay (they might be cleared from store)
        // Non-null assertion is safe because we checked hasSource && hasTarget above
        const source = prevState.source!;
        const target = prevState.target!;

        // CRITICAL: Delay the entire operation to let React re-render and R3F finish event processing
        // This prevents raycast errors from disposed/transitioning meshes
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Read cabinets fresh from store to avoid stale closure
            const currentCabinets = useCabinetStore.getState().cabinets;
            const sourceCab = currentCabinets.find(c => c.id === source.cabinetId);
            const targetCab = currentCabinets.find(c => c.id === target.cabinetId);

            if (sourceCab && targetCab) {
              // scenePosition is the CORNER of the cabinet (where group is placed)
              // calculateGlueAlignment expects CENTER position
              // So we must convert: corner -> center -> calculate -> center -> corner

              const sourceCorner = (sourceCab as any).scenePosition || [0, 0, 0];
              const targetCorner = (targetCab as any).scenePosition || [0, 0, 0];

              // Convert corner to center position
              const sourceCenterPos: [number, number, number] = [
                sourceCorner[0] + sourceCab.dimensions.width / 2,
                sourceCorner[1] + sourceCab.dimensions.height / 2,
                sourceCorner[2] + sourceCab.dimensions.depth / 2,
              ];

              const targetCenterPos: [number, number, number] = [
                targetCorner[0] + targetCab.dimensions.width / 2,
                targetCorner[1] + targetCab.dimensions.height / 2,
                targetCorner[2] + targetCab.dimensions.depth / 2,
              ];

              // Build cabinet bounds with CENTER positions
              const sourceBounds: CabinetBounds = {
                id: sourceCab.id,
                position: sourceCenterPos,
                dimensions: {
                  width: sourceCab.dimensions.width,
                  height: sourceCab.dimensions.height,
                  depth: sourceCab.dimensions.depth,
                },
                rotation: (sourceCab as any).sceneRotation?.[1] || 0,
                toeKickHeight: sourceCab.dimensions.toeKickHeight,
              };

              const targetBounds: CabinetBounds = {
                id: targetCab.id,
                position: targetCenterPos,
                dimensions: {
                  width: targetCab.dimensions.width,
                  height: targetCab.dimensions.height,
                  depth: targetCab.dimensions.depth,
                },
                rotation: (targetCab as any).sceneRotation?.[1] || 0,
                toeKickHeight: targetCab.dimensions.toeKickHeight,
              };

              // Calculate new CENTER position for target cabinet
              const result = calculateGlueAlignment(
                { cabinet: sourceBounds, face: source.face },
                { cabinet: targetBounds, face: target.face },
                0, // No gap
                { alignFronts: true, alignBottoms: true }
              );

              // Convert result CENTER position back to CORNER position for storage
              const newCornerPosition: [number, number, number] = [
                result.newPosition[0] - targetCab.dimensions.width / 2,
                result.newPosition[1] - targetCab.dimensions.height / 2,
                result.newPosition[2] - targetCab.dimensions.depth / 2,
              ];

              // Update target cabinet position (corner-based)
              useCabinetStore.getState().updateCabinetPosition(target.cabinetId, newCornerPosition);

              // Switch back to select tool after a delay
              // This gives GlueFaceHighlights time to complete its delayed unmount
              // and prevents R3F raycast errors from disposed meshes
              setTimeout(() => {
                useToolStore.getState().setTool('select');
              }, 250);
            } else {
              console.error('[Glue] Could not find source or target cabinet');
            }
          }); // Close inner requestAnimationFrame
        }); // Close outer requestAnimationFrame
      }
    });

    return () => unsubscribe();
  }, []); // Empty dependency - subscription handles its own state

  // Spec store - Gate & Validation
  const specState = useSpecState();
  const gateStatus = useGateStatus();
  const runValidation = useSpecStore((s) => s.runValidation);
  // These will be used when gate controls are implemented in the UI
  void useSpecStore.getState().freezeSpec;
  void useSpecStore.getState().releaseSpec;
  void useSpecStore.getState().unfreezeSpec;
  
  // Project store
  const initializeProject = useProjectStore((s) => s.initialize);
  const saveProject = useProjectStore((s) => s.saveProject);
  const markDirty = useProjectStore((s) => s.markDirty);
  
  // Initialize project on first load
  useEffect(() => {
    initializeProject();
    // Run initial validation
    setTimeout(() => runValidation(), 500);
  }, []);
  
  // T017: Debounced validation (300ms) to avoid running on every keystroke
  const validationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mark dirty when cabinet changes (for auto-save)
  useEffect(() => {
    if (cabinet) {
      markDirty();
      // T017: Debounce validation runs (300ms) instead of running synchronously
      if (validationTimerRef.current) {
        clearTimeout(validationTimerRef.current);
      }
      validationTimerRef.current = setTimeout(() => {
        runValidation();
        validationTimerRef.current = null;
      }, 300);
    }
    return () => {
      if (validationTimerRef.current) {
        clearTimeout(validationTimerRef.current);
      }
    };
  }, [cabinet?.updatedAt]);
  
  // Get cabinet actions for keyboard shortcuts
  const activeCabinetId = useCabinetStore((s) => s.activeCabinetId);
  const removeCabinet = useCabinetStore((s) => s.removeCabinet);
  const duplicateCabinet = useCabinetStore((s) => s.duplicateCabinet);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Press 'E' to edit selected panel
      if (e.key === 'e' && selectedPanelId) {
        openPanelConfigModal();
        return;
      }

      // Press 'Escape' to close modal or deselect panel/cabinet
      if (e.key === 'Escape') {
        if (showPanelModal) {
          closePanelConfigModal();
        } else if (selectedPanelId) {
          useCabinetStore.getState().selectPanel(null);
        } else if (activeCabinetId) {
          useCabinetStore.getState().selectCabinet(null);
        }
        return;
      }

      // S18: Shift+G / T เปิดแท็บ Safety ในแอป (แทน navigate ไป /safety หน้า demo)
      // ต้องเช็คก่อน tool hotkeys — handleToolHotkey จับ 'G' แบบ case-insensitive
      // ไม่งั้น Shift+G โดน Move tool กินคีย์ไปก่อน
      if (!e.ctrlKey && !e.metaKey && handleSafetyHotkey(e)) {
        return;
      }

      // Tool hotkeys (V=Select, G=Move, R=Rotate, S=Scale, M=Measure, U=UV)
      if (!e.ctrlKey && !e.metaKey) {
        if (handleToolHotkey(e.key)) {
          e.preventDefault();
          return;
        }
      }

      // Press 'D' to toggle dimensions
      if (e.key === 'd' && !e.ctrlKey && !e.metaKey) {
        setShowDimensions(prev => !prev);
        return;
      }

      // Ctrl+S to save
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveProject();
        return;
      }

      // Delete key to remove selected cabinet
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeCabinetId) {
        e.preventDefault();
        removeCabinet(activeCabinetId);
        return;
      }

      // Ctrl+D to duplicate selected cabinet
      if (e.key === 'd' && (e.ctrlKey || e.metaKey) && activeCabinetId) {
        e.preventDefault();
        duplicateCabinet(activeCabinetId);
        return;
      }

      // Space or Cmd+K to open Command Palette (Plasticity-style)
      if (e.key === ' ' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        useModelingStore.getState().openCommandPalette();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPanelId, activeCabinetId, saveProject, showPanelModal, openPanelConfigModal, closePanelConfigModal, removeCabinet, duplicateCabinet]);

  const handleExport = async () => {
    console.log('[Export] Starting factory packet export...');
    // S18: ผล export/upload แสดงเป็น toast บนจอ (สำเร็จ = ชื่อไฟล์+ขนาด,
    // ล้มเหลว = error) — ไม่เงียบอยู่ใน console/alert อีกต่อไป
    await exportFactoryPacketWithToasts();
  };
  
  // Header Toolbar - consolidated in top bar
  const headerToolbar = (
    <div className="flex items-center gap-2">
      {/* Project Toolbar */}
      <ProjectToolbar />

      <div className="w-px h-6 bg-oi-border" />

      {/* View Toolbar */}
      <ViewToolbar currentView={currentView} onViewChange={setCurrentView} />

      <div className="w-px h-6 bg-oi-border" />

      {/* Dims Toggle */}
      <button
        onClick={() => setShowDimensions(!showDimensions)}
        className={`px-3 py-1.5 text-xs font-medium transition-all duration-200 rounded-md
          ${showDimensions
            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
            : 'text-gray-500 hover:text-white hover:bg-surface-3'
          }`}
        title="Toggle Dimensions (D)"
      >
        📏 Dims
      </button>

      <div className="w-px h-6 bg-oi-border" />

      {/* Theme Toggle */}
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="px-3 py-1.5 text-xs font-medium transition-all duration-200 rounded-md text-gray-500 hover:text-white hover:bg-surface-3"
        title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        aria-pressed={theme === 'light'}
      >
        {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
      </button>

      <div className="w-px h-6 bg-oi-border" />

      {/* Field Bridge (ADR-058 เฟส 2): ส่ง cutlist เข้าระบบหน้างาน */}
      <FieldBridgeButton />

      <div className="w-px h-6 bg-oi-border" />

      {/* Gate Toolbar */}
      <GateToolbar />

      <div className="w-px h-6 bg-oi-border" />

      {/* Details Button — S16: เปิดแท็บ Safety จริง (Minifix+G11+Connector OS gate)
          ไม่พาไป /diagnostics/safety ซึ่งเป็นหน้า demo/mock */}
      <button
        onClick={() => useIntentPanelStore.getState().setActiveTab('safety')}
        className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-surface-3 rounded-md transition-all duration-200"
        title="เปิดแท็บ Safety Gate (ตรวจ drill map จริง)"
      >
        🛡️ Details
      </button>
    </div>
  );

  // Viewport with overlays (only bottom items now)
  const underlayActive = useUnderlayStore((s) => (!!s.imageDataUrl && s.visible) || (!!s.dxfSegments && s.dxfVisible) || (s.walls.length > 0 && s.wallsVisible) || s.tracing);

  const viewportWithToolbar = (
    <div className="relative w-full h-full">
      {/* FP-1 (ADR-062): ป้ายหลักเหล็ก — underlay เป็นภาพอ้างอิง ไม่ใช่ขนาดผลิต */}
      {underlayActive && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-2 py-1 rounded bg-amber-500/20 text-amber-300 text-[10px] pointer-events-none">
          🗺️ REFERENCE underlay — ไม่ใช่ขนาดผลิต (ขนาดจริงต้องวัดหน้างาน)
        </div>
      )}
      {/* Selected Panel Info */}
      {selectedPanelId && (
        <div className="absolute bottom-4 left-4 z-10">
          <div className="bg-surface-2/80 backdrop-blur-sm border border-oi-border rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-gray-500">Selected Panel</div>
              <button
                onClick={() => useCabinetStore.getState().selectPanel(null)}
                className="text-gray-500 hover:text-white transition-all duration-200 p-0.5 -mr-1"
                title="Deselect (Esc)"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="text-sm text-textc-primary font-medium">
              {cabinet?.panels.find(p => p.id === selectedPanelId)?.name || 'Unknown'}
            </div>
            <div className="text-xs text-green-400 mt-1 font-mono">Double-click to edit • Esc to deselect</div>
          </div>
        </div>
      )}

      {/* Scene Toolbar - Bottom Center */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
        <SceneToolbar />
      </div>

      {/* Sketch Toolbar - Left Side (when sketch mode enabled) */}
      <div className="absolute top-4 left-4 z-20">
        <SketchToolbar />
      </div>

      {/* Sketch HUD - Top Center (shows coordinates/tool info) */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20">
        <SketchHUD />
      </div>

      {/* CPlane Selector - Top Right */}
      <div className="absolute top-4 right-4 z-20">
        <CPlaneSelector />
      </div>

      {/* Gizmo HUD - Bottom Left (only shows in move mode) */}
      <GizmoHUDContainer />

      {/* Viewport */}
      <Viewport currentView={currentView} showDimensions={showDimensions} hideTooltip={showPanelModal} onDoubleClickPanel={() => openPanelConfigModal()} />
    </div>
  );

  return (
    // S18: Safety Gate วิ่งเองเมื่อ cabinets/drillMap เปลี่ยน (autoRun)
    // → canFreeze/gateStatus สดเสมอ ไม่ต้องรอผู้ใช้เปิดแท็บ Safety
    <AppGateProvider>
      <AppShell
        project={{
          name: cabinet?.name || 'Kitchen Base Cabinet',
          version: '1.2',
          specState,
          gateStatus: gateStatus.canExport ? 'OK' : 'WARNING',
          gateErrors: gateStatus.blockers.filter(b => b.includes('error')),
          gateWarnings: gateStatus.blockers.filter(b => !b.includes('error')),
        }}
        leftPanel={<DesignerIntentPanel />}
        viewport={viewportWithToolbar}
        rightPanel={<ParametricContractPanel />}
        headerToolbar={headerToolbar}
        onExport={handleExport}
      />
      
      {/* T018: Panel Config Modal - Lazy loaded */}
      <Suspense fallback={null}>
        <PanelConfigModal
          panelId={selectedPanelId}
          isOpen={showPanelModal}
          onClose={() => closePanelConfigModal()}
        />
      </Suspense>

      {/* Glue Mode Status Overlay */}
      <GlueModeOverlay />

      {/* T018: CAD Drill Map View Overlay - Lazy loaded */}
      {showCADView && drillMap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto relative bg-white rounded-xl shadow-2xl overflow-hidden max-w-[95vw] max-h-[95vh]">
            {/* Close button */}
            <button
              onClick={toggleShowCADView}
              className="absolute top-2 right-2 z-10 p-2 rounded-full bg-gray-800/80 text-white hover:bg-gray-700 transition-colors"
              title="Close CAD View (Esc)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <Suspense fallback={
              <div className="w-[900px] h-[700px] flex items-center justify-center bg-surface-2">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin mb-3 mx-auto" />
                  <div className="text-sm text-gray-400">Loading CAD View...</div>
                </div>
              </div>
            }>
              <CADDrillMapView
                drillMap={drillMap}
                width={900}
                height={700}
                showCoordinates={true}
                showLabels={true}
                showDimensions={true}
                projectName="Cabinet Project"
                drawingNumber="DM-01"
                scaleText="1:10"
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* T018: Plasticity-Style Modeling Layer - Lazy loaded overlays */}
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
      <Suspense fallback={null}>
        <RadialMenu />
      </Suspense>
      <Suspense fallback={null}>
        <HardwareContextMenu />
      </Suspense>
      {/* P001: Shortcut Help Overlay */}
      <Suspense fallback={null}>
        <ShortcutOverlay />
      </Suspense>
      <ContextToolbar position="right" />

      {/* T014: Toast notifications for keyboard shortcuts */}
      <ToastContainer />
    </AppGateProvider>
  );
}

export default App;
