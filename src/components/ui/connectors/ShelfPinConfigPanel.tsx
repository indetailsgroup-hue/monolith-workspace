/**
 * ShelfPinConfigPanel - Shelf Pin Configuration
 *
 * Configuration panel for System 32 shelf pin drilling patterns.
 * Shows visual grid preview of hole positions.
 *
 * @version 1.0.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  SHELF_PIN_CATALOG,
  ShelfPinSpec,
  ShelfPinRowConfig,
  DEFAULT_SYSTEM_32_CONFIG,
  calculateShelfPinPositions,
  calculateTotalShelfPinHoles,
  getShelfPinById,
  validateShelfPinConfig,
} from '../../../core/catalog/ShelfPinCatalog';
import { ChevronDown, ChevronUp, Check, AlertTriangle, Grid3X3 } from 'lucide-react';

// ============================================
// SHELF PIN CONFIG STATE
// ============================================

export interface ShelfPinConfig {
  selectedPinId: string;
  rowConfig: ShelfPinRowConfig;
  panelHeight: number;
  panelDepth: number;
  panelThickness: number;
  shelfLoad: number;
  shelfWidth: number;
}

export const DEFAULT_SHELF_PIN_CONFIG: ShelfPinConfig = {
  selectedPinId: 'PIN_5MM_STANDARD',
  rowConfig: DEFAULT_SYSTEM_32_CONFIG,
  panelHeight: 720,
  panelDepth: 560,
  panelThickness: 18,
  shelfLoad: 20,
  shelfWidth: 500,
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
            [&::-webkit-slider-thumb]:bg-cyan-500"
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
            text-[11px] text-white text-right focus:outline-none focus:border-cyan-500"
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
// SHELF PIN CARD COMPONENT
// ============================================

interface PinCardProps {
  pin: ShelfPinSpec;
  isSelected: boolean;
  onSelect: () => void;
}

function PinCard({ pin, isSelected, onSelect }: PinCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full p-3 rounded-lg border text-left transition-all ${
        isSelected
          ? 'bg-cyan-500/20 border-cyan-500'
          : 'bg-[#1e2a3a] border-[#3a4a5a] hover:border-cyan-500/50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white">{pin.name}</span>
            {isSelected && <Check size={14} className="text-cyan-400" />}
          </div>
          <span className="text-[10px] text-gray-500">{pin.material} • {pin.style}</span>
        </div>
        <span className="px-2 py-0.5 text-[9px] font-medium rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
          Ø{pin.pinDiameter}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
        <div className="text-center p-1.5 bg-[#0d1520] rounded">
          <div className="text-gray-500">Hole</div>
          <div className="text-white font-medium">Ø{pin.holeDiameter}×{pin.holeDepth}</div>
        </div>
        <div className="text-center p-1.5 bg-[#0d1520] rounded">
          <div className="text-gray-500">Load</div>
          <div className="text-white font-medium">{pin.maxLoadPerPin}kg</div>
        </div>
        <div className="text-center p-1.5 bg-[#0d1520] rounded">
          <div className="text-gray-500">Min Panel</div>
          <div className="text-white font-medium">{pin.minPanelThickness}mm</div>
        </div>
      </div>

      {(pin.suitableForGlass || pin.hasLockingMechanism) && (
        <div className="mt-2 flex items-center gap-2">
          {pin.suitableForGlass && (
            <span className="flex items-center gap-1 text-[10px] text-blue-400">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Glass
            </span>
          )}
          {pin.hasLockingMechanism && (
            <span className="flex items-center gap-1 text-[10px] text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Locking
            </span>
          )}
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

function Section({ title, icon, children, defaultExpanded = true, color = 'cyan' }: SectionProps) {
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
// GRID PREVIEW COMPONENT
// ============================================

interface GridPreviewProps {
  panelHeight: number;
  panelDepth: number;
  rowConfig: ShelfPinRowConfig;
  positions: number[];
}

function GridPreview({ panelHeight, panelDepth, rowConfig, positions }: GridPreviewProps) {
  // Scale for preview (fit in ~200px height)
  const scale = 180 / panelHeight;
  const previewHeight = panelHeight * scale;
  const previewWidth = Math.min(panelDepth * scale, 100);

  return (
    <div className="p-3 bg-[#0d1520] rounded-lg">
      <div className="text-[10px] text-gray-500 mb-2 flex items-center gap-1">
        <Grid3X3 size={12} />
        Drilling Pattern Preview
      </div>

      <div
        className="relative border border-cyan-500/30 rounded bg-[#1a2535]"
        style={{ height: previewHeight + 20, width: previewWidth + 20 }}
      >
        {/* Panel outline */}
        <div
          className="absolute bg-[#2a3a4a] rounded"
          style={{
            top: 10,
            left: 10,
            height: previewHeight,
            width: previewWidth,
          }}
        >
          {/* Front row holes */}
          {positions.map((y, i) => (
            <div
              key={`front-${i}`}
              className="absolute w-2 h-2 rounded-full bg-cyan-400"
              style={{
                top: y * scale - 4,
                left: rowConfig.frontSetback * scale - 4,
              }}
            />
          ))}

          {/* Back row holes (if 2 rows) */}
          {rowConfig.rowCount > 1 &&
            positions.map((y, i) => (
              <div
                key={`back-${i}`}
                className="absolute w-2 h-2 rounded-full bg-cyan-400/60"
                style={{
                  top: y * scale - 4,
                  right: rowConfig.backSetback * scale - 4,
                }}
              />
            ))}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[9px]">
        <div className="text-gray-500">
          <span className="text-cyan-400">●</span> Front row ({rowConfig.frontSetback}mm)
        </div>
        {rowConfig.rowCount > 1 && (
          <div className="text-gray-500">
            <span className="text-cyan-400/60">●</span> Back row ({rowConfig.backSetback}mm)
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

interface ShelfPinConfigPanelProps {
  onConfigChange?: (config: ShelfPinConfig) => void;
  initialConfig?: ShelfPinConfig;
}

export function ShelfPinConfigPanel({
  onConfigChange,
  initialConfig,
}: ShelfPinConfigPanelProps) {
  const [config, setConfig] = useState<ShelfPinConfig>(initialConfig || DEFAULT_SHELF_PIN_CONFIG);

  // Get selected pin
  const selectedPin = useMemo(() => {
    return getShelfPinById(config.selectedPinId);
  }, [config.selectedPinId]);

  // Calculate hole positions
  const holePositions = useMemo(() => {
    return calculateShelfPinPositions(config.panelHeight, config.rowConfig);
  }, [config.panelHeight, config.rowConfig]);

  // Calculate total holes
  const totalHoles = useMemo(() => {
    return calculateTotalShelfPinHoles(config.panelHeight, 2, config.rowConfig);
  }, [config.panelHeight, config.rowConfig]);

  // Validate configuration
  const validation = useMemo(() => {
    if (!selectedPin) return { valid: false, warnings: ['No pin selected'] };
    return validateShelfPinConfig(
      selectedPin,
      config.panelThickness,
      config.shelfLoad,
      config.shelfWidth
    );
  }, [selectedPin, config.panelThickness, config.shelfLoad, config.shelfWidth]);

  // Update config handler
  const updateConfig = useCallback(
    (updates: Partial<ShelfPinConfig>) => {
      setConfig((prev) => {
        const newConfig = { ...prev, ...updates };
        onConfigChange?.(newConfig);
        return newConfig;
      });
    },
    [onConfigChange]
  );

  // Update row config
  const updateRowConfig = useCallback(
    (updates: Partial<ShelfPinRowConfig>) => {
      setConfig((prev) => {
        const newConfig = {
          ...prev,
          rowConfig: { ...prev.rowConfig, ...updates },
        };
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
        <span className="text-lg">📌</span>
        <span className="text-sm font-medium text-cyan-400">Shelf Pin Configuration</span>
        <span className="ml-auto text-[10px] text-gray-500">
          System {config.rowConfig.spacing}
        </span>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* System 32 Toggle */}
        <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500" />
              <span className="text-xs font-medium text-cyan-400">SYSTEM 32</span>
            </div>
            <button
              onClick={() =>
                updateRowConfig({
                  system: config.rowConfig.system === 'SYSTEM_32' ? 'CUSTOM' : 'SYSTEM_32',
                  spacing: config.rowConfig.system === 'SYSTEM_32' ? 25 : 32,
                })
              }
              className={`relative w-10 h-5 rounded-full transition-all ${
                config.rowConfig.system === 'SYSTEM_32' ? 'bg-cyan-500' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${
                  config.rowConfig.system === 'SYSTEM_32' ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            {config.rowConfig.system === 'SYSTEM_32'
              ? 'Standard 32mm spacing locked'
              : 'Custom spacing enabled'}
          </p>
        </div>

        {/* Panel Dimensions */}
        <Section title="Panel Dimensions" icon={<span className="text-sm">📐</span>} color="cyan">
          <div className="space-y-1">
            <SliderInput
              label="Height"
              value={config.panelHeight}
              onChange={(v) => updateConfig({ panelHeight: v })}
              min={300}
              max={2400}
            />
            <SliderInput
              label="Depth"
              value={config.panelDepth}
              onChange={(v) => updateConfig({ panelDepth: v })}
              min={200}
              max={800}
            />
            <SliderInput
              label="Thickness"
              value={config.panelThickness}
              onChange={(v) => updateConfig({ panelThickness: v })}
              min={12}
              max={25}
            />
          </div>
        </Section>

        {/* Drilling Settings */}
        <Section
          title="Drilling Settings"
          icon={<span className="text-sm">⚙️</span>}
          color="cyan"
        >
          <div className="space-y-1">
            <SliderInput
              label="Hole Spacing"
              value={config.rowConfig.spacing}
              onChange={(v) => updateRowConfig({ spacing: v })}
              min={20}
              max={64}
              step={config.rowConfig.system === 'SYSTEM_32' ? 32 : 1}
            />
            <SliderInput
              label="Start Offset"
              value={config.rowConfig.startOffset}
              onChange={(v) => updateRowConfig({ startOffset: v })}
              min={20}
              max={100}
            />
            <SliderInput
              label="End Offset"
              value={config.rowConfig.endOffset}
              onChange={(v) => updateRowConfig({ endOffset: v })}
              min={20}
              max={100}
            />
            <SliderInput
              label="Front Setback"
              value={config.rowConfig.frontSetback}
              onChange={(v) => updateRowConfig({ frontSetback: v })}
              min={20}
              max={100}
            />
          </div>

          <div className="mt-3 pt-3 border-t border-[#2a3a4a]">
            <CounterInput
              label="Number of Rows"
              value={config.rowConfig.rowCount}
              onChange={(v) => updateRowConfig({ rowCount: v })}
              min={1}
              max={4}
            />
          </div>
        </Section>

        {/* Grid Preview */}
        <GridPreview
          panelHeight={config.panelHeight}
          panelDepth={config.panelDepth}
          rowConfig={config.rowConfig}
          positions={holePositions}
        />

        {/* Hole Count Summary */}
        <div className="p-3 bg-[#0d1520] rounded-lg">
          <div className="text-[10px] text-gray-500 mb-2">Hole Summary</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-cyan-500/10 rounded">
              <div className="text-lg font-bold text-cyan-400">{totalHoles.holesPerRow}</div>
              <div className="text-[9px] text-gray-500">Per Row</div>
            </div>
            <div className="p-2 bg-cyan-500/10 rounded">
              <div className="text-lg font-bold text-cyan-400">
                {totalHoles.holesPerRow * totalHoles.rowsPerPanel}
              </div>
              <div className="text-[9px] text-gray-500">Per Panel</div>
            </div>
            <div className="p-2 bg-cyan-500/10 rounded">
              <div className="text-lg font-bold text-cyan-400">{totalHoles.totalHoles}</div>
              <div className="text-[9px] text-gray-500">Total (2 panels)</div>
            </div>
          </div>
        </div>

        {/* Pin Selection */}
        <Section
          title={`Select Pin Type (${SHELF_PIN_CATALOG.length})`}
          icon={<span className="text-sm">📌</span>}
          color="cyan"
        >
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {SHELF_PIN_CATALOG.map((pin) => (
              <PinCard
                key={pin.id}
                pin={pin}
                isSelected={config.selectedPinId === pin.id}
                onSelect={() => updateConfig({ selectedPinId: pin.id })}
              />
            ))}
          </div>
        </Section>

        {/* Load Configuration */}
        <Section
          title="Shelf Load"
          icon={<span className="text-sm">⚖️</span>}
          color="green"
        >
          <div className="space-y-1">
            <SliderInput
              label="Shelf Width"
              value={config.shelfWidth}
              onChange={(v) => updateConfig({ shelfWidth: v })}
              min={200}
              max={1200}
            />
            <SliderInput
              label="Expected Load"
              value={config.shelfLoad}
              onChange={(v) => updateConfig({ shelfLoad: v })}
              min={5}
              max={100}
              unit="kg"
            />
          </div>

          {selectedPin && (
            <div className="mt-3 p-2 bg-[#0d1520] rounded">
              <div className="text-[10px] text-gray-500 mb-1">Load per Pin</div>
              <div className="text-white font-medium">
                {(config.shelfLoad / 4).toFixed(1)}kg
                <span className="text-gray-500"> / {selectedPin.maxLoadPerPin}kg max</span>
              </div>
              <div className="mt-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    config.shelfLoad / 4 > selectedPin.maxLoadPerPin
                      ? 'bg-red-500'
                      : config.shelfLoad / 4 > selectedPin.maxLoadPerPin * 0.7
                      ? 'bg-amber-500'
                      : 'bg-green-500'
                  }`}
                  style={{
                    width: `${Math.min(100, (config.shelfLoad / 4 / selectedPin.maxLoadPerPin) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </Section>

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
            CNC: Ø{selectedPin?.holeDiameter || 5}mm × {selectedPin?.holeDepth || 10}mm
          </span>
          <span>
            {holePositions.length} holes × {config.rowConfig.rowCount} rows
          </span>
        </div>
      </div>
    </div>
  );
}

export default ShelfPinConfigPanel;
