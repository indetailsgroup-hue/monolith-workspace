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
  const coreMaterials = useCabinetStore((s) => s.coreMaterials);
  const surfaceMaterials = useCabinetStore((s) => s.surfaceMaterials);
  const edgeMaterials = useCabinetStore((s) => s.edgeMaterials);
  const updatePanelMaterial = useCabinetStore((s) => s.updatePanelMaterial);
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
  
  if (!isOpen || !panelId || !cabinet) return null;
  
  // Find the panel
  const panel = cabinet.panels.find(p => p.id === panelId);
  if (!panel) return null;
  
  // Get current materials (use override or default)
  const currentCore = panel.coreMaterialId || cabinet.materials.defaultCore;
  const currentSurfaceA = panel.faces?.faceA || cabinet.materials.defaultSurface;
  const currentSurfaceB = panel.faces?.faceB || cabinet.materials.defaultSurface;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div 
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[500px] max-h-[80vh] overflow-hidden select-none"
        style={{ 
          transform: `translate(${position.x}px, ${position.y}px)`,
          cursor: isDragging ? 'grabbing' : 'default'
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Header - Draggable */}
        <div className="drag-handle flex items-center justify-between px-6 py-4 border-b border-zinc-800 cursor-grab active:cursor-grabbing">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
            <div>
              <h2 className="text-lg font-semibold text-white">Panel Configuration</h2>
              <p className="text-sm text-zinc-400">{panel.name || panel.role}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
          {/* Panel Info */}
          <div className="p-4 bg-zinc-800/50 rounded-lg">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-zinc-500">Dimensions:</span>
                <span className="ml-2 text-white">{panel.finishWidth} × {panel.finishHeight} mm</span>
              </div>
              <div>
                <span className="text-zinc-500">Role:</span>
                <span className="ml-2 text-white">{panel.role}</span>
              </div>
            </div>
          </div>
          
          {/* Core Material */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Core Material</label>
            <select
              value={currentCore}
              onChange={(e) => updatePanelMaterial(panelId, 'core', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="">Use Default ({(coreMaterials as Record<string, typeof coreMaterials[keyof typeof coreMaterials]>)[cabinet.materials.defaultCore]?.name})</option>
              {Object.values(coreMaterials).map((mat) => (
                <option key={mat.id} value={mat.id}>{mat.name} ({mat.thickness}mm)</option>
              ))}
            </select>
          </div>
          
          {/* Surface Materials */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Surface A (Front)</label>
              <select
                value={currentSurfaceA || ''}
                onChange={(e) => updatePanelMaterial(panelId, 'faceA', e.target.value || '')}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">Use Default</option>
                {Object.values(surfaceMaterials).map((mat) => (
                  <option key={mat.id} value={mat.id}>{mat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Surface B (Back)</label>
              <select
                value={currentSurfaceB || ''}
                onChange={(e) => updatePanelMaterial(panelId, 'faceB', e.target.value || '')}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
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
            <div className="p-4 bg-emerald-900/20 rounded-lg border border-emerald-500/30">
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-medium text-emerald-300">Position Overrides</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">
                    {panel.useCustomPosition ? 'Custom' : 'Auto'}
                  </span>
                  {panel.useCustomPosition && (
                    <button
                      onClick={() => resetPanelPosition(panelId)}
                      className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
                    >
                      Reset to Auto
                    </button>
                  )}
                </div>
              </div>

              {/* Front Setback */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-zinc-400">Front Setback</span>
                  <span className="text-xs text-emerald-400 font-mono">
                    {panel.positionOverrides?.frontSetback ?? DEFAULT_POSITION_OVERRIDES.frontSetback} mm
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={panel.positionOverrides?.frontSetback ?? DEFAULT_POSITION_OVERRIDES.frontSetback}
                  onChange={(e) => updatePanelPositionOverride(panelId, 'frontSetback', Number(e.target.value))}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                  <span>0</span>
                  <span>100 mm</span>
                </div>
              </div>

              {/* Back Setback (LED) */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-zinc-400">Back Setback (LED)</span>
                  <span className="text-xs text-emerald-400 font-mono">
                    {panel.positionOverrides?.backSetback ?? DEFAULT_POSITION_OVERRIDES.backSetback} mm
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={panel.positionOverrides?.backSetback ?? DEFAULT_POSITION_OVERRIDES.backSetback}
                  onChange={(e) => updatePanelPositionOverride(panelId, 'backSetback', Number(e.target.value))}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                  <span>0</span>
                  <span>100 mm</span>
                </div>
              </div>

              {/* Gap Height - Only for Shelf */}
              {panel.role === 'SHELF' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-400">Gap Height (from bottom)</span>
                    <span className="text-xs text-emerald-400 font-mono">
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
                    onChange={(e) => updatePanelPositionOverride(panelId, 'gapFromBelow', Number(e.target.value))}
                    className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <div className="flex justify-between text-xs text-zinc-500 mt-1">
                    <span>0</span>
                    <span>{cabinet ? cabinet.dimensions.height - 100 : 600} mm</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Edge Banding */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-3">Edge Banding</label>
            <div className="grid grid-cols-2 gap-3">
              {(['top', 'bottom', 'left', 'right'] as const).map((side) => {
                const edgeId = panel.edges?.[side];
                const sideLabels = {
                  top: 'Front Edge',
                  bottom: 'Back Edge',
                  left: 'Left Edge',
                  right: 'Right Edge'
                };

                return (
                  <div key={side} className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 w-20">{sideLabels[side]}:</span>
                    <select
                      value={edgeId || ''}
                      onChange={(e) => updatePanelEdge(panelId, side, e.target.value || '')}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
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
          <div className="p-4 bg-zinc-800/30 rounded-lg border border-zinc-700/50">
            <h4 className="text-sm font-medium text-zinc-300 mb-2">Computed Values</h4>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-zinc-500">Cut Size:</span>
                <div className="text-white">{panel.computed?.cutWidth || panel.finishWidth} × {panel.computed?.cutHeight || panel.finishHeight} mm</div>
              </div>
              <div>
                <span className="text-zinc-500">Thickness:</span>
                <div className="text-white">{panel.computed?.realThickness || 18} mm</div>
              </div>
              <div>
                <span className="text-zinc-500">Surface Area:</span>
                <div className="text-white">{(panel.computed?.surfaceArea || 0).toFixed(3)} m²</div>
              </div>
              <div>
                <span className="text-zinc-500">Edge Banding Total:</span>
                <div className="text-emerald-400 font-medium">{((panel.computed?.edgeLength || 0) * 1000).toFixed(0)} mm</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-900/50">
          <button
            onClick={() => {
              // Reset to defaults
              updatePanelMaterial(panelId, 'core', cabinet.materials.defaultCore);
              updatePanelMaterial(panelId, 'faceA', cabinet.materials.defaultSurface);
              updatePanelMaterial(panelId, 'faceB', '');
            }}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Reset to Defaults
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default PanelConfigModal;
