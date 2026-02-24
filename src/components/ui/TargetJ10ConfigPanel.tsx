/**
 * TargetJ10ConfigPanel - Target J10 Config Editor (Minifix-Quality Style)
 *
 * Full configuration panel for Italiana Ferramenta Target J10 connector.
 * Matches MinifixConfigPanel quality: 3D Preview + Tabbed Config Editor.
 *
 * Layout: Split pane (50/50)
 * - Left: 3D Preview with editable dimension labels
 * - Right: Tabbed config editor (Housing, Dowel, Transform)
 *
 * v2.0: Upgraded from slider-only panel to full Minifix-style editor
 */

import React, { useState, useCallback, Suspense, useMemo, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { RotateCcw, Copy, Link, Unlink } from 'lucide-react';

// ============================================
// TARGET J10 FULL CONFIGURATION
// ============================================

export interface TargetJ10FullConfig {
  woodThickness: number;
  distanceA: number;
  transformDelta: number;

  pinionDia: number;
  pinionDepth: number;

  dowelDia: number;
  dowelLength: number;
  includeDowel: boolean;

  showDimensions: boolean;

  // Transform (Hardware Manipulation)
  flipVertical: boolean;
  flipHorizontal: boolean;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  moveX: number;
  moveY: number;
  moveZ: number;
}

// ============================================
// PINION SPECS BY WOOD THICKNESS
// ============================================

export const PINION_SPECS_BY_WOOD: Record<number, { depth: number }> = {
  16: { depth: 11 },
  18: { depth: 13 },
  19: { depth: 13.5 },
};

export const DEFAULT_TARGET_J10_CONFIG: TargetJ10FullConfig = {
  woodThickness: 18,
  distanceA: 34.5,
  transformDelta: -25,
  pinionDia: 10,
  pinionDepth: 13,
  dowelDia: 10,
  dowelLength: 12,
  includeDowel: true,
  showDimensions: true,
  // Transform defaults
  flipVertical: false,
  flipHorizontal: false,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  moveX: 0,
  moveY: 0,
  moveZ: 0,
};

// ============================================
// HELPER
// ============================================

export function getTargetJ10ConfigForThickness(woodThickness: number): TargetJ10FullConfig {
  const spec = PINION_SPECS_BY_WOOD[woodThickness];
  if (!spec) {
    const available = Object.keys(PINION_SPECS_BY_WOOD).map(Number);
    const nearest = available.reduce((prev, curr) =>
      Math.abs(curr - woodThickness) < Math.abs(prev - woodThickness) ? curr : prev
    );
    return {
      ...DEFAULT_TARGET_J10_CONFIG,
      woodThickness,
      pinionDepth: PINION_SPECS_BY_WOOD[nearest].depth,
    };
  }
  return {
    ...DEFAULT_TARGET_J10_CONFIG,
    woodThickness,
    pinionDepth: spec.depth,
  };
}

// ============================================
// SLIDER INPUT COMPONENT (Minifix Style)
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
              : 'bg-gray-600 [&::-webkit-slider-thumb]:bg-emerald-500'
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
          className="w-14 bg-[#1e2a3a] border border-[#3a4a5a] rounded px-2 py-0.5 text-[11px] text-white text-right focus:outline-none focus:border-emerald-500"
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
}

function SectionHeader({ icon, title, titleTh, color = 'gray' }: SectionHeaderProps) {
  const colorClasses: Record<string, string> = {
    gray: 'text-gray-400',
    red: 'text-red-400',
    orange: 'text-orange-400',
    cyan: 'text-cyan-400',
    green: 'text-green-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
  };

  return (
    <div className="flex items-center gap-2 py-1.5">
      {icon && <span className={`w-2 h-2 rounded-full bg-${color}-500`} />}
      <span className={`text-[11px] font-medium ${colorClasses[color] || colorClasses.gray}`}>
        {title} {titleTh && <span className="text-gray-500">({titleTh})</span>}
      </span>
    </div>
  );
}

// ============================================
// TAB BUTTON COMPONENT
// ============================================

type J10Tab = 'housing' | 'dowel' | 'transform';

interface TabButtonProps {
  icon?: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function TabButton({ icon, label, isActive, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-all border-b-2 ${
        isActive
          ? 'text-emerald-400 border-emerald-400 bg-emerald-500/5'
          : 'text-gray-500 border-transparent hover:text-white hover:bg-white/5'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ============================================
// EDITABLE DIMENSION LABEL (3D)
// ============================================

interface EditableDimensionLabelProps {
  start: [number, number, number];
  end: [number, number, number];
  value: number;
  prefix?: string;
  color?: string;
  offset?: number;
  side?: 'left' | 'right';
  configKey: keyof TargetJ10FullConfig;
  onEdit: (key: keyof TargetJ10FullConfig, value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

function EditableDimensionLabel({
  start,
  end,
  value,
  prefix = '',
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
    if (e.key === 'Enter') handleBlur();
    else if (e.key === 'Escape') setIsEditing(false);
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
            {prefix}{value}
          </div>
        )}
      </Html>
    </group>
  );
}

// ============================================
// EDITABLE DIAMETER LABEL (3D)
// ============================================

interface EditableDiameterLabelProps {
  position: [number, number, number];
  value: number;
  color: string;
  configKey: keyof TargetJ10FullConfig;
  onEdit: (key: keyof TargetJ10FullConfig, value: number) => void;
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
    if (e.key === 'Enter') handleBlur();
    else if (e.key === 'Escape') setIsEditing(false);
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
// SIDE VIEW CAMERA
// ============================================

function SideViewCamera() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(1.5, 0, 0);
    camera.lookAt(0, 0, 0);
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

// ============================================
// 3D PREVIEW COMPONENT
// ============================================

interface J10Preview3DProps {
  config: TargetJ10FullConfig;
  showDowel: boolean;
  isAttached: boolean;
  showDimensions: boolean;
  onUpdateConfig: (key: keyof TargetJ10FullConfig, value: number) => void;
}

function J10Preview3D({ config, showDowel, isAttached, showDimensions, onUpdateConfig }: J10Preview3DProps) {
  const scale = 0.01; // 1mm = 0.01 scene units

  const pinionDia = config.pinionDia * scale;
  const pinionDepth = config.pinionDepth * scale;
  const dowelDia = config.dowelDia * scale;
  const dowelLength = config.dowelLength * scale;

  const detachSpacing = 0.25;

  // Positions based on attached/detached state
  const positions = useMemo(() => {
    if (isAttached) {
      return {
        pinion: [0, 0, 0] as [number, number, number],
        dowel: [0, -pinionDepth / 2 - dowelLength / 2 - 0.02, 0] as [number, number, number],
      };
    } else {
      return {
        pinion: [-detachSpacing * 0.5, 0, 0] as [number, number, number],
        dowel: [detachSpacing * 0.5, 0, 0] as [number, number, number],
      };
    }
  }, [isAttached, pinionDepth, dowelLength, detachSpacing]);

  // Transform values
  const transforms = useMemo(() => {
    const scaleX = (config.flipHorizontal ?? false) ? -1 : 1;
    const scaleY = (config.flipVertical ?? false) ? -1 : 1;
    const rotX = ((config.rotationX ?? 0) * Math.PI) / 180;
    const rotY = ((config.rotationY ?? 0) * Math.PI) / 180;
    const rotZ = ((config.rotationZ ?? 0) * Math.PI) / 180;
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
      {/* PINION HOUSING (ตัวเรือน Pinion) */}
      {/* Gray metal cylinder - face bore housing */}
      {/* ============================================ */}
      <group position={positions.pinion}>
        {/* Main body */}
        <mesh>
          <cylinderGeometry args={[pinionDia / 2, pinionDia / 2, pinionDepth, 32]} />
          <meshStandardMaterial
            color="#909090"
            metalness={0.5}
            roughness={0.35}
            envMapIntensity={0.8}
          />
        </mesh>

        {/* Rim/flange at top */}
        <mesh position={[0, pinionDepth / 2 - 0.005, 0]}>
          <cylinderGeometry args={[pinionDia / 2 + 0.005, pinionDia / 2, 0.01, 32]} />
          <meshStandardMaterial color="#a0a0a0" metalness={0.5} roughness={0.3} />
        </mesh>

        {/* Cross slot on face (PZ2 style) */}
        <group position={[0, pinionDepth / 2 + 0.001, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <planeGeometry args={[pinionDia * 0.6, 0.018]} />
            <meshBasicMaterial color="#1a1a1a" side={2} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
            <planeGeometry args={[pinionDia * 0.6, 0.018]} />
            <meshBasicMaterial color="#1a1a1a" side={2} />
          </mesh>
        </group>

        {/* Internal pinion mechanism indicator ring */}
        <mesh position={[0, -pinionDepth / 2 + 0.01, 0]}>
          <cylinderGeometry args={[pinionDia / 2 - 0.01, pinionDia / 2 - 0.01, 0.008, 32]} />
          <meshStandardMaterial color="#707070" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>

      {/* ============================================ */}
      {/* DOWEL (ดูเบล) - Beech wood cylinder */}
      {/* ============================================ */}
      {showDowel && (
        <group position={positions.dowel}>
          {/* Main dowel body */}
          <mesh>
            <cylinderGeometry args={[dowelDia / 2, dowelDia / 2, dowelLength, 20]} />
            <meshStandardMaterial
              color="#c8a070"
              metalness={0}
              roughness={0.7}
              envMapIntensity={0.3}
            />
          </mesh>

          {/* Dowel grooves (3 rings for grip) */}
          {[-1, 0, 1].map((i) => (
            <mesh
              key={`groove-${i}`}
              position={[0, i * dowelLength * 0.25, 0]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <torusGeometry args={[dowelDia / 2 + 0.001, 0.002, 6, 20]} />
              <meshStandardMaterial color="#a08050" metalness={0} roughness={0.8} />
            </mesh>
          ))}

          {/* Dowel chamfer ends */}
          <mesh position={[0, dowelLength / 2, 0]}>
            <cylinderGeometry args={[dowelDia / 2 - 0.005, dowelDia / 2, 0.008, 20]} />
            <meshStandardMaterial color="#c8a070" metalness={0} roughness={0.7} />
          </mesh>
          <mesh position={[0, -dowelLength / 2, 0]}>
            <cylinderGeometry args={[dowelDia / 2, dowelDia / 2 - 0.005, 0.008, 20]} />
            <meshStandardMaterial color="#c8a070" metalness={0} roughness={0.7} />
          </mesh>
        </group>
      )}

      {/* ============================================ */}
      {/* EDITABLE DIMENSION ANNOTATIONS */}
      {/* ============================================ */}
      {showDimensions && isAttached && (
        <group>
          {/* Pinion depth dimension line */}
          <EditableDimensionLabel
            start={[0, positions.pinion[1] + pinionDepth / 2, 0]}
            end={[0, positions.pinion[1] - pinionDepth / 2, 0]}
            value={config.pinionDepth}
            color="#a0a0a0"
            offset={0.1}
            side="right"
            configKey="pinionDepth"
            onEdit={onUpdateConfig}
            min={8}
            max={20}
            step={0.5}
          />

          {/* Pinion diameter label */}
          <EditableDiameterLabel
            position={[pinionDia / 2 + 0.04, positions.pinion[1], 0]}
            value={config.pinionDia}
            color="#a0a0a0"
            configKey="pinionDia"
            onEdit={onUpdateConfig}
            min={8}
            max={15}
            step={0.5}
          />

          {/* Dowel length dimension line */}
          {showDowel && (
            <EditableDimensionLabel
              start={[0, positions.dowel[1] + dowelLength / 2, 0]}
              end={[0, positions.dowel[1] - dowelLength / 2, 0]}
              value={config.dowelLength}
              color="#c8a070"
              offset={0.08}
              side="right"
              configKey="dowelLength"
              onEdit={onUpdateConfig}
              min={8}
              max={20}
              step={0.5}
            />
          )}

          {/* Dowel diameter label */}
          {showDowel && (
            <EditableDiameterLabel
              position={[dowelDia / 2 + 0.03, positions.dowel[1], 0]}
              value={config.dowelDia}
              color="#c8a070"
              configKey="dowelDia"
              onEdit={onUpdateConfig}
              min={6}
              max={12}
              step={0.5}
            />
          )}

          {/* Computed B indicator (read-only) */}
          <Html position={[-0.12, positions.pinion[1] - pinionDepth / 2 - 0.04, 0]} center>
            <div
              style={{
                background: 'rgba(0,0,0,0.8)',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '10px',
                fontFamily: 'monospace',
                color: '#34d399',
                whiteSpace: 'nowrap',
                border: '1px solid #34d39940',
              }}
            >
              B: {(config.distanceA + config.transformDelta).toFixed(1)}
            </div>
          </Html>
        </group>
      )}

      {/* Detached part labels */}
      {!isAttached && (
        <group>
          <Html position={[positions.pinion[0], positions.pinion[1] + pinionDepth / 2 + 0.04, 0]} center>
            <div style={{
              background: 'rgba(0,0,0,0.7)',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '9px',
              fontFamily: 'monospace',
              color: '#a0a0a0',
              whiteSpace: 'nowrap',
            }}>
              Pinion Ø{config.pinionDia}×{config.pinionDepth}
            </div>
          </Html>
          {showDowel && (
            <Html position={[positions.dowel[0], positions.dowel[1] + dowelLength / 2 + 0.04, 0]} center>
              <div style={{
                background: 'rgba(0,0,0,0.7)',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '9px',
                fontFamily: 'monospace',
                color: '#c8a070',
                whiteSpace: 'nowrap',
              }}>
                Dowel Ø{config.dowelDia}×{config.dowelLength}
              </div>
            </Html>
          )}
        </group>
      )}
    </group>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

interface TargetJ10ConfigPanelProps {
  onConfigChange?: (config: TargetJ10FullConfig) => void;
  onClose?: () => void;
  initialConfig?: TargetJ10FullConfig;
  initialWoodThickness?: number;
  onWoodThicknessChange?: (thickness: number) => void;
}

export function TargetJ10ConfigPanel({
  onConfigChange,
  onClose,
  initialConfig,
  initialWoodThickness,
  onWoodThicknessChange,
}: TargetJ10ConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<J10Tab>('housing');
  const [config, setConfig] = useState<TargetJ10FullConfig>(
    initialConfig ? { ...DEFAULT_TARGET_J10_CONFIG, ...initialConfig } : DEFAULT_TARGET_J10_CONFIG
  );
  const [previewShowDowel, setPreviewShowDowel] = useState(true);
  const [isAttached, setIsAttached] = useState(true);

  // Sync config when initialConfig changes
  useEffect(() => {
    if (initialConfig) {
      setConfig({ ...DEFAULT_TARGET_J10_CONFIG, ...initialConfig });
      if (initialConfig.includeDowel !== false) {
        setPreviewShowDowel(true);
      }
    }
  }, [initialConfig]);

  useEffect(() => {
    if (initialWoodThickness && initialWoodThickness !== config.woodThickness) {
      handleWoodThicknessChange(initialWoodThickness);
    }
  }, [initialWoodThickness]);

  // Notify parent of config changes via effect (avoids setState-during-render)
  const configRef = React.useRef(config);
  useEffect(() => {
    if (configRef.current !== config) {
      configRef.current = config;
      onConfigChange?.(config);
    }
  }, [config, onConfigChange]);

  const updateConfig = useCallback((key: keyof TargetJ10FullConfig, value: number | boolean) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleWoodThicknessChange = useCallback((thickness: number) => {
    const spec = PINION_SPECS_BY_WOOD[thickness];
    setConfig((prev) => ({
      ...prev,
      woodThickness: thickness,
      pinionDepth: spec?.depth ?? prev.pinionDepth,
    }));
    onWoodThicknessChange?.(thickness);
  }, [onWoodThicknessChange]);

  const resetToDefault = useCallback(() => {
    const defaults = getTargetJ10ConfigForThickness(config.woodThickness);
    setConfig(defaults);
  }, [config.woodThickness]);

  const copyConfig = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
  }, [config]);

  const computedB = config.distanceA + config.transformDelta;

  return (
    <div className="flex h-full w-full bg-[#1a2535] text-white overflow-hidden">
      {/* ============================================ */}
      {/* LEFT: 3D Preview Panel */}
      {/* ============================================ */}
      <div className="w-1/2 h-full flex flex-col border-r border-[#2a3a4a]">
        {/* Preview Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a3a4a]">
          <span className="text-xs font-medium text-gray-400">3D Preview</span>
          <div className="flex items-center gap-1">
            {/* Attach/Detach Toggle */}
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

            {/* Dimension Toggle */}
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
              powerPreference: 'low-power',
              failIfMajorPerformanceCaveat: false,
            }}
            frameloop="demand"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          >
            <Suspense fallback={null}>
              <SideViewCamera />

              <ambientLight intensity={0.8} />
              <directionalLight position={[5, 5, 5]} intensity={0.8} />
              <directionalLight position={[-3, 3, -3]} intensity={0.3} />

              <J10Preview3D
                config={config}
                showDowel={previewShowDowel}
                isAttached={isAttached}
                showDimensions={config.showDimensions}
                onUpdateConfig={updateConfig}
              />

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

        {/* Part Dimensions Bar */}
        <div className="p-3 border-t border-[#2a3a4a] bg-[#152030]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-500">Part Dimensions (mm) <span className="text-emerald-400">- Click 3D labels to edit</span></span>
            <span className={`text-[9px] px-2 py-0.5 rounded ${isAttached ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
              {isAttached ? 'Assembled' : 'Exploded View'}
            </span>
          </div>
          <div className={`grid gap-2 text-[11px] ${previewShowDowel ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div
              className="text-center p-2 bg-emerald-500/10 rounded border border-emerald-500/30 hover:bg-emerald-500/20 cursor-pointer transition-all"
              onClick={() => setActiveTab('housing')}
            >
              <div className="flex items-center justify-center gap-1 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-gray-400 text-[9px]">Pinion</span>
              </div>
              <div className="text-emerald-400 font-mono font-medium text-[10px]">Ø{config.pinionDia}×{config.pinionDepth}</div>
            </div>
            {previewShowDowel && (
              <div
                className="text-center p-2 bg-amber-500/10 rounded border border-amber-500/30 hover:bg-amber-500/20 cursor-pointer transition-all"
                onClick={() => setActiveTab('dowel')}
              >
                <div className="flex items-center justify-center gap-1 mb-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-gray-400 text-[9px]">Dowel</span>
                </div>
                <div className="text-amber-400 font-mono font-medium text-[10px]">Ø{config.dowelDia}×{config.dowelLength}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* RIGHT: Config Editor Panel */}
      {/* ============================================ */}
      <div className="w-1/2 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a3a4a]">
          <span className="text-lg">🔧</span>
          <span className="text-sm font-medium text-emerald-400">Target J10 Config Editor</span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2a3a4a] overflow-x-auto">
          <TabButton
            icon={<span className="w-2 h-2 rounded-full bg-emerald-500" />}
            label="Housing"
            isActive={activeTab === 'housing'}
            onClick={() => setActiveTab('housing')}
          />
          <TabButton
            icon={<span className="w-2 h-2 rounded-full bg-amber-500" />}
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
          {/* ============================================ */}
          {/* HOUSING TAB */}
          {/* ============================================ */}
          {activeTab === 'housing' && (
            <div className="space-y-4">
              {/* Wood Thickness Selector */}
              <div className="p-3 bg-[#243040] rounded-lg border border-[#3a4a5a]">
                <SectionHeader
                  icon={<span />}
                  title="WOOD THICKNESS"
                  titleTh="ความหนาไม้"
                  color="emerald"
                />
                <div className="flex gap-2 mt-2">
                  {[16, 18, 19].map((thk) => (
                    <button
                      key={thk}
                      onClick={() => handleWoodThicknessChange(thk)}
                      className={`flex-1 py-2 rounded text-xs font-medium transition-all ${
                        config.woodThickness === thk
                          ? 'bg-emerald-500 text-white'
                          : 'bg-[#1a2535] text-gray-400 border border-[#3a4a5a] hover:border-emerald-500/50'
                      }`}
                    >
                      {thk}mm
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-500 mt-2">
                  Pinion depth auto-adjusts: {PINION_SPECS_BY_WOOD[config.woodThickness]?.depth ?? '?'}mm for {config.woodThickness}mm wood
                </p>
              </div>

              {/* Distance & Transform */}
              <div className="p-3 bg-[#243040] rounded-lg border border-[#3a4a5a]">
                <SectionHeader
                  icon={<span />}
                  title="DISTANCE & TRANSFORM"
                  titleTh="B = A + Δ"
                  color="emerald"
                />
                <div className="mt-2">
                  <SliderInput
                    label="Distance A"
                    value={config.distanceA}
                    onChange={(v) => updateConfig('distanceA', v)}
                    min={20}
                    max={50}
                    step={0.5}
                  />
                  <SliderInput
                    label="Transform Δ"
                    value={config.transformDelta}
                    onChange={(v) => updateConfig('transformDelta', v)}
                    min={-35}
                    max={0}
                    step={0.5}
                  />
                  <div className="flex items-center gap-3 py-2 border-t border-[#3a4a5a] mt-2 pt-2">
                    <span className="text-[11px] text-emerald-400 font-medium">Computed B</span>
                    <div className="flex-1" />
                    <span className={`text-[14px] font-mono font-bold ${computedB >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {computedB.toFixed(1)}mm
                    </span>
                  </div>
                  {computedB < 0 && (
                    <div className="text-[10px] text-red-400 mt-1">
                      ⚠ Negative B — dowel position extends beyond join edge
                    </div>
                  )}
                </div>
              </div>

              {/* Pinion Housing Dimensions */}
              <div className="p-3 bg-[#243040] rounded-lg border border-[#3a4a5a]">
                <SectionHeader
                  icon={<span />}
                  title="PINION HOUSING"
                  titleTh="ขนาดรูเจาะ Face Bore"
                  color="gray"
                />
                <div className="mt-2">
                  <SliderInput
                    label="Diameter"
                    value={config.pinionDia}
                    onChange={(v) => updateConfig('pinionDia', v)}
                    min={8}
                    max={15}
                    step={0.5}
                  />
                  <SliderInput
                    label="Depth"
                    value={config.pinionDepth}
                    onChange={(v) => updateConfig('pinionDepth', v)}
                    min={8}
                    max={20}
                    step={0.5}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ============================================ */}
          {/* DOWEL TAB */}
          {/* ============================================ */}
          {activeTab === 'dowel' && (
            <div className="space-y-4">
              {/* Dowel Toggle */}
              <div className="p-3 bg-[#243040] rounded-lg border border-[#3a4a5a]">
                <div className="flex items-center justify-between">
                  <SectionHeader
                    icon={<span />}
                    title="INCLUDE DOWEL"
                    titleTh="ใช้ดูเบล"
                    color="amber"
                  />
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

              {/* Dowel Dimensions */}
              {config.includeDowel && (
                <div className="p-3 bg-[#243040] rounded-lg border border-[#3a4a5a]">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-amber-600" />
                    <span className="text-xs font-medium text-amber-400">DOWEL DIMENSIONS (ขนาดดูเบล)</span>
                  </div>
                  <SliderInput
                    label="Diameter"
                    value={config.dowelDia}
                    onChange={(v) => updateConfig('dowelDia', v)}
                    min={6}
                    max={12}
                  />
                  <SliderInput
                    label="Length"
                    value={config.dowelLength}
                    onChange={(v) => updateConfig('dowelLength', v)}
                    min={8}
                    max={20}
                  />
                </div>
              )}
            </div>
          )}

          {/* ============================================ */}
          {/* TRANSFORM TAB */}
          {/* ============================================ */}
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

              {/* Reset Transform */}
              <div className="p-3 bg-[#1a2535] rounded-lg border border-dashed border-[#3a4a5a]">
                <button
                  onClick={() => {
                    setConfig(prev => {
                      const next = {
                        ...prev,
                        flipVertical: false,
                        flipHorizontal: false,
                        rotationX: 0,
                        rotationY: 0,
                        rotationZ: 0,
                        moveX: 0,
                        moveY: 0,
                        moveZ: 0,
                      };
                      onConfigChange?.(next);
                      return next;
                    });
                  }}
                  className="w-full py-2 bg-[#2a3a4a] hover:bg-[#3a4a5a] rounded text-xs font-medium text-gray-300 transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw size={12} />
                  Reset All Transforms
                </button>
                <div className="text-[10px] text-gray-500 text-center mt-2">
                  Transforms affect assembly preview and drilling positions
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Drilling Specs Section */}
        <div className="px-3 py-2 border-t border-[#2a3a4a]">
          <div className="w-full p-2.5 bg-[#203025] rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">🔧</span>
              <span className="text-xs font-medium text-emerald-300">DRILLING SPECS (รูเจาะ Boolean)</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              <div className="flex justify-between">
                <span className="text-gray-500">Pinion bore</span>
                <span className="text-white font-mono">Ø{config.pinionDia} × {config.pinionDepth}mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Distance B</span>
                <span className={`font-mono ${computedB >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{computedB.toFixed(1)}mm</span>
              </div>
              {config.includeDowel && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Dowel bore</span>
                  <span className="text-white font-mono">Ø{config.dowelDia} × {config.dowelLength}mm</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Wood thickness</span>
                <span className="text-white font-mono">{config.woodThickness}mm</span>
              </div>
            </div>
          </div>
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
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-medium text-white transition-all"
          >
            <Copy size={14} />
            <span>Copy Config</span>
          </button>
        </div>
      </div>
    </div>
  );
}
