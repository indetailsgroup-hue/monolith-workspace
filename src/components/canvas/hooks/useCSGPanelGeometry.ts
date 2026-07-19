/**
 * useCSGPanelGeometry — CSG Boolean Drill Hole Subtraction Hook
 *
 * Computes true CSG boolean subtraction of drill holes from panel geometry.
 * Uses three-bvh-csg (Brush + Evaluator) with useMemo caching.
 *
 * Coordinate System:
 * - DrillMapPoint positions are in WORLD coordinates
 * - Panel geometry is in LOCAL coordinates (centered at origin, size = sizeX/sizeY/sizeZ)
 * - We transform drill points from world → panel-local before CSG
 *
 * Key Settings:
 * - evaluator.useGroups = false (matches @react-three/csg, avoids multi-material group issues)
 * - Fresh BufferGeometry output (avoids evaluator's internal dispose() side effects)
 * - Manufacturing-accurate hole sizes (Ø5, Ø8, Ø10, Ø15) — no display scaling
 * - Blind holes with real depth from drill map (Cam Ø15×13.5, Bolt Ø10×24, etc.)
 *
 * NOTE: For visual drill hole display in X-Ray mode, CSGDrillOverlay.tsx renders
 * separate opaque cylinder meshes — that approach is more reliable for visualization.
 * This hook is for true geometry subtraction (section views, export, etc.)
 *
 * Performance:
 * - ~5-20ms per panel (depends on drill point count)
 * - Cached by useMemo — only recomputes when dims/points/enabled change
 * - Fallback to BoxGeometry on error
 */

import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { DrillMapPoint } from '../../../core/manufacturing/drillMap/types';

// Shared evaluator instance (reusable, no per-panel overhead)
let sharedEvaluator: Evaluator | null = null;
function getEvaluator(): Evaluator {
  if (!sharedEvaluator) {
    sharedEvaluator = new Evaluator();
    // CRITICAL: Match @react-three/csg — useGroups=false avoids multi-material group issues
    sharedEvaluator.useGroups = false;
  }
  return sharedEvaluator;
}

/** Cylinder segment count — 32 for smooth hole outlines */
const CYLINDER_SEGMENTS = 32;

/** Small clearance (mm) at the drill entry surface to ensure clean CSG cut */
const ENTRY_CLEARANCE = 1;

export interface UseCSGPanelGeometryInput {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  drillPoints: DrillMapPoint[];
  panelPosition: [number, number, number];
  panelRotation: [number, number, number];
  enabled: boolean;
}

function createPanelInverseMatrix(
  panelPosition: [number, number, number],
  panelRotation: [number, number, number],
): THREE.Matrix4 {
  const mat = new THREE.Matrix4();
  const euler = new THREE.Euler(panelRotation[0], panelRotation[1], panelRotation[2], 'XYZ');
  const quat = new THREE.Quaternion().setFromEuler(euler);
  mat.compose(
    new THREE.Vector3(panelPosition[0], panelPosition[1], panelPosition[2]),
    quat,
    new THREE.Vector3(1, 1, 1),
  );
  return mat.invert();
}

function copyToFreshGeometry(srcGeo: THREE.BufferGeometry): THREE.BufferGeometry {
  const outputGeo = new THREE.BufferGeometry();
  const drawStart = srcGeo.drawRange.start;
  const drawCount = srcGeo.drawRange.count !== Infinity
    ? srcGeo.drawRange.count
    : (srcGeo.index ? srcGeo.index.count : (srcGeo.attributes.position?.count ?? 0));

  if (srcGeo.index) {
    const srcIndexArray = srcGeo.index.array;
    const validIndexArray = srcIndexArray.slice(drawStart, drawStart + drawCount);
    let maxVertexIndex = 0;
    for (let i = 0; i < validIndexArray.length; i++) {
      if (validIndexArray[i] > maxVertexIndex) maxVertexIndex = validIndexArray[i];
    }
    const vertexCount = maxVertexIndex + 1;
    for (const key in srcGeo.attributes) {
      const srcAttr = srcGeo.attributes[key];
      const trimmedArray = srcAttr.array.slice(0, vertexCount * srcAttr.itemSize);
      outputGeo.setAttribute(key, new THREE.BufferAttribute(trimmedArray, srcAttr.itemSize, srcAttr.normalized));
    }
    outputGeo.setIndex(new THREE.BufferAttribute(validIndexArray, 1));
  } else {
    for (const key in srcGeo.attributes) {
      const srcAttr = srcGeo.attributes[key];
      const trimmedArray = srcAttr.array.slice(
        drawStart * srcAttr.itemSize,
        (drawStart + drawCount) * srcAttr.itemSize,
      );
      outputGeo.setAttribute(key, new THREE.BufferAttribute(trimmedArray, srcAttr.itemSize, srcAttr.normalized));
    }
  }

  outputGeo.computeVertexNormals();
  outputGeo.computeBoundingBox();
  outputGeo.computeBoundingSphere();
  return outputGeo;
}

export function useCSGPanelGeometry({
  sizeX, sizeY, sizeZ, drillPoints, panelPosition, panelRotation, enabled,
}: UseCSGPanelGeometryInput): THREE.BufferGeometry | null {
  const prevGeometryRef = useRef<THREE.BufferGeometry | null>(null);

  const drillPointsKey = useMemo(() => {
    if (!drillPoints.length) return '';
    return drillPoints
      .map((p) => `${p.id}:${p.position.join(',')}:${p.normal.join(',')}:${p.diameter}:${p.depth}`)
      .join('|');
  }, [drillPoints]);

  const geometry = useMemo(() => {
    if (!enabled || drillPoints.length === 0) return null;
    const startTime = performance.now();

    try {
      const evaluator = getEvaluator();
      const boxGeo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
      let currentBrush = new Brush(boxGeo);
      currentBrush.updateMatrixWorld(true);

      const inverseMatrix = createPanelInverseMatrix(panelPosition, panelRotation);
      const worldPos = new THREE.Vector3();
      const worldNormal = new THREE.Vector3();
      const localPos = new THREE.Vector3();
      const localNormal = new THREE.Vector3();
      const normalMatrix = new THREE.Matrix3().setFromMatrix4(inverseMatrix);

      let holeCount = 0;
      const disposables: THREE.BufferGeometry[] = [boxGeo];
      const filteredPoints = drillPoints.filter(p => p.purpose !== 'BOLT');

      for (const point of filteredPoints) {
        worldPos.set(point.position[0], point.position[1], point.position[2]);
        localPos.copy(worldPos).applyMatrix4(inverseMatrix);
        worldNormal.set(point.normal[0], point.normal[1], point.normal[2]);
        localNormal.copy(worldNormal).applyMatrix3(normalMatrix).normalize();

        const radius = point.diameter / 2;
        if (radius < 0.1 || point.depth < 0.1) continue;

        const depth = point.depth;
        const cylinderHeight = depth + ENTRY_CLEARANCE;
        const centerOffset = (depth - ENTRY_CLEARANCE) / 2;

        const cylGeo = new THREE.CylinderGeometry(radius, radius, cylinderHeight, CYLINDER_SEGMENTS);
        const cylMatrix = new THREE.Matrix4();
        const cylQuat = new THREE.Quaternion();
        const yAxis = new THREE.Vector3(0, 1, 0);
        if (Math.abs(localNormal.dot(yAxis)) < 0.999) {
          cylQuat.setFromUnitVectors(yAxis, localNormal);
        } else if (localNormal.y < 0) {
          cylQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
        }
        const cylinderCenter = localPos.clone().addScaledVector(localNormal, centerOffset);
        cylMatrix.compose(cylinderCenter, cylQuat, new THREE.Vector3(1, 1, 1));
        cylGeo.applyMatrix4(cylMatrix);
        disposables.push(cylGeo);

        const holeBrush = new Brush(cylGeo);
        holeBrush.updateMatrixWorld(true);
        const result = evaluator.evaluate(currentBrush, holeBrush, SUBTRACTION);
        currentBrush = result;
        holeCount++;
      }

      if (holeCount === 0) {
        disposables.forEach(g => g.dispose());
        return null;
      }

      const outputGeo = copyToFreshGeometry(currentBrush.geometry);
      const duration = performance.now() - startTime;
      console.log(
        `[CSG] Panel [${sizeX.toFixed(0)}×${sizeY.toFixed(0)}×${sizeZ.toFixed(0)}]: ` +
        `${holeCount} holes, ${outputGeo.attributes.position.count} verts, ${duration.toFixed(1)}ms`,
      );
      disposables.forEach(g => g.dispose());
      return outputGeo;
    } catch (err) {
      console.warn('[CSG] CSG computation failed:', err);
      return null;
    }
    // NOTE(react-hooks/exhaustive-deps): intentionally not satisfied —

    // deps array indexes into panelPosition/panelRotation arrays, which the rule cannot analyse.

    // The rule is not installed yet; restore a real eslint-disable directive

    // when eslint-plugin-react-hooks is added.
  }, [enabled, sizeX, sizeY, sizeZ, panelPosition[0], panelPosition[1], panelPosition[2], panelRotation[0], panelRotation[1], panelRotation[2], drillPointsKey]);

  useEffect(() => {
    if (prevGeometryRef.current && prevGeometryRef.current !== geometry) {
      prevGeometryRef.current.dispose();
    }
    prevGeometryRef.current = geometry;
  }, [geometry]);

  useEffect(() => {
    return () => {
      if (prevGeometryRef.current) {
        prevGeometryRef.current.dispose();
        prevGeometryRef.current = null;
      }
    };
  }, []);

  return geometry;
}
