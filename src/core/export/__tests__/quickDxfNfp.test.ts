/**
 * quickDxfNfp.test.ts — S18 l5-cnc-safety fix round (reviewer finding)
 *
 * Escape route: the quick DXF path (GateToolbar → quickDxfExport/All →
 * cabinetToDxf) ships zips with NO G10 gate and NO NOT_FOR_PRODUCTION label,
 * bypassing the Slice 2/3 guards. ExportPanel falls back to this path when the
 * OperationGraph is not ready.
 *
 * This slice closes the LABEL half within lane write-scope: every zip built
 * by the quick path carries NOT_FOR_PRODUCTION.txt and an NFP- filename
 * prefix while SHADOW_MODE is on (ADR-065 Q3), same convention as
 * buildDxfZipFromPacket. The G10 gating of this legacy geometry path is a
 * separate follow-up slice (needs UI callers outside this lane's scope).
 *
 * Locks:
 *  - buildCabinetDxfZip: NFP- prefixed filename + NOT_FOR_PRODUCTION.txt
 *  - buildAllCabinetsDxfZip: same for the all-cabinets zip
 *  - DXF entries themselves still present (labels are additive)
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildCabinetDxfZip } from '../cabinetToDxf';
import { buildAllCabinetsDxfZip } from '../exportPipeline';
import {
  SHADOW_MODE_NOT_FOR_PRODUCTION,
  NOT_FOR_PRODUCTION_FILE,
} from '../../config/shadowMode';
import type { Cabinet } from '../../types/Cabinet';

// ============================================
// FIXTURES
// ============================================

/** Minimal cabinet with a SHELF panel (no drilling patterns needed) */
function createCabinet(name: string): Cabinet {
  return {
    id: `cab-${name}`,
    name,
    dimensions: { width: 600, height: 720, depth: 560, toeKickHeight: 100 },
    structure: { hasBackPanel: false },
    manufacturing: { backVoid: 20, backThickness: 6, grooveDepth: 10 },
    panels: [
      {
        id: `panel-shelf-${name}`,
        name: 'Shelf',
        role: 'SHELF',
        visible: true,
        finishWidth: 560,
        finishHeight: 500,
        computed: { cutWidth: 560, cutHeight: 500, realThickness: 18 },
        coreMaterialId: 'MAT_MDF_18',
        grainDirection: 'VERTICAL',
        faces: { faceA: null, faceB: null },
        edges: { left: null, right: null, top: null, bottom: null },
      },
    ],
  } as unknown as Cabinet;
}

// ============================================
// Per-cabinet quick DXF zip
// ============================================

describe('buildCabinetDxfZip — NOT-FOR-PRODUCTION labels (ADR-065 Q3)', () => {
  it('shadow mode is on during dogfood', () => {
    expect(SHADOW_MODE_NOT_FOR_PRODUCTION).toBe(true);
  });

  it('filename starts with NFP- while shadow mode is on', async () => {
    const zip = await buildCabinetDxfZip(createCabinet('CabA'));

    expect(zip.filename).toMatch(/^NFP-CabA_DXF\.zip$/);
  });

  it('zip contains NOT_FOR_PRODUCTION.txt with the bilingual notice', async () => {
    const zip = await buildCabinetDxfZip(createCabinet('CabA'));

    const loaded = await JSZip.loadAsync(new Uint8Array(zip.zipBytes));
    const nfpEntry = loaded.file(NOT_FOR_PRODUCTION_FILE);
    expect(nfpEntry).toBeTruthy();

    const text = await nfpEntry!.async('string');
    expect(text).toContain('ห้ามใช้ตัดชิ้นงานจริง');
    expect(text).toContain('Do NOT cut real workpieces');
  });

  it('DXF entries are still present (labels are additive)', async () => {
    const zip = await buildCabinetDxfZip(createCabinet('CabA'));

    const loaded = await JSZip.loadAsync(new Uint8Array(zip.zipBytes));
    const dxfEntries = Object.keys(loaded.files).filter((f) => f.endsWith('.dxf'));
    expect(dxfEntries.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================================
// All-cabinets quick DXF zip
// ============================================

describe('buildAllCabinetsDxfZip — NOT-FOR-PRODUCTION labels (ADR-065 Q3)', () => {
  it('filename starts with NFP- while shadow mode is on', async () => {
    const zip = await buildAllCabinetsDxfZip([createCabinet('CabA'), createCabinet('CabB')]);

    expect(zip.filename).toMatch(/^NFP-All_Cabinets_DXF\.zip$/);
  });

  it('zip contains NOT_FOR_PRODUCTION.txt and DXF entries for every cabinet', async () => {
    const zip = await buildAllCabinetsDxfZip([createCabinet('CabA'), createCabinet('CabB')]);

    const loaded = await JSZip.loadAsync(new Uint8Array(zip.zipBytes));
    const nfpEntry = loaded.file(NOT_FOR_PRODUCTION_FILE);
    expect(nfpEntry).toBeTruthy();

    const text = await nfpEntry!.async('string');
    expect(text).toContain('ห้ามใช้ตัดชิ้นงานจริง');

    const dxfEntries = Object.keys(loaded.files).filter((f) => f.endsWith('.dxf'));
    expect(dxfEntries.some((f) => f.startsWith('CabA/'))).toBe(true);
    expect(dxfEntries.some((f) => f.startsWith('CabB/'))).toBe(true);
  });
});
