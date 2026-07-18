/**
 * dxfZipG10Block.test.ts — S18 l5-cnc-safety Slice 2 + Slice 3 (DXF zip)
 *
 * ADR-065 red-line guard: no DXF may reach the machine when G10 FAILs.
 *
 * Locks:
 *  - PanelDxfResult.safeDxf is absent when G10 fails (no `as SafeDxf` cast)
 *  - buildDxfZipFromPacket refuses to build the ZIP when any panel fails G10,
 *    with an error naming the failing panel
 *  - ZIP content uses the G10-branded SafeDxf, never raw content
 *  - Slice 3: DXF zip carries NOT_FOR_PRODUCTION.txt + NFP- filename prefix
 *    while SHADOW_MODE is on
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import type {
    FactoryPacket,
    PacketDrillMap,
    PacketManifest,
} from '../../../factory/packet/types';
import {
    SHADOW_MODE_NOT_FOR_PRODUCTION,
    NOT_FOR_PRODUCTION_FILE,
} from '../../config/shadowMode';

// Mock ONLY assertDxfSafety (keep the rest of the gate real) so tests can
// force a G10 FAIL deterministically without weakening provenance logic.
vi.mock('../../gate/gate10DxfSafety', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../gate/gate10DxfSafety')>();
    return {
        ...actual,
        assertDxfSafety: vi.fn(actual.assertDxfSafety),
    };
});

import { assertDxfSafety } from '../../gate/gate10DxfSafety';
import {
    exportDxfFromPacket,
    buildDxfZipFromPacket,
} from '../dxfExportFromOperationGraph';

const mockAssertDxfSafety = vi.mocked(assertDxfSafety);

// ============================================
// FIXTURES
// ============================================

function createManifest(): PacketManifest {
    return {
        schema: 'monolith.factory.packet@1.0',
        version: '1.0.0',
        jobId: 'job-g10-block',
        projectId: 'proj-g10',
        createdAt: '2026-01-01T00:00:00Z',
        toolVersion: 'test@1.0.0',
        files: [],
        contentHash: 'sha256-test-g10',
    };
}

function createDrillMap(): PacketDrillMap {
    return {
        version: 'drillmap.v1',
        panels: [
            {
                panelId: 'panel-g10-left',
                cabinetId: 'cab-1',
                role: 'LEFT_SIDE',
                dimensions: [600, 800, 18],
                points: [
                    {
                        id: 'pt-1',
                        panelId: 'panel-g10-left',
                        position: [100, 100, 0],
                        normal: [0, 0, 1],
                        diameter: 5,
                        depth: 13,
                        throughHole: false,
                        purpose: 'SHELF_PIN',
                        face: 'A',
                    },
                ],
            },
        ],
        summary: { totalDrills: 1, totalBores: 0, byPurpose: { SHELF_PIN: 1 }, byDiameter: { '5': 1 } },
        tools: [],
    };
}

function createPacket(): FactoryPacket {
    return {
        manifest: createManifest(),
        drillMap: createDrillMap(),
        connectors: {
            version: 'connectors.v1',
            minifix: [],
            summary: { totalPairs: 0, validPairs: 0, warningPairs: 0, errorPairs: 0 },
        },
        cutList: {
            version: 'cutlist.v1',
            rows: [],
            summary: { totalRows: 0, totalParts: 0, byMaterial: {} },
        },
        gateResult: {
            version: 'gate.v1',
            policyVersion: '1.0.0',
            passed: true,
            runAt: '2026-01-01T00:00:00Z',
            findings: { blockers: [], warnings: [], info: [] },
            summary: { blockerCount: 0, warningCount: 0, infoCount: 0 },
        },
    };
}

const G10_FAIL_RESULT = {
    ok: false as const,
    issues: [
        {
            code: 'INVALID_CONTENT' as const,
            message: 'forced G10 failure (test)',
            severity: 'BLOCK' as const,
        },
    ],
};

beforeEach(() => {
    // Each test binds the implementation it needs (forced FAIL or the actual gate)
    mockAssertDxfSafety.mockReset();
});

// ============================================
// Slice 2 — safeDxf must not be forged on FAIL
// ============================================

describe('exportDxfFromPacket — G10 FAIL leaves no forged SafeDxf', () => {
    it('panel failing G10 has no safeDxf (cast removed)', async () => {
        mockAssertDxfSafety.mockReturnValue(G10_FAIL_RESULT as never);

        const result = await exportDxfFromPacket(createPacket(), { machineId: 'KDT' });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.g10Status.allPassed).toBe(false);
            expect(result.panels[0].g10Result.ok).toBe(false);
            expect(result.panels[0].safeDxf).toBeUndefined();
        }
    });

    it('panel passing G10 has branded safeDxf equal to content', async () => {
        const actual = await vi.importActual<typeof import('../../gate/gate10DxfSafety')>(
            '../../gate/gate10DxfSafety'
        );
        mockAssertDxfSafety.mockImplementation(actual.assertDxfSafety);

        const result = await exportDxfFromPacket(createPacket(), { machineId: 'KDT' });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.g10Status.allPassed).toBe(true);
            expect(result.panels[0].safeDxf).toBe(result.panels[0].content);
        }
    });
});

// ============================================
// Slice 2 — ZIP build must be blocked on G10 FAIL
// ============================================

describe('buildDxfZipFromPacket — blocks download when G10 FAILs', () => {
    it('rejects with an error naming the failing panel', async () => {
        mockAssertDxfSafety.mockReturnValue(G10_FAIL_RESULT as never);

        await expect(
            buildDxfZipFromPacket(createPacket(), { machineId: 'KDT' })
        ).rejects.toThrow(/G10.*panel-g10-left|panel-g10-left.*G10/);
    });

    it('builds the ZIP when all panels pass G10', async () => {
        const actual = await vi.importActual<typeof import('../../gate/gate10DxfSafety')>(
            '../../gate/gate10DxfSafety'
        );
        mockAssertDxfSafety.mockImplementation(actual.assertDxfSafety);

        const zip = await buildDxfZipFromPacket(createPacket(), { machineId: 'KDT' });

        expect(zip.zipBytes.length).toBeGreaterThan(0);
        const loaded = await JSZip.loadAsync(new Uint8Array(zip.zipBytes));
        const dxfEntry = loaded.file('DXF/LEFT_SIDE_KDT.dxf');
        expect(dxfEntry).toBeTruthy();
    });
});

// ============================================
// Slice 2 — genuine gate failure, end to end (no mocked verdict)
// ============================================

describe('buildDxfZipFromPacket — genuinely failing content blocks the zip (no mocked verdict)', () => {
    /**
     * Reviewer follow-up: the FAIL paths above force the G10 verdict via mock.
     * This case drives the REAL gates end-to-end: a drill placed outside the
     * panel outline (x=5000 on a 600mm panel) must be blocked by the semantic
     * gate (G10.2 DRILL_INSIDE_OUTLINE) and refuse the zip — no forced verdict
     * anywhere in the chain.
     */
    function createOutOfOutlinePacket(): FactoryPacket {
        const packet = createPacket();
        packet.drillMap.panels[0].points[0] = {
            ...packet.drillMap.panels[0].points[0],
            id: 'pt-outside',
            position: [5000, 100, 0], // far outside the 600x800 panel outline
        };
        return packet;
    }

    it('export reports the panel as genuinely gate-blocked', async () => {
        const actual = await vi.importActual<typeof import('../../gate/gate10DxfSafety')>(
            '../../gate/gate10DxfSafety'
        );
        mockAssertDxfSafety.mockImplementation(actual.assertDxfSafety);

        const result = await exportDxfFromPacket(createOutOfOutlinePacket(), { machineId: 'KDT' });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.g10Status.allPassed).toBe(false);
            const panel = result.panels[0];
            // The REAL semantic gate produced the block — not a mocked verdict
            expect(panel.semanticResult.blocked).toBe(true);
            expect(
                panel.semanticResult.issues.some(
                    (i) => i.rule === 'DRILL_INSIDE_OUTLINE' && i.severity === 'BLOCK'
                )
            ).toBe(true);
        }
    });

    it('refuses the ZIP naming the failing panel and gate', async () => {
        const actual = await vi.importActual<typeof import('../../gate/gate10DxfSafety')>(
            '../../gate/gate10DxfSafety'
        );
        mockAssertDxfSafety.mockImplementation(actual.assertDxfSafety);

        await expect(
            buildDxfZipFromPacket(createOutOfOutlinePacket(), { machineId: 'KDT' })
        ).rejects.toThrow(/panel-g10-left.*G10\.2|G10\.2.*panel-g10-left/);
    });
});

// ============================================
// Slice 3 — DXF zip NFP labels while SHADOW_MODE
// ============================================

describe('buildDxfZipFromPacket — NOT-FOR-PRODUCTION labels (ADR-065 Q3)', () => {
    it('shadow mode is on during dogfood', () => {
        expect(SHADOW_MODE_NOT_FOR_PRODUCTION).toBe(true);
    });

    it('filename starts with NFP- while shadow mode is on', async () => {
        const actual = await vi.importActual<typeof import('../../gate/gate10DxfSafety')>(
            '../../gate/gate10DxfSafety'
        );
        mockAssertDxfSafety.mockImplementation(actual.assertDxfSafety);

        const zip = await buildDxfZipFromPacket(createPacket(), { machineId: 'KDT' });

        expect(zip.filename).toMatch(/^NFP-DXF_/);
    });

    it('zip contains NOT_FOR_PRODUCTION.txt with the bilingual notice', async () => {
        const actual = await vi.importActual<typeof import('../../gate/gate10DxfSafety')>(
            '../../gate/gate10DxfSafety'
        );
        mockAssertDxfSafety.mockImplementation(actual.assertDxfSafety);

        const zip = await buildDxfZipFromPacket(createPacket(), { machineId: 'KDT' });

        const loaded = await JSZip.loadAsync(new Uint8Array(zip.zipBytes));
        const nfpEntry = loaded.file(NOT_FOR_PRODUCTION_FILE);
        expect(nfpEntry).toBeTruthy();

        const text = await nfpEntry!.async('string');
        expect(text).toContain('ห้ามใช้ตัดชิ้นงานจริง');
        expect(text).toContain('Do NOT cut real workpieces');
    });
});
