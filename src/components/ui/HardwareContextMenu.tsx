/**
 * HardwareContextMenu - v1.4
 *
 * Right-click context menu for Minifix 3D hardware rotation AND position control.
 * Allows users to flip, rotate, move, and save overrides as defaults.
 *
 * Features:
 * - Draggable header (grab and move the menu)
 * - Flip and fine rotation controls
 * - Move hardware position controls (X/Y/Z) with DYNAMIC AABB-based clamping
 * - Save as default or per-point override
 *
 * Theme: Uses surface-* design tokens and border-[#333] to match
 * ParametricContractPanel and PanelConfigModal.
 *
 * Position clamping is now dynamic based on cabinet bounds (not fixed ±20mm).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDrillMapStore, selectHardwareContextMenu, type PositionAxis } from '../../core/store/useDrillMapStore';
import type { CornerType, RotationOverride, PositionOverride, Vec3Tuple } from '../../core/manufacturing/drillMap/types';
import type { ClampRanges } from '../../core/manufacturing/drillMap/cabinetBounds';
import {
  FlipVertical,
  FlipHorizontal,
  RotateCcw,
  RotateCw,
  Save,
  Pin,
  Undo2,
  X,
  Wrench,
  Move,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  MoveHorizontal,
  MoveVertical,
} from 'lucide-react';

// ============================================
// TYPES
// ============================================

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
}

interface RotationButtonsProps {
  axis: 'X' | 'Y' | 'Z';
  onMinus: () => void;
  onPlus: () => void;
}

interface PositionButtonsProps {
  axis: 'X' | 'Y' | 'Z';
  label: string;
  value: number;
  range?: [number, number];  // Dynamic clamp range [min, max]
  onNudge: (delta: number) => void;
  onChange: (value: number) => void;
}

// ============================================
// SUB-COMPONENTS
// ============================================

function MenuItem({ icon, label, shortcut, onClick, danger }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs
        hover:bg-surface-3 transition-all duration-200 rounded
        ${danger ? 'text-red-400 hover:text-red-300' : 'text-gray-400 hover:text-white'}
      `}
    >
      <span className="w-4 h-4 flex items-center justify-center opacity-70">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-[10px] text-gray-600 bg-surface-3 px-1 rounded">
          {shortcut}
        </span>
      )}
    </button>
  );
}

function RotationButtons({ axis, onMinus, onPlus }: RotationButtonsProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1">
      <span className="text-[10px] text-gray-500 w-10">Rot {axis}:</span>
      <button
        onClick={onMinus}
        className="px-2 py-0.5 text-[10px] bg-surface-2 hover:bg-surface-3 text-white rounded border border-[#333] transition-all duration-200"
        title={`Rotate ${axis} -15°`}
      >
        <RotateCcw size={10} className="inline mr-0.5" />
        -15°
      </button>
      <button
        onClick={onPlus}
        className="px-2 py-0.5 text-[10px] bg-surface-2 hover:bg-surface-3 text-white rounded border border-[#333] transition-all duration-200"
        title={`Rotate ${axis} +15°`}
      >
        <RotateCw size={10} className="inline mr-0.5" />
        +15°
      </button>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-[#333] my-1 mx-2" />;
}

const POSITION_STEPS = [0.5, 1, 5];

function PositionButtons({ axis, label, value, range, onNudge, onChange }: PositionButtonsProps) {
  // Format range for tooltip
  const rangeStr = range ? `[${range[0].toFixed(0)}, ${range[1].toFixed(0)}]` : '[-∞, +∞]';

  return (
    <div className="flex items-center gap-1 px-3 py-1">
      <span className="text-[10px] text-gray-500 w-12" title={`Range: ${rangeStr}`}>{label}:</span>
      <div className="flex gap-0.5">
        {POSITION_STEPS.map((step) => (
          <button
            key={`minus-${step}`}
            onClick={() => onNudge(-step)}
            className="px-1 py-0.5 text-[9px] bg-surface-2 hover:bg-surface-3 text-white rounded border border-[#333] transition-all duration-200"
            title={`Move ${axis} -${step}mm (range: ${rangeStr})`}
          >
            -{step}
          </button>
        ))}
      </div>
      <input
        type="number"
        value={value.toFixed(1)}
        step={0.1}
        min={range?.[0]}
        max={range?.[1]}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-12 px-1.5 py-0.5 text-[9px] bg-surface-2 border border-[#333] rounded-lg text-center text-white font-mono focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/20 transition-all duration-200"
        title={`Range: ${rangeStr}`}
      />
      <div className="flex gap-0.5">
        {POSITION_STEPS.map((step) => (
          <button
            key={`plus-${step}`}
            onClick={() => onNudge(step)}
            className="px-1 py-0.5 text-[9px] bg-surface-2 hover:bg-surface-3 text-white rounded border border-[#333] transition-all duration-200"
            title={`Move ${axis} +${step}mm (range: ${rangeStr})`}
          >
            +{step}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function HardwareContextMenu() {
  const menuRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; menuX: number; menuY: number } | null>(null);

  // Store selectors
  const contextMenu = useDrillMapStore(selectHardwareContextMenu);
  const closeMenu = useDrillMapStore((s) => s.closeHardwareContextMenu);
  const applyRotation = useDrillMapStore((s) => s.applyRotationToPoint);
  const clearRotationOverride = useDrillMapStore((s) => s.clearPointRotationOverride);
  const setRotationDefault = useDrillMapStore((s) => s.setRotationDefault);

  // Position actions
  const nudgePosition = useDrillMapStore((s) => s.nudgePosition);
  const setPositionAxis = useDrillMapStore((s) => s.setPositionAxis);
  const clearPositionOverride = useDrillMapStore((s) => s.clearPointPositionOverride);
  const setPositionDefault = useDrillMapStore((s) => s.setPositionDefault);
  const getClampRanges = useDrillMapStore((s) => s.getClampRangesForPoint);

  const { isOpen, position, pointId, cornerType, currentRotation, currentPosition, baseWorldPos } = contextMenu;

  // Flip state indicators — show active state in menu
  const flipXStateByPointId = useDrillMapStore((s) => s.flipXStateByPointId);
  const isFlippedV = pointId ? (flipXStateByPointId[pointId] ?? false) : false;
  const isFlippedH = currentRotation ? Math.abs(currentRotation.rotY) >= Math.PI / 2 : false;

  // Compute dynamic clamp ranges based on cabinet bounds
  const clampRanges: ClampRanges | null = useMemo(() => {
    if (!baseWorldPos) return null;
    return getClampRanges(baseWorldPos);
  }, [baseWorldPos, getClampRanges]);

  // Reset drag offset when menu opens at a new position
  useEffect(() => {
    if (isOpen) {
      setDragOffset({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [isOpen, position.x, position.y]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      menuX: dragOffset.x,
      menuY: dragOffset.y,
    };
  }, [dragOffset]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      setDragOffset({
        x: dragStartRef.current.menuX + deltaX,
        y: dragStartRef.current.menuY + deltaY,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      // Don't close if we're dragging
      if (isDragging) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'Escape':
          closeMenu();
          break;
        case 'v':
        case 'V':
          e.preventDefault();
          if (pointId) applyRotation(pointId, 'flipX');
          break;
        case 'h':
        case 'H':
          e.preventDefault();
          if (pointId) applyRotation(pointId, 'flipY');
          break;
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeMenu, isDragging, pointId, applyRotation]);

  // Handlers
  const handleFlipX = useCallback(() => {
    if (pointId) {
      applyRotation(pointId, 'flipX');
    }
  }, [pointId, applyRotation]);

  const handleFlipY = useCallback(() => {
    if (pointId) {
      applyRotation(pointId, 'flipY');
    }
  }, [pointId, applyRotation]);

  const handleRotate = useCallback((action: 'rotX+' | 'rotX-' | 'rotY+' | 'rotY-' | 'rotZ+' | 'rotZ-') => {
    if (pointId) {
      applyRotation(pointId, action);
    }
  }, [pointId, applyRotation]);

  const handleSetRotationDefault = useCallback(() => {
    if (cornerType && currentRotation) {
      setRotationDefault(cornerType, currentRotation);
    }
  }, [cornerType, currentRotation, setRotationDefault]);

  const handleResetRotation = useCallback(() => {
    if (pointId) {
      clearRotationOverride(pointId);
    }
  }, [pointId, clearRotationOverride]);

  // Position handlers (pass baseWorldPos for dynamic clamping)
  const handleNudgePosition = useCallback((axis: PositionAxis, delta: number) => {
    if (pointId) {
      nudgePosition(pointId, axis, delta, baseWorldPos ?? undefined);
    }
  }, [pointId, nudgePosition, baseWorldPos]);

  const handleSetPositionAxis = useCallback((axis: PositionAxis, value: number) => {
    if (pointId) {
      setPositionAxis(pointId, axis, value, baseWorldPos ?? undefined);
    }
  }, [pointId, setPositionAxis, baseWorldPos]);

  const handleSetPositionDefault = useCallback(() => {
    if (cornerType && currentPosition) {
      setPositionDefault(cornerType, currentPosition);
    }
  }, [cornerType, currentPosition, setPositionDefault]);

  const handleResetPosition = useCallback(() => {
    if (pointId) {
      clearPositionOverride(pointId);
    }
  }, [pointId, clearPositionOverride]);

  const handleResetAll = useCallback(() => {
    if (pointId) {
      clearRotationOverride(pointId);
      clearPositionOverride(pointId);
      closeMenu();
    }
  }, [pointId, clearRotationOverride, clearPositionOverride, closeMenu]);

  // Reset ALL corner defaults (fixes Z-alignment issues from incorrect saved rotations)
  const resetAllDefaults = useDrillMapStore((s) => s.resetAllDefaults);
  const handleResetAllDefaults = useCallback(() => {
    resetAllDefaults();
    closeMenu();
  }, [resetAllDefaults, closeMenu]);

  if (!isOpen || !pointId) return null;

  // Calculate menu position (ensure it stays within viewport)
  const menuWidth = 280;
  const menuHeight = 520;
  const baseX = Math.min(position.x, window.innerWidth - menuWidth - 10);
  const baseY = Math.min(position.y, window.innerHeight - menuHeight - 10);

  // Apply drag offset
  const x = baseX + dragOffset.x;
  const y = baseY + dragOffset.y;

  const cornerLabel = cornerType
    ? (cornerType === 'BACK_LEFT' || cornerType === 'BACK_RIGHT')
      ? 'Side ' + cornerType.replace('_', ' ')
      : cornerType.replace('_', ' ')
    : 'Unknown';

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-surface-1 border border-[#333] rounded-lg shadow-xl overflow-hidden"
      style={{
        left: x,
        top: y,
        width: menuWidth,
      }}
    >
      {/* Header - Draggable */}
      <div
        onMouseDown={handleDragStart}
        className="flex items-center justify-between px-3 py-2 border-b border-[#333] select-none hover:bg-surface-3 transition-all duration-200"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        title="Drag to move"
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <Wrench size={12} className="text-purple-400" />
          <span className="text-xs font-medium text-white">Minifix Transform</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            closeMenu();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="text-gray-500 hover:text-white transition-colors"
          style={{ cursor: 'pointer' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Corner Info */}
      <div className="px-3 py-1.5 text-[10px] text-gray-500 border-b border-[#333]">
        Corner: <span className="text-cyan-400">{cornerLabel}</span>
      </div>

      {/* Flip Actions — active state shown with colored dot */}
      <div className="py-1">
        <button
          onClick={handleFlipX}
          className={`
            w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs
            hover:bg-surface-3 transition-all duration-200 rounded
            ${isFlippedV ? 'text-orange-400' : 'text-gray-400 hover:text-white'}
          `}
        >
          <span className="w-4 h-4 flex items-center justify-center opacity-70">
            <FlipVertical size={14} />
          </span>
          <span className="flex-1">Vertical Flip</span>
          {isFlippedV && <span className="w-2 h-2 rounded-full bg-orange-400" title="Active" />}
          <span className="text-[10px] text-gray-600 bg-surface-3 px-1 rounded">V</span>
        </button>
        <button
          onClick={handleFlipY}
          className={`
            w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs
            hover:bg-surface-3 transition-all duration-200 rounded
            ${isFlippedH ? 'text-orange-400' : 'text-gray-400 hover:text-white'}
          `}
        >
          <span className="w-4 h-4 flex items-center justify-center opacity-70">
            <FlipHorizontal size={14} />
          </span>
          <span className="flex-1">Horizontal Flip</span>
          {isFlippedH && <span className="w-2 h-2 rounded-full bg-orange-400" title="Active" />}
          <span className="text-[10px] text-gray-600 bg-surface-3 px-1 rounded">H</span>
        </button>
      </div>

      <Divider />

      {/* Fine Rotation */}
      <div className="py-1">
        <div className="px-3 py-1 text-[10px] text-gray-500 font-medium">
          Fine Rotation
        </div>
        <RotationButtons
          axis="X"
          onMinus={() => handleRotate('rotX-')}
          onPlus={() => handleRotate('rotX+')}
        />
        <RotationButtons
          axis="Y"
          onMinus={() => handleRotate('rotY-')}
          onPlus={() => handleRotate('rotY+')}
        />
        <RotationButtons
          axis="Z"
          onMinus={() => handleRotate('rotZ-')}
          onPlus={() => handleRotate('rotZ+')}
        />
      </div>

      <Divider />

      {/* Move Hardware (Position Offset) */}
      <div className="py-1">
        <div className="px-3 py-1 text-[10px] text-gray-500 font-medium flex items-center gap-1">
          <Move size={10} />
          Move Hardware
        </div>
        <PositionButtons
          axis="X"
          label="X (L/R)"
          value={currentPosition?.dx ?? 0}
          range={clampRanges?.x}
          onNudge={(delta) => handleNudgePosition('dx', delta)}
          onChange={(value) => handleSetPositionAxis('dx', value)}
        />
        <PositionButtons
          axis="Y"
          label="Y (U/D)"
          value={currentPosition?.dy ?? 0}
          range={clampRanges?.y}
          onNudge={(delta) => handleNudgePosition('dy', delta)}
          onChange={(value) => handleSetPositionAxis('dy', value)}
        />
        <PositionButtons
          axis="Z"
          label="Z (F/B)"
          value={currentPosition?.dz ?? 0}
          range={clampRanges?.z}
          onNudge={(delta) => handleNudgePosition('dz', delta)}
          onChange={(value) => handleSetPositionAxis('dz', value)}
        />
        <div className="px-3 py-0.5 text-[8px] text-gray-600">
          {clampRanges ? (
            <>Clamped to cabinet bounds</>
          ) : (
            <>mm (no bounds set)</>
          )}
        </div>
      </div>

      <Divider />

      {/* Save Options */}
      <div className="py-1">
        <div className="px-3 py-1 text-[10px] text-gray-500 font-medium">
          Save Options
        </div>
        <MenuItem
          icon={<Save size={14} />}
          label="Set Rotation as Default"
          onClick={handleSetRotationDefault}
        />
        <MenuItem
          icon={<Save size={14} />}
          label="Set Position as Default"
          onClick={handleSetPositionDefault}
        />
        <MenuItem
          icon={<Pin size={14} />}
          label="Apply to This Point Only"
          onClick={closeMenu}
        />
      </div>

      <Divider />

      {/* Reset Options */}
      <div className="py-1">
        <MenuItem
          icon={<Undo2 size={14} />}
          label="Reset Rotation"
          onClick={handleResetRotation}
        />
        <MenuItem
          icon={<Undo2 size={14} />}
          label="Reset Position"
          onClick={handleResetPosition}
        />
        <MenuItem
          icon={<Undo2 size={14} />}
          label="Reset All to Calculated"
          onClick={handleResetAll}
          danger
        />
        <MenuItem
          icon={<Undo2 size={14} />}
          label="Reset ALL Corner Defaults"
          onClick={handleResetAllDefaults}
          danger
        />
      </div>

      {/* Current Values Display */}
      <div className="border-t border-[#333]" />
      <div className="px-3 py-2 text-[9px] font-mono text-gray-500 bg-surface-2 grid grid-cols-2 gap-x-4">
        {/* Rotation */}
        <div>
          <div className="text-[8px] text-purple-400 mb-0.5">Rotation</div>
          <div>rotX: {currentRotation ? (currentRotation.rotX * 180 / Math.PI).toFixed(1) : '0.0'}°</div>
          <div>rotY: {currentRotation ? (currentRotation.rotY * 180 / Math.PI).toFixed(1) : '0.0'}°</div>
          <div>rotZ: {currentRotation ? (currentRotation.rotZ * 180 / Math.PI).toFixed(1) : '0.0'}°</div>
        </div>
        {/* Position */}
        <div>
          <div className="text-[8px] text-cyan-400 mb-0.5">Position (mm)</div>
          <div>dX: {(currentPosition?.dx ?? 0).toFixed(1)}</div>
          <div>dY: {(currentPosition?.dy ?? 0).toFixed(1)}</div>
          <div>dZ: {(currentPosition?.dz ?? 0).toFixed(1)}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default HardwareContextMenu;
