/**
 * DowelConfigPanel - Wood Dowel Configuration
 *
 * Configuration panel for selecting and configuring wood dowels for joints.
 * Shows dowel sizing, quantity, and positioning options.
 *
 * @version 1.0.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  DOWEL_CATALOG,
  DowelSpec,
  getDowelById,
  getDowelsByDiameter,
  getRecommendedDowel,
  calculateDowelCount,
  calculateDowelPositions,
  validateDowelConfig,
  getDowelStrengthSummary,
} from '../../../core/catalog/DowelCatalog';
import { ChevronDown, ChevronUp, Check, AlertTriangle, Circle } from 'lucide-react';

// ============================================
// DOWEL CONFIG STATE
// ============================================

export type JointType = 'EDGE_TO_FACE' | 'EDGE_TO_EDGE' | 'FACE_TO_FACE';
export type AlignmentMode = 'CENTERED' | 'OFFSET_FRONT' | 'OFFSET_BACK';

export interface DowelConfig {
  selectedDowelId: string;
  jointType: JointType;
  alignmentMode: AlignmentMode;
  dowelCount: number;
  jointLength: number;
  edgeDistance: number;
  panelThickness: number;
}

export const DEFAULT_DOWEL_CONFIG: DowelConfig = {
  selectedDowelId: 'D8x30',
  jointType: 'EDGE_TO_FACE',
  alignmentMode: 'CENTERED',
  dowelCount: 3,
  jointLength: 500,
  edgeDistance: 30,
  panelThickness: 18,
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
            [&::-webkit-slider-thumb]:bg-amber-500"
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
            text-[11px] text-white text-right focus:outline-none focus:border-amber-500"
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
// DOWEL CARD COMPONENT
// ============================================

interface DowelCardProps {
  dowel: DowelSpec;
  isSelected: boolean;
  onSelect: () => void;
}

function DowelCard({ dowel, isSelected, onSelect }: DowelCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full p-3 rounded-lg border text-left transition-all ${
        isSelected
          ? 'bg-amber-500/20 border-amber-500'
          : 'bg-[#1e2a3a] border-[#3a4a5a] hover:border-amber-500/50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Circle size={14} className="text-amber-600" fill="#d97706" />
            <span className="text-xs font-medium text-white">{dowel.name}</span>
            {isSelected && <Check size={14} className="text-amber-400" />}
          </div>
          <span className="text-[10px] text-gray-500">
            {dowel.material} • {dowel.surfaceType}
            {dowel.preGlued && ' • Pre-glued'}
          </span>
        </div>
        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
          {dowel.size}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
        <div className="text-center p-1.5 bg-[#0d1520] rounded">
          <div className="text-gray-500">Hole</div>
          <div className="text-white font-medium">
            Ø{dowel.holeDiameter}×{dowel.holeDepthPerSide}
          </div>
        </div>
        <div className="text-center p-1.5 bg-[#0d1520] rounded">
          <div className="text-gray-500">Shear</div>
          <div className="text-white font-medium">{dowel.shearStrength}N</div>
        </div>
        <div className="text-center p-1.5 bg-[#0d1520] rounded">
          <div className="text-gray-500">Panel</div>
          <div className="text-white font-medium">
            {dowel.minPanelThickness}-{dowel.maxPanelThickness}
          </div>
        </div>
      </div>
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

function Section({ title, icon, children, defaultExpanded = true, color = 'amber' }: SectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const colorClasses: Record<string, string> = {
    purple: 'text-purple-400 border-purple-500/30',
    green: 'text-green-400 border-green-500/30',
    orange: 'text-orange-400 border-orange-500/30',
    cyan: 'text-cyan-400 border-cyan-500/30',
    amber: 'text-amber-400 border-amber-500/30',
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
// JOINT PREVIEW COMPONENT
// ============================================

interface JointPreviewProps {
  jointLength: number;
  positions: number[];
  dowelDiameter: number;
}

function JointPreview({ jointLength, positions, dowelDiameter }: JointPreviewProps) {
  // Scale for preview
  const scale = 200 / jointLength;
  const previewWidth = jointLength * scale;

  return (
    <div className="p-3 bg-[#0d1520] rounded-lg">
      <div className="text-[10px] text-gray-500 mb-2">Joint Preview</div>

      <div
        className="relative h-8 bg-[#2a3a4a] rounded mx-auto"
        style={{ width: previewWidth }}
      >
        {/* Dowel positions */}
        {positions.map((pos, i) => (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 bg-amber-600 rounded-full"
            style={{
              left: pos * scale - 4,
              width: 8,
              height: 8,
            }}
          />
        ))}
      </div>

      <div className="mt-2 flex justify-between text-[9px] text-gray-500">
        <span>0mm</span>
        <span>{jointLength}mm</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {positions.map((pos, i) => (
          <span
            key={i}
            className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[9px] rounded"
          >
            {Math.round(pos)}mm
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

interface DowelConfigPanelProps {
  onConfigChange?: (config: DowelConfig) => void;
  initialConfig?: DowelConfig;
}

export function DowelConfigPanel({
  onConfigChange,
  initialConfig,
}: DowelConfigPanelProps) {
  const [config, setConfig] = useState<DowelConfig>(initialConfig || DEFAULT_DOWEL_CONFIG);
  const [filterDiameter, setFilterDiameter] = useState<number | 'all'>('all');

  // Get selected dowel
  const selectedDowel = useMemo(() => {
    return getDowelById(config.selectedDowelId);
  }, [config.selectedDowelId]);

  // Filter dowels
  const filteredDowels = useMemo(() => {
    if (filterDiameter === 'all') return DOWEL_CATALOG;
    return getDowelsByDiameter(filterDiameter);
  }, [filterDiameter]);

  // Calculate recommended dowel
  const recommendedDowel = useMemo(() => {
    return getRecommendedDowel(config.panelThickness);
  }, [config.panelThickness]);

  // Calculate recommended count
  const recommendedCount = useMemo(() => {
    return calculateDowelCount(config.jointLength);
  }, [config.jointLength]);

  // Calculate positions
  const dowelPositions = useMemo(() => {
    return calculateDowelPositions(config.jointLength, config.dowelCount, 50);
  }, [config.jointLength, config.dowelCount]);

  // Validate configuration
  const validation = useMemo(() => {
    if (!selectedDowel) return { valid: false, warnings: ['No dowel selected'] };
    return validateDowelConfig(selectedDowel, config.panelThickness, config.jointType);
  }, [selectedDowel, config.panelThickness, config.jointType]);

  // Strength summary
  const strengthSummary = useMemo(() => {
    if (!selectedDowel) return null;
    return getDowelStrengthSummary(selectedDowel, config.dowelCount);
  }, [selectedDowel, config.dowelCount]);

  // Update config handler
  const updateConfig = useCallback(
    (updates: Partial<DowelConfig>) => {
      setConfig((prev) => {
        const newConfig = { ...prev, ...updates };
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
        <Circle size={18} className="text-amber-600" fill="#d97706" />
        <span className="text-sm font-medium text-amber-400">Dowel Configuration</span>
        {selectedDowel && (
          <span className="ml-auto text-[10px] text-gray-500">{selectedDowel.size}</span>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Joint Type */}
        <Section title="Joint Type" icon={<span className="text-sm">🔗</span>} color="amber">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { type: 'EDGE_TO_FACE', label: 'Edge to Face', desc: 'T-joint' },
                { type: 'EDGE_TO_EDGE', label: 'Edge to Edge', desc: 'Butt joint' },
                { type: 'FACE_TO_FACE', label: 'Face to Face', desc: 'Glue-up' },
              ] as const
            ).map(({ type, label, desc }) => (
              <button
                key={type}
                onClick={() => updateConfig({ jointType: type })}
                className={`p-2 rounded-lg border text-center transition-all ${
                  config.jointType === type
                    ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                    : 'bg-[#1e2a3a] border-[#3a4a5a] text-gray-400 hover:border-amber-500/50'
                }`}
              >
                <div className="text-[10px] font-medium">{label}</div>
                <div className="text-[9px] text-gray-500">{desc}</div>
              </button>
            ))}
          </div>
        </Section>

        {/* Panel & Joint Dimensions */}
        <Section
          title="Dimensions"
          icon={<span className="text-sm">📐</span>}
          color="amber"
        >
          <div className="space-y-1">
            <SliderInput
              label="Panel Thickness"
              value={config.panelThickness}
              onChange={(v) => updateConfig({ panelThickness: v })}
              min={10}
              max={50}
            />
            <SliderInput
              label="Joint Length"
              value={config.jointLength}
              onChange={(v) => updateConfig({ jointLength: v })}
              min={100}
              max={2400}
            />
            <SliderInput
              label="Edge Distance"
              value={config.edgeDistance}
              onChange={(v) => updateConfig({ edgeDistance: v })}
              min={15}
              max={60}
            />
          </div>

          {/* Recommended dowel */}
          <div className="mt-3 p-2 bg-[#0d1520] rounded flex items-center justify-between">
            <span className="text-[10px] text-gray-500">Recommended</span>
            <button
              onClick={() => updateConfig({ selectedDowelId: recommendedDowel.id })}
              className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              {recommendedDowel.size} →
            </button>
          </div>
        </Section>

        {/* Filter by Diameter */}
        <Section
          title="Filter by Diameter"
          icon={<span className="text-sm">🔍</span>}
          color="amber"
        >
          <div className="flex flex-wrap gap-1.5">
            {(['all', 5, 6, 8, 10, 12] as const).map((d) => (
              <button
                key={d}
                onClick={() => setFilterDiameter(d)}
                className={`px-3 py-1.5 text-[10px] rounded transition-all ${
                  filterDiameter === d
                    ? 'bg-amber-500 text-white'
                    : 'bg-[#2a3a4a] text-gray-400 hover:text-white'
                }`}
              >
                {d === 'all' ? 'All' : `Ø${d}mm`}
              </button>
            ))}
          </div>
        </Section>

        {/* Dowel Selection */}
        <Section
          title={`Select Dowel (${filteredDowels.length})`}
          icon={<Circle size={14} className="text-amber-600" fill="#d97706" />}
          color="amber"
        >
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {filteredDowels.map((dowel) => (
              <DowelCard
                key={dowel.id}
                dowel={dowel}
                isSelected={config.selectedDowelId === dowel.id}
                onSelect={() => updateConfig({ selectedDowelId: dowel.id })}
              />
            ))}
          </div>
        </Section>

        {/* Quantity */}
        <Section
          title="Quantity & Alignment"
          icon={<span className="text-sm">📏</span>}
          color="green"
        >
          <CounterInput
            label="Dowels per Joint"
            value={config.dowelCount}
            onChange={(v) => updateConfig({ dowelCount: v })}
            min={2}
            max={10}
          />

          <div className="mt-2 p-2 bg-[#0d1520] rounded flex items-center justify-between">
            <span className="text-[10px] text-gray-500">Recommended count</span>
            <span className="text-xs text-green-400">{recommendedCount} pcs</span>
          </div>

          {/* Alignment Mode */}
          <div className="mt-3">
            <div className="text-[10px] text-gray-500 mb-1.5">Alignment Mode</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { mode: 'CENTERED', label: 'Centered' },
                  { mode: 'OFFSET_FRONT', label: 'Front' },
                  { mode: 'OFFSET_BACK', label: 'Back' },
                ] as const
              ).map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => updateConfig({ alignmentMode: mode })}
                  className={`px-2 py-1.5 text-[10px] rounded transition-all ${
                    config.alignmentMode === mode
                      ? 'bg-green-500 text-white'
                      : 'bg-[#2a3a4a] text-gray-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Joint Preview */}
        <JointPreview
          jointLength={config.jointLength}
          positions={dowelPositions}
          dowelDiameter={selectedDowel?.diameter || 8}
        />

        {/* Strength Summary */}
        {strengthSummary && (
          <div className="p-3 bg-[#0d1520] rounded-lg">
            <div className="text-[10px] text-gray-500 mb-2">Joint Strength</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-amber-500/10 rounded">
                <div className="text-sm font-bold text-amber-400">
                  {strengthSummary.totalShearStrength}N
                </div>
                <div className="text-[9px] text-gray-500">Shear</div>
              </div>
              <div className="p-2 bg-amber-500/10 rounded">
                <div className="text-sm font-bold text-amber-400">
                  {strengthSummary.totalPullOutStrength}N
                </div>
                <div className="text-[9px] text-gray-500">Pull-out</div>
              </div>
              <div className="p-2 bg-green-500/10 rounded">
                <div className="text-sm font-bold text-green-400">
                  {strengthSummary.safeWorkingLoad.toFixed(0)}N
                </div>
                <div className="text-[9px] text-gray-500">Safe Load</div>
              </div>
            </div>
          </div>
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

      {/* Footer */}
      <div className="p-3 border-t border-[#2a3a4a] bg-[#152030]">
        <div className="flex items-center justify-between text-[10px] text-gray-500">
          <span>
            CNC: Ø{selectedDowel?.holeDiameter || 8}mm × {selectedDowel?.holeDepthPerSide || 15}mm
          </span>
          <span>{config.dowelCount} dowels @ ~{Math.round(config.jointLength / config.dowelCount)}mm spacing</span>
        </div>
      </div>
    </div>
  );
}

export default DowelConfigPanel;
