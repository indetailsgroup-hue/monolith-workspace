/**
 * Connector OS Shadow Compare — ขั้นที่ 1 ของ ADR-061 (compiler เป็นตัวสร้างรู)
 *
 * ให้ compiler (placer + compileConnectorOps) สังเคราะห์รูคู่ขนานกับ
 * generateDrillMap แล้วเทียบ parity ต่อ joint บนตู้จริง — ยังไม่สลับตัวสร้าง
 * สลับได้เมื่อ parity เต็มทุกตู้ (ขั้นที่ 2 = เทียบพิกัด CNC เต็มรูปจาก cabinet geometry)
 *
 * ขั้นนี้เทียบ: จำนวนต่อ joint + รูปแบบระยะห่าง (gap pattern) + dia/depth ต่อ feature
 */

import type { DrillMap } from '../manufacturing/drillMap/types';
import { KITCHEN_PREMIUM_PROFILE, HMR18_HPL08x2_PVC1, selectConnector } from './catalog';
import { getConnectorPositions, getSpreadGridPositions } from './placer';
import { compileConnectorOps } from './compiler';
import type { AdjacencyContext, LoadClass } from './types';
import { groupJoints, positionsAlongJoint } from '../../gate/rules/gateG11_connectorAudit';

export interface ShadowJointResult {
  joint: string;
  actualCount: number;
  expectedCount: number;
  countMatch: boolean;
  /** ระยะห่างระหว่างตัวติดกัน (mm) — เทียบ pattern ไม่เทียบพิกัดสัมบูรณ์ */
  actualGaps: number[];
  expectedGaps: number[];
  gapPatternMatch: boolean;
  /** dia/depth ของ CAM จริงตรง spec ที่ compiler ให้ */
  featureParity: boolean;
}

export interface ShadowParityReport {
  jointsCompared: number;
  jointsMatched: number;
  results: ShadowJointResult[];
}

const GAP_TOLERANCE_MM = 0.5;

/**
 * เทียบ compiler-synthesized pattern กับ drill map จริง (per joint)
 */
export function runShadowCompare(
  drillMap: DrillMap | null,
  load: LoadClass = 'STANDARD',
): ShadowParityReport {
  if (!drillMap) return { jointsCompared: 0, jointsMatched: 0, results: [] };

  const profile = KITCHEN_PREMIUM_PROFILE;
  const spec = selectConnector(HMR18_HPL08x2_PVC1.resolved.coreThk, 'MINIFIX');
  const { joints } = groupJoints(drillMap);
  const results: ShadowJointResult[] = [];

  for (const joint of joints) {
    const positions = positionsAlongJoint(joint.housings);
    if (positions.length === 0) continue;

    // ประมาณ jointLength จาก span จริง + endOffset สองข้าง (convention เดียวกับ audit)
    const span = positions[positions.length - 1] - positions[0];
    const jointLength = span + profile.system32.endOffset * 2;

    const ctx: AdjacencyContext = {
      id: joint.key,
      jointLength,
      panelA: { panelId: joint.panelA, role: '' },
      panelB: { panelId: joint.panelB, role: '' },
    };
    // มติ ก: ตำแหน่งคาดหวัง = grid spread ด้วยจำนวนจริง (นับตรวจแยกใน audit ผ่าน placer)
    void getConnectorPositions; // placer count rule ใช้ใน audit (G11_UNDER_CONNECTED)
    const sPositions = getSpreadGridPositions(jointLength, profile.system32, positions.length);
    const ops = compileConnectorOps(ctx, spec, sPositions, HMR18_HPL08x2_PVC1, 'DRILL_ON_FINISHED');
    const camOps = ops.filter((o) => o.meta.featureId === 'CAM');

    const gaps = (arr: number[]) => arr.slice(1).map((v, i) => Math.round((v - arr[i]) * 10) / 10);
    const actualGaps = gaps(positions);
    const expectedS = camOps.map((o) => o.params.v).sort((a, b) => a - b);
    const expectedGaps = gaps(expectedS);

    const countMatch = positions.length === camOps.length;
    // world axis อาจกลับทิศจาก S (generator ใช้ maxZ - s) — เทียบทั้งเดินหน้า/ถอยหลัง
    const fits = (a: number[], b: number[]) =>
      a.length === b.length && a.every((g, i) => Math.abs(g - b[i]) <= GAP_TOLERANCE_MM);
    const gapPatternMatch = countMatch &&
      (fits(actualGaps, expectedGaps) || fits(actualGaps, [...expectedGaps].reverse()));

    const expectedCam = camOps[0];
    const featureParity = joint.housings.every(
      (h) => expectedCam !== undefined &&
        Math.abs(h.diameter - expectedCam.params.dia) < 0.05 &&
        Math.abs(h.depth - expectedCam.params.depth) < 0.05,
    );

    results.push({
      joint: joint.key,
      actualCount: positions.length,
      expectedCount: camOps.length,
      countMatch,
      actualGaps,
      expectedGaps,
      gapPatternMatch,
      featureParity,
    });
  }

  return {
    jointsCompared: results.length,
    jointsMatched: results.filter((r) => r.countMatch && r.gapPatternMatch && r.featureParity).length,
    results,
  };
}
