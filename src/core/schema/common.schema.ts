/**
 * common.schema.ts - Shared Zod Primitives & Helpers
 *
 * GATE RULE (G9): Foundation types for all schema modules.
 *
 * @version 1.0.0 - Schema Pack v1
 */

import { z } from 'zod';

// ============================================
// PRIMITIVE SCHEMAS
// ============================================

/** Non-empty string identifier */
export const IdSchema = z.string().min(1);

/** 3D vector with finite numbers */
export const Vec3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

/** Tuple-style 3D position [x, y, z] */
export const Vec3TupleSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);

/** RGB color (0-255 range) */
export const RgbSchema = z.object({
  r: z.number().int().min(0).max(255),
  g: z.number().int().min(0).max(255),
  b: z.number().int().min(0).max(255),
});

/** Hex color string */
export const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** ISO date string or legacy format */
export const IsoDateSchema = z.string().datetime().or(z.string().min(8));

/** Unix timestamp (milliseconds) */
export const TimestampSchema = z.number().int().positive();

// ============================================
// DIMENSION SCHEMAS
// ============================================

/** Positive dimension in millimeters */
export const PositiveMmSchema = z.number().positive();

/** Non-negative dimension (can be 0) */
export const NonNegativeMmSchema = z.number().nonnegative();

/** Standard dimension range for cabinet parts (1mm - 5000mm) */
export const CabinetDimensionSchema = z.number().min(1).max(5000);

// ============================================
// HELPER TYPES
// ============================================

/**
 * Strict record helper - ensures key and value types
 * Key must be string, number, or symbol compatible
 */
export const StrictRecord = <V extends z.ZodTypeAny>(v: V) =>
  z.record(z.string(), v);

/**
 * Nullish helper - optional and nullable for legacy tolerance
 */
export const Nullish = <T extends z.ZodTypeAny>(t: T) =>
  t.optional().nullable();

/**
 * Default empty array helper
 */
export const EmptyArray = <T extends z.ZodTypeAny>(t: T) =>
  z.array(t).default([]);

// ============================================
// TYPE EXPORTS
// ============================================

export type Vec3 = z.infer<typeof Vec3Schema>;
export type Vec3Tuple = z.infer<typeof Vec3TupleSchema>;
export type Rgb = z.infer<typeof RgbSchema>;
