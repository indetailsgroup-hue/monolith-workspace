/**
 * worldSynthesis — ADR-061(c) ขั้น 3: compiler-driven corner minifix ใน "พิกัดโลกจริง"
 *
 * ประกอบจาก kernel เดียวกับ generator (ไม่เดาสูตรใหม่ ไม่ก็อปตรรกะ):
 *   ตำแหน่งบนแนว = Connector OS placer (System32 grid — authority เดียวกัน)
 *   สเปครู       = Connector OS catalog (sleeve Ø10×17.5, CAM Ø15×13.5)
 *   พิกัดโลก     = panelBasis helpers (pure AABB-driven, มีเทสต์)
 *
 * ใช้เป็น parity target: ถ้า output ตรง generateDrillMap 100% บนตู้จริง →
 * ส่วน corner-minifix ของ generator สลับมาใช้ตัวนี้ได้ (drop-in)
 *
 * scope v3 (bolt-family ครบ): CAM+BOLT+BOLT_ENTRY+BOLT_THREAD ทั้ง OVERLAY+INSET 90°
 * DOWELS = นอก scope โดยตั้งใจ (harness เผยว่า dowel จริงมาจากหลายระบบ:
 * corner-branch + B-run + depth ต่างจากสูตร corner — ต้อง mapping session แยก) — มุมองศาอื่น = skip แบบ no-guess (รายงานตรง)
 */

import type { Cabinet } from '../types/Cabinet';
import type { Vec3Tuple, CornerType, DrillMap } from '../manufacturing/drillMap/types';
import {
  calculatePanelAABB,
  boltFacePointFromHorizAABB_overlay,
  camFacePointFromSideAABB_overlay,
  boltEntryEdgePointFromSideAABB_overlay,
  boltEntryEdgePointFromHorizAABB,
  boltFacePointFromSideAABB_v4,
  getPanelBasisFromAABB,
  panelLocalToWorld,
  clamp as basisClamp,
} from '../manufacturing/drillMap/panelBasis';
import { DEFAULT_MINIFIX_S200_CONFIG } from '../manufacturing/drillMap/minifixDefaults';
import { CORNER_DOWEL_SPEC } from '../manufacturing/drillMap/generateDrillMap';
import {
  computeConnectorCountForDensity,
  type ConnectorDensity,
} from '../manufacturing/drillMap/generateDrillMap';
import { getSpreadGridPositions } from './placer';
import { KITCHEN_PREMIUM_PROFILE, HMR18_HPL08x2_PVC1, selectConnector } from './catalog';

export interface SynthesizedBore {
  corner: CornerType;
  sys32Z: number;
  kind: 'CAM' | 'BOLT' | 'BOLT_ENTRY' | 'BOLT_THREAD' | 'DOWEL';
  position: Vec3Tuple;
  normal: Vec3Tuple;
  diameter: number;
  depth: number;
}

export interface WorldSynthesisResult {
  bores: SynthesizedBore[];
  /** corner ที่ข้ามเพราะนอก scope v1 (INSET/มุมไม่ 90°/แผ่นหาย) */
  skippedCorners: Array<{ corner: CornerType; reason: string }>;
}

const CORNERS: CornerType[] = ['TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'];

/**
 * สังเคราะห์ corner minifix (CAM+BOLT) เป็นพิกัดโลก จาก cabinet geometry ล้วน
 */
export function synthesizeCornerMinifixWorld(
  cabinet: Cabinet,
  opts: { density?: ConnectorDensity; firstHoleZ?: number; distanceB?: number } = {},
): WorldSynthesisResult {
  const density = opts.density ?? 'CAD_STANDARD';
  const firstHole = opts.firstHoleZ ?? 37;
  const distanceB = opts.distanceB ?? 24;

  const bores: SynthesizedBore[] = [];
  const skipped: WorldSynthesisResult['skippedCorners'] = [];

  const byRole = new Map(cabinet.panels.map((p) => [p.role, p]));
  const top = byRole.get('TOP');
  const bottom = byRole.get('BOTTOM');
  const left = byRole.get('LEFT_SIDE');
  const right = byRole.get('RIGHT_SIDE');

  // run length = ช่วงลึก (Z) ของแผ่นนอน — convention เดียวกับ generator
  const runPanel = top ?? bottom;
  if (!runPanel) return { bores, skippedCorners: [{ corner: 'TOP_LEFT', reason: 'no horizontal panel' }] };
  const runAabb = calculatePanelAABB(runPanel);
  const runLength = runAabb.max[2] - runAabb.min[2];

  const count = computeConnectorCountForDensity(runLength, firstHole, density);
  const sys32Positions = getSpreadGridPositions(
    runLength,
    { ...KITCHEN_PREMIUM_PROFILE.system32, firstHole },
    count,
  );

  const spec = selectConnector(HMR18_HPL08x2_PVC1.resolved.coreThk, 'MINIFIX');
  const cam = spec.features.find((f) => f.id === 'CAM');
  const bolt = spec.features.find((f) => f.id === 'BOLT');
  if (!cam || !bolt) return { bores, skippedCorners: [{ corner: 'TOP_LEFT', reason: 'spec missing features' }] };

  for (const corner of CORNERS) {
    const isTop = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';
    const isLeft = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';
    const horizontal = isTop ? top : bottom;
    const vertical = isLeft ? left : right;

    if (!horizontal || !vertical) {
      skipped.push({ corner, reason: 'missing panel' });
      continue;
    }

    const jointMode = (isTop ? cabinet.structure?.topJoint : cabinet.structure?.bottomJoint) ?? 'INSET';
    if (jointMode !== 'OVERLAY' && jointMode !== 'INSET') {
      skipped.push({ corner, reason: `jointMode ${jointMode} นอก scope` });
      continue;
    }
    const angles = cabinet.structure?.cornerAngles;
    const angle =
      corner === 'TOP_LEFT' ? angles?.topLeft ?? 90 :
      corner === 'TOP_RIGHT' ? angles?.topRight ?? 90 :
      corner === 'BOTTOM_LEFT' ? angles?.bottomLeft ?? 90 : angles?.bottomRight ?? 90;
    if (Math.abs(angle - 90) > 0.001) {
      skipped.push({ corner, reason: `angle ${angle}° นอก scope v1` });
      continue;
    }

    const horizAabb = calculatePanelAABB(horizontal);
    const vertAabb = calculatePanelAABB(vertical);

    const cfg = DEFAULT_MINIFIX_S200_CONFIG;
    // corner dowel: ±offset จากตำแหน่ง bolt บนแกนลึก, กรอง margin firstHole (AABB แผ่นข้าง)
    const dowelZFor = (sys32Z: number): number[] => {
      const zBolt = vertAabb.max[2] - sys32Z;
      return [zBolt - CORNER_DOWEL_SPEC.offset, zBolt + CORNER_DOWEL_SPEC.offset]
        .filter((z) => z >= vertAabb.min[2] + firstHole && z <= vertAabb.max[2] - firstHole);
    };

    if (jointMode === 'OVERLAY') {
      const jointAxisX = (vertAabb.min[0] + vertAabb.max[0]) / 2;
      for (const sys32Z of sys32Positions) {
        // BOLT บนแผ่นนอน (OVERLAY: face bore ±Y) — X ทับแกน joint (กึ่งกลางความหนา side)
        const b = boltFacePointFromHorizAABB_overlay(corner, horizAabb, sys32Z, distanceB);
        b.position[0] = jointAxisX;
        bores.push({
          corner, sys32Z, kind: 'BOLT',
          position: b.position, normal: b.normal,
          diameter: bolt.diaMm, depth: bolt.depthMm,
        });
        // BOLT_THREAD: ตำแหน่ง/ทิศเดียวกับ BOLT — รูนำเกลียว
        bores.push({
          corner, sys32Z, kind: 'BOLT_THREAD',
          position: [b.position[0], b.position[1], b.position[2]] as Vec3Tuple,
          normal: b.normal,
          diameter: cfg.shaftDia, depth: cfg.shaftLength,
        });
        // BOLT_ENTRY: edge bore บนขอบบน/ล่างแผ่นข้าง
        const e = boltEntryEdgePointFromSideAABB_overlay(corner, vertAabb, sys32Z, distanceB);
        bores.push({
          corner, sys32Z, kind: 'BOLT_ENTRY',
          position: e.position, normal: e.normal,
          diameter: cfg.boltEntryDia ?? 7.5, depth: distanceB,
        });

        // CAM บนแผ่นข้าง inner face (OVERLAY)
        const c = camFacePointFromSideAABB_overlay(corner, vertAabb, sys32Z, distanceB);
        bores.push({
          corner, sys32Z, kind: 'CAM',
          position: c.position, normal: c.normal,
          diameter: cam.diaMm, depth: cam.depthMm,
        });

        // CORNER DOWELS (OVERLAY): side EDGE 18 + horiz FACE 12
        for (const dz of dowelZFor(sys32Z)) {
          bores.push({
            corner, sys32Z, kind: 'DOWEL',
            position: [e.position[0], e.position[1], dz] as Vec3Tuple,
            normal: e.normal,
            diameter: CORNER_DOWEL_SPEC.dia, depth: CORNER_DOWEL_SPEC.horizEdgeDepth,
          });
          bores.push({
            corner, sys32Z, kind: 'DOWEL',
            position: [b.position[0], b.position[1], dz] as Vec3Tuple,
            normal: b.normal,
            diameter: CORNER_DOWEL_SPEC.dia, depth: CORNER_DOWEL_SPEC.sideFaceDepth,
          });
        }
      }
    } else {
      // INSET (Side covers Top/Bottom v4.0):
      // BOLT = face bore เข้าหน้าใน SIDE (±X), Y ทับแกน joint (กึ่งกลางความหนาแผ่นนอน)
      // CAM  = face bore บนแผ่นนอน ที่ Distance B จาก mate edge (panel-local + clamp)
      const jointAxisY = (horizAabb.min[1] + horizAabb.max[1]) / 2;
      const camCenterOffset = cam.depthMm / 2;
      const basis = getPanelBasisFromAABB(horizontal, horizAabb);
      const camMargin = cam.diaMm / 2 + 2;

      for (const sys32Z of sys32Positions) {
        const b = boltFacePointFromSideAABB_v4(corner, vertAabb, sys32Z, camCenterOffset);
        b.position[1] = jointAxisY;
        bores.push({
          corner, sys32Z, kind: 'BOLT',
          position: b.position, normal: b.normal,
          diameter: bolt.diaMm, depth: bolt.depthMm,
        });
        // BOLT_THREAD: ตำแหน่ง/ทิศเดียวกับ BOLT
        bores.push({
          corner, sys32Z, kind: 'BOLT_THREAD',
          position: [b.position[0], b.position[1], b.position[2]] as Vec3Tuple,
          normal: b.normal,
          diameter: cfg.shaftDia, depth: cfg.shaftLength,
        });
        // BOLT_ENTRY: edge bore บนขอบซ้าย/ขวาแผ่นนอน (ทาง CAM)
        const e = boltEntryEdgePointFromHorizAABB(corner, horizAabb, sys32Z, distanceB);
        bores.push({
          corner, sys32Z, kind: 'BOLT_ENTRY',
          position: e.position, normal: e.normal,
          diameter: cfg.boltEntryDia ?? 7.5, depth: distanceB,
        });

        // CORNER DOWELS (INSET v4.0): side FACE 12 + horiz EDGE 18
        for (const dz of dowelZFor(sys32Z)) {
          bores.push({
            corner, sys32Z, kind: 'DOWEL',
            position: [b.position[0], b.position[1], dz] as Vec3Tuple,
            normal: b.normal,
            diameter: CORNER_DOWEL_SPEC.dia, depth: CORNER_DOWEL_SPEC.sideFaceDepth,
          });
          bores.push({
            corner, sys32Z, kind: 'DOWEL',
            position: [
              isLeft ? horizAabb.min[0] : horizAabb.max[0],
              (horizAabb.min[1] + horizAabb.max[1]) / 2,
              dz,
            ] as Vec3Tuple,
            normal: (isLeft ? [1, 0, 0] : [-1, 0, 0]) as Vec3Tuple,
            diameter: CORNER_DOWEL_SPEC.dia, depth: CORNER_DOWEL_SPEC.horizEdgeDepth,
          });
        }

        const camLocalX = basisClamp(
          isLeft ? distanceB : basis.faceWidth - distanceB,
          camMargin, basis.faceWidth - camMargin,
        );
        const camLocalY = basisClamp(sys32Z, 10, basis.faceHeight - 10);
        bores.push({
          corner, sys32Z, kind: 'CAM',
          position: panelLocalToWorld(basis, camLocalX, camLocalY),
          normal: basis.uAxis,
          diameter: cam.diaMm, depth: cam.depthMm,
        });
      }
    }
  }

  return { bores, skippedCorners: skipped };
}

export interface WorldParityReport {
  compared: number;
  matched: number;
  maxDeltaMm: number;
  mismatches: Array<{ kind: string; corner: string; sys32Z: number; deltaMm: number }>;
  skippedCorners: WorldSynthesisResult['skippedCorners'];
}

const POS_TOLERANCE_MM = 0.5;

/**
 * เทียบ synthesis กับ drill map จริง: ทุก bore สังเคราะห์ต้องมีจุดจริง
 * (purpose ตรงตระกูล + dia/depth ตรง) ห่างไม่เกิน 0.5mm
 */
export function compareWorldParity(
  cabinet: Cabinet,
  drillMap: DrillMap | null,
  opts: Parameters<typeof synthesizeCornerMinifixWorld>[1] = {},
): WorldParityReport {
  const synth = synthesizeCornerMinifixWorld(cabinet, opts);
  const report: WorldParityReport = {
    compared: synth.bores.length,
    matched: 0,
    maxDeltaMm: 0,
    mismatches: [],
    skippedCorners: synth.skippedCorners,
  };
  if (!drillMap || synth.bores.length === 0) return report;

  const actual = drillMap.panels.flatMap((p) => p.points ?? []);
  const pools: Record<string, typeof actual> = {
    CAM: actual.filter((p) => (p.purpose === 'MINIFIX' || p.purpose === 'CAM_LOCK') && p.componentType === 'HOUSING'),
    BOLT: actual.filter((p) => p.purpose === 'BOLT'),
    BOLT_ENTRY: actual.filter((p) => p.purpose === 'BOLT_ENTRY'),
    BOLT_THREAD: actual.filter((p) => p.purpose === 'BOLT_THREAD'),
    DOWEL: actual.filter((p) => p.purpose === 'DOWEL'),
  };

  for (const b of synth.bores) {
    const pool = pools[b.kind] ?? [];
    let best = Infinity;
    for (const a of pool) {
      if (Math.abs(a.diameter - b.diameter) > 0.05 || Math.abs(a.depth - b.depth) > 0.05) continue;
      const d = Math.hypot(
        a.position[0] - b.position[0],
        a.position[1] - b.position[1],
        a.position[2] - b.position[2],
      );
      if (d < best) best = d;
    }
    if (best <= POS_TOLERANCE_MM) {
      report.matched++;
      report.maxDeltaMm = Math.max(report.maxDeltaMm, best);
    } else {
      report.mismatches.push({ kind: b.kind, corner: b.corner, sys32Z: b.sys32Z, deltaMm: Math.round(best * 100) / 100 });
    }
  }
  return report;
}
