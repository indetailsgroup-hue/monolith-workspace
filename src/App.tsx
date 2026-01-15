/**
 * IIMOS Designer Workspace - Main App
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

import { useState, Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { AppShell } from './components/layout/AppShell';
import { DesignerIntentPanel } from './components/layout/DesignerIntentPanel';
import { ParametricContractPanel } from './components/layout/ParametricContractPanel';
import { Cabinet3D } from './components/canvas/Cabinet3D';
import { InfiniteGrid } from './components/canvas/InfiniteGrid';
import { CameraController, ViewType, VIEW_PRESETS } from './components/canvas/ViewportController';
import { PanelConfigModal } from './components/ui/PanelOverrideModal';
import { ProjectToolbar } from './components/ui/ProjectToolbar';
import { GateToolbar } from './components/ui/GateToolbar';
import { SceneToolbar } from './components/ui/SceneToolbar';
import { SafetyGatePage } from './components/pages/SafetyGatePage';
import { useCabinetStore } from './core/store/useCabinetStore';
import { useProjectStore } from './core/store/useProjectStore';
import { useSpecStore, useSpecState, useGateStatus } from './core/store/useSpecStore';
import { useToolStore, handleToolHotkey, useToolHotkeys } from './core/store/useToolStore';
import { GlueModeOverlay } from './components/canvas/GlueFaceHighlights';
import { useGlueStore } from './core/store/useGlueStore';
import { calculateGlueAlignment, CabinetBounds } from './core/utils/glueSystem';
import { GizmoHUD } from './components/ui/GizmoHUD';
import { useGizmoStore } from './core/store/useGizmoStore';
import { CommandPalette } from './components/ui/CommandPalette';
import { ContextToolbar } from './components/ui/ContextToolbar';
import { useModelingStore } from './core/modeling';

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

// App modes
type AppMode = 'designer' | 'safety-gate';

// View Toolbar Component
function ViewToolbar({
  currentView,
  onViewChange
}: {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}) {
  const views: ViewType[] = ['Front', 'Left', 'Perspective', 'Install', 'Factory', 'CNC'];

  return (
    <div className="flex items-center gap-1">
      {views.map((view) => (
        <button
          key={view}
          onClick={() => onViewChange(view)}
          className={`px-3 py-1.5 text-xs font-medium transition-all duration-200 rounded-md
            ${view === currentView
              ? 'bg-green-500/10 text-green-400 border border-green-500/30'
              : 'text-gray-500 hover:text-white hover:bg-surface-3'
            }`}
          title={VIEW_PRESETS[view].description}
        >
          {view}
        </button>
      ))}
    </div>
  );
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
      snapEnabled={false}  // TODO: Connect to snap system
      engaged={false}
      candidates={0}
    />
  );
}

function Viewport({ currentView, showDimensions = false, hideTooltip = false, onDoubleClickPanel }: ViewportProps) {
  return (
    <Canvas
      shadows
      camera={{ 
        position: VIEW_PRESETS[currentView].position, 
        fov: VIEW_PRESETS[currentView].fov, 
        near: 1, 
        far: 100000 
      }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: '#0a0a0a' }}
    >
      <Suspense fallback={null}>
        {/* Camera Controller */}
        <CameraController viewType={currentView} />
        
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
        
        {/* Environment for reflections */}
        <Environment preset="studio" />
        
        {/* Cabinet */}
        <Cabinet3D showDimensions={showDimensions} hideTooltip={hideTooltip} onDoubleClickPanel={onDoubleClickPanel} />
        
        {/* Infinite Grid */}
        <InfiniteGrid />
        
        {/* Controls */}
        <OrbitControls 
          makeDefault
          enableDamping
          dampingFactor={0.05}
          minDistance={500}
          maxDistance={10000}
          target={VIEW_PRESETS[currentView].target}
        />
      </Suspense>
    </Canvas>
  );
}

export function App() {
  const [currentView, setCurrentView] = useState<ViewType>('Perspective');
  const [showPanelModal, setShowPanelModal] = useState(false);
  const [showDimensions, setShowDimensions] = useState(false);
  const [appMode, setAppMode] = useState<AppMode>('designer');

  const cabinet = useCabinetStore((s) => s.cabinet);
  const selectedPanelId = useCabinetStore((s) => s.selectedPanelId);

  // Enable tool hotkeys (including glue mode shortcuts)
  useToolHotkeys();

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
  
  // Mark dirty when cabinet changes (for auto-save)
  useEffect(() => {
    if (cabinet) {
      markDirty();
      // Re-run validation when cabinet changes
      runValidation();
    }
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
      if (e.key === 'e' && selectedPanelId && appMode === 'designer') {
        setShowPanelModal(true);
        return;
      }

      // Press 'Escape' to close modal or deselect panel/cabinet
      if (e.key === 'Escape') {
        if (showPanelModal) {
          setShowPanelModal(false);
        } else if (selectedPanelId) {
          useCabinetStore.getState().selectPanel(null);
        } else if (activeCabinetId) {
          useCabinetStore.getState().selectCabinet(null);
        }
        return;
      }

      // Tool hotkeys (V=Select, G=Move, R=Rotate, S=Scale, M=Measure, U=UV)
      // Only in designer mode
      if (appMode === 'designer' && !e.ctrlKey && !e.metaKey) {
        if (handleToolHotkey(e.key)) {
          e.preventDefault();
          return;
        }
      }

      // Press 'T' to toggle Safety & Gate page (changed from G)
      if (e.key === 't' && !e.ctrlKey && !e.metaKey) {
        setAppMode(prev => prev === 'designer' ? 'safety-gate' : 'designer');
        return;
      }

      // Press 'D' to toggle dimensions
      if (e.key === 'd' && !e.ctrlKey && !e.metaKey && appMode === 'designer') {
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
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeCabinetId && appMode === 'designer') {
        e.preventDefault();
        removeCabinet(activeCabinetId);
        return;
      }

      // Ctrl+D to duplicate selected cabinet
      if (e.key === 'd' && (e.ctrlKey || e.metaKey) && activeCabinetId && appMode === 'designer') {
        e.preventDefault();
        duplicateCabinet(activeCabinetId);
        return;
      }

      // Space or Cmd+K to open Command Palette (Plasticity-style)
      if ((e.key === ' ' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && appMode === 'designer') {
        e.preventDefault();
        useModelingStore.getState().openCommandPalette();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPanelId, activeCabinetId, appMode, saveProject, showPanelModal, removeCabinet, duplicateCabinet]);
  
  // If in Safety & Gate mode, show that page
  if (appMode === 'safety-gate') {
    return (
      <div>
        <SafetyGatePage />
        {/* Floating button to go back */}
        <button
          onClick={() => setAppMode('designer')}
          className="fixed bottom-6 right-6 px-4 py-2 bg-green-500 text-black font-medium rounded-lg shadow-lg hover:bg-green-400 hover:shadow-glow-green transition-all duration-200 z-50"
        >
          ← Back to Designer (T)
        </button>
      </div>
    );
  }

  const handleExport = () => {
    console.log('Exporting to CNC...');
    // TODO: Implement export logic
  };
  
  // Viewport with view toolbar overlay
  const viewportWithToolbar = (
    <div className="relative w-full h-full">
      {/* Project Toolbar - Top Left */}
      <div className="absolute top-4 left-4 z-10">
        <div className="bg-surface-2/80 backdrop-blur-sm border border-[#333] rounded-xl px-3 py-2">
          <ProjectToolbar />
        </div>
      </div>

      {/* View Toolbar - Top Center */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
        <div className="bg-surface-2/80 backdrop-blur-sm border border-[#333] rounded-xl p-1 flex items-center gap-1">
          <ViewToolbar currentView={currentView} onViewChange={setCurrentView} />
          <div className="w-px h-6 bg-[#333] mx-1" />
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
        </div>
      </div>

      {/* Gate Toolbar - Top Right */}
      <div className="absolute top-4 right-4 z-10">
        <div className="bg-surface-2/80 backdrop-blur-sm border border-[#333] rounded-xl px-3 py-2 flex items-center gap-2">
          <GateToolbar />
          <div className="w-px h-6 bg-[#333]" />
          <button
            onClick={() => setAppMode('safety-gate')}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-surface-3 rounded-md transition-all duration-200"
            title="Open Safety & Gate Page (T)"
          >
            🛡️ Details
          </button>
        </div>
      </div>

      {/* Selected Panel Info */}
      {selectedPanelId && (
        <div className="absolute bottom-4 left-4 z-10">
          <div className="bg-surface-2/80 backdrop-blur-sm border border-[#333] rounded-xl px-4 py-3">
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
            <div className="text-sm text-white font-medium">
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

      {/* Gizmo HUD - Bottom Left (only shows in move mode) */}
      <GizmoHUDContainer />

      {/* Viewport */}
      <Viewport currentView={currentView} showDimensions={showDimensions} hideTooltip={showPanelModal} onDoubleClickPanel={() => setShowPanelModal(true)} />
    </div>
  );

  return (
    <>
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
        onExport={handleExport}
      />
      
      {/* Panel Config Modal */}
      <PanelConfigModal
        panelId={selectedPanelId}
        isOpen={showPanelModal}
        onClose={() => setShowPanelModal(false)}
      />

      {/* Glue Mode Status Overlay */}
      <GlueModeOverlay />

      {/* Plasticity-Style Modeling Layer */}
      <CommandPalette />
      <ContextToolbar position="right" />
    </>
  );
}

export default App;
