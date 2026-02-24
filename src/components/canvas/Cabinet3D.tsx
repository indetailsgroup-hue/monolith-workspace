/**
 * Cabinet3D - Renders parametric cabinet in 3D (Visual Layer)
 * 
 * ARCHITECTURE NOTE (North Star):
 * - This is the MAGIC/VISUAL layer - for display only
 * - CAM Truth comes from OperationGraph, NEVER from this visual mesh
 * - All dimensions in millimeters (mm)
 */

import { useRef, useMemo, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import * as THREE from 'three';
import { Mesh, CanvasTexture, SRGBColorSpace, BoxGeometry, RepeatWrapping, Group, EdgesGeometry, LineSegments, Texture } from 'three';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
// NO ALIAS IMPORTS - Use relative paths only (North Star Rule #3)
import { useCabinetStore, useCabinet, useActiveCabinetFromArray, useCabinetById } from '../../core/store/useCabinetStore';
import { useViewStore } from '../../core/store/useViewStore';
import { useToolStore } from '../../core/store/useToolStore';
import { useGlueStore } from '../../core/store/useGlueStore';
import { useSelectionStore } from '../../core/store/useSelectionStore';
import { CabinetPanel, DEFAULT_POSITION_OVERRIDES } from '../../core/types/Cabinet';
import { SpringAnimatedNumber } from '../ui/AnimatedNumber';
import { CabinetTransformControls } from './CabinetTransformControls';
import { FloorDragControls } from './FloorDragControls';
import { GizmoTranslate } from './GizmoTranslate';
import { GlueFaceHighlights } from './GlueFaceHighlights';
import { SnapPreview } from './SnapPreview';
import { useProjectStore } from '../../core/store/useProjectStore';
import { useSnapStore } from '../../core/store/useSnapStore';
import { SceneObjectRef } from './scene';
import type { Vec3 } from '../../core/types/SnapTypes';
import { calculateSnap, type SnapTarget } from '../../core/utils/snapSystem';
import { DrillMapOverlay } from './DrillMapOverlay';
import { CSGDrillOverlay } from './CSGDrillOverlay';
import { DrillGuideLayer } from './DrillGuideLayer';
import { CADDrillIndicators } from './CADDrillIndicators';
import { useDrillMapStore, getCornerType } from '../../core/store/useDrillMapStore';
import type { DrillMap, DrillMapPoint, CornerType, RotationOverride, DrillPurpose } from '../../core/manufacturing/drillMap/types';
import { computeBoundsFromDrillMap } from '../../core/manufacturing/drillMap/cabinetBounds';
import { generateMinifixDrillMap } from '../../core/manufacturing/drillMap/generateDrillMap';
import { Preview3D, DEFAULT_MINIFIX_CONFIG, type MinifixFullConfig } from '../ui/MinifixConfigPanel';

import { Dowel3D, quatFromYTo } from './Hardware3D';
import { HardwareContextMenu } from '../ui/HardwareContextMenu';
import { RAY_LAYERS, setObjectLayer } from './raycastLayers';
import { useXrayRaycastPolicy } from './useXrayRaycastPolicy';
import { degToRad, type JointMode } from '../../core/manufacturing/hardware/boltOrientationPolicy';
import {
  computeBoltQuatWithTwist,
  selectBoltPanelNormalWorld,
  getDrillingAxis,
  formatVec,
  assertOrientation,
  type MountType,
  type Corner,
} from '../../core/manufacturing/hardware/boltOrientationUtils';
import { HardwareSmartDimensions } from './HardwareSmartDimensions';
import { useMaterialStore } from '../../core/materials/useMaterialStore';
import { useObjectUrlTexture } from '../../core/materials/useObjectUrlTexture';

// ============================================
// MINIFIX CONFIG MIGRATION - Normalize legacy stored configs
// ============================================

/**
 * Normalize a stored Minifix config to apply v4.1 defaults:
 * - Returns DEFAULT_MINIFIX_CONFIG when no config exists (legacy project migration)
 * - includeDowel: true  (was false in pre-v4.1 defaults)
 * - dowelOffset: 32     (was incorrectly 6mm in pre-v4.1 MinifixConfigPanel)
 * This ensures existing cabinets created before the fix get correct dowel behavior.
 */
function normalizeMinifixConfig(config: any): MinifixFullConfig {
  if (!config) return { ...DEFAULT_MINIFIX_CONFIG, includeDowel: true, dowelOffset: 32 };
  return {
    ...config,
    // Dowels: default to enabled (was false in pre-v4.1 configs)
    includeDowel: true, // Always true — v4.1 migration
    // Dowel offset: System 32 pitch (was incorrectly 6mm in some stored configs)
    dowelOffset: (config.dowelOffset === 6 || !config.dowelOffset) ? 32 : config.dowelOffset,
  };
}

// ============================================
// SCENE RAYCAST POLICY - Configures raycaster for X-Ray mode
// ============================================

/**
 * Component to configure raycaster layer filtering based on X-Ray mode.
 * Must be placed inside the Canvas.
 */
export function SceneRaycastPolicy() {
  const xRayMode = useViewStore((s) => s.xRayMode);
  useXrayRaycastPolicy(xRayMode);
  return null; // No visual output
}

// ============================================
// HARDWARE HIT SPHERE - Clickable sphere for hardware interaction
// ============================================

interface HardwareHitSphereProps {
  position: [number, number, number];
  onRightClick: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<PointerEvent>) => void;
}

/**
 * Invisible hit sphere for hardware interaction.
 * Uses HARDWARE layer for raycast priority in X-Ray mode.
 */
function HardwareHitSphere({ position, onRightClick, onClick }: HardwareHitSphereProps) {
  const meshRef = useRef<THREE.Mesh>(null!);

  // Set HARDWARE layer on mount
  useEffect(() => {
    if (meshRef.current) {
      setObjectLayer(meshRef.current, RAY_LAYERS.HARDWARE);
    }
  }, []);

  return (
    <mesh
      ref={meshRef}
      position={position}
      onPointerDown={(e) => {
        if (e.button === 2) {
          // Right-click: Stop propagation (but not preventDefault - passive listener)
          e.stopPropagation();
          // stopImmediatePropagation works on passive listeners
          e.nativeEvent.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          onRightClick(e);
        } else if (e.button === 0 && onClick) {
          e.stopPropagation();
          onClick(e);
        }
      }}
      onContextMenu={(e) => {
        // Stop Three.js event propagation
        e.stopPropagation();
        // CRITICAL: Stop native DOM event from reaching RadialMenu's window listener
        // Only preventDefault if event is cancelable (not passive)
        if (e.nativeEvent.cancelable) {
          e.nativeEvent.preventDefault();
        }
        e.nativeEvent.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        onRightClick(e as unknown as ThreeEvent<PointerEvent>);
      }}
    >
      {/* Radius 70mm to ensure coverage of scaled hardware (cam + bolt) after rotation */}
      <sphereGeometry args={[70, 16, 16]} />
      {/* Invisible in production - set opacity > 0 for debugging */}
      <meshBasicMaterial
        transparent
        opacity={0}
        depthWrite={false}
        side={2}
      />
    </mesh>
  );
}

// ============================================
// HARDWARE 3D OVERLAY - Renders Minifix hardware at drill points
// Uses the SAME Preview3D component as Sidebar and Modal
// ============================================

interface Hardware3DOverlayProps {
  drillMap: DrillMap | null;
  visible: boolean;
  opacity?: number;
  minifixConfig?: MinifixFullConfig | null;
  cabinetWidth?: number;   // For accurate left/right side determination
  cabinetHeight?: number;  // For accurate top/bottom panel determination
  cabinetDepth?: number;   // For dimension lines (Z-axis)
  topJoint?: 'INSET' | 'OVERLAY';     // Joint style for top panel
  bottomJoint?: 'INSET' | 'OVERLAY';  // Joint style for bottom panel
  showDimensions?: boolean;  // Show CAD-style dimension lines
  currentView?: 'Perspective' | 'Front' | 'Left' | 'Top' | 'Install' | 'Factory' | 'CNC';  // Controls which dimensions to show
}

/**
 * Renders Preview3D component (same as Sidebar/Modal) at each CAM_LOCK drill point.
 * This ensures visual consistency across all 3 views.
 *
 * NOTE: Preview3D uses scale=0.01 internally (1mm = 0.01 units).
 * Cabinet3D uses mm units directly, so we wrap with scale=[100,100,100].
 *
 * ROTATION OVERRIDE SYSTEM:
 * - Right-click on hardware to open context menu
 * - User can flip, rotate, and save defaults
 * - Priority: pointOverride > cornerDefault > calculated
 */
/**
 * Wrapper component to handle conditional rendering without violating hook rules.
 * Splitting this fixes the "Rendered fewer hooks" error caused by early return
 * before useMemo calls.
 */
function Hardware3DOverlay(props: Hardware3DOverlayProps) {
  if (!props.visible || !props.drillMap) return null;
  return <Hardware3DOverlayInner {...props} drillMap={props.drillMap} />;
}

function Hardware3DOverlayInner({ drillMap, visible, minifixConfig, cabinetWidth = 600, cabinetHeight = 720, cabinetDepth = 560, topJoint = 'INSET', bottomJoint = 'INSET', showDimensions = false, currentView = 'Perspective' }: Hardware3DOverlayProps & { drillMap: DrillMap }) {
  // No-op handler since we don't need editing in cabinet view
  const handleUpdateConfig = useCallback(() => {}, []);

  // Store hooks for rotation/position overrides and context menu
  const rotationDefaults = useDrillMapStore((s) => s.rotationDefaults);
  const openContextMenu = useDrillMapStore((s) => s.openHardwareContextMenu);
  const getRotationForPoint = useDrillMapStore((s) => s.getRotationForPoint);
  const getPositionForPoint = useDrillMapStore((s) => s.getPositionForPoint);
  const flipXStateByPointId = useDrillMapStore((s) => s.flipXStateByPointId);

  // Early return removed - wrapper handles visibility check

  // Find all BOLT, CAM_LOCK, and DOWEL points from drill map
  // v4.1: Drill map generation (selectConnectorPositions) now limits positions
  // per HÃ¤fele CAD spec, so no hardcoded position filter needed here.
  const boltPoints: DrillMapPoint[] = [];
  const camPoints: DrillMapPoint[] = [];
  const dowelPoints: DrillMapPoint[] = [];
  drillMap.panels.forEach(panel => {
    panel.points.forEach(point => {
      if (point.purpose === 'BOLT') {
        boltPoints.push(point);
      } else if (point.purpose === 'CAM_LOCK' || point.purpose === 'MINIFIX') {
        camPoints.push(point);
      } else if (point.purpose === 'DOWEL') {
        dowelPoints.push(point);
      }
    });
  });

  // Use provided config or defaults
  const config = minifixConfig || DEFAULT_MINIFIX_CONFIG;

  /**
   * Convert quaternion to Euler angles for compatibility with existing override system
   * (Moved here so it can be used in boltRotations useMemo below)
   */
  const quaternionToRotationOverride = (quat: THREE.Quaternion): RotationOverride => {
    const euler = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
    return {
      rotX: euler.x,
      rotY: euler.y,
      rotZ: euler.z,
    };
  };

  // Calculate bolt rotations for HardwareSmartDimensions (same logic as render loop)
  const boltRotations = useMemo(() => {
    return boltPoints.map((boltPoint) => {
      const [x, y] = boltPoint.position;
      const cornerType: CornerType = boltPoint.cornerType || getCornerType([x, y, 0], cabinetWidth, cabinetHeight);
      const isTopPanel = cornerType === 'TOP_LEFT' || cornerType === 'TOP_RIGHT';

      const jointMode: JointMode = isTopPanel ? topJoint : bottomJoint;
      const mountType: MountType = jointMode;
      const boltDirWorld = getDrillingAxis(cornerType as Corner, mountType);
      const boltPanelNormalWorld = selectBoltPanelNormalWorld(cornerType as Corner);

      const orientationResult = computeBoltQuatWithTwist({
        boltDirWorld,
        boltPanelNormalWorld,
        mountType,
      });

      let finalQuat = orientationResult.boltQuat.clone();
      if ((cornerType === 'TOP_LEFT' || cornerType === 'TOP_RIGHT') && mountType === 'INSET') {
        const flipQuat = new THREE.Quaternion().setFromAxisAngle(boltDirWorld, Math.PI);
        finalQuat = flipQuat.multiply(finalQuat);
      }
      // Vertical Flip = swap CAM clockface side (render-only orientation toggle).
      if (flipXStateByPointId[boltPoint.id]) {
        const faceSwapQuat = new THREE.Quaternion().setFromAxisAngle(boltDirWorld, Math.PI);
        finalQuat = faceSwapQuat.multiply(finalQuat);
      }

      const calculatedRotation = quaternionToRotationOverride(finalQuat);
      const finalRotation = getRotationForPoint(boltPoint.id, cornerType, calculatedRotation);

      return {
        boltId: boltPoint.id,
        rotX: finalRotation.rotX,
        rotY: finalRotation.rotY,
        rotZ: finalRotation.rotZ,
      };
    });
  }, [boltPoints, cabinetWidth, cabinetHeight, topJoint, bottomJoint, getRotationForPoint, flipXStateByPointId]);

  // IMPORTANT: Drill map uses CENTER-BASED coordinates
  // x < 0 is LEFT, x > 0 is RIGHT
  // y < 0 is BOTTOM, y > 0 is TOP
  // centerX/centerY kept for reference but not used for comparison
  const _centerX = cabinetWidth / 2;  // Unused
  const _centerY = cabinetHeight / 2; // Unused

  /**
   * Handle right-click on hardware to open context menu
   */
  const handleContextMenu = (
    event: ThreeEvent<PointerEvent>,
    point: DrillMapPoint,
    cornerType: CornerType,
    currentRotation: RotationOverride,
    currentPosition: { dx: number; dy: number; dz: number }
  ) => {
    event.stopPropagation();
    // Get native event for screen coordinates
    const nativeEvent = event.nativeEvent;
    openContextMenu(
      { x: nativeEvent.clientX, y: nativeEvent.clientY },
      point.id,
      cornerType,
      currentRotation,
      currentPosition,
      point.position  // Pass base world position for dynamic clamp ranges
    );
  };

  return (
    <group name="hardware-3d-overlay-preview3d">
      {boltPoints.map((boltPoint, index) => {
        const [x, y, z] = boltPoint.position;

        // Use stored cornerType from drill map generation (most reliable)
        // Falls back to position-based calculation only if cornerType not stored
        const cornerType: CornerType = boltPoint.cornerType || getCornerType([x, y, z], cabinetWidth, cabinetHeight);

        // Derive isLeftSide and isTopPanel from cornerType (avoids coordinate system issues)
        const isLeftSide = cornerType === 'TOP_LEFT' || cornerType === 'BOTTOM_LEFT';
        const isTopPanel = cornerType === 'TOP_LEFT' || cornerType === 'TOP_RIGHT';

        // âœ… UNIFIED BOLT ORIENTATION (v2.1)
        // Uses single source of truth: drilling axis + panel normal
        //
        // KEY INSIGHT:
        // - boltDir = drilling axis ONLY (NOT boltâ†’cam vector!)
        // - boltPanelNormal = SIDE panel normal (Â±X), NOT TOP/BOTTOM (Â±Y)
        // - seamDir = cross(boltPanelNormal, boltDir) â†’ joint edge direction
        //
        // DRILLING AXES (depends on joint type):
        // - INSET: X-axis drilling into FACE of side panel (Â±X)
        // - OVERLAY: Y-axis drilling into EDGE of side panel (Â±Y)

        // Determine mount type from joint mode
        const jointMode: JointMode = isTopPanel ? topJoint : bottomJoint;
        const mountType: MountType = jointMode;

        // âœ… FIX: Use getDrillingAxis with jointMode to get correct drilling direction
        // INSET: horizontal X-axis drilling into face
        // OVERLAY: vertical Y-axis drilling into edge
        const boltDirWorld = getDrillingAxis(cornerType as Corner, mountType);

        // Get panel normal from utility (uses consistent Â±X convention)
        const boltPanelNormalWorld = selectBoltPanelNormalWorld(cornerType as Corner);

        // âœ… SINGLE COMPUTATION: base alignment + twist in one call
        // This eliminates the old split between resolveSeamDrivenTwist + calculateBoltRotationWithTwist
        const orientationResult = computeBoltQuatWithTwist({
          boltDirWorld,
          boltPanelNormalWorld,
          mountType,
        });

        // Validate orientation (throws on error - disable in production)
        // assertOrientation(orientationResult, boltDirWorld);

        // âœ… VERTICAL FLIP FIX: TOP corners INSET need 180Â° rotation around drilling axis
        let finalQuat = orientationResult.boltQuat.clone();
        if ((cornerType === 'TOP_LEFT' || cornerType === 'TOP_RIGHT') && mountType === 'INSET') {
          const flipQuat = new THREE.Quaternion().setFromAxisAngle(boltDirWorld, Math.PI);
          finalQuat = flipQuat.multiply(finalQuat);
        }
        // Vertical Flip = swap CAM clockface side (render-only orientation toggle).
        if (flipXStateByPointId[boltPoint.id]) {
          const faceSwapQuat = new THREE.Quaternion().setFromAxisAngle(boltDirWorld, Math.PI);
          finalQuat = faceSwapQuat.multiply(finalQuat);
        }

        // Convert quaternion to Euler for existing override system
        const calculatedRotation = quaternionToRotationOverride(finalQuat);

        // Get final rotation (considers user overrides and defaults)
        const finalRotation = getRotationForPoint(boltPoint.id, cornerType, calculatedRotation);
        const rotX = finalRotation.rotX;
        const rotY = finalRotation.rotY;
        const rotZ = finalRotation.rotZ;

        const currentRotation: RotationOverride = { rotX, rotY, rotZ };

        // Get position override (considers point override > corner default > zero)
        const positionOffset = getPositionForPoint(boltPoint.id, cornerType);
        const currentPosition = { dx: positionOffset.dx, dy: positionOffset.dy, dz: positionOffset.dz };

        // ============================================================
        // v5.5: CAM-ALIGNED via scene-graph LOCAL offset
        // ============================================================
        // Place Preview3D so its internal CAM aligns with the actual
        // CAM drill indicator position from the drill map.
        //
        // APPROACH: Instead of manually computing world-space quaternion
        // offsets (error-prone due to Eulerâ†”Quaternion mismatches), use
        // the scene graph:
        //   outerGroup (position=camTarget, rotation=rot)
        //     â””â”€ offsetGroup (position=[0, -camLocalDist, 0])  â† LOCAL shift
        //          â””â”€ scaleGroup (scale=100)
        //               â””â”€ Preview3D (cam at local Y = camLocalDist)
        //
        // The cam ends up at outerGroup origin = camTarget. âœ“
        // No manual quaternion math needed - R3F handles rotation.
        // ============================================================

        // Distance from Preview3D origin (sleeve center) to cam center
        // Must include all offsets that Preview3D applies internally
        const camLocalDist = (config.sleeveLength / 2)
          + config.neckShaftLength
          + (config.ballHeadDia / 2)
          + config.ballHeadOffset
          + config.camOffset;

        // Find matching CAM for this bolt.
        // Priority:
        // 1) direct pairedHoleId
        // 2) pairId
        // 3) nearest CAM in same corner (robust fallback)
        const matchingCamByPair =
          camPoints.find((cp) => cp.id === boltPoint.pairedHoleId)
          || camPoints.find((cp) => cp.pairId === boltPoint.pairId);

        const matchingCamByNearest = (() => {
          const sameCorner = camPoints.filter((cp) => cp.cornerType === boltPoint.cornerType);
          if (sameCorner.length === 0) return undefined;
          const [bx, by, bz] = boltPoint.position;
          let nearest = sameCorner[0];
          let bestDist2 = Number.POSITIVE_INFINITY;
          for (const cp of sameCorner) {
            const [cx, cy, cz] = cp.position;
            const dx = cx - bx;
            const dy = cy - by;
            const dz = cz - bz;
            const dist2 = dx * dx + dy * dy + dz * dz;
            if (dist2 < bestDist2) {
              bestDist2 = dist2;
              nearest = cp;
            }
          }
          return nearest;
        })();

        const matchingCam = matchingCamByPair || matchingCamByNearest;

        let groupX: number, groupY: number, groupZ: number;

        const isVerticalFlipped = !!flipXStateByPointId[boltPoint.id];

        // Always anchor hardware on bolt axis center when available.
        // This guarantees bolt/thread stays centered in Top/Bottom thickness.
        if (boltPoint.targetPocketCenter) {
          const [tx, ty, tz] = boltPoint.targetPocketCenter;
          groupX = tx + positionOffset.dx;
          groupY = ty + positionOffset.dy;
          groupZ = tz + positionOffset.dz;
        } else if (matchingCam) {
          // Legacy fallback without targetPocketCenter:
          // use panel-thickness center from CAM entry point.
          const [cx, cy, cz] = matchingCam.position;
          const [nx, ny, nz] = matchingCam.normal;
          const panelThickness = matchingCam.panelThickness || 18;
          const axisCenterOffset = panelThickness / 2;
          groupX = cx + nx * axisCenterOffset + positionOffset.dx;
          groupY = cy + ny * axisCenterOffset + positionOffset.dy;
          groupZ = cz + nz * axisCenterOffset + positionOffset.dz;
        } else {
          // Last resort: bolt surface position (no cam data available)
          groupX = x + positionOffset.dx;
          groupY = y + positionOffset.dy;
          groupZ = z + positionOffset.dz;
        }

        return (
          <group
            key={`minifix-preview-${index}-${boltPoint.id}`}
            position={[groupX, groupY, groupZ]}
            rotation={[rotX, rotY, rotZ]}
          >
            {/* Hit sphere for hardware interaction - uses HARDWARE layer for priority */}
            <HardwareHitSphere
              position={[0, 0, 0]}
              onRightClick={(e) => handleContextMenu(e, boltPoint, cornerType, currentRotation, currentPosition)}
            />

            {/* LOCAL offset: shift Preview3D so its internal cam is at the group origin */}
            {/* Preview3D cam is at local Y = camLocalDist from sleeve center (origin) */}
            {/* Shifting by -camLocalDist makes cam land at Y=0 (group origin = camTarget) */}
            <group position={[0, -camLocalDist, 0]}>
              {/* Scale: Preview3D uses 0.01 scale, Cabinet uses mm (Ã—100) */}
              <group scale={[100, 100, 100]}>
                <Preview3D
                  config={config}
                  showCam={true}
                  showDowel={false}  // Dowels rendered separately via drill map positions below
                  xRayMode={false}
                  isAttached={true}
                  showDimensions={false}
                  onUpdateConfig={handleUpdateConfig}
                />
              </group>
            </group>
          </group>
        );
      })}

      {/* DOWEL 3D Hardware - v4.1 per HÃ¤fele CAD spec */}
      {config.includeDowel && dowelPoints
        // Render only SIDE panel drill points to avoid double-rendering.
        // Each physical dowel has 2 drill points: side (FACE_BORE) + horiz (EDGE_BORE).
        // We render from the SIDE point and position to span the joint.
        .filter((dp) => dp.pairId?.endsWith('-dowel-side'))
        .map((dp) => {
        // Calculate rotation from drill normal â†’ Dowel3D Y-axis
        const rotation = quatFromYTo(dp.normal);

        // Dowel spans joint: 12mm into SIDE panel (along normal) + 18mm into HORIZ panel (opposite).
        // Drill point is at SIDE inner face, normal points INTO side panel.
        // Center offset = (sideFaceDepth - horizEdgeDepth) / 2 = (12 - 18) / 2 = -3mm along normal
        const SIDE_FACE_DEPTH = 12;   // mm - HÃ¤fele spec FACE_BORE
        const HORIZ_EDGE_DEPTH = 18;  // mm - HÃ¤fele spec EDGE_BORE
        const centerOffset = (SIDE_FACE_DEPTH - HORIZ_EDGE_DEPTH) / 2;
        const pos: [number, number, number] = [
          dp.position[0] + dp.normal[0] * centerOffset,
          dp.position[1] + dp.normal[1] * centerOffset,
          dp.position[2] + dp.normal[2] * centerOffset,
        ];

        return (
          <Dowel3D
            key={`dowel-hw-${dp.id}`}
            position={pos}
            rotation={rotation}
            diameter={config.dowelDia || 8}
            length={config.dowelLength || 30}
            xRayMode={false}
          />
        );
      })}

      {/* CAD-style dimension lines - shows different dims based on view */}
      <HardwareSmartDimensions
        boltPoints={boltPoints}
        camPoints={camPoints}
        cabinetWidth={cabinetWidth}
        cabinetHeight={cabinetHeight}
        cabinetDepth={cabinetDepth}
        topJoint={topJoint}
        bottomJoint={bottomJoint}
        visible={showDimensions}
        currentView={currentView}
        distanceB={config.drillingDistanceB}
        boltRotations={boltRotations}
      />
    </group>
  );
}

// ============================================
// T016: Shared Texture Loading with LRU Cache
// ============================================

/**
 * Hook to load material texture via materialId
 * Uses shared LRU cache and objectURL system
 */
function useMaterialTexture(materialId: string | null): Texture | null {
  const loadTexture = useMaterialStore((s) => s.loadTexture);

  // FIX: Subscribe to actual state values, not functions
  // This ensures component re-renders when texture finishes loading
  const loadedTexture = useMaterialStore((s) =>
    materialId ? s.loadedTextures[materialId] : null
  );

  const isLoaded = loadedTexture?.fullLoaded ?? false;
  const objectUrl = isLoaded ? (loadedTexture?.fullObjectUrl ?? null) : null;

  // Trigger load on mount or materialId change
  useEffect(() => {
    if (materialId) {
      loadTexture(materialId, 'full');
    }
  }, [materialId, loadTexture]);

  // Use shared texture loader
  return useObjectUrlTexture(objectUrl);
}

/**
 * @deprecated Use useMaterialTexture instead
 * Legacy hook for loading texture from data URL
 */
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

    // Create image and load data URL
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (cancelled) return;

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
      }
    };

    img.onerror = () => setTexture(null);

    img.src = dataUrl;

    // Cleanup function
    return () => {
      cancelled = true;
      if (currentTexture) {
        currentTexture.dispose();
      }
    };
  }, [dataUrl, invalidate]);

  return texture;
}

interface Cabinet3DProps {
  showDimensions?: boolean;
  hideTooltip?: boolean;
  onDoubleClickPanel?: () => void;
}

// Single cabinet renderer component
interface SingleCabinetProps {
  cabinet: ReturnType<typeof useCabinet>;
  cabinetId: string;
  isActive: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  showDimensions: boolean;
  hideTooltip: boolean;
  onDoubleClickPanel?: () => void;
  onSelect: () => void;
  /** X-Ray mode - render panels as wireframe */
  xRayMode?: boolean;
  /** Render mode from Indetails Smart patterns */
  renderMode?: 'NORMAL' | 'GHOST' | 'PREVIEW' | 'XRAY';
  /** Hide panels for CSG holes rendering (CSGDrillOverlay will render them instead) */
  hideForCSGHoles?: boolean;
}

function SingleCabinet({ cabinet, cabinetId, isActive, position, rotation, showDimensions, hideTooltip, onDoubleClickPanel, onSelect, xRayMode = false, renderMode = 'NORMAL', hideForCSGHoles = false }: SingleCabinetProps) {
  const groupRef = useRef<Group>(null);
  const hasInitializedPosition = useRef(false);
  const selectedPanelId = useCabinetStore((s) => s.selectedPanelId);
  const selectPanel = useCabinetStore((s) => s.selectPanel);
  const surfaceMaterials = useCabinetStore((s) => s.surfaceMaterials);
  const edgeMaterialsOnly = useCabinetStore((s) => s.edgeMaterials);
  const updateCabinetPosition = useCabinetStore((s) => s.updateCabinetPosition);
  const activeTool = useToolStore((s) => s.activeTool);
  const draggingCabinetId = useToolStore((s) => s.draggingCabinetId);
  const setDraggingCabinetId = useToolStore((s) => s.setDraggingCabinetId);
  const snapEnabled = useToolStore((s) => s.options.snap.enabled);
  const gridSize = useToolStore((s) => s.options.snap.gridSize);
  const showSnapPoints = useToolStore((s) => s.showSnapPoints);
  const glueMode = useGlueStore((s) => s.mode);
  const markDirty = useProjectStore((s) => s.markDirty);
  const allCabinets = useCabinetStore((s) => s.cabinets);
  const clearActiveSnap = useSnapStore((s) => s.clearActiveSnap);

  // State to trigger re-render when group ref is ready
  // This is needed because CabinetTransformControls checks targetRef.current
  const [isGroupReady, setIsGroupReady] = useState(false);

  // Check if glue mode is active - use both tool store AND glue store mode
  // activeTool === 'glue' AND glueMode !== 'idle' should both be true
  const isGlueMode = activeTool === 'glue' && glueMode !== 'idle';
  const isDrillGuideMode = activeTool === 'drillGuide';

  // For rendering GlueFaceHighlights, only check activeTool - let the component handle its own lifecycle
  // This allows the delayed unmount in GlueFaceHighlights to work properly
  const shouldShowGlueFaces = activeTool === 'glue';

  // Validate position helper
  const MAX_POSITION = 10000;
  const getValidPosition = (pos: [number, number, number]): [number, number, number] => [
    Math.abs(pos[0]) <= MAX_POSITION ? pos[0] : 0,
    Math.abs(pos[1]) <= MAX_POSITION ? pos[1] : 0,
    Math.abs(pos[2]) <= MAX_POSITION ? pos[2] : 0,
  ];

  // CRITICAL: Set initial position synchronously using useLayoutEffect
  // This runs BEFORE TransformControls can read the position
  // NOTE: Scene uses mm units throughout (camera, grid, panels)
  useLayoutEffect(() => {
    if (!groupRef.current) return;

    const validPosition = getValidPosition(position);
    groupRef.current.position.set(
      validPosition[0],
      validPosition[1],
      validPosition[2]
    );
    hasInitializedPosition.current = true;

    // Signal that the group ref is ready for TransformControls
    setIsGroupReady(true);
  }, []); // Only on mount

  // Update position when it changes from store
  // Only sync when position prop actually changes - NOT when tool changes
  // CRITICAL: Skip sync when this cabinet is being dragged (TransformControls manages position)
  useEffect(() => {
    if (!groupRef.current) return;

    // Skip initial mount (handled by the mount effect above)
    if (!hasInitializedPosition.current) return;

    // CRITICAL: Skip sync if this cabinet is being dragged
    // TransformControls manages the mesh position during drag
    // This prevents fighting between store sync and TransformControls
    if (draggingCabinetId === cabinetId) return;

    const validPosition = getValidPosition(position);

    // Only update if position actually changed from current Three.js position
    // This prevents unnecessary updates when switching tools
    // NOTE: Scene uses mm units, so no conversion needed
    const currentPos = groupRef.current.position;
    const dx = Math.abs(currentPos.x - validPosition[0]);
    const dz = Math.abs(currentPos.z - validPosition[2]);

    // Only sync if position changed by more than 1mm
    if (dx > 1 || dz > 1) {
      groupRef.current.position.set(
        validPosition[0],
        validPosition[1],
        validPosition[2]
      );
    }
  }, [position, cabinetId, draggingCabinetId]); // Include dragging state

  if (!cabinet || !cabinet.dimensions) return null;

  // Get default surface material (with fallback for cabinets without materials)
  const cabinetMaterials = cabinet.materials || { defaultSurface: 'melamine-white', defaultEdge: 'pvc-white-1mm' };
  const cabinetPanels = cabinet.panels || [];
  const defaultSurface = surfaceMaterials[cabinetMaterials.defaultSurface as keyof typeof surfaceMaterials];
  const baseColor = defaultSurface?.color || '#888888';
  // T016: Pass materialId for shared texture loading
  const surfaceMaterialId = cabinetMaterials.defaultSurface || null;

  // Edge materials: Combine surface materials + edge-specific materials
  const edgeMaterials = { ...surfaceMaterials, ...edgeMaterialsOnly };

  // Get default edge material - look in combined materials
  const defaultEdge = edgeMaterials[cabinetMaterials.defaultEdge as keyof typeof edgeMaterials];
  const edgeColor = defaultEdge?.color || '#FFFFFF';
  const edgeThickness = defaultEdge?.thickness || 1.0;
  // T016: Pass materialId for shared texture loading
  const edgeMaterialId = cabinetMaterials.defaultEdge || null;

  // Gizmo callbacks
  const handleGizmoDragStart = () => {
    setDraggingCabinetId(cabinetId);
  };

  const handleGizmoDrag = (pos: Vec3) => {
    // NOTE: Scene uses mm units, pos is already in mm
    let finalX = pos.x;
    let finalZ = pos.z;

    // Apply snap calculation if snap is enabled
    if (snapEnabled && cabinet) {
      // Build snap targets from all other cabinets
      const snapTargets: SnapTarget[] = allCabinets
        .filter(c => c.id !== cabinetId)
        .map(c => ({
          id: c.id,
          position: (c as any).scenePosition || [0, 0, 0],
          dimensions: c.dimensions,
          rotation: (c as any).sceneRotation?.[1] || 0,
        }));

      // Create moving cabinet target
      const movingTarget: SnapTarget = {
        id: cabinetId,
        position: [pos.x, 0, pos.z],
        dimensions: cabinet.dimensions,
        rotation: rotation[1],
      };

      // Calculate snap with vertex snap enabled when showSnapPoints is on
      const snapResult = calculateSnap(movingTarget, snapTargets, {
        gridSize,
        enableVertexSnap: showSnapPoints,  // Vertex snap when P is pressed
        enableEdgeSnap: true,
        enableCenterSnap: true,
        enableGridSnap: true,
        enableWallSnap: true,
      });

      // Apply snapped position
      finalX = snapResult.position[0];
      finalZ = snapResult.position[2];
    }

    const positionMm: [number, number, number] = [
      Math.round(finalX),
      0, // Keep Y at 0 for floor cabinets
      Math.round(finalZ),
    ];
    updateCabinetPosition(cabinetId, positionMm);

    // Also update mesh position directly for smooth visual (mm units)
    if (groupRef.current) {
      groupRef.current.position.set(finalX, 0, finalZ);
    }
  };

  const handleGizmoDragEnd = (finalPos: Vec3, delta: Vec3) => {
    setDraggingCabinetId(null);
    clearActiveSnap();  // Clear snap state

    // Apply final snap if enabled
    let finalX = finalPos.x;
    let finalZ = finalPos.z;

    if (snapEnabled && cabinet) {
      const snapTargets: SnapTarget[] = allCabinets
        .filter(c => c.id !== cabinetId)
        .map(c => ({
          id: c.id,
          position: (c as any).scenePosition || [0, 0, 0],
          dimensions: c.dimensions,
          rotation: (c as any).sceneRotation?.[1] || 0,
        }));

      const movingTarget: SnapTarget = {
        id: cabinetId,
        position: [finalPos.x, 0, finalPos.z],
        dimensions: cabinet.dimensions,
        rotation: rotation[1],
      };

      const snapResult = calculateSnap(movingTarget, snapTargets, {
        gridSize,
        enableVertexSnap: showSnapPoints,
        enableEdgeSnap: true,
        enableCenterSnap: true,
        enableGridSnap: true,
        enableWallSnap: true,
      });

      finalX = snapResult.position[0];
      finalZ = snapResult.position[2];
    }

    const positionMm: [number, number, number] = [
      Math.round(finalX),
      0,
      Math.round(finalZ),
    ];
    updateCabinetPosition(cabinetId, positionMm);
    markDirty();

  };

  return (
    <>
      {/* GizmoTranslate for move mode - axis-constrained World/Local movement */}
      {isActive && isGroupReady && activeTool === 'move' && (
        <GizmoTranslate
          position={position}
          rotation={rotation}
          onDragStart={handleGizmoDragStart}
          onDrag={handleGizmoDrag}
          onDragEnd={handleGizmoDragEnd}
          enabled={isActive}
        />
      )}

      {/* TransformControls for rotate/scale modes - only render when NOT in move mode */}
      {isActive && isGroupReady && activeTool !== 'move' && (activeTool === 'rotate' || activeTool === 'scale') && (
        <CabinetTransformControls
          cabinetId={cabinetId}
          targetRef={groupRef}
          enabled={isActive}
        />
      )}

      {/* SceneObjectRef registers this cabinet for world bounding box calculations */}
      <SceneObjectRef id={cabinetId}>
        <group
          ref={groupRef}
          name={`cabinet-${cabinet.id}`}
          position={position}
          rotation={rotation}
          onClick={(e) => {
            // In glue mode, let clicks pass through to face planes
            if (isGlueMode) return;
            // In drill guide mode, let clicks pass through to hotspot spheres
            if (isDrillGuideMode) return;
            e.stopPropagation();
            onSelect();
          }}
        >
      {/* Selection indicator for active cabinet - scene uses mm units */}
      {/* Selection wireframe - disabled for now
      {isActive && (
        <mesh position={[cabinet.dimensions.width / 2, cabinet.dimensions.height / 2, cabinet.dimensions.depth / 2]}>
          <boxGeometry args={[
            cabinet.dimensions.width + 20,
            cabinet.dimensions.height + 20,
            cabinet.dimensions.depth + 20
          ]} />
          <meshBasicMaterial color="#22c55e" transparent opacity={0.1} wireframe />
        </mesh>
      )}
      */}

      {/* Render panels with shared texture */}
      {/* Skip panel rendering if CSG holes mode is active - CSGDrillOverlay renders them */}
      {!hideForCSGHoles && (
        <PanelsWithTexture
          panels={cabinetPanels}
          baseColor={baseColor}
          cabinetDefaultSurface={surfaceMaterialId}
          edgeColor={edgeColor}
          edgeThickness={edgeThickness}
          cabinetDefaultEdge={edgeMaterialId}
          edgeMaterials={edgeMaterials}
          selectedPanelId={isActive ? selectedPanelId : null}
          onSelectPanel={isActive ? selectPanel : () => {}}
          hideTooltip={hideTooltip}
          onDoubleClickPanel={isActive ? onDoubleClickPanel : undefined}
          isParentCabinetActive={isActive}
          xRayMode={xRayMode}
          renderMode={renderMode}
        />
      )}

      {/* Glue Face Highlights - inside group for correct positioning */}
      {/* Use shouldShowGlueFaces (not isGlueMode) to let GlueFaceHighlights handle delayed unmount */}
      {shouldShowGlueFaces && cabinet.dimensions && (
        <GlueFaceHighlights
          cabinetId={cabinetId}
          dimensions={{
            width: cabinet.dimensions.width,
            height: cabinet.dimensions.height,
            depth: cabinet.dimensions.depth,
          }}
          position={[0, 0, 0]}
          insideGroup={true}
        />
      )}

      {/* Dimension labels - only for active cabinet */}
      {showDimensions && isActive && <DimensionLabels cabinet={cabinet} />}

      {/* Cabinet name label - scene uses mm units */}
      {!isActive && (
        <Html
          position={[cabinet.dimensions.width / 2, cabinet.dimensions.height + 50, cabinet.dimensions.depth / 2]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div className="px-2 py-1 bg-surface-2/90 border border-[#333] rounded text-xs text-gray-400 whitespace-nowrap">
            {cabinet.name}
          </div>
        </Html>
      )}
        </group>
      </SceneObjectRef>
    </>
  );
}

export function Cabinet3D({ showDimensions = false, hideTooltip = false, onDoubleClickPanel }: Cabinet3DProps) {
  // T017: Keep cabinets for render loop only - DON'T use in useEffect dependencies
  const cabinets = useCabinetStore((s) => s.cabinets);
  const activeCabinetId = useCabinetStore((s) => s.activeCabinetId);
  const selectCabinet = useCabinetStore((s) => s.selectCabinet);
  const hiddenCabinetIds = useCabinetStore((s) => s.hiddenCabinetIds);
  const drillingParams = useCabinetStore((s) => s.drillingParams);
  const cabinet = useCabinet(); // Active cabinet for compartment interactions

  // T017: OPTIMIZED - Use direct selector instead of array.find() in useMemo
  // This prevents re-renders when OTHER cabinets change
  const activeCabinetFromArray = useActiveCabinetFromArray();

  const activeTool = useToolStore((s) => s.activeTool);
  const glueMode = useGlueStore((s) => s.mode);
  const draggingCabinetId = useToolStore((s) => s.draggingCabinetId);
  const isSnapping = useSnapStore((s) => s.isSnapping);

  // Plasticity-style view state
  const isolatedCabinetId = useViewStore((s) => s.isolatedCabinetId);
  const xRayMode = useViewStore((s) => s.xRayMode);
  const ghostCabinetIds = useViewStore((s) => s.ghostCabinetIds);
  const previewCabinetIds = useViewStore((s) => s.previewCabinetIds);
  const currentView = useViewStore((s) => s.currentView);

  // Drill map visualization - FIXED: Use correct selector names from useDrillMapStore
  const drillMapVisible = useDrillMapStore((s) => s.showDrillMap);
  const drillMapData = useDrillMapStore((s) => s.drillMap);
  const drillMapPurpose = useDrillMapStore((s) => s.drillMapPurpose);
  const drillMapScale = useDrillMapStore((s) => s.drillMapScale);
  const show3DHardware = useDrillMapStore((s) => s.show3DHardware);
  const showDrillDimensions = useDrillMapStore((s) => s.showDrillDimensions);
  const showHardwareDimensions = useDrillMapStore((s) => s.showDimensions);
  const selectedPoint = useDrillMapStore((s) => s.selectedPoint);
  const setSelectedPoint = useDrillMapStore((s) => s.setSelectedPoint);

  // X-Ray mode controls drill map visibility
  // When X-Ray is ON, show drill holes regardless of drillMapVisible
  const showDrillMap = xRayMode || drillMapVisible;
  const drillPurposeFilter = useMemo<DrillPurpose[] | undefined>(() => {
    if (!drillMapPurpose || drillMapPurpose === 'ALL') return undefined;
    if (drillMapPurpose === 'CAM') return ['CAM_LOCK', 'MINIFIX'];
    if (drillMapPurpose === 'BOLT') return ['BOLT', 'BOLT_ENTRY'];
    if (drillMapPurpose === '\u00D85' || drillMapPurpose === 'Ã˜5') return ['BOLT_THREAD'];
    return [drillMapPurpose as DrillPurpose];
  }, [drillMapPurpose]);

  // Get drill map actions for auto-generation
  const setDrillMap = useDrillMapStore((s) => s.setDrillMap);
  const setCabinetBounds = useDrillMapStore((s) => s.setCabinetBounds);
  const drillMapVersion = useDrillMapStore((s) => s.drillMapVersion);

  // Force regenerate drill map on mount to apply any config fixes
  const regenerateDrillMap = useDrillMapStore((s) => s.regenerateDrillMap);
  useEffect(() => {
    // One-time regeneration on mount to ensure correct Distance B = 24mm
    regenerateDrillMap();
  }, []); // Empty deps = run once on mount

  // Auto-generate Minifix drill map when X-Ray mode OR 3D Hardware is enabled AND a hardware preset is selected
  // Also regenerate when drillingParams change (editable Z and A values)
  // Also regenerate when drillMapVersion changes (triggered by regenerateDrillMap())
  // ALSO: Compute cabinet bounds from drill map for accurate position clamping
  //
  // FIX: Synchronous update - Dimension lines must update in sync with cabinet resize
  // No debounce, no requestAnimationFrame - immediate update for real-time sync
  // T017: Use activeCabinetFromArray instead of cabinets.find() to prevent re-renders
  useEffect(() => {
    if (!activeCabinetFromArray) {
      // Clear drill map when no active cabinet
      setDrillMap(null);
      return;
    }

    // Only generate if X-Ray or 3D Hardware view is enabled
    if (!(xRayMode || show3DHardware)) return;

    // Synchronous update - no debounce, no RAF
    // Get minifixConfig from cabinet's hardware settings (if set via HardwareLibrary)
    // v4.1: Auto-apply default hardware config if none exists (migration for legacy projects)
    // Also normalize to ensure includeDowel=true and dowelOffset=32 for legacy configs
    const storedConfig = (activeCabinetFromArray as any).hardware?.minifixConfig;
    const minifixConfig = storedConfig
      ? normalizeMinifixConfig(storedConfig)
      : null; // null → generateMinifixDrillMap will use DEFAULT_MINIFIX_CONFIG (which has includeDowel: true)
    // Pass config as second arg, drillingParams as third arg
    // Let selectConnectorPositions() determine count per HÃ¤fele CAD spec:
    // Depth < 400mm â†’ 2 corners, Depth >= 400mm â†’ 2 corners + 1 middle
    const drillMap = generateMinifixDrillMap(
      activeCabinetFromArray,
      minifixConfig || {},
      drillingParams
    );
    setDrillMap(drillMap);

    // Compute bounds from drill map (uses same coordinate system as hardware positions)
    const bounds = computeBoundsFromDrillMap(drillMap, 50);
    setCabinetBounds(bounds);
  }, [xRayMode, show3DHardware, activeCabinetFromArray, setDrillMap, setCabinetBounds, drillingParams, drillMapVersion]);

  // Check if glue mode is active at parent level
  const isGlueModeActive = activeTool === 'glue' && glueMode !== 'idle';

  // Get dragging cabinet for snap preview
  const draggingCabinet = draggingCabinetId
    ? cabinets.find(c => c.id === draggingCabinetId)
    : null;
  const draggingPosition = draggingCabinet
    ? (draggingCabinet as any).scenePosition || [0, 0, 0]
    : [0, 0, 0];

  // If no cabinets, render nothing
  if (cabinets.length === 0) return null;

  return (
    <group name="cabinet-scene">
      {/* Render all cabinets (respects Plasticity-style visibility) */}
      {cabinets.map((cab) => {
        // Plasticity-style visibility: H (hide), Shift+H (hide unselected), Alt+H (show all)
        if (hiddenCabinetIds.includes(cab.id)) return null;

        // Plasticity-style isolate: . (period) key
        if (isolatedCabinetId && isolatedCabinetId !== cab.id) return null;

        const scenePos = (cab as any).scenePosition || [0, 0, 0];
        const sceneRot = (cab as any).sceneRotation || [0, 0, 0];
        const isActive = cab.id === activeCabinetId;

        // Determine render mode for this cabinet (Indetails Smart patterns)
        // Ghost = original before change, Preview = proposed change
        const cabinetRenderMode: 'NORMAL' | 'GHOST' | 'PREVIEW' | 'XRAY' =
          ghostCabinetIds.includes(cab.id) ? 'GHOST' :
          previewCabinetIds.includes(cab.id) ? 'PREVIEW' :
          'NORMAL';

        // CSG Holes mode - DISABLED: CSGDrillOverlay only renders holes, not panels
        // Setting this to true would hide panels with nothing to replace them
        // Instead, we keep panels visible and render drill holes as overlay
        const useCSGHoles = false;

        return (
          <SingleCabinet
            key={cab.id}
            cabinet={cab}
            cabinetId={cab.id}
            isActive={isActive}
            position={scenePos}
            rotation={sceneRot}
            showDimensions={showDimensions}
            hideTooltip={hideTooltip}
            onDoubleClickPanel={onDoubleClickPanel}
            onSelect={() => selectCabinet(cab.id)}
            xRayMode={xRayMode}
            renderMode={cabinetRenderMode}
            hideForCSGHoles={useCSGHoles}
          />
        );
      })}

      {/* Snap preview ghost cabinet */}
      {isSnapping && draggingCabinet && (
        <SnapPreview
          dimensions={draggingCabinet.dimensions}
          currentPosition={draggingPosition as [number, number, number]}
        />
      )}

      {/* Compartment dimension labels - only for active cabinet */}
      {showDimensions && cabinet && <CompartmentDimensionLabels />}

      {/* Partial divider position labels - only for active cabinet */}
      {showDimensions && cabinet && <PartialDividerPositionLabels />}

      {/* Compartment interaction - only for active cabinet */}
      {cabinet && <CompartmentInteraction />}

      {/* CAD-Style Drill Indicators - Shows drill points as 2D CAD annotations */}
      {/* Wrapped in group with cabinet position/rotation for correct placement */}
      <group
        position={(activeCabinetFromArray as any)?.scenePosition || [0, 0, 0]}
        rotation={(activeCabinetFromArray as any)?.sceneRotation || [0, 0, 0]}
      >
        <CADDrillIndicators
          drillMap={drillMapData}
          visible={xRayMode && showDrillMap}
          showDiameter={true}
          showDepth={false}
          showCrosshairs={true}
          lineWidth={2}
          filterPurpose={drillPurposeFilter}
          selectedId={selectedPoint?.id ?? null}
          onPointClick={(point) => setSelectedPoint(point)}
        />
      </group>

      {/* Hardware3DOverlay - Shows S200 Bolt + Cam Housing (same as Minifix Config Editor) */}
      {/* Wrapped in group with cabinet position/rotation to fix "floating hardware" issue */}
      <group
        position={(activeCabinetFromArray as any)?.scenePosition || [0, 0, 0]}
        rotation={(activeCabinetFromArray as any)?.sceneRotation || [0, 0, 0]}
      >
        <Hardware3DOverlay
          drillMap={drillMapData}
          visible={xRayMode}
          opacity={0.95}
          minifixConfig={normalizeMinifixConfig((activeCabinetFromArray as any)?.hardware?.minifixConfig)}
          cabinetWidth={activeCabinetFromArray?.dimensions?.width || cabinet?.dimensions?.width || 600}
          cabinetHeight={activeCabinetFromArray?.dimensions?.height || cabinet?.dimensions?.height || 720}
          cabinetDepth={activeCabinetFromArray?.dimensions?.depth || cabinet?.dimensions?.depth || 560}
          topJoint={activeCabinetFromArray?.structure?.topJoint || cabinet?.structure?.topJoint || 'INSET'}
          bottomJoint={activeCabinetFromArray?.structure?.bottomJoint || cabinet?.structure?.bottomJoint || 'INSET'}
          showDimensions={showHardwareDimensions}
          currentView={currentView}
        />

        {/* CSG Drill Holes Overlay - shows drill holes as cylinders in X-Ray mode */}
        <CSGDrillOverlay
          drillMap={drillMapData}
          visible={xRayMode && showDrillMap}
          colorByPurpose={true}
          opacity={0.8}
          filterPurpose={drillPurposeFilter}
        />

        {/* Red Drill Guide Lines - shows drill guide lines at joints */}
        <DrillGuideLayer />
      </group>
    </group>
  );
}

// Edge material type for lookup
type EdgeMaterialMap = Record<string, { id: string; name: string; color: string; thickness: number; textureUrl?: string }>;

// ============================================
// C) Per-Panel Material Resolver
// ============================================

/**
 * Resolve surface material ID for a panel with fallback chain:
 * 1. panel.faces.faceA (per-panel assignment)
 * 2. cabinetDefaultSurface (cabinet default)
 * 3. panel.coreMaterialId (core material as last resort)
 */
function resolvePanelSurfaceMaterialId(
  panel: CabinetPanel,
  cabinetDefaultSurface: string | null
): string | null {
  return (
    panel.faces?.faceA ??
    cabinetDefaultSurface ??
    panel.coreMaterialId ??
    null
  );
}

/**
 * Resolve edge material ID for a panel edge with fallback
 */
function resolvePanelEdgeMaterialId(
  panel: CabinetPanel,
  edgeSide: 'top' | 'bottom' | 'left' | 'right',
  cabinetDefaultEdge: string | null
): string | null {
  return (
    panel.edges?.[edgeSide] ??
    cabinetDefaultEdge ??
    null
  );
}

// Separate component to render panels - now passes per-panel material resolution
interface PanelsWithTextureProps {
  panels: CabinetPanel[];
  baseColor: string;
  /** C) Cabinet default surface for fallback */
  cabinetDefaultSurface: string | null;
  edgeColor: string;
  edgeThickness: number;
  /** C) Cabinet default edge for fallback */
  cabinetDefaultEdge: string | null;
  edgeMaterials: EdgeMaterialMap;
  selectedPanelId: string | null;
  onSelectPanel: (id: string) => void;
  hideTooltip?: boolean;
  onDoubleClickPanel?: () => void;
  /** Whether this cabinet is active - affects click propagation */
  isParentCabinetActive?: boolean;
  /** X-Ray mode - render panels as wireframe for hardware visibility */
  xRayMode?: boolean;
  /** Render mode from Indetails Smart patterns */
  renderMode?: 'NORMAL' | 'GHOST' | 'PREVIEW' | 'XRAY';
}

function PanelsWithTexture({ panels, baseColor, cabinetDefaultSurface, edgeColor, edgeThickness, cabinetDefaultEdge, edgeMaterials, selectedPanelId, onSelectPanel, hideTooltip, onDoubleClickPanel, isParentCabinetActive = true, xRayMode = false, renderMode = 'NORMAL' }: PanelsWithTextureProps) {
  // Guard against undefined panels
  if (!panels || panels.length === 0) return null;

  return (
    <>
      {panels.map((panel) => (
        <Panel3DComponent
          key={panel.id}
          panel={panel}
          baseColor={baseColor}
          cabinetDefaultSurface={cabinetDefaultSurface}
          edgeColor={edgeColor}
          edgeThickness={edgeThickness}
          cabinetDefaultEdge={cabinetDefaultEdge}
          edgeMaterials={edgeMaterials}
          isSelected={selectedPanelId === panel.id}
          onSelect={() => onSelectPanel(panel.id)}
          hideTooltip={hideTooltip}
          onDoubleClick={onDoubleClickPanel}
          isParentCabinetActive={isParentCabinetActive}
          xRayMode={xRayMode}
          renderMode={renderMode}
        />
      ))}
    </>
  );
}

// ============================================
// T017: Hoisted Render Constants (module-level for performance)
// ============================================

// X-Ray mode colors - white/cyan wireframe for professional CAD look
const XRAY_WIRE_COLOR = '#66ccff';  // Cyan wireframe
const XRAY_FILL_COLOR = '#1a2a3a';  // Dark fill for contrast
const XRAY_OPACITY = 0.35;          // Semi-transparent

// Ghost mode colors - semi-transparent dimmed (Indetails Smart pattern)
const GHOST_COLOR = '#d6d3d1';      // Light gray ghost
const GHOST_OPACITY = 0.15;         // Very transparent

// Preview mode colors - highlighted with outline (Indetails Smart pattern)
const PREVIEW_COLOR = '#22d3ee';    // Cyan preview highlight
const PREVIEW_OPACITY = 0.7;        // Semi-transparent

// World-scale texture dimensions
const TEXTURE_WIDTH_MM = 1523;
const TEXTURE_HEIGHT_MM = 3070;

// ============================================
// C) EdgeBandStripMesh - Per-edge texture loading
// ============================================

interface EdgeBandStripProps {
  panel: CabinetPanel;
  edge: 'top' | 'bottom' | 'left' | 'right';
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  cabinetDefaultEdge: string | null;
  isSelected: boolean;
}

/**
 * C) Edge band strip with per-edge material resolution
 * Uses useMaterialTexture hook per strip (avoids hook-in-loop rule)
 */
function EdgeBandStripMesh({
  panel,
  edge,
  position,
  size,
  color,
  cabinetDefaultEdge,
  isSelected,
}: EdgeBandStripProps) {
  // C) Resolve material for THIS specific edge
  const edgeMaterialId = resolvePanelEdgeMaterialId(panel, edge, cabinetDefaultEdge);
  const edgeTexture = useMaterialTexture(edgeMaterialId);

  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        map={edgeTexture}
        color={isSelected ? '#00aaff' : (edgeTexture ? '#ffffff' : color)}
        roughness={0.3}
        metalness={0.02}
        polygonOffset={true}
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

// ============================================
// Panel3D Component
// ============================================

interface Panel3DProps {
  panel: CabinetPanel;
  baseColor: string;
  /** C) Cabinet default surface for per-panel material resolution */
  cabinetDefaultSurface: string | null;
  edgeColor: string;
  edgeThickness: number;
  /** C) Cabinet default edge for per-panel edge resolution */
  cabinetDefaultEdge: string | null;
  edgeMaterials: EdgeMaterialMap;
  isSelected: boolean;
  onSelect: () => void;
  hideTooltip?: boolean;
  onDoubleClick?: () => void;
  /** When false, clicks bubble to parent group for cabinet selection */
  isParentCabinetActive?: boolean;
  /** X-Ray mode - render as wireframe */
  xRayMode?: boolean;
  /** Render mode from Indetails Smart patterns */
  renderMode?: 'NORMAL' | 'GHOST' | 'PREVIEW' | 'XRAY';
}

function Panel3DComponent({ panel, baseColor, cabinetDefaultSurface, edgeColor, edgeThickness, cabinetDefaultEdge, edgeMaterials, isSelected, onSelect, hideTooltip, onDoubleClick, isParentCabinetActive = true, xRayMode = false, renderMode = 'NORMAL' }: Panel3DProps) {
  const meshRef = useRef<Mesh>(null);
  const edgesRef = useRef<LineSegments>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const { invalidate } = useThree();
  // T016: Use generic Texture type for shared loader compatibility
  const [panelTexture, setPanelTexture] = useState<Texture | null>(null);

  // C) Per-panel material resolution: resolve materialId for THIS panel's surface
  const surfaceMaterialId = resolvePanelSurfaceMaterialId(panel, cabinetDefaultSurface);

  // C) Load surface texture via T016 shared loader (per-panel)
  // Note: Edge textures are loaded per-strip in EdgeBandStripMesh component
  const texture = useMaterialTexture(surfaceMaterialId);

  // T015: Use global hover state from store for bidirectional sync
  const hoveredPanelId = useSelectionStore((s) => s.hoveredPanelId);
  const setHoveredPanel = useSelectionStore((s) => s.setHoveredPanel);
  const hovered = hoveredPanelId === panel.id;

  // Set raycast layers for X-Ray mode:
  // - Panel face: PANEL_FACE layer (disabled in X-Ray mode)
  // - Panel edge: PANEL_EDGE layer (always active for selection)
  useEffect(() => {
    if (meshRef.current) {
      setObjectLayer(meshRef.current, RAY_LAYERS.PANEL_FACE);
    }
  }, []);

  useEffect(() => {
    if (edgesRef.current) {
      setObjectLayer(edgesRef.current, RAY_LAYERS.PANEL_EDGE);
    }
  }, [xRayMode]); // Re-run when edges are conditionally rendered

  // Check if in glue mode - panel clicks should pass through
  const activeTool = useToolStore((s) => s.activeTool);
  const isPanelGlueMode = activeTool === 'glue';

  // T017: RAF-gated hover handlers to prevent pointer jitter spam
  const hoverRaf = useRef<number | null>(null);
  const pendingHoverId = useRef<string | null>(null);

  const flushHover = useCallback(() => {
    hoverRaf.current = null;
    setHoveredPanel(pendingHoverId.current);
  }, [setHoveredPanel]);

  const scheduleHover = useCallback((id: string | null) => {
    pendingHoverId.current = id;
    if (hoverRaf.current != null) return; // Already scheduled
    hoverRaf.current = requestAnimationFrame(flushHover);
  }, [flushHover]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (hoverRaf.current != null) cancelAnimationFrame(hoverRaf.current);
    };
  }, []);

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (isPanelGlueMode) return;
    e.stopPropagation();
    scheduleHover(panel.id);
    document.body.style.cursor = 'pointer';
  }, [isPanelGlueMode, panel.id, scheduleHover]);

  const handlePointerOut = useCallback(() => {
    if (isPanelGlueMode) return;
    scheduleHover(null);
    document.body.style.cursor = 'default';
  }, [isPanelGlueMode, scheduleHover]);

  // T017: TEXTURE_WIDTH_MM and TEXTURE_HEIGHT_MM hoisted to module level

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
  
  // Helper to get edge material properties
  const getEdgeMaterial = (edgeId: string | null | undefined) => {
    if (!edgeId) return null;
    const mat = edgeMaterials[edgeId];
    return mat ? { color: mat.color, thickness: mat.thickness || 1 } : null;
  };

  // Edge band strips - thin colored strips at the OUTER EDGE of the panel
  // Panel size is ALREADY reduced by edge thickness
  // So edge band sits AT THE OUTER EDGE making: Panel + Edge = Full Dimension
  // Now each strip has its own color from per-panel edge material selection
  // C) Edge band strips with per-edge material support
  const edgeBandStrips = useMemo(() => {
    const t = panel.computed.realThickness;
    const OFFSET = 0.2; // Tiny offset to prevent z-fighting

    const strips: Array<{
      edge: 'top' | 'bottom' | 'left' | 'right';  // C) Track which edge
      position: [number, number, number];
      size: [number, number, number];
      color: string;
    }> = [];

    // Skip back panel - no edge banding
    if (panel.role === 'BACK') return strips;

    // Get edge materials for all 4 sides
    const topEdge = getEdgeMaterial(panel.edges?.top);       // Front edge
    const bottomEdge = getEdgeMaterial(panel.edges?.bottom); // Back edge
    const leftEdge = getEdgeMaterial(panel.edges?.left);     // Left/Top edge
    const rightEdge = getEdgeMaterial(panel.edges?.right);   // Right/Bottom edge

    // Use default edge thickness for layout calculation, but each strip gets its own color
    const et = Math.max(edgeThickness, 1); // Minimum 1mm for visibility

    switch (panel.role) {
      case 'LEFT_SIDE':
      case 'RIGHT_SIDE':
        // Side panels: sizeX=t, sizeY=height, sizeZ=depth (finishWidth)
        // Edge bands sit AT the panel edge (flush with cabinet), not outside

        // Front edge - at Z = panel.finishWidth/2 - et/2 (flush with panel front)
        if (topEdge) strips.push({
          edge: 'top',
          position: [0, 0, panel.finishWidth/2 - et/2],
          size: [t + OFFSET, panel.finishHeight, et],
          color: topEdge.color,
        });
        // Back edge - at Z = -panel.finishWidth/2 + et/2 (flush with panel back)
        if (bottomEdge) strips.push({
          edge: 'bottom',
          position: [0, 0, -panel.finishWidth/2 + et/2],
          size: [t + OFFSET, panel.finishHeight, et],
          color: bottomEdge.color,
        });
        // Top edge - at Y = panel.finishHeight/2 - et/2 (flush with panel top)
        if (leftEdge) strips.push({
          edge: 'left',
          position: [0, panel.finishHeight/2 - et/2, 0],
          size: [t + OFFSET, et, panel.finishWidth],
          color: leftEdge.color,
        });
        // Bottom edge - at Y = -panel.finishHeight/2 + et/2 (flush with panel bottom)
        if (rightEdge) strips.push({
          edge: 'right',
          position: [0, -panel.finishHeight/2 + et/2, 0],
          size: [t + OFFSET, et, panel.finishWidth],
          color: rightEdge.color,
        });
        break;

      case 'TOP':
      case 'BOTTOM':
      case 'SHELF':
        // Horizontal panels: sizeX=width (finishWidth), sizeY=t, sizeZ=depth (finishHeight)
        // Edge bands sit AT the panel edge (flush with cabinet), not outside

        // Front edge - at Z = panel.finishHeight/2 - et/2 (flush with panel front)
        if (topEdge) strips.push({
          edge: 'top',
          position: [0, 0, panel.finishHeight/2 - et/2],
          size: [panel.finishWidth, t + OFFSET, et],
          color: topEdge.color,
        });
        // Back edge - at Z = -panel.finishHeight/2 + et/2 (flush with panel back)
        if (bottomEdge) strips.push({
          edge: 'bottom',
          position: [0, 0, -panel.finishHeight/2 + et/2],
          size: [panel.finishWidth, t + OFFSET, et],
          color: bottomEdge.color,
        });
        // Left edge - at X = -panel.finishWidth/2 + et/2 (flush with panel left)
        if (leftEdge) strips.push({
          edge: 'left',
          position: [-panel.finishWidth/2 + et/2, 0, 0],
          size: [et, t + OFFSET, panel.finishHeight],
          color: leftEdge.color,
        });
        // Right edge - at X = panel.finishWidth/2 - et/2 (flush with panel right)
        if (rightEdge) strips.push({
          edge: 'right',
          position: [panel.finishWidth/2 - et/2, 0, 0],
          size: [et, t + OFFSET, panel.finishHeight],
          color: rightEdge.color,
        });
        break;

      case 'DIVIDER':
        // Divider: vertical panel, sizeX=t, sizeY=height, sizeZ=depth (finishWidth)
        // Only render FRONT edge - top/bottom edges are hidden by Top/Bottom/Shelf panels
        // Back edge is against the back panel, usually not visible

        // Front edge only - at Z = panel.finishWidth/2 - et/2 (flush with panel front)
        if (topEdge) strips.push({
          edge: 'top',
          position: [0, 0, panel.finishWidth/2 - et/2],
          size: [t + OFFSET, panel.finishHeight, et],
          color: topEdge.color,
        });
        // Skip top/bottom/back edges for dividers - they are hidden by other panels
        break;
    }

    return strips;
  }, [
    // T017: Narrowed deps to specific fields to avoid rebuilds when unrelated panel props change
    panel.finishWidth,
    panel.finishHeight,
    panel.computed.realThickness,
    panel.role,
    panel.edges?.top,
    panel.edges?.bottom,
    panel.edges?.left,
    panel.edges?.right,
    edgeThickness,
    edgeMaterials,
  ]);
  
  // Color based on state
  // Note: BACK panel now uses baseColor like other panels (has 2-side finish)
  const displayColor = useMemo(() => {
    if (isSelected) return '#4488ff';
    if (hovered) return '#6699ff';
    // All panels (including BACK) use baseColor as fallback
    return baseColor;
  }, [isSelected, hovered, baseColor]);
  
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    // In glue mode, let clicks pass through to face planes
    if (isPanelGlueMode) {
      return;
    }
    // When parent cabinet is NOT active, let click bubble to parent group for cabinet selection
    // Only stop propagation when the cabinet is already active (for panel selection)
    if (isParentCabinetActive) {
      e.stopPropagation();
    }
    onSelect();
  };

  const handleDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    // In glue mode, let events pass through
    if (isPanelGlueMode) {
      return;
    }
    // Same logic as handleClick - only stopPropagation when parent is active
    if (isParentCabinetActive) {
      e.stopPropagation();
    }
    onSelect();
    if (onDoubleClick) {
      onDoubleClick();
    }
  };
  
  // Show texture only when not selected/hovered
  // Note: BACK panel now shows texture (has 2-side surface finish)
  const showTexture = texture && !isSelected && !hovered;

  // Create geometry
  const geometry = useMemo(() => {
    return new BoxGeometry(sizeX, sizeY, sizeZ);
  }, [sizeX, sizeY, sizeZ]);

  // Create edges geometry for X-Ray mode (no diagonals, only box edges)
  const edgesGeometry = useMemo(() => {
    return new EdgesGeometry(geometry);
  }, [geometry]);
  
  // T016: Create per-panel texture with unique repeat settings
  // FIX: Use new Texture() with shared source instead of clone() which doesn't work reliably in r3f
  useEffect(() => {
    if (!texture || !showTexture) {
      setPanelTexture(null);
      return;
    }

    // FIX: Create a new Texture sharing the same source, not using clone()
    // This ensures GPU upload works correctly in r3f
    const panelTex = new Texture();

    // Share the same source/image (memory efficient)
    panelTex.source = texture.source;
    panelTex.image = texture.image;

    // Set per-panel settings
    panelTex.wrapS = RepeatWrapping;
    panelTex.wrapT = RepeatWrapping;
    panelTex.colorSpace = SRGBColorSpace;

    // Calculate repeat based on panel dimensions (World-Scale UV)
    const repeatX = panel.finishWidth / TEXTURE_WIDTH_MM;
    const repeatY = panel.finishHeight / TEXTURE_HEIGHT_MM;
    panelTex.repeat.set(repeatX, repeatY);

    // Critical: Mark for GPU upload
    panelTex.needsUpdate = true;

    setPanelTexture(panelTex);

    // Cleanup: dispose GPU resources (not the shared source)
    return () => {
      panelTex.dispose();
    };
  }, [texture, showTexture, panel.finishWidth, panel.finishHeight]);

  // Force material update when panelTexture changes (r3f texture binding fix)
  useEffect(() => {
    if (materialRef.current && panelTexture) {
      materialRef.current.map = panelTexture;
      materialRef.current.needsUpdate = true;
      // Force r3f to re-render and upload texture to GPU
      invalidate();
    }
  }, [panelTexture, invalidate]);

  // Note: Edge textures are now loaded per-strip in EdgeBandStripMesh component

  // No-op raycast function to disable raycasting in glue mode
  // This allows face boxes to receive events instead of panel meshes
  const noopRaycast = () => {};

  // T017: X-Ray, Ghost, Preview constants hoisted to module level

  // Determine effective render mode (X-Ray takes precedence)
  const effectiveMode = xRayMode ? 'XRAY' : renderMode;

  // Visibility gate â€” placed after all hooks to comply with React rules of hooks
  if (!panel.visible) return null;

  return (
    <group position={panel.position} rotation={panel.rotation}>
      {/* Main panel mesh - raycast disabled in glue mode to let face boxes receive events */}
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        raycast={isPanelGlueMode ? noopRaycast : undefined}
        castShadow={effectiveMode === 'NORMAL'}
        receiveShadow={effectiveMode === 'NORMAL'}
        geometry={geometry}
      >
        {effectiveMode === 'XRAY' ? (
          // X-Ray mode: transparent dark fill
          <meshBasicMaterial
            color={XRAY_FILL_COLOR}
            transparent
            opacity={XRAY_OPACITY}
            depthWrite={false}
          />
        ) : effectiveMode === 'GHOST' ? (
          // Ghost mode: semi-transparent, dimmed (Indetails Smart pattern)
          <meshStandardMaterial
            color={GHOST_COLOR}
            transparent
            opacity={GHOST_OPACITY}
            depthWrite={false}
            roughness={1}
            metalness={0}
          />
        ) : effectiveMode === 'PREVIEW' ? (
          // Preview mode: highlighted with glow (Indetails Smart pattern)
          <meshStandardMaterial
            color={displayColor}
            transparent
            opacity={PREVIEW_OPACITY}
            roughness={0.3}
            metalness={0.2}
            emissive={PREVIEW_COLOR}
            emissiveIntensity={0.4}
          />
        ) : (
          // Normal mode: textured/colored material
          <meshStandardMaterial
            ref={materialRef}
            map={panelTexture}
            color={panelTexture ? '#ffffff' : displayColor}
            roughness={0.5}
            metalness={0.1}
            emissive={isSelected ? '#2244aa' : hovered ? '#223366' : '#000000'}
            emissiveIntensity={isSelected ? 0.3 : hovered ? 0.15 : 0}
          />
        )}
      </mesh>

      {/* X-Ray edge outline (clean box edges, no triangulation diagonals) */}
      {/* These edges are interactive in X-Ray mode for panel selection */}
      {effectiveMode === 'XRAY' && (
        <lineSegments
          ref={edgesRef}
          geometry={edgesGeometry}
          onClick={(e) => {
            e.stopPropagation();
            handleClick(e as unknown as ThreeEvent<MouseEvent>);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            handleDoubleClick(e as unknown as ThreeEvent<MouseEvent>);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            // T017: Only update if not already hovered
            if (hoveredPanelId !== panel.id) {
              setHoveredPanel(panel.id);
            }
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            // T017: Only clear if this panel was hovered
            if (hoveredPanelId === panel.id) {
              setHoveredPanel(null);
            }
            document.body.style.cursor = 'default';
          }}
          onContextMenu={(e) => {
            e.stopPropagation();
            // Pass through to default context menu handling
          }}
        >
          <lineBasicMaterial
            color={hovered ? '#aaddff' : XRAY_WIRE_COLOR}
            transparent
            opacity={hovered ? 0.9 : 0.6}
            depthTest={true}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {/* Preview mode outline (Indetails Smart pattern) */}
      {effectiveMode === 'PREVIEW' && (
        <lineSegments geometry={edgesGeometry}>
          <lineBasicMaterial
            color={PREVIEW_COLOR}
            transparent
            opacity={0.8}
          />
        </lineSegments>
      )}

      {/* C) Edge Band Strips - per-edge texture via EdgeBandStripMesh */}
      {effectiveMode === 'NORMAL' && edgeBandStrips.map((strip, idx) => (
        <EdgeBandStripMesh
          key={`edge-${panel.id}-${strip.edge}-${idx}`}
          panel={panel}
          edge={strip.edge}
          position={strip.position}
          size={strip.size}
          color={strip.color}
          cabinetDefaultEdge={cabinetDefaultEdge}
          isSelected={isSelected}
        />
      ))}

      {/* Selection outline - only in normal mode */}
      {isSelected && effectiveMode === 'NORMAL' && (
        <lineSegments geometry={edgesGeometry}>
          <lineBasicMaterial color="#00aaff" />
        </lineSegments>
      )}

      {/* Tooltip - hidden in X-Ray/Ghost modes for cleaner view */}
      {effectiveMode === 'NORMAL' && !hideTooltip && (hovered || isSelected) && (
        <Html
          position={[0, sizeY/2 + 30, 0]}
          center
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div className="bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap border border-white/20">
            <div className="font-medium">{panel.name}</div>
            <div className="text-gray-400 text-[10px]">
              {panel.finishWidth} Ã— {panel.finishHeight} mm
            </div>
            {isSelected && (
              <div className="text-emerald-400 text-[10px] border-t border-white/10 mt-1 pt-1">
                Cut: {panel.computed.cutWidth.toFixed(1)} Ã— {panel.computed.cutHeight.toFixed(1)}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
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
// Shows the gap between: Bottomâ†’Shelf1, Shelf1â†’Shelf2, Shelf2â†’Top
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
  const panels = cabinet.panels || [];
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
