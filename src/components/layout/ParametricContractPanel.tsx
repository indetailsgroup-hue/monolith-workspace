/**
 * ParametricContractPanel - Right Panel (FUNCTIONAL)
 * Tabs: Contract | Export
 */

import React, { useState, useRef, useEffect } from 'react';
import { useCabinetStore, useCabinet } from '../../core/store/useCabinetStore';
import { ExportPanel } from '../ui/ExportPanel';
import { PanelSortableList } from '../ui/SortableList';
import { SpringAnimatedNumber } from '../ui/AnimatedNumber';
import { DimensionSlider } from '../ui/DimensionSlider';
import { Maximize2, Maximize, Move, ArrowUpFromLine } from 'lucide-react';

type TabId = 'contract' | 'export';
type GateStatus = 'DRAFT' | 'FROZEN' | 'RELEASED';

function Section({ title, children, status, defaultOpen = true }: {
  title: string; children: React.ReactNode; status?: 'OK' | 'WARNING' | 'ERROR'; defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | 'auto'>('auto');
  const statusColors = { OK: 'bg-green-400', WARNING: 'bg-amber-400', ERROR: 'bg-red-400' };

  useEffect(() => {
    if (contentRef.current) {
      if (isOpen) {
        setContentHeight(contentRef.current.scrollHeight);
        const timer = setTimeout(() => setContentHeight('auto'), 300);
        return () => clearTimeout(timer);
      } else {
        setContentHeight(contentRef.current.scrollHeight);
        requestAnimationFrame(() => setContentHeight(0));
      }
    }
  }, [isOpen]);

  return (
    <div className="border-b border-[#333]">
      <button onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-surface-3 transition-all duration-200">
        <div className="flex items-center gap-2">
          <svg
            className={`w-3 h-3 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-medium text-white">{title}</span>
          {status && <div className={`w-1.5 h-1.5 rounded-full ${statusColors[status]}`} />}
        </div>
      </button>
      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{ height: contentHeight }}
      >
        <div ref={contentRef} className="px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

function DimensionInput({ label, value, unit, min, max, onChange }: {
  label: string; value: number; unit: string; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <label className="text-xs text-gray-500">{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" value={value} min={min} max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 px-2 py-1 text-right text-sm bg-surface-2 border border-[#333] rounded-lg focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/20 text-white font-mono transition-all duration-200"
        />
        <span className="text-xs text-gray-600 w-8">{unit}</span>
      </div>
    </div>
  );
}

function ToggleInput({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <label className="text-xs text-gray-500">{label}</label>
      <button onClick={onChange}
        className={`w-10 h-5 rounded-full transition-all duration-200 relative ${value ? 'bg-green-500' : 'bg-surface-4 border border-[#333]'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function ContractContent() {
  const cabinet = useCabinet();
  const setDimension = useCabinetStore((s) => s.setDimension);
  const setShelfCount = useCabinetStore((s) => s.setShelfCount);
  const setDividerCount = useCabinetStore((s) => s.setDividerCount);
  const toggleBackPanel = useCabinetStore((s) => s.toggleBackPanel);
  const setJointType = useCabinetStore((s) => s.setJointType);
  const selectPanel = useCabinetStore((s) => s.selectPanel);
  const selectedPanelId = useCabinetStore((s) => s.selectedPanelId);
  const coreMaterials = useCabinetStore((s) => s.coreMaterials);
  const surfaceMaterials = useCabinetStore((s) => s.surfaceMaterials);
  const edgeMaterials = useCabinetStore((s) => s.edgeMaterials);
  
  // DEBUG: Log computed values
  console.log('[ContractContent] cabinet.computed:', cabinet?.computed);
  console.log('[ContractContent] panels surfaceArea:', cabinet?.panels?.map(p => ({ role: p.role, area: p.computed?.surfaceArea })));
  
  if (!cabinet) return <div className="p-4 text-zinc-500">Loading...</div>;
  
  const currentCore = (coreMaterials as Record<string, typeof coreMaterials[keyof typeof coreMaterials]>)[cabinet.materials.defaultCore];
  const currentSurface = (surfaceMaterials as Record<string, typeof surfaceMaterials[keyof typeof surfaceMaterials]>)[cabinet.materials.defaultSurface];
  const currentEdge = (edgeMaterials as Record<string, typeof edgeMaterials[keyof typeof edgeMaterials]>)[cabinet.materials.defaultEdge];
  const totalThickness = (currentCore?.thickness || 16) + ((currentSurface?.thickness || 0.3) * 2);

  return (
    <>
      <Section title="Cabinet Dimensions" status="OK">
        <div className="space-y-4">
          <DimensionSlider
            label="Width (W)"
            value={cabinet.dimensions.width}
            unit="mm"
            min={300}
            max={1200}
            step={10}
            onChange={(v) => setDimension('width', v)}
            color="emerald"
            icon={<Maximize2 size={16} />}
            showInput={false}
          />
          <DimensionSlider
            label="Height (H)"
            value={cabinet.dimensions.height}
            unit="mm"
            min={200}
            max={2400}
            step={10}
            onChange={(v) => setDimension('height', v)}
            color="blue"
            icon={<Maximize size={16} />}
            showInput={false}
          />
          <DimensionSlider
            label="Depth (D)"
            value={cabinet.dimensions.depth}
            unit="mm"
            min={200}
            max={800}
            step={10}
            onChange={(v) => setDimension('depth', v)}
            color="cyan"
            icon={<Move size={16} />}
            showInput={false}
          />
          <DimensionSlider
            label="Toe Kick"
            value={cabinet.dimensions.toeKickHeight}
            unit="mm"
            min={0}
            max={200}
            step={5}
            onChange={(v) => setDimension('toeKickHeight', v)}
            color="amber"
            icon={<ArrowUpFromLine size={16} />}
            showInput={false}
          />
        </div>
      </Section>
      
      <Section title="Structure & Rules" status="OK">
        <DimensionInput label="Shelf Count" value={cabinet.structure.shelfCount} unit="pcs" min={0} max={10} onChange={setShelfCount} />
        <DimensionInput label="Divider Count" value={cabinet.structure.dividerCount} unit="pcs" min={0} max={5} onChange={setDividerCount} />
        <ToggleInput label="Back Panel" value={cabinet.structure.hasBackPanel} onChange={toggleBackPanel} />
        <div className="pt-2 border-t border-[#333] mt-2">
          <div className="flex items-center justify-between py-2">
            <label className="text-xs text-gray-500">Top Joint</label>
            <select value={cabinet.structure.topJoint} onChange={(e) => setJointType('top', e.target.value as any)}
              className="bg-surface-2 border border-[#333] rounded-lg px-2 py-1 text-xs text-white focus:border-green-500 focus:outline-none transition-all duration-200">
              <option value="OVERLAY">Overlay</option>
              <option value="INSET">Inset</option>
            </select>
          </div>
          <div className="flex items-center justify-between py-2">
            <label className="text-xs text-gray-500">Bottom Joint</label>
            <select value={cabinet.structure.bottomJoint} onChange={(e) => setJointType('bottom', e.target.value as any)}
              className="bg-surface-2 border border-[#333] rounded-lg px-2 py-1 text-xs text-white focus:border-green-500 focus:outline-none transition-all duration-200">
              <option value="OVERLAY">Overlay</option>
              <option value="INSET">Inset</option>
            </select>
          </div>
        </div>
      </Section>
      
      <Section title="Composite Material" status="OK">
        <div className="p-3 bg-surface-2 rounded-xl border border-[#333] mb-3">
          <div className="text-xs text-gray-500 mb-2">Panel Stack</div>
          <div className="flex items-center gap-1 text-xs">
            <span className="px-2 py-1 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20">CORE</span>
            <span className="text-gray-600">+</span>
            <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">SURFACE</span>
            <span className="text-gray-600">+</span>
            <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded border border-green-500/20">EDGE</span>
          </div>
        </div>
        <div className="text-xs text-gray-500 space-y-1.5">
          <div className="flex justify-between"><span>Core</span><span className="text-white">{currentCore?.name || 'N/A'}</span></div>
          <div className="flex justify-between"><span>Surface</span><span className="text-white">{currentSurface?.name || 'N/A'}</span></div>
          <div className="flex justify-between"><span>Edge</span><span className="text-white">{currentEdge?.name || 'N/A'}</span></div>
          <div className="flex justify-between pt-2 border-t border-[#333]">
            <span className="font-medium text-gray-400">Total Thickness</span>
            <span className="text-green-400 font-medium font-mono">{totalThickness.toFixed(1)}mm</span>
          </div>
        </div>
      </Section>
      
      <Section title="Computed Values" status="OK">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-3 bg-surface-2 rounded-xl border border-[#333]">
            <div className="text-gray-500 mb-1">Total Area</div>
            <div className="text-white font-medium font-mono">
              <SpringAnimatedNumber value={cabinet.computed?.totalSurfaceArea || 0} decimals={2} suffix=" m²" />
            </div>
          </div>
          <div className="p-3 bg-surface-2 rounded-xl border border-[#333]">
            <div className="text-gray-500 mb-1">Est. Cost</div>
            <div className="text-green-400 font-medium font-mono">
              ฿<SpringAnimatedNumber value={cabinet.computed?.totalCost || 0} />
            </div>
          </div>
          <div className="p-3 bg-surface-2 rounded-xl border border-[#333]">
            <div className="text-gray-500 mb-1">Panel Count</div>
            <div className="text-white font-medium font-mono">
              <SpringAnimatedNumber value={cabinet.panels?.length || 0} />
            </div>
          </div>
          <div className="p-3 bg-surface-2 rounded-xl border border-[#333]">
            <div className="text-gray-500 mb-1">CO₂</div>
            <div className="text-amber-400 font-medium font-mono">
              <SpringAnimatedNumber value={cabinet.computed?.totalCO2 || 0} decimals={1} suffix=" kg" />
            </div>
          </div>
        </div>
      </Section>
      
      <Section title="Panel List" status="OK" defaultOpen={false}>
        <div className="max-h-64 overflow-y-auto pr-1">
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
          />
        </div>
      </Section>
    </>
  );
}

export function ParametricContractPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('contract');
  const [gateStatus, setGateStatus] = useState<GateStatus>('DRAFT');

  return (
    <div className="h-full flex flex-col bg-surface-1">
      <div className="flex border-b border-[#333] shrink-0">
        <button onClick={() => setActiveTab('contract')}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-all duration-200 relative
            ${activeTab === 'contract' ? 'text-green-400 bg-surface-2' : 'text-gray-500 hover:text-white hover:bg-surface-2/50'}`}>
          {activeTab === 'contract' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-400" />}
          📐 Contract
        </button>
        <button onClick={() => setActiveTab('export')}
          className={`flex-1 px-4 py-2.5 text-xs font-medium transition-all duration-200 relative
            ${activeTab === 'export' ? 'text-green-400 bg-surface-2' : 'text-gray-500 hover:text-white hover:bg-surface-2/50'}`}>
          {activeTab === 'export' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-400" />}
          📤 Export
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'contract' && <ContractContent />}
        {activeTab === 'export' && <ExportPanel gateStatus={gateStatus} onGateChange={setGateStatus} />}
      </div>
    </div>
  );
}

export default ParametricContractPanel;
