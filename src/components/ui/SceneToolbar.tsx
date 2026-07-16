/**
 * SceneToolbar - Floating toolbar for 3D scene manipulation
 *
 * Features:
 * - Tool selection (Select/Move/Rotate)
 * - Quick 90-degree rotation buttons
 * - Snap toggle
 * - Delete/Duplicate buttons
 * - Keyboard shortcuts display
 */

import React from 'react';
import {
  MousePointer2,
  Move,
  RotateCcw,
  RotateCw,
  Grid3X3,
  Trash2,
  Copy,
  ArrowUpDown,
  Home,
  Link2,
  RefreshCw,
  Box,
  Crosshair,
  CircleDot,
  Scan,
  Wrench,
  Ruler,
  FileText,
  Circle,
} from 'lucide-react';
import { useToolStore, ToolId, TOOL_INFO } from '../../core/store/useToolStore';
import { useCabinetStore } from '../../core/store/useCabinetStore';
import { useDrillMapStore } from '../../core/store/useDrillMapStore';
import { useViewStore } from '../../core/store/useViewStore';

interface ToolButtonProps {
  tool: ToolId;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  hotkey: string;
}

function ToolButton({ tool, icon, isActive, onClick, hotkey }: ToolButtonProps) {
  const info = TOOL_INFO[tool];

  return (
    <button
      onClick={onClick}
      className={`relative p-2 rounded-lg transition-all duration-200 group
        ${isActive
          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
          : 'text-gray-400 hover:text-white hover:bg-surface-3 border border-transparent'
        }`}
      title={`${info.name} (${hotkey})`}
    >
      {icon}
      <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-mono text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
        {hotkey}
      </span>
    </button>
  );
}

interface SceneToolbarProps {
  className?: string;
}

export function SceneToolbar({ className = '' }: SceneToolbarProps) {
  const activeTool = useToolStore((s) => s.activeTool);
  const setTool = useToolStore((s) => s.setTool);
  const snapEnabled = useToolStore((s) => s.options.snap.enabled);
  const setSnapEnabled = useToolStore((s) => s.setSnapEnabled);
  const gridSize = useToolStore((s) => s.options.snap.gridSize);
  const showBoxes = useToolStore((s) => s.showBoxes);
  const toggleBoxes = useToolStore((s) => s.toggleBoxes);
  const boxDrawDistance = useToolStore((s) => s.boxDrawDistance);
  const setBoxDrawDistance = useToolStore((s) => s.setBoxDrawDistance);
  const showSnapPoints = useToolStore((s) => s.showSnapPoints);
  const toggleSnapPoints = useToolStore((s) => s.toggleSnapPoints);

  // Drill map visualization
  const drillMapVisible = useDrillMapStore((s) => s.visible);
  const toggleDrillMap = useDrillMapStore((s) => s.toggleVisible);
  const show3DHardware = useDrillMapStore((s) => s.show3DHardware);
  const toggleShow3DHardware = useDrillMapStore((s) => s.toggleShow3DHardware);
  const showDimensions = useDrillMapStore((s) => s.showDimensions);
  const toggleShowDimensions = useDrillMapStore((s) => s.toggleShowDimensions);
  const showCADView = useDrillMapStore((s) => s.showCADView);
  const toggleShowCADView = useDrillMapStore((s) => s.toggleShowCADView);
  const drillMapPurpose = useDrillMapStore((s) => s.drillMapPurpose);
  const setDrillMapPurpose = useDrillMapStore((s) => s.setDrillMapPurpose);

  // X-Ray mode (Plasticity-style Alt+Z)
  const xRayMode = useViewStore((s) => s.xRayMode);
  const toggleXRay = useViewStore((s) => s.toggleXRay);

  // CSG Boolean drill holes (Ctrl+Shift+H)
  const useCSGHoles = useViewStore((s) => s.useCSGHoles);
  const toggleCSGHoles = useViewStore((s) => s.toggleCSGHoles);

  const activeCabinetId = useCabinetStore((s) => s.activeCabinetId);
  const rotateCabinet90 = useCabinetStore((s) => s.rotateCabinet90);
  const removeCabinet = useCabinetStore((s) => s.removeCabinet);
  const duplicateCabinet = useCabinetStore((s) => s.duplicateCabinet);
  const resetScenePositions = useCabinetStore((s) => s.resetScenePositions);

  const hasCabinet = !!activeCabinetId;

  return (
    <div className={`bg-surface-2/90 backdrop-blur-sm border border-[#333] rounded-xl p-1.5 flex items-center gap-1 ${className}`}>
      {/* Tool Selection */}
      <div className="flex items-center gap-0.5">
        <ToolButton
          tool="select"
          icon={<MousePointer2 size={16} />}
          isActive={activeTool === 'select'}
          onClick={() => setTool('select')}
          hotkey="V"
        />
        <ToolButton
          tool="move"
          icon={<Move size={16} />}
          isActive={activeTool === 'move'}
          onClick={() => setTool('move')}
          hotkey="G"
        />
        <ToolButton
          tool="rotate"
          icon={<ArrowUpDown size={16} className="rotate-45" />}
          isActive={activeTool === 'rotate'}
          onClick={() => setTool('rotate')}
          hotkey="R"
        />
        <ToolButton
          tool="glue"
          icon={<Link2 size={16} />}
          isActive={activeTool === 'glue'}
          onClick={() => setTool('glue')}
          hotkey="⇧G"
        />
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-[#333] mx-1" />

      {/* Quick Rotation (only when cabinet selected) */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => hasCabinet && rotateCabinet90(activeCabinetId!, 'ccw')}
          disabled={!hasCabinet}
          className={`p-2 rounded-lg transition-all duration-200
            ${hasCabinet
              ? 'text-gray-400 hover:text-white hover:bg-surface-3'
              : 'text-gray-600 cursor-not-allowed'
            }`}
          title="Rotate 90° CCW"
        >
          <RotateCcw size={16} />
        </button>
        <button
          onClick={() => hasCabinet && rotateCabinet90(activeCabinetId!, 'cw')}
          disabled={!hasCabinet}
          className={`p-2 rounded-lg transition-all duration-200
            ${hasCabinet
              ? 'text-gray-400 hover:text-white hover:bg-surface-3'
              : 'text-gray-600 cursor-not-allowed'
            }`}
          title="Rotate 90° CW"
        >
          <RotateCw size={16} />
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-[#333] mx-1" />

      {/* Snap Toggle */}
      <button
        onClick={() => setSnapEnabled(!snapEnabled)}
        className={`p-2 rounded-lg transition-all duration-200
          ${snapEnabled
            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            : 'text-gray-400 hover:text-white hover:bg-surface-3 border border-transparent'
          }`}
        title={`Snap ${snapEnabled ? 'ON' : 'OFF'} (Shift+S) | Grid: ${gridSize}mm ([/] to adjust)`}
      >
        <Grid3X3 size={16} />
      </button>

      {/* Grid Size Display (when snap enabled) */}
      {snapEnabled && (
        <span className="text-[10px] text-blue-400/80 font-mono" title="Grid size ([/] to adjust, Shift for ±50)">
          {gridSize}mm
        </span>
      )}

      {/* Box3 Toggle (Alt+B - B reserved for Fillet in Plasticity) */}
      <button
        onClick={toggleBoxes}
        className={`p-2 rounded-lg transition-all duration-200
          ${showBoxes
            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
            : 'text-gray-400 hover:text-white hover:bg-surface-3 border border-transparent'
          }`}
        title={`Box3 Outlines ${showBoxes ? 'ON' : 'OFF'} (Alt+B)`}
      >
        <Box size={16} />
      </button>

      {/* Snap Points Toggle (Alt+P - P reserved for Pipe in Plasticity) */}
      <button
        onClick={toggleSnapPoints}
        className={`p-2 rounded-lg transition-all duration-200
          ${showSnapPoints
            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            : 'text-gray-400 hover:text-white hover:bg-surface-3 border border-transparent'
          }`}
        title={`Snap Point Glyphs ${showSnapPoints ? 'ON' : 'OFF'} (Alt+P)`}
      >
        <Crosshair size={16} />
      </button>

      {/* X-Ray Mode Toggle (Shows drilling patterns) */}
      <button
        onClick={toggleXRay}
        className={`p-2 rounded-lg transition-all duration-200
          ${xRayMode
            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
            : 'text-gray-400 hover:text-white hover:bg-surface-3 border border-transparent'
          }`}
        title={`X-Ray Mode ${xRayMode ? 'ON' : 'OFF'} (X) - Shows Minifix drilling patterns`}
      >
        <Scan size={16} />
      </button>

      {/* X-Ray Sub-controls: Show when X-ray is active */}
      {xRayMode && (
        <div className="flex items-center gap-1 ml-1 px-2 py-1 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
          {/* Hardware Toggle - prominent in X-ray mode */}
          <button
            onClick={toggleShow3DHardware}
            className={`p-1.5 rounded-md transition-all duration-200 flex items-center gap-1.5
              ${show3DHardware
                ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                : 'bg-surface-3 text-gray-400 border border-transparent hover:text-cyan-300'
              }`}
            title={`Minifix Hardware ${show3DHardware ? 'VISIBLE' : 'HIDDEN'} - Toggle to see only drill holes`}
          >
            <Wrench size={14} />
            <span className="text-[10px] font-medium">
              {show3DHardware ? 'Minifix' : 'Holes Only'}
            </span>
          </button>

          {/* Dimensions Toggle - CAD-style dimension lines */}
          <button
            onClick={toggleShowDimensions}
            className={`p-1.5 rounded-md transition-all duration-200 flex items-center gap-1.5
              ${showDimensions
                ? 'bg-blue-500/30 text-blue-300 border border-blue-500/40'
                : 'bg-surface-3 text-gray-400 border border-transparent hover:text-cyan-300'
              }`}
            title={`Dimension Lines ${showDimensions ? 'VISIBLE' : 'HIDDEN'} - Toggle CAD-style dimension labels`}
          >
            <Ruler size={14} />
            <span className="text-[10px] font-medium">
              {showDimensions ? 'Dimensions' : 'No Dims'}
            </span>
          </button>

          {/* CAD View Toggle - 2D technical drawing overlay */}
          <button
            onClick={toggleShowCADView}
            className={`p-1.5 rounded-md transition-all duration-200 flex items-center gap-1.5
              ${showCADView
                ? 'bg-pink-500/30 text-pink-300 border border-pink-500/40'
                : 'bg-surface-3 text-gray-400 border border-transparent hover:text-cyan-300'
              }`}
            title={`CAD View ${showCADView ? 'VISIBLE' : 'HIDDEN'} - 2D technical drill map drawing`}
          >
            <FileText size={14} />
            <span className="text-[10px] font-medium">
              {showCADView ? 'CAD View' : '2D CAD'}
            </span>
          </button>

          {/* CSG Boolean Drill Holes Toggle */}
          <button
            onClick={toggleCSGHoles}
            className={`p-1.5 rounded-md transition-all duration-200 flex items-center gap-1.5
              ${useCSGHoles
                ? 'bg-yellow-500/30 text-yellow-300 border border-yellow-500/40'
                : 'bg-surface-3 text-gray-400 border border-transparent hover:text-cyan-300'
              }`}
            title={`Boolean Holes ${useCSGHoles ? 'ON' : 'OFF'} (Ctrl+Shift+H) - True geometry subtraction`}
          >
            <Circle size={14} />
            <span className="text-[10px] font-medium">
              {useCSGHoles ? 'Boolean' : 'Overlay'}
            </span>
          </button>

          {/* Drill purpose filter buttons (X-Ray quick isolate) */}
          <div className="mx-1 h-5 w-px bg-cyan-500/20" />
          {[
            { label: 'ALL', value: null as string | null },
            { label: 'CAM', value: 'CAM' as string | null },
            { label: 'BOLT', value: 'BOLT' as string | null },
            { label: '\u00D85', value: '\u00D85' as string | null },
          ].map(({ label, value }) => {
            const isActive = (drillMapPurpose ?? null) === value;
            return (
              <button
                key={label}
                onClick={() => setDrillMapPurpose(value)}
                className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-200 border
                  ${isActive
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/60'
                    : 'bg-surface-3 text-gray-300 border-transparent hover:text-cyan-200 hover:border-cyan-500/20'
                  }`}
                title={`Filter drill map: ${label}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Drill Map Toggle (Manufacturing visualization) */}
      <button
        onClick={toggleDrillMap}
        className={`p-2 rounded-lg transition-all duration-200
          ${drillMapVisible
            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            : 'text-gray-400 hover:text-white hover:bg-surface-3 border border-transparent'
          }`}
        title={`Drill Map ${drillMapVisible ? 'ON' : 'OFF'} (Alt+O)`}
      >
        <CircleDot size={16} />
      </button>

      {/* 3D Hardware Toggle (Minifix cams, dowels, bolts) - shown when NOT in X-ray mode */}
      {!xRayMode && (
        <button
          onClick={toggleShow3DHardware}
          className={`p-2 rounded-lg transition-all duration-200
            ${show3DHardware
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'text-gray-400 hover:text-white hover:bg-surface-3 border border-transparent'
            }`}
          title={`3D Hardware ${show3DHardware ? 'ON' : 'OFF'} - Show Minifix cams, dowels, bolts`}
        >
          <Wrench size={16} />
        </button>
      )}

      {/* Box3 Distance Controls (only show when boxes enabled) */}
      {showBoxes && (
        <div className="flex items-center gap-1.5 ml-1">
          {/* Slider */}
          <input
            type="range"
            min={0}
            max={6000}
            step={100}
            value={boxDrawDistance}
            onChange={(e) => setBoxDrawDistance(Number(e.target.value))}
            className="w-16 h-1 bg-surface-3 rounded-full appearance-none cursor-pointer accent-purple-500"
            title={`Range: ${boxDrawDistance === 0 ? '∞' : `${boxDrawDistance}mm`}`}
          />

          {/* Number Input */}
          <input
            type="number"
            min={0}
            max={10000}
            step={100}
            value={boxDrawDistance}
            onChange={(e) => setBoxDrawDistance(Number(e.target.value))}
            className="w-14 bg-surface-3 text-gray-300 text-xs px-1.5 py-0.5 rounded border border-[#333] focus:outline-none focus:border-purple-500/50 text-center"
            title="Box3 draw distance (mm)"
          />

          {/* Presets */}
          <div className="flex items-center gap-0.5">
            {[
              { value: 0, label: '∞', hotkey: '0' },
              { value: 1000, label: '1m', hotkey: '1' },
              { value: 2000, label: '2m', hotkey: '2' },
              { value: 3000, label: '3m', hotkey: '3' },
            ].map((preset) => (
              <button
                key={preset.value}
                onClick={() => setBoxDrawDistance(preset.value)}
                className={`px-1.5 py-0.5 text-[10px] rounded transition-all duration-150
                  ${boxDrawDistance === preset.value
                    ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-surface-3 border border-transparent'
                  }`}
                title={`${preset.label} (${preset.hotkey})`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Separator */}
      <div className="w-px h-6 bg-[#333] mx-1" />

      {/* Cabinet Actions */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => hasCabinet && duplicateCabinet(activeCabinetId!)}
          disabled={!hasCabinet}
          className={`p-2 rounded-lg transition-all duration-200
            ${hasCabinet
              ? 'text-gray-400 hover:text-blue-400 hover:bg-blue-500/10'
              : 'text-gray-600 cursor-not-allowed'
            }`}
          title="Duplicate (Shift+D or Ctrl+D)"
        >
          <Copy size={16} />
        </button>
        <button
          onClick={() => hasCabinet && removeCabinet(activeCabinetId!)}
          disabled={!hasCabinet}
          className={`p-2 rounded-lg transition-all duration-200
            ${hasCabinet
              ? 'text-gray-400 hover:text-red-400 hover:bg-red-500/10'
              : 'text-gray-600 cursor-not-allowed'
            }`}
          title="Delete (Del)"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-[#333] mx-1" />

      {/* Reset Scene */}
      <button
        onClick={resetScenePositions}
        className="p-2 rounded-lg transition-all duration-200 text-gray-400 hover:text-orange-400 hover:bg-orange-500/10"
        title="Reset Scene Positions (Home)"
      >
        <Home size={16} />
      </button>

      {/* Clear All Data (Debug) */}
      <button
        onClick={() => {
          if (window.confirm('ลบข้อมูลทั้งหมดและเริ่มใหม่?\n\nClear all data and restart?')) {
            localStorage.removeItem('monolith-current-project');
            localStorage.removeItem('monolith-projects-list');
            window.location.reload();
          }
        }}
        className="p-2 rounded-lg transition-all duration-200 text-gray-400 hover:text-red-400 hover:bg-red-500/10"
        title="Clear All Data & Restart"
      >
        <RefreshCw size={16} />
      </button>
    </div>
  );
}

export default SceneToolbar;
