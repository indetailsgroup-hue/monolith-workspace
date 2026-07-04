/**
 * ShelfMinifixConfigPanel - Per-shelf Minifix connector configuration
 *
 * Configures how a shelf connects to side panels:
 * - Connection type: Shelf Pins (adjustable) vs Minifix (fixed)
 * - Left/Right side enable/disable
 * - System 32 depth positions
 * - Distance B from mating edge
 * - Dowel inclusion toggle
 *
 * @version 1.0.0
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Check,
  Link2,
  Unlink,
} from 'lucide-react';
import type {
  ShelfConnectorConfig,
  ShelfSideConnectorConfig,
  ShelfConnectionType,
} from '../../../core/types/Cabinet';
import {
  DEFAULT_SHELF_CONNECTOR_CONFIG,
  DEFAULT_SHELF_SIDE_CONNECTOR,
} from '../../../core/types/Cabinet';

// ============================================
// PROPS
// ============================================

export interface ShelfMinifixConfigPanelProps {
  /** 0-based shelf index */
  shelfIndex: number;
  /** Shelf name for display (e.g., "Main Shelf 1") */
  shelfName?: string;
  /** Current config (if undefined, uses defaults) */
  config?: ShelfConnectorConfig;
  /** Callback when config changes */
  onConfigChange?: (config: ShelfConnectorConfig) => void;
  /** Cabinet depth for calculating available sys32 positions */
  cabinetDepth?: number;
}

// ============================================
// AVAILABLE SYSTEM 32 POSITIONS
// ============================================

function getAvailableSys32Positions(cabinetDepth: number): number[] {
  const positions: number[] = [];
  const firstHole = 37;
  const pitch = 32;
  // Generate positions from front, stopping when we'd be too close to back
  const maxZ = cabinetDepth - 37; // leave 37mm margin from back
  let z = firstHole;
  while (z <= maxZ) {
    positions.push(z);
    z += pitch;
  }
  return positions;
}

// ============================================
// SIDE CONNECTOR SECTION
// ============================================

interface SideConnectorSectionProps {
  side: 'LEFT' | 'RIGHT';
  config: ShelfSideConnectorConfig;
  onChange: (config: ShelfSideConnectorConfig) => void;
  availablePositions: number[];
  defaultExpanded?: boolean;
}

function SideConnectorSection({
  side,
  config,
  onChange,
  availablePositions,
  defaultExpanded = true,
}: SideConnectorSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const label = side === 'LEFT' ? 'Left Side' : 'Right Side';
  const accentColor = side === 'LEFT' ? 'green' : 'purple';

  const togglePosition = useCallback((pos: number) => {
    const current = config.sys32Positions || [];
    const next = current.includes(pos)
      ? current.filter(p => p !== pos)
      : [...current, pos].sort((a, b) => a - b);
    onChange({ ...config, sys32Positions: next });
  }, [config, onChange]);

  return (
    <div className="border border-[#333] rounded-lg overflow-hidden">
      {/* Section Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-3 transition-all duration-200"
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${config.enabled ? `bg-${accentColor}-500` : 'bg-gray-600'}`} />
          <span className="text-xs font-medium text-white">{label}</span>
          {!config.enabled && (
            <span className="text-[10px] text-gray-500">disabled</span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-[#333]">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-gray-400">Enable Connector</span>
            <button
              onClick={() => onChange({ ...config, enabled: !config.enabled })}
              className={`w-8 h-4 rounded-full transition-all duration-200 ${
                config.enabled ? `bg-${accentColor}-500` : 'bg-gray-600'
              }`}
            >
              <div className={`w-3 h-3 rounded-full bg-white transition-transform duration-200 mx-0.5 ${
                config.enabled ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {config.enabled && (
            <>
              {/* Depth Positions (System 32) */}
              <div>
                <span className="text-[10px] text-gray-500 font-medium">Depth Positions (mm)</span>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {availablePositions.map(pos => {
                    const isSelected = config.sys32Positions?.includes(pos);
                    return (
                      <button
                        key={pos}
                        onClick={() => togglePosition(pos)}
                        className={`px-2 py-1 text-[10px] font-mono rounded border transition-all duration-200 ${
                          isSelected
                            ? `bg-${accentColor}-500/20 border-${accentColor}-500/50 text-${accentColor}-400`
                            : 'bg-surface-2 border-[#333] text-gray-500 hover:text-white hover:bg-surface-3'
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 inline mr-0.5" />}
                        {pos}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Distance B */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">Distance B</span>
                <div className="flex items-center gap-1">
                  <select
                    value={config.distanceB}
                    onChange={(e) => onChange({ ...config, distanceB: Number(e.target.value) })}
                    className="bg-surface-2 border border-[#333] rounded text-[11px] text-white px-2 py-1
                      focus:border-green-500 focus:ring-1 focus:ring-green-500/20 focus:outline-none"
                  >
                    <option value={24}>24 mm</option>
                    <option value={34}>34 mm</option>
                  </select>
                </div>
              </div>

              {/* Include Dowels */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">Include Dowels</span>
                <button
                  onClick={() => onChange({ ...config, includeDowels: !config.includeDowels })}
                  className={`w-8 h-4 rounded-full transition-all duration-200 ${
                    config.includeDowels ? `bg-${accentColor}-500` : 'bg-gray-600'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform duration-200 mx-0.5 ${
                    config.includeDowels ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ShelfMinifixConfigPanel({
  shelfIndex,
  shelfName,
  config: externalConfig,
  onConfigChange,
  cabinetDepth = 560,
}: ShelfMinifixConfigPanelProps) {
  const [config, setConfig] = useState<ShelfConnectorConfig>(
    externalConfig || { ...DEFAULT_SHELF_CONNECTOR_CONFIG }
  );
  const [synced, setSynced] = useState(true);

  const displayName = shelfName || `Shelf ${shelfIndex + 1}`;

  const availablePositions = useMemo(
    () => getAvailableSys32Positions(cabinetDepth),
    [cabinetDepth]
  );

  const updateConfig = useCallback((updates: Partial<ShelfConnectorConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...updates };
      onConfigChange?.(next);
      return next;
    });
  }, [onConfigChange]);

  const updateSide = useCallback((
    side: 'left' | 'right',
    sideConfig: ShelfSideConnectorConfig
  ) => {
    if (synced) {
      // When synced, mirror changes to both sides
      updateConfig({ left: sideConfig, right: { ...sideConfig } });
    } else {
      updateConfig({ [side]: sideConfig });
    }
  }, [synced, updateConfig]);

  const setConnectionType = useCallback((type: ShelfConnectionType) => {
    updateConfig({ connectionType: type });
  }, [updateConfig]);

  // Calculate connector count for summary
  const connectorCount = useMemo(() => {
    if (config.connectionType !== 'minifix') return 0;
    const leftCount = config.left.enabled ? (config.left.sys32Positions?.length || 0) : 0;
    const rightCount = config.right.enabled ? (config.right.sys32Positions?.length || 0) : 0;
    return leftCount + rightCount;
  }, [config]);

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
            {displayName} — Connection
          </span>
        </div>
      </div>

      {/* Connection Type Toggle */}
      <div className="flex gap-1 p-1 bg-surface-2 rounded-lg border border-[#333]">
        <button
          onClick={() => setConnectionType('shelf-pins')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded transition-all duration-200 ${
            config.connectionType === 'shelf-pins'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'text-gray-500 hover:text-white border border-transparent'
          }`}
        >
          📌 Shelf Pins
        </button>
        <button
          onClick={() => setConnectionType('minifix')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded transition-all duration-200 ${
            config.connectionType === 'minifix'
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              : 'text-gray-500 hover:text-white border border-transparent'
          }`}
        >
          🔩 Minifix
        </button>
      </div>

      {/* Minifix Configuration (only shown when minifix selected) */}
      {config.connectionType === 'minifix' && (
        <div className="space-y-2">
          {/* Sync Toggle */}
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => setSynced(!synced)}
              className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border transition-all duration-200 ${
                synced
                  ? 'bg-green-500/10 border-green-500/30 text-green-400'
                  : 'bg-surface-2 border-[#333] text-gray-500'
              }`}
            >
              {synced ? (
                <Link2 className="w-3 h-3" />
              ) : (
                <Unlink className="w-3 h-3" />
              )}
              {synced ? 'Synced' : 'Independent'}
            </button>
          </div>

          {/* Left Side */}
          <SideConnectorSection
            side="LEFT"
            config={config.left}
            onChange={(c) => updateSide('left', c)}
            availablePositions={availablePositions}
            defaultExpanded={true}
          />

          {/* Right Side */}
          {!synced && (
            <SideConnectorSection
              side="RIGHT"
              config={config.right}
              onChange={(c) => updateSide('right', c)}
              availablePositions={availablePositions}
              defaultExpanded={true}
            />
          )}

          {/* Summary */}
          {connectorCount > 0 && (
            <div className="flex items-center justify-between px-2 py-1.5 bg-surface-2 rounded border border-[#333]">
              <span className="text-[10px] text-gray-500">Connectors</span>
              <span className="text-[11px] text-orange-400 font-mono">
                {connectorCount} × Minifix S200
                {config.left.includeDowels || config.right.includeDowels ? ' + Dowels' : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Shelf Pins info (when shelf-pins selected) */}
      {config.connectionType === 'shelf-pins' && (
        <div className="px-2 py-2 bg-surface-2 rounded border border-[#333]">
          <span className="text-[10px] text-gray-500">
            Adjustable shelf with System 32 pin holes on side panels.
            Position is set via shelf pin row configuration.
          </span>
        </div>
      )}
    </div>
  );
}
