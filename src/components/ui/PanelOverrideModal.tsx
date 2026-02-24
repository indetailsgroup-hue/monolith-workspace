/**
 * PanelConfigModal - Per-Panel Material Override
 * 
 * Allows users to override materials for individual panels:
 * - Core material
 * - Surface A/B materials
 * - Edge banding per side (Top/Bottom/Left/Right)
 * - Draggable/Movable modal
 */

import React, { useState, useEffect, useRef } from 'react';
import { useCabinetStore, useCabinet } from '../../core/store/useCabinetStore';
import { DEFAULT_POSITION_OVERRIDES } from '../../core/types/Cabinet';

interface PanelConfigModalProps {
  panelId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PanelConfigModal({ panelId, isOpen, onClose }: PanelConfigModalProps) {
  const cabinet = useCabinet();

  // Subscribe to cabinet.updatedAt to ensure re-render on any cabinet change
  const cabinetUpdatedAt = useCabinetStore((s) => s.cabinet?.updatedAt);

  // Subscribe to panels array to detect changes
  const panels = useCabinetStore((s) => s.cabinet?.panels);

  // Find panel from panels array (will re-run when panels change)
  const panel = panels?.find(p => p.id === panelId) ?? null;

  const coreMaterials = useCabinetStore((s) => s.coreMaterials);
  const surfaceMaterials = useCabinetStore((s) => s.surfaceMaterials);
  const edgeMaterialsOnly = useCabinetStore((s) => s.edgeMaterials);
  const updatePanelMaterial = useCabinetStore((s) => s.updatePanelMaterial);

  // Combine surface materials + edge-only materials for edge banding options
  // (Same as MaterialSelector in DesignerIntentPanel)
  const edgeMaterials = { ...surfaceMaterials, ...edgeMaterialsOnly };
  const updatePanelEdge = useCabinetStore((s) => s.updatePanelEdge);
  const updatePanelPositionOverride = useCabinetStore((s) => s.updatePanelPositionOverride);
  const resetPanelPosition = useCabinetStore((s) => s.resetPanelPosition);

  // Draggable state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  
  // Reset position when modal opens
  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen, panelId]);
  
  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };
      e.preventDefault();
    }
  };
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.current.x,
          y: e.clientY - dragOffset.current.y,
        });
      }
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);
  
  if (!isOpen || !panelId || !cabinet || !panel) return null;

  // Type-safe panelId (guaranteed non-null after guards)
  const currentPanelId = panelId;

  // Get current materials (use override or default)
  const currentCore = panel.coreMaterialId || cabinet.materials.defaultCore;
  const currentSurfaceA = panel.faces?.faceA || cabinet.materials.defaultSurface;
  const currentSurfaceB = panel.faces?.faceB || cabinet.materials.defaultSurface;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div 
        className="bg-surface-1 border border-[#333] rounded-lg shadow-2xl w-[340px] max-h-[70vh] overflow-hidden"
        style={{ 
          transform: `translate(${position.x}px, ${position.y}px)`,
          cursor: isDragging ? 'grabbing' : 'default'
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Header - Draggable */}
        <div className="drag-handle flex items-center justify-between px-3 py-2 border-b border-[#333] cursor-grab active:cursor-grabbing">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
            <div>
              <h2 className="text-xs font-medium text-white">Panel Configuration</h2>
              <p className="text-[10px] text-gray-500">{panel.name || panel.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Eye toggle for panel visibility */}
            <button
              onClick={() => useCabinetStore.getState().togglePanelVisibility(currentPanelId)}
              title={panel.visible ? 'Hide panel' : 'Show panel'}
              className="p-1.5 text-gray-500 hover:text-white hover:bg-surface-3 rounded-lg transition-all duration-200"
            >
              {panel.visible ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                </svg>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-white hover:bg-surface-3 rounded-lg transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Visibility Actions */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[#333] bg-surface-1">
          <button
            onClick={() => useCabinetStore.getState().setPanelVisible(currentPanelId, false)}
            className="px-2 py-0.5 text-[10px] bg-surface-2 hover:bg-surface-3 border border-[#333] rounded transition-all duration-200 text-gray-500 hover:text-white"
          >
            Hide
          </button>
          <button
            onClick={() => useCabinetStore.getState().hideUnselectedPanels(currentPanelId)}
            className="px-2 py-0.5 text-[10px] bg-surface-2 hover:bg-surface-3 border border-[#333] rounded transition-all duration-200 text-gray-500 hover:text-white"
          >
            Hide Others
          </button>
          <button
            onClick={() => useCabinetStore.getState().showAllPanels()}
            className="px-2 py-0.5 text-[10px] bg-surface-2 hover:bg-surface-3 border border-[#333] rounded transition-all duration-200 text-gray-500 hover:text-white"
          >
            Show All
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 overflow-y-auto max-h-[50vh]">
          {/* Panel Info */}
          <div className="p-2 bg-surface-2 rounded-lg border border-[#333]">
            <div className="flex items-center justify-between text-[10px]">
              <div>
                <span className="text-gray-500">Dimensions:</span>
                <span className="ml-1 text-white font-mono">{panel.finishWidth} × {panel.finishHeight} mm</span>
              </div>
              <div>
                <span className="text-gray-500">Role:</span>
                <span className="ml-1 text-white font-mono">{panel.role}</span>
              </div>
            </div>
          </div>
          
          {/* Core Material */}
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Core Material</label>
            <select
              value={currentCore}
              onChange={(e) => updatePanelMaterial(currentPanelId, 'core', e.target.value)}
              className="w-full bg-surface-2 border border-[#333] rounded-lg px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/20 transition-all duration-200"
            >
              <option value="">Use Default ({(coreMaterials as Record<string, typeof coreMaterials[keyof typeof coreMaterials]>)[cabinet.materials.defaultCore]?.name})</option>
              {Object.values(coreMaterials).map((mat) => (
                <option key={mat.id} value={mat.id}>{mat.name} ({mat.thickness}mm)</option>
              ))}
            </select>
          </div>
          
          {/* Surface Materials */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Surface A (Front)</label>
              <select
                value={currentSurfaceA || ''}
                onChange={(e) => updatePanelMaterial(currentPanelId, 'faceA', e.target.value || '')}
                className="w-full bg-surface-2 border border-[#333] rounded-lg px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/20 transition-all duration-200"
              >
                <option value="">Use Default</option>
                {Object.values(surfaceMaterials).map((mat) => (
                  <option key={mat.id} value={mat.id}>{mat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Surface B (Back)</label>
              <select
                value={currentSurfaceB || ''}
                onChange={(e) => updatePanelMaterial(currentPanelId, 'faceB', e.target.value || '')}
                className="w-full bg-surface-2 border border-[#333] rounded-lg px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/20 transition-all duration-200"
              >
                <option value="">None / Backing</option>
                {Object.values(surfaceMaterials).map((mat) => (
                  <option key={mat.id} value={mat.id}>{mat.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Position Overrides - Only for Shelf and Divider */}
          {(panel.role === 'SHELF' || panel.role === 'DIVIDER') && (
            <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/30">
              <div className="flex items-center justify-between mb-3">
                <label className="text-[10px] font-medium text-green-400">Position Overrides</label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500">
                    {panel.useCustomPosition ? 'Custom' : 'Auto'}
                  </span>
                  {panel.useCustomPosition && (
                    <button
                      onClick={() => resetPanelPosition(currentPanelId)}
                      className="px-1.5 py-0.5 text-[10px] bg-surface-2 hover:bg-surface-3 border border-[#333] text-gray-500 hover:text-white rounded transition-all duration-200"
                    >
                      Reset to Auto
                    </button>
                  )}
                </div>
              </div>

              {/* Front Setback */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-500">Front Setback</span>
                  <span className="text-[10px] text-green-400 font-mono">
                    {panel.positionOverrides?.frontSetback ?? DEFAULT_POSITION_OVERRIDES.frontSetback} mm
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={panel.positionOverrides?.frontSetback ?? DEFAULT_POSITION_OVERRIDES.frontSetback}
                  onChange={(e) => updatePanelPositionOverride(currentPanelId, 'frontSetback', Number(e.target.value))}
                  className="w-full h-0.5 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-green-500 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:bg-green-400"
                />
                <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                  <span>0</span>
                  <span>100 mm</span>
                </div>
              </div>

              {/* Back Setback (LED) */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-500">Back Setback (LED)</span>
                  <span className="text-[10px] text-green-400 font-mono">
                    {panel.positionOverrides?.backSetback ?? DEFAULT_POSITION_OVERRIDES.backSetback} mm
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={panel.positionOverrides?.backSetback ?? DEFAULT_POSITION_OVERRIDES.backSetback}
                  onChange={(e) => updatePanelPositionOverride(currentPanelId, 'backSetback', Number(e.target.value))}
                  className="w-full h-0.5 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-green-500 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:bg-green-400"
                />
                <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                  <span>0</span>
                  <span>100 mm</span>
                </div>
              </div>

              {/* Gap Height - Only for Shelf */}
              {panel.role === 'SHELF' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-500">Gap Height (from bottom)</span>
                    <span className="text-[10px] text-green-400 font-mono">
                      {panel.positionOverrides?.gapFromBelow !== null && panel.positionOverrides?.gapFromBelow !== undefined
                        ? `${panel.positionOverrides.gapFromBelow} mm`
                        : 'Auto'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={cabinet ? cabinet.dimensions.height - 100 : 600}
                    step="5"
                    value={panel.positionOverrides?.gapFromBelow ?? Math.round((cabinet?.dimensions.height || 720) / 3)}
                    onChange={(e) => updatePanelPositionOverride(currentPanelId, 'gapFromBelow', Number(e.target.value))}
                    className="w-full h-0.5 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-green-500 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:bg-green-400"
                  />
                  <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                    <span>0</span>
                    <span>{cabinet ? cabinet.dimensions.height - 100 : 600} mm</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Edge Banding */}
          <div className="p-2 bg-surface-2 rounded-lg border border-[#333]">
            <div className="text-[10px] text-gray-500 mb-2">Edge Banding</div>
            <div className="space-y-1.5">
              {(['top', 'bottom', 'left', 'right'] as const).map((side) => {
                const edgeId = panel.edges?.[side];
                const sideLabels = {
                  top: 'Front',
                  bottom: 'Back',
                  left: 'Left',
                  right: 'Right'
                };

                return (
                  <div key={side} className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-gray-500 w-10 shrink-0">{sideLabels[side]}</span>
                    <select
                      value={edgeId || ''}
                      onChange={(e) => updatePanelEdge(currentPanelId, side, e.target.value || null)}
                      className="flex-1 bg-surface-1 border border-[#333] rounded px-1.5 py-0.5 text-[11px] text-white font-mono focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/20 transition-all duration-200 truncate"
                    >
                      <option value="">None</option>
                      {Object.values(edgeMaterials).map((mat) => (
                        <option key={mat.id} value={mat.id}>{mat.name}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Computed Values */}
          <div className="p-2 bg-surface-2 rounded-lg border border-[#333]">
            <h4 className="text-xs font-medium text-white mb-2">Computed Values</h4>

            {/* Material Stack Breakdown */}
            <div className="mb-3 p-2 bg-surface-1 rounded-lg border border-[#333]">
              <div className="text-[10px] text-gray-500 mb-1.5">Material Stack</div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-amber-400">Core Structure:</span>
                  <span className="text-white font-mono">
                    {coreMaterials[currentCore as keyof typeof coreMaterials]?.thickness || 18} mm
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-blue-400">Surface A (Front):</span>
                  <span className="text-white font-mono">
                    {surfaceMaterials[currentSurfaceA as keyof typeof surfaceMaterials]?.thickness || 0} mm
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-blue-400">Surface B (Back):</span>
                  <span className="text-white font-mono">
                    {surfaceMaterials[currentSurfaceB as keyof typeof surfaceMaterials]?.thickness || 0} mm
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-cyan-400">Edge Banding:</span>
                  <span className="text-white font-mono">
                    {panel.edges?.top ? (edgeMaterials[panel.edges.top as keyof typeof edgeMaterials]?.thickness || 0) : 0} mm
                  </span>
                </div>
                <div className="border-t border-[#333] pt-1.5 mt-1.5 flex justify-between items-center">
                  <span className="text-green-400 font-medium">Total Thickness:</span>
                  <span className="text-green-400 font-mono font-medium">
                    {panel.computed?.realThickness || 18} mm
                  </span>
                </div>
              </div>
            </div>

            {/* Other Computed Values */}
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div>
                <div className="text-gray-500 mb-0.5">Cut Size</div>
                <div className="text-white font-mono text-xs">{panel.computed?.cutWidth || panel.finishWidth} × {panel.computed?.cutHeight || panel.finishHeight} mm</div>
              </div>
              <div>
                <div className="text-gray-500 mb-0.5">Surface Area</div>
                <div className="text-white font-mono text-xs">{(panel.computed?.surfaceArea || 0).toFixed(3)} m²</div>
              </div>
              <div>
                <div className="text-gray-500 mb-0.5">Edge Banding Total</div>
                <div className="text-green-400 font-medium font-mono text-xs">{((panel.computed?.edgeLength || 0) * 1000).toFixed(0)} mm</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-[#333] bg-surface-1">
          <button
            onClick={() => {
              // Reset to defaults
              updatePanelMaterial(currentPanelId, 'core', cabinet.materials.defaultCore);
              updatePanelMaterial(currentPanelId, 'faceA', cabinet.materials.defaultSurface);
              updatePanelMaterial(currentPanelId, 'faceB', '');
            }}
            className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-white bg-surface-2 hover:bg-surface-3 rounded border border-[#333] transition-all duration-200"
          >
            Reset to Defaults
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded-lg text-[10px] font-medium transition-all duration-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default PanelConfigModal;
