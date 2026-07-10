/**
 * ReferenceWalls — FP-4a (ADR-063): ผนังอ้างอิงลากมือ — visual-only
 *
 * ให้ Sale/Designer ลากเส้นผนังทับ underlay → เห็นตู้ในโครงห้อง 3D
 * หลักเหล็กเดิม: ระนาบโปร่ง REFERENCE เท่านั้น — ผนังเสร็จ raycast=null
 * (ไม่ snap ไม่วัด ไม่เข้า estimate/ผลิต); เฉพาะตอนลากถึงมี plane รับคลิก
 */

import { useMemo, useCallback } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { useUnderlayStore } from '../../core/store/useUnderlayStore';

const WALL_COLOR = '#C7A86A'; // DAPH gold — แยกจากงานจริงชัดเจน

export function ReferenceWalls() {
  const walls = useUnderlayStore((s) => s.walls);
  const heightMm = useUnderlayStore((s) => s.wallHeightMm);
  const visible = useUnderlayStore((s) => s.wallsVisible);
  const tracing = useUnderlayStore((s) => s.tracing);
  const draftPoints = useUnderlayStore((s) => s.draftPoints);
  const addDraftPoint = useUnderlayStore((s) => s.addDraftPoint);

  const onFloorClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    addDraftPoint(Math.round(e.point.x), Math.round(e.point.z));
  }, [addDraftPoint]);

  // เส้นร่างระหว่างลาก (บนพื้น)
  const draftGeometry = useMemo(() => {
    if (draftPoints.length < 2) return null;
    const arr = new Float32Array((draftPoints.length - 1) * 6);
    for (let i = 1; i < draftPoints.length; i++) {
      const [x1, z1] = draftPoints[i - 1];
      const [x2, z2] = draftPoints[i];
      arr.set([x1, 1, z1, x2, 1, z2], (i - 1) * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, [draftPoints]);

  return (
    <group>
      {/* ระนาบรับคลิกตอนลากเท่านั้น — โปร่งใสทั้งผืน */}
      {tracing && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.2, 0]}
          onPointerDown={onFloorClick}
        >
          <planeGeometry args={[100000, 100000]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* จุด+เส้นร่างระหว่างลาก */}
      {tracing && draftPoints.map(([x, z], i) => (
        <mesh key={i} position={[x, 2, z]} raycast={() => null}>
          <sphereGeometry args={[15, 8, 8]} />
          <meshBasicMaterial color={WALL_COLOR} />
        </mesh>
      ))}
      {tracing && draftGeometry && (
        <lineSegments geometry={draftGeometry} raycast={() => null}>
          <lineBasicMaterial color={WALL_COLOR} />
        </lineSegments>
      )}

      {/* ผนังที่เสร็จแล้ว: ระนาบโปร่งต่อ segment — render-only */}
      {visible && walls.map((wall) =>
        wall.points.slice(1).map(([x2, z2], i) => {
          const [x1, z1] = wall.points[i];
          const len = Math.hypot(x2 - x1, z2 - z1);
          if (len < 1) return null;
          const angle = Math.atan2(-(z2 - z1), x2 - x1);
          return (
            <mesh
              key={`${wall.id}-${i}`}
              position={[(x1 + x2) / 2, heightMm / 2, (z1 + z2) / 2]}
              rotation={[0, angle, 0]}
              raycast={() => null}
              renderOrder={-1}
            >
              <planeGeometry args={[len, heightMm]} />
              <meshBasicMaterial
                color={WALL_COLOR}
                transparent
                opacity={0.18}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          );
        }),
      )}
    </group>
  );
}
