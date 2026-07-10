/**
 * Build connector-ops.json — ADR-061(c) ขั้น 3 ก้าวแรก:
 * emitToOpNodes มี caller จริง — Connector OS compiler สังเคราะห์ OpNodes
 * ต่อ joint จาก drill map จริง แล้วแนบเข้า factory packet เป็น artifact
 * คู่ขนาน (hash-anchored) — **ไม่แทน drillmap.json** จนกว่า parity เต็มทุกตู้
 *
 * เนื้อหา = ops ที่ตรงกับที่เจาะจริง (จำนวนตาม housing จริงต่อ joint —
 * shadow gate ยืนยัน parity อยู่ทุกครั้งที่ Run Gate)
 */

import type { DrillMap } from '../../../core/manufacturing/drillMap/types';
import {
  KITCHEN_PREMIUM_PROFILE,
  HMR18_HPL08x2_PVC1,
  selectConnector,
} from '../../../core/connector/catalog';
import { getSpreadGridPositions } from '../../../core/connector/placer';
import { compileConnectorOps } from '../../../core/connector/compiler';
import { emitToOpNodes } from '../../../core/connector/emitToOpGraph';
import type { OpNode } from '../../../core/manufacturing/opgraph/types';
import {
  groupJoints,
  positionsAlongJoint,
} from '../../../gate/rules/gateG11_connectorAudit';

export interface PacketConnectorOpsJoint {
  joint: string;
  panelA: string;
  panelB: string;
  /** จำนวน connector ต่อ joint (ตรง drill map จริง) */
  count: number;
  /** S-positions บน System32 grid (mm จากขอบหน้า) */
  sPositions: number[];
  opNodes: OpNode[];
}

export interface PacketConnectorOps {
  version: 'connector-ops.v1';
  /** compiler เป็นแหล่งสังเคราะห์ — ยังไม่ใช่ตัวแทน drillmap.json (ADR-061 stage 3) */
  role: 'PARALLEL_ARTIFACT';
  connectorId: string;
  joints: PacketConnectorOpsJoint[];
  summary: {
    totalJoints: number;
    totalOpNodes: number;
  };
}

/**
 * สังเคราะห์ connector OpNodes ต่อ joint จาก drill map จริง
 * (deterministic: เรียง joint ตาม key, positions เรียงแล้วจาก grid)
 */
export function buildConnectorOpsData(drillMap: DrillMap | null): PacketConnectorOps {
  const spec = selectConnector(HMR18_HPL08x2_PVC1.resolved.coreThk, 'MINIFIX');
  const joints: PacketConnectorOpsJoint[] = [];

  if (drillMap) {
    const { joints: grouped } = groupJoints(drillMap);
    const sorted = [...grouped].sort((a, b) => a.key.localeCompare(b.key));

    for (const joint of sorted) {
      const positions = positionsAlongJoint(joint.housings);
      if (positions.length === 0) continue;

      const span = positions[positions.length - 1] - positions[0];
      const jointLength = span + KITCHEN_PREMIUM_PROFILE.system32.endOffset * 2;
      const sPositions = getSpreadGridPositions(
        jointLength,
        KITCHEN_PREMIUM_PROFILE.system32,
        positions.length,
      );

      const ops = compileConnectorOps(
        {
          id: joint.key,
          jointLength,
          panelA: { panelId: joint.panelA, role: '' },
          panelB: { panelId: joint.panelB, role: '' },
        },
        spec,
        sPositions,
        HMR18_HPL08x2_PVC1,
        'DRILL_ON_FINISHED',
      );

      joints.push({
        joint: joint.key,
        panelA: joint.panelA,
        panelB: joint.panelB,
        count: positions.length,
        sPositions,
        opNodes: emitToOpNodes(ops, joint.panelA),
      });
    }
  }

  return {
    version: 'connector-ops.v1',
    role: 'PARALLEL_ARTIFACT',
    connectorId: spec.connectorId,
    joints,
    summary: {
      totalJoints: joints.length,
      totalOpNodes: joints.reduce((n, j) => n + j.opNodes.length, 0),
    },
  };
}
