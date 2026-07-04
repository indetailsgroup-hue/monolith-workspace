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
  dowelPoints?: DrillMapPoint[];
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
  toeKickHeight?: number;
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
  groupDowels: DrillMapPoint[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; backPanelMinY: number; backPanelMaxY: number };
  jointType: MountType;
  showTypes: { frontDistance: boolean; sideDistance: boolean; verticalDistance: boolean };
  distanceB: number;
  panelThickness: number;
  boltRotationsMap: Map<string, BoltRotation>;
}

function GroupedDimensionRenderer({
  groupBolts,
  groupCams,
  groupDowels,
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
    // PART B: Front Distance — CAD-style point-to-point dimensions
    // Shows individual spacing between ALL hardware points (bolts + dowels)
    // sorted by Z position. Pattern: 50, 32, 199, 32, 32, 199, 32, 50
    // --------------------------------------------------------------------------
    if (showTypes.frontDistance) {
      const firstCorner = groupBolts[0]?.cornerType ?? '';
      const isStandardCorner = firstCorner.startsWith('TOP_') || firstCorner.startsWith('BOTTOM_');
      const isBackCorner = firstCorner.startsWith('BACK_');

      // --------------------------------------------------------------------------
      // PART C: BACK panel connector dimensions (Y-axis)
      // Shows point-to-point spacing along HEIGHT for BACK_LEFT/BACK_RIGHT groups.
      // --------------------------------------------------------------------------
      if (isBackCorner) {
        // CAD Reference Pattern (Y-axis, top → bottom):
        // 50, 32, 377, 32, 32, 377, 32, 50
        // Same structure as Z-axis: edge → bolt → dowel → gap → dowel → bolt → edge
        const isLeftBack = firstCorner === 'BACK_LEFT';

        const cornerTypes = new Set(groupBolts.map(b => b.cornerType));
        const relevantDowels = groupDowels.filter(d =>
          cornerTypes.has(d.cornerType)
        );

        const allPoints = [...groupBolts, ...relevantDowels];
        if (allPoints.length === 0) return dims;

        // Sort by Y descending (top → bottom)
        const sortedByY = allPoints.sort((a, b) => b.position[1] - a.position[1]);

        // Deduplicate by Y (within 0.5mm)
        const uniqueByY: typeof sortedByY = [];
        for (const pt of sortedByY) {
          if (uniqueByY.length === 0 || Math.abs(pt.position[1] - uniqueByY[uniqueByY.length - 1].position[1]) > 0.5) {
            uniqueByY.push(pt);
          }
        }
        if (uniqueByY.length === 0) return dims;

        const refBolt = groupBolts.sort((a, b) => b.position[1] - a.position[1])[0];
        if (!refBolt) return dims;
        const refX = refBolt.position[0];
        const refZ = refBolt.position[2];

        // Offset direction: pull toward BACK (-Z) so dimensions are visible in Left view
        const pullSideVector = new THREE.Vector3(0, 0, -1);
        const offsetMag = CAD_THEME.baseHeight + CAD_THEME.layerStep;

        // Back panel Y extent: panels sit on toe kick, so use backPanel bounds
        const panelTopY = bounds.backPanelMaxY;
        const panelBottomY = bounds.backPanelMinY;



        // Top edge → first point
        const topEdgeDist = Math.abs(panelTopY - uniqueByY[0].position[1]);
        if (topEdgeDist > 0.5) {
          dims.push({
            start: new THREE.Vector3(refX, panelTopY, refZ),
            end: new THREE.Vector3(refX, uniqueByY[0].position[1], refZ),
            color: CAD_THEME.colorZ,  // Green - same as TOP/BOTTOM Z-axis
            offsetVector: pullSideVector.clone().multiplyScalar(offsetMag),
            label: Math.round(topEdgeDist).toString(),
            isDatumStart: true,
          });
        }

        // Point-to-point dimensions between consecutive Y levels
        for (let i = 1; i < uniqueByY.length; i++) {
          const prevY = uniqueByY[i - 1].position[1];
          const currY = uniqueByY[i].position[1];
          const dist = Math.abs(prevY - currY);
          if (dist > 0.5) {
            dims.push({
              start: new THREE.Vector3(refX, prevY, refZ),
              end: new THREE.Vector3(refX, currY, refZ),
              color: CAD_THEME.colorZ,
              offsetVector: pullSideVector.clone().multiplyScalar(offsetMag),
              label: Math.round(dist).toString(),
              isDatumStart: false,
            });
          }
        }

        // Last point → bottom edge
        const lastPtY = uniqueByY[uniqueByY.length - 1];
        const bottomDist = Math.abs(lastPtY.position[1] - panelBottomY);
        if (bottomDist > 0.5) {
          dims.push({
            start: new THREE.Vector3(refX, lastPtY.position[1], refZ),
            end: new THREE.Vector3(refX, panelBottomY, refZ),
            color: CAD_THEME.colorZ,
            offsetVector: pullSideVector.clone().multiplyScalar(offsetMag),
            label: Math.round(bottomDist).toString(),
            isDatumStart: false,
          });
        }

        return dims;
      }

      // Skip SHELF groups — their bolts are at different Y/Z levels
      if (!isStandardCorner) return dims;

      // Collect all hardware Z positions (bolts + side-panel dowels only)
      // Side-panel dowels share the same Y as bolts (drilled into side panel face)
      // Filter dowels that belong to this corner group by matching cornerType
      const cornerTypes = new Set(groupBolts.map(b => b.cornerType));
      const relevantDowels = groupDowels.filter(d =>
        cornerTypes.has(d.cornerType) && d.connectedPanelRole !== 'SHELF'
      );

      // Combine bolts + side-panel dowels, deduplicate by Z position (within 0.5mm tolerance)
      const allPoints = [...groupBolts, ...relevantDowels];
      if (allPoints.length === 0) return dims;

      // Sort by Z descending (front → back, since front = maxZ)
      const sortedByZ = allPoints.sort((a, b) => b.position[2] - a.position[2]);

      // Deduplicate points that are at the same Z (within 0.5mm)
      const uniqueByZ: typeof sortedByZ = [];
      for (const pt of sortedByZ) {
        if (uniqueByZ.length === 0 || Math.abs(pt.position[2] - uniqueByZ[uniqueByZ.length - 1].position[2]) > 0.5) {
          uniqueByZ.push(pt);
        }
      }

      // Reference Y and X from the frontmost bolt for consistent dimension line placement
      const refBolt = groupBolts.sort((a, b) => b.position[2] - a.position[2])[0];
      if (!refBolt) return dims;
      const refX = refBolt.position[0];
      const refY = refBolt.position[1];

      // Panel front edge = actual cabinet front boundary (from bounds)
      const panelFrontZ = bounds.maxZ;

      uniqueByZ.forEach((pt, index) => {
        const currentZ = pt.position[2];
        const currentPos = new THREE.Vector3(refX, refY, currentZ);
        let startPoint: THREE.Vector3;
        let labelValue: number;

        if (index === 0) {
          // First point: dimension from panel front edge
          startPoint = new THREE.Vector3(refX, refY, panelFrontZ);
          labelValue = Math.abs(panelFrontZ - currentZ);
        } else {
          // Subsequent points: dimension from previous point
          const prevZ = uniqueByZ[index - 1].position[2];
          startPoint = new THREE.Vector3(refX, refY, prevZ);
          labelValue = Math.abs(prevZ - currentZ);
        }

        if (labelValue > 0.5) {
          dims.push({
            start: startPoint,
            end: currentPos.clone(),
            color: CAD_THEME.colorZ,
            offsetVector: pullUpVector.clone().multiplyScalar(CAD_THEME.baseHeight + CAD_THEME.layerStep),
            label: Math.round(labelValue).toString(),
            isDatumStart: index === 0,
          });
        }
      });

      // Back edge dimension: from last (backmost) point to TOP/BOTTOM panel back edge.
      // System32 pattern is symmetric: firstHole distance from both front and back edges.
      // Compute panel back edge from bolt positions (not cabinet bounds which includes back panel).
      const frontBolt = groupBolts.reduce((a, b) => a.position[2] > b.position[2] ? a : b);
      const backBolt = groupBolts.reduce((a, b) => a.position[2] < b.position[2] ? a : b);
      const frontDist = panelFrontZ - frontBolt.position[2]; // firstHole distance from front
      const panelBackZ = backBolt.position[2] - frontDist;   // symmetric: same distance from back bolt to back edge
      const lastPt = uniqueByZ[uniqueByZ.length - 1];
      const backDistance = Math.abs(lastPt.position[2] - panelBackZ);
      if (backDistance > 0.5) {
        dims.push({
          start: new THREE.Vector3(refX, refY, lastPt.position[2]),
          end: new THREE.Vector3(refX, refY, panelBackZ),
          color: CAD_THEME.colorZ,
          offsetVector: pullUpVector.clone().multiplyScalar(CAD_THEME.baseHeight + CAD_THEME.layerStep),
          label: Math.round(backDistance).toString(),
          isDatumStart: false,
        });
      }

    }

    return dims;
  }, [groupBolts, groupCams, groupDowels, bounds, jointType, showTypes, pullUpVector, distanceB, panelThickness, boltRotationsMap]);

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
  const { boltPoints, camPoints = [], dowelPoints = [], cabinetWidth, cabinetHeight, cabinetDepth, visible, boltRotations = [], toeKickHeight = 0 } = props;

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
    // Back panel Y extent (accounts for toe kick offset)
    // cabinetHeight = panel height, panels sit on top of toe kick
    backPanelMinY: toeKickHeight,
    backPanelMaxY: toeKickHeight + cabinetHeight,
  }), [cabinetWidth, cabinetHeight, cabinetDepth, toeKickHeight]);

  const normalizedShowTypes = useMemo(() => {
    const baseTypes = { frontDistance: props.showTypes?.frontDistance ?? true, sideDistance: props.showTypes?.sideDistance ?? true, verticalDistance: props.showTypes?.verticalDistance ?? true };
    if (props.currentView === 'Front') return { ...baseTypes, frontDistance: false };
    if (props.currentView === 'Left') return { ...baseTypes, sideDistance: false };
    return baseTypes;
  }, [props.showTypes, props.currentView]);

  // Group bolts, cams, and dowels by corner type
  const hardwareGroups = useMemo(() => {
    const groups: Record<string, { bolts: DrillMapPoint[]; cams: DrillMapPoint[]; dowels: DrillMapPoint[]; jointType: MountType }> = {};
    boltPoints.forEach((bolt) => {
      const isTopCorner = bolt.cornerType === 'TOP_LEFT' || bolt.cornerType === 'TOP_RIGHT';
      const jointType = isTopCorner ? props.topJoint : props.bottomJoint;
      const key = `${bolt.cornerType}_${jointType}`;
      if (!groups[key]) groups[key] = { bolts: [], cams: [], dowels: [], jointType };
      groups[key].bolts.push(bolt);
    });
    camPoints.forEach((cam) => {
      const isTopCorner = cam.cornerType === 'TOP_LEFT' || cam.cornerType === 'TOP_RIGHT';
      const jointType = isTopCorner ? props.topJoint : props.bottomJoint;
      const key = `${cam.cornerType}_${jointType}`;
      if (groups[key]) groups[key].cams.push(cam);
    });
    dowelPoints.forEach((dowel) => {
      const isTopCorner = dowel.cornerType === 'TOP_LEFT' || dowel.cornerType === 'TOP_RIGHT';
      const jointType = isTopCorner ? props.topJoint : props.bottomJoint;
      const key = `${dowel.cornerType}_${jointType}`;
      if (groups[key]) groups[key].dowels.push(dowel);
    });
    return groups;
  }, [boltPoints, camPoints, dowelPoints, props.topJoint, props.bottomJoint]);

  if (!visible || boltPoints.length === 0) return null;

  return (
    <group name="hardware-technical-dimensions">
      {Object.entries(hardwareGroups).map(([key, group]) => (
        <GroupedDimensionRenderer
          key={key}
          groupBolts={group.bolts}
          groupCams={group.cams}
          groupDowels={group.dowels}
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
