/**
 * HingeConfigPanel - Cabinet Door Hinge Configuration
 *
 * Configuration panel for selecting and configuring cabinet door hinges.
 * Supports Blum Clip Top, Hettich Sensys, and Grass Tiomos systems.
 *
 * Following MinifixConfigPanel pattern for consistent UX.
 *
 * @version 1.0.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  HINGE_CATALOG,
  HingeSpec,
  HingeOverlayType,
  HingeOpeningAngle,
  getHingesByBrand,
  getHingesByOverlay,
  calculateHingeCount,
  calculateHingePositions,
  validateHingeForDoor,
} from '../../../core/catalog/HingeCatalog';
import { ChevronDown, ChevronUp, Check, AlertTriangle, Info } from 'lucide-react';

// ============================================
// HINGE CONFIG STATE
// ============================================

export interface HingeConfig {
  selectedHingeId: string;
  hingeCount: number;
  autoSpacing: boolean;
  positions: number[];
  doorWidth: number;
  doorHeight: number;
  doorWeight: number;
  doorThickness: number;
}

export const DEFAULT_HINGE_CONFIG: HingeConfig = {
  selectedHingeId: 'CLIP_TOP_BM_FULL_110',
  hingeCount: 2,
  autoSpacing: true,
  positions: [100, 500],
  doorWidth: 450,
  doorHeight: 600,
  doorWeight: 12,
  doorThickness: 18,
};

// ============================================
// SLIDER INPUT COMPONENT
// ============================================

interface SliderInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = 'mm',
}: SliderInputProps) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="text-[11px] text-gray-400 w-24 truncate" title={label}>
        {label}
      </span>
      <div className="flex-1 relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-1 rounded-full appearance-none cursor-pointer bg-gray-600
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-purple-500"
        />
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || min)}
          className="w-16 bg-[#1e2a3a] border border-[#3a4a5a] rounded px-2 py-0.5
            text-[11px] text-white text-right focus:outline-none focus:border-purple-500"
        />
        <span className="text-[10px] text-gray-500 w-6">{unit}</span>
      </div>
    </div>
  );
}

// ============================================
// COUNTER INPUT COMPONENT
// ============================================

interface CounterInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}

function CounterInput({ label, value, onChange, min, max }: CounterInputProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[11px] text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-7 h-7 rounded bg-[#2a3a4a] text-white text-sm font-medium
            hover:bg-[#3a4a5a] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          -
        </button>
        <span className="w-8 text-center text-white text-sm font-medium">{value}</span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-7 h-7 rounded bg-[#2a3a4a] text-white text-sm font-medium
            hover:bg-[#3a4a5a] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ============================================
// HINGE CARD COMPONENT
// ============================================

interface HingeCardProps {
  hinge: HingeSpec;
  isSelected: boolean;
  onSelect: () => void;
}

function HingeCard({ hinge, isSelected, onSelect }: HingeCardProps) {
  const overlayColors: Record<HingeOverlayType, string> = {
    FULL: 'bg-green-500/20 text-green-400 border-green-500/30',
    HALF: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    INSET: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  };

  return (
    <button
      onClick={onSelect}
      className={`w-full p-3 rounded-lg border text-left transition-all ${
        isSelected
          ? 'bg-purple-500/20 border-purple-500'
          : 'bg-[#1e2a3a] border-[#3a4a5a] hover:border-purple-500/50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white">{hinge.name}</span>
            {isSelected && <Check size={14} className="text-purple-400" />}
          </div>
          <span className="text-[10px] text-gray-500">{hinge.brand} • {hinge.articleCode}</span>
        </div>
        <span
          className={`px-2 py-0.5 text-[9px] font-medium rounded border ${overlayColors[hinge.overlay]}`}
        >
          {hinge.overlay}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
        <div className="text-center p-1.5 bg-[#0d1520] rounded">
          <div className="text-gray-500">Angle</div>
          <div className="text-white font-medium">{hinge.openingAngle}°</div>
        </div>
        <div className="text-center p-1.5 bg-[#0d1520] rounded">
          <div className="text-gray-500">Cup</div>
          <div className="text-white font-medium">Ø{hinge.cupDiameter}</div>
        </div>
        <div className="text-center p-1.5 bg-[#0d1520] rounded">
          <div className="text-gray-500">Max</div>
          <div className="text-white font-medium">{hinge.maxDoorWeight}kg</div>
        </div>
      </div>

      {hinge.hasSoftClose && (
        <div className="mt-2 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-[10px] text-green-400">Soft-close</span>
        </div>
      )}
    </button>
  );
}

// ============================================
// SECTION COMPONENT
// ============================================

interface SectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  color?: string;
}

function Section({ title, icon, children, defaultExpanded = true, color = 'purple' }: SectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const colorClasses: Record<string, string> = {
    purple: 'text-purple-400 border-purple-500/30',
    green: 'text-green-400 border-green-500/30',
    orange: 'text-orange-400 border-orange-500/30',
    cyan: 'text-cyan-400 border-cyan-500/30',
  };

  return (
    <div className={`border rounded-lg ${colorClasses[color]} bg-[#1a2535]/50`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className={`text-xs font-medium ${colorClasses[color].split(' ')[0]}`}>
            {title}
          </span>
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

interface HingeConfigPanelProps {
  onConfigChange?: (config: HingeConfig) => void;
  initialConfig?: HingeConfig;
}

export function HingeConfigPanel({
  onConfigChange,
  initialConfig,
}: HingeConfigPanelProps) {
  const [config, setConfig] = useState<HingeConfig>(initialConfig || DEFAULT_HINGE_CONFIG);
  const [filterBrand, setFilterBrand] = useState<'all' | 'Blum' | 'Hettich' | 'Grass'>('all');
  const [filterOverlay, setFilterOverlay] = useState<'all' | HingeOverlayType>('all');

  // Get selected hinge details
  const selectedHinge = useMemo(() => {
    return HINGE_CATALOG.find((h) => h.id === config.selectedHingeId);
  }, [config.selectedHingeId]);

  // Filter hinges based on selections
  const filteredHinges = useMemo(() => {
    let hinges = HINGE_CATALOG;

    if (filterBrand !== 'all') {
      hinges = hinges.filter((h) => h.brand === filterBrand);
    }

    if (filterOverlay !== 'all') {
      hinges = hinges.filter((h) => h.overlay === filterOverlay);
    }

    return hinges;
  }, [filterBrand, filterOverlay]);

  // Calculate recommended hinge count
  const recommendedCount = useMemo(() => {
    return calculateHingeCount(config.doorHeight, config.doorWeight);
  }, [config.doorHeight, config.doorWeight]);

  // Calculate hinge positions
  const hingePositions = useMemo(() => {
    if (config.autoSpacing) {
      return calculateHingePositions(config.doorHeight, config.hingeCount);
    }
    return config.positions;
  }, [config.autoSpacing, config.doorHeight, config.hingeCount, config.positions]);

  // Validate configuration
  const validation = useMemo(() => {
    if (!selectedHinge) return { valid: false, warnings: ['No hinge selected'] };
    return validateHingeForDoor(
      selectedHinge,
      config.doorWidth,
      config.doorHeight,
      config.doorWeight
    );
  }, [selectedHinge, config.doorWidth, config.doorHeight, config.doorWeight]);

  // Update config handler
  const updateConfig = useCallback(
    (updates: Partial<HingeConfig>) => {
      setConfig((prev) => {
        const newConfig = { ...prev, ...updates };

        // Auto-update positions if autoSpacing is enabled
        if (newConfig.autoSpacing) {
          newConfig.positions = calculateHingePositions(
            newConfig.doorHeight,
            newConfig.hingeCount
          );
        }

        onConfigChange?.(newConfig);
        return newConfig;
      });
    },
    [onConfigChange]
  );

  return (
    <div className="h-full flex flex-col bg-[#1a2535] text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2a3a4a]">
        <span className="text-lg">🚪</span>
        <span className="text-sm font-medium text-purple-400">Hinge Configuration</span>
        {selectedHinge && (
          <span className="ml-auto text-[10px] text-gray-500">
            {selectedHinge.brand} {selectedHinge.openingAngle}°
          </span>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Door Dimensions Section */}
        <Section title="Door Dimensions" icon={<span className="text-sm">📐</span>} color="cyan">
          <div className="space-y-1">
            <SliderInput
              label="Width"
              value={config.doorWidth}
              onChange={(v) => updateConfig({ doorWidth: v })}
              min={200}
              max={900}
            />
            <SliderInput
              label="Height"
              value={config.doorHeight}
              onChange={(v) => updateConfig({ doorHeight: v })}
              min={300}
              max={2400}
            />
            <SliderInput
              label="Thickness"
              value={config.doorThickness}
              onChange={(v) => updateConfig({ doorThickness: v })}
              min={12}
              max={25}
            />
            <SliderInput
              label="Weight"
              value={config.doorWeight}
              onChange={(v) => updateConfig({ doorWeight: v })}
              min={3}
              max={50}
              unit="kg"
            />
          </div>

          {/* Recommended hinge count */}
          <div className="mt-3 p-2 bg-[#0d1520] rounded flex items-center justify-between">
            <span className="text-[10px] text-gray-500">Recommended hinges</span>
            <span className="text-xs text-cyan-400 font-medium">{recommendedCount} pcs</span>
          </div>
        </Section>

        {/* Filter Section */}
        <Section title="Hinge Filter" icon={<span className="text-sm">🔍</span>} color="purple">
          {/* Brand Filter */}
          <div className="mb-3">
            <div className="text-[10px] text-gray-500 mb-1.5">Brand</div>
            <div className="flex flex-wrap gap-1">
              {(['all', 'Blum', 'Hettich', 'Grass'] as const).map((brand) => (
                <button
                  key={brand}
                  onClick={() => setFilterBrand(brand)}
                  className={`px-2.5 py-1 text-[10px] rounded transition-all ${
                    filterBrand === brand
                      ? 'bg-purple-500 text-white'
                      : 'bg-[#2a3a4a] text-gray-400 hover:text-white'
                  }`}
                >
                  {brand === 'all' ? 'All' : brand}
                </button>
              ))}
            </div>
          </div>

          {/* Overlay Filter */}
          <div>
            <div className="text-[10px] text-gray-500 mb-1.5">Overlay</div>
            <div className="flex flex-wrap gap-1">
              {(['all', 'FULL', 'HALF', 'INSET'] as const).map((overlay) => (
                <button
                  key={overlay}
                  onClick={() => setFilterOverlay(overlay)}
                  className={`px-2.5 py-1 text-[10px] rounded transition-all ${
                    filterOverlay === overlay
                      ? 'bg-purple-500 text-white'
                      : 'bg-[#2a3a4a] text-gray-400 hover:text-white'
                  }`}
                >
                  {overlay === 'all' ? 'All' : overlay}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Hinge Selection */}
        <Section
          title={`Select Hinge (${filteredHinges.length})`}
          icon={<span className="text-sm">⚙️</span>}
          color="purple"
        >
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {filteredHinges.map((hinge) => (
              <HingeCard
                key={hinge.id}
                hinge={hinge}
                isSelected={config.selectedHingeId === hinge.id}
                onSelect={() => updateConfig({ selectedHingeId: hinge.id })}
              />
            ))}
          </div>
        </Section>

        {/* Quantity & Spacing Section */}
        <Section
          title="Quantity & Spacing"
          icon={<span className="text-sm">📏</span>}
          color="green"
        >
          <CounterInput
            label="Number of Hinges"
            value={config.hingeCount}
            onChange={(v) => updateConfig({ hingeCount: v })}
            min={2}
            max={6}
          />

          {/* Auto-spacing toggle */}
          <div className="flex items-center justify-between py-2 border-t border-[#2a3a4a] mt-2">
            <span className="text-[11px] text-gray-400">Auto-spacing</span>
            <button
              onClick={() => updateConfig({ autoSpacing: !config.autoSpacing })}
              className={`relative w-10 h-5 rounded-full transition-all ${
                config.autoSpacing ? 'bg-green-500' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${
                  config.autoSpacing ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Position preview */}
          <div className="mt-3 p-2 bg-[#0d1520] rounded">
            <div className="text-[10px] text-gray-500 mb-2">Hinge Positions (from top)</div>
            <div className="flex flex-wrap gap-1.5">
              {hingePositions.map((pos, i) => (
                <span
                  key={i}
                  className="px-2 py-1 bg-green-500/20 text-green-400 text-[10px] rounded"
                >
                  {Math.round(pos)}mm
                </span>
              ))}
            </div>
          </div>
        </Section>

        {/* Selected Hinge Details */}
        {selectedHinge && (
          <Section
            title="Selected Hinge Specs"
            icon={<span className="text-sm">📋</span>}
            color="orange"
            defaultExpanded={false}
          >
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="p-2 bg-[#0d1520] rounded">
                <div className="text-gray-500">Cup Diameter</div>
                <div className="text-white font-medium">Ø{selectedHinge.cupDiameter}mm</div>
              </div>
              <div className="p-2 bg-[#0d1520] rounded">
                <div className="text-gray-500">Cup Depth</div>
                <div className="text-white font-medium">{selectedHinge.cupDepth}mm</div>
              </div>
              <div className="p-2 bg-[#0d1520] rounded">
                <div className="text-gray-500">Edge Distance</div>
                <div className="text-white font-medium">{selectedHinge.cupCenterToEdge}mm</div>
              </div>
              <div className="p-2 bg-[#0d1520] rounded">
                <div className="text-gray-500">Overlay</div>
                <div className="text-white font-medium">{selectedHinge.overlayAdjustment}mm</div>
              </div>
              <div className="p-2 bg-[#0d1520] rounded">
                <div className="text-gray-500">Max Door</div>
                <div className="text-white font-medium">
                  {selectedHinge.maxDoorWidth}×{selectedHinge.maxDoorHeight}
                </div>
              </div>
              <div className="p-2 bg-[#0d1520] rounded">
                <div className="text-gray-500">Adjustments</div>
                <div className="text-white font-medium">
                  ±{selectedHinge.adjustmentSide}/{selectedHinge.adjustmentHeight}/{selectedHinge.adjustmentDepth}
                </div>
              </div>
            </div>

            <div className="mt-2 p-2 bg-[#0d1520] rounded">
              <div className="text-gray-500 text-[10px] mb-1">Best For</div>
              <div className="flex flex-wrap gap-1">
                {selectedHinge.bestFor.map((use, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-[9px] rounded"
                  >
                    {use}
                  </span>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* Validation Warnings */}
        {!validation.valid && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-amber-400" />
              <span className="text-xs font-medium text-amber-400">Warnings</span>
            </div>
            <ul className="space-y-1">
              {validation.warnings.map((warning, i) => (
                <li key={i} className="text-[10px] text-amber-300 flex items-start gap-1">
                  <span>•</span>
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Footer - CNC Info */}
      <div className="p-3 border-t border-[#2a3a4a] bg-[#152030]">
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <Info size={12} />
          <span>
            CNC Boring: Ø{selectedHinge?.cupDiameter || 35}mm × {selectedHinge?.cupDepth || 11.5}mm depth
          </span>
        </div>
      </div>
    </div>
  );
}

export default HingeConfigPanel;
