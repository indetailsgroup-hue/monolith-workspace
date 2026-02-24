/**
 * DoorConfigPanel - Door Configuration UI
 *
 * Controls for enabling/disabling doors, setting door count,
 * overlay type, and configuring individual door panels.
 *
 * @version 1.0.0 - Initial door system UI
 */

import { useState } from 'react';
import {
  DoorOpen,
  ChevronDown,
  ChevronUp,
  FlipHorizontal,
} from 'lucide-react';
import { useCabinetStore, useCabinet } from '../../core/store/useCabinetStore';
import type {
  DoorOverlayType,
  DoorOpeningDirection,
  DoorPanelConfig,
} from '../../core/types/Cabinet';

// ============================================
// TYPES
// ============================================

interface DoorConfigPanelProps {
  /** Called when door config changes */
  onChange?: () => void;
}

// ============================================
// STYLES
// ============================================

const styles = {
  section: "border-b border-white/5",
  sectionHeader: "w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors",
  sectionTitle: "flex items-center gap-2",
  icon: "w-4 h-4 text-white/40",
  label: "text-xs text-white/80",
  badge: "text-[10px] text-emerald-400",
  content: "px-4 pb-4",
  toggle: "relative w-10 h-5 rounded-full transition-colors cursor-pointer",
  toggleOn: "bg-emerald-500/60",
  toggleOff: "bg-white/10",
  toggleKnob: "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
  select: "w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-white/80 appearance-none cursor-pointer",
  button: "flex items-center gap-1 px-3 py-1.5 text-[10px] uppercase tracking-wider border border-white/10 hover:bg-white/5 transition-colors",
  buttonActive: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
  doorPanel: "p-3 bg-white/[0.02] rounded border border-white/5 mb-2",
  input: "w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 text-center",
};

// ============================================
// SUB-COMPONENTS
// ============================================

interface DoorCountSelectorProps {
  value: 1 | 2;
  onChange: (count: 1 | 2) => void;
}

function DoorCountSelector({ value, onChange }: DoorCountSelectorProps) {
  return (
    <div className="mb-4">
      <label className="block text-[10px] text-white/50 uppercase tracking-wider mb-2">
        Door Count
      </label>
      <div className="flex gap-2">
        <button
          onClick={() => onChange(1)}
          className={`flex-1 px-3 py-2 text-[10px] uppercase tracking-wider border rounded transition-colors ${
            value === 1
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
              : 'border-white/10 text-white/50 hover:bg-white/5'
          }`}
        >
          Single
        </button>
        <button
          onClick={() => onChange(2)}
          className={`flex-1 px-3 py-2 text-[10px] uppercase tracking-wider border rounded transition-colors ${
            value === 2
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
              : 'border-white/10 text-white/50 hover:bg-white/5'
          }`}
        >
          Double
        </button>
      </div>
    </div>
  );
}

interface OverlayTypeSelectorProps {
  value: DoorOverlayType;
  onChange: (type: DoorOverlayType) => void;
}

function OverlayTypeSelector({ value, onChange }: OverlayTypeSelectorProps) {
  return (
    <div className="mb-4">
      <label className="block text-[10px] text-white/50 uppercase tracking-wider mb-2">
        Overlay Type
      </label>
      <div className="flex gap-2">
        <button
          onClick={() => onChange('full')}
          className={`flex-1 px-2 py-2 text-[10px] uppercase tracking-wider border rounded transition-colors ${
            value === 'full'
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
              : 'border-white/10 text-white/50 hover:bg-white/5'
          }`}
        >
          Full
        </button>
        <button
          onClick={() => onChange('half')}
          className={`flex-1 px-2 py-2 text-[10px] uppercase tracking-wider border rounded transition-colors ${
            value === 'half'
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
              : 'border-white/10 text-white/50 hover:bg-white/5'
          }`}
        >
          Half
        </button>
        <button
          onClick={() => onChange('inset')}
          className={`flex-1 px-2 py-2 text-[10px] uppercase tracking-wider border rounded transition-colors ${
            value === 'inset'
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
              : 'border-white/10 text-white/50 hover:bg-white/5'
          }`}
        >
          Inset
        </button>
      </div>
      <p className="text-[9px] text-white/30 mt-1">
        {value === 'full' && 'Door overlays face frame completely (18mm typical)'}
        {value === 'half' && 'Door overlays half the face frame (9mm typical)'}
        {value === 'inset' && 'Door sits inside face frame opening'}
      </p>
    </div>
  );
}

interface DoorPanelEditorProps {
  door: DoorPanelConfig;
  index: number;
  doorCount: number;
  onUpdate: (updates: Partial<DoorPanelConfig>) => void;
}

function DoorPanelEditor({ door, index, doorCount, onUpdate }: DoorPanelEditorProps) {
  const doorLabel = doorCount === 1 ? 'Door' : (index === 0 ? 'Left Door' : 'Right Door');

  return (
    <div className={styles.doorPanel}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-white/60 uppercase tracking-wider">{doorLabel}</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label className="text-[9px] text-white/40 uppercase">Opens</label>
          <div className="flex gap-1 mt-1">
            <button
              onClick={() => onUpdate({ openingDirection: 'left' })}
              className={`flex items-center justify-center w-8 h-8 border rounded transition-colors ${
                door.openingDirection === 'left'
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                  : 'border-white/10 text-white/30 hover:bg-white/5'
              }`}
              title="Opens Left"
            >
              <FlipHorizontal className="w-4 h-4" style={{ transform: 'scaleX(-1)' }} />
            </button>
            <button
              onClick={() => onUpdate({ openingDirection: 'right' })}
              className={`flex items-center justify-center w-8 h-8 border rounded transition-colors ${
                door.openingDirection === 'right'
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                  : 'border-white/10 text-white/30 hover:bg-white/5'
              }`}
              title="Opens Right"
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div>
          <label className="text-[9px] text-white/40 uppercase">Hinges</label>
          <div className="flex items-center gap-1 mt-1">
            <input
              type="number"
              value={door.hingeCount ?? 2}
              onChange={(e) => onUpdate({ hingeCount: Math.max(2, Math.min(5, Number(e.target.value))) })}
              className={styles.input}
              min={2}
              max={5}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function DoorConfigPanel({ onChange }: DoorConfigPanelProps) {
  const cabinet = useCabinet();
  const {
    enableDoors,
    disableDoors,
    setDoorCount,
    updateDoorConfig,
    updateDoorPanel,
  } = useCabinetStore();

  const [isOpen, setIsOpen] = useState(true);

  if (!cabinet) return null;

  const doorConfig = cabinet.structure.doorConfig;
  const hasDoors = doorConfig?.hasDoors ?? false;
  const doorCount = doorConfig?.doorCount ?? 1;
  const overlayType = doorConfig?.doors[0]?.overlayType ?? 'full';
  const doors = doorConfig?.doors ?? [];

  const handleToggle = () => {
    if (hasDoors) {
      disableDoors();
    } else {
      enableDoors(doorCount);
    }
    onChange?.();
  };

  const handleDoorCountChange = (count: 1 | 2) => {
    setDoorCount(count);
    onChange?.();
  };

  const handleOverlayTypeChange = (type: DoorOverlayType) => {
    // Update overlay type for all doors
    doors.forEach((_, index) => {
      updateDoorPanel(index, { overlayType: type });
    });
    onChange?.();
  };

  const handleUpdateDoorPanel = (index: number, updates: Partial<DoorPanelConfig>) => {
    updateDoorPanel(index, updates);
    onChange?.();
  };

  const handleOverlayAmountChange = (amount: number) => {
    updateDoorConfig({ overlayAmount: amount });
    onChange?.();
  };

  const handleDoorGapChange = (gap: number) => {
    updateDoorConfig({ doorGap: gap });
    onChange?.();
  };

  return (
    <div className={styles.section}>
      {/* Section Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={styles.sectionHeader}
      >
        <div className={styles.sectionTitle}>
          <DoorOpen className={styles.icon} />
          <span className={styles.label}>Doors</span>
        </div>
        <div className="flex items-center gap-2">
          {hasDoors && (
            <span className={styles.badge}>
              {doorCount} {doorCount === 1 ? 'door' : 'doors'}
            </span>
          )}
          {isOpen ? (
            <ChevronUp className="w-3 h-3 text-white/30" />
          ) : (
            <ChevronDown className="w-3 h-3 text-white/30" />
          )}
        </div>
      </button>

      {/* Section Content */}
      {isOpen && (
        <div className={styles.content}>
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] text-white/50 uppercase tracking-wider">
              Enable Doors
            </span>
            <button
              onClick={handleToggle}
              className={`${styles.toggle} ${hasDoors ? styles.toggleOn : styles.toggleOff}`}
            >
              <div
                className={styles.toggleKnob}
                style={{ left: hasDoors ? '22px' : '2px' }}
              />
            </button>
          </div>

          {/* Door Configuration (when enabled) */}
          {hasDoors && (
            <>
              {/* Door Count */}
              <DoorCountSelector
                value={doorCount}
                onChange={handleDoorCountChange}
              />

              {/* Overlay Type */}
              <OverlayTypeSelector
                value={overlayType}
                onChange={handleOverlayTypeChange}
              />

              {/* Overlay Amount & Gap */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-[10px] text-white/50 uppercase tracking-wider mb-1">
                    Overlay
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={doorConfig?.overlayAmount ?? 18}
                      onChange={(e) => handleOverlayAmountChange(Number(e.target.value))}
                      className={styles.input}
                      min={0}
                      max={36}
                    />
                    <span className="text-[9px] text-white/30">mm</span>
                  </div>
                </div>
                {doorCount === 2 && (
                  <div>
                    <label className="block text-[10px] text-white/50 uppercase tracking-wider mb-1">
                      Door Gap
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={doorConfig?.doorGap ?? 3}
                        onChange={(e) => handleDoorGapChange(Number(e.target.value))}
                        className={styles.input}
                        min={2}
                        max={10}
                      />
                      <span className="text-[9px] text-white/30">mm</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Door Panels */}
              <div className="mb-4">
                <label className="block text-[10px] text-white/50 uppercase tracking-wider mb-2">
                  Door Configuration
                </label>
                {doors.map((door, index) => (
                  <DoorPanelEditor
                    key={door.id}
                    door={door}
                    index={index}
                    doorCount={doorCount}
                    onUpdate={(updates) => handleUpdateDoorPanel(index, updates)}
                  />
                ))}
              </div>

              {/* Door Info Summary */}
              <div className="p-2 bg-white/[0.02] rounded border border-white/5 text-[10px]">
                <div className="flex justify-between text-white/40">
                  <span>Overlay Type:</span>
                  <span className="text-white/60 capitalize">{overlayType}</span>
                </div>
                <div className="flex justify-between text-white/40">
                  <span>Thickness:</span>
                  <span className="text-white/60">{doorConfig?.doorThickness ?? 18}mm</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default DoorConfigPanel;
