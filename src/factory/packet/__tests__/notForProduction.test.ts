/**
 * notForProduction.test.ts — ADR-065 Q3: shadow-mode NOT-FOR-PRODUCTION label
 *
 * ล็อกพฤติกรรมช่วง dogfood (S17 ยังไม่ปิด):
 *  - packet มีไฟล์ NOT_FOR_PRODUCTION.txt และเข้า manifest อย่างถูกต้อง (มี hash)
 *  - ไฟล์ป้ายนับใน contentHash — แก้/ถอดป้ายแล้ว hash เปลี่ยน
 *  - ชื่อไฟล์ zip ขึ้นต้น NFP-
 *
 * เมื่อ gate "ตัดจริง" ผ่าน (ปิด SHADOW_MODE_NOT_FOR_PRODUCTION) เทสต์นี้ต้องถูก
 * ปรับพร้อมกันโดยเจตนา — ห้ามลบเงียบ ๆ (fail-visible ตามธรรมนูญโปรเจกต์)
 */

import { describe, it, expect } from 'vitest';
import { buildFactoryPacket } from '../buildFactoryPacket';
import { createZipBundle } from '../zipBundle';
import {
  SHADOW_MODE_NOT_FOR_PRODUCTION,
  NOT_FOR_PRODUCTION_FILE,
  NOT_FOR_PRODUCTION_NOTICE,
} from '../../../core/config/shadowMode';
import type { Cabinet } from '../../../core/types/Cabinet';

function createMockCabinet(): Cabinet {
  return {
    id: 'cab-001',
    name: 'Base Cabinet',
    dimensions: { width: 600, height: 720, depth: 560 },
    type: 'BASE',
    panels: [
      {
        id: 'panel-001',
        name: 'Left Side',
        role: 'LEFT_SIDE',
        visible: true,
        finishWidth: 600,
        finishHeight: 720,
        computed: { realThickness: 18 },
        coreMaterialId: 'MAT_MDF_18',
        grainDirection: 'VERTICAL',
        edges: { left: null, right: 'EDGE_1MM', top: null, bottom: null },
      },
    ],
    compartments: [],
    materials: { coreId: 'MAT_MDF_18', surfaceId: null, edgingId: 'EDGE_1MM' },
  } as unknown as Cabinet;
}

const INPUT = { jobId: 'job-nfp-test', projectId: 'proj-nfp', toolVersion: 'test-1.0.0' };
const CONTEXT = { cabinets: [createMockCabinet()], drillMap: null, gateResult: null };

describe('ADR-065 Q3 — NOT-FOR-PRODUCTION shadow-mode label', () => {
  it('shadow mode เปิดอยู่ระหว่าง dogfood (ปิดได้เฉพาะเมื่อ gate ตัดจริงผ่านครบสี่เงื่อนไข)', () => {
    expect(SHADOW_MODE_NOT_FOR_PRODUCTION).toBe(true);
  });

  it('packet มีไฟล์ป้าย + เข้า manifest พร้อม hash (ไม่สะดุด extra-files check)', async () => {
    const output = await buildFactoryPacket(INPUT, CONTEXT);

    // ไฟล์ป้ายอยู่ใน files map
    expect(output.files[NOT_FOR_PRODUCTION_FILE]).toBe(NOT_FOR_PRODUCTION_NOTICE);

    // และมี entry ใน manifest (path + sha256) — verifier จะเช็คได้ปกติ
    const entry = output.packet.manifest.files.find(f => f.path === NOT_FOR_PRODUCTION_FILE);
    expect(entry).toBeDefined();
    expect(entry!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(entry!.sizeBytes).toBeGreaterThan(0);

    // ข้อความป้ายต้องประกาศห้ามตัดจริงทั้งไทย/อังกฤษ
    expect(NOT_FOR_PRODUCTION_NOTICE).toContain('ห้ามใช้ตัดชิ้นงานจริง');
    expect(NOT_FOR_PRODUCTION_NOTICE).toContain('Do NOT cut real workpieces');
  });

  it('ป้ายนับใน contentHash — ทุกไฟล์ใน manifest มีผลต่อ hash', async () => {
    const output = await buildFactoryPacket(INPUT, CONTEXT);
    const hashes = output.packet.manifest.files.map(f => f.sha256);
    const nfpEntry = output.packet.manifest.files.find(f => f.path === NOT_FOR_PRODUCTION_FILE)!;
    expect(hashes).toContain(nfpEntry.sha256);
  });

  it('ชื่อไฟล์ zip ขึ้นต้น NFP- ให้เห็นก่อนเปิด', async () => {
    const output = await buildFactoryPacket(INPUT, CONTEXT);
    const bundle = await createZipBundle(output);
    expect(bundle.filename).toMatch(/^NFP-factory-packet-/);
  });
});
