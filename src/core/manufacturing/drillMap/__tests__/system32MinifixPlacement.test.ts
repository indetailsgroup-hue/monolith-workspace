/**
 * Unit tests for System 32 Minifix Placement Algorithm
 *
 * Verifies:
 * 1. System 32 positions calculated correctly (37, 69, 101, ...)
 * 2. Dimension B is properly separated from pitch
 * 3. Bolt and housing X positions are aligned
 * 4. Dowel positions are on 32mm pitch from bolt
 */

import { describe, it, expect } from 'vitest';
import {
    calculateSystem32Position,
    calculateAllSystem32Positions,
    calculateMinifixJointPositions,
    validateMinifixJoint,
    getConfigForThickness,
    DEFAULT_SYSTEM32,
    DEFAULT_PLACEMENT_CONFIG,
} from '../system32MinifixPlacement';

describe('System 32 Position Calculation', () => {
    it('calculates first position at setback (37mm)', () => {
        const pos = calculateSystem32Position(0);
        expect(pos).toBe(37);
    });

    it('calculates subsequent positions at 32mm pitch', () => {
        expect(calculateSystem32Position(1)).toBe(69);   // 37 + 32
        expect(calculateSystem32Position(2)).toBe(101);  // 37 + 64
        expect(calculateSystem32Position(3)).toBe(133);  // 37 + 96
    });

    it('respects custom setback and pitch', () => {
        const customConfig = { setback: 40, pitch: 35 };
        expect(calculateSystem32Position(0, customConfig)).toBe(40);
        expect(calculateSystem32Position(1, customConfig)).toBe(75);
        expect(calculateSystem32Position(2, customConfig)).toBe(110);
    });
});

describe('All System 32 Positions', () => {
    it('generates positions for 500mm depth panel', () => {
        const positions = calculateAllSystem32Positions(500);

        expect(positions[0]).toBe(37);      // First position
        expect(positions[1]).toBe(69);      // 37 + 32
        expect(positions[positions.length - 1]).toBeLessThanOrEqual(490);  // Within margin

        // Verify all positions are on 32mm grid
        for (let i = 1; i < positions.length; i++) {
            expect(positions[i] - positions[i - 1]).toBe(32);
        }
    });

    it('respects end margin', () => {
        const positions = calculateAllSystem32Positions(100, DEFAULT_SYSTEM32, 20);
        const lastPos = positions[positions.length - 1];
        expect(lastPos).toBeLessThanOrEqual(80);  // 100 - 20 margin
    });
});

describe('Minifix Joint Positions', () => {
    describe('Dimension B vs System 32 Pitch Separation', () => {
        it('uses Dimension B for housing Y, NOT pitch', () => {
            const positions = calculateMinifixJointPositions(
                720,
                500,
                'TOP',
                0,
                {
                    ...DEFAULT_PLACEMENT_CONFIG,
                    minifix: { ...DEFAULT_PLACEMENT_CONFIG.minifix, dimensionB: 24 },
                }
            );

            // Housing Y should be exactly Dimension B (24mm)
            expect(positions.horizontalPanel.housing.y).toBe(24);

            // Bolt Z should be System 32 first position (37mm)
            expect(positions.sidePanel.bolt.z).toBe(37);

            // These are DIFFERENT values - that's the key!
            expect(positions.horizontalPanel.housing.y).not.toBe(positions.sidePanel.bolt.z);
        });

        it('correctly applies Dimension B = 34mm', () => {
            const positions = calculateMinifixJointPositions(
                720,
                500,
                'TOP',
                0,
                {
                    ...DEFAULT_PLACEMENT_CONFIG,
                    minifix: { ...DEFAULT_PLACEMENT_CONFIG.minifix, dimensionB: 34 },
                }
            );

            expect(positions.horizontalPanel.housing.y).toBe(34);
        });
    });

    describe('Bolt-Dowel Spacing', () => {
        it('places dowel 32mm from bolt (System 32 pitch)', () => {
            const positions = calculateMinifixJointPositions(
                720,
                500,
                'TOP',
                0
            );

            const boltZ = positions.sidePanel.bolt.z;
            const dowelZ = positions.sidePanel.dowel.z;

            expect(dowelZ - boltZ).toBe(32);  // One pitch
        });

        it('dowel offset is configurable', () => {
            const positions = calculateMinifixJointPositions(
                720,
                500,
                'TOP',
                0,
                {
                    ...DEFAULT_PLACEMENT_CONFIG,
                    dowel: { ...DEFAULT_PLACEMENT_CONFIG.dowel, offsetFromBolt: 64 },
                }
            );

            const boltZ = positions.sidePanel.bolt.z;
            const dowelZ = positions.sidePanel.dowel.z;

            expect(dowelZ - boltZ).toBe(64);  // Two pitches
        });
    });

    describe('Coaxial Alignment', () => {
        it('bolt and housing X positions are aligned', () => {
            const positions = calculateMinifixJointPositions(720, 500, 'TOP', 0);

            expect(positions.sidePanel.bolt.x).toBe(positions.horizontalPanel.housing.x);
        });

        it('bolt and housing Z positions are aligned', () => {
            const positions = calculateMinifixJointPositions(720, 500, 'TOP', 0);

            expect(positions.sidePanel.bolt.z).toBe(positions.horizontalPanel.housing.z);
        });
    });

    describe('Corner Types', () => {
        it('TOP corner: bolt Y is near panel top', () => {
            const panelHeight = 720;
            const thickness = 19;
            const positions = calculateMinifixJointPositions(
                panelHeight,
                500,
                'TOP',
                0,
                { ...DEFAULT_PLACEMENT_CONFIG, panelThickness: thickness }
            );

            const expectedY = panelHeight - thickness / 2;  // 720 - 9.5 = 710.5
            expect(positions.sidePanel.bolt.y).toBe(expectedY);
        });

        it('BOTTOM corner: bolt Y is near panel bottom', () => {
            const thickness = 19;
            const positions = calculateMinifixJointPositions(
                720,
                500,
                'BOTTOM',
                0,
                { ...DEFAULT_PLACEMENT_CONFIG, panelThickness: thickness }
            );

            const expectedY = thickness / 2;  // 9.5
            expect(positions.sidePanel.bolt.y).toBe(expectedY);
        });
    });
});

describe('Validation', () => {
    it('passes for correctly calculated positions', () => {
        const positions = calculateMinifixJointPositions(720, 500, 'TOP', 0);
        const result = validateMinifixJoint(positions);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('fails if housing Y does not match Dimension B', () => {
        const positions = calculateMinifixJointPositions(720, 500, 'TOP', 0);

        // Corrupt the housing Y position
        positions.horizontalPanel.housing.y = 30;  // Not 24 or 34

        const result = validateMinifixJoint(positions);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Housing Y'))).toBe(true);
    });

    it('fails if dowel is not on 32mm grid', () => {
        const positions = calculateMinifixJointPositions(720, 500, 'TOP', 0);

        // Corrupt the dowel Z position
        positions.sidePanel.dowel.z = 50;  // Not on 32mm grid from bolt

        const result = validateMinifixJoint(positions);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Dowel not on System 32 grid'))).toBe(true);
    });
});

describe('Config for Panel Thickness', () => {
    it('returns correct housing depth for 16mm panel', () => {
        const config = getConfigForThickness(16, 24);

        expect(config.panelThickness).toBe(16);
        expect(config.minifix.housingDepth).toBe(12.5);
        expect(config.minifix.dimensionB).toBe(24);
    });

    it('returns correct housing depth for 19mm panel', () => {
        const config = getConfigForThickness(19, 34);

        expect(config.panelThickness).toBe(19);
        expect(config.minifix.housingDepth).toBe(14.0);
        expect(config.minifix.dimensionB).toBe(34);
    });

    it('finds closest thickness for unsupported values', () => {
        const config = getConfigForThickness(17, 24);  // 17mm not in catalog

        // Should use 16mm or 18mm (closest)
        expect([12.5, 13.5]).toContain(config.minifix.housingDepth);
    });
});
