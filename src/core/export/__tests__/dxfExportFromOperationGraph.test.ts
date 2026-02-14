/**
 * dxfExportFromOperationGraph.test.ts - Unit tests for DXF Export via OperationGraph
 *
 * Tests the bridge between FactoryPacket → OperationGraph → DXF
 * Ensures AGENT-T008 compliance: manufacturing intent as source of truth
 *
 * @version 1.0.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    exportDxfFromPacket,
    canExportDxfFromOperationGraph,
    type DxfExportOptions,
} from '../dxfExportFromOperationGraph';
import type {
    FactoryPacket,
    PacketDrillMap,
    PacketDrillPanel,
    PacketDrillPoint,
    PacketManifest,
    PacketConnectors,
    PacketCutList,
    PacketGateResult,
} from '../../../factory/packet/types';

// ============================================
// MOCK SETUP
// ============================================

// Mock the buildOperationGraph module
vi.mock('../../../cnc/mapping/buildOperationGraph', () => ({
    buildOperationGraph: vi.fn(),
    hasBuildErrors: vi.fn(),
}));

// Mock getMachineProfile
vi.mock('../../../cnc/machine', () => ({
    getMachineProfile: vi.fn(),
}));

import { buildOperationGraph, hasBuildErrors } from '../../../cnc/mapping/buildOperationGraph';
import { getMachineProfile } from '../../../cnc/machine';

const mockBuildOperationGraph = vi.mocked(buildOperationGraph);
const mockHasBuildErrors = vi.mocked(hasBuildErrors);
const mockGetMachineProfile = vi.mocked(getMachineProfile);

// ============================================
// FIXTURES
// ============================================

function createMockDrillPoint(overrides: Partial<PacketDrillPoint> = {}): PacketDrillPoint {
    return {
        id: 'drill-point-1',
        panelId: 'panel-left-side',
        position: [100, 50, 0],
        normal: [0, 0, -1],
        diameter: 5,
        depth: 10,
        throughHole: false,
        purpose: 'SYSTEM32',
        face: 'TOP',
        ...overrides,
    };
}

function createMockDrillPanel(overrides: Partial<PacketDrillPanel> = {}): PacketDrillPanel {
    return {
        panelId: 'panel-left-side',
        cabinetId: 'cabinet-1',
        role: 'LEFT_SIDE',
        dimensions: [600, 800, 18], // [w, h, t]
        points: [createMockDrillPoint()],
        ...overrides,
    };
}

function createMockDrillMap(overrides: Partial<PacketDrillMap> = {}): PacketDrillMap {
    return {
        version: 'drillmap.v1',
        panels: [createMockDrillPanel()],
        summary: {
            totalDrills: 1,
            totalBores: 0,
            byPurpose: { SYSTEM32: 1 },
            byDiameter: { '5': 1 },
        },
        tools: [
            { toolId: 'DRILL_5', name: 'Drill 5mm', diameter: 5, type: 'DRILL', usageCount: 1 },
        ],
        ...overrides,
    };
}

function createMockManifest(overrides: Partial<PacketManifest> = {}): PacketManifest {
    return {
        schema: 'monolith.factory.packet@1.0',
        version: '1.0.0',
        jobId: 'job-test-001',
        projectId: 'project-1',
        createdAt: new Date().toISOString(),
        toolVersion: 'MONOLITH Designer 1.0.0',
        files: [],
        contentHash: 'sha256-test',
        ...overrides,
    };
}

function createMockConnectors(): PacketConnectors {
    return {
        version: 'connectors.v1',
        minifix: [],
        summary: {
            totalPairs: 0,
            validPairs: 0,
            warningPairs: 0,
            errorPairs: 0,
        },
    };
}

function createMockCutList(): PacketCutList {
    return {
        version: 'cutlist.v1',
        rows: [],
        summary: {
            totalRows: 0,
            totalParts: 0,
            byMaterial: {},
        },
    };
}

function createMockGateResult(): PacketGateResult {
    return {
        version: 'gate.v1',
        policyVersion: '1.0.0',
        passed: true,
        runAt: new Date().toISOString(),
        findings: {
            blockers: [],
            warnings: [],
            info: [],
        },
        summary: {
            blockerCount: 0,
            warningCount: 0,
            infoCount: 0,
        },
    };
}

function createMockFactoryPacket(overrides: Partial<FactoryPacket> = {}): FactoryPacket {
    return {
        manifest: createMockManifest(),
        drillMap: createMockDrillMap(),
        connectors: createMockConnectors(),
        cutList: createMockCutList(),
        gateResult: createMockGateResult(),
        ...overrides,
    };
}

function createMockMachineProfile() {
    return {
        id: 'KDT-6000',
        name: 'KDT 6000',
        manufacturer: 'KDT',
        maxWidth: 3000,
        maxHeight: 1300,
        tools: [],
        defaultFeedRate: 5000,
        defaultSpindleSpeed: 18000,
    };
}

function createMockOperationGraph() {
    return {
        machineId: 'KDT-6000',
        safeZ: 50,
        rapidZ: 100,
        operations: [
            {
                id: 'op-1',
                type: 'DRILL',
                toolId: 'DRILL_5',
                position: { x: 100, y: 50, z: 0 },
                depth: 10,
                throughHole: false,
                sourceId: 'drill-point-1',
                workpieceContext: {
                    panelId: 'panel-left-side',
                    face: 'TOP',
                    appliedOffset: { x: 0, y: 0, z: 0 },
                },
            },
        ],
        metadata: {
            jobId: 'job-test-001',
            panelId: 'panel-left-side',
            sourceContentHash: 'sha256-test',
            builtAt: new Date().toISOString(),
            toolVersion: '1.0.0',
        },
        toolsUsed: ['DRILL_5'],
    };
}

// ============================================
// TESTS: canExportDxfFromOperationGraph
// ============================================

describe('canExportDxfFromOperationGraph', () => {
    it('returns available: true for valid packet', () => {
        const packet = createMockFactoryPacket();
        const result = canExportDxfFromOperationGraph(packet);

        expect(result.available).toBe(true);
        expect(result.reason).toBeUndefined();
    });

    it('returns available: false for null packet', () => {
        const result = canExportDxfFromOperationGraph(null);

        expect(result.available).toBe(false);
        expect(result.reason).toBe('No packet available');
    });

    it('returns available: false for packet without drillMap', () => {
        const packet = createMockFactoryPacket();
        // @ts-expect-error - testing invalid state
        packet.drillMap = undefined;

        const result = canExportDxfFromOperationGraph(packet);

        expect(result.available).toBe(false);
        expect(result.reason).toBe('Packet has no drill map');
    });

    it('returns available: false for packet with empty panels', () => {
        const packet = createMockFactoryPacket({
            drillMap: createMockDrillMap({ panels: [] }),
        });

        const result = canExportDxfFromOperationGraph(packet);

        expect(result.available).toBe(false);
        expect(result.reason).toBe('Packet has no panels');
    });
});

// ============================================
// TESTS: exportDxfFromPacket
// ============================================

describe('exportDxfFromPacket', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default mock implementations
        mockGetMachineProfile.mockReturnValue(createMockMachineProfile() as any);
        mockBuildOperationGraph.mockReturnValue({
            graph: createMockOperationGraph(),
            warnings: [],
            errors: [],
        } as any);
        mockHasBuildErrors.mockReturnValue(false);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('validation', () => {
        it('returns error for null packet', async () => {
            const result = await exportDxfFromPacket(null as any);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBe('No packet provided');
            }
        });

        it('returns error for packet without drillMap', async () => {
            const packet = createMockFactoryPacket();
            // @ts-expect-error - testing invalid state
            packet.drillMap = undefined;

            const result = await exportDxfFromPacket(packet);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBe('Packet has no drill map - cannot generate operations');
            }
        });

        it('returns error for unknown machine', async () => {
            mockGetMachineProfile.mockReturnValue(undefined as any);

            const packet = createMockFactoryPacket();
            const result = await exportDxfFromPacket(packet, { machineId: 'UNKNOWN' });

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBe('Unknown machine: UNKNOWN');
            }
        });
    });

    describe('operation graph building', () => {
        it('returns error when buildOperationGraph fails', async () => {
            mockHasBuildErrors.mockReturnValue(true);
            mockBuildOperationGraph.mockReturnValue({
                graph: null,
                warnings: [],
                errors: ['Tool not found: DRILL_99'],
            } as any);

            const packet = createMockFactoryPacket();
            const result = await exportDxfFromPacket(packet);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBe('Failed to build OperationGraph');
                expect(result.details).toContain('Tool not found: DRILL_99');
            }
        });

        it('calls buildOperationGraph with correct arguments', async () => {
            const packet = createMockFactoryPacket();
            await exportDxfFromPacket(packet, { machineId: 'KDT-6000' });

            expect(mockBuildOperationGraph).toHaveBeenCalledWith(
                packet,
                expect.objectContaining({ id: 'KDT-6000' })
            );
        });
    });

    describe('successful export', () => {
        it('returns ok: true with panel results', async () => {
            const packet = createMockFactoryPacket();
            const result = await exportDxfFromPacket(packet);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.panels).toHaveLength(1);
                expect(result.machineId).toBe('KDT-6000');
                expect(result.totalOperations).toBeGreaterThanOrEqual(0);
            }
        });

        it('generates correct filename from panel role', async () => {
            const packet = createMockFactoryPacket({
                drillMap: createMockDrillMap({
                    panels: [createMockDrillPanel({ role: 'LEFT_SIDE' })],
                }),
            });

            const result = await exportDxfFromPacket(packet, { machineId: 'KDT-6000' });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.panels[0].filename).toBe('LEFT_SIDE_KDT-6000.dxf');
            }
        });

        it('includes DXF content in result', async () => {
            const packet = createMockFactoryPacket();
            const result = await exportDxfFromPacket(packet);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.panels[0].content).toContain('SECTION');
                expect(result.panels[0].content).toContain('EOF');
            }
        });

        it('includes validation result for each panel', async () => {
            const packet = createMockFactoryPacket();
            const result = await exportDxfFromPacket(packet);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.panels[0].validation).toHaveProperty('valid');
                expect(result.panels[0].validation).toHaveProperty('errors');
                expect(result.panels[0].validation).toHaveProperty('warnings');
            }
        });
    });

    describe('panel filtering', () => {
        it('exports all panels when selectedPanelIds is empty', async () => {
            const packet = createMockFactoryPacket({
                drillMap: createMockDrillMap({
                    panels: [
                        createMockDrillPanel({ panelId: 'panel-1', role: 'LEFT' }),
                        createMockDrillPanel({ panelId: 'panel-2', role: 'RIGHT' }),
                    ],
                }),
            });

            const result = await exportDxfFromPacket(packet);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.panels).toHaveLength(2);
            }
        });

        it('exports only selected panels when selectedPanelIds is provided', async () => {
            const packet = createMockFactoryPacket({
                drillMap: createMockDrillMap({
                    panels: [
                        createMockDrillPanel({ panelId: 'panel-1', role: 'LEFT' }),
                        createMockDrillPanel({ panelId: 'panel-2', role: 'RIGHT' }),
                    ],
                }),
            });

            const result = await exportDxfFromPacket(packet, {
                selectedPanelIds: ['panel-1'],
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.panels).toHaveLength(1);
                expect(result.panels[0].panelId).toBe('panel-1');
            }
        });

        it('returns error when no panels match selection', async () => {
            const packet = createMockFactoryPacket();
            const result = await exportDxfFromPacket(packet, {
                selectedPanelIds: ['non-existent-panel'],
            });

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBe('No panels to export');
            }
        });
    });

    describe('progress callback', () => {
        it('calls onPanelProgress for each panel', async () => {
            const onPanelProgress = vi.fn();
            const packet = createMockFactoryPacket({
                drillMap: createMockDrillMap({
                    panels: [
                        createMockDrillPanel({ panelId: 'panel-1', role: 'LEFT' }),
                        createMockDrillPanel({ panelId: 'panel-2', role: 'RIGHT' }),
                    ],
                }),
            });

            await exportDxfFromPacket(packet, { onPanelProgress });

            expect(onPanelProgress).toHaveBeenCalledTimes(2);
            expect(onPanelProgress).toHaveBeenNthCalledWith(1, 'panel-1', 'LEFT', 1, 2);
            expect(onPanelProgress).toHaveBeenNthCalledWith(2, 'panel-2', 'RIGHT', 2, 2);
        });
    });

    describe('DXF content', () => {
        it('includes INSUNITS for millimeters', async () => {
            const packet = createMockFactoryPacket();
            const result = await exportDxfFromPacket(packet);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.panels[0].content).toContain('$INSUNITS');
            }
        });

        it('includes panel outline when includeOutline is enabled', async () => {
            const packet = createMockFactoryPacket();
            const result = await exportDxfFromPacket(packet, {
                includeOutline: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.panels[0].content).toContain('OUTLINE');
            }
        });

        it('includes metadata when includeMetadata is enabled', async () => {
            const packet = createMockFactoryPacket();
            const result = await exportDxfFromPacket(packet, {
                includeMetadata: true,
            });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.panels[0].content).toContain('Machine:');
            }
        });
    });

    describe('warnings', () => {
        it('includes warnings from buildOperationGraph', async () => {
            mockBuildOperationGraph.mockReturnValue({
                graph: createMockOperationGraph(),
                warnings: ['Tool wear approaching limit'],
                errors: [],
            } as any);

            const packet = createMockFactoryPacket();
            const result = await exportDxfFromPacket(packet);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.warnings).toContain('Tool wear approaching limit');
            }
        });
    });
});
