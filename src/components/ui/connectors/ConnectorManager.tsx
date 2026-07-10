/**
 * ConnectorManager - Unified Connector Configuration Interface
 *
 * Tabbed interface combining all connector configuration panels:
 * - Minifix (S200 bolt + cam housing configuration)
 * - Hinges
 * - Shelf Pins
 * - Dowels
 *
 * @version 1.1.0 - Integrated MinifixConfigPanel as proper tab
 */

import React, { useState, useCallback } from 'react';
import { HingeConfigPanel, HingeConfig, DEFAULT_HINGE_CONFIG } from './HingeConfigPanel';
import { ShelfPinConfigPanel, ShelfPinConfig, DEFAULT_SHELF_PIN_CONFIG } from './ShelfPinConfigPanel';
import { DowelConfigPanel, DowelConfig, DEFAULT_DOWEL_CONFIG } from './DowelConfigPanel';
import {
  MinifixConfigPanel,
  MinifixFullConfig,
  DEFAULT_MINIFIX_CONFIG,
} from '../MinifixConfigPanel';
import { Circle, ChevronLeft, Save, RotateCcw } from 'lucide-react';
import { useDrillMapStore } from '../../../core/store/useDrillMapStore';
import type { ConnectorDensity } from '../../../core/manufacturing/drillMap/generateDrillMap';

// ============================================
// CONNECTOR TYPES
// ============================================

export type ConnectorType = 'minifix' | 'hinges' | 'shelf-pins' | 'dowels';

export interface ConnectorManagerConfig {
  activeTab: ConnectorType;
  minifixConfig: MinifixFullConfig;
  hingeConfig: HingeConfig;
  shelfPinConfig: ShelfPinConfig;
  dowelConfig: DowelConfig;
}

export const DEFAULT_CONNECTOR_MANAGER_CONFIG: ConnectorManagerConfig = {
  activeTab: 'minifix',  // Default to Minifix tab
  minifixConfig: DEFAULT_MINIFIX_CONFIG,
  hingeConfig: DEFAULT_HINGE_CONFIG,
  shelfPinConfig: DEFAULT_SHELF_PIN_CONFIG,
  dowelConfig: DEFAULT_DOWEL_CONFIG,
};

// ============================================
// TAB BUTTON COMPONENT
// ============================================

interface TabButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  color: string;
}

function TabButton({ icon, label, isActive, onClick, color }: TabButtonProps) {
  const colorClasses: Record<string, string> = {
    purple: 'border-purple-500 text-purple-400 bg-purple-500/10',
    cyan: 'border-cyan-500 text-cyan-400 bg-cyan-500/10',
    amber: 'border-amber-500 text-amber-400 bg-amber-500/10',
    red: 'border-red-500 text-red-400 bg-red-500/10',
  };

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${
        isActive
          ? colorClasses[color]
          : 'text-gray-500 border-transparent hover:text-white hover:bg-white/5'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

interface ConnectorManagerProps {
  onClose?: () => void;
  onSave?: (config: ConnectorManagerConfig) => void;
  initialConfig?: ConnectorManagerConfig;
  /** Panel thickness for Minifix cam depth calculation */
  panelThickness?: number;
}

export function ConnectorManager({
  onClose,
  onSave,
  initialConfig,
  panelThickness = 18,
}: ConnectorManagerProps) {
  const [config, setConfig] = useState<ConnectorManagerConfig>(
    initialConfig || DEFAULT_CONNECTOR_MANAGER_CONFIG
  );
  const [hasChanges, setHasChanges] = useState(false);

  // Tab change handler
  const handleTabChange = useCallback((tab: ConnectorType) => {
    setConfig((prev) => ({ ...prev, activeTab: tab }));
  }, []);

  // Config update handlers
  const handleMinifixConfigChange = useCallback((minifixConfig: MinifixFullConfig) => {
    setConfig((prev) => ({ ...prev, minifixConfig }));
    setHasChanges(true);
  }, []);

  const handleHingeConfigChange = useCallback((hingeConfig: HingeConfig) => {
    setConfig((prev) => ({ ...prev, hingeConfig }));
    setHasChanges(true);
  }, []);

  const handleShelfPinConfigChange = useCallback((shelfPinConfig: ShelfPinConfig) => {
    setConfig((prev) => ({ ...prev, shelfPinConfig }));
    setHasChanges(true);
  }, []);

  const handleDowelConfigChange = useCallback((dowelConfig: DowelConfig) => {
    setConfig((prev) => ({ ...prev, dowelConfig }));
    setHasChanges(true);
  }, []);

  // Reset handler
  const handleReset = useCallback(() => {
    setConfig(DEFAULT_CONNECTOR_MANAGER_CONFIG);
    setHasChanges(false);
  }, []);

  // Save handler
  const handleSave = useCallback(() => {
    onSave?.(config);
    setHasChanges(false);
  }, [config, onSave]);

  return (
    <div className="h-full flex flex-col bg-[#1a2535] text-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a3a4a]">
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={18} className="text-gray-400" />
          </button>
        )}
        <span className="text-lg">🔧</span>
        <span className="text-sm font-medium">Connector Manager</span>

        <div className="ml-auto flex items-center gap-2">
          {hasChanges && (
            <span className="text-[10px] text-amber-400 px-2 py-0.5 bg-amber-500/20 rounded">
              Unsaved changes
            </span>
          )}
          <button
            onClick={handleReset}
            className="p-2 rounded hover:bg-white/10 transition-colors"
            title="Reset to defaults"
          >
            <RotateCcw size={16} className="text-gray-400" />
          </button>
          {onSave && (
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                hasChanges
                  ? 'bg-green-500 text-white hover:bg-green-400'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Save size={14} />
              Save
            </button>
          )}
        </div>
      </div>

      {/* ADR-061: ความถี่ Minifix — ตัวเลือกคุยกับลูกค้า (มาตรฐาน CAD vs AWI Premium) */}
      <ConnectorDensitySelector />

      {/* Tabs */}
      <div className="flex border-b border-[#2a3a4a] overflow-x-auto">
        <TabButton
          icon={<span className="w-2 h-2 rounded-full bg-amber-500" />}
          label="Minifix"
          isActive={config.activeTab === 'minifix'}
          onClick={() => handleTabChange('minifix')}
          color="amber"
        />
        <TabButton
          icon={<span className="text-sm">🚪</span>}
          label="Hinges"
          isActive={config.activeTab === 'hinges'}
          onClick={() => handleTabChange('hinges')}
          color="purple"
        />
        <TabButton
          icon={<span className="text-sm">📌</span>}
          label="Shelf Pins"
          isActive={config.activeTab === 'shelf-pins'}
          onClick={() => handleTabChange('shelf-pins')}
          color="cyan"
        />
        <TabButton
          icon={<Circle size={12} className="text-amber-600" fill="#d97706" />}
          label="Dowels"
          isActive={config.activeTab === 'dowels'}
          onClick={() => handleTabChange('dowels')}
          color="amber"
        />
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {config.activeTab === 'minifix' && (
          <MinifixConfigPanel
            initialConfig={config.minifixConfig}
            onConfigChange={handleMinifixConfigChange}
            showBackButton={false}
            showPreview={true}
            initialWoodThickness={panelThickness}
          />
        )}

        {config.activeTab === 'hinges' && (
          <HingeConfigPanel
            initialConfig={config.hingeConfig}
            onConfigChange={handleHingeConfigChange}
          />
        )}

        {config.activeTab === 'shelf-pins' && (
          <ShelfPinConfigPanel
            initialConfig={config.shelfPinConfig}
            onConfigChange={handleShelfPinConfigChange}
          />
        )}

        {config.activeTab === 'dowels' && (
          <DowelConfigPanel
            initialConfig={config.dowelConfig}
            onConfigChange={handleDowelConfigChange}
          />
        )}
      </div>

      {/* Footer Summary */}
      <div className="p-3 border-t border-[#2a3a4a] bg-[#152030]">
        <div className="flex items-center justify-between text-[10px] text-gray-500">
          <div className="flex items-center gap-4">
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />
              Minifix {config.minifixConfig.minifixType} ({config.minifixConfig.woodThickness}mm)
            </span>
            <span>
              🚪 {config.hingeConfig.hingeCount} hinges
            </span>
            <span>
              📌 {config.shelfPinConfig.rowConfig.rowCount} rows × System {config.shelfPinConfig.rowConfig.spacing}
            </span>
            <span>
              <Circle size={8} className="inline text-amber-600" fill="#d97706" /> {config.dowelConfig.dowelCount} dowels
            </span>
          </div>
          <span className="text-gray-600">
            Connector Manager v1.1
          </span>
        </div>
      </div>
    </div>
  );
}

export default ConnectorManager;


// ============================================
// ADR-061: CONNECTOR DENSITY SELECTOR
// ============================================

/**
 * ตัวเลือกความถี่ Minifix ต่อ joint — ให้ Sale/Designer ตัดสินใจกับลูกค้า
 * มาตรฐาน CAD (2-3 ตัว ประหยัด) vs AWI Premium (ช่วงห่าง ≤128mm แข็งแรงขึ้น)
 * เก็บใน useDrillMapStore (persisted) → drill map regenerate อัตโนมัติ
 */
function ConnectorDensitySelector() {
  const density = useDrillMapStore((s) => s.connectorDensity);
  const setDensity = useDrillMapStore((s) => s.setConnectorDensity);
  const regenerate = useDrillMapStore((s) => s.regenerateDrillMap);

  const choose = (d: ConnectorDensity) => {
    if (d === density) return;
    setDensity(d);
    regenerate();
  };

  return (
    <div className="px-4 py-2.5 border-b border-[#2a3a4a] bg-[#152030]">
      <div className="text-[10px] text-gray-400 mb-1.5">
        ความถี่ Minifix ต่อ joint — เลือกตามที่ตกลงกับลูกค้า
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => choose('CAD_STANDARD')}
          className={`flex-1 px-2 py-1.5 rounded text-[11px] text-left transition-colors border ${
            density === 'CAD_STANDARD'
              ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
              : 'bg-transparent border-[#2a3a4a] text-gray-400 hover:border-gray-500'
          }`}
        >
          <div className="font-medium">มาตรฐาน CAD</div>
          <div className="text-[9px] opacity-75">2-3 ตัว/joint — ประหยัดฮาร์ดแวร์</div>
        </button>
        <button
          onClick={() => choose('AWI_PREMIUM')}
          className={`flex-1 px-2 py-1.5 rounded text-[11px] text-left transition-colors border ${
            density === 'AWI_PREMIUM'
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
              : 'bg-transparent border-[#2a3a4a] text-gray-400 hover:border-gray-500'
          }`}
        >
          <div className="font-medium">AWI Premium</div>
          <div className="text-[9px] opacity-75">ช่วงห่าง ≤128mm — แข็งแรงขึ้น ต้นทุนเพิ่ม</div>
        </button>
      </div>
    </div>
  );
}
