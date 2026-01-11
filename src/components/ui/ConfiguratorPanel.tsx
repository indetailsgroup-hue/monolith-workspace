/**
 * ConfiguratorPanel - Right panel for cabinet configuration
 * MONOLITH OS Dark Theme - Cyberpunk/Industrial Style
 * 
 * UPDATED: Show all surface materials + Structure & Parts section
 */

import { useState } from 'react';
import { 
  Settings2, 
  ChevronDown, 
  ChevronUp,
  Minus,
  Plus,
  Layers,
  RefreshCw,
  Globe,
  Cpu,
  Box,
  LayoutGrid,
  PanelTop,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Square,
  Columns,
  Rows,
} from 'lucide-react';
import { useCabinetStore, useCabinet } from '../../core/store/useCabinetStore';
import { CabinetType, JointType } from '../../core/types/Cabinet';
import { clsx } from 'clsx';

interface ConfiguratorPanelProps {
  onOpenRegistry?: () => void;
}

export function ConfiguratorPanel({ onOpenRegistry }: ConfiguratorPanelProps) {
  const cabinet = useCabinet();
  const {
    setDimension,
    setShelfCount,
    setDividerCount,
    setDefaultSurface,
    setDefaultCore,
    setDefaultEdge,
    setJointType,
    toggleBackPanel,
    surfaceMaterials,
    coreMaterials,
    edgeMaterials,
    createCabinet,
  } = useCabinetStore();
  
  // State for showing more materials
  const [_showAllMaterials, _setShowAllMaterials] = useState(false);
  const [_showAllEdges, _setShowAllEdges] = useState(false);
  
  // Create cabinet if none exists
  if (!cabinet) {
    return (
      <div className="w-80 bg-[#0a0a0a] border-l border-white/5 p-6 flex flex-col items-center justify-center">
        <Cpu className="w-12 h-12 text-gray-700 mb-4" />
        <p className="text-gray-600 text-xs uppercase tracking-widest mb-4">
          No_System_Loaded
        </p>
        <button
          onClick={() => createCabinet('BASE', 'Base Cabinet')}
          className="px-6 py-2 border border-white/20 text-white/80 text-xs uppercase tracking-widest hover:bg-white/5 transition-colors"
        >
          Initialize_System
        </button>
      </div>
    );
  }
  
  // Get materials array
  const materialsArray = Object.values(surfaceMaterials);
  
  return (
    <div className="w-80 bg-[#0a0a0a] border-l border-white/5 flex flex-col overflow-hidden font-mono">
      {/* Header */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-white/40" />
            <span className="text-xs text-white/80 uppercase tracking-widest">Configurator</span>
          </div>
          <RefreshCw className="w-3 h-3 text-white/30" />
        </div>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mt-1">Customize logic & parameters</p>
      </div>
      
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Dimensions Section */}
        <MonolithSection title="Dimensions (mm)" icon={Box} defaultOpen>
          <MonolithSlider
            label="WIDTH"
            value={cabinet.dimensions.width}
            min={300}
            max={1200}
            step={1}
            unit="MM"
            onChange={(v) => setDimension('width', v)}
          />
          <MonolithSlider
            label="HEIGHT"
            value={cabinet.dimensions.height}
            min={400}
            max={2400}
            step={1}
            unit="MM"
            onChange={(v) => setDimension('height', v)}
          />
          <MonolithSlider
            label="DEPTH"
            value={cabinet.dimensions.depth}
            min={300}
            max={800}
            step={1}
            unit="MM"
            onChange={(v) => setDimension('depth', v)}
          />
        </MonolithSection>
        
        {/* Global Material Section */}
        <MonolithSection title="Global Material" icon={Layers} badge="Manage Library" defaultOpen onBadgeClick={onOpenRegistry}>
          {/* Core Structure */}
          <div className="mb-4">
            <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2">
              Default Core Structure
            </div>
            <div className="space-y-1">
              {Object.values(coreMaterials).map((mat) => (
                <button
                  key={mat.id}
                  onClick={() => setDefaultCore(mat.id)}
                  className={clsx(
                    "w-full flex items-center justify-between px-3 py-2 border transition-all",
                    cabinet.materials.defaultCore === mat.id
                      ? "border-green-500/50 bg-green-500/10"
                      : "border-white/10 hover:border-white/20"
                  )}
                >
                  <span className="text-xs text-white/80">{mat.name}</span>
                  <span className="text-xs text-white/40">{mat.thickness}mm</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Surface Finish - SCROLLABLE */}
          <div className="mb-4">
            <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2">
              Default Surface Finish
            </div>
            <div className="max-h-52 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
              <div className="grid grid-cols-2 gap-2">
                {materialsArray.map((mat) => (
                  <button
                    key={mat.id}
                    onClick={() => setDefaultSurface(mat.id)}
                    className={clsx(
                      "aspect-[4/3] border transition-all relative overflow-hidden group",
                      cabinet.materials.defaultSurface === mat.id
                        ? "border-green-500/60 ring-1 ring-green-500/30"
                        : "border-white/10 hover:border-white/30"
                    )}
                  >
                    {/* Background - Color or Texture */}
                    {mat.textureUrl ? (
                      <img 
                        src={mat.textureUrl} 
                        alt={mat.name}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div 
                        className="absolute inset-0"
                        style={{ backgroundColor: mat.color }}
                      />
                    )}
                    
                    {/* Hover effect */}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    {/* Label */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/80 px-2 py-1.5">
                      <div className="text-[9px] text-white/80 truncate">
                        {mat.name}
                      </div>
                    </div>
                    
                    {/* Selected indicator */}
                    {cabinet.materials.defaultSurface === mat.id && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-[10px]">✓</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Edge Band - SCROLLABLE */}
          <div>
            <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2">
              Default Edge Band
            </div>
            <div className="max-h-40 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
              <div className="space-y-1">
                {Object.values(edgeMaterials).map((mat) => (
                  <button
                    key={mat.id}
                    onClick={() => setDefaultEdge(mat.id)}
                    className={clsx(
                      "w-full flex items-center gap-3 px-2 py-2 border transition-colors",
                      cabinet.materials.defaultEdge === mat.id
                        ? "border-green-500/50 bg-green-500/10"
                        : "border-white/10 hover:border-white/20"
                    )}
                  >
                    {/* Preview */}
                    <div 
                      className="w-8 h-8 border border-white/10 flex-shrink-0 overflow-hidden"
                      style={{ backgroundColor: mat.textureUrl ? 'transparent' : mat.color }}
                    >
                      {mat.textureUrl && (
                        <img 
                          src={mat.textureUrl} 
                          alt={mat.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-[10px] text-white/70 truncate">{mat.name}</div>
                      <div className="text-[9px] text-white/30">{mat.thickness}mm × {mat.height}mm</div>
                    </div>
                    
                    {/* Price */}
                    <div className="text-[9px] text-white/40 flex-shrink-0">
                      ฿{mat.costPerMeter}/m
                    </div>
                    
                    {/* Selected */}
                    {cabinet.materials.defaultEdge === mat.id && (
                      <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </MonolithSection>
        
        {/* Structure & Parts Section */}
        <MonolithSection title="Structure & Parts" icon={LayoutGrid} defaultOpen>
          {/* Joint Type Controls */}
          <div className="mb-4">
            <div className="flex items-center justify-between py-2">
              <span className="text-[10px] text-white/60">Top Panel Joint</span>
              <div className="flex border border-white/10">
                <button
                  onClick={() => setJointType('top', 'INSET')}
                  className={clsx(
                    "px-3 py-1 text-[10px] uppercase tracking-wider transition-colors",
                    cabinet.structure.topJoint === 'INSET'
                      ? "bg-white/20 text-white"
                      : "text-white/40 hover:text-white/60"
                  )}
                >
                  ↓ Inset
                </button>
                <button
                  onClick={() => setJointType('top', 'OVERLAY')}
                  className={clsx(
                    "px-3 py-1 text-[10px] uppercase tracking-wider transition-colors border-l border-white/10",
                    cabinet.structure.topJoint === 'OVERLAY'
                      ? "bg-white/20 text-white"
                      : "text-white/40 hover:text-white/60"
                  )}
                >
                  ↑ Overlay
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-between py-2">
              <span className="text-[10px] text-white/60">Bottom Panel Joint</span>
              <div className="flex border border-white/10">
                <button
                  onClick={() => setJointType('bottom', 'INSET')}
                  className={clsx(
                    "px-3 py-1 text-[10px] uppercase tracking-wider transition-colors",
                    cabinet.structure.bottomJoint === 'INSET'
                      ? "bg-white/20 text-white"
                      : "text-white/40 hover:text-white/60"
                  )}
                >
                  ↑ Inset
                </button>
                <button
                  onClick={() => setJointType('bottom', 'OVERLAY')}
                  className={clsx(
                    "px-3 py-1 text-[10px] uppercase tracking-wider transition-colors border-l border-white/10",
                    cabinet.structure.bottomJoint === 'OVERLAY'
                      ? "bg-white/20 text-white"
                      : "text-white/40 hover:text-white/60"
                  )}
                >
                  ↓ Overlay
                </button>
              </div>
            </div>
          </div>
          
          {/* Panel Toggles */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <PanelToggle 
              label="Left Panel" 
              icon={PanelLeft}
              active={true} 
              disabled
            />
            <PanelToggle 
              label="Right Panel" 
              icon={PanelRight}
              active={true} 
              disabled
            />
            <PanelToggle 
              label="Top Panel" 
              icon={PanelTop}
              active={true} 
              disabled
            />
            <PanelToggle 
              label="Bottom Panel" 
              icon={PanelBottom}
              active={true} 
              disabled
            />
            <PanelToggle 
              label="Back Panel" 
              icon={Square}
              active={cabinet.structure.hasBackPanel} 
              onChange={toggleBackPanel}
            />
            <PanelToggle 
              label="Shelves" 
              icon={Rows}
              active={cabinet.structure.shelfCount > 0} 
              count={cabinet.structure.shelfCount}
            />
          </div>
        </MonolithSection>
        
        {/* Live Engineering Data */}
        <div className="p-4 bg-[#0d1117] border-t border-white/5">
          <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2">
            Live Engineering Data
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] text-white/40">Estimated Cost</div>
              <div className="text-xl text-white font-light">
                ฿{cabinet.computed.totalCost.toLocaleString('th-TH', { maximumFractionDigits: 3 })}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-white/40 flex items-center gap-1 justify-end">
                <Globe className="w-3 h-3" /> Carbon Footprint
              </div>
              <div className="text-lg text-emerald-400">
                {cabinet.computed.totalCO2.toFixed(1)} <span className="text-xs text-white/40">kgCO2e</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Dividers & Shelves Counters */}
        <MonolithSection title="" icon={Columns} defaultOpen>
          <MonolithCounter
            label="Dividers (Vertical)"
            icon={Columns}
            value={cabinet.structure.dividerCount}
            onChange={setDividerCount}
          />
          
          <div className="mt-3">
            <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2">
              Shelves (Horizontal)
            </div>
            <div className="pl-3 border-l border-white/10">
              <MonolithCounter
                label="BAY 1"
                value={cabinet.structure.shelfCount}
                onChange={setShelfCount}
              />
            </div>
          </div>
        </MonolithSection>
        
        {/* Manufacturing Export */}
        <div className="p-4 border-t border-white/5">
          <div className="text-[10px] text-white/40 uppercase tracking-widest mb-3">
            Manufacturing Export
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { name: 'Homag', ext: '.mpr' },
              { name: 'Biesse', ext: '.cix' },
              { name: 'Nanxing', ext: '.xml' },
              { name: 'KDT', ext: '.dxf' },
            ].map((item) => (
              <button
                key={item.name}
                className="py-2 text-[10px] text-white/60 bg-emerald-900/30 border border-emerald-700/30 uppercase tracking-wider hover:bg-emerald-800/40 transition-colors flex items-center justify-center gap-1"
              >
                <span className="text-[8px]">↓</span> {item.name} ({item.ext})
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MONOLITH STYLE COMPONENTS
// ============================================

interface MonolithSectionProps {
  title: string;
  icon?: React.ElementType;
  badge?: string;
  defaultOpen?: boolean;
  onBadgeClick?: () => void;
  children: React.ReactNode;
}

function MonolithSection({ title, icon: Icon, badge, defaultOpen = false, onBadgeClick, children }: MonolithSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  if (!title) {
    return <div className="px-4 pb-4">{children}</div>;
  }
  
  return (
    <div className="border-b border-white/5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-white/40" />}
          <span className="text-xs text-white/80">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span 
              onClick={(e) => {
                e.stopPropagation();
                onBadgeClick?.();
              }}
              className="text-[10px] text-emerald-400 hover:text-emerald-300 cursor-pointer"
            >
              ⚙ {badge}
            </span>
          )}
          {isOpen ? (
            <ChevronUp className="w-3 h-3 text-white/30" />
          ) : (
            <ChevronDown className="w-3 h-3 text-white/30" />
          )}
        </div>
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

interface MonolithSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}

function MonolithSlider({ label, value, min, max, step, unit, onChange }: MonolithSliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;
  
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] text-white/50 uppercase tracking-wider">{label}</label>
        <div className="flex items-baseline gap-1">
          <span className="text-sm text-white/90 font-light">{value}</span>
          <span className="text-[9px] text-white/30 uppercase">{unit}</span>
        </div>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="absolute inset-x-0 h-[3px] bg-white/10 rounded-full">
          <div 
            className="h-full bg-emerald-500/60 rounded-full"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
        <div 
          className="absolute w-3 h-3 bg-emerald-500 rounded-full pointer-events-none shadow-lg"
          style={{ left: `calc(${percentage}% - 6px)` }}
        />
      </div>
    </div>
  );
}

interface MonolithCounterProps {
  label: string;
  icon?: React.ElementType;
  value: number;
  onChange: (value: number) => void;
}

function MonolithCounter({ label, icon: Icon, value, onChange }: MonolithCounterProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3 h-3 text-white/30" />}
        <span className="text-[10px] text-white/60">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-6 h-6 flex items-center justify-center bg-white/5 border border-white/10 text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
        >
          <Minus className="w-3 h-3" />
        </button>
        <span className="w-8 text-center text-sm text-white/80">{value}</span>
        <button
          onClick={() => onChange(value + 1)}
          className="w-6 h-6 flex items-center justify-center bg-white/5 border border-white/10 text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

interface PanelToggleProps {
  label: string;
  icon: React.ElementType;
  active: boolean;
  disabled?: boolean;
  count?: number;
  onChange?: () => void;
}

function PanelToggle({ label, icon: _Icon, active, disabled, count, onChange }: PanelToggleProps) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={clsx(
        "flex items-center justify-between px-3 py-2 border transition-all",
        active
          ? "border-white/20 bg-white/5"
          : "border-white/10 bg-transparent",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span className="text-[10px] text-white/60">{label}</span>
      {count !== undefined ? (
        <span className="text-xs text-blue-400">●</span>
      ) : active ? (
        <span className="text-xs text-blue-400">●</span>
      ) : (
        <span className="text-xs text-white/20">○</span>
      )}
    </button>
  );
}
