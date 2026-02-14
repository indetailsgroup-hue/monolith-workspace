/**
 * Unit tests for vec3Utils
 *
 * Tests core vector math operations used throughout the application
 * for 3D cabinet positioning, snap calculations, and gizmo transforms.
 */

import { describe, it, expect } from 'vitest'
import {
  add,
  sub,
  scale,
  negate,
  dot,
  cross,
  len,
  lenSq,
  normalize,
  distance,
  distanceSq,
  lerp,
  clamp,
  clamp01,
  clampMagnitude,
  clampComponents,
  isNearZero,
  approxEqual,
  ZERO,
} from './vec3Utils'
import type { Vec3 } from '../types/SnapTypes'

describe('vec3Utils', () => {
  // ============================================
  // BASIC OPERATIONS
  // ============================================

  describe('add', () => {
    it('should add two vectors correctly', () => {
      const a: Vec3 = { x: 1, y: 2, z: 3 }
      const b: Vec3 = { x: 4, y: 5, z: 6 }
      expect(add(a, b)).toEqual({ x: 5, y: 7, z: 9 })
    })

    it('should handle negative values', () => {
      const a: Vec3 = { x: -1, y: -2, z: -3 }
      const b: Vec3 = { x: 1, y: 2, z: 3 }
      expect(add(a, b)).toEqual({ x: 0, y: 0, z: 0 })
    })

    it('should handle cabinet positions in mm', () => {
      const cabinetPos: Vec3 = { x: 600, y: 0, z: 0 }
      const offset: Vec3 = { x: 100, y: 50, z: 0 }
      expect(add(cabinetPos, offset)).toEqual({ x: 700, y: 50, z: 0 })
    })
  })

  describe('sub', () => {
    it('should subtract two vectors correctly', () => {
      const a: Vec3 = { x: 5, y: 7, z: 9 }
      const b: Vec3 = { x: 1, y: 2, z: 3 }
      expect(sub(a, b)).toEqual({ x: 4, y: 5, z: 6 })
    })

    it('should calculate delta between cabinet positions', () => {
      const newPos: Vec3 = { x: 800, y: 0, z: 200 }
      const oldPos: Vec3 = { x: 600, y: 0, z: 0 }
      const delta = sub(newPos, oldPos)
      expect(delta).toEqual({ x: 200, y: 0, z: 200 })
    })
  })

  describe('scale', () => {
    it('should scale vector by positive scalar', () => {
      const v: Vec3 = { x: 1, y: 2, z: 3 }
      expect(scale(v, 2)).toEqual({ x: 2, y: 4, z: 6 })
    })

    it('should scale vector by negative scalar', () => {
      const v: Vec3 = { x: 1, y: 2, z: 3 }
      expect(scale(v, -1)).toEqual({ x: -1, y: -2, z: -3 })
    })

    it('should scale by zero', () => {
      const v: Vec3 = { x: 1, y: 2, z: 3 }
      expect(scale(v, 0)).toEqual({ x: 0, y: 0, z: 0 })
    })
  })

  describe('negate', () => {
    it('should negate all components', () => {
      const v: Vec3 = { x: 1, y: -2, z: 3 }
      expect(negate(v)).toEqual({ x: -1, y: 2, z: -3 })
    })
  })

  // ============================================
  // DOT & CROSS PRODUCTS
  // ============================================

  describe('dot', () => {
    it('should calculate dot product correctly', () => {
      const a: Vec3 = { x: 1, y: 0, z: 0 }
      const b: Vec3 = { x: 0, y: 1, z: 0 }
      expect(dot(a, b)).toBe(0) // Perpendicular vectors
    })

    it('should return positive for parallel vectors', () => {
      const a: Vec3 = { x: 1, y: 0, z: 0 }
      const b: Vec3 = { x: 2, y: 0, z: 0 }
      expect(dot(a, b)).toBe(2)
    })

    it('should return negative for opposite vectors', () => {
      const a: Vec3 = { x: 1, y: 0, z: 0 }
      const b: Vec3 = { x: -1, y: 0, z: 0 }
      expect(dot(a, b)).toBe(-1)
    })
  })

  describe('cross', () => {
    it('should calculate X cross Y = Z', () => {
      const x: Vec3 = { x: 1, y: 0, z: 0 }
      const y: Vec3 = { x: 0, y: 1, z: 0 }
      expect(cross(x, y)).toEqual({ x: 0, y: 0, z: 1 })
    })

    it('should calculate Y cross X = -Z', () => {
      const x: Vec3 = { x: 1, y: 0, z: 0 }
      const y: Vec3 = { x: 0, y: 1, z: 0 }
      expect(cross(y, x)).toEqual({ x: 0, y: 0, z: -1 })
    })

    it('should return zero for parallel vectors', () => {
      const a: Vec3 = { x: 1, y: 0, z: 0 }
      const b: Vec3 = { x: 2, y: 0, z: 0 }
      expect(cross(a, b)).toEqual({ x: 0, y: 0, z: 0 })
    })
  })

  // ============================================
  // LENGTH & NORMALIZATION
  // ============================================

  describe('len', () => {
    it('should calculate length of unit vectors', () => {
      expect(len({ x: 1, y: 0, z: 0 })).toBe(1)
      expect(len({ x: 0, y: 1, z: 0 })).toBe(1)
      expect(len({ x: 0, y: 0, z: 1 })).toBe(1)
    })

    it('should calculate 3-4-5 triangle correctly', () => {
      const v: Vec3 = { x: 3, y: 4, z: 0 }
      expect(len(v)).toBe(5)
    })

    it('should calculate cabinet diagonal', () => {
      // 600x720 cabinet diagonal
      // sqrt(600^2 + 720^2) = sqrt(878400) ≈ 937.23
      const diagonal: Vec3 = { x: 600, y: 720, z: 0 }
      expect(len(diagonal)).toBeCloseTo(937.23, 1)
    })
  })

  describe('lenSq', () => {
    it('should calculate squared length', () => {
      const v: Vec3 = { x: 3, y: 4, z: 0 }
      expect(lenSq(v)).toBe(25) // 5^2
    })
  })

  describe('normalize', () => {
    it('should normalize to unit length', () => {
      const v: Vec3 = { x: 3, y: 4, z: 0 }
      const n = normalize(v)
      expect(len(n)).toBeCloseTo(1, 6)
      expect(n.x).toBeCloseTo(0.6, 6)
      expect(n.y).toBeCloseTo(0.8, 6)
    })

    it('should handle zero vector', () => {
      const v: Vec3 = { x: 0, y: 0, z: 0 }
      expect(normalize(v)).toEqual({ x: 0, y: 0, z: 0 })
    })

    it('should handle very small vector', () => {
      const v: Vec3 = { x: 1e-10, y: 0, z: 0 }
      expect(normalize(v)).toEqual({ x: 0, y: 0, z: 0 })
    })
  })

  // ============================================
  // DISTANCE
  // ============================================

  describe('distance', () => {
    it('should calculate distance between points', () => {
      const a: Vec3 = { x: 0, y: 0, z: 0 }
      const b: Vec3 = { x: 3, y: 4, z: 0 }
      expect(distance(a, b)).toBe(5)
    })

    it('should calculate gap between cabinets', () => {
      const cabinet1: Vec3 = { x: 0, y: 0, z: 0 }
      const cabinet2: Vec3 = { x: 620, y: 0, z: 0 } // 600mm wide cabinet + 20mm gap
      expect(distance(cabinet1, cabinet2)).toBe(620)
    })
  })

  describe('distanceSq', () => {
    it('should calculate squared distance', () => {
      const a: Vec3 = { x: 0, y: 0, z: 0 }
      const b: Vec3 = { x: 3, y: 4, z: 0 }
      expect(distanceSq(a, b)).toBe(25)
    })
  })

  // ============================================
  // INTERPOLATION
  // ============================================

  describe('lerp', () => {
    it('should return a at t=0', () => {
      const a: Vec3 = { x: 0, y: 0, z: 0 }
      const b: Vec3 = { x: 10, y: 10, z: 10 }
      expect(lerp(a, b, 0)).toEqual(a)
    })

    it('should return b at t=1', () => {
      const a: Vec3 = { x: 0, y: 0, z: 0 }
      const b: Vec3 = { x: 10, y: 10, z: 10 }
      expect(lerp(a, b, 1)).toEqual(b)
    })

    it('should return midpoint at t=0.5', () => {
      const a: Vec3 = { x: 0, y: 0, z: 0 }
      const b: Vec3 = { x: 10, y: 10, z: 10 }
      expect(lerp(a, b, 0.5)).toEqual({ x: 5, y: 5, z: 5 })
    })

    it('should work for cabinet animation', () => {
      const start: Vec3 = { x: 0, y: 0, z: 0 }
      const end: Vec3 = { x: 600, y: 0, z: 0 }
      const mid = lerp(start, end, 0.25)
      expect(mid.x).toBe(150)
    })
  })

  // ============================================
  // CLAMPING
  // ============================================

  describe('clamp', () => {
    it('should clamp value within range', () => {
      expect(clamp(5, 0, 10)).toBe(5)
      expect(clamp(-5, 0, 10)).toBe(0)
      expect(clamp(15, 0, 10)).toBe(10)
    })

    it('should clamp cabinet width to valid range', () => {
      const minWidth = 150
      const maxWidth = 1200
      expect(clamp(100, minWidth, maxWidth)).toBe(150)
      expect(clamp(600, minWidth, maxWidth)).toBe(600)
      expect(clamp(1500, minWidth, maxWidth)).toBe(1200)
    })
  })

  describe('clamp01', () => {
    it('should clamp to 0-1 range', () => {
      expect(clamp01(-0.5)).toBe(0)
      expect(clamp01(0.5)).toBe(0.5)
      expect(clamp01(1.5)).toBe(1)
    })
  })

  describe('clampMagnitude', () => {
    it('should not modify vector within limit', () => {
      const v: Vec3 = { x: 3, y: 4, z: 0 } // length = 5
      const clamped = clampMagnitude(v, 10)
      expect(clamped).toEqual(v)
    })

    it('should clamp vector exceeding limit', () => {
      const v: Vec3 = { x: 6, y: 8, z: 0 } // length = 10
      const clamped = clampMagnitude(v, 5)
      expect(len(clamped)).toBeCloseTo(5, 6)
    })
  })

  describe('clampComponents', () => {
    it('should clamp each component independently', () => {
      const v: Vec3 = { x: -10, y: 5, z: 100 }
      expect(clampComponents(v, 0, 50)).toEqual({ x: 0, y: 5, z: 50 })
    })
  })

  // ============================================
  // UTILITIES
  // ============================================

  describe('ZERO', () => {
    it('should be zero vector', () => {
      expect(ZERO).toEqual({ x: 0, y: 0, z: 0 })
    })
  })

  describe('isNearZero', () => {
    it('should return true for zero vector', () => {
      expect(isNearZero({ x: 0, y: 0, z: 0 })).toBe(true)
    })

    it('should return true for very small vector', () => {
      expect(isNearZero({ x: 1e-7, y: 1e-7, z: 1e-7 })).toBe(true)
    })

    it('should return false for non-zero vector', () => {
      expect(isNearZero({ x: 1, y: 0, z: 0 })).toBe(false)
    })

    it('should respect custom epsilon', () => {
      const v: Vec3 = { x: 0.5, y: 0, z: 0 }
      expect(isNearZero(v, 0.1)).toBe(false)
      expect(isNearZero(v, 1)).toBe(true)
    })
  })

  describe('approxEqual', () => {
    it('should return true for equal vectors', () => {
      const a: Vec3 = { x: 1, y: 2, z: 3 }
      const b: Vec3 = { x: 1, y: 2, z: 3 }
      expect(approxEqual(a, b)).toBe(true)
    })

    it('should return true for nearly equal vectors', () => {
      const a: Vec3 = { x: 1, y: 2, z: 3 }
      const b: Vec3 = { x: 1.0000001, y: 2.0000001, z: 3.0000001 }
      expect(approxEqual(a, b)).toBe(true)
    })

    it('should return false for different vectors', () => {
      const a: Vec3 = { x: 1, y: 2, z: 3 }
      const b: Vec3 = { x: 1.1, y: 2, z: 3 }
      expect(approxEqual(a, b)).toBe(false)
    })

    it('should handle cabinet position comparison', () => {
      const expected: Vec3 = { x: 600, y: 0, z: 0 }
      const actual: Vec3 = { x: 600.00001, y: 0, z: 0 } // Floating point result
      expect(approxEqual(expected, actual, 0.001)).toBe(true)
    })
  })
})
