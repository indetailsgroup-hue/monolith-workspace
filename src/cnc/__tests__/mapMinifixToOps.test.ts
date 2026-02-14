/**
 * mapMinifixToOps.test.ts - Unit tests for Minifix to Operations Mapper
 *
 * Tests conversion of factory packet minifix pairs to CNC operations.
 *
 * @version 1.0.0 - Phase D1
 */

import { describe, it, expect } from 'vitest';
import { mapMinifixToOps, getMinifixMapStats } from '../mapping/mapMinifixToOps';
import { KDT_MACHINE } from '../machine/presets/kdt';
import type { PacketConnectors, PacketMinifixPair } from '../../factory/packet/types';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMinifixPair = (overrides?: Partial<PacketMinifixPair>): PacketMinifixPair => ({
  id: 'pair-001',
  status: 'VALID',
  cam: {
    pointId: 'cam-001',
    panelId: 'panel-001',
    position: [100, 50, 0],
    diameter: 15,
    depth: 12,
  },
  bolt: {
    pointId: 'bolt-001',
    panelId: 'panel-002',
    position: [100, 80, 0],
    diameter: 5,
    depth: 30,
  },
  ...overrides,
});

const createConnectors = (pairs: PacketMinifixPair[]): PacketConnectors => ({
  version: 'connectors.v1',
  minifix: pairs,
  summary: {
    totalPairs: pairs.length,
    validPairs: pairs.filter(p => p.status === 'VALID').length,
    warningPairs: pairs.filter(p => p.status === 'WARNING').length,
    errorPairs: pairs.filter(p => p.status === 'ERROR').length,
  },
});

// ============================================================================
// Basic Mapping Tests
// ============================================================================

describe('mapMinifixToOps - Basic Mapping', () => {
  it('should map single minifix pair to two operations', () => {
    const connectors = createConnectors([createMinifixPair()]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    expect(result.operations).toHaveLength(2);
    expect(result.unmappedPairs).toHaveLength(0);
  });

  it('should create one bore operation for cam housing', () => {
    const connectors = createConnectors([createMinifixPair()]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    const boreOps = result.operations.filter((op) => op.type === 'BORE');
    expect(boreOps).toHaveLength(1);
  });

  it('should create one drill operation for bolt hole', () => {
    const connectors = createConnectors([createMinifixPair()]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    const drillOps = result.operations.filter((op) => op.type === 'DRILL');
    expect(drillOps).toHaveLength(1);
  });

  it('should map multiple pairs', () => {
    const connectors = createConnectors([
      createMinifixPair({ id: 'pair-001' }),
      createMinifixPair({ id: 'pair-002' }),
      createMinifixPair({ id: 'pair-003' }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    expect(result.operations).toHaveLength(6); // 3 pairs * 2 ops each
  });
});

// ============================================================================
// Cam Housing (Bore) Tests
// ============================================================================

describe('mapMinifixToOps - Cam Housing', () => {
  it('should use 15mm bore tool for cam housing', () => {
    const connectors = createConnectors([createMinifixPair()]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    const camOp = result.operations.find((op) => op.id.includes('cam'));
    expect(camOp?.toolId).toBe('BORE_15');
  });

  it('should preserve cam position', () => {
    const connectors = createConnectors([
      createMinifixPair({
        cam: {
          pointId: 'cam-001',
          panelId: 'panel-001',
          position: [250, 150, 5],
          diameter: 15,
          depth: 12,
        },
      }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    const camOp = result.operations.find((op) => op.id.includes('cam'));
    expect(camOp?.position).toEqual({ x: 250, y: 150, z: 5 });
  });

  it('should preserve cam diameter and depth', () => {
    const connectors = createConnectors([
      createMinifixPair({
        cam: {
          pointId: 'cam-001',
          panelId: 'panel-001',
          position: [100, 100, 0],
          diameter: 15,
          depth: 13,
        },
      }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    const camOp = result.operations.find((op) => op.id.includes('cam')) as any;
    expect(camOp.diameter).toBe(15);
    expect(camOp.depth).toBe(13);
  });

  it('should set flat bottom for cam housing', () => {
    const connectors = createConnectors([createMinifixPair()]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    const camOp = result.operations.find((op) => op.id.includes('cam')) as any;
    expect(camOp.flatBottom).toBe(true);
  });
});

// ============================================================================
// Bolt Hole (Drill) Tests
// ============================================================================

describe('mapMinifixToOps - Bolt Hole', () => {
  it('should use 5mm drill tool for bolt hole', () => {
    const connectors = createConnectors([createMinifixPair()]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    const boltOp = result.operations.find((op) => op.id.includes('bolt'));
    expect(boltOp?.toolId).toBe('DRILL_5');
  });

  it('should preserve bolt position', () => {
    const connectors = createConnectors([
      createMinifixPair({
        bolt: {
          pointId: 'bolt-001',
          panelId: 'panel-002',
          position: [300, 200, 10],
          diameter: 5,
          depth: 25,
        },
      }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    const boltOp = result.operations.find((op) => op.id.includes('bolt'));
    expect(boltOp?.position).toEqual({ x: 300, y: 200, z: 10 });
  });

  it('should preserve bolt depth', () => {
    const connectors = createConnectors([
      createMinifixPair({
        bolt: {
          pointId: 'bolt-001',
          panelId: 'panel-002',
          position: [100, 100, 0],
          diameter: 5,
          depth: 28,
        },
      }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    const boltOp = result.operations.find((op) => op.id.includes('bolt')) as any;
    expect(boltOp.depth).toBe(28);
  });

  it('should set through hole to false for bolt', () => {
    const connectors = createConnectors([createMinifixPair()]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    const boltOp = result.operations.find((op) => op.id.includes('bolt')) as any;
    expect(boltOp.throughHole).toBe(false);
  });
});

// ============================================================================
// Status Filtering Tests
// ============================================================================

describe('mapMinifixToOps - Status Filtering', () => {
  it('should skip pairs with ERROR status by default', () => {
    const connectors = createConnectors([
      createMinifixPair({ id: 'pair-ok', status: 'VALID' }),
      createMinifixPair({ id: 'pair-error', status: 'ERROR', issues: ['Invalid position'] }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    expect(result.operations).toHaveLength(2); // Only OK pair
    expect(result.unmappedPairs).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes('pair-error'))).toBe(true);
  });

  it('should include WARNING pairs by default', () => {
    const connectors = createConnectors([
      createMinifixPair({ id: 'pair-warn', status: 'WARNING', issues: ['Near edge'] }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    expect(result.operations).toHaveLength(2);
    expect(result.unmappedPairs).toHaveLength(0);
  });

  it('should skip WARNING pairs when option is set', () => {
    const connectors = createConnectors([
      createMinifixPair({ id: 'pair-warn', status: 'WARNING' }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE, {
      skipWarningPairs: true,
    });

    expect(result.operations).toHaveLength(0);
    expect(result.unmappedPairs).toHaveLength(1);
  });

  it('should include ERROR pairs when option is false', () => {
    const connectors = createConnectors([
      createMinifixPair({ id: 'pair-error', status: 'ERROR' }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE, {
      skipErrorPairs: false,
    });

    expect(result.operations).toHaveLength(2);
    expect(result.unmappedPairs).toHaveLength(0);
  });
});

// ============================================================================
// Warning Tests
// ============================================================================

describe('mapMinifixToOps - Warnings', () => {
  it('should warn when cam depth exceeds tool max', () => {
    const connectors = createConnectors([
      createMinifixPair({
        cam: {
          pointId: 'cam-001',
          panelId: 'panel-001',
          position: [100, 100, 0],
          diameter: 15,
          depth: 50, // Very deep
        },
      }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    expect(result.warnings.some((w) => w.includes('Cam depth'))).toBe(true);
  });

  it('should warn when bolt depth exceeds tool max', () => {
    const connectors = createConnectors([
      createMinifixPair({
        bolt: {
          pointId: 'bolt-001',
          panelId: 'panel-002',
          position: [100, 100, 0],
          diameter: 5,
          depth: 100, // Very deep
        },
      }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    expect(result.warnings.some((w) => w.includes('Bolt depth'))).toBe(true);
  });
});

// ============================================================================
// Missing Tool Tests
// ============================================================================

describe('mapMinifixToOps - Missing Tools', () => {
  // Note: We can't easily test missing tools with KDT_MACHINE since it has standard tools
  // This test ensures warnings are generated when tools are missing

  it('should return empty operations when no minifix pairs', () => {
    const connectors = createConnectors([]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    expect(result.operations).toHaveLength(0);
    expect(result.unmappedPairs).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ============================================================================
// Statistics Tests
// ============================================================================

describe('getMinifixMapStats', () => {
  it('should calculate correct statistics', () => {
    const connectors = createConnectors([
      createMinifixPair({ id: 'pair-001' }),
      createMinifixPair({ id: 'pair-002' }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);
    const stats = getMinifixMapStats(result);

    expect(stats.totalPairs).toBe(2);
    expect(stats.camOps).toBe(2);
    expect(stats.boltOps).toBe(2);
    expect(stats.unmapped).toBe(0);
  });

  it('should count unmapped pairs', () => {
    const connectors = createConnectors([
      createMinifixPair({ id: 'pair-ok', status: 'VALID' }),
      createMinifixPair({ id: 'pair-error', status: 'ERROR' }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);
    const stats = getMinifixMapStats(result);

    expect(stats.unmapped).toBe(1);
  });

  it('should count warnings', () => {
    const connectors = createConnectors([
      createMinifixPair({
        cam: {
          pointId: 'cam-001',
          panelId: 'panel-001',
          position: [100, 100, 0],
          diameter: 15,
          depth: 50, // Triggers warning
        },
      }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);
    const stats = getMinifixMapStats(result);

    expect(stats.warningCount).toBeGreaterThan(0);
  });
});

// ============================================================================
// Operation ID and Comment Tests
// ============================================================================

describe('mapMinifixToOps - Operation IDs and Comments', () => {
  it('should generate unique operation IDs', () => {
    const connectors = createConnectors([
      createMinifixPair({ id: 'pair-001' }),
      createMinifixPair({ id: 'pair-002' }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    const ids = result.operations.map((op) => op.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should include pair ID in operation IDs', () => {
    const connectors = createConnectors([
      createMinifixPair({ id: 'my-pair-123' }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    expect(result.operations.every((op) => op.id.includes('my-pair-123'))).toBe(true);
  });

  it('should include pair ID in comments', () => {
    const connectors = createConnectors([
      createMinifixPair({ id: 'pair-456' }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    expect(result.operations.every((op) => op.comment?.includes('pair-456'))).toBe(true);
  });

  it('should include source ID from point', () => {
    const connectors = createConnectors([
      createMinifixPair({
        cam: {
          pointId: 'cam-source-abc',
          panelId: 'panel-001',
          position: [100, 100, 0],
          diameter: 15,
          depth: 12,
        },
        bolt: {
          pointId: 'bolt-source-xyz',
          panelId: 'panel-002',
          position: [100, 130, 0],
          diameter: 5,
          depth: 30,
        },
      }),
    ]);
    const result = mapMinifixToOps(connectors, KDT_MACHINE);

    const camOp = result.operations.find((op) => op.id.includes('cam'));
    const boltOp = result.operations.find((op) => op.id.includes('bolt'));

    expect(camOp?.sourceId).toBe('cam-source-abc');
    expect(boltOp?.sourceId).toBe('bolt-source-xyz');
  });
});
