/**
 * HardwareConfigSelector - Cabinet Hardware Configuration UI
 *
 * Allows selecting and applying hardware presets (Minifix, Hinges) to cabinets.
 * Integrates with saved presets from HardwareLibrary.
 *
 * v1.0: Initial implementation
 * v1.1: Added toast notification and auto-enable X-Ray on preset selection
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import { useViewStore } from '../../core/store/useViewStore';
import { useDrillMapStore } from '../../core/store/useDrillMapStore';
// NOTE: Drill map generation is handled by Cabinet3D's useEffect, not here
import {
  MinifixConfigPreset,
  loadSavedPresets,
} from './HardwareLibrary';
import { MinifixConfigPanel, MinifixFullConfig, DEFAULT_MINIFIX_CONFIG } from './MinifixConfigPanel';
import { Settings, ChevronDown, Check, X, Package, Wrench, CheckCircle, Eye, Crosshair, Box, RotateCcw } from 'lucide-react';

// ============================================
// TOAST NOTIFICATION COMPONENT
// ============================================

interface ToastProps {
  message: string;
  subMessage?: string;
  icon?: React.ReactNode;
  isVisible: boolean;
}

function Toast({ message, subMessage, icon, isVisible }: ToastProps) {
  if (!isVisible) return null;

  return createPortal(
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-[#1a2535]/95 backdrop-blur-sm border border-green-500/30 rounded-xl shadow-2xl">
        <div className="flex items-center justify-center w-8 h-8 bg-green-500/20 rounded-lg">
          {icon || <CheckCircle size={18} className="text-green-400" />}
        </div>
        <div>
          <div className="text-sm font-medium text-white">{message}</div>
          {subMessage && (
            <div className="text-xs text-gray-400">{subMessage}</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================
// FULLSCREEN MODAL (reused from HardwareLibrary)
// ============================================

interface FullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

function FullscreenModal({ isOpen, onClose, title, children }: FullscreenModalProps) {
  // Draggable state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Reset position when modal opens
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  // Handle drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    e.preventDefault();
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      setPosition({
        x: dragStartRef.current.posX + deltaX,
        y: dragStartRef.current.posY + deltaY,
      });
    };
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
      {/* No backdrop — 3D scene remains interactive behind */}
      <div
        className="pointer-events-auto relative w-[95vw] h-[90vh] max-w-[1600px] bg-[#1a2535] rounded-xl shadow-2xl border border-[#3a4a5a] overflow-hidden flex flex-col"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          cursor: isDragging ? 'grabbing' : 'default',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-[#3a4a5a] bg-[#152030] select-none"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🔧</span>
            <div>
              <h2 className="text-sm font-semibold text-white">{title || 'Hardware Configuration'}</h2>
              <p className="text-[10px] text-gray-500">Configure Minifix S200 for this cabinet</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors group" title="Close (Esc)">
            <X size={18} className="text-gray-400 group-hover:text-white" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>,
    document.body
  );
}

// ============================================
// PRESET DROPDOWN
// ============================================

interface PresetDropdownProps {
  presets: MinifixConfigPreset[];
  selectedId: string | undefined;
  onSelect: (presetId: string | undefined) => void;
  onOpenConfig: () => void;
}

function PresetDropdown({ presets, selectedId, onSelect, onOpenConfig }: PresetDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = presets.find((p) => p.id === selectedId);

  return (
    <div className="relative" data-testid="minifix-preset-selector">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 bg-[#1a2535] border border-[#3a4a5a] rounded-lg text-xs hover:border-cyan-500/50 transition-colors"
        data-testid="minifix-preset-trigger"
      >
        <div className="flex items-center gap-2 min-w-0">
          {selected ? (
            <>
              <span className="text-cyan-400">💾</span>
              <span className="text-white truncate">{selected.name}</span>
              <span className="text-[9px] text-gray-500">({selected.woodThickness}mm)</span>
            </>
          ) : (
            <>
              <span className="text-gray-500">⚪</span>
              <span className="text-gray-400">No preset selected</span>
            </>
          )}
        </div>
        <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a2535] border border-[#3a4a5a] rounded-lg shadow-xl z-50 overflow-hidden max-h-64 overflow-y-auto">
            {/* No preset option */}
            <button
              onClick={() => { onSelect(undefined); setIsOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors ${!selectedId ? 'bg-cyan-500/10' : ''}`}
            >
              <span className="text-gray-500">⚪</span>
              <span className="text-gray-400">No preset (default)</span>
              {!selectedId && <Check size={12} className="ml-auto text-cyan-400" />}
            </button>

            {/* Divider */}
            {presets.length > 0 && <div className="border-t border-[#3a4a5a]" />}

            {/* Saved presets */}
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => { onSelect(preset.id); setIsOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors ${selectedId === preset.id ? 'bg-cyan-500/10' : ''}`}
                data-testid="preset-option"
              >
                <span className="text-cyan-400">💾</span>
                <div className="flex-1 min-w-0">
                  <div className="text-white truncate">{preset.name}</div>
                  <div className="text-[9px] text-gray-500">
                    Cam: Ø{preset.config.camDia}×{preset.config.camDepth} | {preset.woodThickness}mm wood
                  </div>
                </div>
                {selectedId === preset.id && <Check size={12} className="text-cyan-400" />}
              </button>
            ))}

            {/* Create new option */}
            <div className="border-t border-[#3a4a5a]" />
            <button
              onClick={() => { onOpenConfig(); setIsOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-purple-500/10 transition-colors text-purple-400"
            >
              <Settings size={12} />
              <span>Configure Custom...</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// VISUALIZATION TOGGLE BUTTON
// ============================================

interface VisualizationToggleProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  activeColor?: 'red' | 'yellow' | 'green' | 'cyan';
}

function VisualizationToggle({ icon, label, isActive, onClick, activeColor = 'cyan' }: VisualizationToggleProps) {
  const colorClasses = {
    red: isActive ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'bg-[#1a2535] text-gray-500 border-[#3a4a5a]',
    yellow: isActive ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' : 'bg-[#1a2535] text-gray-500 border-[#3a4a5a]',
    green: isActive ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-[#1a2535] text-gray-500 border-[#3a4a5a]',
    cyan: isActive ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50' : 'bg-[#1a2535] text-gray-500 border-[#3a4a5a]',
  };

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-medium transition-all hover:opacity-80 ${colorClasses[activeColor]}`}
      title={`Toggle ${label}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

interface HardwareConfigSelectorProps {
  cabinetId: string;
}

export function HardwareConfigSelector({ cabinetId }: HardwareConfigSelectorProps) {
  const [savedPresets, setSavedPresets] = useState<MinifixConfigPreset[]>([]);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; subMessage?: string } | null>(null);

  // Live config state - syncs with modal in real-time
  // This is the SOURCE OF TRUTH when modal is open
  const [liveConfig, setLiveConfig] = useState<MinifixFullConfig | null>(null);

  // Get cabinet data
  const cabinet = useCabinetStore((state) => state.cabinets.find((c) => c.id === cabinetId));
  const updateHardware = useCabinetStore((state) => state.updateHardware);

  // Get X-Ray mode state and setter
  const xRayMode = useViewStore((state) => state.xRayMode);
  const setXRayMode = useViewStore((state) => state.setXRayMode);

  // Get drill map actions
  const clearDrillMap = useDrillMapStore((state) => state.clearDrillMap);
  const show3DHardware = useDrillMapStore((state) => state.show3DHardware);
  const toggleShow3DHardware = useDrillMapStore((state) => state.toggleShow3DHardware);

  // Load saved presets
  useEffect(() => {
    const presets = loadSavedPresets();
    setSavedPresets(presets);
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Reload presets when modal closes (in case new ones were saved)
  const handleCloseConfig = useCallback(() => {
    setShowConfigModal(false);
    // Clear liveConfig when modal closes - sidebar will use cabinet store
    setLiveConfig(null);
    const presets = loadSavedPresets();
    setSavedPresets(presets);
  }, []);

  // Initialize liveConfig when modal opens
  const handleOpenConfig = useCallback(() => {
    // Set initial liveConfig from cabinet store or preset
    const initialConfig = cabinet?.hardware?.minifixConfig as MinifixFullConfig
      || savedPresets.find(p => p.id === cabinet?.hardware?.minifixPresetId)?.config
      || DEFAULT_MINIFIX_CONFIG;
    setLiveConfig(initialConfig);
    setShowConfigModal(true);
  }, [cabinet, savedPresets]);

  // Handle preset selection
  const handleSelectPreset = useCallback((presetId: string | undefined) => {
    // If a preset is selected, store the full config and regenerate drill map
    if (presetId) {
      const preset = savedPresets.find((p) => p.id === presetId);
      if (preset) {
        // Build the new hardware config
        const newConfig = {
          ...preset.config,
          woodThickness: preset.woodThickness,
        };

        // CRITICAL: Set hardware config FIRST
        updateHardware(cabinetId, {
          minifixPresetId: presetId,
          minifixConfig: newConfig,
        });

        // NOTE: Drill map will be auto-generated by Cabinet3D's useEffect when hardware config changes
        // DO NOT generate drill map here or enable X-Ray mode automatically
        // This prevents double generation which causes WebGL Context Lost

        // Show success toast with preset config summary
        setToast({
          message: `Applied: ${preset.name}`,
          subMessage: `Cam Ø${preset.config.camDia}×${preset.config.camDepth} | Dowel Ø${preset.config.dowelDia}`,
        });
      }
    } else {
      // Cleared preset - clear config first, then drill map
      updateHardware(cabinetId, {
        minifixPresetId: undefined,
        minifixConfig: undefined,
      });

      clearDrillMap();

      // Show toast
      setToast({
        message: 'Hardware preset cleared',
        subMessage: 'Using default configuration',
      });
    }
  }, [cabinetId, updateHardware, savedPresets, clearDrillMap]);

  // Handle custom config from modal
  // CRITICAL: Also update liveConfig for real-time sidebar sync
  const handleConfigChange = useCallback((config: MinifixFullConfig) => {
    const newConfig = {
      ...config,
      // Use woodThickness from config, fallback to 18
      woodThickness: config.woodThickness || 18,
    };

    // CRITICAL: Update liveConfig FIRST for immediate sidebar update
    setLiveConfig(newConfig);

    // Then update cabinet store
    // NOTE: Drill map will be auto-generated by Cabinet3D's useEffect when hardware config changes
    updateHardware(cabinetId, {
      minifixPresetId: undefined, // Clear preset when using custom
      minifixConfig: newConfig,
    });
  }, [cabinetId, updateHardware]);

  if (!cabinet) return null;

  const selectedPresetId = cabinet.hardware?.minifixPresetId;
  const selectedPreset = savedPresets.find((p) => p.id === selectedPresetId);

  // Determine which config to display in sidebar
  // Use liveConfig (from modal) if available, otherwise use cabinet store
  const displayConfig = liveConfig || (cabinet.hardware?.minifixConfig as MinifixFullConfig);

  return (
    <>
      {/* Toast Notification */}
      <Toast
        message={toast?.message || ''}
        subMessage={toast?.subMessage}
        icon={<Eye size={18} className="text-green-400" />}
        isVisible={!!toast}
      />

      {/* Config Modal */}
      <FullscreenModal
        isOpen={showConfigModal}
        onClose={handleCloseConfig}
        title="Configure Minifix S200"
      >
        <MinifixConfigPanel
          showBackButton={false}
          onClose={handleCloseConfig}
          onConfigChange={handleConfigChange}
          showPreview={true}
          // ALWAYS load from cabinet.hardware.minifixConfig (the actual saved config)
          // This ensures edits persist - preset.config is only used as initial seed
          initialConfig={cabinet.hardware?.minifixConfig as MinifixFullConfig || selectedPreset?.config || DEFAULT_MINIFIX_CONFIG}
        />
      </FullscreenModal>

      {/* Hardware Section */}
      <div className="space-y-2">
        {/* Minifix Preset Selector */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] text-purple-400 font-medium flex items-center gap-1">
              <Wrench size={10} />
              Minifix S200 Preset
            </label>
            {selectedPreset && (
              <button
                onClick={handleOpenConfig}
                className="text-[9px] text-gray-500 hover:text-white flex items-center gap-0.5"
              >
                <Settings size={9} />
                View
              </button>
            )}
          </div>
          <PresetDropdown
            presets={savedPresets}
            selectedId={selectedPresetId}
            onSelect={handleSelectPreset}
            onOpenConfig={handleOpenConfig}
          />
        </div>

        {/* Config Summary - 2D only (3D preview removed to prevent WebGL Context Lost) */}
        {/* Uses displayConfig for real-time sync with modal */}
        {selectedPreset && displayConfig && (
          <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            {/* 2D Config Diagram - replaces 3D to prevent multiple WebGL contexts */}
            <div className="h-[80px] mb-2 rounded overflow-hidden bg-[#0d1520] relative flex items-center justify-center">
              <div className="flex items-center gap-3">
                {/* Cam visualization */}
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full border-2 border-orange-400 bg-orange-400/20 flex items-center justify-center">
                    <span className="text-[8px] text-orange-400">CAM</span>
                  </div>
                  <span className="text-[7px] text-gray-500 mt-1">Ø{displayConfig.camDia}</span>
                </div>
                {/* Bolt visualization */}
                <div className="flex flex-col items-center">
                  <div className="w-6 h-8 rounded border-2 border-blue-400 bg-blue-400/20 flex items-center justify-center">
                    <span className="text-[7px] text-blue-400">BOLT</span>
                  </div>
                  <span className="text-[7px] text-gray-500 mt-1">Ø{displayConfig.shaftDia}</span>
                </div>
                {/* Bore visualization (CNC spec: Ø7.5mm bolt bore per Häfele S200) */}
                <div className="flex flex-col items-center">
                  <div className="w-5 h-6 rounded border-2 border-red-400 bg-red-400/20 flex items-center justify-center">
                    <span className="text-[6px] text-red-400">BORE</span>
                  </div>
                  <span className="text-[7px] text-gray-500 mt-1">Ø7.5</span>
                </div>
              </div>
            </div>
            {/* Config Details - CNC spec values for bore, assembly values for others */}
            <div className="text-[9px] text-purple-400 font-medium mb-1">Configuration {liveConfig ? '(Live)' : ''}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[8px]">
              <div className="text-gray-500">Cam: <span className="text-gray-300">Ø{displayConfig.camDia}×{displayConfig.camDepth}mm</span></div>
              <div className="text-gray-500">Bolt: <span className="text-gray-300">Ø{displayConfig.shaftDia}×{displayConfig.shaftLength}mm</span></div>
              <div className="text-gray-500">Bore: <span className="text-gray-300">Ø7.5×24mm</span></div>
              <div className="text-gray-500">Dowel: <span className="text-gray-300">Ø{displayConfig.dowelDia}×{displayConfig.dowelLength}mm</span></div>
            </div>
          </div>
        )}

        {/* Inline config summary (when no preset) - 2D only */}
        {!selectedPreset && displayConfig && (
          <div className="p-2 bg-gray-500/10 border border-gray-500/20 rounded-lg">
            {/* 2D Config Diagram */}
            <div className="h-[80px] mb-2 rounded overflow-hidden bg-[#0d1520] relative flex items-center justify-center">
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full border-2 border-orange-400 bg-orange-400/20 flex items-center justify-center">
                    <span className="text-[8px] text-orange-400">CAM</span>
                  </div>
                  <span className="text-[7px] text-gray-500 mt-1">Ø{displayConfig.camDia}</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-6 h-8 rounded border-2 border-blue-400 bg-blue-400/20 flex items-center justify-center">
                    <span className="text-[7px] text-blue-400">BOLT</span>
                  </div>
                  <span className="text-[7px] text-gray-500 mt-1">Ø{displayConfig.shaftDia}</span>
                </div>
              </div>
            </div>
            <div className="text-[9px] text-gray-400 font-medium mb-1">Custom Configuration {liveConfig ? '(Live)' : ''}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[8px]">
              <div className="text-gray-500">Cam: <span className="text-gray-300">Ø{displayConfig.camDia}×{displayConfig.camDepth}mm</span></div>
              <div className="text-gray-500">Bore: <span className="text-gray-300">Ø7.5×24mm</span></div>
            </div>
          </div>
        )}

        {/* Visualization Toggles */}
        {(selectedPreset || displayConfig) && (
          <div className="flex items-center gap-2 pt-2 border-t border-[#3a4a5a]/50">
            <span className="text-[9px] text-gray-500">View:</span>

            {/* X-Ray Toggle */}
            <VisualizationToggle
              icon={<Crosshair size={11} />}
              label="X-Ray"
              isActive={xRayMode}
              onClick={() => {
                setXRayMode(!xRayMode);
                if (!xRayMode) {
                  // When enabling X-Ray, clear drill map to regenerate
                  clearDrillMap();
                }
              }}
              activeColor="red"
            />

            {/* 3D Hardware Toggle */}
            <VisualizationToggle
              icon={<Box size={11} />}
              label="3D"
              isActive={show3DHardware}
              onClick={() => toggleShow3DHardware()}
              activeColor="yellow"
            />
          </div>
        )}

        {/* Quick stats */}
        {(selectedPreset || displayConfig) && (
          <div className="flex items-center gap-2 text-[9px]">
            <span className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded">
              <Package size={9} className="inline mr-0.5" />
              {selectedPreset ? 'Preset' : 'Custom'}
            </span>
            <span className="text-gray-500">
              Wood: {selectedPreset?.woodThickness || displayConfig?.woodThickness || 18}mm
            </span>
          </div>
        )}
      </div>
    </>
  );
}

export default HardwareConfigSelector;
