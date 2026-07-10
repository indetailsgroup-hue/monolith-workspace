/**
 * DxfUnderlay — FP-2 (ADR-062): เส้น DXF อ้างอิงบนพื้นฉาก
 * render-only เหมือน UnderlayPlane: raycast=null, ไม่มีทางเข้า manufacturing
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { useUnderlayStore } from '../../core/store/useUnderlayStore';

export function DxfUnderlay() {
  const segments = useUnderlayStore((s) => s.dxfSegments);
  const scale = useUnderlayStore((s) => s.dxfScale);
  const position = useUnderlayStore((s) => s.dxfPosition);
  const rotationDeg = useUnderlayStore((s) => s.dxfRotationDeg);
  const visible = useUnderlayStore((s) => s.dxfVisible);

  const geometry = useMemo(() => {
    if (!segments || segments.length === 0) return null;
    const arr = new Float32Array(segments.length * 6);
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      // DXF XY → พื้นฉาก XZ (Y ขึ้น); กลับเครื่องหมาย Z ให้แกน Y ของแปลนชี้ "ลึกเข้าจอ" ตรงกับ Top view
      arr[i * 6 + 0] = s.x1; arr[i * 6 + 1] = 0; arr[i * 6 + 2] = -s.y1;
      arr[i * 6 + 3] = s.x2; arr[i * 6 + 4] = 0; arr[i * 6 + 5] = -s.y2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, [segments]);

  if (!geometry || !visible) return null;

  return (
    <lineSegments
      geometry={geometry}
      position={[position[0], 0.8, position[1]]}
      rotation={[0, (rotationDeg * Math.PI) / 180, 0]}
      scale={[scale, 1, scale]}
      renderOrder={-1}
      raycast={() => null}
    >
      <lineBasicMaterial color="#f59e0b" transparent opacity={0.7} depthWrite={false} />
    </lineSegments>
  );
}
