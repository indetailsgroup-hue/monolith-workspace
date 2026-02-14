/**
 * Minifix3DPreview - v1.1
 *
 * 3D visualization of Minifix S200 hardware with labeled parameters.
 * Used in HardwareConfigEditor to show real-time preview of bolt/cam settings.
 *
 * Parts (Bolt mode):
 *   - Ball Head (หัวกลม) - silver sphere
 *   - Neck Shaft (แกนเหล็ก) - silver cylinder
 *   - Sleeve (ปลอก) - beige/off-white plastic cylinder
 *   - Threaded Shaft (ก้านเกลียว) - gray threaded section
 *
 * Parts (Cam mode):
 *   - Cam Housing (เบ้าCAM) - silver cylinder with slot
 *
 * v1.1: Moved DEFAULT_MINIFIX_S200_CONFIG to separate file for proper HMR
 */

import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { MinifixConfig } from '../../core/manufacturing/drillMap/types';

// Import from separate file (moved for proper HMR)
import { DEFAULT_MINIFIX_S200_CONFIG } from '../../core/manufacturing/drillMap/minifixDefaults';
// Re-export for backwards compatibility
export { DEFAULT_MINIFIX_S200_CONFIG };

// ============================================
// TYPES
// ============================================

export interface Minifix3DPreviewProps {
  config?: MinifixConfig;       // Optional - uses DEFAULT_MINIFIX_S200_CONFIG if not provided
  mode: 'bolt' | 'cam' | 'dowel' | 'assembled';
  showLabels?: boolean;
  showDimensions?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

// ============================================
// COLORS - Häfele Minifix S200 Realistic
// ============================================

const COLORS = {
  // Bolt parts (zinc-plated steel)
  ballHead: '#C0C8D0',     // Zinc-plated silver
  neckShaft: '#B8C0C8',    // Zinc-plated
  sleeve: '#E8E4DC',       // Beige/off-white plastic (Häfele standard)
  sleeveRim: '#D4D0C8',    // Slightly darker rim
  shaft: '#A8B0B8',        // Zinc-plated
  threads: '#8890A0',      // Thread detail

  // Cam housing (zinc die-cast)
  cam: '#B8C4CE',          // Zinc die-cast silver
  camSlot: '#2D3748',      // Dark Phillips slot
  camRim: '#A0ACB8',       // Slightly darker rim

  // Dowel (beech wood)
  dowel: '#C4A882',        // Natural beech
  dowelGroove: '#A08860',  // Groove shadows
};

// ============================================
// SUB-COMPONENTS: BOLT PARTS
// ============================================

interface BoltPartsProps {
  config: MinifixConfig;
  showLabels: boolean;
}

function BallHead({ diameter, showLabel }: { diameter: number; showLabel: boolean }) {
  const radius = diameter / 2;

  return (
    <group>
      <mesh>
        <sphereGeometry args={[radius, 32, 24]} />
        <meshStandardMaterial
          color={COLORS.ballHead}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
      {showLabel && (
        <Html position={[radius + 3, 0, 0]} center>
          <div className="minifix-label">
            <span className="label-dot" style={{ background: '#60A5FA' }} />
            Ball Head
          </div>
        </Html>
      )}
    </group>
  );
}

function NeckShaft({ diameter, length, yOffset }: { diameter: number; length: number; yOffset: number }) {
  const radius = diameter / 2;

  return (
    <mesh position={[0, yOffset - length / 2, 0]}>
      <cylinderGeometry args={[radius, radius, length, 24]} />
      <meshStandardMaterial
        color={COLORS.neckShaft}
        metalness={0.7}
        roughness={0.3}
      />
    </mesh>
  );
}

function Sleeve({ diameter, length, yOffset, showLabel }: { diameter: number; length: number; yOffset: number; showLabel: boolean }) {
  const radius = diameter / 2;
  const rimRadius = radius + 0.3;
  const rimHeight = 1.0;

  return (
    <group position={[0, yOffset - length / 2, 0]}>
      {/* Main sleeve body - plastic housing */}
      <mesh>
        <cylinderGeometry args={[radius, radius, length, 32]} />
        <meshStandardMaterial
          color={COLORS.sleeve}
          metalness={0.05}
          roughness={0.7}
        />
      </mesh>

      {/* Top flange (wider rim at top) */}
      <mesh position={[0, length / 2 - rimHeight / 2, 0]}>
        <cylinderGeometry args={[rimRadius, rimRadius, rimHeight, 32]} />
        <meshStandardMaterial
          color={COLORS.sleeveRim}
          metalness={0.05}
          roughness={0.7}
        />
      </mesh>

      {showLabel && (
        <Html position={[radius + 5, 0, 0]} center>
          <div className="minifix-label">
            <span className="label-dot" style={{ background: '#D4B896' }} />
            Sleeve (Ø{diameter})
          </div>
        </Html>
      )}
    </group>
  );
}

function ThreadedShaft({ diameter, length, yOffset, showLabel }: { diameter: number; length: number; yOffset: number; showLabel: boolean }) {
  const radius = diameter / 2;
  const threadCount = Math.floor(length / 1.5);

  return (
    <group position={[0, yOffset - length / 2, 0]}>
      {/* Main shaft */}
      <mesh>
        <cylinderGeometry args={[radius, radius * 0.8, length, 16]} />
        <meshStandardMaterial
          color={COLORS.shaft}
          metalness={0.6}
          roughness={0.4}
        />
      </mesh>

      {/* Thread rings for visual effect */}
      {Array.from({ length: threadCount }).map((_, i) => (
        <mesh key={i} position={[0, length / 2 - (i + 1) * (length / threadCount), 0]}>
          <torusGeometry args={[radius * 1.1, 0.3, 8, 24]} />
          <meshStandardMaterial
            color={COLORS.threads}
            metalness={0.5}
            roughness={0.5}
          />
        </mesh>
      ))}

      {showLabel && (
        <Html position={[radius + 4, 0, 0]} center>
          <div className="minifix-label">
            <span className="label-dot" style={{ background: '#3B82F6' }} />
            Shaft
          </div>
        </Html>
      )}
    </group>
  );
}

function BoltAssembly({ config, showLabels }: BoltPartsProps) {
  // Calculate vertical positions (top to bottom)
  const ballHeadY = 0;
  const neckY = ballHeadY - config.ballHeadDia / 2;
  const sleeveY = neckY - config.neckShaftLength;
  const shaftY = sleeveY - config.sleeveLength;

  return (
    <group>
      {/* Ball Head at top */}
      <group position={[0, ballHeadY, 0]}>
        <BallHead diameter={config.ballHeadDia} showLabel={showLabels} />
      </group>

      {/* Neck Shaft */}
      <NeckShaft
        diameter={config.neckShaftDia}
        length={config.neckShaftLength}
        yOffset={neckY}
      />

      {/* Sleeve (beige plastic housing) */}
      <Sleeve
        diameter={config.sleeveDia}
        length={config.sleeveLength}
        yOffset={sleeveY}
        showLabel={showLabels}
      />

      {/* Threaded Shaft at bottom */}
      <ThreadedShaft
        diameter={config.shaftDia}
        length={config.shaftLength}
        yOffset={shaftY}
        showLabel={showLabels}
      />
    </group>
  );
}

// ============================================
// SUB-COMPONENTS: CAM HOUSING
// ============================================

interface CamHousingProps {
  config: MinifixConfig;
  showLabels: boolean;
}

function CamHousing({ config, showLabels }: CamHousingProps) {
  const radius = config.camDia / 2;
  const depth = config.camDepth;
  const rimRadius = config.camRimDia / 2;
  const rimHeight = config.camRimHeight;

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {/* Main cam body - zinc die-cast */}
      <mesh>
        <cylinderGeometry args={[radius, radius, depth, 32]} />
        <meshStandardMaterial
          color={COLORS.cam}
          metalness={0.75}
          roughness={0.25}
        />
      </mesh>

      {/* Top rim/flange (visible face) */}
      <mesh position={[0, depth / 2 - rimHeight / 2, 0]}>
        <cylinderGeometry args={[rimRadius, rimRadius, rimHeight, 32]} />
        <meshStandardMaterial
          color={COLORS.camRim}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* Phillips cross slot on top */}
      <mesh position={[0, depth / 2 + 0.3, 0]}>
        <boxGeometry args={[radius * 0.8, 0.8, 1.5]} />
        <meshStandardMaterial color={COLORS.camSlot} />
      </mesh>
      <mesh position={[0, depth / 2 + 0.3, 0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[radius * 0.8, 0.8, 1.5]} />
        <meshStandardMaterial color={COLORS.camSlot} />
      </mesh>

      {/* Cam lock opening (eccentric slot) */}
      <mesh position={[0, -depth / 2 + 2, config.camHeight - radius]}>
        <boxGeometry args={[4, 4, 3]} />
        <meshStandardMaterial color={COLORS.camSlot} />
      </mesh>

      {showLabels && (
        <Html position={[radius + 5, 0, 0]} center>
          <div className="minifix-label">
            <span className="label-dot" style={{ background: '#B8C4CE' }} />
            Cam (Ø{config.camDia})
          </div>
        </Html>
      )}
    </group>
  );
}

// ============================================
// SUB-COMPONENTS: DOWEL
// ============================================

interface DowelProps {
  diameter: number;
  length: number;
  showLabel: boolean;
}

function Dowel({ diameter, length, showLabel }: DowelProps) {
  const radius = diameter / 2;

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {/* Main dowel body - beech wood */}
      <mesh>
        <cylinderGeometry args={[radius, radius, length, 24]} />
        <meshStandardMaterial
          color={COLORS.dowel}
          roughness={0.85}
          metalness={0}
        />
      </mesh>

      {/* Fluted grooves for glue channels */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        return (
          <mesh key={i} position={[x, 0, z]} rotation={[0, 0, 0]}>
            <boxGeometry args={[0.4, length * 0.75, 0.4]} />
            <meshStandardMaterial color={COLORS.dowelGroove} roughness={0.9} />
          </mesh>
        );
      })}

      {showLabel && (
        <Html position={[radius + 4, 0, 0]} center>
          <div className="minifix-label">
            <span className="label-dot" style={{ background: '#D97706' }} />
            Dowel
          </div>
        </Html>
      )}
    </group>
  );
}

// ============================================
// MAIN SCENE
// ============================================

interface SceneProps {
  config: MinifixConfig;
  mode: 'bolt' | 'cam' | 'dowel' | 'assembled';
  showLabels: boolean;
}

function Scene({ config, mode, showLabels }: SceneProps) {
  // Calculate total height for centering
  const totalBoltHeight = useMemo(() => {
    return config.ballHeadDia / 2 + config.neckShaftLength + config.sleeveLength + config.shaftLength;
  }, [config]);

  // Camera settings based on mode
  const cameraSettings = useMemo(() => {
    if (mode === 'assembled') {
      // Camera centered - Cam at top (y=15), Bolt below (y=-5), center ~ y=5
      return {
        position: [40, 15, 40] as [number, number, number],
        target: [0, 5, 0] as [number, number, number],
        fov: 55,
        minDistance: 25,
      };
    }
    // Default for single part views
    return {
      position: [40, 10, 40] as [number, number, number],
      target: [0, -totalBoltHeight / 3, 0] as [number, number, number],
      fov: 45,
      minDistance: 30,
    };
  }, [mode, totalBoltHeight]);

  return (
    <>
      {/* Camera */}
      <PerspectiveCamera makeDefault position={cameraSettings.position} fov={cameraSettings.fov} />
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={cameraSettings.minDistance}
        maxDistance={150}
        target={cameraSettings.target}
        rotateSpeed={0.8}
        zoomSpeed={1.2}
        panSpeed={0.8}
      />

      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={1} castShadow />
      <directionalLight position={[-10, 10, -10]} intensity={0.5} />
      <pointLight position={[0, 20, 0]} intensity={0.3} />

      {/* Environment for reflections */}
      <Environment preset="studio" />

      {/* Hardware based on mode */}
      {mode === 'bolt' && (
        <BoltAssembly config={config} showLabels={showLabels} />
      )}

      {mode === 'cam' && (
        <CamHousing config={config} showLabels={showLabels} />
      )}

      {mode === 'dowel' && config.includeDowel && (
        <Dowel
          diameter={config.dowelDia}
          length={config.dowelLength}
          showLabel={showLabels}
        />
      )}

      {mode === 'assembled' && (
        <group>
          {/* Cam at TOP - receives the ball head */}
          <group position={[0, 15, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <CamHousing config={config} showLabels={false} />
          </group>

          {/* Bolt below - ball head points UP toward cam */}
          <group position={[0, -5, 0]}>
            <BoltAssembly config={config} showLabels={false} />
          </group>

          {/* Optional dowel - side by side */}
          {config.includeDowel && (
            <group position={[25, 0, 0]}>
              <Dowel
                diameter={config.dowelDia}
                length={config.dowelLength}
                showLabel={false}
              />
            </group>
          )}
        </group>
      )}

      {/* Ground plane indicator */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -totalBoltHeight - 5, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial
          color="#1a1a2e"
          transparent
          opacity={0.3}
        />
      </mesh>
    </>
  );
}

// ============================================
// DIMENSION LABELS (Bottom Bar)
// ============================================

interface DimensionLabelsProps {
  config: MinifixConfig;
  mode: 'bolt' | 'cam' | 'dowel' | 'assembled';
}

function DimensionLabels({ config, mode }: DimensionLabelsProps) {
  const items = useMemo(() => {
    if (mode === 'bolt') {
      return [
        { color: '#60A5FA', label: 'Ball Head', value: `Ø${config.ballHeadDia}` },
        { color: '#9CA3AF', label: 'Neck', value: `Ø${config.neckShaftDia}×${config.neckShaftLength}` },
        { color: '#D4B896', label: 'Sleeve', value: `Ø${config.sleeveDia}×${config.sleeveLength}` },
        { color: '#3B82F6', label: 'Shaft', value: `Ø${config.shaftDia}×${config.shaftLength}` },
        { color: '#9CA3AF', label: 'Cam', value: `Ø${config.camDia}×${config.camDepth}` },
      ];
    } else if (mode === 'cam') {
      return [
        { color: '#9CA3AF', label: 'Cam Dia', value: `Ø${config.camDia}` },
        { color: '#9CA3AF', label: 'Cam Depth', value: `${config.camDepth}mm` },
        { color: '#60A5FA', label: 'Rim Dia', value: `Ø${config.camRimDia}` },
        { color: '#60A5FA', label: 'Dim A', value: `${config.camHeight}mm` },
      ];
    } else if (mode === 'dowel' && config.includeDowel) {
      return [
        { color: '#D97706', label: 'Dowel Dia', value: `Ø${config.dowelDia}` },
        { color: '#D97706', label: 'Dowel Length', value: `${config.dowelLength}mm` },
        { color: '#D97706', label: 'Offset', value: `${config.dowelOffset}mm` },
      ];
    }
    return [];
  }, [config, mode]);

  if (items.length === 0) return null;

  return (
    <div className="dimension-labels-bar">
      {items.map((item, i) => (
        <div key={i} className="dimension-item">
          <span className="dimension-dot" style={{ background: item.color }} />
          <span className="dimension-label">{item.label}</span>
          <span className="dimension-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function Minifix3DPreview({
  config,
  mode,
  showLabels = true,
  showDimensions = true,
  className = '',
  style = {},
}: Minifix3DPreviewProps) {
  // Use default config if not provided
  const resolvedConfig = config ?? DEFAULT_MINIFIX_S200_CONFIG;

  return (
    <div
      className={`minifix-3d-preview ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 300,
        background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
        borderRadius: 8,
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* 3D Canvas - Optimized to prevent WebGL Context Lost */}
      <Canvas
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'low-power',
          failIfMajorPerformanceCaveat: false,
        }}
        dpr={[1, 1.5]}  // Reduced max DPR
        frameloop="demand"  // Only render when needed
      >
        <Scene config={resolvedConfig} mode={mode} showLabels={showLabels} />
      </Canvas>

      {/* CPlane indicator */}
      <div
        style={{
          position: 'absolute',
          bottom: showDimensions ? 50 : 10,
          left: 10,
          background: 'rgba(30, 30, 50, 0.9)',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 12,
          fontFamily: 'monospace',
          color: '#9CA3AF',
        }}
      >
        CPlane: XZ
      </div>

      {/* Dimension labels bar */}
      {showDimensions && <DimensionLabels config={resolvedConfig} mode={mode} />}

      {/* Inline styles for labels */}
      <style>{`
        .minifix-label {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(0, 0, 0, 0.75);
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-family: system-ui, sans-serif;
          color: white;
          white-space: nowrap;
          pointer-events: none;
        }

        .label-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .dimension-labels-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          justify-content: center;
          gap: 16px;
          padding: 10px 16px;
          background: rgba(15, 15, 26, 0.95);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .dimension-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          background: rgba(40, 40, 60, 0.8);
          border-radius: 4px;
        }

        .dimension-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .dimension-label {
          font-size: 11px;
          color: #9CA3AF;
          font-family: system-ui, sans-serif;
        }

        .dimension-value {
          font-size: 12px;
          color: #60A5FA;
          font-family: 'SF Mono', 'Monaco', monospace;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}

export default Minifix3DPreview;
