/**
 * G11 Connector OS Audit tests
 * Connector OS (catalog/placer/compiler) ตรวจ drill map จริง
 */

import { describe, it, expect } from 'vitest';
import {
  runConnectorOsAudit,
  groupJoints,
  positionsAlongJoint,
} from '../gateG11_connectorAudit';
import type { DrillMap, DrillMapPoint } from '../../../core/manufacturing/drillMap/types';

// ============================================
// FIXTURES
// ============================================

let idSeq = 0;

function housing(
  panelId: string,
  y: number,
  pairedHoleId?: string,
  overrides: Partial<DrillMapPoint> = {},
): DrillMapPoint {
  return {
    id: overrides.id ?? `h${++idSeq}`,
    panelId,
    position: [24, y, 0],
    normal: [0, 0, -1],
    diameter: 15,
    depth: 13.5,
    purpose: 'MINIFIX',
    componentType: 'HOUSING',
    status: 'VALID',
    pairedHoleId,
    ...overrides,
  } as DrillMapPoint;
}

function bolt(
  panelId: string,
  y: number,
  overrides: Partial<DrillMapPoint> = {},
): DrillMapPoint {
  return {
    id: overrides.id ?? `b${++idSeq}`,
    panelId,
    position: [0, y, 9],
    normal: [1, 0, 0],
    diameter: 10,
    depth: 17.5,
    purpose: 'BOLT',
    componentType: 'BOLT',
    status: 'VALID',
    ...overrides,
  } as DrillMapPoint;
}

function makeDrillMap(pointsByPanel: Record<string, DrillMapPoint[]>): DrillMap {
  return {
    version: 'test',
    panels: Object.entries(pointsByPanel).map(([panelId, points]) => ({
      panelId,
      role: panelId,
      dimensions: { width: 600, height: 720, thickness: 18 },
      worldPosition: [0, 0, 0],
      worldRotation: [0, 0, 0],
      points,
    })),
  } as unknown as DrillMap;
}

/** joint มาตรฐาน: 2 คู่ cam↔bolt ระหว่าง SIDE กับ SHELF ห่างกัน 96mm */
function standardJoint(): DrillMap {
  const b1 = bolt('SHELF', 37, { id: 'b1' });
  const b2 = bolt('SHELF', 133, { id: 'b2' });
  const h1 = housing('SIDE', 37, 'b1', { id: 'h1' });
  const h2 = housing('SIDE', 133, 'b2', { id: 'h2' });
  return makeDrillMap({ SIDE: [h1, h2], SHELF: [b1, b2] });
}

// ============================================
// TESTS
// ============================================

describe('groupJoints', () => {
  it('groups housings per panel pair via pairedHoleId', () => {
    const { joints } = groupJoints(standardJoint());
    expect(joints).toHaveLength(1);
    expect(joints[0].housings).toHaveLength(2);
    expect([joints[0].panelA, joints[0].panelB].sort()).toEqual(['SHELF', 'SIDE']);
  });
});

describe('positionsAlongJoint', () => {
  it('picks the axis with maximum spread and sorts values', () => {
    const pts = [housing('P', 133), housing('P', 37), housing('P', 69)];
    expect(positionsAlongJoint(pts)).toEqual([37, 69, 133]);
  });
});

describe('runConnectorOsAudit', () => {
  it('passes clean standard joint without rule-of-two/spacing findings', () => {
    const result = runConnectorOsAudit(standardJoint());
    expect(result.status).toBe('PASS');
    expect(result.summary.jointsAudited).toBe(1);
    expect(result.issues.filter(i => i.code === 'G11_RULE_OF_TWO')).toHaveLength(0);
    expect(result.issues.filter(i => i.code === 'G11_MAX_SPACING')).toHaveLength(0);
    expect(result.issues.filter(i => i.code === 'G11_SPEC_PARITY')).toHaveLength(0);
  });

  it('flags Rule of Two when a joint has a single connector', () => {
    const b1 = bolt('SHELF', 37, { id: 'b1' });
    const h1 = housing('SIDE', 37, 'b1', { id: 'h1' });
    const result = runConnectorOsAudit(makeDrillMap({ SIDE: [h1], SHELF: [b1] }));
    const found = result.issues.filter(i => i.code === 'G11_RULE_OF_TWO');
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('WARNING');
  });

  it('flags load spacing when gap exceeds STANDARD max 128mm', () => {
    const b1 = bolt('SHELF', 37, { id: 'b1' });
    const b2 = bolt('SHELF', 300, { id: 'b2' });
    const h1 = housing('SIDE', 37, 'b1', { id: 'h1' });
    const h2 = housing('SIDE', 300, 'b2', { id: 'h2' });
    const result = runConnectorOsAudit(makeDrillMap({ SIDE: [h1, h2], SHELF: [b1, b2] }));
    const found = result.issues.filter(i => i.code === 'G11_MAX_SPACING');
    expect(found).toHaveLength(1);
    expect(found[0].measured?.gapMm).toBe(263);
  });

  it('uses tighter HEAVY load limit (96mm)', () => {
    const b1 = bolt('SHELF', 37, { id: 'b1' });
    const b2 = bolt('SHELF', 150, { id: 'b2' });
    const h1 = housing('SIDE', 37, 'b1', { id: 'h1' });
    const h2 = housing('SIDE', 150, 'b2', { id: 'h2' });
    const dm = makeDrillMap({ SIDE: [h1, h2], SHELF: [b1, b2] });
    expect(runConnectorOsAudit(dm, 'STANDARD').issues.filter(i => i.code === 'G11_MAX_SPACING')).toHaveLength(0);
    expect(runConnectorOsAudit(dm, 'HEAVY').issues.filter(i => i.code === 'G11_MAX_SPACING')).toHaveLength(1);
  });

  it('reports spec parity drift aggregated (not per hole)', () => {
    // สมมุติเจาะคลาด: CAM depth 12.5 (ควร 13.5) + BOLT dia 8 (sleeve ต้อง 10)
    const b1 = bolt('SHELF', 37, { id: 'b1', diameter: 8 });
    const b2 = bolt('SHELF', 133, { id: 'b2', diameter: 8 });
    const h1 = housing('SIDE', 37, 'b1', { id: 'h1', depth: 12.5 });
    const h2 = housing('SIDE', 133, 'b2', { id: 'h2', depth: 12.5 });
    const result = runConnectorOsAudit(makeDrillMap({ SIDE: [h1, h2], SHELF: [b1, b2] }));
    const parity = result.issues.filter(i => i.code === 'G11_SPEC_PARITY');
    // 2 มิติ drift (CAM depth, BOLT dia) → 2 findings รวมยอด ไม่ใช่ 4 รายรู
    expect(parity).toHaveLength(2);
    const camDepth = parity.find(i => i.measured?.expectedMm === 13.5);
    expect(camDepth?.measured?.points).toBe(2);
    const boltDia = parity.find(i => i.measured?.expectedMm === 10);
    expect(boltDia?.measured?.actualMm).toBe(8);
  });

  it('suggests placer count via G11_UNDER_CONNECTED for a long sparse joint', () => {
    // span 384mm (~464mm joint) มีแค่ 2 ตัว — placer แนะนำมากกว่า แต่ gap 384 > 128 ด้วย
    const b1 = bolt('SHELF', 37, { id: 'b1' });
    const b2 = bolt('SHELF', 421, { id: 'b2' });
    const h1 = housing('SIDE', 37, 'b1', { id: 'h1' });
    const h2 = housing('SIDE', 421, 'b2', { id: 'h2' });
    const result = runConnectorOsAudit(makeDrillMap({ SIDE: [h1, h2], SHELF: [b1, b2] }));
    const under = result.issues.filter(i => i.code === 'G11_UNDER_CONNECTED');
    expect(under).toHaveLength(1);
    expect(under[0].severity).toBe('INFO');
    expect(Number(under[0].measured?.recommended)).toBeGreaterThan(2);
  });

  it('handles null drill map', () => {
    const result = runConnectorOsAudit(null);
    expect(result.status).toBe('PASS');
    expect(result.summary.jointsAudited).toBe(0);
  });
});

describe('ADR-061: density profile severity', () => {
  function sparseJoint() {
    const b1 = bolt('SHELF', 37, { id: 'db1' });
    const b2 = bolt('SHELF', 300, { id: 'db2' });
    const h1 = housing('SIDE', 37, 'db1', { id: 'dh1' });
    const h2 = housing('SIDE', 300, 'db2', { id: 'dh2' });
    return makeDrillMap({ SIDE: [h1, h2], SHELF: [b1, b2] });
  }

  it('AWI_PREMIUM (default): gap เกิน = WARNING', () => {
    const result = runConnectorOsAudit(sparseJoint(), 'STANDARD', 'AWI_PREMIUM');
    const found = result.issues.filter(i => i.code === 'G11_MAX_SPACING');
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('WARNING');
  });

  it('CAD_STANDARD (ผู้ใช้เลือกประหยัด): gap เกิน = INFO พร้อมบอกว่าเป็น profile ที่เลือก', () => {
    const result = runConnectorOsAudit(sparseJoint(), 'STANDARD', 'CAD_STANDARD');
    const found = result.issues.filter(i => i.code === 'G11_MAX_SPACING');
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('INFO');
    expect(found[0].message).toContain('มาตรฐาน CAD');
  });
});
