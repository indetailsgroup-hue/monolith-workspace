/**
 * vec3Utils.ts - Vector3 Math Utilities
 *
 * FEATURES:
 * - Basic vector operations (add, sub, scale, dot, cross)
 * - Length and normalization
 * - Clamping utilities
 *
 * All operations work with mm units
 */

import type { Vec3 } from '../types/SnapTypes';

// ============================================
// BASIC OPERATIONS
// ============================================

/**
 * Add two vectors
 */
export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * Subtract b from a
 */
export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * Scale vector by scalar
 */
export function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/**
 * Negate vector
 */
export function negate(v: Vec3): Vec3 {
  return { x: -v.x, y: -v.y, z: -v.z };
}

// ============================================
// DOT & CROSS PRODUCTS
// ============================================

/**
 * Dot product of two vectors
 */
export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Cross product of two vectors
 */
export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

// ============================================
// LENGTH & NORMALIZATION
// ============================================

/**
 * Length (magnitude) of vector
 */
export function len(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Squared length (avoids sqrt for comparisons)
 */
export function lenSq(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

/**
 * Normalize vector to unit length
 */
export function normalize(v: Vec3): Vec3 {
  const l = len(v);
  if (l < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

// ============================================
// DISTANCE
// ============================================

/**
 * Distance between two points
 */
export function distance(a: Vec3, b: Vec3): number {
  return len(sub(a, b));
}

/**
 * Squared distance (avoids sqrt)
 */
export function distanceSq(a: Vec3, b: Vec3): number {
  return lenSq(sub(a, b));
}

// ============================================
// INTERPOLATION
// ============================================

/**
 * Linear interpolation between two vectors
 */
export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

// ============================================
// CLAMPING
// ============================================

/**
 * Clamp scalar to range
 */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Clamp 0-1
 */
export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/**
 * Clamp vector magnitude
 */
export function clampMagnitude(v: Vec3, maxLen: number): Vec3 {
  const l = len(v);
  if (l <= maxLen) return v;
  return scale(v, maxLen / l);
}

/**
 * Clamp each component independently
 */
export function clampComponents(v: Vec3, min: number, max: number): Vec3 {
  return {
    x: clamp(v.x, min, max),
    y: clamp(v.y, min, max),
    z: clamp(v.z, min, max),
  };
}

// ============================================
// UTILITIES
// ============================================

/**
 * Zero vector
 */
export const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Check if vector is near zero
 */
export function isNearZero(v: Vec3, epsilon: number = 1e-6): boolean {
  return lenSq(v) < epsilon * epsilon;
}

/**
 * Check if two vectors are approximately equal
 */
export function approxEqual(a: Vec3, b: Vec3, epsilon: number = 1e-6): boolean {
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.z - b.z) < epsilon
  );
}
