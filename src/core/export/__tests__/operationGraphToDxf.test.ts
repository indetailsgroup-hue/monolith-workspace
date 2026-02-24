/**
 * operationGraphToDxf.test.ts - Unit tests for OperationGraph to DXF converter
 *
 * AGENT-T008: DXF must be sourced from OperationGraph (manufacturing intent)
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
    operationGraphToDxf,
    getOperationGraphDxfStats,
    validateOperationGraphForDxf,
    operationGraphBatchToDxf,
} from '../operationGraphToDxf';
import type { OperationGraph, DrillOperation, BoreOperation, Operation } from '../../../cnc/operation/operationTypes';

// ============================================
// FIXTURES
// ============================================

function createMockOperationGraph(operations: Operation[] = []): OperationGraph {
    return {
        machineId: 'KDT-6000',
        safeZ: 50,
        rapidZ: 100,
        operations,
        metadata: {
            jobId: 'test-job-001',
            panelId: 'panel-left-side',
            sourceContentHash: 'sha256-abc123',
            builtAt: new Date().toISOString(),
            toolVersion: '1.0.0',
        },
        toolsUsed: ['DRILL_5', 'BORE_35'],
    };
}

function createDrillOperation(overrides: Partial<DrillOperation> = {}): DrillOperation {
    return {
        id: 'drill-1',
        type: 'DRILL',
        toolId: 'DRILL_5',
        position: { x: 100, y: 50, z: 0 },
        depth: 10,
        throughHole: false,
        sourceId: 'source-1',
        ...overrides,
    };
}

function createBoreOperation(overrides: Partial<BoreOperation> = {}): BoreOperation {
    return {
        id: 'bore-1',
        type: 'BORE',
        toolId: 'BORE_35',
        position: { x: 200, y: 100, z: 0 },
        diameter: 35,
        depth: 13,
        flatBottom: true,
        sourceId: 'source-2',
        ...overrides,
    };
}

// ============================================
// TESTS: operationGraphToDxf
// ============================================

describe('operationGraphToDxf', () => {
    describe('basic functionality', () => {
        it('generates valid DXF header', () => {
            const graph = createMockOperationGraph([createDrillOperation()]);
            const dxf = operationGraphToDxf(graph);

            expect(dxf).toContain('SECTION');
            expect(dxf).toContain('HEADER');
            expect(dxf).toContain('$ACADVER');
            expect(dxf).toContain('AC1015');
            expect(dxf).toContain('$INSUNITS');
            expect(dxf).toContain('EOF');
        });

        it('includes INSUNITS=4 for millimeters', () => {
            const graph = createMockOperationGraph([createDrillOperation()]);
            const dxf = operationGraphToDxf(graph);

            // INSUNITS group code 70, value 4 = millimeters
            expect(dxf).toContain('$INSUNITS');
            expect(dxf).toContain('70\n4');
        });

        it('generates correct layers for drill operations', () => {
            const graph = createMockOperationGraph([
                createDrillOperation({ toolId: 'DRILL_5', depth: 10 }),
                createDrillOperation({ toolId: 'DRILL_8', depth: 20, id: 'drill-2' }),
            ]);
            const dxf = operationGraphToDxf(graph);

            // Layer format: DRILL_{diameter}_D{depth}
            expect(dxf).toContain('DRILL_5_D10');
            expect(dxf).toContain('DRILL_8_D20');
        });

        it('generates correct layers for bore operations', () => {
            const graph = createMockOperationGraph([
                createBoreOperation({ diameter: 35, depth: 13 }),
                createBoreOperation({ diameter: 15, depth: 12, id: 'bore-2' }),
            ]);
            const dxf = operationGraphToDxf(graph);

            expect(dxf).toContain('BORE_35D13');
            expect(dxf).toContain('BORE_15D12');
        });

        it('generates CIRCLE entities for drill operations', () => {
            const graph = createMockOperationGraph([
                createDrillOperation({ position: { x: 100, y: 50, z: 0 } }),
            ]);
            const dxf = operationGraphToDxf(graph);

            expect(dxf).toContain('CIRCLE');
            expect(dxf).toContain('100.0000'); // x position
            expect(dxf).toContain('50.0000');  // y position
        });

        it('generates CIRCLE entities for bore operations with correct radius', () => {
            const graph = createMockOperationGraph([
                createBoreOperation({ diameter: 35, position: { x: 200, y: 100, z: 0 } }),
            ]);
            const dxf = operationGraphToDxf(graph);

            expect(dxf).toContain('CIRCLE');
            expect(dxf).toContain('17.5000'); // radius = diameter/2
        });
    });

    describe('options', () => {
        it('includes outline when includeOutline is true', () => {
            const graph = createMockOperationGraph([createDrillOperation()]);
            const dxf = operationGraphToDxf(graph, {
                includeOutline: true,
                panelWidth: 600,
                panelHeight: 800,
            });

            expect(dxf).toContain('OUTLINE');
            expect(dxf).toContain('LWPOLYLINE');
        });

        it('includes metadata annotation by default', () => {
            const graph = createMockOperationGraph([createDrillOperation()]);
            const dxf = operationGraphToDxf(graph);

            expect(dxf).toContain('Machine: KDT-6000');
            expect(dxf).toContain('Operations: 1');
            expect(dxf).toContain('Tools: DRILL_5, BORE_35');
        });

        it('excludes metadata when includeMetadata is false', () => {
            const graph = createMockOperationGraph([createDrillOperation()]);
            const dxf = operationGraphToDxf(graph, { includeMetadata: false });

            expect(dxf).not.toContain('Machine: KDT-6000');
        });

        it('centers coordinates when origin is center', () => {
            const graph = createMockOperationGraph([
                createDrillOperation({ position: { x: 100, y: 50, z: 0 } }),
            ]);
            const dxfCentered = operationGraphToDxf(graph, {
                origin: 'center',
                panelWidth: 600,
                panelHeight: 800,
            });

            // With panelWidth=600, offsetX=-300
            // x = 100 - 300 = -200
            expect(dxfCentered).toContain('-200.0000');
        });
    });

    describe('empty graph handling', () => {
        it('generates valid DXF even with no operations', () => {
            const graph = createMockOperationGraph([]);
            const dxf = operationGraphToDxf(graph);

            expect(dxf).toContain('EOF');
            expect(dxf).toContain('SECTION');
        });
    });
});

// ============================================
// TESTS: getOperationGraphDxfStats
// ============================================

describe('getOperationGraphDxfStats', () => {
    it('counts operations by type', () => {
        const graph = createMockOperationGraph([
            createDrillOperation(),
            createDrillOperation({ id: 'drill-2' }),
            createBoreOperation(),
        ]);
        const stats = getOperationGraphDxfStats(graph);

        expect(stats.totalOperations).toBe(3);
        expect(stats.operationsByType['DRILL']).toBe(2);
        expect(stats.operationsByType['BORE']).toBe(1);
    });

    it('counts unique layers', () => {
        const graph = createMockOperationGraph([
            createDrillOperation({ toolId: 'DRILL_5', depth: 10 }),
            createDrillOperation({ toolId: 'DRILL_5', depth: 10, id: 'drill-2' }),
            createDrillOperation({ toolId: 'DRILL_8', depth: 20, id: 'drill-3' }),
        ]);
        const stats = getOperationGraphDxfStats(graph);

        // Same tool+depth = same layer, so 2 unique layers
        expect(stats.uniqueLayers).toBe(2);
    });

    it('includes tools used', () => {
        const graph = createMockOperationGraph([createDrillOperation()]);
        const stats = getOperationGraphDxfStats(graph);

        expect(stats.toolsUsed).toContain('DRILL_5');
        expect(stats.toolsUsed).toContain('BORE_35');
    });
});

// ============================================
// TESTS: validateOperationGraphForDxf
// ============================================

describe('validateOperationGraphForDxf', () => {
    it('returns valid for well-formed graph', () => {
        const graph = createMockOperationGraph([createDrillOperation()]);
        const result = validateOperationGraphForDxf(graph);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('returns error for empty operations', () => {
        const graph = createMockOperationGraph([]);
        const result = validateOperationGraphForDxf(graph);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('OperationGraph has no operations');
    });

    it('returns error for missing machineId', () => {
        const graph = createMockOperationGraph([createDrillOperation()]);
        graph.machineId = '';
        const result = validateOperationGraphForDxf(graph);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('OperationGraph has no machineId');
    });

    it('returns error for invalid position', () => {
        const graph = createMockOperationGraph([
            createDrillOperation({ position: { x: NaN, y: 50, z: 0 } }),
        ]);
        const result = validateOperationGraphForDxf(graph);

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('invalid position');
    });

    it('returns warning for negative coordinates', () => {
        const graph = createMockOperationGraph([
            createDrillOperation({ position: { x: -10, y: 50, z: 0 } }),
        ]);
        const result = validateOperationGraphForDxf(graph);

        expect(result.valid).toBe(true);
        expect(result.warnings[0]).toContain('negative coordinates');
    });

    it('returns warning for missing toolsUsed', () => {
        const graph = createMockOperationGraph([createDrillOperation()]);
        graph.toolsUsed = [];
        const result = validateOperationGraphForDxf(graph);

        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('OperationGraph has no toolsUsed array');
    });
});

// ============================================
// TESTS: operationGraphBatchToDxf
// ============================================

describe('operationGraphBatchToDxf', () => {
    it('generates DXF for multiple graphs', () => {
        const graphs = [
            createMockOperationGraph([createDrillOperation()]),
            createMockOperationGraph([createBoreOperation()]),
        ];
        graphs[1].metadata.panelId = 'panel-right-side';

        const result = operationGraphBatchToDxf(graphs);

        expect(result.size).toBe(2);
    });

    it('uses correct filenames based on panelId and machineId', () => {
        const graph = createMockOperationGraph([createDrillOperation()]);
        graph.metadata.panelId = 'left-side';
        graph.machineId = 'KDT-6000';

        const result = operationGraphBatchToDxf([graph]);

        expect(result.has('left-side_KDT-6000.dxf')).toBe(true);
    });

    it('falls back to jobId when panelId is missing', () => {
        const graph = createMockOperationGraph([createDrillOperation()]);
        graph.metadata.panelId = undefined;
        graph.metadata.jobId = 'job-123';

        const result = operationGraphBatchToDxf([graph]);

        expect(result.has('job-123_KDT-6000.dxf')).toBe(true);
    });
});
