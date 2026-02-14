/**
 * MinifixConfigPanel - Minifix Config Editor (Indetails Smart Style)
 *
 * Configuration panel for Häfele S200 Minifix bolt parameters.
 * UI matches Indetails Smart Minifix Config Editor design.
 *
 * Tabs:
 * - Type: Minifix type selection
 * - Cam: Cam housing parameters
 * - Sleeve: Sleeve parameters (highlighted section)
 * - Bolt: S200 Bolt parameters
 * - Dowel: Alignment dowel parameters
 *
 * v1.2: Added live 3D preview with S200 Bolt visualization
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚠️ CRITICAL ARCHITECTURE NOTE: Assembly Preview ≠ CNC Manufacturing Truth
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This component operates in the **Assembly Preview Domain (O_hardware)**.
 *
 * The 3D preview shown here is for VISUAL VERIFICATION of connector placement,
 * NOT for generating CNC toolpaths. The dimensions displayed here represent
 * the assembled hardware state (pilot holes + cam rotation concept).
 *
 * TWO DISTINCT DOMAINS:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Assembly Preview (this file) - O_hardware domain
 *    - Shows bolt assembled state with ball head, sleeve, shaft
 *    - Cam housing shown in "engaged" rotational position
 *    - Purpose: Designer verification of hardware fit/clearance
 *    - Uses: MinifixFullConfig (visual dimensions only)
 *
 * 2. CNC Manufacturing - O_panel domain (see: mapMinifixToOps.ts)
 *    - Generates actual drilling operations
 *    - Cam: 15mm Ø bore, depth per wood thickness
 *    - Bolt: 5mm or 8mm pilot hole, specific depth
 *    - Purpose: Machine-ready G-code operations
 *    - Uses: PacketMinifixPair.cncSpec (not assemblySpec!)
 *
 * ⚠️ The preview sliders here DO NOT affect CNC output directly.
 *    CNC parameters are derived from validated packet data, not UI config.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback, Suspense, useMemo, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { DEFAULT_CAM_SPEC, CamSpec } from '../../core/manufacturing/hardware/hardwareTypes';
import { S200Bolt3D, CamHousing3D, Dowel3D, S200BoltConfig } from '../canvas/Hardware3D';
import { RotateCcw, Copy, ChevronLeft, Eye, EyeOff, Link, Unlink } from 'lucide-react';

// ============================================
// S200 BOLT FULL CONFIGURATION
// ============================================

export interface MinifixFullConfig {
  // Type
  minifixType: '15' | '12';

  // Drilling Distance
  drillingDistanceB: 24 | 34;

  // Wood Thickness (for Cam selection)
  woodThickness: number;

  // Ball Head (หัวกลม)
  ballHeadDia: number;
  ballHeadOffset: number;

  // Neck Shaft (แกนเหล็ก) - connects ball head to sleeve
  neckShaftDia: number;
  neckShaftLength: number;
  neckShaftOffset: number;

  // Sleeve (ปลอก)
  sleeveDia: number;
  sleeveLength: number;
  sleeveOffset: number;

  // Threaded Shaft (ก้านเกลียว)
  shaftDia: number;
  shaftLength: number;
  shaftOffset: number;

  // Cam Housing (from Häfele Minifix 15 catalog)
  camDia: number;           // 15mm (Minifix 15)
  camDepth: number;         // Drilling depth D (varies by wood thickness)
  camHeight: number;        // Dim. A (internal height)
  camRimDia: number;        // Rim/flange diameter
  camRimHeight: number;     // Rim height
  camOffset: number;        // Offset for assembly positioning

  // Dowel
  includeDowel: boolean;   // Whether to include dowels in the assembly
  dowelDia: number;
  dowelLength: number;
  dowelOffset: number;

  // Transform (Hardware Manipulation)
  flipVertical: boolean;   // Vertical flip (V)
  flipHorizontal: boolean; // Horizontal flip (H)
  rotationX: number;       // Fine rotation X (degrees)
  rotationY: number;       // Fine rotation Y (degrees)
  rotationZ: number;       // Fine rotation Z (degrees)
  moveX: number;           // Move hardware X (mm)
  moveY: number;           // Move hardware Y (mm)
  moveZ: number;           // Move hardware Z (mm)

  // Display Preferences (UI State saved with preset)
  showDimensions: boolean; // Show dimension annotations in 3D preview
}

// ============================================
// HÄFELE MINIFIX 15 CAM SPECIFICATIONS
// From catalog: Wood thickness → Drilling depth D → Dim. A
// ============================================

export const CAM_SPECS_BY_WOOD_THICKNESS: Record<number, { drillingDepth: number; dimA: number }> = {
  12: { drillingDepth: 9.5, dimA: 6 },
  13: { drillingDepth: 11.0, dimA: 6.5 },
  15: { drillingDepth: 12.0, dimA: 7.5 },
  16: { drillingDepth: 12.5, dimA: 8 },
  18: { drillingDepth: 13.5, dimA: 9 },
  19: { drillingDepth: 14.0, dimA: 9.5 },
  22: { drillingDepth: 16.0, dimA: 11 },
  23: { drillingDepth: 16.5, dimA: 11.5 },
  26: { drillingDepth: 18.0, dimA: 13 },
  29: { drillingDepth: 19.5, dimA: 14.5 },
};

export const DEFAULT_MINIFIX_CONFIG: MinifixFullConfig = {
  minifixType: '15',
  drillingDistanceB: 24,  // 24mm per CAD spec (Indetails standard)
  woodThickness: 18, // Default 18mm panel
  // Ball Head (หัวกลม) - Häfele S200: Ø6.5mm (per catalog "Ø 6.5 mm bolt head")
  ballHeadDia: 6.5,
  ballHeadOffset: 0,
  // Neck Shaft (แกนเหล็ก) - Häfele S200: Ø6.5mm × 6.5mm
  // B = Ball Head/2 (3.25) + Neck (6.5) + Sleeve (14.25) = 24mm
  neckShaftDia: 6.5,
  neckShaftLength: 6.5,
  neckShaftOffset: 0,
  // Sleeve (ปลอก) - Ø10mm × 14.25mm
  sleeveDia: 10,
  sleeveLength: 14.25,
  sleeveOffset: 0, // Default 0, user can adjust
  // Shaft (ก้านเกลียว) - from CAD: Ø5mm × 11mm
  shaftDia: 5, // CAD shows 5mm
  shaftLength: 11, // CAD shows 11mm for lower section
  shaftOffset: 0,
  // Cam Housing (for 18mm wood: D=13.5mm, A=9mm)
  camDia: 15,
  camDepth: 13.5,    // Drilling depth D for 18mm wood
  camHeight: 9,      // Dim. A for 18mm wood
  camRimDia: 16.5,   // Rim diameter (slightly larger than cam)
  camRimHeight: 2,   // Rim/flange height
  camOffset: 0,      // Offset for positioning
  // Dowel
  includeDowel: false,     // Dowels disabled by default (enable explicitly when needed)
  dowelDia: 8,
  dowelLength: 30,
  dowelOffset: 6,
  // Transform (default: no transformation)
  flipVertical: false,
  flipHorizontal: false,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  moveX: 0,
  moveY: 0,
  moveZ: 0,
  // Display Preferences
  showDimensions: true,    // Show dimension annotations by default
};

// ============================================
// HELPER: Get Minifix Config by Wood Thickness
// ============================================

/**
 * Get Minifix S200 configuration for a specific wood thickness.
 * Returns config with correct cam drilling depth and dim A for the given thickness.
 * Falls back to nearest available thickness if exact match not found.
 */
export function getMinifixConfigForThickness(woodThickness: number): MinifixFullConfig {
  // Find exact match or nearest available thickness
  const availableThicknesses = Object.keys(CAM_SPECS_BY_WOOD_THICKNESS).map(Number);
  let targetThickness = woodThickness;

  if (!CAM_SPECS_BY_WOOD_THICKNESS[woodThickness]) {
    // Find nearest available thickness
    targetThickness = availableThicknesses.reduce((prev, curr) =>
      Math.abs(curr - woodThickness) < Math.abs(prev - woodThickness) ? curr : prev
    );
    console.log(`[Minifix] No exact match for ${woodThickness}mm, using nearest: ${targetThickness}mm`);
  }

  const camSpec = CAM_SPECS_BY_WOOD_THICKNESS[targetThickness];

  return {
    ...DEFAULT_MINIFIX_CONFIG,
    woodThickness: targetThickness,
    camDepth: camSpec.drillingDepth,
    camHeight: camSpec.dimA,
  };
}

// ============================================
// SLIDER INPUT COMPONENT (Indetails Style)
// ============================================

interface SliderInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  highlighted?: boolean;
}

function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.5,
  unit = 'mm',
  highlighted = false,
}: SliderInputProps) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[11px] text-gray-400 w-20 truncate" title={label}>
        {label}
      </span>
      <div className="flex-1 relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className={`w-full h-1 rounded-full appearance-none cursor-pointer ${
            highlighted
              ? 'bg-red-500/30 [&::-webkit-slider-thumb]:bg-red-500'
              : 'bg-gray-600 [&::-webkit-slider-thumb]:bg-orange-500'
          } [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full`}
        />
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || min)}
          className="w-14 bg-[#1e2a3a] border border-[#3a4a5a] rounded px-2 py-0.5 text-[11px] text-white text-right focus:outline-none focus:border-cyan-500"
        />
        <span className="text-[10px] text-gray-500 w-6">{unit}</span>
      </div>
    </div>
  );
}

// ============================================
// SECTION HEADER COMPONENT
// ============================================

interface SectionHeaderProps {
  icon?: React.ReactNode;
  title: string;
  titleTh?: string;
  color?: string;
  highlighted?: boolean;
}

function SectionHeader({ icon, title, titleTh, color = 'gray', highlighted = false }: SectionHeaderProps) {
  const colorClasses: Record<string, string> = {
    gray: 'text-gray-400',
    red: 'text-red-400',
    orange: 'text-orange-400',
    cyan: 'text-cyan-400',
    green: 'text-green-400',
  };

  return (
    <div className={`flex items-center gap-2 py-1.5 ${highlighted ? 'bg-red-500/10 -mx-3 px-3 rounded' : ''}`}>
      {icon && <span className={`w-2 h-2 rounded-full ${highlighted ? 'bg-red-500' : `bg-${color}-500`}`} />}
      <span className={`text-[11px] font-medium ${colorClasses[color] || colorClasses.gray}`}>
        {title} {titleTh && <span className="text-gray-500">({titleTh})</span>}
      </span>
    </div>
  );
}

// ============================================
// TAB BUTTON COMPONENT
// ============================================

interface TabButtonProps {
  icon?: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  color?: string;
}

function TabButton({ icon, label, isActive, onClick, color = 'gray' }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-all border-b-2 ${
        isActive
          ? 'text-cyan-400 border-cyan-400 bg-cyan-500/5'
          : 'text-gray-500 border-transparent hover:text-white hover:bg-white/5'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ============================================
// EDITABLE DIMENSION LABEL COMPONENT
// ============================================

interface EditableDimensionLabelProps {
  start: [number, number, number];
  end: [number, number, number];
  value: number;
  prefix?: string; // e.g., "Ø" for diameter
  suffix?: string; // e.g., " mm"
  color?: string;
  offset?: number;
  side?: 'left' | 'right';
  configKey: keyof MinifixFullConfig;
  onEdit: (key: keyof MinifixFullConfig, value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

function EditableDimensionLabel({
  start,
  end,
  value,
  prefix = '',
  suffix = '',
  color = '#ffffff',
  offset = 0.08,
  side = 'right',
  configKey,
  onEdit,
  min = 0,
  max = 100,
  step = 0.5,
}: EditableDimensionLabelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());

  const midX = (start[0] + end[0]) / 2 + (side === 'right' ? offset : -offset);
  const midY = (start[1] + end[1]) / 2;
  const midZ = (start[2] + end[2]) / 2;

  const offsetX = side === 'right' ? offset : -offset;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(value.toString());
    setIsEditing(true);
  };

  const handleBlur = () => {
    const newValue = parseFloat(editValue);
    if (!isNaN(newValue) && newValue >= min && newValue <= max) {
      onEdit(configKey, newValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <group>
      {/* Dimension line */}
      <Line
        points={[
          [start[0] + offsetX, start[1], start[2]],
          [end[0] + offsetX, end[1], end[2]],
        ]}
        color={color}
        lineWidth={1}
        dashed
        dashSize={0.01}
        gapSize={0.005}
      />
      {/* Extension lines */}
      <Line
        points={[
          [start[0], start[1], start[2]],
          [start[0] + offsetX + 0.02, start[1], start[2]],
        ]}
        color={color}
        lineWidth={0.5}
      />
      <Line
        points={[
          [end[0], end[1], end[2]],
          [end[0] + offsetX + 0.02, end[1], end[2]],
        ]}
        color={color}
        lineWidth={0.5}
      />
      {/* Editable Label */}
      <Html position={[midX + 0.03, midY, midZ]} center>
        {isEditing ? (
          <input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            min={min}
            max={max}
            step={step}
            style={{
              width: '60px',
              background: 'rgba(0,0,0,0.95)',
              padding: '3px 6px',
              borderRadius: '3px',
              fontSize: '11px',
              fontFamily: 'monospace',
              color: color,
              border: `2px solid ${color}`,
              outline: 'none',
              textAlign: 'center',
            }}
          />
        ) : (
          <div
            onClick={handleClick}
            style={{
              background: 'rgba(0,0,0,0.8)',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '10px',
              fontFamily: 'monospace',
              color: color,
              whiteSpace: 'nowrap',
              border: `1px solid ${color}40`,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.95)';
              e.currentTarget.style.border = `1px solid ${color}`;
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.8)';
              e.currentTarget.style.border = `1px solid ${color}40`;
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title="Click to edit"
          >
            {prefix}{value}{suffix}
          </div>
        )}
      </Html>
    </group>
  );
}

// ============================================
// EDITABLE DIAMETER LABEL (INLINE)
// ============================================

interface EditableDiameterLabelProps {
  position: [number, number, number];
  value: number;
  color: string;
  configKey: keyof MinifixFullConfig;
  onEdit: (key: keyof MinifixFullConfig, value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

function EditableDiameterLabel({
  position,
  value,
  color,
  configKey,
  onEdit,
  min = 0,
  max = 100,
  step = 0.5,
}: EditableDiameterLabelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toString());

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(value.toString());
    setIsEditing(true);
  };

  const handleBlur = () => {
    const newValue = parseFloat(editValue);
    if (!isNaN(newValue) && newValue >= min && newValue <= max) {
      onEdit(configKey, newValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <Html position={position} center>
      {isEditing ? (
        <input
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          min={min}
          max={max}
          step={step}
          style={{
            width: '60px',
            background: 'rgba(0,0,0,0.95)',
            padding: '3px 6px',
            borderRadius: '3px',
            fontSize: '11px',
            fontFamily: 'monospace',
            color: color,
            border: `2px solid ${color}`,
            outline: 'none',
            textAlign: 'center',
          }}
        />
      ) : (
        <div
          onClick={handleClick}
          style={{
            background: 'rgba(0,0,0,0.8)',
            padding: '2px 6px',
            borderRadius: '3px',
            fontSize: '10px',
            fontFamily: 'monospace',
            color: color,
            whiteSpace: 'nowrap',
            border: `1px solid ${color}40`,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0,0,0,0.95)';
            e.currentTarget.style.border = `1px solid ${color}`;
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0,0,0,0.8)';
            e.currentTarget.style.border = `1px solid ${color}40`;
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="Click to edit"
        >
          Ø{value}
        </div>
      )}
    </Html>
  );
}

// ============================================
// 3D PREVIEW COMPONENT
// ============================================

// ============================================
// SIDE VIEW CAMERA SETUP
// Forces camera to look perfectly from the side (90° to ground)
// Camera Y matches model center for true orthogonal view
// ============================================
function SideViewCamera() {
  const { camera } = useThree();

  useEffect(() => {
    // Position camera directly to the right of the model
    // Y=0.05 aligns with approximate center of assembled bolt
    camera.position.set(1.5, 0.05, 0);
    // Look at model center
    camera.lookAt(0, 0.05, 0);
    // Ensure up vector is Y-axis (vertical)
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

export interface Preview3DProps {
  config: MinifixFullConfig;
  showCam: boolean;
  showDowel: boolean;
  xRayMode: boolean;
  isAttached: boolean;
  showDimensions: boolean;
  onUpdateConfig: (key: keyof MinifixFullConfig, value: number) => void;
  /** Debug mode: show axis arrows to visualize model orientation */
  debugAxis?: boolean;
}

export function Preview3D({ config, showCam, showDowel, xRayMode, isAttached, showDimensions, onUpdateConfig, debugAxis = false }: Preview3DProps) {
  // Scale: 1mm in config = 0.01 units in scene (so 31mm shaft = 0.31 units)
  const scale = 0.01;

  // S200 Bolt dimensions from Häfele CAD (scaled)
  // Ball Head: Ø7.5mm × 6.5mm height (chrome steel)
  // Sleeve: Ø10mm × 17.5mm (RED plastic with PZ2)
  // Shaft: Ø5mm × 11mm (steel threaded)
  const ballHeadRadius = (config.ballHeadDia / 2) * scale;
  const sleeveDia = config.sleeveDia * scale;
  const sleeveLength = config.sleeveLength * scale;
  const shaftDia = config.shaftDia * scale;
  const shaftLength = config.shaftLength * scale;

  // Offsets from config (convert to scene units)
  const ballHeadOffsetY = config.ballHeadOffset * scale;
  const sleeveOffsetY = config.sleeveOffset * scale;
  const shaftOffsetY = config.shaftOffset * scale;

  // Steel neck shaft between ball head and sleeve (from config)
  // This is the steel shaft visible in Häfele catalog between ball and red sleeve
  const neckShaftDia = config.neckShaftDia * scale;
  const neckShaftLength = config.neckShaftLength * scale;
  const neckShaftOffsetY = config.neckShaftOffset * scale;

  // Detached spacing - spread parts apart for exploded view
  const detachSpacing = 0.22;

  // Calculate positions based on attached/detached state
  const positions = useMemo(() => {
    if (isAttached) {
      // Attached: parts stacked vertically (Ball Head -> Neck Shaft -> Sleeve -> Threaded Shaft)
      // Apply offsets from config
      const baseY = 0;
      const ballHeadY = baseY + sleeveLength / 2 + neckShaftLength + ballHeadRadius + ballHeadOffsetY;
      const neckShaftY = baseY + sleeveLength / 2 + neckShaftLength / 2 + neckShaftOffsetY;
      const sleeveY = baseY + sleeveOffsetY;
      const shaftY = baseY - sleeveLength / 2 - shaftLength / 2 + shaftOffsetY;

      return {
        ballHead: [0, ballHeadY, 0] as [number, number, number],
        neckShaft: [0, neckShaftY, 0] as [number, number, number],
        sleeve: [0, sleeveY, 0] as [number, number, number],
        shaft: [0, shaftY, 0] as [number, number, number],
      };
    } else {
      // Detached: parts spread horizontally for inspection
      return {
        ballHead: [-detachSpacing * 1.5, 0.08 + ballHeadOffsetY, 0] as [number, number, number],
        neckShaft: [-detachSpacing * 0.5, 0.04 + neckShaftOffsetY, 0] as [number, number, number],
        sleeve: [detachSpacing * 0.5, sleeveOffsetY, 0] as [number, number, number],
        shaft: [detachSpacing * 1.5, -0.08 + shaftOffsetY, 0] as [number, number, number],
      };
    }
  }, [isAttached, ballHeadRadius, sleeveLength, shaftLength, neckShaftLength, detachSpacing, ballHeadOffsetY, neckShaftOffsetY, sleeveOffsetY, shaftOffsetY]);

  // Thread pitch for visual detail
  const threadPitch = 0.015; // ~1.5mm pitch scaled

  // ============================================
  // TRANSFORM VALUES (from Transform tab)
  // ============================================
  const transforms = useMemo(() => {
    // Flip: use scale -1 for flipping
    const scaleX = (config.flipHorizontal ?? false) ? -1 : 1;
    const scaleY = (config.flipVertical ?? false) ? -1 : 1;

    // Rotation: convert degrees to radians
    const rotX = ((config.rotationX ?? 0) * Math.PI) / 180;
    const rotY = ((config.rotationY ?? 0) * Math.PI) / 180;
    const rotZ = ((config.rotationZ ?? 0) * Math.PI) / 180;

    // Move: convert mm to scene units
    const moveX = (config.moveX ?? 0) * scale;
    const moveY = (config.moveY ?? 0) * scale;
    const moveZ = (config.moveZ ?? 0) * scale;

    return {
      scale: [scaleX, scaleY, 1] as [number, number, number],
      rotation: [rotX, rotY, rotZ] as [number, number, number],
      position: [moveX, moveY, moveZ] as [number, number, number],
    };
  }, [config.flipHorizontal, config.flipVertical, config.rotationX, config.rotationY, config.rotationZ, config.moveX, config.moveY, config.moveZ, scale]);

  return (
    <group scale={transforms.scale} rotation={transforms.rotation} position={transforms.position}>
      {/* ============================================ */}
      {/* DEBUG AXIS ARROWS - Show model local axes */}
      {/* +X (Red) = SPIN_REFERENCE_AXIS (fin extension) */}
      {/* +Y (Green) = MODEL_UP_AXIS (bolt shaft direction) */}
      {/* +Z (Blue) = Depth direction */}
      {/* ============================================ */}
      {debugAxis && (
        <group>
          {/* +X axis (RED) - Fin extension direction */}
          <mesh position={[0.1, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.02, 0.04, 8]} />
            <meshBasicMaterial color="#ff0000" />
          </mesh>
          <mesh position={[0.05, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.005, 0.005, 0.1, 8]} />
            <meshBasicMaterial color="#ff0000" />
          </mesh>

          {/* +Y axis (GREEN) - Bolt shaft / MODEL_UP direction */}
          <mesh position={[0, 0.1, 0]}>
            <coneGeometry args={[0.02, 0.04, 8]} />
            <meshBasicMaterial color="#00ff00" />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.1, 8]} />
            <meshBasicMaterial color="#00ff00" />
          </mesh>

          {/* +Z axis (BLUE) - Depth direction */}
          <mesh position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.02, 0.04, 8]} />
            <meshBasicMaterial color="#0000ff" />
          </mesh>
          <mesh position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.005, 0.005, 0.1, 8]} />
            <meshBasicMaterial color="#0000ff" />
          </mesh>
        </group>
      )}

      {/* ============================================ */}
      {/* BALL HEAD (หัวกลม) - Chrome Steel Ø7.5mm */}
      {/* ============================================ */}
      <group position={positions.ballHead}>
        {/* Main sphere - chrome steel */}
        <mesh>
          <sphereGeometry args={[ballHeadRadius, 32, 32]} />
          <meshStandardMaterial
            color={xRayMode ? '#00ffff' : '#c0c0c0'}
            metalness={xRayMode ? 0 : 0.6}
            roughness={xRayMode ? 1 : 0.25}
            envMapIntensity={1}
            transparent={xRayMode}
            opacity={xRayMode ? 0.7 : 1}
          />
        </mesh>
        {/* Neck connecting to sleeve - steel */}
        <mesh position={[0, -ballHeadRadius * 0.7, 0]}>
          <cylinderGeometry args={[ballHeadRadius * 0.4, ballHeadRadius * 0.5, ballHeadRadius * 0.6, 16]} />
          <meshStandardMaterial
            color={xRayMode ? '#00ffff' : '#b0b0b0'}
            metalness={xRayMode ? 0 : 0.5}
            roughness={xRayMode ? 1 : 0.3}
            transparent={xRayMode}
            opacity={xRayMode ? 0.7 : 1}
          />
        </mesh>
      </group>

      {/* ============================================ */}
      {/* STEEL NECK SHAFT (แกนเหล็ก) - Ø6.5mm */}
      {/* Connects ball head to red plastic sleeve */}
      {/* ============================================ */}
      <group position={positions.neckShaft}>
        <mesh>
          <cylinderGeometry args={[neckShaftDia / 2, neckShaftDia / 2, neckShaftLength, 20]} />
          <meshStandardMaterial
            color={xRayMode ? '#00ffff' : '#a0a0a0'}
            metalness={xRayMode ? 0 : 0.5}
            roughness={xRayMode ? 1 : 0.3}
            envMapIntensity={0.8}
            transparent={xRayMode}
            opacity={xRayMode ? 0.7 : 1}
          />
        </mesh>
      </group>

      {/* ============================================ */}
      {/* PLASTIC SLEEVE (ปลอกพลาสติก) - RED with PZ2 */}
      {/* ============================================ */}
      <group position={positions.sleeve}>
        {/* Main sleeve body - BRIGHT RED PLASTIC */}
        <mesh>
          <cylinderGeometry args={[sleeveDia / 2, sleeveDia / 2, sleeveLength, 24]} />
          <meshStandardMaterial
            color={xRayMode ? '#00ffff' : '#e02020'}
            metalness={0}
            roughness={0.5}
            envMapIntensity={0.3}
            transparent={xRayMode}
            opacity={xRayMode ? 0.7 : 1}
          />
        </mesh>

        {/* Sleeve ribs/fins (4 fins around the sleeve) */}
        {!xRayMode && [0, 1, 2, 3].map((i) => (
          <mesh key={`fin-${i}`} position={[0, 0, 0]} rotation={[0, (i * Math.PI) / 2, 0]}>
            <boxGeometry args={[sleeveDia / 2 + 0.008, sleeveLength * 0.8, 0.004]} />
            <meshStandardMaterial color="#c01818" metalness={0} roughness={0.6} />
          </mesh>
        ))}

        {/* PZ2 Cross slot on top */}
        {!xRayMode && (
          <group position={[0, sleeveLength / 2 - 0.005, 0]}>
            {/* Cross slot - horizontal */}
            <mesh>
              <boxGeometry args={[sleeveDia * 0.6, 0.008, 0.015]} />
              <meshStandardMaterial color="#801010" metalness={0} roughness={0.7} />
            </mesh>
            {/* Cross slot - vertical */}
            <mesh>
              <boxGeometry args={[0.015, 0.008, sleeveDia * 0.6]} />
              <meshStandardMaterial color="#801010" metalness={0} roughness={0.7} />
            </mesh>
          </group>
        )}

        {/* Top cap ring */}
        <mesh position={[0, sleeveLength / 2 - 0.003, 0]}>
          <cylinderGeometry args={[sleeveDia / 2 + 0.002, sleeveDia / 2, 0.006, 24]} />
          <meshStandardMaterial
            color={xRayMode ? '#00ffff' : '#f03030'}
            metalness={0}
            roughness={0.4}
            transparent={xRayMode}
            opacity={xRayMode ? 0.7 : 1}
          />
        </mesh>
      </group>

      {/* ============================================ */}
      {/* THREADED SHAFT (ก้านเกลียว) - Steel */}
      {/* ============================================ */}
      <group position={positions.shaft}>
        {/* Main shaft body - steel gray */}
        <mesh>
          <cylinderGeometry args={[shaftDia / 2, shaftDia / 2, shaftLength, 20]} />
          <meshStandardMaterial
            color={xRayMode ? '#00ffff' : '#909090'}
            metalness={xRayMode ? 0 : 0.5}
            roughness={xRayMode ? 1 : 0.35}
            envMapIntensity={0.8}
            transparent={xRayMode}
            opacity={xRayMode ? 0.7 : 1}
          />
        </mesh>

        {/* Thread rings - visual detail */}
        {!xRayMode && Array.from({ length: Math.floor(shaftLength / threadPitch) }, (_, i) => (
          <mesh
            key={i}
            position={[0, shaftLength / 2 - i * threadPitch - threadPitch / 2, 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[shaftDia / 2 + 0.001, 0.0015, 6, 20]} />
            <meshStandardMaterial color="#707070" metalness={0.4} roughness={0.4} />
          </mesh>
        ))}
      </group>

      {/* ============================================ */}
      {/* MINIFIX 15 CAM HOUSING (ตัว Cam) */}
      {/* Positioned to assemble with S200 Bolt */}
      {/* ============================================ */}
      {showCam && (() => {
        const camDia = config.camDia * scale;
        const camDepth = config.camDepth * scale;
        const camHeight = config.camHeight * scale;
        const camRimDia = config.camRimDia * scale;
        const camRimHeight = config.camRimHeight * scale;
        const camOffsetY = config.camOffset * scale;

        // Calculate cam position based on assembly state
        // ASSEMBLY: Ball head sits INSIDE the cam's cup-shaped socket
        // The cam is HORIZONTAL and perpendicular to the VERTICAL bolt (T-joint assembly)
        //
        // CAM CENTER aligned with BALL HEAD CENTER for proper visual verification
        // (Eccentric offset removed for cleaner CAD-style alignment)
        const camPosition: [number, number, number] = isAttached
          ? [
              0, // X=0: Cam center aligned with Ball Head center
              positions.ballHead[1] + camOffsetY, // Align with ball head Y
              0, // Z=0: socket opening faces +Z (toward camera) after rotation
            ]
          : [0.35, camOffsetY, 0]; // Detached: to the side

        // Cam rotation: HORIZONTAL, socket opening faces +Z (toward camera)
        // This creates the T-joint configuration (cam ⟂ bolt)
        // [+π/2, π, 0] rotates so local +Y → scene +Z, then flips 180° around Y
        // Result: Cam faces UPWARD (หงายหน้าขึ้น)
        const camRotation: [number, number, number] = isAttached
          ? [Math.PI / 2, Math.PI, 0] // Horizontal, flipped upward
          : [Math.PI / 2, Math.PI, 0]; // Same for detached view

        return (
          <group position={camPosition} rotation={camRotation}>
            {/* Main cam body - steel gray matching Threaded Shaft */}
            <mesh>
              <cylinderGeometry args={[camDia / 2, camDia / 2, camDepth, 64]} />
              <meshStandardMaterial
                color={xRayMode ? '#00ffff' : '#909090'}
                metalness={xRayMode ? 0 : 0.5}
                roughness={xRayMode ? 1 : 0.35}
                envMapIntensity={0.8}
                transparent={xRayMode}
                opacity={xRayMode ? 0.6 : 1}
              />
            </mesh>

            {/* Rim/flange at top (facing ball head) */}
            <mesh position={[0, camDepth / 2 - camRimHeight / 2, 0]}>
              <cylinderGeometry args={[camRimDia / 2, camDia / 2, camRimHeight, 64]} />
              <meshStandardMaterial
                color={xRayMode ? '#00ffff' : '#a0a0a0'}
                metalness={xRayMode ? 0 : 0.5}
                roughness={xRayMode ? 1 : 0.3}
                envMapIntensity={0.8}
                transparent={xRayMode}
                opacity={xRayMode ? 0.6 : 1}
              />
            </mesh>

            {/* PZ2 cross slot on face (X shape) */}
            {!xRayMode && (
              <group position={[0, camDepth / 2 + 0.001, 0]}>
                <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
                  <planeGeometry args={[camDia * 0.6, 0.022]} />
                  <meshBasicMaterial color="#1a1a1a" side={2} />
                </mesh>
                <mesh rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
                  <planeGeometry args={[camDia * 0.6, 0.022]} />
                  <meshBasicMaterial color="#1a1a1a" side={2} />
                </mesh>
              </group>
            )}

            {/* Cam dimension label */}
            {showDimensions && (
              <Html position={[0, -camDepth / 2 - 0.03, 0]} center>
                <div
                  style={{
                    background: 'rgba(0,0,0,0.8)',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    color: '#b0b0b0',
                    whiteSpace: 'nowrap',
                    border: '1px solid #b0b0b040',
                  }}
                >
                  Ø{config.camDia}×{config.camDepth}
                </div>
              </Html>
            )}
          </group>
        );
      })()}

      {/* Dowel - optional */}
      {showDowel && (
        <Dowel3D
          position={isAttached ? [-0.2, 0, 0] : [-0.35, 0, 0]}
          rotation={[0, 0, 0]}
          diameter={config.dowelDia * scale}
          length={config.dowelLength * scale}
          xRayMode={xRayMode}
        />
      )}

      {/* ============================================ */}
      {/* EDITABLE DIMENSION ANNOTATIONS */}
      {/* Click on any dimension to edit directly */}
      {/* ============================================ */}
      {showDimensions && isAttached && (
        <group>
          {/* Ball Head diameter - editable */}
          <EditableDimensionLabel
            start={[ballHeadRadius, positions.ballHead[1], 0]}
            end={[-ballHeadRadius, positions.ballHead[1], 0]}
            value={config.ballHeadDia}
            prefix="Ø"
            color="#60d0ff"
            offset={0.06}
            side="right"
            configKey="ballHeadDia"
            onEdit={onUpdateConfig}
            min={5}
            max={12}
            step={0.5}
          />

          {/* Combined "6.5" dimension: Ball Head CENTER → Sleeve TOP */}
          {/* Per Häfele S200: 6.5 = Ball Head/2 (3.25) + Neck (3.25) */}
          {/* This dimension line aligns with Total line (both start at Ball Head CENTER) */}
          <EditableDimensionLabel
            start={[0, positions.ballHead[1], 0]}
            end={[0, positions.sleeve[1] + sleeveLength / 2, 0]}
            value={(config.ballHeadDia / 2) + config.neckShaftLength}
            color="#a0a0a0"
            offset={0.1}
            side="right"
            configKey="neckShaftLength"
            onEdit={onUpdateConfig}
            min={3}
            max={15}
            step={0.5}
          />

          {/* Neck Shaft diameter - editable */}
          <EditableDiameterLabel
            position={[neckShaftDia / 2 + 0.04, positions.neckShaft[1], 0]}
            value={config.neckShaftDia}
            color="#a0a0a0"
            configKey="neckShaftDia"
            onEdit={onUpdateConfig}
            min={3}
            max={10}
            step={0.5}
          />

          {/* Sleeve length - editable */}
          <EditableDimensionLabel
            start={[0, positions.sleeve[1] + sleeveLength / 2, 0]}
            end={[0, positions.sleeve[1] - sleeveLength / 2, 0]}
            value={config.sleeveLength}
            color="#ff6060"
            offset={0.12}
            side="right"
            configKey="sleeveLength"
            onEdit={onUpdateConfig}
            min={10}
            max={25}
            step={0.5}
          />

          {/* Sleeve diameter - editable */}
          <EditableDiameterLabel
            position={[sleeveDia / 2 + 0.04, positions.sleeve[1], 0]}
            value={config.sleeveDia}
            color="#ff6060"
            configKey="sleeveDia"
            onEdit={onUpdateConfig}
            min={6}
            max={14}
            step={0.5}
          />

          {/* Shaft length - editable */}
          <EditableDimensionLabel
            start={[0, positions.shaft[1] + shaftLength / 2, 0]}
            end={[0, positions.shaft[1] - shaftLength / 2, 0]}
            value={config.shaftLength}
            color="#60a0ff"
            offset={0.08}
            side="right"
            configKey="shaftLength"
            onEdit={onUpdateConfig}
            min={8}
            max={35}
            step={0.5}
          />

          {/* Shaft diameter - editable */}
          <EditableDiameterLabel
            position={[shaftDia / 2 + 0.03, positions.shaft[1], 0]}
            value={config.shaftDia}
            color="#60a0ff"
            configKey="shaftDia"
            onEdit={onUpdateConfig}
            min={3}
            max={8}
            step={0.5}
          />

          {/* Total length indicator - read-only (calculated) */}
          {/* Total = Ball Head/2 + Neck + Sleeve + Thread (from Ball Head CENTER to Thread END) */}
          <Html position={[0.21, (positions.ballHead[1] + positions.shaft[1] - shaftLength / 2) / 2, 0]} center>
            <div
              style={{
                background: 'rgba(0,0,0,0.8)',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '10px',
                fontFamily: 'monospace',
                color: '#ffcc00',
                whiteSpace: 'nowrap',
                border: '1px solid #ffcc0040',
              }}
            >
              Total: {((config.ballHeadDia / 2) + config.neckShaftLength + config.sleeveLength + config.shaftLength).toFixed(1)}
            </div>
          </Html>
          {/* Total dimension line - from center of ball head to bottom of shaft */}
          <Line
            points={[
              [0.18, positions.ballHead[1], 0],
              [0.18, positions.shaft[1] - shaftLength / 2, 0],
            ]}
            color="#ffcc00"
            lineWidth={1}
            dashed
            dashSize={0.01}
            gapSize={0.005}
          />
          {/* Extension lines for total */}
          <Line
            points={[
              [0, positions.ballHead[1], 0],
              [0.20, positions.ballHead[1], 0],
            ]}
            color="#ffcc00"
            lineWidth={0.5}
          />
          <Line
            points={[
              [0, positions.shaft[1] - shaftLength / 2, 0],
              [0.20, positions.shaft[1] - shaftLength / 2, 0],
            ]}
            color="#ffcc00"
            lineWidth={0.5}
          />

          {/* ============================================ */}
          {/* CAM ASSEMBLY DIMENSIONS (relative to Ball Head center) */}
          {/* Shows X, Y, Z positioning of Cam center */}
          {/* ============================================ */}
          {showCam && (() => {
            const camDia = config.camDia * scale;
            const camDepth = config.camDepth * scale;
            const camOffsetY = config.camOffset * scale;

            // Ball head center (reference point)
            const ballHeadCenter = positions.ballHead;

            // Cam center position (aligned with Ball Head at X=0)
            const camCenterX = 0;
            const camCenterY = ballHeadCenter[1] + camOffsetY;
            const camCenterZ = 0;

            // Socket center = Cam center (no eccentric offset in preview)
            const socketCenterX = camCenterX;
            const socketCenterY = camCenterY;
            const socketCenterZ = camCenterZ;

            return (
              <group>
                {/* Ball Head Center Reference Point - GREEN CROSSHAIR */}
                <group position={ballHeadCenter}>
                  {/* X axis line (red) */}
                  <Line points={[[-0.02, 0, 0], [0.02, 0, 0]]} color="#ff4040" lineWidth={2} />
                  {/* Y axis line (green) */}
                  <Line points={[[0, -0.02, 0], [0, 0.02, 0]]} color="#40ff40" lineWidth={2} />
                  {/* Z axis line (blue) */}
                  <Line points={[[0, 0, -0.02], [0, 0, 0.02]]} color="#4040ff" lineWidth={2} />
                </group>

                {/* Ball Head Center Label */}
                <Html position={[ballHeadCenter[0] - 0.08, ballHeadCenter[1], 0]} center>
                  <div style={{
                    background: 'rgba(0,100,0,0.9)',
                    padding: '2px 5px',
                    borderRadius: '3px',
                    fontSize: '9px',
                    fontFamily: 'monospace',
                    color: '#40ff40',
                    whiteSpace: 'nowrap',
                    border: '1px solid #40ff4060',
                  }}>
                    ⊙ Ball Head
                  </div>
                </Html>

                {/* Socket Center Reference Point - CYAN CROSSHAIR */}
                <group position={[socketCenterX, socketCenterY, socketCenterZ]}>
                  {/* X axis line */}
                  <Line points={[[-0.015, 0, 0], [0.015, 0, 0]]} color="#00ffff" lineWidth={2} />
                  {/* Y axis line */}
                  <Line points={[[0, -0.015, 0], [0, 0.015, 0]]} color="#00ffff" lineWidth={2} />
                  {/* Z axis line */}
                  <Line points={[[0, 0, -0.015], [0, 0, 0.015]]} color="#00ffff" lineWidth={2} />
                </group>

                {/* X POSITION: Cam center aligned with Ball Head */}
                <Html position={[0.06, ballHeadCenter[1] + 0.04, 0]} center>
                  <div style={{
                    background: 'rgba(0,0,0,0.9)',
                    padding: '2px 5px',
                    borderRadius: '3px',
                    fontSize: '9px',
                    fontFamily: 'monospace',
                    color: '#60ff60',
                    whiteSpace: 'nowrap',
                    border: '1px solid #60ff6060',
                  }}>
                    X: Cam=0 (centered)
                  </div>
                </Html>

                {/* Y OFFSET: Shows cam Y alignment with ball head */}
                {config.camOffset !== 0 && (
                  <>
                    <Html position={[-0.12, (ballHeadCenter[1] + camCenterY) / 2, 0]} center>
                      <div style={{
                        background: 'rgba(0,0,0,0.9)',
                        padding: '2px 5px',
                        borderRadius: '3px',
                        fontSize: '9px',
                        fontFamily: 'monospace',
                        color: '#60ff60',
                        whiteSpace: 'nowrap',
                        border: '1px solid #60ff6060',
                      }}>
                        ΔY: {config.camOffset.toFixed(1)}mm
                      </div>
                    </Html>
                    {/* Y offset line */}
                    <Line
                      points={[
                        [-0.08, ballHeadCenter[1], 0],
                        [-0.08, camCenterY, 0],
                      ]}
                      color="#60ff60"
                      lineWidth={1}
                      dashed
                      dashSize={0.005}
                      gapSize={0.003}
                    />
                  </>
                )}

                {/* Z ALIGNMENT: Shows both at Z=0 */}
                <Html position={[0.08, ballHeadCenter[1] - 0.03, 0.04]} center>
                  <div style={{
                    background: 'rgba(0,0,0,0.9)',
                    padding: '2px 5px',
                    borderRadius: '3px',
                    fontSize: '9px',
                    fontFamily: 'monospace',
                    color: '#6060ff',
                    whiteSpace: 'nowrap',
                    border: '1px solid #6060ff60',
                  }}>
                    Z: Socket=Ball=0
                  </div>
                </Html>

                {/* Assembly Summary Panel - positioned at TOP of Cam */}
                <Html position={[0, ballHeadCenter[1] + camOffsetY + camDia / 2 + 0.04, 0]} center>
                  <div style={{
                    background: 'rgba(20,40,60,0.95)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '8px',
                    fontFamily: 'monospace',
                    color: '#ffffff',
                    whiteSpace: 'pre',
                    border: '1px solid #00ffff40',
                    lineHeight: '1.4',
                  }}>
                    <div style={{ color: '#00ffff', fontWeight: 'bold', marginBottom: '2px' }}>📐 CAM ASSEMBLY</div>
                    <div><span style={{ color: '#ff6060' }}>X:</span> Socket @ 0 <span style={{ color: '#808080' }}>(Cam @ 0, centered)</span></div>
                    <div><span style={{ color: '#60ff60' }}>Y:</span> Ball + {config.camOffset.toFixed(1)}mm</div>
                    <div><span style={{ color: '#6060ff' }}>Z:</span> 0 <span style={{ color: '#808080' }}>(centered)</span></div>
                  </div>
                </Html>

                {/* Connecting line from Ball Head to Socket Center */}
                {config.camOffset !== 0 && (
                  <Line
                    points={[
                      ballHeadCenter,
                      [socketCenterX, socketCenterY, socketCenterZ],
                    ]}
                    color="#00ffff"
                    lineWidth={1}
                    dashed
                    dashSize={0.008}
                    gapSize={0.004}
                  />
                )}
              </group>
            );
          })()}

          {/* ============================================ */}
          {/* B DIMENSION: Drilling Distance B (LEFT SIDE) */}
          {/* Style: Dashed line like Total (no arrow heads) */}
          {/* ============================================ */}
          {(() => {
            // ใช้ค่า drillingDistanceB จาก Config โดยตรง (24 หรือ 34)
            // เปลี่ยนตามปุ่ม B=24mm / B=34mm ทันที
            const valB = config.drillingDistanceB;

            // 1. จุดบน: Ball Center
            const yTop = positions.ballHead[1];

            // 2. จุดล่าง: คำนวณจาก yTop - valB (scaled)
            // เส้นจะยาวเท่ากับค่า B จริงๆ
            const yBottom = yTop - (valB * scale);

            // Config ตำแหน่ง (ฝั่งซ้าย = ค่า X ลบ)
            const dimX = -0.12;
            const extOvershoot = 0.02;
            const labelGap = 0.03;

            return (
              <>
                {/* B DIMENSION LABEL */}
                <Html position={[dimX - labelGap, (yTop + yBottom) / 2, 0]} center>
                  <div style={{
                    background: 'rgba(0,0,0,0.8)',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    color: '#ffcc00',
                    whiteSpace: 'nowrap',
                    border: '1px solid #ffcc0040',
                  }}>
                    B: {valB.toFixed(1)}
                  </div>
                </Html>

                {/* Vertical Dimension Line (dashed - like Total) */}
                <Line
                  points={[
                    [dimX, yTop, 0],
                    [dimX, yBottom, 0],
                  ]}
                  color="#ffcc00"
                  lineWidth={1}
                  dashed
                  dashSize={0.01}
                  gapSize={0.005}
                />

                {/* Extension Line - Top (From Ball Center to Left) */}
                <Line
                  points={[
                    [0, yTop, 0],
                    [dimX - extOvershoot, yTop, 0],
                  ]}
                  color="#ffcc00"
                  lineWidth={0.5}
                />

                {/* Extension Line - Bottom (From Sleeve BOTTOM Edge to Left) */}
                <Line
                  points={[
                    [0, yBottom, 0],
                    [dimX - extOvershoot, yBottom, 0],
                  ]}
                  color="#ffcc00"
                  lineWidth={0.5}
                />
              </>
            );
          })()}
        </group>
      )}
    </group>
  );
}

// ============================================
// MINIFIX PREVIEW CANVAS WRAPPER
// For use in sidebar/external components
// ============================================

export interface MinifixPreviewCanvasProps {
  config: MinifixFullConfig;
  showCam?: boolean;
  showDowel?: boolean;
  xRayMode?: boolean;
  isAttached?: boolean;
  showDimensions?: boolean;
  // autoRotate removed - always disabled
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Self-contained 3D preview canvas for Minifix S200 hardware.
 * Use this component in sidebar or external components where you need
 * the same 3D preview as the MinifixConfigPanel modal.
 *
 * OPTIMIZATION: Uses debounced config to prevent WebGL Context Lost
 * when rapidly changing config values. The preview delays rendering
 * by 300ms after the last config change.
 */
export function MinifixPreviewCanvas({
  config,
  showCam = false,
  showDowel = false,
  xRayMode = false,
  isAttached = true,
  showDimensions = false,
  className = '',
  style,
}: MinifixPreviewCanvasProps) {
  // No-op handler for read-only preview
  const handleUpdateConfig = useCallback(() => {}, []);

  // OPTIMIZATION: Debounce config changes to prevent WebGL Context Lost
  // When config changes rapidly (e.g., preset selection), delay the re-render
  const [debouncedConfig, setDebouncedConfig] = useState(config);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Delay initial render to prevent competing with main Canvas
    const readyTimer = setTimeout(() => setIsReady(true), 500);
    return () => clearTimeout(readyTimer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedConfig(config);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [config]);

  // Don't render Canvas until ready (prevents multiple contexts competing)
  if (!isReady) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-[#0d1520] ${className}`} style={style}>
        <div className="text-xs text-gray-500">Loading preview...</div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full ${className}`} style={style}>
      <Canvas
        camera={{ position: [1.5, 0, 0], fov: 30 }}
        orthographic={false}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'low-power',  // Use low-power GPU if available
          failIfMajorPerformanceCaveat: false,
        }}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        frameloop="demand"  // Only render when needed, not every frame
      >
        <Suspense fallback={null}>
          {/* Force camera to side view - 90° to ground */}
          <SideViewCamera />

          {/* Simplified lighting for sidebar preview */}
          <ambientLight intensity={0.8} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} />

          {/* 3D Preview - uses debounced config */}
          <Preview3D
            config={debouncedConfig}
            showCam={showCam}
            showDowel={showDowel}
            xRayMode={xRayMode}
            showDimensions={showDimensions}
            isAttached={isAttached}
            onUpdateConfig={handleUpdateConfig}
          />

          {/* Controls - disable all movement for fixed CAD view */}
          <OrbitControls
            autoRotate={false}
            enableRotate={false}
            enablePan={false}
            enableZoom={true}
            minDistance={0.5}
            maxDistance={3}
            target={[0, 0, 0]}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

type ConfigTab = 'type' | 'cam' | 'sleeve' | 'bolt' | 'dowel' | 'transform';

interface MinifixConfigPanelProps {
  onConfigChange?: (config: MinifixFullConfig) => void;
  onClose?: () => void;
  showBackButton?: boolean;
  showPreview?: boolean;
  initialConfig?: MinifixFullConfig;
  initialWoodThickness?: number;
  onWoodThicknessChange?: (thickness: number) => void;
}

export function MinifixConfigPanel({
  onConfigChange,
  onClose,
  showBackButton = true,
  showPreview = true,
  initialConfig,
  initialWoodThickness,
  onWoodThicknessChange,
}: MinifixConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<ConfigTab>('bolt');
  // Merge initialConfig with defaults to ensure all properties exist (including new transform props)
  const [config, setConfig] = useState<MinifixFullConfig>(() => ({
    ...DEFAULT_MINIFIX_CONFIG,
    ...(initialConfig || {}),
  }));

  // 3D Preview state - show only S200 bolt by default
  const [previewShowCam, setPreviewShowCam] = useState(false);
  const [previewShowDowel, setPreviewShowDowel] = useState(false);
  const [previewXRay, setPreviewXRay] = useState(false);
  // Auto-rotate removed - not needed
  const [isAttached, setIsAttached] = useState(true); // Attach/Detach parts
  // showDimensions is now stored in config.showDimensions (saved with preset)

  // Sync config state when initialConfig changes (e.g., when preset is loaded)
  useEffect(() => {
    if (initialConfig) {
      // Merge with defaults to ensure all properties exist
      setConfig({ ...DEFAULT_MINIFIX_CONFIG, ...initialConfig });
      // Auto-enable Cam preview if config has cam settings
      if (initialConfig.camDia && initialConfig.camDia > 0 && initialConfig.camDepth && initialConfig.camDepth > 0) {
        setPreviewShowCam(true);
      }
      // Auto-enable Dowel preview if config has dowel settings AND includeDowel is true
      if (initialConfig.includeDowel !== false && initialConfig.dowelDia && initialConfig.dowelDia > 0 && initialConfig.dowelLength && initialConfig.dowelLength > 0) {
        setPreviewShowDowel(true);
      } else if (initialConfig.includeDowel === false) {
        setPreviewShowDowel(false);
      }
    }
  }, [initialConfig]);

  const updateConfig = useCallback((key: keyof MinifixFullConfig, value: number | string | boolean) => {
    setConfig((prev) => {
      const newConfig = { ...prev, [key]: value };

      // เมื่อ drillingDistanceB เปลี่ยน → อัปเดต sleeveLength อัตโนมัติ
      // สูตร: B = Ball Head/2 + Neck + Sleeve
      // ดังนั้น: Sleeve = B - Ball Head/2 - Neck
      // B=24: 24 - 3.25 - 6.5 = 14.25mm
      // B=34: 34 - 3.25 - 6.5 = 24.25mm
      if (key === 'drillingDistanceB' && typeof value === 'number') {
        const ballHeadRadius = prev.ballHeadDia / 2;
        const newSleeveLength = value - ballHeadRadius - prev.neckShaftLength;
        if (newSleeveLength > 0) {
          newConfig.sleeveLength = newSleeveLength;
        }
      }

      onConfigChange?.(newConfig);
      return newConfig;
    });
  }, [onConfigChange]);

  const resetToDefault = () => {
    setConfig(DEFAULT_MINIFIX_CONFIG);
    onConfigChange?.(DEFAULT_MINIFIX_CONFIG);
  };

  const copyConfig = () => {
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    // Could add toast notification here
  };

  return (
    <div className="flex h-full w-full bg-[#1a2535] text-white overflow-hidden">
      {/* 3D Preview Panel (Left Side) */}
      {showPreview && (
        <div className="w-1/2 h-full flex flex-col border-r border-[#2a3a4a]">
          {/* Preview Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a3a4a]">
            <span className="text-xs font-medium text-gray-400">3D Preview</span>
            <div className="flex items-center gap-1">
              {/* Attach/Detach Toggle - PRIMARY CONTROL */}
              <button
                onClick={() => setIsAttached(!isAttached)}
                className={`px-2 py-1.5 rounded text-[10px] font-medium transition-all flex items-center gap-1 ${
                  isAttached
                    ? 'bg-green-600 text-white'
                    : 'bg-orange-500 text-white'
                }`}
                title={isAttached ? 'Detach Parts (แยกชิ้นส่วน)' : 'Attach Parts (ประกอบ)'}
              >
                {isAttached ? <Link size={12} /> : <Unlink size={12} />}
                {isAttached ? 'Attached' : 'Detached'}
              </button>

              <div className="w-px h-4 bg-[#3a4a5a] mx-1" />

              {/* Toggle Cam */}
              <button
                onClick={() => setPreviewShowCam(!previewShowCam)}
                className={`p-1.5 rounded text-[10px] transition-all ${
                  previewShowCam ? 'bg-gray-600 text-white' : 'bg-transparent text-gray-500 hover:text-white'
                }`}
                title="Show Cam Housing"
              >
                Cam
              </button>
              {/* Toggle Dowel */}
              <button
                onClick={() => setPreviewShowDowel(!previewShowDowel)}
                className={`p-1.5 rounded text-[10px] transition-all ${
                  previewShowDowel ? 'bg-amber-600 text-white' : 'bg-transparent text-gray-500 hover:text-white'
                }`}
                title="Show Dowel"
              >
                Dowel
              </button>
              {/* X-Ray Toggle */}
              <button
                onClick={() => setPreviewXRay(!previewXRay)}
                className={`p-1.5 rounded transition-all ${
                  previewXRay ? 'bg-cyan-600 text-white' : 'bg-transparent text-gray-500 hover:text-white'
                }`}
                title="X-Ray Mode"
              >
                {previewXRay ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              {/* Dimension Toggle (saved in config) */}
              <button
                onClick={() => updateConfig('showDimensions', !config.showDimensions)}
                className={`p-1.5 rounded text-[10px] font-medium transition-all ${
                  config.showDimensions ? 'bg-yellow-600 text-white' : 'bg-transparent text-gray-500 hover:text-white'
                }`}
                title="Show Dimensions"
              >
                📏
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 bg-[#0d1520] relative min-h-[300px]">
            <Canvas
              camera={{ position: [1.5, 0, 0], fov: 30 }}
              orthographic={false}
              gl={{
                antialias: true,
                alpha: true,
                powerPreference: 'low-power',  // Prevent WebGL Context Lost
                failIfMajorPerformanceCaveat: false,
              }}
              frameloop="demand"  // Only render when needed
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            >
              <Suspense fallback={null}>
                {/* Force camera to side view - 90° to ground */}
                <SideViewCamera />

                {/* Simplified lighting - removed Environment/ContactShadows to prevent WebGL Context Lost */}
                <ambientLight intensity={0.8} />
                <directionalLight position={[5, 5, 5]} intensity={0.8} />
                <directionalLight position={[-3, 3, -3]} intensity={0.3} />

                {/* 3D Preview */}
                <Preview3D
                  config={config}
                  showCam={previewShowCam}
                  showDowel={previewShowDowel}
                  xRayMode={previewXRay}
                  showDimensions={config.showDimensions}
                  isAttached={isAttached}
                  onUpdateConfig={updateConfig}
                />

                {/* Controls - disable all movement for fixed CAD view */}
                <OrbitControls
                  autoRotate={false}
                  enableRotate={false}
                  enablePan={false}
                  enableZoom={true}
                  minDistance={0.5}
                  maxDistance={3}
                  target={[0, 0, 0]}
                />
              </Suspense>
            </Canvas>
          </div>

          {/* Dimensions Display - Editable hint */}
          <div className="p-3 border-t border-[#2a3a4a] bg-[#152030]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-gray-500">Part Dimensions (mm) <span className="text-cyan-400">- Click 3D labels to edit</span></span>
              <span className={`text-[9px] px-2 py-0.5 rounded ${isAttached ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                {isAttached ? 'Assembled' : 'Exploded View'}
              </span>
            </div>
            <div className={`grid gap-2 text-[11px] ${previewShowCam ? 'grid-cols-5' : 'grid-cols-4'}`}>
              <div className="text-center p-2 bg-cyan-500/10 rounded border border-cyan-500/30 hover:bg-cyan-500/20 cursor-pointer transition-all" onClick={() => setActiveTab('bolt')}>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  <span className="text-gray-400 text-[9px]">Ball Head</span>
                </div>
                <div className="text-cyan-400 font-mono font-medium text-[10px]">Ø{config.ballHeadDia}</div>
              </div>
              <div className="text-center p-2 bg-gray-500/10 rounded border border-gray-500/30 hover:bg-gray-500/20 cursor-pointer transition-all" onClick={() => setActiveTab('bolt')}>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <span className="w-2 h-2 rounded-full bg-gray-400" />
                  <span className="text-gray-400 text-[9px]">Neck</span>
                </div>
                <div className="text-gray-400 font-mono font-medium text-[10px]">Ø{config.neckShaftDia}×{config.neckShaftLength}</div>
              </div>
              <div className="text-center p-2 bg-red-500/10 rounded border border-red-500/30 hover:bg-red-500/20 cursor-pointer transition-all" onClick={() => setActiveTab('sleeve')}>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-gray-400 text-[9px]">Sleeve</span>
                </div>
                <div className="text-red-400 font-mono font-medium text-[10px]">Ø{config.sleeveDia}×{config.sleeveLength}</div>
              </div>
              <div className="text-center p-2 bg-blue-500/10 rounded border border-blue-500/30 hover:bg-blue-500/20 cursor-pointer transition-all" onClick={() => setActiveTab('bolt')}>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-gray-400 text-[9px]">Shaft</span>
                </div>
                <div className="text-blue-400 font-mono font-medium text-[10px]">Ø{config.shaftDia}×{config.shaftLength}</div>
              </div>
              {/* Cam card - shown when Cam is visible */}
              {previewShowCam && (
                <div className="text-center p-2 bg-zinc-500/10 rounded border border-zinc-500/30 hover:bg-zinc-500/20 cursor-pointer transition-all" onClick={() => setActiveTab('cam')}>
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <span className="w-2 h-2 rounded-full bg-zinc-400" />
                    <span className="text-gray-400 text-[9px]">Cam</span>
                  </div>
                  <div className="text-zinc-400 font-mono font-medium text-[10px]">Ø{config.camDia}×{config.camDepth}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Config Panel (Right Side) */}
      <div className={`flex flex-col h-full overflow-hidden ${showPreview ? 'w-1/2' : 'w-full'}`}>
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a3a4a]">
          {showBackButton && onClose && (
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
              <ChevronLeft size={16} className="text-gray-400" />
            </button>
          )}
          <span className="text-lg">🔧</span>
          <span className="text-sm font-medium text-cyan-400">Minifix Config Editor</span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2a3a4a] overflow-x-auto">
        <TabButton
          icon={<span className="w-2 h-2 rounded-full bg-purple-500" />}
          label="Type"
          isActive={activeTab === 'type'}
          onClick={() => setActiveTab('type')}
        />
        <TabButton
          icon={<span className="w-2 h-2 rounded-full bg-gray-400" />}
          label="Cam"
          isActive={activeTab === 'cam'}
          onClick={() => setActiveTab('cam')}
        />
        <TabButton
          icon={<span className="w-2 h-2 rounded-full bg-red-500" />}
          label="Sleeve"
          isActive={activeTab === 'sleeve'}
          onClick={() => setActiveTab('sleeve')}
        />
        <TabButton
          icon={<span className="text-xs">🔧</span>}
          label="Bolt"
          isActive={activeTab === 'bolt'}
          onClick={() => setActiveTab('bolt')}
        />
        <TabButton
          icon={<span className="w-2 h-2 rounded-full bg-amber-600" />}
          label="Dowel"
          isActive={activeTab === 'dowel'}
          onClick={() => setActiveTab('dowel')}
        />
        <TabButton
          icon={<span className="text-xs">⚙️</span>}
          label="Transform"
          isActive={activeTab === 'transform'}
          onClick={() => setActiveTab('transform')}
        />
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* TYPE TAB */}
        {activeTab === 'type' && (
          <div className="space-y-4">
            <div className="p-3 bg-[#243040] rounded-lg border border-[#3a4a5a]">
              <div className="text-[11px] text-gray-400 mb-2">Minifix Type</div>
              <div className="flex gap-2">
                <button
                  onClick={() => updateConfig('minifixType', '15')}
                  className={`flex-1 py-2 rounded text-xs font-medium transition-all ${
                    config.minifixType === '15'
                      ? 'bg-cyan-500 text-white'
                      : 'bg-[#1a2535] text-gray-400 border border-[#3a4a5a]'
                  }`}
                >
                  Minifix 15
                </button>
                <button
                  onClick={() => updateConfig('minifixType', '12')}
                  className={`flex-1 py-2 rounded text-xs font-medium transition-all ${
                    config.minifixType === '12'
                      ? 'bg-cyan-500 text-white'
                      : 'bg-[#1a2535] text-gray-400 border border-[#3a4a5a]'
                  }`}
                >
                  Minifix 12
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CAM TAB */}
        {activeTab === 'cam' && (
          <div className="space-y-4">
            {/* Wood Thickness Selector */}
            <div className="p-3 bg-[#2a3545] rounded-lg border border-[#3a4a5a]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">🪵</span>
                <span className="text-[11px] text-gray-400">Wood Thickness (ความหนาไม้)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(CAM_SPECS_BY_WOOD_THICKNESS).map((thickness) => (
                  <button
                    key={thickness}
                    onClick={() => {
                      const t = parseInt(thickness);
                      const specs = CAM_SPECS_BY_WOOD_THICKNESS[t];
                      // Auto-update cam values based on wood thickness
                      setConfig((prev) => ({
                        ...prev,
                        woodThickness: t,
                        camDepth: specs.drillingDepth,
                        camHeight: specs.dimA,
                      }));
                    }}
                    className={`px-2.5 py-1.5 rounded text-[10px] font-medium transition-all ${
                      config.woodThickness === parseInt(thickness)
                        ? 'bg-orange-500 text-white'
                        : 'bg-[#1a2535] text-gray-400 border border-[#3a4a5a] hover:border-orange-500/50'
                    }`}
                  >
                    {thickness}mm
                  </button>
                ))}
              </div>
              {/* Auto-calculated specs display */}
              <div className="mt-3 p-2 bg-[#1a2535] rounded border border-[#3a4a5a]/50">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-500">Selected:</span>
                  <span className="text-orange-400 font-medium">{config.woodThickness}mm Wood</span>
                </div>
                <div className="flex items-center justify-between text-[10px] mt-1">
                  <span className="text-gray-500">Drilling Depth D:</span>
                  <span className="text-cyan-400 font-mono">{config.camDepth}mm</span>
                </div>
                <div className="flex items-center justify-between text-[10px] mt-1">
                  <span className="text-gray-500">Dim. A (Height):</span>
                  <span className="text-cyan-400 font-mono">{config.camHeight}mm</span>
                </div>
              </div>
            </div>

            {/* Cam Housing Parameters */}
            <div className="p-3 bg-[#243040] rounded-lg border border-[#3a4a5a]">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                <span className="text-xs font-medium text-gray-300">CAM HOUSING (Minifix 15)</span>
              </div>
              <SliderInput
                label="Cam Dia Ø"
                value={config.camDia}
                onChange={(v) => updateConfig('camDia', v)}
                min={12}
                max={20}
              />
              <SliderInput
                label="Depth D"
                value={config.camDepth}
                onChange={(v) => updateConfig('camDepth', v)}
                min={8}
                max={22}
              />
              <SliderInput
                label="Height A"
                value={config.camHeight}
                onChange={(v) => updateConfig('camHeight', v)}
                min={5}
                max={16}
              />
            </div>

            {/* Rim/Flange Parameters */}
            <div className="p-3 bg-[#243040] rounded-lg border border-[#3a4a5a]">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-zinc-400" />
                <span className="text-xs font-medium text-zinc-300">RIM / FLANGE (ขอบ Cam)</span>
              </div>
              <SliderInput
                label="Rim Dia Ø"
                value={config.camRimDia}
                onChange={(v) => updateConfig('camRimDia', v)}
                min={14}
                max={22}
              />
              <SliderInput
                label="Rim Height"
                value={config.camRimHeight}
                onChange={(v) => updateConfig('camRimHeight', v)}
                min={1}
                max={5}
                step={0.5}
              />
            </div>

            {/* Cam Offset for Assembly */}
            <div className="p-3 bg-[#243040] rounded-lg border border-[#3a4a5a]">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">📐</span>
                <span className="text-xs font-medium text-gray-300">ASSEMBLY OFFSET (ตำแหน่งประกอบ)</span>
              </div>
              <SliderInput
                label="Y Offset"
                value={config.camOffset}
                onChange={(v) => updateConfig('camOffset', v)}
                min={-10}
                max={10}
                step={0.5}
              />
              <div className="mt-2 p-2 bg-[#1a2535] rounded border border-cyan-500/20">
                <div className="text-[10px] text-cyan-400 font-medium mb-1">
                  🎯 Ball Head Center Alignment
                </div>
                <div className="text-[10px] text-gray-500">
                  When offset = 0, Cam socket center aligns exactly with Ball Head (หัวกลม) center.
                  Adjust ± to fine-tune Y position.
                </div>
              </div>
            </div>

            {/* Reference Image/Info */}
            <div className="p-3 bg-[#1a2535] rounded-lg border border-dashed border-[#3a4a5a]">
              <div className="text-[10px] text-gray-500 text-center">
                💡 Häfele Minifix 15 Cam Housing<br />
                Specs auto-calculated from wood thickness
              </div>
            </div>
          </div>
        )}

        {/* SLEEVE TAB */}
        {activeTab === 'sleeve' && (
          <div className="space-y-4">
            <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/30">
              <SectionHeader icon title="Sleeve (ปลอก)" color="red" highlighted />
              <div className="mt-2 space-y-1">
                <SliderInput
                  label="Sleeve Di..."
                  value={config.sleeveDia}
                  onChange={(v) => updateConfig('sleeveDia', v)}
                  min={6}
                  max={14}
                  highlighted
                />
                <SliderInput
                  label="Sleeve Le..."
                  value={config.sleeveLength}
                  onChange={(v) => updateConfig('sleeveLength', v)}
                  min={10}
                  max={25}
                  highlighted
                />
                <SliderInput
                  label="Sleeve Of..."
                  value={config.sleeveOffset}
                  onChange={(v) => updateConfig('sleeveOffset', v)}
                  min={0}
                  max={20}
                  highlighted
                />
              </div>
            </div>
          </div>
        )}

        {/* BOLT TAB */}
        {activeTab === 'bolt' && (
          <div className="space-y-3">
            {/* S200 BOLT Header */}
            <div className="p-3 bg-[#3a2030] rounded-lg border border-[#5a3040]">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔧</span>
                <span className="text-sm font-medium text-white">S200 BOLT (สลักเกลียว)</span>
              </div>
            </div>

            {/* Drilling Distance B */}
            <div className="p-3 bg-[#243040] rounded-lg border border-[#3a4a5a]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs">🔧</span>
                <span className="text-[11px] text-gray-400">Drilling Distance B</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => updateConfig('drillingDistanceB', 24)}
                  className={`flex-1 py-2 rounded text-xs font-medium transition-all ${
                    config.drillingDistanceB === 24
                      ? 'bg-[#2a3a4a] text-white border border-gray-500'
                      : 'bg-[#1a2535] text-gray-500 border border-[#3a4a5a]'
                  }`}
                >
                  B = 24mm
                </button>
                <button
                  onClick={() => updateConfig('drillingDistanceB', 34)}
                  className={`flex-1 py-2 rounded text-xs font-medium transition-all ${
                    config.drillingDistanceB === 34
                      ? 'bg-red-500 text-white'
                      : 'bg-[#1a2535] text-gray-500 border border-[#3a4a5a]'
                  }`}
                >
                  B = 34mm
                </button>
              </div>
            </div>

            {/* Distance */}
            <div className="px-3">
              <SectionHeader icon title="ตำแหน่ง" color="orange" />
              <SliderInput
                label="Distance ..."
                value={config.drillingDistanceB}
                onChange={(v) => updateConfig('drillingDistanceB', v as 24 | 34)}
                min={20}
                max={40}
              />
            </div>

            {/* Ball Head */}
            <div className="px-3">
              <SectionHeader icon title="Ball Head" titleTh="หัวกลม" color="gray" />
              <SliderInput
                label="Ball Diam..."
                value={config.ballHeadDia}
                onChange={(v) => updateConfig('ballHeadDia', v)}
                min={5}
                max={12}
              />
              <SliderInput
                label="Ball Offse..."
                value={config.ballHeadOffset}
                onChange={(v) => updateConfig('ballHeadOffset', v)}
                min={0}
                max={200}
              />
            </div>

            {/* Neck Shaft (แกนเหล็ก) */}
            <div className="px-3 py-2 bg-gray-500/10 -mx-3 rounded border-l-2 border-gray-400">
              <SectionHeader icon title="Neck Shaft" titleTh="แกนเหล็ก" color="gray" />
              <SliderInput
                label="Neck Diam..."
                value={config.neckShaftDia}
                onChange={(v) => updateConfig('neckShaftDia', v)}
                min={3}
                max={10}
              />
              <SliderInput
                label="Neck Len..."
                value={config.neckShaftLength}
                onChange={(v) => updateConfig('neckShaftLength', v)}
                min={3}
                max={15}
              />
              <SliderInput
                label="Neck Offs..."
                value={config.neckShaftOffset}
                onChange={(v) => updateConfig('neckShaftOffset', v)}
                min={0}
                max={200}
              />
            </div>

            {/* Sleeve */}
            <div className="px-3 py-2 bg-red-500/10 -mx-3 rounded border-l-2 border-red-500">
              <SectionHeader icon title="Sleeve" titleTh="ปลอก" color="red" />
              <SliderInput
                label="Sleeve Di..."
                value={config.sleeveDia}
                onChange={(v) => updateConfig('sleeveDia', v)}
                min={6}
                max={14}
                highlighted
              />
              <SliderInput
                label="Sleeve Le..."
                value={config.sleeveLength}
                onChange={(v) => updateConfig('sleeveLength', v)}
                min={10}
                max={25}
                highlighted
              />
              <SliderInput
                label="Sleeve Of..."
                value={config.sleeveOffset}
                onChange={(v) => updateConfig('sleeveOffset', v)}
                min={0}
                max={200}
                highlighted
              />
            </div>

            {/* Threaded Shaft */}
            <div className="px-3">
              <SectionHeader icon title="Threaded Shaft" titleTh="ก้านเกลียว" color="cyan" />
              <SliderInput
                label="Shaft Dia..."
                value={config.shaftDia}
                onChange={(v) => updateConfig('shaftDia', v)}
                min={3}
                max={8}
              />
              <SliderInput
                label="Shaft Len..."
                value={config.shaftLength}
                onChange={(v) => updateConfig('shaftLength', v)}
                min={8}
                max={35}
              />
              <SliderInput
                label="Shaft Offs..."
                value={config.shaftOffset}
                onChange={(v) => updateConfig('shaftOffset', v)}
                min={0}
                max={200}
              />
            </div>
          </div>
        )}

        {/* DOWEL TAB */}
        {activeTab === 'dowel' && (
          <div className="space-y-4">
            {/* Include Dowel Toggle */}
            <div className="p-3 bg-[#243040] rounded-lg border border-[#3a4a5a]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-600" />
                  <span className="text-xs font-medium text-amber-400">INCLUDE DOWEL</span>
                </div>
                <button
                  onClick={() => {
                    const newValue = !config.includeDowel;
                    updateConfig('includeDowel', newValue);
                    setPreviewShowDowel(newValue);
                  }}
                  className={`relative w-10 h-5 rounded-full transition-all ${
                    config.includeDowel ? 'bg-amber-600' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${
                      config.includeDowel ? 'left-5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-2">
                {config.includeDowel ? 'Dowels จะแสดงใน 3D Scene และ Drill Map' : 'ไม่ใช้ Dowel ใน Preset นี้'}
              </p>
            </div>

            {/* Dowel Parameters - only show if includeDowel is true */}
            {config.includeDowel && (
              <div className="p-3 bg-[#243040] rounded-lg border border-[#3a4a5a]">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-amber-600" />
                  <span className="text-xs font-medium text-amber-400">DOWEL DIMENSIONS (ขนาดดูเบล)</span>
                </div>
                <SliderInput
                  label="Dowel Dia..."
                  value={config.dowelDia}
                  onChange={(v) => updateConfig('dowelDia', v)}
                  min={5}
                  max={12}
                />
                <SliderInput
                  label="Dowel Len..."
                  value={config.dowelLength}
                  onChange={(v) => updateConfig('dowelLength', v)}
                  min={20}
                  max={50}
                />
                <SliderInput
                  label="Dowel Off..."
                  value={config.dowelOffset}
                  onChange={(v) => updateConfig('dowelOffset', v)}
                  min={0}
                  max={200}
                />
              </div>
            )}
          </div>
        )}

        {/* TRANSFORM TAB - Hardware Manipulation */}
        {activeTab === 'transform' && (
          <div className="space-y-4">
            {/* Flip Section */}
            <div className="p-3 bg-[#243040] rounded-lg border border-[#3a4a5a]">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">🔄</span>
                <span className="text-xs font-medium text-purple-300">FLIP (พลิก)</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => updateConfig('flipVertical', !config.flipVertical)}
                  className={`flex-1 py-2.5 rounded text-xs font-medium transition-all flex items-center justify-center gap-2 ${
                    config.flipVertical
                      ? 'bg-purple-500 text-white'
                      : 'bg-[#1a2535] text-gray-400 border border-[#3a4a5a] hover:border-purple-500/50'
                  }`}
                >
                  <span className="text-sm">↕️</span>
                  Vertical Flip (V)
                </button>
                <button
                  onClick={() => updateConfig('flipHorizontal', !config.flipHorizontal)}
                  className={`flex-1 py-2.5 rounded text-xs font-medium transition-all flex items-center justify-center gap-2 ${
                    config.flipHorizontal
                      ? 'bg-purple-500 text-white'
                      : 'bg-[#1a2535] text-gray-400 border border-[#3a4a5a] hover:border-purple-500/50'
                  }`}
                >
                  <span className="text-sm">↔️</span>
                  Horizontal Flip (H)
                </button>
              </div>
            </div>

            {/* Fine Rotation Section */}
            <div className="p-3 bg-[#243040] rounded-lg border border-[#3a4a5a]">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">🔃</span>
                <span className="text-xs font-medium text-blue-300">FINE ROTATION (หมุนละเอียด)</span>
              </div>
              <div className="space-y-2">
                {/* Rot X */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-red-400 w-12">Rot X:</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => updateConfig('rotationX', (config.rotationX ?? 0) - 15)}
                      className="px-3 py-1.5 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] rounded text-[10px] hover:bg-red-500/20 hover:border-red-500/50 transition-all"
                    >
                      -15°
                    </button>
                    <button
                      onClick={() => updateConfig('rotationX', (config.rotationX ?? 0) + 15)}
                      className="px-3 py-1.5 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] rounded text-[10px] hover:bg-red-500/20 hover:border-red-500/50 transition-all"
                    >
                      +15°
                    </button>
                  </div>
                  <span className="text-[11px] text-gray-500 ml-auto font-mono">{config.rotationX ?? 0}°</span>
                </div>
                {/* Rot Y */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-green-400 w-12">Rot Y:</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => updateConfig('rotationY', (config.rotationY ?? 0) - 15)}
                      className="px-3 py-1.5 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] rounded text-[10px] hover:bg-green-500/20 hover:border-green-500/50 transition-all"
                    >
                      -15°
                    </button>
                    <button
                      onClick={() => updateConfig('rotationY', (config.rotationY ?? 0) + 15)}
                      className="px-3 py-1.5 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] rounded text-[10px] hover:bg-green-500/20 hover:border-green-500/50 transition-all"
                    >
                      +15°
                    </button>
                  </div>
                  <span className="text-[11px] text-gray-500 ml-auto font-mono">{config.rotationY ?? 0}°</span>
                </div>
                {/* Rot Z */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-blue-400 w-12">Rot Z:</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => updateConfig('rotationZ', (config.rotationZ ?? 0) - 15)}
                      className="px-3 py-1.5 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] rounded text-[10px] hover:bg-blue-500/20 hover:border-blue-500/50 transition-all"
                    >
                      -15°
                    </button>
                    <button
                      onClick={() => updateConfig('rotationZ', (config.rotationZ ?? 0) + 15)}
                      className="px-3 py-1.5 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] rounded text-[10px] hover:bg-blue-500/20 hover:border-blue-500/50 transition-all"
                    >
                      +15°
                    </button>
                  </div>
                  <span className="text-[11px] text-gray-500 ml-auto font-mono">{config.rotationZ ?? 0}°</span>
                </div>
              </div>
            </div>

            {/* Move Hardware Section */}
            <div className="p-3 bg-[#243040] rounded-lg border border-[#3a4a5a]">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">↗️</span>
                <span className="text-xs font-medium text-cyan-300">MOVE HARDWARE (เลื่อนตำแหน่ง)</span>
              </div>
              <div className="space-y-2">
                {/* Move X */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-red-400 w-12">X (L/R):</span>
                  <div className="flex gap-0.5">
                    <button onClick={() => updateConfig('moveX', (config.moveX ?? 0) - 5)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] rounded-l text-[9px] hover:bg-red-500/20 transition-all">-5</button>
                    <button onClick={() => updateConfig('moveX', (config.moveX ?? 0) - 1)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border-y border-[#3a4a5a] text-[9px] hover:bg-red-500/20 transition-all">-1</button>
                    <button onClick={() => updateConfig('moveX', (config.moveX ?? 0) - 0.5)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] text-[9px] hover:bg-red-500/20 transition-all">-0.5</button>
                    <span className="px-2 py-1 bg-[#0d1520] text-white border border-[#3a4a5a] text-[10px] font-mono min-w-[40px] text-center">{(config.moveX ?? 0).toFixed(1)}</span>
                    <button onClick={() => updateConfig('moveX', (config.moveX ?? 0) + 0.5)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] text-[9px] hover:bg-red-500/20 transition-all">+0.5</button>
                    <button onClick={() => updateConfig('moveX', (config.moveX ?? 0) + 1)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border-y border-[#3a4a5a] text-[9px] hover:bg-red-500/20 transition-all">+1</button>
                    <button onClick={() => updateConfig('moveX', (config.moveX ?? 0) + 5)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] rounded-r text-[9px] hover:bg-red-500/20 transition-all">+5</button>
                  </div>
                </div>
                {/* Move Y */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-green-400 w-12">Y (U/D):</span>
                  <div className="flex gap-0.5">
                    <button onClick={() => updateConfig('moveY', (config.moveY ?? 0) - 5)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] rounded-l text-[9px] hover:bg-green-500/20 transition-all">-5</button>
                    <button onClick={() => updateConfig('moveY', (config.moveY ?? 0) - 1)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border-y border-[#3a4a5a] text-[9px] hover:bg-green-500/20 transition-all">-1</button>
                    <button onClick={() => updateConfig('moveY', (config.moveY ?? 0) - 0.5)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] text-[9px] hover:bg-green-500/20 transition-all">-0.5</button>
                    <span className="px-2 py-1 bg-[#0d1520] text-white border border-[#3a4a5a] text-[10px] font-mono min-w-[40px] text-center">{(config.moveY ?? 0).toFixed(1)}</span>
                    <button onClick={() => updateConfig('moveY', (config.moveY ?? 0) + 0.5)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] text-[9px] hover:bg-green-500/20 transition-all">+0.5</button>
                    <button onClick={() => updateConfig('moveY', (config.moveY ?? 0) + 1)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border-y border-[#3a4a5a] text-[9px] hover:bg-green-500/20 transition-all">+1</button>
                    <button onClick={() => updateConfig('moveY', (config.moveY ?? 0) + 5)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] rounded-r text-[9px] hover:bg-green-500/20 transition-all">+5</button>
                  </div>
                </div>
                {/* Move Z */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-blue-400 w-12">Z (F/B):</span>
                  <div className="flex gap-0.5">
                    <button onClick={() => updateConfig('moveZ', (config.moveZ ?? 0) - 5)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] rounded-l text-[9px] hover:bg-blue-500/20 transition-all">-5</button>
                    <button onClick={() => updateConfig('moveZ', (config.moveZ ?? 0) - 1)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border-y border-[#3a4a5a] text-[9px] hover:bg-blue-500/20 transition-all">-1</button>
                    <button onClick={() => updateConfig('moveZ', (config.moveZ ?? 0) - 0.5)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] text-[9px] hover:bg-blue-500/20 transition-all">-0.5</button>
                    <span className="px-2 py-1 bg-[#0d1520] text-white border border-[#3a4a5a] text-[10px] font-mono min-w-[40px] text-center">{(config.moveZ ?? 0).toFixed(1)}</span>
                    <button onClick={() => updateConfig('moveZ', (config.moveZ ?? 0) + 0.5)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] text-[9px] hover:bg-blue-500/20 transition-all">+0.5</button>
                    <button onClick={() => updateConfig('moveZ', (config.moveZ ?? 0) + 1)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border-y border-[#3a4a5a] text-[9px] hover:bg-blue-500/20 transition-all">+1</button>
                    <button onClick={() => updateConfig('moveZ', (config.moveZ ?? 0) + 5)} className="px-2 py-1 bg-[#1a2535] text-gray-300 border border-[#3a4a5a] rounded-r text-[9px] hover:bg-blue-500/20 transition-all">+5</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Reset Transform Button */}
            <div className="p-3 bg-[#1a2535] rounded-lg border border-dashed border-[#3a4a5a]">
              <button
                onClick={() => {
                  setConfig(prev => ({
                    ...prev,
                    flipVertical: false,
                    flipHorizontal: false,
                    rotationX: 0,
                    rotationY: 0,
                    rotationZ: 0,
                    moveX: 0,
                    moveY: 0,
                    moveZ: 0,
                  }));
                }}
                className="w-full py-2 bg-[#2a3a4a] hover:bg-[#3a4a5a] rounded text-xs font-medium text-gray-300 transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw size={12} />
                Reset All Transforms
              </button>
              <div className="text-[10px] text-gray-500 text-center mt-2">
                💡 Transforms affect assembly preview and drilling positions
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Drilling Specs Section */}
        <div className="px-3 py-2 border-t border-[#2a3a4a]">
          <button className="w-full p-2.5 bg-[#4a3020] rounded-lg text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm">🔧</span>
              <span className="text-xs font-medium text-orange-300">DRILLING SPECS (รูเจาะ Boolean)</span>
            </div>
          </button>
        </div>

        {/* Footer Buttons */}
        <div className="flex gap-2 p-3 border-t border-[#2a3a4a]">
          <button
            onClick={resetToDefault}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#2a3a4a] hover:bg-[#3a4a5a] rounded-lg text-xs font-medium text-gray-300 transition-all"
          >
            <RotateCcw size={14} />
            <span>Reset to Default</span>
          </button>
          <button
            onClick={copyConfig}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-xs font-medium text-white transition-all"
          >
            <Copy size={14} />
            <span>Copy Config</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default MinifixConfigPanel;
