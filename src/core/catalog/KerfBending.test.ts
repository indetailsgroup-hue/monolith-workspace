/**
 * Unit tests for KerfBending
 *
 * Tests the kerf bending calculator functions used for
 * curved panel manufacturing specifications.
 */

import { describe, it, expect } from 'vitest'
import {
  calculateArcLength,
  calculateArcLengthDelta,
  calculateKerfCount,
  calculateKerfSpacing,
  calculateKerfSpacingQuick,
  calculateKerfDepth,
  calculateKerfBending,
  getMinimumBendRadius,
  lookupMinBendRadius,
  kEffFromTool,
  MATERIAL_CONSTANTS,
  R_MIN_CATALOG,
  generateStraightKerfPattern,
  generateLivingHingePattern,
  assessFaceting,
  getWettingRecommendation,
  assessStressConcentration,
  compareKerfCalculations,
  calculateRequiredKerfParams,
  WEB_THICKNESS_LIMITS,
} from './KerfBending'
import type { KerfBendingParams, KerfToolProfile } from './KerfBending'

describe('KerfBending', () => {
  // ============================================
  // ARC LENGTH CALCULATIONS
  // ============================================

  describe('calculateArcLength', () => {
    it('should calculate quarter circle arc (90 degrees)', () => {
      const radius = 100 // mm
      const angle = 90 // degrees
      const expected = 2 * Math.PI * 100 * (90 / 360) // π/2 * 100 ≈ 157.08
      expect(calculateArcLength(radius, angle)).toBeCloseTo(expected, 2)
    })

    it('should calculate half circle arc (180 degrees)', () => {
      const radius = 100 // mm
      const angle = 180 // degrees
      const expected = Math.PI * 100 // ≈ 314.16
      expect(calculateArcLength(radius, angle)).toBeCloseTo(expected, 2)
    })

    it('should calculate full circle arc (360 degrees)', () => {
      const radius = 100 // mm
      const angle = 360 // degrees
      const expected = 2 * Math.PI * 100 // ≈ 628.32
      expect(calculateArcLength(radius, angle)).toBeCloseTo(expected, 2)
    })

    it('should return 0 for 0 degrees', () => {
      expect(calculateArcLength(100, 0)).toBe(0)
    })
  })

  describe('calculateArcLengthDelta', () => {
    it('should calculate delta for 18mm panel at 90 degrees', () => {
      // ΔL = 2πT × (θ/360) = 2π × 18 × 0.25 ≈ 28.27mm
      const result = calculateArcLengthDelta(18, 90)
      expect(result).toBeCloseTo(28.27, 1)
    })

    it('should scale linearly with thickness', () => {
      const delta9mm = calculateArcLengthDelta(9, 90)
      const delta18mm = calculateArcLengthDelta(18, 90)
      expect(delta18mm).toBeCloseTo(delta9mm * 2, 4)
    })

    it('should scale linearly with angle', () => {
      const delta90 = calculateArcLengthDelta(18, 90)
      const delta180 = calculateArcLengthDelta(18, 180)
      expect(delta180).toBeCloseTo(delta90 * 2, 4)
    })
  })

  // ============================================
  // KERF COUNT AND SPACING
  // ============================================

  describe('calculateKerfCount', () => {
    it('should calculate correct kerf count', () => {
      // If ΔL = 30mm and kerf width = 3mm, need 10 kerfs
      expect(calculateKerfCount(30, 3)).toBe(10)
    })

    it('should round up for fractional kerf count', () => {
      // If ΔL = 31mm and kerf width = 3mm, need ceil(10.33) = 11 kerfs
      expect(calculateKerfCount(31, 3)).toBe(11)
    })

    it('should handle small deltas', () => {
      expect(calculateKerfCount(1, 3)).toBe(1)
    })
  })

  describe('calculateKerfSpacing', () => {
    it('should calculate even spacing', () => {
      // Arc length 200mm with 10 kerfs = 20mm spacing
      expect(calculateKerfSpacing(200, 10)).toBe(20)
    })

    it('should handle fractional spacing', () => {
      expect(calculateKerfSpacing(100, 3)).toBeCloseTo(33.33, 2)
    })
  })

  describe('calculateKerfSpacingQuick', () => {
    it('should approximate spacing using quick formula', () => {
      // S ≈ (R × K) / T
      // For R=150mm, K=3mm, T=18mm: S ≈ 25mm
      const spacing = calculateKerfSpacingQuick(150, 3, 18)
      expect(spacing).toBe(25)
    })

    it('should be reasonably close to precise calculation for typical values', () => {
      const comparison = compareKerfCalculations(150, 18, 3, 90)
      expect(comparison.deviation).toBeLessThan(20) // Within 20%
    })
  })

  // ============================================
  // KERF DEPTH
  // ============================================

  describe('calculateKerfDepth', () => {
    it('should calculate depth as thickness minus web', () => {
      expect(calculateKerfDepth(18, 2)).toBe(16)
    })

    it('should handle thin panels', () => {
      expect(calculateKerfDepth(9, 1.5)).toBe(7.5)
    })
  })

  // ============================================
  // MINIMUM BEND RADIUS
  // ============================================

  describe('getMinimumBendRadius', () => {
    it('should calculate MDF minimum radius (8x thickness)', () => {
      expect(getMinimumBendRadius(18, 'MDF')).toBe(144)
    })

    it('should calculate plywood minimum radius (6x thickness)', () => {
      expect(getMinimumBendRadius(18, 'PLYWOOD')).toBe(108)
    })

    it('should throw G12_MATERIAL_DATA_MISSING for PARTICLE_BOARD (pending task 4.3)', () => {
      expect(() => getMinimumBendRadius(18, 'PARTICLE_BOARD')).toThrow('G12_MATERIAL_DATA_MISSING')
    })
  })

  // ============================================
  // FULL KERF BENDING CALCULATION
  // ============================================

  describe('calculateKerfBending', () => {
    const standardParams: KerfBendingParams = {
      panelThickness: 18,
      panelWidth: 600,
      panelLength: 1200,
      bendRadius: 150,
      bendAngle: 90,
      material: 'MDF',
      profile: 'STRAIGHT',
      kerfWidth: 3.2,
    }

    it('should calculate all kerf parameters', () => {
      const result = calculateKerfBending(standardParams)

      expect(result.kerfCount).toBeGreaterThan(0)
      expect(result.kerfSpacing).toBeGreaterThan(0)
      expect(result.kerfDepth).toBeGreaterThan(0)
      expect(result.webThickness).toBeGreaterThan(0)
    })

    it('should return valid arc lengths', () => {
      const result = calculateKerfBending(standardParams)

      expect(result.arcLengthOuter).toBeGreaterThan(result.arcLengthInner)
      expect(result.arcLengthDelta).toBeGreaterThan(0)
    })

    it('should calculate correct safety factor', () => {
      const result = calculateKerfBending(standardParams)

      // Safety factor = bendRadius / minBendRadius
      const expectedMinRadius = getMinimumBendRadius(18, 'MDF')
      expect(result.minBendRadius).toBe(expectedMinRadius)
      expect(result.safetyFactor).toBeCloseTo(150 / expectedMinRadius, 2)
    })

    it('should add G12_RADIUS_BELOW_MIN error for bend radius below R_min (BLOCKER)', () => {
      const tightBendParams: KerfBendingParams = {
        ...standardParams,
        bendRadius: 100, // Below R_min=144mm for 18mm MDF
      }

      const result = calculateKerfBending(tightBendParams)
      // G12_RADIUS_BELOW_MIN is a BLOCKER, must appear in errors[] not warnings[]
      expect(result.errors).toContain('G12_RADIUS_BELOW_MIN')
    })

    it('should include CNC parameters', () => {
      const result = calculateKerfBending(standardParams)

      expect(result.cncParams.toolDiameter).toBe(3.2)
      expect(result.cncParams.cutDepth).toBeGreaterThan(0)
      expect(result.cncParams.feedRate).toBeGreaterThan(0)
      expect(result.cncParams.spindleSpeed).toBeGreaterThan(0)
      expect(result.cncParams.passes).toBeGreaterThanOrEqual(1)
    })

    it('should auto-calculate web thickness if not provided', () => {
      const result = calculateKerfBending(standardParams)

      expect(result.webThickness).toBeGreaterThanOrEqual(
        WEB_THICKNESS_LIMITS.MDF.recommended
      )
    })

    it('should use provided web thickness', () => {
      const params: KerfBendingParams = {
        ...standardParams,
        webThickness: 3,
      }

      const result = calculateKerfBending(params)
      expect(result.webThickness).toBe(3)
    })

    it('should throw error for invalid kerf depth (web > panel thickness)', () => {
      const invalidParams: KerfBendingParams = {
        ...standardParams,
        panelThickness: 18,
        webThickness: 20, // 20 > 18 → D_kerf = -2 → throws
      }

      expect(() => calculateKerfBending(invalidParams)).toThrow()
    })
  })

  // ============================================
  // KERF PATTERN GENERATION
  // ============================================

  describe('generateStraightKerfPattern', () => {
    it('should generate correct number of kerf lines', () => {
      const lines = generateStraightKerfPattern(600, 10, 20, 16, 10)
      expect(lines.length).toBe(10)
    })

    it('should span full panel width', () => {
      const width = 600
      const lines = generateStraightKerfPattern(width, 5, 30, 16)

      lines.forEach((line) => {
        expect(line.x1).toBe(0)
        expect(line.x2).toBe(width)
      })
    })

    it('should have correct depth', () => {
      const depth = 16
      const lines = generateStraightKerfPattern(600, 5, 30, depth)

      lines.forEach((line) => {
        expect(line.depth).toBe(depth)
      })
    })

    it('should space kerfs evenly', () => {
      const spacing = 20
      const lines = generateStraightKerfPattern(600, 3, spacing, 16, 0)

      expect(lines[0].y1).toBeCloseTo(10, 1) // First at half spacing
      expect(lines[1].y1).toBeCloseTo(30, 1) // Second at 1.5x spacing
      expect(lines[2].y1).toBeCloseTo(50, 1) // Third at 2.5x spacing
    })
  })

  describe('generateLivingHingePattern', () => {
    it('should generate alternating pattern', () => {
      const lines = generateLivingHingePattern(600, 1200, 4, 30, 16)

      // Should have more lines than kerf count due to segments
      expect(lines.length).toBeGreaterThan(4)
    })

    it('should have alternating x positions', () => {
      const width = 600
      const lines = generateLivingHingePattern(width, 1200, 2, 30, 16)

      // Even rows start from edge, odd rows start from middle
      const evenRowLines = lines.filter((_, i) => i < 2) // First two lines
      const oddRowLines = lines.filter((_, i) => i >= 2) // Rest

      // Even row should start at 0
      expect(evenRowLines[0].x1).toBe(0)
    })
  })

  // ============================================
  // FACETING ASSESSMENT
  // ============================================

  describe('assessFaceting', () => {
    it('should assess tight spacing as no faceting', () => {
      const result = assessFaceting(4, 150, 18)
      expect(result.facetingLevel).toBe('NONE')
    })

    it('should assess medium spacing as slight faceting', () => {
      const result = assessFaceting(8, 150, 18)
      expect(result.facetingLevel).toBe('SLIGHT')
    })

    it('should assess wide spacing as moderate faceting', () => {
      const result = assessFaceting(12, 150, 18)
      expect(result.facetingLevel).toBe('MODERATE')
    })

    it('should assess very wide spacing as severe faceting', () => {
      const result = assessFaceting(20, 150, 18)
      expect(result.facetingLevel).toBe('SEVERE')
    })

    it('should calculate maximum facet height', () => {
      const result = assessFaceting(10, 150, 18)
      expect(result.maxFacetHeight).toBeGreaterThan(0)
    })
  })

  // ============================================
  // WETTING RECOMMENDATION
  // ============================================

  describe('getWettingRecommendation', () => {
    it('should not recommend wetting for non-MDF materials', () => {
      const result = getWettingRecommendation('PLYWOOD', 150, 18)
      expect(result.recommended).toBe(false)
    })

    it('should not recommend wetting for easy bends', () => {
      // Easy bend: radius much larger than minimum
      const result = getWettingRecommendation('MDF', 300, 18) // Min is 144mm
      expect(result.recommended).toBe(false)
    })

    it('should recommend wetting for tight MDF bends', () => {
      // Tight bend: radius close to minimum
      const result = getWettingRecommendation('MDF', 144, 18) // Right at minimum
      expect(result.recommended).toBe(true)
    })

    it('should recommend longer wait time for HMR', () => {
      const mdfResult = getWettingRecommendation('MDF', 144, 18)
      const hmrResult = getWettingRecommendation('HMR', 144, 18)

      expect(hmrResult.waitTime).toBeGreaterThan(mdfResult.waitTime)
    })
  })

  // ============================================
  // STRESS CONCENTRATION
  // ============================================

  describe('assessStressConcentration', () => {
    it('should rate ball-nose as lowest stress', () => {
      const result = assessStressConcentration('BALL_NOSE', 2, 'MDF')
      expect(result.stressRisk).toBe('LOW')
    })

    it('should rate flat end mill as higher stress', () => {
      const flatResult = assessStressConcentration('FLAT', 2, 'MDF')
      const ballResult = assessStressConcentration('BALL_NOSE', 2, 'MDF')

      expect(flatResult.stressMultiplier).toBeGreaterThan(
        ballResult.stressMultiplier
      )
    })

    it('should increase risk for thin web', () => {
      const thickWeb = assessStressConcentration('FLAT', 3, 'MDF')
      const thinWeb = assessStressConcentration('FLAT', 1, 'MDF')

      expect(thinWeb.stressMultiplier).toBeGreaterThan(thickWeb.stressMultiplier)
    })

    it('should increase risk for particle board', () => {
      const mdfResult = assessStressConcentration('FLAT', 2, 'MDF')
      const pbResult = assessStressConcentration('FLAT', 2, 'PARTICLE_BOARD')

      expect(pbResult.stressMultiplier).toBeGreaterThan(mdfResult.stressMultiplier)
    })
  })

  // ============================================
  // REQUIRED KERF PARAMS
  // ============================================

  describe('calculateRequiredKerfParams', () => {
    it('should return feasible for valid radius', () => {
      const result = calculateRequiredKerfParams(18, 'MDF', 200, 90)
      expect(result.feasible).toBe(true)
    })

    it('should return not feasible for too tight radius', () => {
      // 18mm MDF min radius is 144mm, 75% = 108mm
      const result = calculateRequiredKerfParams(18, 'MDF', 50, 90)
      expect(result.feasible).toBe(false)
      expect(result.reason).toContain('too tight')
    })

    it('should suggest larger kerf width for larger delta', () => {
      const smallAngle = calculateRequiredKerfParams(18, 'MDF', 200, 45)
      const largeAngle = calculateRequiredKerfParams(18, 'MDF', 200, 180)

      expect(largeAngle.suggestedKerfWidth).toBeGreaterThanOrEqual(
        smallAngle.suggestedKerfWidth
      )
    })
  })

  // ============================================
  // WEB THICKNESS LIMITS
  // ============================================

  describe('WEB_THICKNESS_LIMITS', () => {
    it('should have values for all materials', () => {
      expect(WEB_THICKNESS_LIMITS.MDF).toBeDefined()
      expect(WEB_THICKNESS_LIMITS.PLYWOOD).toBeDefined()
      expect(WEB_THICKNESS_LIMITS.PARTICLE_BOARD).toBeDefined()
      expect(WEB_THICKNESS_LIMITS.HMR).toBeDefined()
    })

    it('should have min less than recommended', () => {
      Object.values(WEB_THICKNESS_LIMITS).forEach((limits) => {
        expect(limits.min).toBeLessThan(limits.recommended)
      })
    })

    it('should have particle board with highest limits (most brittle)', () => {
      expect(WEB_THICKNESS_LIMITS.PARTICLE_BOARD.min).toBeGreaterThan(
        WEB_THICKNESS_LIMITS.PLYWOOD.min
      )
    })
  })

  // ============================================
  // PHASE 0 — TOOL MODEL (spec §1.3)
  // ============================================

  describe('kEffFromTool', () => {
    it('should return bitDiameter for ROUTER when kEff is absent', () => {
      const tool: KerfToolProfile = { kind: 'ROUTER', bitDiameter: 6 }
      expect(kEffFromTool(tool)).toBe(6)
    })

    it('should return calibrated kEff for ROUTER when provided', () => {
      const tool: KerfToolProfile = { kind: 'ROUTER', bitDiameter: 6, kEff: 6.15 }
      expect(kEffFromTool(tool)).toBe(6.15)
    })

    it('should return bladeKerf for SAW when kEff is absent', () => {
      const tool: KerfToolProfile = { kind: 'SAW', bladeKerf: 3.2 }
      expect(kEffFromTool(tool)).toBe(3.2)
    })

    it('should return calibrated kEff for SAW when provided', () => {
      const tool: KerfToolProfile = { kind: 'SAW', bladeKerf: 3.2, kEff: 3.35 }
      expect(kEffFromTool(tool)).toBe(3.35)
    })
  })

  // ============================================
  // PHASE 0 — MATERIAL CONSTANTS (spec §2.1, §2.6)
  // ============================================

  describe('MATERIAL_CONSTANTS', () => {
    it('should have c_mat and springback_gamma for every material', () => {
      const materials = ['MDF', 'PLYWOOD', 'PARTICLE_BOARD', 'HMR'] as const
      materials.forEach((m) => {
        expect(MATERIAL_CONSTANTS[m].c_mat).toBeGreaterThan(0)
        expect(MATERIAL_CONSTANTS[m].springback_gamma).toBeGreaterThan(0)
      })
    })

    it('should have PLYWOOD c_mat > MDF c_mat (more flexible)', () => {
      expect(MATERIAL_CONSTANTS.PLYWOOD.c_mat).toBeGreaterThan(MATERIAL_CONSTANTS.MDF.c_mat)
    })

    it('should have PARTICLE_BOARD c_mat < MDF c_mat (more conservative)', () => {
      expect(MATERIAL_CONSTANTS.PARTICLE_BOARD.c_mat).toBeLessThan(MATERIAL_CONSTANTS.MDF.c_mat)
    })

    it('should have spring-back gamma in 10-15% range for MDF/PLYWOOD', () => {
      expect(MATERIAL_CONSTANTS.MDF.springback_gamma).toBeGreaterThanOrEqual(0.10)
      expect(MATERIAL_CONSTANTS.MDF.springback_gamma).toBeLessThanOrEqual(0.15)
      expect(MATERIAL_CONSTANTS.PLYWOOD.springback_gamma).toBeGreaterThanOrEqual(0.10)
      expect(MATERIAL_CONSTANTS.PLYWOOD.springback_gamma).toBeLessThanOrEqual(0.15)
    })
  })

  // ============================================
  // PHASE 0 — R_MIN CATALOG (spec §2.7)
  // ============================================

  describe('lookupMinBendRadius', () => {
    it('should return 144mm for 18mm MDF', () => {
      expect(lookupMinBendRadius(18, 'MDF')).toBe(144)
    })

    it('should return 108mm for 18mm PLYWOOD', () => {
      expect(lookupMinBendRadius(18, 'PLYWOOD')).toBe(108)
    })

    it('should return 72mm for 9mm HMR', () => {
      expect(lookupMinBendRadius(9, 'HMR')).toBe(72)
    })

    it('should throw G12_MATERIAL_DATA_MISSING for PARTICLE_BOARD 18mm (null entry)', () => {
      expect(() => lookupMinBendRadius(18, 'PARTICLE_BOARD')).toThrow('G12_MATERIAL_DATA_MISSING')
    })

    it('should throw G12_MATERIAL_DATA_MISSING for thickness not in catalog', () => {
      // 15mm MDF is not in R_MIN_CATALOG
      expect(() => lookupMinBendRadius(15, 'MDF')).toThrow('G12_MATERIAL_DATA_MISSING')
    })

    it('should have R_MIN_CATALOG null entries for PARTICLE_BOARD (pending task 4.3)', () => {
      expect(R_MIN_CATALOG.PARTICLE_BOARD?.[16]).toBeNull()
      expect(R_MIN_CATALOG.PARTICLE_BOARD?.[18]).toBeNull()
    })
  })

  // ============================================
  // PHASE 0 — calculateKerfBending new fields
  // ============================================

  describe('calculateKerfBending Phase 0 additions', () => {
    const standardParams: KerfBendingParams = {
      panelThickness: 18,
      panelWidth: 600,
      panelLength: 1200,
      bendRadius: 150,
      bendAngle: 90,
      material: 'MDF',
      profile: 'STRAIGHT',
      kerfWidth: 3.2,
    }

    it('should return errors[] array on every successful result', () => {
      const result = calculateKerfBending(standardParams)
      expect(Array.isArray(result.errors)).toBe(true)
    })

    it('should include springBackFactor = gamma for MDF', () => {
      const result = calculateKerfBending(standardParams)
      expect(result.springBackFactor).toBeCloseTo(MATERIAL_CONSTANTS.MDF.springback_gamma, 5)
    })

    it('should compute designRadius = R / (1 + gamma)', () => {
      const result = calculateKerfBending(standardParams)
      const expected = 150 / (1 + MATERIAL_CONSTANTS.MDF.springback_gamma)
      expect(result.designRadius).toBeCloseTo(expected, 1)
    })

    it('should have designRadius < bendRadius (spring-back compensation)', () => {
      const result = calculateKerfBending(standardParams)
      expect(result.designRadius).toBeLessThan(150)
    })

    it('should use k_eff from ROUTER tool profile as toolDiameter', () => {
      const params: KerfBendingParams = {
        ...standardParams,
        tool: { kind: 'ROUTER', bitDiameter: 6 },
      }
      const result = calculateKerfBending(params)
      expect(result.cncParams.toolDiameter).toBe(6)
    })

    it('should use calibrated kEff from SAW tool profile as toolDiameter', () => {
      const params: KerfBendingParams = {
        ...standardParams,
        tool: { kind: 'SAW', bladeKerf: 3.2, kEff: 3.5 },
      }
      const result = calculateKerfBending(params)
      expect(result.cncParams.toolDiameter).toBe(3.5)
    })

    it('should return G12_MATERIAL_DATA_MISSING and zero values for PARTICLE_BOARD', () => {
      const pbParams: KerfBendingParams = {
        ...standardParams,
        material: 'PARTICLE_BOARD',
        panelThickness: 18,
      }
      const result = calculateKerfBending(pbParams)
      expect(result.errors).toContain('G12_MATERIAL_DATA_MISSING')
      expect(result.kerfCount).toBe(0)
    })

    it('should return G12_KERF_DEPTH_UNSAFE when web is below 15% of thickness', () => {
      const params: KerfBendingParams = {
        ...standardParams,
        webThickness: 1.0,  // 1.0 < 15% of 18mm = 2.7mm
      }
      const result = calculateKerfBending(params)
      expect(result.errors).toContain('G12_KERF_DEPTH_UNSAFE')
    })

    it('should have no errors for a valid standard MDF bend', () => {
      const result = calculateKerfBending(standardParams)
      // R=150 >= R_min=144, web auto-calc is well above 15% → no blockers
      expect(result.errors).not.toContain('G12_MATERIAL_DATA_MISSING')
      expect(result.errors).not.toContain('G12_KERF_DEPTH_UNSAFE')
    })

    it('variable p(s) — spacing should be clamped to max 25mm for large radii', () => {
      // Large R → large p before clamp → clamp to 25
      const result = calculateKerfBending({ ...standardParams, bendRadius: 500 })
      expect(result.kerfSpacing).toBeLessThanOrEqual(25)
    })

    it('variable p(s) — spacing should respect p_min = max(1.8×k_eff, 5)', () => {
      const result = calculateKerfBending(standardParams)
      const p_min = Math.max(1.8 * 3.2, 5)  // 5.76mm
      expect(result.kerfSpacing).toBeGreaterThanOrEqual(p_min)
    })
  })
})
