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
import { SafetyGatePage } from './components/pages/SafetyGatePage';
import { useCabinetStore } from './core/store/useCabinetStore';
import { useProjectStore } from './core/store/useProjectStore';
import { useSpecStore, useSpecState, useGateStatus } from './core/store/useSpecStore';

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
}

function Viewport({ currentView, showDimensions = false, hideTooltip = false }: ViewportProps) {
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
        <Cabinet3D showDimensions={showDimensions} hideTooltip={hideTooltip} />
        
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
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Press 'E' to edit selected panel
      if (e.key === 'e' && selectedPanelId && appMode === 'designer') {
        setShowPanelModal(true);
      }
      // Press 'Escape' to close modal or deselect panel
      if (e.key === 'Escape') {
        if (showPanelModal) {
          setShowPanelModal(false);
        } else if (selectedPanelId) {
          useCabinetStore.getState().selectPanel(null);
        }
      }
      // Press 'G' to toggle Safety & Gate page
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        setAppMode(prev => prev === 'designer' ? 'safety-gate' : 'designer');
      }
      // Press 'D' to toggle dimensions
      if (e.key === 'd' && !e.ctrlKey && !e.metaKey && appMode === 'designer') {
        setShowDimensions(prev => !prev);
      }
      // Ctrl+S to save
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveProject();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPanelId, appMode, saveProject, showPanelModal]);
  
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
          ← Back to Designer (G)
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
            title="Open Safety & Gate Page (G)"
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
            <div className="text-xs text-green-400 mt-1 font-mono">Press E to edit • Esc to deselect</div>
          </div>
        </div>
      )}

      {/* Viewport */}
      <Viewport currentView={currentView} showDimensions={showDimensions} hideTooltip={showPanelModal} />
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
    </>
  );
}

export default App;
