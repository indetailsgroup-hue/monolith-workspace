/**
 * ConnectorAssemblyPanel.tsx - Connector Assembly Preview Panel
 *
 * UI panel for previewing and configuring connector assemblies
 * for overlay↔inset cabinet joints.
 *
 * Features:
 * - 3D preview of cam + bolt + connector plate assembly
 * - Configuration controls for plate dimensions
 * - View modes: assembled, exploded, x-ray
 * - Integration with drill map generation
 *
 * @version 1.0.0 - Overlay↔Inset Connector System
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Grid } from '@react-three/drei';
import {
  CamHousing3D,
  S200Bolt3D,
  ConnectorPlate3D,
  Dowel3D,
  HARDWARE_COLORS,
  DEFAULT_PLATE_CONFIG,
  DEFAULT_S200_CONFIG,
  type ConnectorPlateConfig,
  type S200BoltConfig,
} from '../canvas/Hardware3D';
import type { MinifixFullConfig } from './MinifixConfigPanel';
import {
  generateConnectorPlateDrillMap,
  type ConnectorPlateDrillMapOptions,
  type DrillMap,
} from '../../core/manufacturing/drillMap';

// ============================================================================
// TYPES
// ============================================================================

export type ViewMode = 'assembled' | 'exploded' | 'plate_only';

export interface ConnectorAssemblyConfig {
  /** Connector plate configuration */
  plate: ConnectorPlateConfig;
  /** Minifix/bolt configuration (optional, uses defaults if not provided) */
  minifix?: MinifixFullConfig;
  /** Include dowels in assembly */
  includeDowels: boolean;
  /** Panel thickness for housing depth calculation */
  panelThickness: number;
}

export interface ConnectorAssemblyPanelProps {
  /** Initial configuration */
  initialConfig?: Partial<ConnectorAssemblyConfig>;
  /** Callback when configuration changes */
  onConfigChange?: (config: ConnectorAssemblyConfig) => void;
  /** Callback when drill map is generated */
  onDrillMapGenerated?: (drillMap: DrillMap, config: ConnectorAssemblyConfig) => void;
  /** World position for drill map generation [x, y, z] */
  worldPosition?: [number, number, number];
  /** Compact mode (smaller panel) */
  compact?: boolean;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_ASSEMBLY_CONFIG: ConnectorAssemblyConfig = {
  plate: DEFAULT_PLATE_CONFIG,
  includeDowels: true,
  panelThickness: 18,
};

// CAM depth lookup by panel thickness (from Häfele catalog)
const CAM_DEPTH_BY_THICKNESS: Record<number, number> = {
  12: 9.5,
  15: 11.5,
  18: 13.5,
  19: 13.5,
  22: 16.5,
  29: 19.5,
};

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  panel: {
    backgroundColor: '#1a1a2e',
    border: '1px solid #3a3a5a',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #3a3a5a',
    backgroundColor: '#252542',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#e2e8f0',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  preview: {
    height: '280px',
    backgroundColor: '#0d0d1a',
    position: 'relative' as const,
  },
  controls: {
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  label: {
    fontSize: '11px',
    color: '#94a3b8',
    minWidth: '80px',
  },
  input: {
    flex: 1,
    padding: '6px 10px',
    fontSize: '12px',
    backgroundColor: '#252542',
    border: '1px solid #3a3a5a',
    borderRadius: '4px',
    color: '#e2e8f0',
    outline: 'none',
  },
  select: {
    flex: 1,
    padding: '6px 10px',
    fontSize: '12px',
    backgroundColor: '#252542',
    border: '1px solid #3a3a5a',
    borderRadius: '4px',
    color: '#e2e8f0',
    outline: 'none',
  },
  buttonGroup: {
    display: 'flex',
    gap: '4px',
  },
  button: {
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  buttonActive: {
    backgroundColor: '#8b5cf6',
    color: '#fff',
  },
  buttonInactive: {
    backgroundColor: '#252542',
    color: '#94a3b8',
    border: '1px solid #3a3a5a',
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
  },
  footer: {
    padding: '12px 16px',
    borderTop: '1px solid #3a3a5a',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionButton: {
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  primaryButton: {
    backgroundColor: '#8b5cf6',
    color: '#fff',
  },
  secondaryButton: {
    backgroundColor: '#252542',
    color: '#e2e8f0',
    border: '1px solid #3a3a5a',
  },
  badge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#22c55e20',
    color: '#22c55e',
  },
};

// ============================================================================
// 3D ASSEMBLY PREVIEW COMPONENT
// ============================================================================

interface AssemblyPreview3DProps {
  config: ConnectorAssemblyConfig;
  viewMode: ViewMode;
  xRayMode: boolean;
  showDimensions: boolean;
}

function AssemblyPreview3D({
  config,
  viewMode,
  xRayMode,
  showDimensions,
}: AssemblyPreview3DProps) {
  const { plate, includeDowels, panelThickness } = config;

  // Calculate cam depth based on panel thickness
  const camDepth = CAM_DEPTH_BY_THICKNESS[panelThickness] || 13.5;

  // Exploded view offsets
  const explodeOffset = viewMode === 'exploded' ? 30 : 0;

  // Positions for each component
  const plateY = 0;
  const camY = plateY + plate.thickness / 2 + camDepth / 2 + explodeOffset;
  const boltY = plateY - plate.thickness / 2 - 17.5 / 2 - explodeOffset;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-10, 10, -10]} intensity={0.3} />

      {/* Environment for reflections */}
      <Environment preset="studio" />

      {/* Grid helper */}
      <Grid
        position={[0, -plate.thickness / 2 - 20, 0]}
        args={[200, 200]}
        cellSize={10}
        cellThickness={0.5}
        cellColor="#3a3a5a"
        sectionSize={32}
        sectionThickness={1}
        sectionColor="#5a5a8a"
        fadeDistance={300}
        fadeStrength={1}
        followCamera={false}
      />

      {/* Connector Plate */}
      {viewMode !== 'plate_only' || viewMode === 'plate_only' ? (
        <ConnectorPlate3D
          position={[0, plateY, 0]}
          rotation={[0, 0, 0]}
          config={plate}
          xRayMode={xRayMode}
          showDimensions={showDimensions}
        />
      ) : null}

      {/* Cam Housing (above plate) */}
      {viewMode !== 'plate_only' && (
        <CamHousing3D
          position={[0, camY, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          diameter={15}
          depth={camDepth}
          xRayMode={xRayMode}
        />
      )}

      {/* S200 Bolt (below plate, offset by hole spacing) */}
      {viewMode !== 'plate_only' && (
        <S200Bolt3D
          position={[plate.holeSpacing, boltY, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          config={DEFAULT_S200_CONFIG}
          xRayMode={xRayMode}
        />
      )}

      {/* Dowels (optional) */}
      {viewMode !== 'plate_only' && includeDowels && (
        <Dowel3D
          position={[-plate.holeSpacing, plateY, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          diameter={8}
          length={30}
          xRayMode={xRayMode}
        />
      )}

      {/* Camera controls */}
      <OrbitControls
        makeDefault
        minDistance={50}
        maxDistance={400}
        enablePan={true}
        enableZoom={true}
        target={[0, 0, 0]}
      />

      {/* Camera */}
      <PerspectiveCamera
        makeDefault
        position={[80, 60, 120]}
        fov={45}
      />
    </>
  );
}

// ============================================================================
// MAIN PANEL COMPONENT
// ============================================================================

export function ConnectorAssemblyPanel({
  initialConfig,
  onConfigChange,
  onDrillMapGenerated,
  worldPosition = [0, 0, 0],
  compact = false,
}: ConnectorAssemblyPanelProps): React.ReactElement {
  // State
  const [config, setConfig] = useState<ConnectorAssemblyConfig>({
    ...DEFAULT_ASSEMBLY_CONFIG,
    ...initialConfig,
    plate: { ...DEFAULT_ASSEMBLY_CONFIG.plate, ...initialConfig?.plate },
  });
  const [viewMode, setViewMode] = useState<ViewMode>('assembled');
  const [xRayMode, setXRayMode] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [validationResult, setValidationResult] = useState<{ isValid: boolean; errors: string[]; warnings: string[] } | null>(null);

  // Validate config on change
  useMemo(() => {
    // Basic validation for Hardware3D ConnectorPlateConfig
    const errors: string[] = [];
    const warnings: string[] = [];
    const plate = config.plate;

    if (plate.length <= 0) errors.push('Plate length must be greater than 0');
    if (plate.width <= 0) errors.push('Plate width must be greater than 0');
    if (plate.thickness <= 0) errors.push('Plate thickness must be greater than 0');
    if (plate.thickness < 8) warnings.push('Plate thickness less than 8mm may affect structural integrity');

    setValidationResult({ isValid: errors.length === 0, errors, warnings });
  }, [config.plate]);

  // Update config and notify parent
  const updateConfig = useCallback(
    (updates: Partial<ConnectorAssemblyConfig>) => {
      setConfig((prev) => {
        const newConfig = { ...prev, ...updates };
        onConfigChange?.(newConfig);
        return newConfig;
      });
    },
    [onConfigChange]
  );

  // Update plate config
  const updatePlate = useCallback(
    (updates: Partial<ConnectorPlateConfig>) => {
      setConfig((prev) => {
        const newConfig = {
          ...prev,
          plate: { ...prev.plate, ...updates },
        };
        onConfigChange?.(newConfig);
        return newConfig;
      });
    },
    [onConfigChange]
  );

  // Handle generate drill map
  const handleGenerateDrillMap = useCallback(() => {
    // Convert Hardware3D ConnectorPlateConfig to DrillMap ConnectorPlateDrillMapOptions
    const options: ConnectorPlateDrillMapOptions = {
      plateConfig: {
        length: config.plate.length,
        width: config.plate.width,
        thickness: config.plate.thickness,
        holeCount: config.plate.includeDowelHoles ? 3 : 2,  // housing + bolt (+ dowel if enabled)
        holeSpacing: config.plate.holeSpacing,
        holeDiameter: config.plate.boltHoleDia,  // Use bolt hole as primary
        edgeDistance: config.plate.holeSpacing,  // Use hole spacing as edge distance
      },
      position: worldPosition,
      panelThickness: config.panelThickness,
    };

    // Generate drill map
    const drillMap = generateConnectorPlateDrillMap(options);

    // Notify parent
    onDrillMapGenerated?.(drillMap, config);
  }, [config, worldPosition, onDrillMapGenerated]);

  return (
    <div style={{ ...styles.panel, width: compact ? '320px' : '400px' }}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>
          <span>🔩</span>
          <span>Connector Assembly</span>
        </div>
        <span style={styles.badge}>Minifix 15</span>
      </div>

      {/* 3D Preview - Optimized to prevent WebGL Context Lost */}
      <div style={styles.preview}>
        <Canvas
          gl={{
            powerPreference: 'low-power',
            failIfMajorPerformanceCaveat: false,
          }}
          frameloop="demand"
        >
          <AssemblyPreview3D
            config={config}
            viewMode={viewMode}
            xRayMode={xRayMode}
            showDimensions={showDimensions}
          />
        </Canvas>

        {/* View mode overlay buttons */}
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            display: 'flex',
            gap: '4px',
          }}
        >
          {(['assembled', 'exploded', 'plate_only'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                ...styles.button,
                ...(viewMode === mode ? styles.buttonActive : styles.buttonInactive),
                padding: '4px 8px',
                fontSize: '10px',
              }}
            >
              {mode === 'assembled' ? 'รวม' : mode === 'exploded' ? 'แยก' : 'Plate'}
            </button>
          ))}
        </div>

        {/* X-Ray toggle */}
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            display: 'flex',
            gap: '8px',
          }}
        >
          <label style={{ ...styles.checkbox, fontSize: '10px', color: '#94a3b8' }}>
            <input
              type="checkbox"
              checked={xRayMode}
              onChange={(e) => setXRayMode(e.target.checked)}
            />
            X-Ray
          </label>
          <label style={{ ...styles.checkbox, fontSize: '10px', color: '#94a3b8' }}>
            <input
              type="checkbox"
              checked={showDimensions}
              onChange={(e) => setShowDimensions(e.target.checked)}
            />
            Dimensions
          </label>
        </div>
      </div>

      {/* Configuration Controls */}
      <div style={styles.controls}>
        {/* Panel Thickness */}
        <div style={styles.row}>
          <span style={styles.label}>ความหนาไม้</span>
          <select
            style={styles.select}
            value={config.panelThickness}
            onChange={(e) => updateConfig({ panelThickness: Number(e.target.value) })}
          >
            <option value={12}>12mm</option>
            <option value={15}>15mm</option>
            <option value={18}>18mm</option>
            <option value={19}>19mm</option>
            <option value={22}>22mm</option>
            <option value={29}>29mm</option>
          </select>
        </div>

        {/* Plate Dimensions */}
        <div style={styles.row}>
          <span style={styles.label}>Plate (L×W×T)</span>
          <input
            type="number"
            style={{ ...styles.input, width: '60px', flex: 'none' }}
            value={config.plate.length}
            onChange={(e) => updatePlate({ length: Number(e.target.value) })}
            min={60}
            max={300}
          />
          <span style={{ color: '#64748b' }}>×</span>
          <input
            type="number"
            style={{ ...styles.input, width: '50px', flex: 'none' }}
            value={config.plate.width}
            onChange={(e) => updatePlate({ width: Number(e.target.value) })}
            min={40}
            max={100}
          />
          <span style={{ color: '#64748b' }}>×</span>
          <input
            type="number"
            style={{ ...styles.input, width: '50px', flex: 'none' }}
            value={config.plate.thickness}
            onChange={(e) => updatePlate({ thickness: Number(e.target.value) })}
            min={8}
            max={25}
          />
        </div>

        {/* Hole Spacing */}
        <div style={styles.row}>
          <span style={styles.label}>ระยะห่างรู</span>
          <select
            style={styles.select}
            value={config.plate.holeSpacing}
            onChange={(e) => updatePlate({ holeSpacing: Number(e.target.value) })}
          >
            <option value={32}>32mm (System 32)</option>
            <option value={64}>64mm (2× System 32)</option>
            <option value={24}>24mm (Drilling B=24)</option>
            <option value={34}>34mm (Drilling B=34)</option>
          </select>
        </div>

        {/* Include Dowels */}
        <div style={styles.row}>
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={config.includeDowels}
              onChange={(e) => updateConfig({ includeDowels: e.target.checked })}
            />
            <span style={{ fontSize: '12px', color: '#e2e8f0' }}>
              รวม Dowel (เดือยไม้ Ø8)
            </span>
          </label>
        </div>
      </div>

      {/* Footer with actions */}
      <div style={styles.footer}>
        <div style={{ fontSize: '10px', color: '#64748b' }}>
          Cam: Ø15 × {CAM_DEPTH_BY_THICKNESS[config.panelThickness] || 13.5}mm
        </div>
        <button
          style={{ ...styles.actionButton, ...styles.primaryButton }}
          onClick={handleGenerateDrillMap}
        >
          <span>🎯</span>
          <span>Generate Drill Map</span>
        </button>
      </div>
    </div>
  );
}

export default ConnectorAssemblyPanel;
