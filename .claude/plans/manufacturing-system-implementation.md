# Manufacturing System Implementation Plan

## Overview
เติมเต็ม SpecKit ให้ครบตาม Factory Workflow Spec โดยเพิ่ม:
1. **OperationGraph System** - Manufacturing operations & drilling
2. **Drill Map Overlay** - 3D visualization of drilling points
3. **Nesting System** - Sheet optimization & yield calculation
4. **GateProvider** - React context for reactive gate status
5. **Real-time Validation** - Live validation during drag operations

---

## Phase 1: OperationGraph System (Foundation)

### 1.1 Core Types

**File:** `src/core/manufacturing/operationTypes.ts`

```typescript
// Operation Types for CNC Manufacturing
export type OperationType =
  | 'DRILL'           // Single point drilling
  | 'BORE'            // Larger diameter boring
  | 'POCKET'          // Material removal area
  | 'PROFILE'         // Edge cutting
  | 'GROOVE'          // Linear channel
  | 'DADO'            // Cross-grain groove
  | 'RABBET'          // Edge rebate
  | 'EDGE_BAND';      // Edge banding application

export type OperationFace = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | 'FRONT' | 'BACK';

export interface DrillOperation {
  id: string;
  type: 'DRILL' | 'BORE';
  face: OperationFace;
  x: number;           // mm from face origin
  y: number;           // mm from face origin
  diameter: number;    // mm
  depth: number;       // mm (positive = into material)
  throughHole: boolean;
  toolId: string;
  purpose: DrillPurpose;
}

export type DrillPurpose =
  | 'SHELF_PIN'       // 5mm shelf support
  | 'SYSTEM_32'       // 5mm system holes
  | 'HINGE_CUP'       // 35mm hinge boring
  | 'HINGE_SCREW'     // 3mm pilot holes
  | 'DOWEL'           // 8mm dowel holes
  | 'MINIFIX'         // 15mm minifix boring
  | 'CONFIRMAT'       // 5mm confirmat pilot
  | 'CAM_LOCK'        // Cam lock hardware
  | 'HANDLE'          // Handle mounting
  | 'CUSTOM';

export interface GrooveOperation {
  id: string;
  type: 'GROOVE' | 'DADO' | 'RABBET';
  face: OperationFace;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  width: number;       // mm
  depth: number;       // mm
  toolId: string;
  purpose: 'BACK_PANEL' | 'SHELF_DADO' | 'EDGE_RABBET' | 'CUSTOM';
}

export interface ProfileOperation {
  id: string;
  type: 'PROFILE';
  face: OperationFace;
  path: Vec2[];        // Cutting path
  depth: number;       // Full thickness cut
  toolId: string;
  direction: 'CW' | 'CCW';  // Climb vs conventional
}

export interface EdgeBandOperation {
  id: string;
  type: 'EDGE_BAND';
  edge: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';
  materialId: string;
  thickness: number;   // mm
  premill: boolean;
  premillDepth?: number;
}

export type Operation =
  | DrillOperation
  | GrooveOperation
  | ProfileOperation
  | EdgeBandOperation;

export interface PartOperations {
  partId: string;
  panelId: string;
  cabinetId: string;
  dimensions: { w: number; h: number; t: number };
  material: string;
  grain: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  operations: Operation[];
  sequence: string[];  // Operation IDs in execution order
}

export interface OperationGraph {
  version: '1.0';
  jobId: string;
  createdIso: string;
  parts: PartOperations[];
  tools: ToolRequirement[];
  estimatedTime: number;  // minutes
  warnings: string[];
}

export interface ToolRequirement {
  toolId: string;
  name: string;
  diameter: number;
  type: 'DRILL' | 'END_MILL' | 'ROUTER' | 'BORE';
  usageCount: number;
  totalLength: number;  // mm of cutting
}
```

### 1.2 Operation Generator

**File:** `src/core/manufacturing/generateOperations.ts`

```typescript
/**
 * Generate OperationGraph from Cabinet Structure
 *
 * INPUT: Cabinet with panels, hardware, joinery
 * OUTPUT: Complete OperationGraph for CNC
 */

export function generateOperationGraph(
  cabinet: Cabinet,
  machineProfile: MachineProfile
): OperationGraph {
  const parts: PartOperations[] = [];
  const toolSet = new Map<string, ToolRequirement>();

  // 1. Generate operations for each panel
  for (const panel of getAllPanels(cabinet)) {
    const partOps = generatePartOperations(panel, cabinet, machineProfile);
    parts.push(partOps);

    // Collect tool requirements
    for (const op of partOps.operations) {
      collectToolUsage(toolSet, op);
    }
  }

  // 2. Add hardware drilling
  for (const hardware of cabinet.hardware || []) {
    const drillingOps = generateHardwareDrilling(hardware, cabinet);
    // Merge into relevant parts
    mergeDrillingIntoParts(parts, drillingOps);
  }

  // 3. Calculate sequence per part
  for (const part of parts) {
    part.sequence = calculateOperationSequence(part.operations, machineProfile);
  }

  // 4. Estimate machining time
  const estimatedTime = estimateMachiningTime(parts, machineProfile);

  return {
    version: '1.0',
    jobId: generateId(),
    createdIso: new Date().toISOString(),
    parts,
    tools: Array.from(toolSet.values()),
    estimatedTime,
    warnings: collectWarnings(parts, machineProfile),
  };
}

function generatePartOperations(
  panel: Panel,
  cabinet: Cabinet,
  machine: MachineProfile
): PartOperations {
  const operations: Operation[] = [];

  // Edge banding (first - affects final dimensions)
  const edgeOps = generateEdgeBanding(panel);
  operations.push(...edgeOps);

  // Back panel groove (if side panel)
  if (panel.type === 'SIDE' && cabinet.structure.hasBackPanel) {
    const grooveOp = generateBackPanelGroove(panel, cabinet);
    operations.push(grooveOp);
  }

  // System 32 holes (if applicable)
  if (panel.type === 'SIDE' && cabinet.structure.system32) {
    const system32Ops = generateSystem32Drilling(panel, cabinet);
    operations.push(...system32Ops);
  }

  // Shelf pin holes
  if (panel.type === 'SIDE') {
    const shelfPinOps = generateShelfPinDrilling(panel, cabinet);
    operations.push(...shelfPinOps);
  }

  // Hinge boring (if door panel)
  if (panel.type === 'DOOR') {
    const hingeOps = generateHingeBoring(panel, cabinet);
    operations.push(...hingeOps);
  }

  // Joinery operations
  const joineryOps = generateJoineryOperations(panel, cabinet);
  operations.push(...joineryOps);

  return {
    partId: generateId(),
    panelId: panel.id,
    cabinetId: cabinet.id,
    dimensions: {
      w: panel.dimensions.width,
      h: panel.dimensions.height,
      t: panel.dimensions.thickness,
    },
    material: panel.material?.coreId || 'unknown',
    grain: panel.grain || 'NONE',
    operations,
    sequence: [], // Calculated later
  };
}
```

### 1.3 System 32 Drilling Generator

**File:** `src/core/manufacturing/system32Drilling.ts`

```typescript
/**
 * System 32 (European 32mm System) Drilling Generator
 *
 * Standard:
 * - 5mm diameter holes
 * - 32mm vertical spacing
 * - 37mm from front/back edges
 * - Starting 37mm from top/bottom
 */

export interface System32Config {
  holeDiameter: number;     // Usually 5mm
  verticalSpacing: number;  // Usually 32mm
  frontSetback: number;     // Usually 37mm
  backSetback: number;      // Usually 37mm
  topStart: number;         // Usually 37mm
  bottomStart: number;      // Usually 37mm
  holeDepth: number;        // Usually 12mm
  rows: 'SINGLE' | 'DOUBLE'; // Front only or front+back
}

export const DEFAULT_SYSTEM32: System32Config = {
  holeDiameter: 5,
  verticalSpacing: 32,
  frontSetback: 37,
  backSetback: 37,
  topStart: 37,
  bottomStart: 37,
  holeDepth: 12,
  rows: 'DOUBLE',
};

export function generateSystem32Drilling(
  panel: Panel,
  cabinet: Cabinet,
  config: System32Config = DEFAULT_SYSTEM32
): DrillOperation[] {
  const operations: DrillOperation[] = [];
  const height = panel.dimensions.height;

  // Calculate number of holes
  const usableHeight = height - config.topStart - config.bottomStart;
  const holeCount = Math.floor(usableHeight / config.verticalSpacing) + 1;

  // Front row
  for (let i = 0; i < holeCount; i++) {
    const y = config.bottomStart + (i * config.verticalSpacing);

    operations.push({
      id: generateId(),
      type: 'DRILL',
      face: 'TOP', // Drilling into panel face
      x: config.frontSetback,
      y: y,
      diameter: config.holeDiameter,
      depth: config.holeDepth,
      throughHole: false,
      toolId: `drill_${config.holeDiameter}mm`,
      purpose: 'SYSTEM_32',
    });
  }

  // Back row (if double row)
  if (config.rows === 'DOUBLE') {
    const backX = panel.dimensions.width - config.backSetback;

    for (let i = 0; i < holeCount; i++) {
      const y = config.bottomStart + (i * config.verticalSpacing);

      operations.push({
        id: generateId(),
        type: 'DRILL',
        face: 'TOP',
        x: backX,
        y: y,
        diameter: config.holeDiameter,
        depth: config.holeDepth,
        throughHole: false,
        toolId: `drill_${config.holeDiameter}mm`,
        purpose: 'SYSTEM_32',
      });
    }
  }

  return operations;
}
```

### 1.4 Hardware Drilling Templates

**File:** `src/core/manufacturing/hardwareTemplates.ts`

```typescript
/**
 * Hardware Drilling Templates
 *
 * Standard drilling patterns for common cabinet hardware
 */

// Blum CLIP top hinge (35mm cup)
export const BLUM_CLIP_TOP: HardwareTemplate = {
  id: 'blum_clip_top',
  name: 'Blum CLIP top 110°',
  category: 'HINGE',
  operations: [
    // Cup boring (door side)
    {
      type: 'BORE',
      face: 'BACK',
      offsetX: 0,      // Relative to hinge position
      offsetY: 0,
      diameter: 35,
      depth: 13,
      purpose: 'HINGE_CUP',
    },
    // Mounting holes (door side)
    {
      type: 'DRILL',
      face: 'BACK',
      offsetX: -24,
      offsetY: 0,
      diameter: 3,
      depth: 12,
      purpose: 'HINGE_SCREW',
    },
    {
      type: 'DRILL',
      face: 'BACK',
      offsetX: 24,
      offsetY: 0,
      diameter: 3,
      depth: 12,
      purpose: 'HINGE_SCREW',
    },
    // Mounting plate holes (cabinet side)
    {
      type: 'DRILL',
      face: 'TOP',
      offsetX: 0,
      offsetY: -16,
      diameter: 5,
      depth: 12,
      purpose: 'SYSTEM_32',
      targetPart: 'SIDE_PANEL',
    },
    {
      type: 'DRILL',
      face: 'TOP',
      offsetX: 0,
      offsetY: 16,
      diameter: 5,
      depth: 12,
      purpose: 'SYSTEM_32',
      targetPart: 'SIDE_PANEL',
    },
  ],
  constraints: {
    doorThicknessMin: 16,
    doorThicknessMax: 24,
    cupDepthMin: 11.5,
    edgeDistance: 3, // Minimum from door edge to cup
  },
};

// Minifix 15 connector
export const MINIFIX_15: HardwareTemplate = {
  id: 'minifix_15',
  name: 'Minifix 15',
  category: 'CONNECTOR',
  operations: [
    // Housing bore
    {
      type: 'BORE',
      face: 'EDGE',
      offsetX: 0,
      offsetY: 0,
      diameter: 15,
      depth: 12.5,
      purpose: 'MINIFIX',
    },
    // Bolt hole (mating panel)
    {
      type: 'DRILL',
      face: 'TOP',
      offsetX: 0,
      offsetY: 34, // Standard 34mm from edge
      diameter: 8,
      depth: 'THROUGH',
      purpose: 'MINIFIX',
      targetPart: 'MATING',
    },
  ],
  constraints: {
    panelThicknessMin: 16,
    edgeDistanceMin: 37, // From housing center to panel edge
  },
};

// Confirmat screw
export const CONFIRMAT_7X50: HardwareTemplate = {
  id: 'confirmat_7x50',
  name: 'Confirmat 7x50',
  category: 'CONNECTOR',
  operations: [
    // Pilot hole (edge)
    {
      type: 'DRILL',
      face: 'EDGE',
      offsetX: 0,
      offsetY: 0,
      diameter: 5,
      depth: 45,
      purpose: 'CONFIRMAT',
    },
    // Through hole (face)
    {
      type: 'DRILL',
      face: 'TOP',
      offsetX: 0,
      offsetY: 8, // Panel thickness / 2
      diameter: 8,
      depth: 'THROUGH',
      purpose: 'CONFIRMAT',
      targetPart: 'MATING',
      countersink: true,
    },
  ],
};

// Dowel 8x35
export const DOWEL_8X35: HardwareTemplate = {
  id: 'dowel_8x35',
  name: 'Dowel 8x35',
  category: 'CONNECTOR',
  operations: [
    {
      type: 'DRILL',
      face: 'EDGE',
      offsetX: 0,
      offsetY: 0,
      diameter: 8,
      depth: 18,
      purpose: 'DOWEL',
    },
    {
      type: 'DRILL',
      face: 'TOP',
      offsetX: 0,
      offsetY: 8,
      diameter: 8,
      depth: 18,
      purpose: 'DOWEL',
      targetPart: 'MATING',
    },
  ],
};
```

---

## Phase 2: Drill Map Overlay

### 2.1 Drill Map Types

**File:** `src/core/manufacturing/drillMapTypes.ts`

```typescript
export interface DrillMapPoint {
  id: string;
  operationId: string;
  position: Vec3;       // World position
  normal: Vec3;         // Drill direction
  diameter: number;
  depth: number;
  purpose: DrillPurpose;
  face: OperationFace;
  status: 'PENDING' | 'VALID' | 'WARNING' | 'ERROR';
  issues?: string[];
}

export interface DrillMapPanel {
  panelId: string;
  cabinetId: string;
  worldTransform: Matrix4;
  points: DrillMapPoint[];
  grooves: GrooveVisualization[];
}

export interface DrillMap {
  jobId: string;
  panels: DrillMapPanel[];
  summary: {
    totalDrills: number;
    totalBores: number;
    totalGrooves: number;
    toolChanges: number;
    estimatedTime: number;
  };
}

export interface GrooveVisualization {
  id: string;
  operationId: string;
  path: Vec3[];
  width: number;
  depth: number;
  purpose: string;
}
```

### 2.2 Drill Map Overlay Component

**File:** `src/components/canvas/DrillMapOverlay.tsx`

```typescript
/**
 * DrillMapOverlay - 3D visualization of drilling operations
 *
 * Renders:
 * - Drill points as colored cylinders
 * - Grooves as extruded paths
 * - Hover info with operation details
 * - Color coding by purpose/status
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';

interface DrillMapOverlayProps {
  drillMap: DrillMap;
  visible: boolean;
  selectedPurpose?: DrillPurpose | null;
  onPointHover?: (point: DrillMapPoint | null) => void;
  onPointClick?: (point: DrillMapPoint) => void;
}

const PURPOSE_COLORS: Record<DrillPurpose, string> = {
  SHELF_PIN: '#4ade80',    // Green
  SYSTEM_32: '#60a5fa',    // Blue
  HINGE_CUP: '#f472b6',    // Pink
  HINGE_SCREW: '#f472b6',  // Pink
  DOWEL: '#fbbf24',        // Amber
  MINIFIX: '#a78bfa',      // Purple
  CONFIRMAT: '#fb923c',    // Orange
  CAM_LOCK: '#a78bfa',     // Purple
  HANDLE: '#94a3b8',       // Gray
  CUSTOM: '#94a3b8',       // Gray
};

export function DrillMapOverlay({
  drillMap,
  visible,
  selectedPurpose,
  onPointHover,
  onPointClick,
}: DrillMapOverlayProps) {
  if (!visible) return null;

  return (
    <group name="drill-map-overlay">
      {drillMap.panels.map((panel) => (
        <DrillMapPanel
          key={panel.panelId}
          panel={panel}
          selectedPurpose={selectedPurpose}
          onPointHover={onPointHover}
          onPointClick={onPointClick}
        />
      ))}
    </group>
  );
}

function DrillMapPanel({
  panel,
  selectedPurpose,
  onPointHover,
  onPointClick,
}: {
  panel: DrillMapPanel;
  selectedPurpose?: DrillPurpose | null;
  onPointHover?: (point: DrillMapPoint | null) => void;
  onPointClick?: (point: DrillMapPoint) => void;
}) {
  return (
    <group>
      {/* Drill points */}
      {panel.points.map((point) => (
        <DrillPointMarker
          key={point.id}
          point={point}
          dimmed={selectedPurpose !== null && point.purpose !== selectedPurpose}
          onHover={onPointHover}
          onClick={onPointClick}
        />
      ))}

      {/* Grooves */}
      {panel.grooves.map((groove) => (
        <GrooveMarker key={groove.id} groove={groove} />
      ))}
    </group>
  );
}

function DrillPointMarker({
  point,
  dimmed,
  onHover,
  onClick,
}: {
  point: DrillMapPoint;
  dimmed: boolean;
  onHover?: (point: DrillMapPoint | null) => void;
  onClick?: (point: DrillMapPoint) => void;
}) {
  const color = PURPOSE_COLORS[point.purpose] || '#94a3b8';
  const opacity = dimmed ? 0.3 : 0.8;

  // Create cylinder pointing in drill direction
  const rotation = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3(point.normal.x, point.normal.y, point.normal.z);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir);
    return new THREE.Euler().setFromQuaternion(quaternion);
  }, [point.normal]);

  return (
    <group position={[point.position.x, point.position.y, point.position.z]}>
      <mesh
        rotation={rotation}
        onPointerEnter={() => onHover?.(point)}
        onPointerLeave={() => onHover?.(null)}
        onClick={() => onClick?.(point)}
      >
        <cylinderGeometry args={[
          point.diameter / 2,
          point.diameter / 2,
          point.depth,
          16
        ]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Drill direction indicator */}
      <arrowHelper
        args={[
          new THREE.Vector3(point.normal.x, point.normal.y, point.normal.z),
          new THREE.Vector3(0, 0, 0),
          point.depth + 10,
          color,
        ]}
      />
    </group>
  );
}
```

### 2.3 Drill Map Info Panel

**File:** `src/components/ui/DrillMapInfoPanel.tsx`

```typescript
/**
 * Side panel showing drill map details
 * - Summary statistics
 * - Filter by purpose
 * - Tool list
 * - Warnings/errors
 */

interface DrillMapInfoPanelProps {
  drillMap: DrillMap;
  operationGraph: OperationGraph;
  selectedPurpose: DrillPurpose | null;
  onPurposeSelect: (purpose: DrillPurpose | null) => void;
}

export function DrillMapInfoPanel({
  drillMap,
  operationGraph,
  selectedPurpose,
  onPurposeSelect,
}: DrillMapInfoPanelProps) {
  // Group points by purpose
  const purposeCounts = useMemo(() => {
    const counts = new Map<DrillPurpose, number>();
    for (const panel of drillMap.panels) {
      for (const point of panel.points) {
        counts.set(point.purpose, (counts.get(point.purpose) || 0) + 1);
      }
    }
    return counts;
  }, [drillMap]);

  return (
    <div className="p-4 bg-gray-900 rounded-lg">
      <h3 className="text-lg font-semibold text-white mb-4">
        Drill Map
      </h3>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
        <div className="text-gray-400">Total Drills:</div>
        <div className="text-white">{drillMap.summary.totalDrills}</div>
        <div className="text-gray-400">Total Bores:</div>
        <div className="text-white">{drillMap.summary.totalBores}</div>
        <div className="text-gray-400">Tool Changes:</div>
        <div className="text-white">{drillMap.summary.toolChanges}</div>
        <div className="text-gray-400">Est. Time:</div>
        <div className="text-white">{drillMap.summary.estimatedTime} min</div>
      </div>

      {/* Filter by purpose */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-300 mb-2">Filter by Type</h4>
        <div className="flex flex-wrap gap-2">
          <button
            className={`px-2 py-1 text-xs rounded ${
              selectedPurpose === null
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300'
            }`}
            onClick={() => onPurposeSelect(null)}
          >
            All
          </button>
          {Array.from(purposeCounts.entries()).map(([purpose, count]) => (
            <button
              key={purpose}
              className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
                selectedPurpose === purpose
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300'
              }`}
              onClick={() => onPurposeSelect(purpose)}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: PURPOSE_COLORS[purpose] }}
              />
              {purpose.replace('_', ' ')} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Tools required */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-300 mb-2">Tools Required</h4>
        <div className="space-y-1">
          {operationGraph.tools.map((tool) => (
            <div
              key={tool.toolId}
              className="flex justify-between text-xs text-gray-400"
            >
              <span>{tool.name}</span>
              <span>ø{tool.diameter}mm × {tool.usageCount}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Warnings */}
      {operationGraph.warnings.length > 0 && (
        <div className="mt-4 p-2 bg-amber-900/30 rounded">
          <h4 className="text-sm font-medium text-amber-400 mb-1">Warnings</h4>
          <ul className="text-xs text-amber-300 space-y-1">
            {operationGraph.warnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

---

## Phase 3: Nesting System

### 3.1 Nesting Types

**File:** `src/core/nesting/nestingTypes.ts`

```typescript
export interface SheetStock {
  id: string;
  materialId: string;
  width: number;       // mm
  height: number;      // mm
  thickness: number;   // mm
  grainDirection: 'WIDTH' | 'HEIGHT' | 'NONE';
  cost: number;        // per sheet
  available: number;   // quantity
}

export interface NestingPart {
  partId: string;
  panelId: string;
  cabinetId: string;
  width: number;
  height: number;
  thickness: number;
  grain: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  canRotate: boolean;  // Can rotate 90° (grain permitting)
  quantity: number;
  priority: number;    // Higher = nest first
  label: string;
}

export interface PlacedPart {
  partId: string;
  x: number;           // mm from sheet origin
  y: number;
  rotated: boolean;    // Rotated 90°
  sheetIndex: number;
}

export interface NestingSheet {
  sheetIndex: number;
  stockId: string;
  parts: PlacedPart[];
  usedArea: number;    // mm²
  wasteArea: number;   // mm²
  efficiency: number;  // 0-100%
}

export interface NestingResult {
  version: '1.0';
  jobId: string;
  algorithm: 'GUILLOTINE' | 'BIN_PACK' | 'GENETIC';
  sheets: NestingSheet[];
  unplacedParts: string[];  // Parts that didn't fit
  summary: NestingSummary;
  createdIso: string;
}

export interface NestingSummary {
  totalSheets: number;
  totalParts: number;
  placedParts: number;
  unplacedParts: number;
  totalArea: number;       // mm²
  usedArea: number;        // mm²
  wasteArea: number;       // mm²
  overallEfficiency: number;  // 0-100%
  estimatedCost: number;
  cuttingLength: number;   // Total saw blade travel
}

export interface NestingConfig {
  bladeKerf: number;       // mm (typically 3-4mm)
  edgeTrim: number;        // mm from sheet edge
  minPartGap: number;      // mm between parts
  preferGrainMatch: boolean;
  allowRotation: boolean;
  algorithm: 'GUILLOTINE' | 'BIN_PACK' | 'GENETIC';
}

export const DEFAULT_NESTING_CONFIG: NestingConfig = {
  bladeKerf: 3.2,
  edgeTrim: 10,
  minPartGap: 0,
  preferGrainMatch: true,
  allowRotation: true,
  algorithm: 'GUILLOTINE',
};
```

### 3.2 Guillotine Nesting Algorithm

**File:** `src/core/nesting/guillotineNesting.ts`

```typescript
/**
 * Guillotine Nesting Algorithm
 *
 * Creates cuts that go completely through the sheet
 * (like a panel saw). Simpler but less optimal than bin packing.
 */

export function runGuillotineNesting(
  parts: NestingPart[],
  stock: SheetStock[],
  config: NestingConfig = DEFAULT_NESTING_CONFIG
): NestingResult {
  // Sort parts by area (largest first)
  const sortedParts = [...parts].sort(
    (a, b) => (b.width * b.height) - (a.width * a.height)
  );

  const sheets: NestingSheet[] = [];
  const placed: PlacedPart[] = [];
  const unplaced: string[] = [];

  // Available rectangles on current sheet
  let freeRects: FreeRect[] = [];
  let currentSheet = 0;
  let currentStock: SheetStock | null = null;

  function startNewSheet(): boolean {
    // Find suitable stock
    currentStock = findBestStock(stock, sortedParts[0]);
    if (!currentStock) return false;

    currentSheet++;
    freeRects = [{
      x: config.edgeTrim,
      y: config.edgeTrim,
      width: currentStock.width - 2 * config.edgeTrim,
      height: currentStock.height - 2 * config.edgeTrim,
    }];

    sheets.push({
      sheetIndex: currentSheet,
      stockId: currentStock.id,
      parts: [],
      usedArea: 0,
      wasteArea: 0,
      efficiency: 0,
    });

    return true;
  }

  // Start first sheet
  if (!startNewSheet()) {
    return createEmptyResult(parts.map(p => p.partId));
  }

  // Place each part
  for (const part of sortedParts) {
    for (let qty = 0; qty < part.quantity; qty++) {
      const placement = findBestPlacement(
        part,
        freeRects,
        config,
        currentStock!
      );

      if (placement) {
        // Place the part
        const placedPart: PlacedPart = {
          partId: part.partId,
          x: placement.x,
          y: placement.y,
          rotated: placement.rotated,
          sheetIndex: currentSheet,
        };

        sheets[currentSheet - 1].parts.push(placedPart);
        placed.push(placedPart);

        // Split free rectangles (guillotine cut)
        freeRects = splitRectangle(
          freeRects,
          placement,
          part,
          config.bladeKerf
        );
      } else {
        // Try new sheet
        if (startNewSheet()) {
          const newPlacement = findBestPlacement(
            part,
            freeRects,
            config,
            currentStock!
          );

          if (newPlacement) {
            const placedPart: PlacedPart = {
              partId: part.partId,
              x: newPlacement.x,
              y: newPlacement.y,
              rotated: newPlacement.rotated,
              sheetIndex: currentSheet,
            };

            sheets[currentSheet - 1].parts.push(placedPart);
            placed.push(placedPart);

            freeRects = splitRectangle(
              freeRects,
              newPlacement,
              part,
              config.bladeKerf
            );
          } else {
            unplaced.push(part.partId);
          }
        } else {
          unplaced.push(part.partId);
        }
      }
    }
  }

  // Calculate summary
  const summary = calculateNestingSummary(sheets, stock);

  return {
    version: '1.0',
    jobId: generateId(),
    algorithm: 'GUILLOTINE',
    sheets,
    unplacedParts: unplaced,
    summary,
    createdIso: new Date().toISOString(),
  };
}

interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Placement {
  x: number;
  y: number;
  rotated: boolean;
  rectIndex: number;
}

function findBestPlacement(
  part: NestingPart,
  freeRects: FreeRect[],
  config: NestingConfig,
  stock: SheetStock
): Placement | null {
  let bestPlacement: Placement | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < freeRects.length; i++) {
    const rect = freeRects[i];

    // Try normal orientation
    if (canFit(part.width, part.height, rect, config)) {
      const score = scorePlace(part.width, part.height, rect);
      if (score < bestScore) {
        bestScore = score;
        bestPlacement = {
          x: rect.x,
          y: rect.y,
          rotated: false,
          rectIndex: i,
        };
      }
    }

    // Try rotated (if allowed and grain permits)
    if (config.allowRotation && canRotate(part, stock)) {
      if (canFit(part.height, part.width, rect, config)) {
        const score = scorePlace(part.height, part.width, rect);
        if (score < bestScore) {
          bestScore = score;
          bestPlacement = {
            x: rect.x,
            y: rect.y,
            rotated: true,
            rectIndex: i,
          };
        }
      }
    }
  }

  return bestPlacement;
}

function canRotate(part: NestingPart, stock: SheetStock): boolean {
  if (!part.canRotate) return false;
  if (part.grain === 'NONE') return true;
  if (stock.grainDirection === 'NONE') return true;

  // Can only rotate if grain doesn't matter or matches after rotation
  return false; // Conservative: respect grain
}

function splitRectangle(
  freeRects: FreeRect[],
  placement: Placement,
  part: NestingPart,
  kerf: number
): FreeRect[] {
  const rect = freeRects[placement.rectIndex];
  const newRects = freeRects.filter((_, i) => i !== placement.rectIndex);

  const partW = placement.rotated ? part.height : part.width;
  const partH = placement.rotated ? part.width : part.height;

  // Right remainder
  const rightW = rect.width - partW - kerf;
  if (rightW > 50) { // Min useful width
    newRects.push({
      x: rect.x + partW + kerf,
      y: rect.y,
      width: rightW,
      height: rect.height,
    });
  }

  // Top remainder
  const topH = rect.height - partH - kerf;
  if (topH > 50) { // Min useful height
    newRects.push({
      x: rect.x,
      y: rect.y + partH + kerf,
      width: partW,
      height: topH,
    });
  }

  return newRects;
}
```

### 3.3 Nesting Preview Component

**File:** `src/components/ui/NestingPreview.tsx`

```typescript
/**
 * 2D Nesting Preview
 *
 * Shows sheet layouts with placed parts
 */

interface NestingPreviewProps {
  result: NestingResult;
  stock: SheetStock[];
  selectedPart?: string | null;
  onPartClick?: (partId: string) => void;
}

export function NestingPreview({
  result,
  stock,
  selectedPart,
  onPartClick,
}: NestingPreviewProps) {
  const [activeSheet, setActiveSheet] = useState(0);

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      {/* Summary bar */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">
          Nesting Preview
        </h3>
        <div className="flex gap-4 text-sm">
          <span className="text-gray-400">
            Sheets: <span className="text-white">{result.summary.totalSheets}</span>
          </span>
          <span className="text-gray-400">
            Efficiency: <span className="text-green-400">{result.summary.overallEfficiency.toFixed(1)}%</span>
          </span>
          <span className="text-gray-400">
            Waste: <span className="text-amber-400">{(result.summary.wasteArea / 1000000).toFixed(2)} m²</span>
          </span>
        </div>
      </div>

      {/* Sheet tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {result.sheets.map((sheet, i) => (
          <button
            key={i}
            className={`px-3 py-1 text-sm rounded ${
              activeSheet === i
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300'
            }`}
            onClick={() => setActiveSheet(i)}
          >
            Sheet {i + 1}
            <span className="ml-2 text-xs opacity-70">
              {sheet.efficiency.toFixed(0)}%
            </span>
          </button>
        ))}
      </div>

      {/* Sheet visualization */}
      <SheetVisualization
        sheet={result.sheets[activeSheet]}
        stock={stock.find(s => s.id === result.sheets[activeSheet].stockId)!}
        selectedPart={selectedPart}
        onPartClick={onPartClick}
      />

      {/* Unplaced parts warning */}
      {result.unplacedParts.length > 0 && (
        <div className="mt-4 p-3 bg-red-900/30 rounded border border-red-500/50">
          <h4 className="text-red-400 font-medium mb-1">
            Unplaced Parts ({result.unplacedParts.length})
          </h4>
          <p className="text-red-300 text-sm">
            These parts couldn't fit on available sheets.
            Consider adding more stock or larger sheets.
          </p>
        </div>
      )}
    </div>
  );
}

function SheetVisualization({
  sheet,
  stock,
  selectedPart,
  onPartClick,
}: {
  sheet: NestingSheet;
  stock: SheetStock;
  selectedPart?: string | null;
  onPartClick?: (partId: string) => void;
}) {
  const scale = 0.2; // mm to pixels

  return (
    <svg
      width={stock.width * scale}
      height={stock.height * scale}
      className="bg-gray-800 rounded"
    >
      {/* Sheet outline */}
      <rect
        x={0}
        y={0}
        width={stock.width * scale}
        height={stock.height * scale}
        fill="none"
        stroke="#4b5563"
        strokeWidth={2}
      />

      {/* Grain direction indicator */}
      {stock.grainDirection !== 'NONE' && (
        <GrainPattern
          width={stock.width * scale}
          height={stock.height * scale}
          direction={stock.grainDirection}
        />
      )}

      {/* Placed parts */}
      {sheet.parts.map((part) => (
        <PlacedPartRect
          key={`${part.partId}-${part.x}-${part.y}`}
          part={part}
          scale={scale}
          isSelected={selectedPart === part.partId}
          onClick={() => onPartClick?.(part.partId)}
        />
      ))}
    </svg>
  );
}
```

---

## Phase 4: GateProvider React Context

### 4.1 Gate Context

**File:** `src/core/gate/GateProvider.tsx`

```typescript
import { createContext, useContext, useCallback, useEffect, useState, ReactNode } from 'react';
import { useCabinetStore } from '../store/useCabinetStore';
import { useSpecStore } from '../store/useSpecStore';
import { runGateBundle, type GateBundleResult } from './runGateBundle';

interface GateContextValue {
  // Current gate result
  result: GateBundleResult | null;

  // Status flags
  isRunning: boolean;
  isBlocked: boolean;
  errorCount: number;
  warningCount: number;

  // Actions
  runGate: () => Promise<GateBundleResult>;
  clearGate: () => void;

  // Selectors
  getIssuesForCabinet: (cabinetId: string) => GateIssue[];
  hasBlockers: () => boolean;
}

const GateContext = createContext<GateContextValue | null>(null);

export function GateProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<GateBundleResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const cabinets = useCabinetStore((s) => s.cabinets);
  const activeCabinetId = useCabinetStore((s) => s.activeCabinetId);
  const specState = useSpecStore((s) => s.specState);

  // Run gate validation
  const runGate = useCallback(async () => {
    setIsRunning(true);
    try {
      const newResult = await runGateBundle(cabinets, {
        includeCollision: true,
        machineProfile: useSpecStore.getState().selectedMachine,
      });
      setResult(newResult);
      return newResult;
    } finally {
      setIsRunning(false);
    }
  }, [cabinets]);

  // Clear gate result
  const clearGate = useCallback(() => {
    setResult(null);
  }, []);

  // Get issues for specific cabinet
  const getIssuesForCabinet = useCallback((cabinetId: string) => {
    if (!result) return [];
    const cabinetResult = result.perCabinet.find(c => c.id === cabinetId);
    return cabinetResult?.issues || [];
  }, [result]);

  // Check if blocked
  const hasBlockers = useCallback(() => {
    if (!result) return false;
    return result.errorCount > 0;
  }, [result]);

  // Auto-run gate when cabinets change (in FROZEN state only)
  useEffect(() => {
    if (specState === 'FROZEN') {
      const timer = setTimeout(() => {
        runGate();
      }, 500); // Debounce
      return () => clearTimeout(timer);
    }
  }, [cabinets, specState, runGate]);

  // Clear gate when leaving FROZEN state
  useEffect(() => {
    if (specState === 'DRAFT') {
      clearGate();
    }
  }, [specState, clearGate]);

  const value: GateContextValue = {
    result,
    isRunning,
    isBlocked: result?.ok === false,
    errorCount: result?.errorCount ?? 0,
    warningCount: result?.warningCount ?? 0,
    runGate,
    clearGate,
    getIssuesForCabinet,
    hasBlockers,
  };

  return (
    <GateContext.Provider value={value}>
      {children}
    </GateContext.Provider>
  );
}

export function useGate() {
  const context = useContext(GateContext);
  if (!context) {
    throw new Error('useGate must be used within GateProvider');
  }
  return context;
}

// Convenience hooks
export function useGateResult() {
  return useGate().result;
}

export function useIsGateBlocked() {
  return useGate().isBlocked;
}

export function useGateIssuesForCabinet(cabinetId: string) {
  return useGate().getIssuesForCabinet(cabinetId);
}
```

---

## Phase 5: Real-time Validation Display

### 5.1 Live Validation Store

**File:** `src/core/store/useLiveValidationStore.ts`

```typescript
import { create } from 'zustand';
import { runGateBundleCollisionOnly } from '../gate/runGateBundle';

interface LiveValidationState {
  // Current drag validation
  isDragValidating: boolean;
  dragCollisions: CollisionPair[];
  dragWarnings: string[];

  // Actions
  validateDragPosition: (
    cabinetId: string,
    position: Vec3,
    allCabinets: Cabinet[]
  ) => Promise<void>;
  clearDragValidation: () => void;
}

export const useLiveValidationStore = create<LiveValidationState>((set, get) => ({
  isDragValidating: false,
  dragCollisions: [],
  dragWarnings: [],

  validateDragPosition: async (cabinetId, position, allCabinets) => {
    set({ isDragValidating: true });

    // Create temp cabinet list with updated position
    const tempCabinets = allCabinets.map(c =>
      c.id === cabinetId
        ? { ...c, scenePosition: [position.x, position.y, position.z] }
        : c
    );

    // Run collision-only validation (fast)
    const result = await runGateBundleCollisionOnly(tempCabinets);

    set({
      isDragValidating: false,
      dragCollisions: result.collisionPairs || [],
      dragWarnings: result.warnings || [],
    });
  },

  clearDragValidation: () => {
    set({
      dragCollisions: [],
      dragWarnings: [],
    });
  },
}));
```

### 5.2 Collision Highlight Component

**File:** `src/components/canvas/CollisionHighlight.tsx`

```typescript
/**
 * Visual collision feedback during drag operations
 */

import { useLiveValidationStore } from '../../core/store/useLiveValidationStore';

export function CollisionHighlight() {
  const collisions = useLiveValidationStore((s) => s.dragCollisions);

  if (collisions.length === 0) return null;

  return (
    <group name="collision-highlights">
      {collisions.map((collision, i) => (
        <CollisionIndicator key={i} collision={collision} />
      ))}
    </group>
  );
}

function CollisionIndicator({ collision }: { collision: CollisionPair }) {
  const isError = collision.penetrationDepth > 10; // >10mm = error
  const color = isError ? '#ef4444' : '#f59e0b';

  // Draw line between collision points
  const midpoint = [
    (collision.pointA.x + collision.pointB.x) / 2,
    (collision.pointA.y + collision.pointB.y) / 2,
    (collision.pointA.z + collision.pointB.z) / 2,
  ];

  return (
    <group position={midpoint as [number, number, number]}>
      {/* Pulsing sphere at collision point */}
      <mesh>
        <sphereGeometry args={[20, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
        />
      </mesh>

      {/* Warning icon */}
      <Html center>
        <div className={`
          px-2 py-1 rounded text-xs font-bold
          ${isError ? 'bg-red-600' : 'bg-amber-600'}
          text-white
        `}>
          {isError ? '⛔' : '⚠️'} {Math.abs(collision.penetrationDepth).toFixed(0)}mm
        </div>
      </Html>
    </group>
  );
}
```

---

## Implementation Order

### Sprint 1: OperationGraph Foundation (1-2 weeks)
1. `operationTypes.ts` - Core types
2. `generateOperations.ts` - Basic operation generation
3. `system32Drilling.ts` - System 32 holes
4. `hardwareTemplates.ts` - Hardware drilling templates
5. Unit tests for all above

### Sprint 2: Drill Map Visualization (1 week)
1. `drillMapTypes.ts` - Types
2. `generateDrillMap.ts` - Convert OperationGraph to DrillMap
3. `DrillMapOverlay.tsx` - 3D visualization
4. `DrillMapInfoPanel.tsx` - Info panel
5. Integration with FROZEN mode UI

### Sprint 3: Nesting System (1-2 weeks)
1. `nestingTypes.ts` - Types
2. `guillotineNesting.ts` - Basic algorithm
3. `NestingPreview.tsx` - 2D visualization
4. `NestingInfoPanel.tsx` - Summary panel
5. Integration with export pipeline

### Sprint 4: Gate Improvements (1 week)
1. `GateProvider.tsx` - React context
2. `useLiveValidationStore.ts` - Real-time validation
3. `CollisionHighlight.tsx` - Visual feedback
4. Integration with drag/snap system

### Sprint 5: Integration & Polish (1 week)
1. Connect all systems
2. UI polish
3. Performance optimization
4. Documentation

---

## Verification Checklist

### OperationGraph
- [ ] Generate operations for side panel with System 32
- [ ] Generate hinge boring for door panels
- [ ] Generate back panel groove
- [ ] Calculate tool requirements
- [ ] Estimate machining time

### Drill Map
- [ ] Display drill points in 3D
- [ ] Color code by purpose
- [ ] Filter by drill type
- [ ] Show warnings for issues

### Nesting
- [ ] Place parts on sheets
- [ ] Respect grain direction
- [ ] Calculate yield/efficiency
- [ ] Handle unplaced parts

### Gate Provider
- [ ] Auto-run in FROZEN state
- [ ] Reactive updates
- [ ] Per-cabinet issues

### Live Validation
- [ ] Collision detection during drag
- [ ] Visual feedback
- [ ] Performance < 100ms
