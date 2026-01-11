/**
 * Cabinet3D - Renders parametric cabinet in 3D (Visual Layer)
 * 
 * ARCHITECTURE NOTE (North Star):
 * - This is the MAGIC/VISUAL layer - for display only
 * - CAM Truth comes from OperationGraph, NEVER from this visual mesh
 * - All dimensions in millimeters (mm)
 */

import { useRef, useMemo, useState, useEffect } from 'react';
import { Mesh, CanvasTexture, SRGBColorSpace, BoxGeometry, RepeatWrapping } from 'three';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
// NO ALIAS IMPORTS - Use relative paths only (North Star Rule #3)
import { useCabinetStore, useCabinet } from '../../core/store/useCabinetStore';
import { CabinetPanel, DEFAULT_POSITION_OVERRIDES } from '../../core/types/Cabinet';
import { SpringAnimatedNumber } from '../ui/AnimatedNumber';

// Custom hook to load texture from data URL
function useDataTexture(dataUrl: string | null) {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  const { invalidate } = useThree();
  
  useEffect(() => {
    // Track current texture for cleanup
    let currentTexture: CanvasTexture | null = null;
    let cancelled = false;
    
    if (!dataUrl) {
      setTexture(null);
      return;
    }
    
    console.log('[useDataTexture] Loading texture from data URL...', dataUrl.substring(0, 50));
    
    // Create image and load data URL
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      if (cancelled) return;
      
      console.log('[useDataTexture] Image loaded:', img.width, 'x', img.height);
      
      // Create canvas and draw image
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        
        // Create texture from canvas
        const tex = new CanvasTexture(canvas);
        // IMPORTANT: Enable repeat wrapping for world-scale UV
        tex.wrapS = RepeatWrapping;
        tex.wrapT = RepeatWrapping;
        tex.colorSpace = SRGBColorSpace;
        tex.needsUpdate = true;
        
        currentTexture = tex;
        setTexture(tex);
        invalidate();
        
        console.log('[useDataTexture] ✅ Texture created with RepeatWrapping');
      }
    };
    
    img.onerror = (err) => {
      console.error('[useDataTexture] ❌ Failed to load texture image:', err);
      setTexture(null);
    };
    
    img.src = dataUrl;
    
    // Cleanup function
    return () => {
      cancelled = true;
      if (currentTexture) {
        console.log('[useDataTexture] Disposing texture');
        currentTexture.dispose();
      }
    };
  }, [dataUrl, invalidate]);
  
  return texture;
}

interface Cabinet3DProps {
  showDimensions?: boolean;
  hideTooltip?: boolean;
}

export function Cabinet3D({ showDimensions = false, hideTooltip = false }: Cabinet3DProps) {
  const cabinet = useCabinet();
  const selectedPanelId = useCabinetStore((s) => s.selectedPanelId);
  const selectPanel = useCabinetStore((s) => s.selectPanel);
  const surfaceMaterials = useCabinetStore((s) => s.surfaceMaterials);
  const edgeMaterialsOnly = useCabinetStore((s) => s.edgeMaterials);

  if (!cabinet) return null;

  // Get default surface material
  const defaultSurface = surfaceMaterials[cabinet.materials.defaultSurface as keyof typeof surfaceMaterials];
  const baseColor = defaultSurface?.color || '#888888';
  const textureUrl = defaultSurface?.textureUrl || null;

  // Edge materials: Combine surface materials + edge-specific materials
  // This matches what DesignerIntentPanel does for the material selector
  const edgeMaterials = { ...surfaceMaterials, ...edgeMaterialsOnly };

  // Get default edge material - look in combined materials
  const defaultEdge = edgeMaterials[cabinet.materials.defaultEdge as keyof typeof edgeMaterials];
  const edgeColor = defaultEdge?.color || '#FFFFFF';
  const edgeThickness = defaultEdge?.thickness || 1.0;
  const edgeTextureUrl = defaultEdge?.textureUrl || null;
  
  return (
    <group name="cabinet-3d">
      {/* Render panels with shared texture */}
      <PanelsWithTexture
        panels={cabinet.panels}
        baseColor={baseColor}
        textureUrl={textureUrl}
        edgeColor={edgeColor}
        edgeThickness={edgeThickness}
        edgeTextureUrl={edgeTextureUrl}
        selectedPanelId={selectedPanelId}
        onSelectPanel={selectPanel}
        hideTooltip={hideTooltip}
        showPanelDimensions={showDimensions}
      />

      {/* Dimension labels - controlled by prop */}
      {showDimensions && <DimensionLabels cabinet={cabinet} />}

      {/* Compartment dimension labels - cleaner layout */}
      {showDimensions && <CompartmentDimensionLabels />}

      {/* Partial divider position labels - editable X position */}
      {showDimensions && <PartialDividerPositionLabels />}

      {/* Compartment interaction - right click to add shelf/divider */}
      <CompartmentInteraction />
    </group>
  );
}

// Separate component to load texture once for all panels
interface PanelsWithTextureProps {
  panels: CabinetPanel[];
  baseColor: string;
  textureUrl: string | null;
  edgeColor: string;
  edgeThickness: number;
  edgeTextureUrl: string | null;
  selectedPanelId: string | null;
  onSelectPanel: (id: string) => void;
  hideTooltip?: boolean;
  showPanelDimensions?: boolean;
}

function PanelsWithTexture({ panels, baseColor, textureUrl, edgeColor, edgeThickness, edgeTextureUrl, selectedPanelId, onSelectPanel, hideTooltip, showPanelDimensions }: PanelsWithTextureProps) {
  const texture = useDataTexture(textureUrl);
  const edgeTexture = useDataTexture(edgeTextureUrl);

  return (
    <>
      {panels.map((panel) => (
        <Panel3DComponent
          key={panel.id}
          panel={panel}
          baseColor={baseColor}
          texture={texture}
          edgeColor={edgeColor}
          edgeThickness={edgeThickness}
          edgeTexture={edgeTexture}
          isSelected={selectedPanelId === panel.id}
          onSelect={() => onSelectPanel(panel.id)}
          hideTooltip={hideTooltip}
          showPanelDimensions={showPanelDimensions}
        />
      ))}
    </>
  );
}

interface Panel3DProps {
  panel: CabinetPanel;
  baseColor: string;
  texture: CanvasTexture | null;
  edgeColor: string;
  edgeThickness: number;
  edgeTexture: CanvasTexture | null;
  isSelected: boolean;
  onSelect: () => void;
  hideTooltip?: boolean;
  showPanelDimensions?: boolean;
}

function Panel3DComponent({ panel, baseColor, texture, edgeColor, edgeThickness, edgeTexture, isSelected, onSelect, hideTooltip, showPanelDimensions }: Panel3DProps) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [panelTexture, setPanelTexture] = useState<CanvasTexture | null>(null);
  const [edgeBandTexture, setEdgeBandTexture] = useState<CanvasTexture | null>(null);
  
  // World-scale texture: Texture represents real material size
  // Texture image: 1523 × 3070 px = 1523 × 3070 mm real-world
  const TEXTURE_WIDTH_MM = 1523;
  const TEXTURE_HEIGHT_MM = 3070;
  
  // Calculate geometry size based on panel role
  const [sizeX, sizeY, sizeZ] = useMemo(() => {
    const t = panel.computed.realThickness;
    
    switch (panel.role) {
      case 'LEFT_SIDE':
      case 'RIGHT_SIDE':
        return [t, panel.finishHeight, panel.finishWidth];
      case 'TOP':
      case 'BOTTOM':
        return [panel.finishWidth, t, panel.finishHeight];
      case 'BACK':
        return [panel.finishWidth, panel.finishHeight, t];
      case 'SHELF':
        return [panel.finishWidth, t, panel.finishHeight];
      case 'DIVIDER':
        return [t, panel.finishHeight, panel.finishWidth];
      default:
        return [panel.finishWidth, panel.finishHeight, t];
    }
  }, [panel]);
  
  // Edge band strips - thin colored strips at the OUTER EDGE of the panel
  // Panel size is ALREADY reduced by edge thickness
  // So edge band sits AT THE OUTER EDGE making: Panel + Edge = Full Dimension
  const edgeBandStrips = useMemo(() => {
    const t = panel.computed.realThickness;
    const et = Math.max(edgeThickness, 1); // Minimum 1mm for visibility
    const OFFSET = 0.2; // Tiny offset to prevent z-fighting
    
    const strips: Array<{
      position: [number, number, number];
      size: [number, number, number];
    }> = [];
    
    // Skip back panel - no edge banding
    if (panel.role === 'BACK') return strips;
    
    // Get edge assignments from panel
    const hasTop = panel.edges?.top != null && panel.edges.top !== '';
    // const _hasBottom = panel.edges?.bottom != null && panel.edges.bottom !== '';
    const hasLeft = panel.edges?.left != null && panel.edges.left !== '';
    const hasRight = panel.edges?.right != null && panel.edges.right !== '';
    
    // Panel finishWidth/Height is ALREADY reduced by edge thickness
    // Edge band sits at the OUTER edge of the panel
    
    switch (panel.role) {
      case 'LEFT_SIDE':
      case 'RIGHT_SIDE':
        // Side panels: sizeX=t, sizeY=height, sizeZ=depth (finishWidth)
        // hasTop = front edge, hasLeft = top edge, hasRight = bottom edge
        
        // Front edge - at Z = panel.finishWidth/2 + et/2 (OUTER edge)
        if (hasTop) strips.push({
          position: [0, 0, panel.finishWidth/2 + et/2],
          size: [t + OFFSET, panel.finishHeight + (hasLeft ? et : 0) + (hasRight ? et : 0), et],
        });
        // Top edge - at Y = panel.finishHeight/2 + et/2 (OUTER edge)
        if (hasLeft) strips.push({
          position: [0, panel.finishHeight/2 + et/2, hasTop ? 0 : 0],
          size: [t + OFFSET, et, panel.finishWidth + (hasTop ? et : 0)],
        });
        // Bottom edge - at Y = -panel.finishHeight/2 - et/2 (OUTER edge)
        if (hasRight) strips.push({
          position: [0, -panel.finishHeight/2 - et/2, hasTop ? 0 : 0],
          size: [t + OFFSET, et, panel.finishWidth + (hasTop ? et : 0)],
        });
        break;
        
      case 'TOP':
      case 'BOTTOM':
      case 'SHELF':
        // Horizontal panels: sizeX=width (finishWidth), sizeY=t, sizeZ=depth (finishHeight)
        // hasTop = front edge, hasLeft = left edge, hasRight = right edge
        
        // Front edge - at Z = panel.finishHeight/2 + et/2 (OUTER edge)
        if (hasTop) strips.push({
          position: [0, 0, panel.finishHeight/2 + et/2],
          size: [panel.finishWidth + (hasLeft ? et : 0) + (hasRight ? et : 0), t + OFFSET, et],
        });
        // Left edge - at X = -panel.finishWidth/2 - et/2 (OUTER edge)
        if (hasLeft) strips.push({
          position: [-panel.finishWidth/2 - et/2, 0, hasTop ? 0 : 0],
          size: [et, t + OFFSET, panel.finishHeight + (hasTop ? et : 0)],
        });
        // Right edge - at X = panel.finishWidth/2 + et/2 (OUTER edge)
        if (hasRight) strips.push({
          position: [panel.finishWidth/2 + et/2, 0, hasTop ? 0 : 0],
          size: [et, t + OFFSET, panel.finishHeight + (hasTop ? et : 0)],
        });
        break;
        
      case 'DIVIDER':
        // Divider: vertical panel, sizeX=t, sizeY=height, sizeZ=depth (finishWidth)
        // hasTop = front edge
        
        // Front edge - at Z = panel.finishWidth/2 + et/2 (OUTER edge)
        if (hasTop) strips.push({
          position: [0, 0, panel.finishWidth/2 + et/2],
          size: [t + OFFSET, panel.finishHeight, et],
        });
        break;
    }
    
    return strips;
  }, [panel, edgeThickness]);
  
  // Color based on state
  const displayColor = useMemo(() => {
    if (isSelected) return '#4488ff';
    if (hovered) return '#6699ff';
    switch (panel.role) {
      case 'BACK': return '#3a3a3a';
      default: return baseColor;
    }
  }, [isSelected, hovered, baseColor, panel.role]);
  
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect();
  };
  
  if (!panel.visible) return null;
  
  // Show texture only when not selected/hovered and not back panel
  const showTexture = texture && !isSelected && !hovered && panel.role !== 'BACK';
  
  // Create geometry
  const geometry = useMemo(() => {
    return new BoxGeometry(sizeX, sizeY, sizeZ);
  }, [sizeX, sizeY, sizeZ]);
  
  // Create NEW texture for this panel (not clone - clone shares source!)
  // Each panel needs completely independent texture with its own repeat
  useEffect(() => {
    if (!texture || !showTexture) {
      setPanelTexture(null);
      return;
    }
    
    // Get source canvas from original texture
    const sourceCanvas = texture.image as HTMLCanvasElement;
    if (!sourceCanvas) {
      setPanelTexture(null);
      return;
    }
    
    // Create NEW canvas and copy image data
    const newCanvas = document.createElement('canvas');
    newCanvas.width = sourceCanvas.width;
    newCanvas.height = sourceCanvas.height;
    const ctx = newCanvas.getContext('2d');
    
    if (!ctx) {
      setPanelTexture(null);
      return;
    }
    
    ctx.drawImage(sourceCanvas, 0, 0);
    
    // Create NEW texture from NEW canvas
    const newTex = new CanvasTexture(newCanvas);
    newTex.wrapS = RepeatWrapping;
    newTex.wrapT = RepeatWrapping;
    newTex.colorSpace = SRGBColorSpace;
    
    // Calculate repeat based on panel dimensions (World-Scale UV)
    // RepeatX = panel width / texture width
    // RepeatY = panel height / texture height
    const repeatX = panel.finishWidth / TEXTURE_WIDTH_MM;
    const repeatY = panel.finishHeight / TEXTURE_HEIGHT_MM;
    
    newTex.repeat.set(repeatX, repeatY);
    newTex.needsUpdate = true;
    
    setPanelTexture(newTex);
    
    // Cleanup
    return () => {
      newTex.dispose();
    };
  }, [texture, showTexture, panel.finishWidth, panel.finishHeight]);
  
  // Clone edge texture for this panel's edge bands
  useEffect(() => {
    if (!edgeTexture) {
      setEdgeBandTexture(null);
      return;
    }
    
    // Get source canvas from the edge texture
    const sourceCanvas = edgeTexture.image as HTMLCanvasElement;
    if (!sourceCanvas) {
      setEdgeBandTexture(null);
      return;
    }
    
    // Create NEW canvas and copy image data for edge band
    const newCanvas = document.createElement('canvas');
    newCanvas.width = sourceCanvas.width;
    newCanvas.height = sourceCanvas.height;
    const ctx = newCanvas.getContext('2d');
    
    if (!ctx) {
      setEdgeBandTexture(null);
      return;
    }
    
    ctx.drawImage(sourceCanvas, 0, 0);
    
    // Create NEW texture from NEW canvas
    const newTex = new CanvasTexture(newCanvas);
    newTex.wrapS = RepeatWrapping;
    newTex.wrapT = RepeatWrapping;
    newTex.colorSpace = SRGBColorSpace;
    
    // For edge band: texture wraps around the edge
    // Edge band is thin, so we use a small repeat
    const edgeRepeatX = Math.max(panel.finishWidth, panel.finishHeight) / TEXTURE_WIDTH_MM;
    const edgeRepeatY = edgeThickness / 50; // Small repeat for thin edge
    
    newTex.repeat.set(edgeRepeatX, edgeRepeatY);
    newTex.needsUpdate = true;
    
    setEdgeBandTexture(newTex);
    
    // Cleanup
    return () => {
      newTex.dispose();
    };
  }, [edgeTexture, panel.finishWidth, panel.finishHeight, edgeThickness]);
  
  return (
    <group position={panel.position} rotation={panel.rotation}>
      {/* Main panel mesh */}
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
        castShadow
        receiveShadow
        geometry={geometry}
      >
        <meshStandardMaterial
          map={panelTexture}
          color={panelTexture ? '#ffffff' : displayColor}
          roughness={0.5}
          metalness={0.1}
          emissive={isSelected ? '#2244aa' : hovered ? '#223366' : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : hovered ? 0.15 : 0}
        />
      </mesh>
      
      {/* Edge Band Strips - thin colored strips on edge faces, INSIDE panel bounds */}
      {edgeBandStrips.map((strip, idx) => (
        <mesh
          key={`edge-${idx}`}
          position={strip.position}
        >
          <boxGeometry args={strip.size} />
          <meshStandardMaterial
            map={edgeBandTexture}
            color={isSelected ? '#00aaff' : (edgeBandTexture ? '#ffffff' : edgeColor)}
            roughness={0.3}
            metalness={0.02}
          />
        </mesh>
      ))}
      
      {/* Selection outline */}
      {isSelected && (
        <mesh geometry={geometry}>
          <meshBasicMaterial color="#00aaff" wireframe />
        </mesh>
      )}
      
      {!hideTooltip && (hovered || isSelected) && (
        <Html
          position={[0, sizeY/2 + 30, 0]}
          center
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div className="bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap border border-white/20">
            <div className="font-medium">{panel.name}</div>
            <div className="text-gray-400 text-[10px]">
              {panel.finishWidth} × {panel.finishHeight} mm
            </div>
            {isSelected && (
              <div className="text-emerald-400 text-[10px] border-t border-white/10 mt-1 pt-1">
                Cut: {panel.computed.cutWidth.toFixed(1)} × {panel.computed.cutHeight.toFixed(1)}
              </div>
            )}
          </div>
        </Html>
      )}

      {/* Per-panel dimension labels for Shelf and Divider */}
      {showPanelDimensions && (panel.role === 'SHELF' || panel.role === 'DIVIDER') && (
        <PanelDimensionLabel panel={panel} sizeY={sizeY} />
      )}
    </group>
  );
}

// Per-panel dimension label component for shelves and dividers
interface PanelDimensionLabelProps {
  panel: CabinetPanel;
  sizeY: number;
}

function PanelDimensionLabel({ panel, sizeY }: PanelDimensionLabelProps) {
  const updatePanelPositionOverride = useCabinetStore((s) => s.updatePanelPositionOverride);
  const [editingField, setEditingField] = useState<'width' | 'depth' | null>(null);
  const [inputValue, setInputValue] = useState('');

  const handleClick = (field: 'width' | 'depth', value: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputValue(value.toString());
    setEditingField(field);
  };

  const handleSubmit = (field: 'width' | 'depth') => {
    const newValue = parseInt(inputValue, 10);
    if (!isNaN(newValue) && newValue > 0) {
      // For depth changes, calculate the corresponding setback changes
      if (field === 'depth') {
        const currentDepth = panel.finishHeight; // For shelf, finishHeight is depth
        const depthChange = newValue - currentDepth;
        // Adjust front setback (reduce it to increase depth)
        const currentFrontSetback = panel.positionOverrides?.frontSetback ?? DEFAULT_POSITION_OVERRIDES.frontSetback;
        const newFrontSetback = Math.max(0, currentFrontSetback - depthChange);
        updatePanelPositionOverride(panel.id, 'frontSetback', newFrontSetback);
      }
    }
    setEditingField(null);
  };

  const handleKeyDown = (field: 'width' | 'depth') => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit(field);
    } else if (e.key === 'Escape') {
      setEditingField(null);
    }
  };

  // Position label on top of the panel
  const labelY = sizeY / 2 + 15;

  // Round dimensions for display (fix floating point precision)
  const displayWidth = Math.round(panel.finishWidth * 10) / 10;
  const displayDepth = Math.round(panel.finishHeight * 10) / 10;

  return (
    <Html position={[0, labelY, 0]} center style={{ pointerEvents: 'auto' }}>
      <div
        className="flex items-center gap-1 bg-emerald-900/90 border border-emerald-500/50 rounded px-2 py-1 text-[10px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Width */}
        {editingField === 'width' ? (
          <input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown('width')}
            onBlur={() => handleSubmit('width')}
            autoFocus
            className="w-12 bg-zinc-800 border border-emerald-400 rounded px-1 py-0 text-white text-center text-[10px] focus:outline-none"
            min={1}
          />
        ) : (
          <button
            onClick={handleClick('width', displayWidth)}
            className="text-emerald-300 hover:text-white font-mono cursor-pointer"
            title="Width (read-only)"
          >
            {displayWidth}
          </button>
        )}

        <span className="text-emerald-500/70">×</span>

        {/* Depth */}
        {editingField === 'depth' ? (
          <input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown('depth')}
            onBlur={() => handleSubmit('depth')}
            autoFocus
            className="w-12 bg-zinc-800 border border-emerald-400 rounded px-1 py-0 text-white text-center text-[10px] focus:outline-none"
            min={1}
          />
        ) : (
          <button
            onClick={handleClick('depth', displayDepth)}
            className="text-emerald-300 hover:text-white font-mono cursor-pointer"
            title="Click to adjust depth"
          >
            {displayDepth}
          </button>
        )}

        <span className="text-emerald-500/50 ml-0.5">mm</span>

        {/* Custom position indicator */}
        {panel.useCustomPosition && (
          <span className="text-yellow-400 ml-1" title="Custom position">*</span>
        )}
      </div>
    </Html>
  );
}

interface DimensionLabelsProps {
  cabinet: { dimensions: { width: number; height: number; depth: number; toeKickHeight: number } };
}

// Editable Dimension Label Component
interface EditableDimLabelProps {
  value: number;
  dimension: 'width' | 'height' | 'depth' | 'toeKickHeight';
  position: [number, number, number];
  color?: string;
  small?: boolean;
}

function EditableDimLabel({ value, dimension, position, color = 'bg-blue-500', small = false }: EditableDimLabelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const setDimension = useCabinetStore((s) => s.setDimension);
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputValue(value.toString());
    setIsEditing(true);
  };
  
  const handleSubmit = () => {
    const newValue = parseInt(inputValue, 10);
    if (!isNaN(newValue) && newValue > 0) {
      setDimension(dimension, newValue);
    }
    setIsEditing(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };
  
  return (
    <Html position={position} center style={{ pointerEvents: 'auto' }}>
      {isEditing ? (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSubmit}
            autoFocus
            className={`${small ? 'w-14 text-[10px]' : 'w-16 text-xs'} bg-zinc-800 border border-blue-400 rounded px-1 py-0.5 text-white text-center focus:outline-none focus:border-blue-300`}
            min={1}
          />
          <span className={`${small ? 'text-[10px]' : 'text-xs'} text-blue-300`}>mm</span>
        </div>
      ) : (
        <button
          onClick={handleClick}
          className={`${color} hover:bg-blue-400 text-white ${small ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'} rounded font-bold shadow-lg cursor-pointer transition-colors`}
          title="Click to edit"
        >
          <SpringAnimatedNumber 
            value={value} 
            suffix=" mm"
            stiffness={120}
            damping={18}
          />
        </button>
      )}
    </Html>
  );
}

function DimensionLabels({ cabinet }: DimensionLabelsProps) {
  const { width: W, height: H, depth: D, toeKickHeight: Leg } = cabinet.dimensions;
  const bodyH = H; // Toe kick is floor offset only
  
  // Line material for dimension lines
  const lineColor = '#0088ff';
  const lineOffset = 50; // Distance from cabinet
  
  // Use key to force re-render when dimensions change
  const dimKey = `${W}-${H}-${D}-${Leg}`;
  
  return (
    <group name="dimension-labels" key={dimKey}>
      {/* Width dimension - Top */}
      <group position={[0, Leg + bodyH + lineOffset, D/2]}>
        <DimensionLine points={[[-W/2, 0, 0], [W/2, 0, 0]]} color={lineColor} />
        <DimensionLine points={[[-W/2, -15, 0], [-W/2, 15, 0]]} color={lineColor} />
        <DimensionLine points={[[W/2, -15, 0], [W/2, 15, 0]]} color={lineColor} />
        <EditableDimLabel value={W} dimension="width" position={[0, 25, 0]} />
      </group>
      
      {/* Height dimension - Left side */}
      <group position={[-W/2 - lineOffset, Leg, D/2]}>
        <DimensionLine points={[[0, 0, 0], [0, bodyH, 0]]} color={lineColor} />
        <DimensionLine points={[[-15, 0, 0], [15, 0, 0]]} color={lineColor} />
        <DimensionLine points={[[-15, bodyH, 0], [15, bodyH, 0]]} color={lineColor} />
        <EditableDimLabel value={H} dimension="height" position={[-30, bodyH/2, 0]} />
      </group>
      
      {/* Depth dimension - Right side */}
      <group position={[W/2 + lineOffset, Leg + bodyH/2, 0]}>
        <DimensionLine points={[[0, 0, D/2], [0, 0, -D/2]]} color={lineColor} />
        <DimensionLine points={[[-15, 0, D/2], [15, 0, D/2]]} color={lineColor} />
        <DimensionLine points={[[-15, 0, -D/2], [15, 0, -D/2]]} color={lineColor} />
        <EditableDimLabel value={D} dimension="depth" position={[30, 0, 0]} />
      </group>
      
      {/* Toe Kick dimension - if exists */}
      {Leg > 0 && (
        <group position={[-W/2 - lineOffset - 40, 0, D/2]}>
          <DimensionLine points={[[0, 0, 0], [0, Leg, 0]]} color={lineColor} />
          <DimensionLine points={[[-15, 0, 0], [15, 0, 0]]} color={lineColor} />
          <DimensionLine points={[[-15, Leg, 0], [15, Leg, 0]]} color={lineColor} />
          <EditableDimLabel value={Leg} dimension="toeKickHeight" position={[-25, Leg/2, 0]} color="bg-blue-400" small />
        </group>
      )}
    </group>
  );
}

// Simple line component that re-renders properly
function DimensionLine({ points, color }: { points: [number, number, number][]; color: string }) {
  // Create a unique key based on point positions to force re-render when positions change
  const lineKey = `${points[0][0]}-${points[0][1]}-${points[0][2]}-${points[1][0]}-${points[1][1]}-${points[1][2]}`;

  const positions = useMemo(() => {
    return new Float32Array(points.flat());
  }, [points]);

  return (
    <line key={lineKey}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={2}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color={color} />
    </line>
  );
}

// Compartment dimension labels - Per-column compartment heights
// Shows the gap between: Bottom→Shelf1, Shelf1→Shelf2, Shelf2→Top
// Each column shows its own shelves (columns may have different shelf counts)
function CompartmentDimensionLabels() {
  // Subscribe directly to cabinet from store for reactive updates
  const cabinet = useCabinet();
  const updatePanelPositionOverride = useCabinetStore((s) => s.updatePanelPositionOverride);

  if (!cabinet) return null;

  const { width: W, height: H, depth: D, toeKickHeight: Leg } = cabinet.dimensions;
  const { panels } = cabinet;

  // Editing state
  const [editingCell, setEditingCell] = useState<{ col: number; row: number; field: 'width' | 'height' } | null>(null);
  const [inputValue, setInputValue] = useState('');

  // Panel thickness
  const T = 18;
  const bodyH = H;

  // Get divider X positions to determine columns
  // Only count FULL-HEIGHT dividers as column boundaries (exclude partial dividers)
  const usableHeight = H - 2 * T; // Full height minus top and bottom panels
  const dividerPanels = panels
    .filter(p => p.role === 'DIVIDER')
    .filter(p => p.finishHeight >= usableHeight - 10) // Only full-height dividers (with 10mm tolerance)
    .sort((a, b) => a.position[0] - b.position[0]);
  const dividerXPositions = dividerPanels.map(p => p.position[0]);
  const columnCount = dividerXPositions.length + 1;

  // Get column X boundaries
  const getColumnXBounds = (col: number) => {
    const leftX = col === 0 ? -W/2 + T : dividerXPositions[col - 1] + T/2;
    const rightX = col === columnCount - 1 ? W/2 - T : dividerXPositions[col] - T/2;
    return { leftX, rightX, width: Math.round((rightX - leftX) * 10) / 10, centerX: (leftX + rightX) / 2 };
  };

  // Get shelves that exist in a specific column (based on X position overlap)
  // Only count FULL-WIDTH shelves as row boundaries (exclude partial shelves)
  const getShelvesInColumn = (col: number) => {
    const { leftX, rightX, width: columnWidth } = getColumnXBounds(col);
    const colCenterX = (leftX + rightX) / 2;

    // Find shelves whose X position is within this column AND span most of the column width
    return panels
      .filter(p => p.role === 'SHELF')
      .filter(p => {
        const shelfX = p.position[0];
        const shelfHalfWidth = p.finishWidth / 2;
        // Check if shelf overlaps with column center
        const overlapsColumn = shelfX - shelfHalfWidth <= colCenterX && shelfX + shelfHalfWidth >= colCenterX;
        // Check if shelf spans most of the column width (at least 80% to allow for small tolerances)
        const isFullWidth = p.finishWidth >= columnWidth * 0.8;
        return overlapsColumn && isFullWidth;
      })
      .sort((a, b) => a.position[1] - b.position[1]);
  };

  // Get unique Y positions for shelves in a column
  const getShelfYPositionsInColumn = (col: number) => {
    const shelves = getShelvesInColumn(col);
    return [...new Set(shelves.map(s => s.position[1]))].sort((a, b) => a - b);
  };

  // Get compartment bounds for a column and row index within that column
  const getCompartmentBoundsForColumn = (col: number, rowInCol: number, shelfYsInCol: number[]) => {
    const { leftX, rightX, centerX, width } = getColumnXBounds(col);
    const rowCount = shelfYsInCol.length + 1;

    // Y boundaries based on shelves in THIS column only
    const bottomY = rowInCol === 0 ? Leg + T : shelfYsInCol[rowInCol - 1] + T/2;
    const topY = rowInCol === rowCount - 1 ? Leg + bodyH - T : shelfYsInCol[rowInCol] - T/2;

    return {
      leftX,
      rightX,
      bottomY,
      topY,
      width,
      height: Math.round((topY - bottomY) * 10) / 10,
      centerX,
      centerY: (bottomY + topY) / 2,
    };
  };

  // Handle clicking height label to edit
  const handleHeightClick = (col: number, row: number, currentHeight: number, shelfYsInCol: number[]) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputValue(Math.round(currentHeight).toString());
    setEditingCell({ col, row, field: 'height' });
  };

  // Handle submitting new height value
  const handleHeightSubmit = (col: number, row: number, shelfYsInCol: number[]) => {
    const newHeight = parseInt(inputValue, 10);
    if (!isNaN(newHeight) && newHeight > 0) {
      // Find shelves in this column at this row's Y position
      if (row < shelfYsInCol.length) {
        const targetY = shelfYsInCol[row];
        const shelvesAtY = getShelvesInColumn(col).filter(s => s.position[1] === targetY);

        if (shelvesAtY.length > 0) {
          // Calculate new gapFromBelow based on desired compartment height
          const bottomY = row === 0 ? Leg + T : shelfYsInCol[row - 1] + T/2;
          const newGapFromBelow = (bottomY - Leg - T) + newHeight;

          // Update shelves at this Y position
          shelvesAtY.forEach(shelf => {
            updatePanelPositionOverride(shelf.id, 'gapFromBelow', newGapFromBelow);
          });
        }
      }
    }
    setEditingCell(null);
  };

  // Get moveDivider action from store
  const moveDivider = useCabinetStore((s) => s.moveDivider);

  // Handle submitting new width value - moves the divider on the RIGHT side of this column
  const handleWidthSubmit = (col: number) => {
    const newWidth = parseInt(inputValue, 10);
    if (!isNaN(newWidth) && newWidth > 0) {
      const { leftX, width: currentWidth } = getColumnXBounds(col);
      const widthChange = newWidth - currentWidth;

      // If this is the last column, we can't adjust (no divider on right)
      // For other columns, move the divider on the RIGHT side
      if (col < dividerPanels.length) {
        const dividerToMove = dividerPanels[col];
        if (dividerToMove) {
          // Calculate new X position for the divider
          const currentDividerX = dividerToMove.position[0];
          const newDividerX = currentDividerX + widthChange;

          // Move the divider using store action
          moveDivider(col, newDividerX);
        }
      }
    }
    setEditingCell(null);
  };

  const handleKeyDown = (col: number, row: number, shelfYsInCol: number[]) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleHeightSubmit(col, row, shelfYsInCol);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const lineColor = '#3b82f6'; // Blue color for dimension lines
  const zPos = D / 2 + 5; // Position in front of cabinet

  return (
    <group name="compartment-dimensions">
      {/* === HEIGHT DIMENSIONS - Per column, per compartment === */}
      {Array.from({ length: columnCount }, (_, col) => {
        const shelfYsInCol = getShelfYPositionsInColumn(col);
        const rowCountInCol = shelfYsInCol.length + 1;

        return Array.from({ length: rowCountInCol }, (_, row) => {
          const bounds = getCompartmentBoundsForColumn(col, row, shelfYsInCol);
          if (bounds.height <= 0) return null;

          const isEditingHeight = editingCell?.col === col && editingCell?.row === row && editingCell?.field === 'height';
          const canEditHeight = row < shelfYsInCol.length;

          // Height line in CENTER of each compartment
          const heightLineX = bounds.centerX;

          return (
            <group key={`height-${col}-${row}`}>
              {/* Vertical dimension line */}
              <DimensionLine
                points={[[heightLineX, bounds.bottomY + 3, zPos], [heightLineX, bounds.topY - 3, zPos]]}
                color={lineColor}
              />
              {/* Arrow heads (horizontal ticks at top and bottom) */}
              <DimensionLine
                points={[[heightLineX - 8, bounds.bottomY + 3, zPos], [heightLineX + 8, bounds.bottomY + 3, zPos]]}
                color={lineColor}
              />
              <DimensionLine
                points={[[heightLineX - 8, bounds.topY - 3, zPos], [heightLineX + 8, bounds.topY - 3, zPos]]}
                color={lineColor}
              />
              {/* Height label - solid blue box like reference */}
              <Html position={[heightLineX, bounds.centerY, zPos]} center style={{ pointerEvents: 'auto' }}>
                {isEditingHeight ? (
                  <div onClick={e => e.stopPropagation()}>
                    <input
                      type="number"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown(col, row, shelfYsInCol)}
                      onBlur={() => handleHeightSubmit(col, row, shelfYsInCol)}
                      autoFocus
                      className="w-14 bg-blue-600 border-2 border-white rounded px-1 py-0.5 text-white text-center text-[11px] font-bold focus:outline-none"
                      min={50}
                    />
                  </div>
                ) : (
                  <button
                    onClick={canEditHeight ? handleHeightClick(col, row, bounds.height, shelfYsInCol) : undefined}
                    className={`bg-blue-500 ${canEditHeight ? 'hover:bg-blue-400 cursor-pointer' : 'cursor-default'} text-white px-2 py-0.5 rounded text-[11px] font-bold shadow-lg whitespace-nowrap transition-colors`}
                    title={canEditHeight ? 'Click to edit' : ''}
                  >
                    {bounds.height}
                  </button>
                )}
              </Html>
            </group>
          );
        });
      }).flat()}

      {/* === WIDTH DIMENSIONS - ONE per COLUMN at bottom, clickable to edit === */}
      {Array.from({ length: columnCount }, (_, col) => {
        const { leftX, rightX, centerX, width } = getColumnXBounds(col);
        if (width <= 0) return null;

        // Position BELOW the cabinet (outside)
        const widthLineY = Leg - 20;
        const isEditingWidth = editingCell?.col === col && editingCell?.row === -1 && editingCell?.field === 'width';

        return (
          <group key={`width-col-${col}`}>
            {/* Horizontal dimension line */}
            <DimensionLine
              points={[[leftX + 3, widthLineY, zPos], [rightX - 3, widthLineY, zPos]]}
              color={lineColor}
            />
            {/* Arrow heads (vertical ticks at left and right) */}
            <DimensionLine
              points={[[leftX + 3, widthLineY - 8, zPos], [leftX + 3, widthLineY + 8, zPos]]}
              color={lineColor}
            />
            <DimensionLine
              points={[[rightX - 3, widthLineY - 8, zPos], [rightX - 3, widthLineY + 8, zPos]]}
              color={lineColor}
            />
            {/* Width label - solid blue box, clickable to edit */}
            <Html position={[centerX, widthLineY, zPos]} center style={{ pointerEvents: 'auto' }}>
              {isEditingWidth ? (
                <div onClick={e => e.stopPropagation()}>
                  <input
                    type="number"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleWidthSubmit(col);
                      } else if (e.key === 'Escape') {
                        setEditingCell(null);
                      }
                    }}
                    onBlur={() => handleWidthSubmit(col)}
                    autoFocus
                    className="w-14 bg-blue-600 border-2 border-white rounded px-1 py-0.5 text-white text-center text-[11px] font-bold focus:outline-none"
                    min={50}
                  />
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setInputValue(Math.round(width).toString());
                    setEditingCell({ col, row: -1, field: 'width' });
                  }}
                  className="bg-blue-500 hover:bg-blue-400 cursor-pointer text-white px-2 py-0.5 rounded text-[11px] font-bold shadow-lg whitespace-nowrap transition-colors"
                  title="Click to edit column width"
                >
                  {width}
                </button>
              )}
            </Html>
          </group>
        );
      })}
    </group>
  );
}

// Partial Divider Position Labels - Show editable X position for partial dividers
function PartialDividerPositionLabels() {
  const cabinet = useCabinet();
  const movePartialDividerById = useCabinetStore((s) => s.movePartialDividerById);

  const [editingDivider, setEditingDivider] = useState<{ id: string; field: 'left' | 'right' } | null>(null);
  const [inputValue, setInputValue] = useState('');

  if (!cabinet) return null;

  const { width: W, height: H, depth: D, toeKickHeight: Leg } = cabinet.dimensions;
  const { panels } = cabinet;
  const T = 18;

  // Get full-height dividers (column boundaries)
  const usableHeight = H - 2 * T;
  const fullHeightDividers = panels
    .filter(p => p.role === 'DIVIDER')
    .filter(p => p.finishHeight >= usableHeight - 10)
    .sort((a, b) => a.position[0] - b.position[0]);
  const dividerXPositions = fullHeightDividers.map(p => p.position[0]);
  const columnCount = dividerXPositions.length + 1;

  // Get partial dividers (not full-height)
  const partialDividers = panels
    .filter(p => p.role === 'DIVIDER')
    .filter(p => p.finishHeight < usableHeight - 10)
    .sort((a, b) => a.position[0] - b.position[0]); // Sort by X position

  if (partialDividers.length === 0) return null;

  // Helper to find which column a position is in
  const findColumnForX = (x: number) => {
    let col = 0;
    for (let i = 0; i < dividerXPositions.length; i++) {
      if (x > dividerXPositions[i]) {
        col = i + 1;
      }
    }
    return col;
  };

  // Get column boundaries
  const getColumnBounds = (col: number) => {
    const leftX = col === 0 ? -W/2 + T : dividerXPositions[col - 1] + T/2;
    const rightX = col === columnCount - 1 ? W/2 - T : dividerXPositions[col] - T/2;
    return { leftX, rightX, width: rightX - leftX };
  };

  // Get compartment bounds for a specific partial divider
  // This considers other partial dividers in the same row/column
  const getCompartmentBoundsForDivider = (divider: CabinetPanel) => {
    const dividerX = divider.position[0];
    const dividerY = divider.position[1];
    const col = findColumnForX(dividerX);
    const colBounds = getColumnBounds(col);

    // Find other partial dividers in the same column and similar Y position (same row)
    const dividersInSameRow = partialDividers.filter(pd => {
      if (pd.id === divider.id) return false;
      const pdCol = findColumnForX(pd.position[0]);
      if (pdCol !== col) return false;
      // Check if at similar Y position (within height tolerance)
      const yDiff = Math.abs(pd.position[1] - dividerY);
      return yDiff < divider.finishHeight / 2;
    }).sort((a, b) => a.position[0] - b.position[0]);

    // Find the closest divider to the left
    const dividersToLeft = dividersInSameRow.filter(pd => pd.position[0] < dividerX);
    const closestLeft = dividersToLeft.length > 0 ? dividersToLeft[dividersToLeft.length - 1] : null;

    // Find the closest divider to the right
    const dividersToRight = dividersInSameRow.filter(pd => pd.position[0] > dividerX);
    const closestRight = dividersToRight.length > 0 ? dividersToRight[0] : null;

    // Calculate actual compartment boundaries
    const leftBoundary = closestLeft ? closestLeft.position[0] + T/2 : colBounds.leftX;
    const rightBoundary = closestRight ? closestRight.position[0] - T/2 : colBounds.rightX;

    return { leftX: leftBoundary, rightX: rightBoundary };
  };

  const handleLeftClick = (divider: CabinetPanel, leftDistance: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputValue(Math.round(leftDistance).toString());
    setEditingDivider({ id: divider.id, field: 'left' });
  };

  const handleRightClick = (divider: CabinetPanel, rightDistance: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputValue(Math.round(rightDistance).toString());
    setEditingDivider({ id: divider.id, field: 'right' });
  };

  const handleSubmit = (divider: CabinetPanel, field: 'left' | 'right', compartmentBounds: { leftX: number; rightX: number }) => {
    const newDistance = parseInt(inputValue, 10);
    if (!isNaN(newDistance) && newDistance > 0) {
      let newX: number;
      if (field === 'left') {
        // Distance from left boundary
        newX = compartmentBounds.leftX + newDistance + T/2;
      } else {
        // Distance from right boundary
        newX = compartmentBounds.rightX - newDistance - T/2;
      }
      movePartialDividerById(divider.id, newX);
    }
    setEditingDivider(null);
  };

  const handleKeyDown = (divider: CabinetPanel, field: 'left' | 'right', compartmentBounds: { leftX: number; rightX: number }) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit(divider, field, compartmentBounds);
    } else if (e.key === 'Escape') {
      setEditingDivider(null);
    }
  };

  const zPos = D / 2 + 5; // Position in front of cabinet
  const lineColor = '#f97316'; // Orange for partial dividers

  return (
    <group name="partial-divider-positions">
      {partialDividers.map((divider) => {
        const dividerX = divider.position[0];
        const dividerY = divider.position[1];

        // Get compartment bounds considering other partial dividers in same row
        const compartmentBounds = getCompartmentBoundsForDivider(divider);

        // Calculate distances from compartment boundaries (not column boundaries)
        const leftDistance = Math.round((dividerX - T/2 - compartmentBounds.leftX) * 10) / 10;
        const rightDistance = Math.round((compartmentBounds.rightX - dividerX - T/2) * 10) / 10;

        const isEditingLeft = editingDivider?.id === divider.id && editingDivider?.field === 'left';
        const isEditingRight = editingDivider?.id === divider.id && editingDivider?.field === 'right';

        // Dimension line Y position - slightly above the divider
        const labelY = dividerY + divider.finishHeight / 2 + 20;

        return (
          <group key={`partial-divider-${divider.id}`}>
            {/* Left dimension line */}
            <DimensionLine
              points={[[compartmentBounds.leftX + 3, labelY, zPos], [dividerX - T/2 - 3, labelY, zPos]]}
              color={lineColor}
            />
            {/* Left end tick */}
            <DimensionLine
              points={[[compartmentBounds.leftX + 3, labelY - 8, zPos], [compartmentBounds.leftX + 3, labelY + 8, zPos]]}
              color={lineColor}
            />
            {/* Divider left tick */}
            <DimensionLine
              points={[[dividerX - T/2 - 3, labelY - 8, zPos], [dividerX - T/2 - 3, labelY + 8, zPos]]}
              color={lineColor}
            />

            {/* Left distance label */}
            <Html position={[(compartmentBounds.leftX + dividerX - T/2) / 2, labelY, zPos]} center style={{ pointerEvents: 'auto' }}>
              {isEditingLeft ? (
                <div onClick={e => e.stopPropagation()}>
                  <input
                    type="number"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown(divider, 'left', compartmentBounds)}
                    onBlur={() => handleSubmit(divider, 'left', compartmentBounds)}
                    autoFocus
                    className="w-14 bg-orange-600 border-2 border-white rounded px-1 py-0.5 text-white text-center text-[11px] font-bold focus:outline-none"
                    min={50}
                  />
                </div>
              ) : (
                <button
                  onClick={handleLeftClick(divider, leftDistance)}
                  className="bg-orange-500 hover:bg-orange-400 text-white text-[11px] px-2 py-0.5 rounded font-bold cursor-pointer transition-colors"
                  title="Click to adjust left distance"
                >
                  {Math.round(leftDistance)} mm
                </button>
              )}
            </Html>

            {/* Right dimension line */}
            <DimensionLine
              points={[[dividerX + T/2 + 3, labelY, zPos], [compartmentBounds.rightX - 3, labelY, zPos]]}
              color={lineColor}
            />
            {/* Divider right tick */}
            <DimensionLine
              points={[[dividerX + T/2 + 3, labelY - 8, zPos], [dividerX + T/2 + 3, labelY + 8, zPos]]}
              color={lineColor}
            />
            {/* Right end tick */}
            <DimensionLine
              points={[[compartmentBounds.rightX - 3, labelY - 8, zPos], [compartmentBounds.rightX - 3, labelY + 8, zPos]]}
              color={lineColor}
            />

            {/* Right distance label */}
            <Html position={[(dividerX + T/2 + compartmentBounds.rightX) / 2, labelY, zPos]} center style={{ pointerEvents: 'auto' }}>
              {isEditingRight ? (
                <div onClick={e => e.stopPropagation()}>
                  <input
                    type="number"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown(divider, 'right', compartmentBounds)}
                    onBlur={() => handleSubmit(divider, 'right', compartmentBounds)}
                    autoFocus
                    className="w-14 bg-orange-600 border-2 border-white rounded px-1 py-0.5 text-white text-center text-[11px] font-bold focus:outline-none"
                    min={50}
                  />
                </div>
              ) : (
                <button
                  onClick={handleRightClick(divider, rightDistance)}
                  className="bg-orange-500 hover:bg-orange-400 text-white text-[11px] px-2 py-0.5 rounded font-bold cursor-pointer transition-colors"
                  title="Click to adjust right distance"
                >
                  {Math.round(rightDistance)} mm
                </button>
              )}
            </Html>
          </group>
        );
      })}
    </group>
  );
}

// Compartment Interaction - Right-click to show green highlight and + button
// Allows adding shelves or dividers within a specific compartment
// Now supports sub-compartments created by partial dividers
function CompartmentInteraction() {
  const cabinet = useCabinet();
  const addShelfInCompartment = useCabinetStore((s) => s.addShelfInCompartment);
  const addDividerInCompartment = useCabinetStore((s) => s.addDividerInCompartment);

  // State for selected compartment (now includes subCol for partial divider sub-compartments)
  const [selectedCompartment, setSelectedCompartment] = useState<{
    col: number;
    row: number;
    subCol: number; // Index within sub-compartments (0 = leftmost)
    bounds: {
      leftX: number;
      rightX: number;
      bottomY: number;
      topY: number;
      centerX: number;
      centerY: number;
    };
  } | null>(null);

  // State for popup menu - 'menu' = show shelf/divider options, 'quantity' = show quantity input
  const [popupMode, setPopupMode] = useState<'closed' | 'menu' | 'quantity'>('closed');

  // State for selected type (shelf or divider)
  const [selectedType, setSelectedType] = useState<'shelf' | 'divider' | null>(null);

  // State for quantity input
  const [quantity, setQuantity] = useState(1);

  if (!cabinet) return null;

  const { width: W, height: H, depth: D, toeKickHeight: Leg } = cabinet.dimensions;
  const { panels } = cabinet;
  const T = 18;
  const bodyH = H;

  // Get divider X positions
  // Only count FULL-HEIGHT dividers as column boundaries (exclude partial dividers)
  const usableHeight = H - 2 * T; // Full height minus top and bottom panels
  const dividerPanels = panels
    .filter(p => p.role === 'DIVIDER')
    .filter(p => p.finishHeight >= usableHeight - 10) // Only full-height dividers (with 10mm tolerance)
    .sort((a, b) => a.position[0] - b.position[0]);
  const dividerXPositions = dividerPanels.map(p => p.position[0]);
  const columnCount = dividerXPositions.length + 1;

  // Get PARTIAL dividers (sub-compartment boundaries within rows)
  const partialDividers = panels
    .filter(p => p.role === 'DIVIDER')
    .filter(p => p.finishHeight < usableHeight - 10); // Only partial-height dividers

  // Get column X boundaries
  const getColumnXBounds = (col: number) => {
    const leftX = col === 0 ? -W/2 + T : dividerXPositions[col - 1] + T/2;
    const rightX = col === columnCount - 1 ? W/2 - T : dividerXPositions[col] - T/2;
    const columnWidth = rightX - leftX;
    return { leftX, rightX, centerX: (leftX + rightX) / 2, columnWidth };
  };

  // Get shelves in column
  // Only count FULL-WIDTH shelves as row boundaries (exclude partial shelves)
  const getShelvesInColumn = (col: number) => {
    const { leftX, rightX, columnWidth } = getColumnXBounds(col);
    const colCenterX = (leftX + rightX) / 2;

    return panels
      .filter(p => p.role === 'SHELF')
      .filter(p => {
        const shelfX = p.position[0];
        const shelfHalfWidth = p.finishWidth / 2;
        // Check if shelf overlaps with column center
        const overlapsColumn = shelfX - shelfHalfWidth <= colCenterX && shelfX + shelfHalfWidth >= colCenterX;
        // Check if shelf spans most of the column width (at least 80%)
        const isFullWidth = p.finishWidth >= columnWidth * 0.8;
        return overlapsColumn && isFullWidth;
      })
      .sort((a, b) => a.position[1] - b.position[1]);
  };

  const getShelfYPositionsInColumn = (col: number) => {
    const shelves = getShelvesInColumn(col);
    return [...new Set(shelves.map(s => s.position[1]))].sort((a, b) => a - b);
  };

  // Find which column a X position belongs to
  const findColumnForX = (x: number): number => {
    for (let col = 0; col < columnCount; col++) {
      const { leftX, rightX } = getColumnXBounds(col);
      if (x >= leftX && x <= rightX) return col;
    }
    return 0;
  };

  // Get partial dividers within a specific row (defined by Y bounds)
  const getPartialDividersInRow = (col: number, bottomY: number, topY: number) => {
    const { leftX, rightX } = getColumnXBounds(col);
    const rowCenterY = (bottomY + topY) / 2;
    const rowHeight = topY - bottomY;

    return partialDividers
      .filter(pd => {
        // Check if divider is in this column
        const pdCol = findColumnForX(pd.position[0]);
        if (pdCol !== col) return false;

        // Check if divider overlaps with this row's Y range
        const dividerBottomY = pd.position[1] - pd.finishHeight / 2;
        const dividerTopY = pd.position[1] + pd.finishHeight / 2;

        // Divider should overlap significantly with the row
        const overlapBottom = Math.max(bottomY, dividerBottomY);
        const overlapTop = Math.min(topY, dividerTopY);
        const overlap = overlapTop - overlapBottom;

        return overlap > rowHeight * 0.3; // At least 30% overlap
      })
      .sort((a, b) => a.position[0] - b.position[0]);
  };

  // Get sub-compartment X boundaries based on partial dividers in a row
  const getSubCompartmentsInRow = (col: number, row: number) => {
    const { leftX, rightX } = getColumnXBounds(col);
    const shelfYs = getShelfYPositionsInColumn(col);
    const rowCount = shelfYs.length + 1;

    const bottomY = row === 0 ? Leg + T : shelfYs[row - 1] + T/2;
    const topY = row === rowCount - 1 ? Leg + bodyH - T : shelfYs[row] - T/2;

    // Get partial dividers in this row
    const dividersInRow = getPartialDividersInRow(col, bottomY, topY);

    // Create sub-compartment boundaries
    const subCompartments: { leftX: number; rightX: number; bottomY: number; topY: number }[] = [];

    if (dividersInRow.length === 0) {
      // No partial dividers - single compartment
      subCompartments.push({ leftX, rightX, bottomY, topY });
    } else {
      // Create sub-compartments between partial dividers
      let currentLeftX = leftX;

      for (const divider of dividersInRow) {
        const dividerLeftEdge = divider.position[0] - T/2;
        if (dividerLeftEdge > currentLeftX + 20) { // Min 20mm sub-compartment
          subCompartments.push({
            leftX: currentLeftX,
            rightX: dividerLeftEdge,
            bottomY,
            topY,
          });
        }
        currentLeftX = divider.position[0] + T/2;
      }

      // Add final sub-compartment after last divider
      if (rightX > currentLeftX + 20) {
        subCompartments.push({
          leftX: currentLeftX,
          rightX,
          bottomY,
          topY,
        });
      }
    }

    return subCompartments;
  };

  // Get compartment bounds (including sub-compartment index)
  const getCompartmentBounds = (col: number, row: number, subCol: number = 0) => {
    const subCompartments = getSubCompartmentsInRow(col, row);
    const sub = subCompartments[Math.min(subCol, subCompartments.length - 1)] || subCompartments[0];

    if (!sub) {
      // Fallback to full row bounds
      const { leftX, rightX } = getColumnXBounds(col);
      const shelfYs = getShelfYPositionsInColumn(col);
      const rowCount = shelfYs.length + 1;
      const bottomY = row === 0 ? Leg + T : shelfYs[row - 1] + T/2;
      const topY = row === rowCount - 1 ? Leg + bodyH - T : shelfYs[row] - T/2;
      return {
        leftX,
        rightX,
        bottomY,
        topY,
        centerX: (leftX + rightX) / 2,
        centerY: (bottomY + topY) / 2,
        width: rightX - leftX,
        height: topY - bottomY,
      };
    }

    return {
      leftX: sub.leftX,
      rightX: sub.rightX,
      bottomY: sub.bottomY,
      topY: sub.topY,
      centerX: (sub.leftX + sub.rightX) / 2,
      centerY: (sub.bottomY + sub.topY) / 2,
      width: sub.rightX - sub.leftX,
      height: sub.topY - sub.bottomY,
    };
  };

  // Handle right click on compartment (now with subCol)
  const handleContextMenu = (col: number, row: number, subCol: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // Prevent default browser context menu
    if (e.nativeEvent) {
      e.nativeEvent.preventDefault();
    }

    const bounds = getCompartmentBounds(col, row, subCol);
    setSelectedCompartment({ col, row, subCol, bounds });
    setPopupMode('closed');
    setSelectedType(null);
    setQuantity(1);
  };

  // Handle clicking the + button
  const handlePlusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPopupMode('menu');
  };

  // Handle selecting shelf type - show quantity input
  const handleSelectShelf = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedType('shelf');
    setQuantity(1);
    setPopupMode('quantity');
  };

  // Handle selecting divider type - show quantity input
  const handleSelectDivider = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedType('divider');
    setQuantity(1);
    setPopupMode('quantity');
  };

  // Handle confirming quantity and adding items
  const handleConfirmQuantity = () => {
    if (!selectedCompartment) return;

    const count = Math.max(1, Math.min(10, quantity)); // Clamp between 1-10

    if (selectedType === 'shelf' && addShelfInCompartment) {
      // Add shelves - evenly distributed in the compartment
      for (let i = 0; i < count; i++) {
        // Calculate Y position for each shelf to distribute evenly
        const compartmentHeight = selectedCompartment.bounds.topY - selectedCompartment.bounds.bottomY;
        const spacing = compartmentHeight / (count + 1);
        const shelfY = selectedCompartment.bounds.bottomY + spacing * (i + 1);

        // Create bounds with adjusted centerY for this specific shelf
        const shelfBounds = {
          ...selectedCompartment.bounds,
          centerY: shelfY,
        };
        addShelfInCompartment(selectedCompartment.col, selectedCompartment.row, shelfBounds);
      }
    } else if (selectedType === 'divider' && addDividerInCompartment) {
      // Add dividers - evenly distributed in the compartment
      for (let i = 0; i < count; i++) {
        // Calculate X position for each divider to distribute evenly
        const compartmentWidth = selectedCompartment.bounds.rightX - selectedCompartment.bounds.leftX;
        const spacing = compartmentWidth / (count + 1);
        const dividerX = selectedCompartment.bounds.leftX + spacing * (i + 1);

        // Create bounds with adjusted centerX for this specific divider
        // Keep original bounds for height calculation, only override centerX for position
        const dividerBounds = {
          ...selectedCompartment.bounds,
          centerX: dividerX,
        };
        addDividerInCompartment(selectedCompartment.col, selectedCompartment.row, dividerBounds);
      }
    }

    // Close everything
    setSelectedCompartment(null);
    setPopupMode('closed');
    setSelectedType(null);
    setQuantity(1);
  };

  // Handle going back to menu
  const handleBackToMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPopupMode('menu');
    setSelectedType(null);
    setQuantity(1);
  };

  // Handle closing selection
  const handleClose = () => {
    setSelectedCompartment(null);
    setPopupMode('closed');
    setSelectedType(null);
    setQuantity(1);
  };

  // Z position for interaction planes (slightly in front)
  const zPos = D / 2 - 10;

  return (
    <group name="compartment-interaction">
      {/* Invisible click planes for each sub-compartment (including partial divider splits) */}
      {Array.from({ length: columnCount }, (_, col) => {
        const shelfYs = getShelfYPositionsInColumn(col);
        const rowCount = shelfYs.length + 1;

        return Array.from({ length: rowCount }, (_, row) => {
          // Get all sub-compartments in this row (split by partial dividers)
          const subCompartments = getSubCompartmentsInRow(col, row);

          return subCompartments.map((sub, subCol) => {
            const bounds = getCompartmentBounds(col, row, subCol);
            if (bounds.height <= 10 || bounds.width <= 10) return null;

            return (
              <group key={`compartment-${col}-${row}-${subCol}`}>
                {/* Invisible click plane */}
                <mesh
                  position={[bounds.centerX, bounds.centerY, zPos]}
                  onContextMenu={handleContextMenu(col, row, subCol)}
                  onClick={() => {
                    // Click outside closes selection
                    if (selectedCompartment && (
                      selectedCompartment.col !== col ||
                      selectedCompartment.row !== row ||
                      selectedCompartment.subCol !== subCol
                    )) {
                      handleClose();
                    }
                  }}
                >
                  <planeGeometry args={[bounds.width - 4, bounds.height - 4]} />
                  <meshBasicMaterial transparent opacity={0} />
                </mesh>
              </group>
            );
          });
        });
      }).flat(2)}

      {/* Green highlight box for selected compartment */}
      {selectedCompartment && (
        <group name="selected-compartment-highlight">
          {/* Green border using lines */}
          <GreenHighlightBox bounds={selectedCompartment.bounds} zPos={zPos + 1} />

          {/* Plus button at center */}
          <Html
            position={[selectedCompartment.bounds.centerX, selectedCompartment.bounds.centerY, zPos + 2]}
            center
            style={{ pointerEvents: 'auto' }}
          >
            {popupMode === 'closed' ? (
              <button
                onClick={handlePlusClick}
                className="w-10 h-10 bg-emerald-500/20 hover:bg-emerald-500/40 border-2 border-emerald-500/50 rounded-lg flex items-center justify-center transition-all cursor-pointer"
                title="Add Shelf or Divider"
              >
                <svg className="w-6 h-6 text-emerald-400/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            ) : popupMode === 'menu' ? (
              <div
                className="bg-zinc-900/95 border border-emerald-500/50 rounded-lg shadow-2xl overflow-hidden min-w-[160px]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-2 border-b border-zinc-700 bg-emerald-900/30">
                  <span className="text-xs font-medium text-emerald-300">Add to Compartment</span>
                </div>
                <div className="p-1">
                  <button
                    onClick={handleSelectShelf}
                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-emerald-500/20 rounded flex items-center gap-2 transition-colors"
                  >
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                    Add Shelf
                  </button>
                  <button
                    onClick={handleSelectDivider}
                    className="w-full px-3 py-2 text-left text-sm text-white hover:bg-emerald-500/20 rounded flex items-center gap-2 transition-colors"
                  >
                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16" />
                    </svg>
                    Add Divider
                  </button>
                </div>
                <div className="px-1 pb-1">
                  <button
                    onClick={handleClose}
                    className="w-full px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-700/50 rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Quantity input popup */
              <div
                className="bg-zinc-900/95 border border-emerald-500/50 rounded-lg shadow-2xl overflow-hidden min-w-[180px]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-2 border-b border-zinc-700 bg-emerald-900/30 flex items-center gap-2">
                  <button
                    onClick={handleBackToMenu}
                    className="p-0.5 hover:bg-zinc-700 rounded transition-colors"
                    title="Back"
                  >
                    <svg className="w-4 h-4 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-xs font-medium text-emerald-300">
                    Add {selectedType === 'shelf' ? 'Shelves' : 'Dividers'}
                  </span>
                </div>
                <div className="p-3">
                  <label className="block text-xs text-zinc-400 mb-2">Quantity (1-10)</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="w-8 h-8 bg-zinc-700 hover:bg-zinc-600 text-white rounded flex items-center justify-center transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                      className="w-14 h-8 bg-zinc-800 border border-zinc-600 rounded text-center text-white text-sm focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={() => setQuantity(q => Math.min(10, q + 1))}
                      className="w-8 h-8 bg-zinc-700 hover:bg-zinc-600 text-white rounded flex items-center justify-center transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">
                    {quantity > 1
                      ? `Will be evenly distributed`
                      : `Add 1 ${selectedType} at center`
                    }
                  </p>
                </div>
                <div className="px-3 pb-3 flex gap-2">
                  <button
                    onClick={handleClose}
                    className="flex-1 px-3 py-2 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmQuantity}
                    className="flex-1 px-3 py-2 text-xs text-white bg-emerald-600 hover:bg-emerald-500 rounded font-medium transition-colors"
                  >
                    Add {quantity}
                  </button>
                </div>
              </div>
            )}
          </Html>
        </group>
      )}
    </group>
  );
}

// Green highlight box component with dashed border effect
function GreenHighlightBox({ bounds, zPos }: {
  bounds: { leftX: number; rightX: number; bottomY: number; topY: number };
  zPos: number;
}) {
  const { leftX, rightX, bottomY, topY } = bounds;
  const padding = 2;
  const lineColor = '#10b981'; // Emerald-500

  // Create dashed line effect using multiple small segments
  const dashLength = 8;
  const gapLength = 4;

  const createDashedLine = (
    start: [number, number, number],
    end: [number, number, number]
  ) => {
    const segments: [number, number, number][][] = [];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    const unitX = dx / length;
    const unitY = dy / length;

    let currentLength = 0;
    let isDash = true;

    while (currentLength < length) {
      const segmentLength = isDash ? dashLength : gapLength;
      const endLength = Math.min(currentLength + segmentLength, length);

      if (isDash) {
        const segStart: [number, number, number] = [
          start[0] + unitX * currentLength,
          start[1] + unitY * currentLength,
          start[2]
        ];
        const segEnd: [number, number, number] = [
          start[0] + unitX * endLength,
          start[1] + unitY * endLength,
          start[2]
        ];
        segments.push([segStart, segEnd]);
      }

      currentLength = endLength;
      isDash = !isDash;
    }

    return segments;
  };

  // Create all dashed segments for the box
  const topLine = createDashedLine([leftX + padding, topY - padding, zPos], [rightX - padding, topY - padding, zPos]);
  const bottomLine = createDashedLine([leftX + padding, bottomY + padding, zPos], [rightX - padding, bottomY + padding, zPos]);
  const leftLine = createDashedLine([leftX + padding, bottomY + padding, zPos], [leftX + padding, topY - padding, zPos]);
  const rightLine = createDashedLine([rightX - padding, bottomY + padding, zPos], [rightX - padding, topY - padding, zPos]);

  const allSegments = [...topLine, ...bottomLine, ...leftLine, ...rightLine];

  return (
    <group name="green-highlight">
      {allSegments.map((segment, i) => (
        <DimensionLine key={`dash-${i}`} points={segment} color={lineColor} />
      ))}
    </group>
  );
}
