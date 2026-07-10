/**
 * UnderlayPlane — FP-1 (ADR-062): ภาพแปลนอ้างอิงบนพื้นฉาก
 *
 * render-only: ไม่ raycast, ไม่ snap, ไม่มีทางเข้า drill map/packet —
 * เป็น "ภาพรองพื้น" ให้ตาเทียบเท่านั้น ขนาดผลิตจริงมาจากการวัดหน้างาน
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { useUnderlayStore } from '../../core/store/useUnderlayStore';

export function UnderlayPlane() {
  const imageDataUrl = useUnderlayStore((s) => s.imageDataUrl);
  const aspect = useUnderlayStore((s) => s.aspect);
  const widthMm = useUnderlayStore((s) => s.widthMm);
  const opacity = useUnderlayStore((s) => s.opacity);
  const position = useUnderlayStore((s) => s.position);
  const rotationDeg = useUnderlayStore((s) => s.rotationDeg);
  const visible = useUnderlayStore((s) => s.visible);

  const texture = useMemo(() => {
    if (!imageDataUrl) return null;
    const tex = new THREE.TextureLoader().load(imageDataUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, [imageDataUrl]);

  if (!texture || !visible) return null;

  const heightMm = widthMm * aspect;

  return (
    <mesh
      // ยกเหนือ grid นิดเดียวกัน z-fighting; นอนราบบนพื้น
      position={[position[0], 0.5, position[1]]}
      rotation={[-Math.PI / 2, 0, (rotationDeg * Math.PI) / 180]}
      renderOrder={-1}
      raycast={() => null} // ห้ามคลิกโดน — อ้างอิงอย่างเดียว
    >
      <planeGeometry args={[widthMm, heightMm]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
