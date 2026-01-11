/**
 * PanelConfigPanel - Individual Panel Configuration
 * 
 * Opens when user clicks on a panel in 3D view
 * Allows per-panel material assignment:
 * - Core Structure
 * - Face A (Primary) / Face B (Outer)
 * - Edge Banding (Top/Right/Bottom/Left)
 * - Manufacturing Data preview
 */

import { useState, useMemo } from 'react';
import { 
  X, 
  Settings2, 
  Layers,
  ChevronDown,
  ArrowRight,
  ArrowLeft,
  Grid3X3,
} from 'lucide-react';
import { useCabinetStore, useCabinet } from '../../core/store/useCabinetStore';
// import { CabinetPanel } from '../../core/types/Cabinet';
import { clsx } from 'clsx';

interface PanelConfigPanelProps {
  panelId: string;
  onClose: () => void;
}

export function PanelConfigPanel({ panelId, onClose }: PanelConfigPanelProps) {
  const cabinet = useCabinet();
  const coreMaterials = useCabinetStore((s) => s.coreMaterials);
  const surfaceMaterials = useCabinetStore((s) => s.surfaceMaterials);
  const edgeMaterials = useCabinetStore((s) => s.edgeMaterials);
  
  // Panel-specific state (would connect to store in production)
  const [faceASynced, setFaceASynced] = useState(true);
  
  const panel = useMemo(() => {
    return cabinet?.panels.find(p => p.id === panelId);
  }, [cabinet, panelId]);
  
  if (!panel || !cabinet) return null;
  
  // Get current materials for this panel
  // const _currentCore = (coreMaterials as Record<string, typeof coreMaterials[keyof typeof coreMaterials]>)[panel.coreMaterialId];
  const currentFaceA = (surfaceMaterials as Record<string, typeof surfaceMaterials[keyof typeof surfaceMaterials]>)[panel.faces?.faceA || cabinet.materials.defaultSurface];
  const currentFaceB = panel.faces?.faceB 
    ? (surfaceMaterials as Record<string, typeof surfaceMaterials[keyof typeof surfaceMaterials]>)[panel.faces.faceB] 
    : currentFaceA;
  
  // Edge materials
  const edgeTop = panel.edges?.top ? (edgeMaterials as Record<string, typeof edgeMaterials[keyof typeof edgeMaterials]>)[panel.edges.top] : null;
  const edgeRight = panel.edges?.right ? (edgeMaterials as Record<string, typeof edgeMaterials[keyof typeof edgeMaterials]>)[panel.edges.right] : null;
  const edgeBottom = panel.edges?.bottom ? (edgeMaterials as Record<string, typeof edgeMaterials[keyof typeof edgeMaterials]>)[panel.edges.bottom] : null;
  const edgeLeft = panel.edges?.left ? (edgeMaterials as Record<string, typeof edgeMaterials[keyof typeof edgeMaterials]>)[panel.edges.left] : null;
  
  // Panel title based on role
  const getPanelTitle = (role: string) => {
    switch (role) {
      case 'LEFT_SIDE': return 'Left Side Panel';
      case 'RIGHT_SIDE': return 'Right Side Panel';
      case 'TOP': return 'Top Panel';
      case 'BOTTOM': return 'Bottom Panel';
      case 'BACK': return 'Back Panel';
      case 'SHELF': return `Shelf ${panel.name.match(/\d+/)?.[0] || ''}`;
      case 'DIVIDER': return `Divider ${panel.name.match(/\d+/)?.[0] || ''}`;
      default: return panel.name;
    }
  };
  
  return (
    <div className="fixed right-4 top-20 w-80 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl font-mono z-50 max-h-[calc(100vh-120px)] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-white/10 bg-[#0d1f0d] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-emerald-400" />
          <div>
            <div className="text-sm text-white font-medium">{getPanelTitle(panel.role)}</div>
            <div className="text-[10px] text-white/40 uppercase tracking-wider">
              Individual Configuration
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded transition-colors"
        >
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>
      
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Shelf/Divider Positioning (only for shelves/dividers) */}
        {(panel.role === 'SHELF' || panel.role === 'DIVIDER') && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white/60">
              <ArrowRight className="w-3 h-3" />
              <span className="text-[10px] uppercase tracking-wider">Front Setback</span>
              <div className="flex-1" />
              <span className="text-xs text-white">20</span>
              <span className="text-[10px] text-white/40">mm</span>
            </div>
            <input 
              type="range" 
              min={0} 
              max={50} 
              defaultValue={20}
              className="w-full h-1 bg-blue-500/30 rounded appearance-none cursor-pointer accent-blue-500"
            />
            
            <div className="flex items-center gap-2 text-white/60 mt-4">
              <ArrowLeft className="w-3 h-3" />
              <span className="text-[10px] uppercase tracking-wider">Back Setback (LED)</span>
              <div className="flex-1" />
              <span className="text-xs text-white">46</span>
              <span className="text-[10px] text-white/40">mm</span>
            </div>
            <input 
              type="range" 
              min={0} 
              max={100} 
              defaultValue={46}
              className="w-full h-1 bg-orange-500/30 rounded appearance-none cursor-pointer accent-orange-500"
            />
            
            <div className="flex items-center gap-2 text-white/60 mt-4">
              <Grid3X3 className="w-3 h-3" />
              <span className="text-[10px] uppercase tracking-wider">Gap Height (From Below)</span>
            </div>
            <div className="flex items-center justify-between bg-white/5 px-3 py-2 rounded">
              <span className="text-xs text-white/60">→ {panel.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/40 bg-white/10 px-2 py-0.5 rounded">Auto</span>
                <span className="text-xs text-white">(401mm)</span>
              </div>
            </div>
            <input 
              type="range" 
              min={0} 
              max={800} 
              defaultValue={401}
              className="w-full h-1 bg-blue-500/30 rounded appearance-none cursor-pointer accent-blue-500"
            />
          </div>
        )}
        
        {/* Core Structure */}
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">
            Core Structure
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {Object.values(coreMaterials).map((mat) => (
              <button
                key={mat.id}
                className={clsx(
                  "w-full flex items-center justify-between px-3 py-2 border transition-colors text-left",
                  panel.coreMaterialId === mat.id
                    ? "border-white/40 bg-white/10"
                    : "border-white/10 hover:border-white/20"
                )}
              >
                <span className="text-xs text-white/80">{mat.name}</span>
                <span className="text-xs text-white/40">{mat.thickness}mm</span>
              </button>
            ))}
          </div>
        </div>
        
        {/* Face A (Primary) */}
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-2">
            Face A (Primary)
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
            {Object.values(surfaceMaterials).map((mat) => (
              <button
                key={mat.id}
                className={clsx(
                  "aspect-[3/2] border transition-all relative overflow-hidden group",
                  currentFaceA?.id === mat.id
                    ? "border-orange-400 ring-1 ring-orange-400/30"
                    : "border-white/10 hover:border-white/30"
                )}
              >
                {mat.textureUrl ? (
                  <img 
                    src={mat.textureUrl} 
                    alt={mat.name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div 
                    className="absolute inset-0"
                    style={{ backgroundColor: mat.color }}
                  />
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
                  <div className="text-[8px] text-white/80 truncate text-center">
                    {mat.name}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
        
        {/* Face B (Outer) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-white/40 uppercase tracking-wider">
              Face B (Outer)
            </span>
            <button
              onClick={() => setFaceASynced(!faceASynced)}
              className={clsx(
                "text-[10px] px-2 py-0.5 rounded transition-colors",
                faceASynced 
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              )}
            >
              {faceASynced ? 'Synced' : 'Custom'}
            </button>
          </div>
          
          {!faceASynced && (
            <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
              {Object.values(surfaceMaterials).map((mat) => (
                <button
                  key={mat.id}
                  className={clsx(
                    "aspect-[3/2] border transition-all relative overflow-hidden",
                    currentFaceB?.id === mat.id
                      ? "border-blue-400 ring-1 ring-blue-400/30"
                      : "border-white/10 hover:border-white/30"
                  )}
                >
                  {mat.textureUrl ? (
                    <img src={mat.textureUrl} alt={mat.name} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0" style={{ backgroundColor: mat.color }} />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
                    <div className="text-[8px] text-white/80 truncate text-center">{mat.name}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Edge Banding */}
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-wider mb-3">
            Edge Banding
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            {/* TOP */}
            <EdgeDropdown 
              label="TOP" 
              value={edgeTop?.name || 'None'} 
              edgeMaterials={edgeMaterials}
            />
            
            {/* RIGHT */}
            <EdgeDropdown 
              label="RIGHT" 
              value={edgeRight?.name || 'None'} 
              edgeMaterials={edgeMaterials}
            />
            
            {/* BOTTOM */}
            <EdgeDropdown 
              label="BOTTOM" 
              value={edgeBottom?.name || 'None'} 
              edgeMaterials={edgeMaterials}
            />
            
            {/* LEFT */}
            <EdgeDropdown 
              label="LEFT" 
              value={edgeLeft?.name || 'None'} 
              edgeMaterials={edgeMaterials}
            />
          </div>
        </div>
        
        {/* Manufacturing Data */}
        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-3 h-3 text-white/40" />
              <span className="text-[10px] text-white/40 uppercase tracking-wider">
                Manufacturing Data
              </span>
            </div>
            <span className="text-[10px] text-white/60">
              Thk: {panel.computed.realThickness.toFixed(1)}mm
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-4 bg-white/5 p-3 rounded">
            <div>
              <div className="text-[9px] text-white/40 uppercase mb-1">Finish</div>
              <div className="text-sm text-white">
                {panel.finishWidth.toFixed(1)} × {panel.finishHeight.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-white/40 uppercase mb-1">Cut</div>
              <div className="text-sm text-emerald-400">
                {panel.computed.cutWidth.toFixed(1)} × {panel.computed.cutHeight.toFixed(1)}
              </div>
            </div>
          </div>
          
          {/* Formula breakdown */}
          <div className="mt-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-200/80">
            D({cabinet.dimensions.depth}) - Back(0) - Front(20) - BackSet(46)
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <div className="p-3 border-t border-white/10 bg-black/50">
        <button
          onClick={onClose}
          className="w-full py-2 bg-white/10 hover:bg-white/20 text-white text-xs uppercase tracking-wider rounded transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

interface EdgeDropdownProps {
  label: string;
  value: string;
  edgeMaterials: Record<string, any>;
}

function EdgeDropdown({ label, value, edgeMaterials }: EdgeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
      <div className="text-[9px] text-white/40 uppercase mb-1">{label}</div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-2 py-1.5 bg-white/5 border border-white/10 hover:border-white/20 rounded text-xs text-white/70 transition-colors"
      >
        <span className="truncate">{value}</span>
        <ChevronDown className={clsx(
          "w-3 h-3 text-white/40 transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/20 rounded shadow-xl z-10 max-h-48 overflow-y-auto">
          <button
            onClick={() => setIsOpen(false)}
            className="w-full px-2 py-1.5 text-left text-xs text-white/60 hover:bg-white/10 transition-colors"
          >
            None
          </button>
          {Object.values(edgeMaterials).map((mat: any) => (
            <button
              key={mat.id}
              onClick={() => setIsOpen(false)}
              className="w-full px-2 py-1.5 text-left text-xs text-white/80 hover:bg-white/10 transition-colors flex items-center gap-2"
            >
              <div 
                className="w-4 h-4 rounded-sm border border-white/20 flex-shrink-0"
                style={{ backgroundColor: mat.color }}
              />
              <span className="truncate">{mat.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
