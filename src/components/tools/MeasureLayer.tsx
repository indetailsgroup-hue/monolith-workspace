/**
 * MeasureLayer - 3D Rendering for Measure Tool
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Part of R3F Scene layer
 * - Renders measurement lines and labels
 * - Handles click events for point placement
 * 
 * VISUAL STYLE (Industrial Silent Luxury):
 * - Green lines for measurements (#00ff00)
 * - Clean sans-serif labels
 * - Minimal visual noise
 */

import { useMemo } from 'react';
import { Line, Html } from '@react-three/drei';
import { ThreeEvent } from '@react-three/fiber';
// import { Vector3 } from 'three';
import { useMeasureStore, formatDistance, MeasureSegment } from '../../core/store/useMeasureStore';

// ============================================
// MAIN COMPONENT
// ============================================

export function MeasureLayer() {
  const { 
    isActive, 
    segments, 
    previewFrom, 
    previewTo,
    showLabels,
    labelUnit,
    addPoint,
    updatePreview,
  } = useMeasureStore();
  
  // Handle click to add measurement point
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isActive) return;
    
    e.stopPropagation();
    const point = e.point;
    addPoint([point.x, point.y, point.z]);
  };
  
  // Handle mouse move for preview line
  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!isActive || !previewFrom) return;
    
    const point = e.point;
    updatePreview([point.x, point.y, point.z]);
  };
  
  return (
    <group>
      {/* Invisible plane to capture clicks when measure tool is active */}
      {isActive && (
        <mesh
          visible={false}
          onClick={handleClick}
          onPointerMove={handlePointerMove}
        >
          <planeGeometry args={[10000, 10000]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}
      
      {/* Render completed segments */}
      {segments.map((segment) => (
        <MeasureSegmentView 
          key={segment.id} 
          segment={segment}
          showLabel={showLabels}
          labelUnit={labelUnit}
        />
      ))}
      
      {/* Render preview line (while measuring) */}
      {previewFrom && previewTo && (
        <PreviewLine 
          from={previewFrom.world} 
          to={previewTo}
          labelUnit={labelUnit}
        />
      )}
      
      {/* Render first point indicator */}
      {previewFrom && (
        <PointIndicator position={previewFrom.world} color="#ffff00" />
      )}
    </group>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface MeasureSegmentViewProps {
  segment: MeasureSegment;
  showLabel: boolean;
  labelUnit: 'mm' | 'cm' | 'm';
}

function MeasureSegmentView({ segment, showLabel, labelUnit }: MeasureSegmentViewProps) {
  const { from, to, lengthMm } = segment;
  
  // Calculate midpoint for label
  const midpoint = useMemo(() => {
    return [
      (from.world[0] + to.world[0]) / 2,
      (from.world[1] + to.world[1]) / 2,
      (from.world[2] + to.world[2]) / 2,
    ] as [number, number, number];
  }, [from, to]);
  
  return (
    <group>
      {/* Measurement line */}
      <Line
        points={[from.world, to.world]}
        color="#00ff00"
        lineWidth={2}
        dashed={false}
      />
      
      {/* End point indicators */}
      <PointIndicator position={from.world} color="#00ff00" />
      <PointIndicator position={to.world} color="#00ff00" />
      
      {/* Distance label */}
      {showLabel && (
        <Html
          position={midpoint}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.85)',
              color: '#00ff00',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'Inter, monospace',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              border: '1px solid #00ff00',
            }}
          >
            {formatDistance(lengthMm, labelUnit)}
          </div>
        </Html>
      )}
    </group>
  );
}

interface PreviewLineProps {
  from: [number, number, number];
  to: [number, number, number];
  labelUnit: 'mm' | 'cm' | 'm';
}

function PreviewLine({ from, to, labelUnit }: PreviewLineProps) {
  // Calculate distance for preview
  const distance = useMemo(() => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }, [from, to]);
  
  // Calculate midpoint for label
  const midpoint = useMemo(() => {
    return [
      (from[0] + to[0]) / 2,
      (from[1] + to[1]) / 2,
      (from[2] + to[2]) / 2,
    ] as [number, number, number];
  }, [from, to]);
  
  return (
    <group>
      {/* Preview line (dashed) */}
      <Line
        points={[from, to]}
        color="#ffff00"
        lineWidth={1}
        dashed={true}
        dashSize={10}
        gapSize={5}
      />
      
      {/* Preview distance label */}
      <Html
        position={midpoint}
        center
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#ffff00',
            padding: '3px 6px',
            borderRadius: '3px',
            fontSize: '11px',
            fontFamily: 'Inter, monospace',
            whiteSpace: 'nowrap',
            border: '1px dashed #ffff00',
          }}
        >
          {formatDistance(distance, labelUnit)}
        </div>
      </Html>
    </group>
  );
}

interface PointIndicatorProps {
  position: [number, number, number];
  color: string;
}

function PointIndicator({ position, color }: PointIndicatorProps) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[3, 16, 16]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}
