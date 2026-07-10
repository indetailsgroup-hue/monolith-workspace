/**
 * DesignerIntentPanel - Updated with MaterialSelector
 * 
 * This file shows how to integrate MaterialSelector into the existing
 * DesignerIntentPanel component.
 */

import { useState } from 'react';
import { useCabinetStore, useCabinet } from '../../core/store/useCabinetStore';
import { useSelectionStore } from '../../core/store/useSelectionStore';
import { useIntentPanelStore } from '../../designer/state/useIntentPanelStore';
import { HardwarePanel } from '../ui/HardwarePanel';
import { HardwareConfigSelector } from '../ui/HardwareConfigSelector';
import { MaterialSelector } from '../ui/MaterialSelector';
import { PanelSortableList } from '../ui/SortableList';
import { ConstructionTypeSelector } from '../ui/ConstructionTypeSelector';
import { BIMClassificationBadge } from '../ui/BIMClassificationBadge';
import { ConnectorList } from '../ui/ConnectorList';
import {
  KerfBendingCalculator,
  HiddenDoorHingeCalculator,
  WainscotingCalculator,
  SlatCalculator,
} from '../calculators';
import { CNCToolPanel } from '../ui/CNCToolPanel';
import { SkillsPanel } from '../ui/SkillsPanel';
import { SafetyPanel, GateStatusIndicator } from '../../gate/ui';
import { UnderlayPanel } from '../ui/UnderlayPanel';
import {
  CoreStructureIcon,
  SurfaceFinishIcon,
  EdgeBandingIcon,
  MaterialStackIcon
} from '../icons/MaterialIcons';
import { Plus, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { DesignerLogicContent } from '../ui/DesignerLogicContent';

// Tab types
type TabId = 'catalog' | 'materials' | 'hardware' | 'decor' | 'skills' | 'safety' | 'logic' | 'versions';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: 'catalog', label: 'Catalog', icon: '📦' },
  { id: 'materials', label: 'Materials', icon: '🎨' },
  { id: 'hardware', label: 'Hardware', icon: '🔩' },
  { id: 'decor', label: 'Decor', icon: '🏛️' },
  { id: 'skills', label: 'Skills', icon: '⚡' },
  { id: 'safety', label: 'Safety', icon: '🛡️' },
  { id: 'logic', label: 'Logic', icon: '🧠' },
  { id: 'versions', label: 'Versions', icon: '📋' },
];

// ============================================
// MATERIALS TAB - With MaterialSelector
// ============================================
function MaterialsContent() {
  const cabinet = useCabinet();
  const coreMaterialsRaw = useCabinetStore((s) => s.coreMaterials);
  const surfaceMaterials = useCabinetStore((s) => s.surfaceMaterials);
  const edgeMaterialsOnly = useCabinetStore((s) => s.edgeMaterials);

  // Add 'type' property to core materials to match Material interface
  const coreMaterials = Object.fromEntries(
    Object.entries(coreMaterialsRaw).map(([id, material]) => [
      id,
      {
        ...material,
        type: material.id.includes('pb') ? 'PARTICLEBOARD' :
              material.id.includes('mdf') ? 'MDF' :
              material.id.includes('ply') ? 'PLYWOOD' : 'CORE'
      }
    ])
  );

  // Edge Banding should combine Surface Finish materials + Edge-specific materials (PVC, ABS, Veneer, Wood, Aluminum)
  // Add 'type' property to edge-only materials to match Material interface
  const edgeMaterialsWithType = Object.fromEntries(
    Object.entries(edgeMaterialsOnly).map(([id, material]) => [
      id,
      {
        ...material,
        type: material.id.includes('pvc') ? 'PVC' :
              material.id.includes('abs') ? 'ABS' :
              material.id.includes('wood') ? 'WOOD' :
              material.id.includes('alu') ? 'ALUMINUM' :
              material.id.includes('hpl') ? 'HPL' : 'EDGE'
      }
    ])
  );
  const edgeMaterials = { ...surfaceMaterials, ...edgeMaterialsWithType };

  const setDefaultCore = useCabinetStore((s) => s.setDefaultCore);
  const setDefaultSurface = useCabinetStore((s) => s.setDefaultSurface);
  const setDefaultEdge = useCabinetStore((s) => s.setDefaultEdge);

  if (!cabinet || !cabinet.materials) return null;

  const currentCoreId = cabinet.materials.defaultCore;
  const currentSurfaceId = cabinet.materials.defaultSurface;
  const currentEdgeId = cabinet.materials.defaultEdge;

  const currentCore = coreMaterials[currentCoreId as keyof typeof coreMaterials];
  const currentSurface = surfaceMaterials[currentSurfaceId as keyof typeof surfaceMaterials];
  
  return (
    <div className="p-2">
      {/* Header - Material Stack (Compact) */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
            <MaterialStackIcon className="w-3.5 h-3.5 text-green-400" />
          </div>
          <h3 className="text-xs font-medium text-white">Material Stack</h3>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            className="p-1 rounded hover:bg-surface-3 text-gray-500 hover:text-green-400 transition-all"
            title="Add material layer"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            className="p-1 rounded hover:bg-surface-3 text-gray-500 hover:text-white transition-all"
            title="Reset to defaults"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="h-[1px] w-full bg-[#333] mb-2" />

      {/* Material Selectors */}
      <div className="flex flex-col gap-1">
        {/* Core Structure */}
        <MaterialSelector
          title="Core Structure"
          materials={coreMaterials}
          selectedId={currentCoreId}
          onSelect={(id) => {
            console.log('Selected core:', id);
            setDefaultCore(id);
          }}
          icon={<CoreStructureIcon className="w-3 h-3" />}
          color="orange"
          number={1}
        />

        {/* Surface Finish */}
        <MaterialSelector
          title="Surface Finish"
          materials={surfaceMaterials}
          selectedId={currentSurfaceId}
          onSelect={(id) => {
            console.log('Selected surface:', id);
            setDefaultSurface(id);
          }}
          icon={<SurfaceFinishIcon className="w-3 h-3" />}
          color="blue"
          number={2}
        />

        {/* Edge Banding */}
        <MaterialSelector
          title="Edge Banding"
          materials={edgeMaterials}
          selectedId={currentEdgeId}
          onSelect={(id, applyMode) => {
            console.log('Selected edge:', id, 'applyMode:', applyMode);
            // setDefaultEdge applies all 4 sides (top/bottom/left/right) to all panels
            setDefaultEdge(id);
          }}
          icon={<EdgeBandingIcon className="w-3 h-3" />}
          color="cyan"
          number={3}
        />
      </div>

      {/* Panel Stack Preview (Compact) */}
      <div className="mt-2 p-2 bg-surface-2 rounded-lg border border-[#333]">
        <div className="text-[10px] text-gray-500 mb-1">Stack Preview</div>
        <div className="flex items-center gap-1 text-[10px]">
          <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20 font-mono">
            {currentCore?.thickness || 18}mm
          </span>
          <span className="text-gray-600">+</span>
          <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20 font-mono">
            {currentSurface?.thickness || 0.8}mm×2
          </span>
          <span className="text-gray-600">=</span>
          <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded border border-green-500/20 font-medium font-mono">
            {((currentCore?.thickness || 18) + (currentSurface?.thickness || 0.8) * 2).toFixed(1)}mm
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Panel List Component
// ============================================
function PanelList() {
  const cabinet = useCabinet();
  const selectedPanelId = useCabinetStore((s) => s.selectedPanelId);
  const selectPanel = useCabinetStore((s) => s.selectPanel);
  const removePanel = useCabinetStore((s) => s.removePanel);
  const setShelfCount = useCabinetStore((s) => s.setShelfCount);
  const setDividerCount = useCabinetStore((s) => s.setDividerCount);
  const openPanelConfigModal = useSelectionStore((s) => s.openPanelConfigModal);

  if (!cabinet) return null;

  // Handle delete panel - for Sub Shelf/Divider use removePanel, otherwise reduce count
  const handleDeletePanel = (id: string, role: string) => {
    // Find the panel to check if it's a Sub (compartment-created) panel
    const panel = cabinet.panels.find(p => p.id === id);

    if (panel?.name.startsWith('Sub')) {
      // Sub Shelf / Sub Divider - remove directly by ID
      removePanel(id);
    } else if (role === 'SHELF') {
      // Regular shelf - reduce count
      const currentCount = cabinet.structure.shelfCount;
      if (currentCount > 0) {
        setShelfCount(currentCount - 1);
      }
    } else if (role === 'DIVIDER') {
      // Regular divider - reduce count
      const currentCount = cabinet.structure.dividerCount;
      if (currentCount > 0) {
        setDividerCount(currentCount - 1);
      }
    }
  };

  return (
    <div className="overflow-y-auto pr-1">
      <PanelSortableList
        panels={(cabinet.panels || []).map(p => ({
          id: p.id,
          name: p.name || p.role,
          role: p.role,
          finishWidth: p.finishWidth,
          finishHeight: p.finishHeight,
          thickness: p.computed?.realThickness
        }))}
        selectedId={selectedPanelId}
        onSelectPanel={selectPanel}
        onDeletePanel={handleDeletePanel}
        onDoubleClickPanel={(id) => {
          selectPanel(id);
          openPanelConfigModal();
        }}
      />
    </div>
  );
}

// ============================================
// OTHER TABS (unchanged)
// ============================================

function CatalogContent() {
  const [showBIM, setShowBIM] = useState(false);
  const [showHardware, setShowHardware] = useState(true);
  const activeCabinetId = useCabinetStore((s) => s.activeCabinetId);

  return (
    <div className="p-2 space-y-2">
      {/* Construction Type Section */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-5 h-5 rounded bg-purple-500/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h4 className="text-xs font-medium text-white">Construction Type</h4>
        </div>
        <ConstructionTypeSelector />
      </div>

      {/* Hardware Configuration Section */}
      {activeCabinetId && (
        <div className="border-t border-[#333] pt-2">
          <button
            onClick={() => setShowHardware(!showHardware)}
            className="w-full flex items-center justify-between text-left mb-2"
          >
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded bg-cyan-500/20 flex items-center justify-center">
                <svg className="w-3 h-3 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h4 className="text-xs font-medium text-white">Hardware Config</h4>
            </div>
            {showHardware ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
          </button>
          {showHardware && <HardwareConfigSelector cabinetId={activeCabinetId} />}
        </div>
      )}

      {/* BIM Classification Section */}
      <div className="border-t border-[#333] pt-2">
        <button
          onClick={() => setShowBIM(!showBIM)}
          className="w-full flex items-center justify-between text-left mb-2"
        >
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center">
              <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h4 className="text-xs font-medium text-white">BIM Classification</h4>
          </div>
          {showBIM ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </button>
        {showBIM && <BIMClassificationBadge />}
      </div>

      {/* Panel List Section */}
      <div className="border-t border-[#333] pt-2">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-5 h-5 rounded bg-green-500/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h4 className="text-xs font-medium text-white">Panel List</h4>
        </div>
        <PanelList />
      </div>

      {/* Connectors List Section */}
      <div className="border-t border-[#333] pt-2">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-5 h-5 rounded bg-purple-500/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h4 className="text-xs font-medium text-white">Connectors List</h4>
        </div>
        <ConnectorList />
      </div>
    </div>
  );
}

function HardwareContent() {
  return <HardwarePanel />;
}

function SkillsContent() {
  return (
    <div className="p-2">
      <SkillsPanel />
    </div>
  );
}

function VersionsContent() {
  return (
    <div className="p-4">
      <div className="text-gray-500 text-sm">Versions content</div>
    </div>
  );
}

// ============================================
// DECOR TAB - Wall Decoration Calculators
// ============================================
type DecorSection = 'kerf' | 'hinge' | 'wainscoting' | 'slat' | 'cnc' | null;

function DecorContent() {
  const [activeSection, setActiveSection] = useState<DecorSection>(null);

  const sections: { id: DecorSection; name: string; nameTH: string; icon: string; color: string }[] = [
    { id: 'kerf', name: 'Kerf Bending', nameTH: 'งอไม้ Kerf', icon: '🌀', color: 'purple' },
    { id: 'hinge', name: 'Hidden Door', nameTH: 'ประตูซ่อน', icon: '🚪', color: 'blue' },
    { id: 'wainscoting', name: 'Wainscoting', nameTH: 'ลูกฟัก', icon: '🏛️', color: 'amber' },
    { id: 'slat', name: 'Slat Wall', nameTH: 'ระแนง', icon: '📐', color: 'green' },
    { id: 'cnc', name: 'CNC Tool', nameTH: 'ดอก CNC', icon: '🔧', color: 'purple' },
  ];

  return (
    <div className="p-2 space-y-2">
      {/* FP-1 (ADR-062): แปลนอ้างอิง underlay */}
      <UnderlayPanel />
      {/* Section Selector (Compact) */}
      <div className="grid grid-cols-2 gap-1">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
            className={`p-2 rounded-lg border transition-all text-left ${
              activeSection === section.id
                ? `bg-${section.color}-500/20 border-${section.color}-500/30`
                : 'bg-surface-2 border-[#333] hover:border-gray-500'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{section.icon}</span>
              <span className={`text-[10px] font-medium ${
                activeSection === section.id ? `text-${section.color}-400` : 'text-white'
              }`}>
                {section.nameTH}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Active Calculator */}
      {activeSection === 'kerf' && (
        <div className="border-t border-[#333] pt-2">
          <KerfBendingCalculator />
        </div>
      )}
      {activeSection === 'hinge' && (
        <div className="border-t border-[#333] pt-2">
          <HiddenDoorHingeCalculator />
        </div>
      )}
      {activeSection === 'wainscoting' && (
        <div className="border-t border-[#333] pt-2">
          <WainscotingCalculator />
        </div>
      )}
      {activeSection === 'slat' && (
        <div className="border-t border-[#333] pt-2">
          <SlatCalculator />
        </div>
      )}
      {activeSection === 'cnc' && (
        <div className="border-t border-[#333] pt-2">
          <CNCToolPanel />
        </div>
      )}

      {/* Hint when no section selected */}
      {!activeSection && (
        <div className="p-2 bg-surface-2 rounded-lg border border-[#333] text-center">
          <div className="text-gray-500 text-[10px]">
            Select a calculator above
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
export function DesignerIntentPanel() {
  // Use global store instead of local state (allows openSafety from anywhere)
  const activeTab = useIntentPanelStore((s) => s.activeTab);
  const setActiveTab = useIntentPanelStore((s) => s.setActiveTab);

  return (
    <div className="h-full flex flex-col bg-surface-1">
      {/* Tab Bar (Icons Only - Fits All 8 Tabs) */}
      <div className="flex border-b border-[#333] shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
            className={`flex-1 py-2 text-sm transition-all flex items-center justify-center relative
              ${activeTab === tab.id
                ? 'text-green-400 bg-surface-2'
                : 'text-gray-500 hover:text-white hover:bg-surface-2/50'
              }`}
          >
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-400" />
            )}
            {/* Show GateStatusIndicator for Safety tab */}
            {tab.id === 'safety' ? (
              <GateStatusIndicator
                size="sm"
                showCount={true}
                asSpan={true}
              />
            ) : (
              <span>{tab.icon}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'catalog' && <CatalogContent />}
        {activeTab === 'materials' && <MaterialsContent />}
        {activeTab === 'hardware' && <HardwareContent />}
        {activeTab === 'decor' && <DecorContent />}
        {activeTab === 'skills' && <SkillsContent />}
        {activeTab === 'safety' && <SafetyPanel />}
        {activeTab === 'logic' && <DesignerLogicContent />}
        {activeTab === 'versions' && <VersionsContent />}
      </div>
    </div>
  );
}

export default DesignerIntentPanel;
