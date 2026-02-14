/**
 * SPEC-MINIFIX-JOINT-LOGIC v1.0
 * MinifixDebugOverlay - R3F Debug Visualization
 *
 * Visualizes Minifix placements with:
 * - CAM housing positions (blue cylinders)
 * - BOLT positions (orange cylinders)
 * - Connection lines between paired CAM/BOLT
 * - Face/edge normal arrows
 * - Validation status indicators
 */

import React, { useMemo } from 'react';
import { Line, Cylinder, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Cabinet } from '../../core/types/Cabinet';
import {
  createCabinetTopologyApi,
  detectCabinetMinifixJoints,
  resolveMinifixPlacement,
  MinifixPlacement,
  Vec3,
} from '../../core/manufacturing/minifix';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface MinifixDebugOverlayProps {
  cabinet: Cabinet;
  /** Show CAM positions */
  showCam?: boolean;
  /** Show BOLT positions */
  showBolt?: boolean;
  /** Show connection lines */
  showConnections?: boolean;
  /** Show normal arrows */
  showNormals?: boolean;
  /** Show labels */
  showLabels?: boolean;
  /** Show validation status */
  showValidation?: boolean;
  /** Opacity for visualization */
  opacity?: number;
  /** Scale factor for visualization */
  scale?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Colors
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = {
  cam: '#3b82f6', // Blue
  camValid: '#22c55e', // Green
  camInvalid: '#ef4444', // Red
  bolt: '#f97316', // Orange
  boltValid: '#22c55e',
  boltInvalid: '#ef4444',
  connection: '#8b5cf6', // Purple
  normalArrow: '#f59e0b', // Amber
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Arrow helper for showing normals/axes
 */
function NormalArrow({
  origin,
  direction,
  length = 30,
  color = COLORS.normalArrow,
}: {
  origin: Vec3;
  direction: Vec3;
  length?: number;
  color?: string;
}) {
  const endPoint: Vec3 = [
    origin[0] + direction[0] * length,
    origin[1] + direction[1] * length,
    origin[2] + direction[2] * length,
  ];

  return (
    <Line
      points={[origin, endPoint]}
      color={color}
      lineWidth={2}
    />
  );
}

/**
 * CAM visualization cylinder
 */
function CamVisualization({
  placement,
  isValid,
  showLabel,
  opacity,
  scale,
}: {
  placement: MinifixPlacement;
  isValid: boolean;
  showLabel: boolean;
  opacity: number;
  scale: number;
}) {
  const { cam } = placement;
  const color = isValid ? COLORS.camValid : COLORS.camInvalid;

  // Convert mm to scene units (assuming 1 unit = 1mm)
  const radius = (cam.spec.camDiameter / 2) * scale;
  const height = cam.spec.camDepth * scale;

  // Calculate rotation to align cylinder with drill axis
  const rotation = useMemo(() => {
    const axis = new THREE.Vector3(...cam.axis);
    const defaultAxis = new THREE.Vector3(0, 1, 0); // Cylinder default is Y-up
    const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultAxis, axis.normalize());
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    return [euler.x, euler.y, euler.z] as [number, number, number];
  }, [cam.axis]);

  // Position at drill surface (origin is on the surface, cylinder extends inward)
  const position: [number, number, number] = [
    cam.origin[0] + cam.axis[0] * height / 2,
    cam.origin[1] + cam.axis[1] * height / 2,
    cam.origin[2] + cam.axis[2] * height / 2,
  ];

  return (
    <group position={position} rotation={rotation}>
      <Cylinder args={[radius, radius, height, 16]} castShadow={false} receiveShadow={false}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
        />
      </Cylinder>
      {showLabel && (
        <Html center distanceFactor={500}>
          <div
            style={{
              background: 'rgba(0,0,0,0.8)',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              whiteSpace: 'nowrap',
            }}
          >
            CAM Ø{cam.spec.camDiameter}
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * BOLT visualization cylinder
 */
function BoltVisualization({
  placement,
  isValid,
  showLabel,
  opacity,
  scale,
}: {
  placement: MinifixPlacement;
  isValid: boolean;
  showLabel: boolean;
  opacity: number;
  scale: number;
}) {
  const { bolt } = placement;
  const color = isValid ? COLORS.boltValid : COLORS.boltInvalid;

  const radius = (bolt.spec.boltDiameter / 2) * scale;
  const height = bolt.spec.boltDepth * scale;

  const rotation = useMemo(() => {
    const axis = new THREE.Vector3(...bolt.axis);
    const defaultAxis = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultAxis, axis.normalize());
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    return [euler.x, euler.y, euler.z] as [number, number, number];
  }, [bolt.axis]);

  const position: [number, number, number] = [
    bolt.origin[0] + bolt.axis[0] * height / 2,
    bolt.origin[1] + bolt.axis[1] * height / 2,
    bolt.origin[2] + bolt.axis[2] * height / 2,
  ];

  return (
    <group position={position} rotation={rotation}>
      <Cylinder args={[radius, radius, height, 12]} castShadow={false} receiveShadow={false}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
        />
      </Cylinder>
      {showLabel && (
        <Html center distanceFactor={500}>
          <div
            style={{
              background: 'rgba(0,0,0,0.8)',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              whiteSpace: 'nowrap',
            }}
          >
            BOLT Ø{bolt.spec.boltDiameter}
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * Connection line between CAM and BOLT
 */
function ConnectionLine({
  placement,
  color = COLORS.connection,
}: {
  placement: MinifixPlacement;
  color?: string;
}) {
  return (
    <Line
      points={[placement.cam.origin, placement.bolt.origin]}
      color={color}
      lineWidth={1}
      dashed
      dashSize={5}
      gapSize={3}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Debug overlay for Minifix placements
 */
export function MinifixDebugOverlay({
  cabinet,
  showCam = true,
  showBolt = true,
  showConnections = true,
  showNormals = true, // DEBUG: Enable to see axis directions
  showLabels = true,  // DEBUG: Enable to see labels
  showValidation = true,
  opacity = 0.6,
  scale = 1,
}: MinifixDebugOverlayProps) {
  // Resolve all placements
  const { placements, validationMap } = useMemo(() => {
    const api = createCabinetTopologyApi(cabinet);
    const jointConfigs = detectCabinetMinifixJoints(cabinet);

    const allPlacements: MinifixPlacement[] = [];
    const validMap = new Map<MinifixPlacement, boolean>();

    for (const config of jointConfigs) {
      const resolution = resolveMinifixPlacement(config, api);
      for (const placement of resolution.placements) {
        allPlacements.push(placement);
        validMap.set(placement, resolution.validation.valid);
      }
    }

    return { placements: allPlacements, validationMap: validMap };
  }, [cabinet]);

  // Get cabinet world offset
  const cabinetPos = (cabinet as any).scenePosition || [0, 0, 0];

  return (
    <group position={cabinetPos}>
      {placements.map((placement, idx) => {
        const isValid = showValidation ? validationMap.get(placement) ?? true : true;

        return (
          <group key={idx}>
            {/* CAM visualization */}
            {showCam && (
              <CamVisualization
                placement={placement}
                isValid={isValid}
                showLabel={showLabels}
                opacity={opacity}
                scale={scale}
              />
            )}

            {/* BOLT visualization */}
            {showBolt && (
              <BoltVisualization
                placement={placement}
                isValid={isValid}
                showLabel={showLabels}
                opacity={opacity}
                scale={scale}
              />
            )}

            {/* Connection line */}
            {showConnections && <ConnectionLine placement={placement} />}

            {/* Normal arrows */}
            {showNormals && (
              <>
                <NormalArrow
                  origin={placement.cam.origin}
                  direction={placement.cam.axis}
                  color={COLORS.cam}
                />
                <NormalArrow
                  origin={placement.bolt.origin}
                  direction={placement.bolt.axis}
                  color={COLORS.bolt}
                />
              </>
            )}
          </group>
        );
      })}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug Panel Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * UI Panel for debugging Minifix placements
 */
export function MinifixDebugPanel({ cabinet }: { cabinet: Cabinet }) {
  const debugInfo = useMemo(() => {
    const api = createCabinetTopologyApi(cabinet);
    const jointConfigs = detectCabinetMinifixJoints(cabinet);

    return jointConfigs.map((config) => {
      const resolution = resolveMinifixPlacement(config, api);
      return {
        id: config.id,
        style: config.style,
        position: config.position,
        side: config.side,
        placements: resolution.placements.length,
        valid: resolution.validation.valid,
        issues: resolution.validation.issues,
      };
    });
  }, [cabinet]);

  return (
    <div
      style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        background: 'rgba(26, 26, 46, 0.95)',
        border: '1px solid #3a3a5a',
        borderRadius: '8px',
        padding: '12px',
        color: 'white',
        fontSize: '12px',
        maxWidth: '300px',
        maxHeight: '400px',
        overflow: 'auto',
      }}
    >
      <h3 style={{ margin: '0 0 8px 0', color: '#8b5cf6' }}>
        Minifix Debug
      </h3>

      {debugInfo.map((info) => (
        <div
          key={info.id}
          style={{
            marginBottom: '8px',
            padding: '8px',
            background: info.valid ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${info.valid ? '#22c55e' : '#ef4444'}`,
            borderRadius: '4px',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
            {info.style} {info.position} - {info.side.toUpperCase()}
          </div>
          <div>Placements: {info.placements}</div>
          <div>Valid: {info.valid ? '✓' : '✗'}</div>
          {info.issues.length > 0 && (
            <div style={{ marginTop: '4px', color: '#f59e0b' }}>
              Issues:
              <ul style={{ margin: '4px 0', paddingLeft: '16px' }}>
                {info.issues.map((issue, idx) => (
                  <li key={idx}>
                    [{issue.severity}] {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default MinifixDebugOverlay;
