/**
 * G11 Connector OS Audit — Connector OS ตรวจ drill map จริง
 *
 * สายพานที่ต่อ Connector OS (docs/connector-os) เข้า pipeline จริง:
 * ใช้ catalog + placement profile (load spacing) + placer + compiler
 * เป็น "ผู้ตรวจ" ของ drill map ที่ generateDrillMap สร้าง — ไม่แทนที่ตัว generator
 *
 * ตรวจ 3 เรื่อง (ต่อ joint = คู่แผ่นที่ยึดด้วย Minifix):
 *   1. Rule of Two — ทุก joint ต้องมี connector ≥ minPerJoint (กันบิด)
 *   2. Load spacing — ระยะห่างระหว่าง connector ต้องไม่เกิน maxSpacing ของ LoadClass
 *      (เทียบจำนวนกับ placer getConnectorPositions ด้วย)
 *   3. Spec parity — dia/depth ของรูจริงต้องตรง ConnectorSpec ที่ compiler สังเคราะห์
 *      (จับ drift ระหว่าง catalog เก่ากับ Connector OS — รายงานแบบรวมยอด ไม่ spam)
 *
 * หมายเหตุ: ไม่ตรวจตำแหน่ง B (edge distance) เพราะเป็น variant configuration
 * (B24 vs B34) ไม่ใช่ความผิด — ปล่อยให้ ruleG11_DistanceB เดิมดูแลช่วงที่ยอมรับได้
 */

import type { DrillMap, DrillMapPoint } from '../../core/manufacturing/drillMap/types';
import {
  KITCHEN_PREMIUM_PROFILE,
  HMR18_HPL08x2_PVC1,
  selectConnector,
} from '../../core/connector/catalog';
import { getConnectorPositions } from '../../core/connector/placer';
import { compileConnectorOps } from '../../core/connector/compiler';
import type { AdjacencyContext, LoadClass, ConnectorDrillOp } from '../../core/connector/types';
import type { ConnectorDensity } from '../../core/manufacturing/drillMap/generateDrillMap';

// ============================================
// TYPES
// ============================================

export interface ConnectorAuditIssue {
  code:
    | 'G11_RULE_OF_TWO'
    | 'G11_MAX_SPACING'
    | 'G11_UNDER_CONNECTED'
    | 'G11_SPEC_PARITY';
  severity: 'BLOCKER' | 'WARNING' | 'INFO';
  message: string;
  entityIds: string[];
  measured?: Record<string, number | string>;
}

export interface ConnectorAuditResult {
  gate: 'G11_CONNECTOR_OS';
  status: 'PASS' | 'FAIL';
  issues: ConnectorAuditIssue[];
  summary: {
    jointsAudited: number;
    housingsAudited: number;
    blockers: number;
    warnings: number;
  };
}

interface JointGroup {
  key: string;
  panelA: string;
  panelB: string;
  housings: DrillMapPoint[];
}

// ============================================
// JOINT GROUPING
// ============================================

const HOUSING_PURPOSES = new Set(['CAM_LOCK', 'MINIFIX']);

/**
 * จัดกลุ่มรู housing เป็น joint ต่อคู่แผ่น (panelA↔panelB)
 * ฝั่ง bolt หาจาก pairedHoleId → panelId ของรูปลายทาง
 */
export function groupJoints(drillMap: DrillMap): {
  joints: JointGroup[];
  pointById: Map<string, DrillMapPoint>;
} {
  const pointById = new Map<string, DrillMapPoint>();
  for (const panel of drillMap.panels || []) {
    for (const p of panel.points || []) pointById.set(p.id, p);
  }

  const joints = new Map<string, JointGroup>();

  for (const panel of drillMap.panels || []) {
    for (const p of panel.points || []) {
      if (!HOUSING_PURPOSES.has(p.purpose) || p.componentType !== 'HOUSING') continue;

      const paired = p.pairedHoleId ? pointById.get(p.pairedHoleId) : undefined;
      const otherPanel = paired?.panelId ?? 'UNPAIRED';
      const [a, b] = [p.panelId, otherPanel].sort();
      const key = `${a}::${b}`;

      let joint = joints.get(key);
      if (!joint) {
        joint = { key, panelA: a, panelB: b, housings: [] };
        joints.set(key, joint);
      }
      joint.housings.push(p);
    }
  }

  return { joints: [...joints.values()], pointById };
}

/**
 * หาแกนที่ connector เรียงตัว (แกนที่ตำแหน่งกระจายมากสุด)
 * แล้วคืนตำแหน่งบนแกนนั้น เรียงจากน้อยไปมาก
 */
export function positionsAlongJoint(housings: DrillMapPoint[]): number[] {
  if (housings.length === 0) return [];
  const spread = [0, 1, 2].map((axis) => {
    const vals = housings.map((h) => h.position[axis]);
    return Math.max(...vals) - Math.min(...vals);
  });
  const axis = spread.indexOf(Math.max(...spread));
  return housings.map((h) => h.position[axis]).sort((x, y) => x - y);
}

// ============================================
// AUDIT
// ============================================

/**
 * รัน Connector OS audit บน drill map จริง
 */
export function runConnectorOsAudit(
  drillMap: DrillMap | null,
  load: LoadClass = 'STANDARD',
  // ADR-061: profile ที่ผู้ใช้เลือก — เลือกมาตรฐาน CAD โดยตั้งใจ = spacing เกิน AWI
  // เป็นข้อมูลแจ้ง (INFO) ไม่ใช่คำเตือน; default เข้มไว้ก่อน (AWI)
  density: ConnectorDensity = 'AWI_PREMIUM',
): ConnectorAuditResult {
  const issues: ConnectorAuditIssue[] = [];
  const profile = KITCHEN_PREMIUM_PROFILE;
  const maxSpacing = profile.constraints.loadOverrides[load].maxSpacingMm;

  if (!drillMap) {
    return {
      gate: 'G11_CONNECTOR_OS',
      status: 'PASS',
      issues: [],
      summary: { jointsAudited: 0, housingsAudited: 0, blockers: 0, warnings: 0 },
    };
  }

  const { joints, pointById } = groupJoints(drillMap);
  let housingsAudited = 0;

  // Spec ที่ compiler สังเคราะห์ — แหล่งความจริงฝั่ง Connector OS
  const spec = selectConnector(HMR18_HPL08x2_PVC1.resolved.coreThk, 'MINIFIX');
  const expectedOps: ConnectorDrillOp[] = compileConnectorOps(
    { id: 'AUDIT', jointLength: 0, panelA: { panelId: 'A', role: '' }, panelB: { panelId: 'B', role: '' } } satisfies AdjacencyContext,
    spec,
    [0],
    HMR18_HPL08x2_PVC1,
    'DRILL_ON_FINISHED',
  );
  const expectedCam = expectedOps.find((o) => o.meta.featureId === 'CAM');
  const expectedBolt = expectedOps.find((o) => o.meta.featureId === 'BOLT');

  // สะสม parity drift แบบรวมยอด (ไม่ spam รายรู)
  const parity = new Map<string, { count: number; entityIds: string[]; expected: number; actual: number; dim: string; feature: string }>();
  const addParity = (feature: string, dim: string, expected: number, actual: number, id: string) => {
    if (Math.abs(expected - actual) < 0.05) return;
    const key = `${feature}|${dim}|${expected}|${actual}`;
    const entry = parity.get(key) ?? { count: 0, entityIds: [], expected, actual, dim, feature };
    entry.count += 1;
    if (entry.entityIds.length < 8) entry.entityIds.push(id);
    parity.set(key, entry);
  };

  for (const joint of joints) {
    housingsAudited += joint.housings.length;
    const housingIds = joint.housings.map((h) => h.id);

    // 1) Rule of Two
    if (joint.housings.length < profile.constraints.minPerJoint) {
      issues.push({
        code: 'G11_RULE_OF_TWO',
        severity: 'WARNING',
        message: `Joint ${joint.panelA}↔${joint.panelB} มี connector ${joint.housings.length} ตัว (ขั้นต่ำ ${profile.constraints.minPerJoint} — กันแผ่นบิด)`,
        entityIds: housingIds,
        measured: { count: joint.housings.length, minPerJoint: profile.constraints.minPerJoint },
      });
    }

    // 2) Load spacing — ช่องว่างจริงระหว่าง connector บนแนว joint
    const positions = positionsAlongJoint(joint.housings);
    for (let i = 1; i < positions.length; i++) {
      const gap = positions[i] - positions[i - 1];
      if (gap > maxSpacing + 0.5) {
        issues.push({
          code: 'G11_MAX_SPACING',
          severity: density === 'CAD_STANDARD' ? 'INFO' : 'WARNING',
          message: density === 'CAD_STANDARD'
            ? `Joint ${joint.panelA}↔${joint.panelB} ช่วงห่าง ${gap.toFixed(1)}mm เกิน AWI ${maxSpacing}mm — โปรไฟล์มาตรฐาน CAD ที่เลือกไว้ (ตกลงกับลูกค้าได้)`
            : `Joint ${joint.panelA}↔${joint.panelB} ช่วงห่าง connector ${gap.toFixed(1)}mm เกินเกณฑ์ ${load} (${maxSpacing}mm)`,
          entityIds: housingIds,
          measured: { gapMm: Math.round(gap * 10) / 10, maxSpacingMm: maxSpacing, load },
        });
        break; // หนึ่ง finding ต่อ joint พอ
      }
    }

    // 2b) เทียบจำนวนกับ placer (ประมาณ jointLen จาก span + endOffset สองข้าง — conservative)
    if (positions.length >= 2) {
      const span = positions[positions.length - 1] - positions[0];
      const approxJointLen = span + profile.system32.endOffset * 2;
      const expectedPositions = getConnectorPositions(approxJointLen, profile, load);
      if (joint.housings.length < expectedPositions.length) {
        issues.push({
          code: 'G11_UNDER_CONNECTED',
          severity: 'INFO',
          message: `Joint ${joint.panelA}↔${joint.panelB} มี ${joint.housings.length} ตัว — placer แนะนำ ${expectedPositions.length} สำหรับช่วง ~${Math.round(approxJointLen)}mm (${load})`,
          entityIds: housingIds,
          measured: { count: joint.housings.length, recommended: expectedPositions.length, approxJointLenMm: Math.round(approxJointLen) },
        });
      }
    }

    // 3) Spec parity — dia/depth จริง vs compiler
    for (const h of joint.housings) {
      if (expectedCam) {
        addParity('CAM', 'dia', expectedCam.params.dia, h.diameter, h.id);
        addParity('CAM', 'depth', expectedCam.params.depth, h.depth, h.id);
      }
      const bolt = h.pairedHoleId ? pointById.get(h.pairedHoleId) : undefined;
      if (bolt && expectedBolt) {
        addParity('BOLT', 'dia', expectedBolt.params.dia, bolt.diameter, bolt.id);
      }
    }
  }

  for (const entry of parity.values()) {
    issues.push({
      code: 'G11_SPEC_PARITY',
      severity: 'WARNING',
      message: `${entry.feature} ${entry.dim}: drill map = ${entry.actual}mm แต่ ConnectorSpec (${spec.connectorId}) = ${entry.expected}mm — ${entry.count} จุด (catalog สองชุดไม่ตรงกัน ต้องชี้ขาดตาม formula-reference)`,
      entityIds: entry.entityIds,
      measured: { expectedMm: entry.expected, actualMm: entry.actual, points: entry.count },
    });
  }

  const blockers = issues.filter((i) => i.severity === 'BLOCKER').length;
  const warnings = issues.filter((i) => i.severity === 'WARNING').length;

  return {
    gate: 'G11_CONNECTOR_OS',
    status: blockers > 0 ? 'FAIL' : 'PASS',
    issues,
    summary: { jointsAudited: joints.length, housingsAudited, blockers, warnings },
  };
}
