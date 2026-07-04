/**
 * ParametricContractPanel - Right Panel (FUNCTIONAL)
 * Tabs: Contract | Export (Factory Only)
 *
 * Priority 0: Export tab hidden from Designer role
 */

import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useCabinetStore, useCabinet } from '../../core/store/useCabinetStore';
import { useSpecState } from '../../core/store/useSpecStore';
import { RoleBadge, getCurrentRole } from '../../core/auth';
import { ModalLoadingFallback } from '../ui/LoadingFallback';

// Lazy load heavy components (T018 code splitting)
const ExportPanel = lazy(() =>
  import('../ui/ExportPanel').then(m => ({ default: m.ExportPanel }))
);
import { SpringAnimatedNumber } from '../ui/AnimatedNumber';
import { DimensionSlider } from '../ui/DimensionSlider';
import { CabinetTypeSelector } from '../ui/CabinetTypeSelector';
import { CabinetList } from '../ui/CabinetList';
import { BIMClassificationBadge } from '../ui/BIMClassificationBadge';
import { CNCToolPanel } from '../ui/CNCToolPanel';
import { Maximize2, Maximize, Move, ArrowUpFromLine, Settings2, RotateCcw, Wrench, Lock } from 'lucide-react';

type TabId = 'contract' | 'export';

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
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-surface-3 transition-all duration-200">
        <div className="flex items-center gap-1.5">
          <svg
            className={`w-2.5 h-2.5 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-medium text-white">{title}</span>
          {status && <div className={`w-1.5 h-1.5 rounded-full ${statusColors[status]}`} />}
        </div>
      </button>
      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{ height: contentHeight }}
      >
        <div ref={contentRef} className="px-3 pb-3">{children}</div>
      </div>
    </div>
  );
}

function DimensionInput({ label, value, unit, min, max, onChange }: {
  label: string; value: number; unit: string; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <label className="text-[10px] text-gray-500">{label}</label>
      <div className="flex items-center gap-1.5">
        <input type="number" value={value} min={min} max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-16 px-1.5 py-0.5 text-right text-xs bg-surface-2 border border-[#333] rounded-lg focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/20 text-white font-mono transition-all duration-200"
        />
        <span className="text-[10px] text-gray-600 w-6">{unit}</span>
      </div>
    </div>
  );
}

function ToggleInput({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <label className="text-[10px] text-gray-500">{label}</label>
      <button onClick={onChange}
        className={`w-8 h-4 rounded-full transition-all duration-200 relative ${value ? 'bg-green-500' : 'bg-surface-4 border border-[#333]'}`}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? 'left-4' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

// Counter input with +/- buttons for Shelf Count and Divider Count
function CounterInput({ label, value, unit, min, max, onChange }: {
  label: string; value: number; unit: string; min: number; max: number; onChange: (v: number) => void;
}) {
  const handleDecrement = () => {
    if (value > min) onChange(value - 1);
  };

  const handleIncrement = () => {
    if (value < max) onChange(value + 1);
  };

  return (
    <div className="flex items-center justify-between py-1.5">
      <label className="text-[10px] text-gray-500">{label}</label>
      <div className="flex items-center gap-0.5">
        {/* Minus button */}
        <button
          onClick={handleDecrement}
          disabled={value <= min}
          className={`w-5 h-5 flex items-center justify-center rounded border transition-all duration-200
            ${value <= min
              ? 'bg-surface-3 border-[#333] text-gray-600 cursor-not-allowed'
              : 'bg-surface-2 border-[#333] text-white hover:bg-surface-3 hover:border-gray-500 active:scale-95'
            }`}
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>

        {/* Value input */}
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const newVal = Number(e.target.value);
            if (newVal >= min && newVal <= max) onChange(newVal);
          }}
          className="w-10 px-1 py-0.5 text-center text-xs bg-surface-2 border border-[#333] rounded focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/20 text-white font-mono transition-all duration-200"
        />

        {/* Plus button */}
        <button
          onClick={handleIncrement}
          disabled={value >= max}
          className={`w-5 h-5 flex items-center justify-center rounded border transition-all duration-200
            ${value >= max
              ? 'bg-surface-3 border-[#333] text-gray-600 cursor-not-allowed'
              : 'bg-surface-2 border-[#333] text-white hover:bg-surface-3 hover:border-gray-500 active:scale-95'
            }`}
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        <span className="text-[10px] text-gray-600 w-6 ml-0.5">{unit}</span>
      </div>
    </div>
  );
}

// Manufacturing Parameters Section - separate component for cleaner code
function ManufacturingParametersSection() {
  const manufacturingParams = useCabinetStore((s) => s.manufacturingParams);
  const setManufacturingParam = useCabinetStore((s) => s.setManufacturingParam);
  const resetManufacturingParams = useCabinetStore((s) => s.resetManufacturingParams);

  // Parameter definitions with min/max/step/unit
  const paramConfig = [
    { key: 'preMilling', label: 'Pre-Milling', min: 0, max: 2, step: 0.1, unit: 'mm', tooltip: 'Material added per edge for milling (0.5-1.0mm typical)' },
    { key: 'glueThickness', label: 'Glue Thickness', min: 0, max: 0.5, step: 0.05, unit: 'mm', tooltip: 'Adhesive layer thickness (0.1-0.2mm typical)' },
    { key: 'clearance', label: 'Clearance', min: 0, max: 5, step: 0.5, unit: 'mm', tooltip: 'Assembly clearance between panels (1-2mm typical)' },
    { key: 'grooveDepth', label: 'Groove Depth', min: 4, max: 15, step: 1, unit: 'mm', tooltip: 'Back panel groove depth (8-10mm typical)' },
    { key: 'backVoid', label: 'Back Void', min: 10, max: 30, step: 1, unit: 'mm', tooltip: 'Space behind cabinet for wiring/ventilation (19-20mm typical)' },
    { key: 'backThickness', label: 'Back Panel Thk', min: 3, max: 18, step: 1, unit: 'mm', tooltip: 'Back panel thickness (6 or 9mm typical)' },
    { key: 'safetyGap', label: 'Safety Gap', min: 0, max: 5, step: 0.5, unit: 'mm', tooltip: 'Extra gap to prevent panel collision (1-2mm typical)' },
  ] as const;

  return (
    <Section title="Manufacturing Parameters" defaultOpen={false}>
      <div className="space-y-0.5">
        {/* Header with reset button */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Settings2 className="w-3 h-3 text-purple-400" />
            <span className="text-[10px] text-gray-400">Machine settings</span>
          </div>
          <button
            onClick={resetManufacturingParams}
            className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-white bg-surface-2 hover:bg-surface-3 rounded border border-[#333] transition-all duration-200"
            title="Reset to defaults"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            Reset
          </button>
        </div>

        {/* Parameter inputs */}
        <div className="space-y-1.5">
          {paramConfig.map(({ key, label, min, max, step, unit, tooltip }) => (
            <div key={key} className="group">
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] text-gray-500 group-hover:text-gray-400 transition-colors" title={tooltip}>
                    {label}
                  </label>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-2.5 h-2.5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={manufacturingParams[key as keyof typeof manufacturingParams]}
                    min={min}
                    max={max}
                    step={step}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val >= min && val <= max) {
                        setManufacturingParam(key as keyof typeof manufacturingParams, val);
                      }
                    }}
                    className="w-12 px-1 py-0.5 text-right text-[10px] bg-surface-2 border border-[#333] rounded focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 text-white font-mono transition-all duration-200"
                  />
                  <span className="text-[10px] text-gray-600 w-5">{unit}</span>
                </div>
              </div>
              {/* Range slider */}
              <input
                type="range"
                value={manufacturingParams[key as keyof typeof manufacturingParams]}
                min={min}
                max={max}
                step={step}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setManufacturingParam(key as keyof typeof manufacturingParams, val);
                }}
                className="w-full h-0.5 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-purple-500 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:bg-purple-400"
              />
            </div>
          ))}
        </div>

        {/* Quick info */}
        <div className="mt-2 p-1.5 bg-surface-2 rounded border border-[#333]">
          <div className="text-[9px] text-gray-500">
            <span className="text-purple-400">Tip:</span> These values affect Cut Size calculations.
          </div>
        </div>
      </div>
    </Section>
  );
}

function ContractContent() {
  const cabinet = useCabinet();
  const specState = useSpecState();
  const setDimension = useCabinetStore((s) => s.setDimension);
  const setShelfCount = useCabinetStore((s) => s.setShelfCount);
  const setDividerCount = useCabinetStore((s) => s.setDividerCount);
  const toggleBackPanel = useCabinetStore((s) => s.toggleBackPanel);
  const setBackPanelConstruction = useCabinetStore((s) => s.setBackPanelConstruction);
  const setBackPanelConnectorConfig = useCabinetStore((s) => s.setBackPanelConnectorConfig);
  const setJointType = useCabinetStore((s) => s.setJointType);
  const coreMaterials = useCabinetStore((s) => s.coreMaterials);
  const surfaceMaterials = useCabinetStore((s) => s.surfaceMaterials);
  const edgeMaterials = useCabinetStore((s) => s.edgeMaterials);

  // Check if editing is locked (not in DRAFT state)
  const isLocked = specState !== 'DRAFT';

  if (!cabinet) {
    return (
      <div className="p-4 text-center">
        <div className="text-zinc-500 text-sm mb-2">No cabinet selected</div>
        <div className="text-zinc-600 text-xs">Click on a cabinet in the 3D view to edit its parameters</div>
      </div>
    );
  }

  if (!cabinet.materials) {
    return <div className="p-4 text-zinc-500">Loading materials...</div>;
  }

  const currentCore = (coreMaterials as Record<string, typeof coreMaterials[keyof typeof coreMaterials]>)[cabinet.materials.defaultCore];
  const currentSurface = (surfaceMaterials as Record<string, typeof surfaceMaterials[keyof typeof surfaceMaterials]>)[cabinet.materials.defaultSurface];
  const currentEdge = (edgeMaterials as Record<string, typeof edgeMaterials[keyof typeof edgeMaterials]>)[cabinet.materials.defaultEdge];
  const totalThickness = (currentCore?.thickness || 16) + ((currentSurface?.thickness || 0.3) * 2);

  return (
    <>
      {/* Locked State Banner */}
      {isLocked && (
        <div className="mx-3 my-2 p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center gap-2">
          <Lock size={14} className="text-blue-400 shrink-0" />
          <div className="text-xs">
            <span className="text-blue-400 font-medium">Spec is {specState}</span>
            <span className="text-gray-400"> — Editing locked. Click </span>
            <span className="text-blue-400 font-medium">Unfreeze</span>
            <span className="text-gray-400"> in header to edit.</span>
          </div>
        </div>
      )}

      <Section title="Cabinet Type" status="OK" defaultOpen={true}>
        <CabinetTypeSelector />
      </Section>

      <Section title="Cabinets in Scene" status="OK" defaultOpen={true}>
        <CabinetList />
      </Section>

      <Section title="Cabinet Dimensions" status="OK">
        <div className="space-y-3">
          <DimensionSlider
            label="Width (W)"
            value={cabinet.dimensions.width}
            unit="mm"
            min={300}
            max={1200}
            step={10}
            onChange={(v) => setDimension('width', v)}
            color="emerald"
            icon={<Maximize2 size={12} />}
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
            icon={<Maximize size={12} />}
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
            icon={<Move size={12} />}
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
            icon={<ArrowUpFromLine size={12} />}
            showInput={false}
          />
        </div>
      </Section>
      
      <Section title="Structure & Rules" status="OK">
        <CounterInput label="Shelf Count" value={cabinet.structure.shelfCount} unit="pcs" min={0} max={10} onChange={setShelfCount} />
        <CounterInput label="Divider Count" value={cabinet.structure.dividerCount} unit="pcs" min={0} max={5} onChange={setDividerCount} />
        <ToggleInput label="Back Panel" value={cabinet.structure.hasBackPanel} onChange={toggleBackPanel} />
        {cabinet.structure.hasBackPanel && (
          <div className="flex items-center justify-between py-1.5 ml-3">
            <label className="text-[10px] text-gray-500">Construction</label>
            <select value={cabinet.structure.backPanelConstruction} onChange={(e) => setBackPanelConstruction(e.target.value as 'inset' | 'overlay')}
              className="bg-surface-2 border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-white focus:border-green-500 focus:outline-none transition-all duration-200">
              <option value="inset">Inset (เซาะร่อง)</option>
              <option value="overlay">Overlay (วางทับ)</option>
            </select>
          </div>
        )}
        {cabinet.structure.hasBackPanel && cabinet.structure.backPanelConstruction === 'overlay' && (() => {
          const bpc = cabinet.structure.backPanelConnectors || { enabled: false, left: { enabled: true, includeDowels: true }, right: { enabled: true, includeDowels: true } };
          return (
            <div className="ml-3 space-y-1">
              <div className="flex items-center justify-between py-1">
                <label className="text-[10px] text-gray-500">Minifix Connectors</label>
                <button
                  onClick={() => setBackPanelConnectorConfig({ ...bpc, enabled: !bpc.enabled })}
                  className={`w-8 h-4 rounded-full transition-all duration-200 relative ${bpc.enabled ? 'bg-green-500' : 'bg-surface-3 border border-[#333]'}`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all duration-200 ${bpc.enabled ? 'left-4' : 'left-0.5'}`} />
                </button>
              </div>
              {bpc.enabled && (
                <div className="space-y-0.5 text-[10px]">
                  <div className="flex items-center justify-between py-0.5 ml-2">
                    <span className="text-gray-500">Left Side</span>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-gray-400">
                        <input type="checkbox" checked={bpc.left.enabled} onChange={(e) => setBackPanelConnectorConfig({ ...bpc, left: { ...bpc.left, enabled: e.target.checked } })} className="w-3 h-3 rounded bg-surface-2 border-[#333]" />
                        On
                      </label>
                      <label className="flex items-center gap-1 text-gray-400">
                        <input type="checkbox" checked={bpc.left.includeDowels} onChange={(e) => setBackPanelConnectorConfig({ ...bpc, left: { ...bpc.left, includeDowels: e.target.checked } })} className="w-3 h-3 rounded bg-surface-2 border-[#333]" />
                        +Dowel
                      </label>
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-0.5 ml-2">
                    <span className="text-gray-500">Right Side</span>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-gray-400">
                        <input type="checkbox" checked={bpc.right.enabled} onChange={(e) => setBackPanelConnectorConfig({ ...bpc, right: { ...bpc.right, enabled: e.target.checked } })} className="w-3 h-3 rounded bg-surface-2 border-[#333]" />
                        On
                      </label>
                      <label className="flex items-center gap-1 text-gray-400">
                        <input type="checkbox" checked={bpc.right.includeDowels} onChange={(e) => setBackPanelConnectorConfig({ ...bpc, right: { ...bpc.right, includeDowels: e.target.checked } })} className="w-3 h-3 rounded bg-surface-2 border-[#333]" />
                        +Dowel
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        <div className="pt-1.5 border-t border-[#333] mt-1.5">
          <div className="flex items-center justify-between py-1.5">
            <label className="text-[10px] text-gray-500">Top Joint</label>
            <select value={cabinet.structure.topJoint} onChange={(e) => setJointType('top', e.target.value as any)}
              className="bg-surface-2 border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-white focus:border-green-500 focus:outline-none transition-all duration-200">
              <option value="OVERLAY">Overlay</option>
              <option value="INSET">Inset</option>
            </select>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <label className="text-[10px] text-gray-500">Bottom Joint</label>
            <select value={cabinet.structure.bottomJoint} onChange={(e) => setJointType('bottom', e.target.value as any)}
              className="bg-surface-2 border border-[#333] rounded px-1.5 py-0.5 text-[10px] text-white focus:border-green-500 focus:outline-none transition-all duration-200">
              <option value="OVERLAY">Overlay</option>
              <option value="INSET">Inset</option>
            </select>
          </div>
        </div>
      </Section>
      
      <Section title="Composite Material" status="OK">
        <div className="p-2 bg-surface-2 rounded-lg border border-[#333] mb-2">
          <div className="text-[10px] text-gray-500 mb-1.5">Panel Stack</div>
          <div className="flex items-center gap-1 text-[9px]">
            <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20">CORE</span>
            <span className="text-gray-600">+</span>
            <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">SURFACE</span>
            <span className="text-gray-600">+</span>
            <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded border border-green-500/20">EDGE</span>
          </div>
        </div>
        <div className="text-[10px] text-gray-500 space-y-1">
          <div className="flex justify-between"><span>Core</span><span className="text-white">{currentCore?.name || 'N/A'}</span></div>
          <div className="flex justify-between"><span>Surface</span><span className="text-white">{currentSurface?.name || 'N/A'}</span></div>
          <div className="flex justify-between"><span>Edge</span><span className="text-white">{currentEdge?.name || 'N/A'}</span></div>
          <div className="flex justify-between pt-1.5 border-t border-[#333]">
            <span className="font-medium text-gray-400">Total Thickness</span>
            <span className="text-green-400 font-medium font-mono">{totalThickness.toFixed(1)}mm</span>
          </div>
        </div>
      </Section>
      
      <Section title="Computed Values" status="OK">
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <div className="p-2 bg-surface-2 rounded-lg border border-[#333]">
            <div className="text-gray-500 mb-0.5">Total Area</div>
            <div className="text-white font-medium font-mono text-xs">
              <SpringAnimatedNumber value={cabinet.computed?.totalSurfaceArea || 0} decimals={2} suffix=" m²" />
            </div>
          </div>
          <div className="p-2 bg-surface-2 rounded-lg border border-[#333]">
            <div className="text-gray-500 mb-0.5">Est. Cost</div>
            <div className="text-green-400 font-medium font-mono text-xs">
              ฿<SpringAnimatedNumber value={cabinet.computed?.totalCost || 0} />
            </div>
          </div>
          <div className="p-2 bg-surface-2 rounded-lg border border-[#333]">
            <div className="text-gray-500 mb-0.5">Panel Count</div>
            <div className="text-white font-medium font-mono text-xs">
              <SpringAnimatedNumber value={cabinet.panels?.length || 0} />
            </div>
          </div>
          <div className="p-2 bg-surface-2 rounded-lg border border-[#333]">
            <div className="text-gray-500 mb-0.5">CO₂</div>
            <div className="text-amber-400 font-medium font-mono text-xs">
              <SpringAnimatedNumber value={cabinet.computed?.totalCO2 || 0} decimals={1} suffix=" kg" />
            </div>
          </div>
        </div>

        {/* BIM Classification Badge - Compact */}
        <div className="mt-2 pt-2 border-t border-[#333]">
          <div className="text-[10px] text-gray-500 mb-1.5">BIM Classification</div>
          <BIMClassificationBadge compact />
        </div>
      </Section>

      <ManufacturingParametersSection />

      <Section title="CNC Tool & Feed/Speed" status="OK" defaultOpen={false}>
        <CNCToolPanel compact />
      </Section>
    </>
  );
}

export function ParametricContractPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('contract');

  // Check if user can see Export tab (FACTORY or ADMIN only)
  const currentRole = getCurrentRole();
  const canSeeExport = currentRole === 'FACTORY' || currentRole === 'ADMIN';

  return (
    <div className="h-full flex flex-col bg-surface-1">
      <div className="flex border-b border-[#333] shrink-0">
        <button onClick={() => setActiveTab('contract')}
          className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-all duration-200 relative
            ${activeTab === 'contract' ? 'text-green-400 bg-surface-2' : 'text-gray-500 hover:text-white hover:bg-surface-2/50'}`}>
          {activeTab === 'contract' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-400" />}
          📐 Contract
        </button>
        {/* Export tab: FACTORY/ADMIN only (Priority 0) */}
        {canSeeExport && (
          <button onClick={() => setActiveTab('export')}
            className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-all duration-200 relative
              ${activeTab === 'export' ? 'text-green-400 bg-surface-2' : 'text-gray-500 hover:text-white hover:bg-surface-2/50'}`}>
            {activeTab === 'export' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-400" />}
            📤 Export
          </button>
        )}
        {/* Role indicator */}
        <div className="px-2 py-1.5 flex items-center">
          <RoleBadge variant="compact" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'contract' && <ContractContent />}
        {activeTab === 'export' && canSeeExport && (
          <Suspense fallback={<ModalLoadingFallback />}>
            <ExportPanel />
          </Suspense>
        )}
      </div>
    </div>
  );
}

export default ParametricContractPanel;
