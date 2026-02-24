/**
 * DrawerConfigPanel - Drawer Configuration UI
 *
 * Controls for enabling/disabling drawers, setting slide type,
 * and managing drawer rows (add, remove, adjust heights).
 *
 * @version 1.0.0 - Initial drawer system UI
 */

import { useState } from 'react';
import {
  LayoutPanelLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from 'lucide-react';
import { useCabinetStore, useCabinet } from '../../core/store/useCabinetStore';
import type { DrawerSlideType, DrawerRowConfig } from '../../core/types/Cabinet';

// ============================================
// TYPES
// ============================================

interface DrawerConfigPanelProps {
  /** Called when drawer config changes */
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
  drawerRow: "flex items-center gap-2 p-2 bg-white/[0.02] rounded border border-white/5 mb-2",
  input: "w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/80 text-center",
  deleteBtn: "p-1 text-white/30 hover:text-red-400 transition-colors",
};

// ============================================
// SUB-COMPONENTS
// ============================================

interface SlideTypeSelectorProps {
  value: DrawerSlideType;
  onChange: (type: DrawerSlideType) => void;
}

function SlideTypeSelector({ value, onChange }: SlideTypeSelectorProps) {
  return (
    <div className="mb-4">
      <label className="block text-[10px] text-white/50 uppercase tracking-wider mb-2">
        Slide Type
      </label>
      <div className="flex gap-2">
        <button
          onClick={() => onChange('undermount')}
          className={`flex-1 px-3 py-2 text-[10px] uppercase tracking-wider border rounded transition-colors ${
            value === 'undermount'
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
              : 'border-white/10 text-white/50 hover:bg-white/5'
          }`}
        >
          Undermount
        </button>
        <button
          onClick={() => onChange('side_mount')}
          className={`flex-1 px-3 py-2 text-[10px] uppercase tracking-wider border rounded transition-colors ${
            value === 'side_mount'
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
              : 'border-white/10 text-white/50 hover:bg-white/5'
          }`}
        >
          Side Mount
        </button>
      </div>
      <p className="text-[9px] text-white/30 mt-1">
        {value === 'undermount'
          ? 'Hidden slides beneath drawer box (20.5mm clearance/side)'
          : 'Side-mounted slides (12.5mm clearance/side)'}
      </p>
    </div>
  );
}

interface DrawerRowEditorProps {
  row: DrawerRowConfig;
  index: number;
  onUpdate: (updates: Partial<DrawerRowConfig>) => void;
  onDelete: () => void;
}

function DrawerRowEditor({ row, index, onUpdate, onDelete }: DrawerRowEditorProps) {
  return (
    <div className={styles.drawerRow}>
      <GripVertical className="w-3 h-3 text-white/20 cursor-grab" />

      <div className="flex-1">
        <div className="flex items-center gap-4">
          <div>
            <label className="text-[9px] text-white/40 uppercase">Height</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={row.frontHeight}
                onChange={(e) => onUpdate({ frontHeight: Number(e.target.value) })}
                className={styles.input}
                min={60}
                max={400}
              />
              <span className="text-[9px] text-white/30">mm</span>
            </div>
          </div>

          <div>
            <label className="text-[9px] text-white/40 uppercase">Gap Above</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={row.gapAbove}
                onChange={(e) => onUpdate({ gapAbove: Number(e.target.value) })}
                className={styles.input}
                min={2}
                max={20}
              />
              <span className="text-[9px] text-white/30">mm</span>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onDelete}
        className={styles.deleteBtn}
        title="Remove drawer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function DrawerConfigPanel({ onChange }: DrawerConfigPanelProps) {
  const cabinet = useCabinet();
  const {
    enableDrawers,
    disableDrawers,
    addDrawerRow,
    removeDrawerRow,
    updateDrawerRow,
  } = useCabinetStore();

  const [isOpen, setIsOpen] = useState(true);

  if (!cabinet) return null;

  const drawerConfig = cabinet.structure.drawerConfig;
  const hasDrawers = drawerConfig?.hasDrawers ?? false;
  const slideType = drawerConfig?.slideType ?? 'undermount';
  const rows = drawerConfig?.rows ?? [];

  // Calculate total drawer stack height
  const totalHeight = rows.reduce((sum, row) => sum + row.frontHeight + row.gapAbove, 0);
  const availableHeight = cabinet.dimensions.height - cabinet.dimensions.toeKickHeight - 36; // Approximate usable height

  const handleToggle = () => {
    if (hasDrawers) {
      disableDrawers();
    } else {
      enableDrawers(slideType);
    }
    onChange?.();
  };

  const handleSlideTypeChange = (type: DrawerSlideType) => {
    if (hasDrawers) {
      enableDrawers(type);
    }
    onChange?.();
  };

  const handleAddRow = () => {
    addDrawerRow();
    onChange?.();
  };

  const handleRemoveRow = (index: number) => {
    removeDrawerRow(index);
    onChange?.();
  };

  const handleUpdateRow = (index: number, updates: Partial<DrawerRowConfig>) => {
    updateDrawerRow(index, updates);
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
          <LayoutPanelLeft className={styles.icon} />
          <span className={styles.label}>Drawers</span>
        </div>
        <div className="flex items-center gap-2">
          {hasDrawers && (
            <span className={styles.badge}>{rows.length} rows</span>
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
              Enable Drawers
            </span>
            <button
              onClick={handleToggle}
              className={`${styles.toggle} ${hasDrawers ? styles.toggleOn : styles.toggleOff}`}
            >
              <div
                className={styles.toggleKnob}
                style={{ left: hasDrawers ? '22px' : '2px' }}
              />
            </button>
          </div>

          {/* Drawer Configuration (when enabled) */}
          {hasDrawers && (
            <>
              {/* Slide Type */}
              <SlideTypeSelector
                value={slideType}
                onChange={handleSlideTypeChange}
              />

              {/* Drawer Rows */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] text-white/50 uppercase tracking-wider">
                    Drawer Rows
                  </label>
                  <button
                    onClick={handleAddRow}
                    className={styles.button}
                    title="Add drawer row"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                </div>

                {rows.length === 0 ? (
                  <div className="text-center py-4 text-[10px] text-white/30 border border-dashed border-white/10 rounded">
                    No drawers added yet
                  </div>
                ) : (
                  <div>
                    {rows.map((row, index) => (
                      <DrawerRowEditor
                        key={row.id}
                        row={row}
                        index={index}
                        onUpdate={(updates) => handleUpdateRow(index, updates)}
                        onDelete={() => handleRemoveRow(index)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Height Summary */}
              <div className="p-2 bg-white/[0.02] rounded border border-white/5 text-[10px]">
                <div className="flex justify-between text-white/40">
                  <span>Stack Height:</span>
                  <span className={totalHeight > availableHeight ? 'text-red-400' : 'text-white/60'}>
                    {totalHeight.toFixed(0)}mm
                  </span>
                </div>
                <div className="flex justify-between text-white/40">
                  <span>Available:</span>
                  <span className="text-white/60">~{availableHeight.toFixed(0)}mm</span>
                </div>
                {totalHeight > availableHeight && (
                  <p className="text-red-400 mt-1 text-[9px]">
                    Stack exceeds available height
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default DrawerConfigPanel;
