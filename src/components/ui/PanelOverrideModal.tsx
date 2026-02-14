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
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[500px] max-h-[80vh] overflow-hidden"
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
              onChange={(e) => updatePanelMaterial(currentPanelId, 'core', e.target.value)}
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
                onChange={(e) => updatePanelMaterial(currentPanelId, 'faceA', e.target.value || '')}
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
                onChange={(e) => updatePanelMaterial(currentPanelId, 'faceB', e.target.value || '')}
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
                      onClick={() => resetPanelPosition(currentPanelId)}
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
                  onChange={(e) => updatePanelPositionOverride(currentPanelId, 'frontSetback', Number(e.target.value))}
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
                  onChange={(e) => updatePanelPositionOverride(currentPanelId, 'backSetback', Number(e.target.value))}
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
                    onChange={(e) => updatePanelPositionOverride(currentPanelId, 'gapFromBelow', Number(e.target.value))}
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
                      onChange={(e) => updatePanelEdge(currentPanelId, side, e.target.value || null)}
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
            <h4 className="text-sm font-medium text-zinc-300 mb-3">Computed Values</h4>

            {/* Material Stack Breakdown */}
            <div className="mb-4 p-3 bg-zinc-900/50 rounded-lg border border-zinc-700/30">
              <div className="text-xs text-zinc-400 mb-2">Material Stack</div>
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
                <div className="border-t border-zinc-700 pt-1.5 mt-1.5 flex justify-between items-center">
                  <span className="text-emerald-400 font-medium">Total Thickness:</span>
                  <span className="text-emerald-400 font-mono font-medium">
                    {panel.computed?.realThickness || 18} mm
                  </span>
                </div>
              </div>
            </div>

            {/* Other Computed Values */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-zinc-500">Cut Size:</span>
                <div className="text-white">{panel.computed?.cutWidth || panel.finishWidth} × {panel.computed?.cutHeight || panel.finishHeight} mm</div>
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
              updatePanelMaterial(currentPanelId, 'core', cabinet.materials.defaultCore);
              updatePanelMaterial(currentPanelId, 'faceA', cabinet.materials.defaultSurface);
              updatePanelMaterial(currentPanelId, 'faceB', '');
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
