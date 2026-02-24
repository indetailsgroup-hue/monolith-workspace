/**
 * HardwareSmartDimensions - Datum Chain System (J12 Reference)
 * Fixes Applied:
 * 1. Smart Offset: Checks Top/Bottom corner to push dimension OUTSIDE cabinet
 * 2. Correct Direction: Starts from Edge -> Ends at Cam Center
 * 3. Sync: Real-time update support
 */

import { useMemo } from 'react';
import { Text, Line, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { DrillMapPoint } from '../../core/manufacturing/drillMap/types';
import {
  getDrillingAxis,
  type MountType,
  type Corner,
} from '../../core/manufacturing/hardware/boltOrientationUtils';

// ============================================
// CONFIGURATION: TECHNICAL DRAWING STYLE
// ============================================

const CAD_THEME = {
  colorX: '#00ffff',     // Cyan - Side drilling distance
  colorZ: '#00ff00',     // Green - Depth (System 32)
  colorB: '#ffaa00',     // Orange - Distance B
  textColor: '#ffffff',
  textBgColor: '#000000',
  fontSize: 12,
  lineWidth: 1,
  extensionGap: 0,       // 0 = attached to object (Drawing style)
  extensionOvershoot: 5, // Extension line overshoots dimension line
  baseHeight: 45,        // Base height of dimension line from workpiece
  layerStep: 20,         // Spacing between X and Z dimension layers
  arrowSize: 0.8,        // Arrow head radius
  arrowLength: 3,        // Arrow head length
} as const;

// ============================================
// TYPES
// ============================================

export interface BoltRotation {
  boltId: string;
  rotX: number;  // Radians
  rotY: number;  // Radians
  rotZ: number;  // Radians
}

export interface HardwareSmartDimensionsProps {
  boltPoints: DrillMapPoint[];
  camPoints?: DrillMapPoint[];
  cabinetWidth: number;
  cabinetHeight: number;
  cabinetDepth: number;
  topJoint: MountType;
  bottomJoint: MountType;
  visible: boolean;
  distanceB?: number;
  panelThickness?: number;
  showTypes?: {
    frontDistance?: boolean;
    sideDistance?: boolean;
    verticalDistance?: boolean;
  };
  currentView?: 'Perspective' | 'Front' | 'Left' | 'Top' | 'Install' | 'Factory' | 'CNC';
  boltRotations?: BoltRotation[];
}

interface DimensionData {
  start: THREE.Vector3;
  end: THREE.Vector3;
  offsetVector: THREE.Vector3;
  color: string;
  label: string;
  isDatumStart: boolean;
  dashed?: boolean;
}

// ============================================
// ARROW HEAD COMPONENT
// ============================================

function ArrowHead({ position, target, color }: { position: THREE.Vector3; target: THREE.Vector3; color: string }) {
  const dir = useMemo(() => new THREE.Vector3().subVectors(target, position).normalize(), [position, target]);
  const placement = useMemo(() => position.clone().add(dir.clone().multiplyScalar(1.5)), [position, dir]);
  const quat = useMemo(() => {
    const arrowDir = dir.clone().negate();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), arrowDir);
  }, [dir]);

  return (
    <mesh position={placement} quaternion={quat}>
      <coneGeometry args={[CAD_THEME.arrowSize, CAD_THEME.arrowLength, 8]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

// ============================================
// TECHNICAL DIMENSION LINE COMPONENT
// ============================================

function TechnicalDimLine({ start, end, offsetVector, color, label, isDatumStart, dashed = false }: DimensionData) {
  const geometry = useMemo(() => {
    const p1 = start.clone();
    const p2 = end.clone();
    const dimP1 = p1.clone().add(offsetVector);
    const dimP2 = p2.clone().add(offsetVector);

    const extDir = offsetVector.clone().normalize();
    const extOvershoot = extDir.clone().multiplyScalar(CAD_THEME.extensionOvershoot);
    const ext1End = dimP1.clone().add(extOvershoot);
    const ext2End = dimP2.clone().add(extOvershoot);

    // Datum line starts slightly inside wood or at edge
    const datumStart = p1.clone().sub(extDir.clone().multiplyScalar(5));

    const midPoint = new THREE.Vector3().lerpVectors(dimP1, dimP2, 0.5);
    const labelPos = midPoint.clone().add(extDir.clone().multiplyScalar(3));

    return { p1, p2, dimP1, dimP2, ext1End, ext2End, datumStart, labelPos };
  }, [start, end, offsetVector]);

  return (
    <group>
      {/* Extension Lines */}
      <Line points={[isDatumStart ? geometry.datumStart : geometry.p1, geometry.ext1End]} color={color} opacity={0.5} transparent lineWidth={0.5} />
      <Line points={[geometry.p2, geometry.ext2End]} color={color} opacity={0.5} transparent lineWidth={0.5} />

      {/* Main Line */}
      <Line points={[geometry.dimP1, geometry.dimP2]} color={color} lineWidth={CAD_THEME.lineWidth} dashed={dashed} dashSize={dashed ? 3 : undefined} gapSize={dashed ? 2 : undefined} />

      {/* Arrows */}
      <ArrowHead position={geometry.dimP1} target={geometry.dimP2} color={color} />
      <ArrowHead position={geometry.dimP2} target={geometry.dimP1} color={color} />

      {/* Label */}
      <Billboard position={geometry.labelPos}>
        <Text fontSize={CAD_THEME.fontSize} color={CAD_THEME.textColor} anchorX="center" anchorY="bottom" outlineWidth={0.5} outlineColor={CAD_THEME.textBgColor}>
          {label}
        </Text>
      </Billboard>
    </group>
  );
}

// ============================================
// GROUPED DIMENSION RENDERER
// ============================================

interface GroupedDimensionRendererProps {
  groupBolts: DrillMapPoint[];
  groupCams: DrillMapPoint[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  jointType: MountType;
  showTypes: { frontDistance: boolean; sideDistance: boolean; verticalDistance: boolean };
  distanceB: number;
  panelThickness: number;
  boltRotationsMap: Map<string, BoltRotation>;
}

function GroupedDimensionRenderer({
  groupBolts,
  groupCams,
  bounds,
  jointType,
  showTypes,
  distanceB,
  panelThickness,
  boltRotationsMap,
}: GroupedDimensionRendererProps) {
  const pullUpVector = new THREE.Vector3(0, 1, 0);

  const dimensions = useMemo(() => {
    const dims: DimensionData[] = [];

    // --------------------------------------------------------------------------
    // PART A: Distance B (Edge -> Cam Center)
    // --------------------------------------------------------------------------
    if (showTypes.sideDistance && jointType === 'INSET') {
      const firstCam = groupCams[0];
      const firstBolt = groupBolts[0];
      const refPoint = firstCam || firstBolt;

      if (refPoint && firstBolt) {
        // 1. Bolt Position at Edge/Face
        const pos = new THREE.Vector3(refPoint.position[0], refPoint.position[1], refPoint.position[2]);
        const boltRotation = boltRotationsMap.get(firstBolt.id);
        const localDrillDir = new THREE.Vector3(0, -1, 0);

        let worldDrillDir: THREE.Vector3;
        let worldOffsetDir: THREE.Vector3;

        if (boltRotation) {
          const euler = new THREE.Euler(boltRotation.rotX, boltRotation.rotY, boltRotation.rotZ);
          const quat = new THREE.Quaternion().setFromEuler(euler);
          worldDrillDir = localDrillDir.clone().applyQuaternion(quat).normalize();

          // FIX: Smart Offset (Check Top vs Bottom)
          let smartOffsetDir = new THREE.Vector3(0, 1, 0);
          if (Math.abs(worldDrillDir.y) > 0.8) {
            smartOffsetDir.set(-1, 0, 0); // Vertical -> Left
          } else {
             // Horizontal -> Check if TOP or BOTTOM corner
             const isTop = firstBolt.cornerType?.startsWith('TOP');
             smartOffsetDir.set(0, isTop ? 1 : -1, 0); // Top->Up, Bottom->Down
          }
          smartOffsetDir.sub(worldDrillDir.clone().multiplyScalar(smartOffsetDir.dot(worldDrillDir))).normalize();
          worldOffsetDir = smartOffsetDir;
        } else {
          // Fallback
          const cornerType = firstBolt.cornerType as Corner;
          worldDrillDir = getDrillingAxis(cornerType, jointType);
          const refAxis = new THREE.Vector3(0, 0, 1);
          worldOffsetDir = new THREE.Vector3().crossVectors(worldDrillDir, refAxis).normalize();
        }

        // 2. Calculate Start (Edge) and End (Cam Center)
        const edgePos = pos.clone();
        // Move INWARDS to find Cam center (assuming DrillDir points into material)
        // If the arrow points wrong, swap .add/.sub here.
        // Standard: Bolt dir is usually INTO the side panel edge.
        // We want Edge -> Cam (inside shelf). Shelf is perpendicular.
        // Let's assume standard vector math:
        const camCenterPos = edgePos.clone().add(worldDrillDir.clone().multiplyScalar(distanceB));

        // FIX: Increase Offset for Visibility
        const DIM_OFFSET = 45;
        const offsetVector = worldOffsetDir.clone().multiplyScalar(DIM_OFFSET);

        dims.push({
          start: edgePos,
          end: camCenterPos,
          color: CAD_THEME.colorB,
          offsetVector: offsetVector,
          label: `B ${distanceB}`,
          isDatumStart: true,
          dashed: true,
        });
      }
    }

    // --------------------------------------------------------------------------
    // PART B: Front Distance (System 32)
    // --------------------------------------------------------------------------
    if (showTypes.frontDistance) {
      const sortedByZ = [...groupBolts].sort((a, b) => b.position[2] - a.position[2]);
      const frontMostBolt = sortedByZ[0];
      const panelFrontZ = frontMostBolt.position[2] + 37;

      sortedByZ.forEach((bolt, index) => {
        const currentPos = new THREE.Vector3(bolt.position[0], bolt.position[1], bolt.position[2]);
        let startPoint: THREE.Vector3;
        let labelValue: number;

        if (index === 0) {
          startPoint = new THREE.Vector3(currentPos.x, currentPos.y, panelFrontZ);
          labelValue = Math.abs(panelFrontZ - currentPos.z);
        } else {
          const prevPos = sortedByZ[index - 1].position;
          startPoint = new THREE.Vector3(currentPos.x, currentPos.y, prevPos[2]);
          labelValue = Math.abs(prevPos[2] - currentPos.z);
        }

        if (labelValue > 1) {
          dims.push({
            start: startPoint,
            end: currentPos.clone(),
            color: CAD_THEME.colorZ,
            offsetVector: pullUpVector.clone().multiplyScalar(CAD_THEME.baseHeight + CAD_THEME.layerStep),
            label: labelValue.toFixed(1),
            isDatumStart: index === 0,
          });
        }
      });
    }

    return dims;
  }, [groupBolts, groupCams, bounds, jointType, showTypes, pullUpVector, distanceB, panelThickness, boltRotationsMap]);

  return (
    <group>
      {dimensions.map((dim, idx) => (
        <TechnicalDimLine key={idx} {...dim} />
      ))}
    </group>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function HardwareSmartDimensions(props: HardwareSmartDimensionsProps) {
  const { boltPoints, camPoints = [], cabinetWidth, cabinetHeight, cabinetDepth, visible, boltRotations = [] } = props;

  // Create Map for fast lookup
  const boltRotationsMap = useMemo(() => {
    const map = new Map<string, BoltRotation>();
    boltRotations.forEach((rot) => map.set(rot.boltId, rot));
    return map;
  }, [boltRotations]);

  const bounds = useMemo(() => ({
    minX: -cabinetWidth / 2, maxX: cabinetWidth / 2,
    minY: 0, maxY: cabinetHeight,
    minZ: -cabinetDepth / 2, maxZ: cabinetDepth / 2,
  }), [cabinetWidth, cabinetHeight, cabinetDepth]);

  const normalizedShowTypes = useMemo(() => {
    const baseTypes = { frontDistance: props.showTypes?.frontDistance ?? true, sideDistance: props.showTypes?.sideDistance ?? true, verticalDistance: props.showTypes?.verticalDistance ?? true };
    if (props.currentView === 'Front') return { ...baseTypes, frontDistance: false };
    if (props.currentView === 'Left') return { ...baseTypes, sideDistance: false };
    return baseTypes;
  }, [props.showTypes, props.currentView]);

  const boltGroups = useMemo(() => {
    const groups: Record<string, { bolts: DrillMapPoint[]; cams: DrillMapPoint[]; jointType: MountType }> = {};
    boltPoints.forEach((bolt) => {
      const isTopCorner = bolt.cornerType === 'TOP_LEFT' || bolt.cornerType === 'TOP_RIGHT';
      const jointType = isTopCorner ? props.topJoint : props.bottomJoint;
      const key = `${bolt.cornerType}_${jointType}`;
      if (!groups[key]) groups[key] = { bolts: [], cams: [], jointType };
      groups[key].bolts.push(bolt);
    });
    camPoints.forEach((cam) => {
      const isTopCorner = cam.cornerType === 'TOP_LEFT' || cam.cornerType === 'TOP_RIGHT';
      const jointType = isTopCorner ? props.topJoint : props.bottomJoint;
      const key = `${cam.cornerType}_${jointType}`;
      if (groups[key]) groups[key].cams.push(cam);
    });
    return groups;
  }, [boltPoints, camPoints, props.topJoint, props.bottomJoint]);

  if (!visible || boltPoints.length === 0) return null;

  return (
    <group name="hardware-technical-dimensions">
      {Object.entries(boltGroups).map(([key, group]) => (
        <GroupedDimensionRenderer
          key={key}
          groupBolts={group.bolts}
          groupCams={group.cams}
          bounds={bounds}
          jointType={group.jointType}
          showTypes={normalizedShowTypes}
          distanceB={props.distanceB ?? 24}
          panelThickness={props.panelThickness ?? 18}
          boltRotationsMap={boltRotationsMap}
        />
      ))}
    </group>
  );
}

export default HardwareSmartDimensions;
