/**
 * PanelConfigModal - Individual Panel Configuration
 * 
 * Allows per-panel configuration of:
 * - Position offsets (Front/Back setback)
 * - Core structure material
 * - Face A/B surface materials
 * - Edge banding per side (Top/Bottom/Left/Right)
 * - Shows manufacturing data (Finish vs Cut size)
 */

import { useState, useMemo } from 'react';
import { X, Settings2, Layers, Move, ArrowRight, ArrowLeft } from 'lucide-react';
import { useCabinetStore, useCabinet } from '@/core/store/useCabinetStore';
import { clsx } from 'clsx';
import {
  calculateTotalThickness,
  calculateInternalDepth,
  calculateCutDimensions,
  getShelfDepthFormula,
  DEFAULT_BACK_CONFIG,
  type EdgeConfig,
} from '@/core/engines/ManufacturingCalculator';

interface PanelConfigModalProps {
  panelId: string;
  onClose: () => void;
}

export function PanelConfigModal({ panelId, onClose }: PanelConfigModalProps) {
  const cabinet = useCabinet();
  const { 
    coreMaterials, 
    surfaceMaterials, 
    edgeMaterials,
    updatePanelMaterial,
    updatePanelEdge,
  } = useCabinetStore();
  
  // Find the panel
  const panel = cabinet?.panels.find(p => p.id === panelId);
  
  // Local state for offsets (will be stored in panel later)
  const [frontSetback, setFrontSetback] = useState(20);
  const [backSetback, setBackSetback] = useState(
    DEFAULT_BACK_CONFIG.grooveOffset + DEFAULT_BACK_CONFIG.thickness + 2
  );
  
  // Face B sync state
  const [faceBSynced, setFaceBSynced] = useState(true);
  
  if (!panel || !cabinet) return null;
  
  // Get current materials
  const currentCore = coreMaterials[panel.coreMaterialId as keyof typeof coreMaterials];
  const currentFaceA = panel.faces?.faceA ? surfaceMaterials[panel.faces.faceA as keyof typeof surfaceMaterials] : null;
  
  // Calculate real thickness using Material Physics
  const realThickness = useMemo(() => {
    const coreThk = currentCore?.thickness || 16;
    const surfaceThk = currentFaceA?.thickness || 0;
    const glueThk = currentFaceA?.type === 'HPL' ? 0.1 : 0;
    
    return calculateTotalThickness({
      coreThickness: coreThk,
      surfaceAThickness: surfaceThk,
      surfaceBThickness: surfaceThk,
      glueThickness: glueThk,
    });
  }, [currentCore, currentFaceA]);
  
  // Get edge thicknesses
  const edgeConfig: EdgeConfig = useMemo(() => {
    const getThk = (edgeId: string | null) => {
      if (!edgeId) return 0;
      const edge = edgeMaterials[edgeId as keyof typeof edgeMaterials];
      return edge?.thickness || 0;
    };
    
    return {
      top: getThk(panel.edges?.top || null),
      bottom: getThk(panel.edges?.bottom || null),
      left: getThk(panel.edges?.left || null),
      right: getThk(panel.edges?.right || null),
    };
  }, [panel.edges, edgeMaterials]);
  
  // Calculate manufacturing data using proper formulas
  const manufacturingData = useMemo(() => {
    const finishW = panel.finishWidth;
    const finishH = panel.finishHeight;
    
    // Calculate Cut size using edge banding formula
    const { cutWidth, cutHeight } = calculateCutDimensions(
      finishW,
      finishH,
      edgeConfig,
      { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
    );
    
    // Build formula string based on panel role
    let formula = '';
    if (panel.role === 'SHELF') {
      // Shelf depth formula
      // const _safeDepth = calculateInternalDepth(cabinet.dimensions.depth, DEFAULT_BACK_CONFIG, 2);
      formula = getShelfDepthFormula(
        cabinet.dimensions.depth,
        DEFAULT_BACK_CONFIG,
        frontSetback,
        2
      );
    } else if (panel.role === 'DIVIDER') {
      formula = `D(${cabinet.dimensions.depth}) - Back(0) - Front(0) - BackSet(${backSetback})`;
    } else if (panel.role === 'LEFT_SIDE' || panel.role === 'RIGHT_SIDE') {
      formula = `D(${cabinet.dimensions.depth})`;
    } else if (panel.role === 'TOP' || panel.role === 'BOTTOM') {
      formula = `W(${cabinet.dimensions.width}) - 2×T(${realThickness.toFixed(1)})`;
    }
    
    return { 
      finishW, 
      finishH, 
      cutW: cutWidth, 
      cutH: cutHeight, 
      thickness: realThickness, 
      formula 
    };
  }, [panel, cabinet, frontSetback, backSetback, edgeConfig, realThickness]);
  
  // Handle material changes
  const handleCoreChange = (coreId: string) => {
    updatePanelMaterial?.(panelId, 'core', coreId);
  };
  
  const handleFaceAChange = (surfaceId: string) => {
    updatePanelMaterial?.(panelId, 'faceA', surfaceId);
    if (faceBSynced) {
      updatePanelMaterial?.(panelId, 'faceB', surfaceId);
    }
  };
  
  const handleFaceBChange = (surfaceId: string) => {
    updatePanelMaterial?.(panelId, 'faceB', surfaceId);
  };
  
  const handleEdgeChange = (side: 'top' | 'bottom' | 'left' | 'right', edgeId: string | null) => {
    updatePanelEdge?.(panelId, side, edgeId);
  };
  
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-lg w-[420px] max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Settings2 className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-white font-medium">{panel.name}</h2>
              <p className="text-xs text-white/40 uppercase tracking-wider">Individual Configuration</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          
          {/* Position Offsets - Only for shelves/dividers */}
          {(panel.role === 'SHELF' || panel.role === 'DIVIDER') && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Move className="w-4 h-4 text-white/40" />
                <span className="text-xs text-white/60 uppercase tracking-wider">Position</span>
              </div>
              
              {/* Front Setback */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white/80 flex items-center gap-2">
                    <ArrowRight className="w-3 h-3" /> Front Setback
                  </span>
                  <span className="text-sm text-white/60">{frontSetback} mm</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={frontSetback}
                  onChange={(e) => setFrontSetback(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>
              
              {/* Back Setback (LED) */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white/80 flex items-center gap-2">
                    <ArrowLeft className="w-3 h-3" /> Back Setback (LED)
                  </span>
                  <span className="text-sm text-white/60">{backSetback} mm</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={backSetback}
                  onChange={(e) => setBackSetback(Number(e.target.value))}
                  className="w-full accent-orange-500"
                />
              </div>
              
              {/* Gap Height */}
              {panel.role === 'SHELF' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white/60">⊘ Gap Height (From Below)</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded">
                    <span className="text-sm text-white/80">→ {panel.name}</span>
                    <button className="px-3 py-1 bg-white/10 border border-white/20 rounded text-xs text-white/80">
                      Auto ({Math.round(panel.position[1])}mm)
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
          
          {/* Core Structure */}
          <section>
            <h3 className="text-xs text-white/60 uppercase tracking-wider mb-3">Core Structure</h3>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {Object.values(coreMaterials).map((mat) => (
                <button
                  key={mat.id}
                  onClick={() => handleCoreChange(mat.id)}
                  className={clsx(
                    "w-full flex items-center justify-between px-3 py-2 rounded transition-colors text-left",
                    panel.coreMaterialId === mat.id
                      ? "bg-white/10 border border-white/30"
                      : "hover:bg-white/5 border border-transparent"
                  )}
                >
                  <span className="text-sm text-white/80">{mat.name}</span>
                  <span className="text-sm text-white/40">{mat.thickness}mm</span>
                </button>
              ))}
            </div>
          </section>
          
          {/* Face A (Primary) */}
          <section>
            <h3 className="text-xs text-white/60 uppercase tracking-wider mb-3">Face A (Primary)</h3>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
              {Object.values(surfaceMaterials).map((mat) => (
                <button
                  key={mat.id}
                  onClick={() => handleFaceAChange(mat.id)}
                  className={clsx(
                    "aspect-[3/2] rounded overflow-hidden relative border-2 transition-all",
                    panel.faces?.faceA === mat.id
                      ? "border-emerald-500"
                      : "border-transparent hover:border-white/30"
                  )}
                >
                  {mat.textureUrl ? (
                    <img src={mat.textureUrl} alt={mat.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full" style={{ backgroundColor: mat.color }} />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1">
                    <span className="text-[10px] text-white/80 truncate block">{mat.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
          
          {/* Face B (Outer) */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs text-white/60 uppercase tracking-wider">Face B (Outer)</h3>
              <button
                onClick={() => setFaceBSynced(!faceBSynced)}
                className={clsx(
                  "px-3 py-1 text-xs rounded transition-colors",
                  faceBSynced
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-white/10 text-white/60 border border-white/20"
                )}
              >
                {faceBSynced ? 'Synced' : 'Custom'}
              </button>
            </div>
            
            {!faceBSynced && (
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                {Object.values(surfaceMaterials).map((mat) => (
                  <button
                    key={mat.id}
                    onClick={() => handleFaceBChange(mat.id)}
                    className={clsx(
                      "aspect-[3/2] rounded overflow-hidden relative border-2 transition-all",
                      panel.faces?.faceB === mat.id
                        ? "border-emerald-500"
                        : "border-transparent hover:border-white/30"
                    )}
                  >
                    {mat.textureUrl ? (
                      <img src={mat.textureUrl} alt={mat.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full" style={{ backgroundColor: mat.color }} />
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1">
                      <span className="text-[10px] text-white/80 truncate block">{mat.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
          
          {/* Edge Banding */}
          <section>
            <h3 className="text-xs text-white/60 uppercase tracking-wider mb-3">Edge Banding</h3>
            <div className="grid grid-cols-2 gap-3">
              {/* TOP */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">TOP</label>
                <select
                  value={panel.edges?.top || 'none'}
                  onChange={(e) => handleEdgeChange('top', e.target.value === 'none' ? null : e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/20 rounded px-3 py-2 text-sm text-white/80"
                >
                  <option value="none">None</option>
                  {Object.values(edgeMaterials).map((edge) => (
                    <option key={edge.id} value={edge.id}>{edge.name}</option>
                  ))}
                </select>
              </div>
              
              {/* RIGHT */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">RIGHT</label>
                <select
                  value={panel.edges?.right || 'none'}
                  onChange={(e) => handleEdgeChange('right', e.target.value === 'none' ? null : e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/20 rounded px-3 py-2 text-sm text-white/80"
                >
                  <option value="none">None</option>
                  {Object.values(edgeMaterials).map((edge) => (
                    <option key={edge.id} value={edge.id}>{edge.name}</option>
                  ))}
                </select>
              </div>
              
              {/* BOTTOM */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">BOTTOM</label>
                <select
                  value={panel.edges?.bottom || 'none'}
                  onChange={(e) => handleEdgeChange('bottom', e.target.value === 'none' ? null : e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/20 rounded px-3 py-2 text-sm text-white/80"
                >
                  <option value="none">None</option>
                  {Object.values(edgeMaterials).map((edge) => (
                    <option key={edge.id} value={edge.id}>{edge.name}</option>
                  ))}
                </select>
              </div>
              
              {/* LEFT */}
              <div>
                <label className="text-xs text-white/40 mb-1 block">LEFT</label>
                <select
                  value={panel.edges?.left || 'none'}
                  onChange={(e) => handleEdgeChange('left', e.target.value === 'none' ? null : e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-white/20 rounded px-3 py-2 text-sm text-white/80"
                >
                  <option value="none">None</option>
                  {Object.values(edgeMaterials).map((edge) => (
                    <option key={edge.id} value={edge.id}>{edge.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>
          
          {/* Manufacturing Data */}
          <section className="bg-white/5 border border-white/10 rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs text-white/60 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4" /> Manufacturing Data
              </h3>
              <span className="text-xs text-white/40">Thk: {manufacturingData.thickness.toFixed(1)}mm</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <div className="text-xs text-white/40 mb-1">FINISH</div>
                <div className="text-lg text-white/90">
                  {manufacturingData.finishW.toFixed(1)} × {manufacturingData.finishH.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-xs text-white/40 mb-1">CUT</div>
                <div className="text-lg text-emerald-400">
                  {manufacturingData.cutW.toFixed(1)} × {manufacturingData.cutH.toFixed(1)}
                </div>
              </div>
            </div>
            
            {manufacturingData.formula && (
              <div className="text-xs text-amber-400/80 bg-amber-500/10 px-3 py-2 rounded font-mono">
                {manufacturingData.formula}
              </div>
            )}
          </section>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
