/**
 * hardware.schema.ts - Hardware Configuration Schemas
 *
 * GATE RULE (G9): Validates hardware configurations with discriminated unions.
 *
 * Hardware types:
 * - MINIFIX: Minifix S200 connector system
 * - CAM: Cam lock fittings
 * - DOWEL: Wooden dowels
 * - HINGE: Door hinges (concealed/piano)
 * - SHELF_PIN: Adjustable shelf pins
 * - DRAWER_SLIDE: Drawer slide systems
 * - GENERIC: Custom/other hardware
 *
 * @version 1.0.0 - Schema Pack v1
 */

import { z } from 'zod';
import { IdSchema, Nullish, PositiveMmSchema, NonNegativeMmSchema } from './common.schema';

// ============================================
// HARDWARE TYPE DISCRIMINATOR
// ============================================

export const HardwareTypeSchema = z.enum([
  'MINIFIX',
  'CAM',
  'DOWEL',
  'HINGE',
  'SHELF_PIN',
  'DRAWER_SLIDE',
  'GENERIC',
]);

// ============================================
// MINIFIX CONFIGURATION
// ============================================

/**
 * Minifix S200 connector configuration
 * Per Häfele CAD specifications
 */
export const MinifixConfigSchema = z.object({
  type: z.literal('MINIFIX'),
  /** Preset identifier (e.g., "builtin_minifix_16mm") */
  presetId: z.string().min(1).optional(),
  /** Cam housing diameter (typically 15mm) */
  camDiaMm: PositiveMmSchema.default(15),
  /** Cam housing depth */
  camDepthMm: PositiveMmSchema.default(13.5),  // 13.5mm for 18mm wood per Häfele FF 3.10
  /** Bolt diameter (typically 5mm or 6mm) */
  boltDiaMm: PositiveMmSchema.default(5),
  /** Bolt sleeve diameter (typically 10mm) */
  sleeveDiaMm: PositiveMmSchema.default(10),
  /** Bolt sleeve length */
  sleeveLengthMm: PositiveMmSchema.default(17.5),
  /** Distance B: edge to bolt center (24mm per CAD spec) */
  drillingDistanceB: PositiveMmSchema.default(24),
  /** Wood thickness this config is designed for */
  woodThicknessMm: PositiveMmSchema.default(16),
});

// ============================================
// CAM LOCK CONFIGURATION
// ============================================

/**
 * Cam lock fitting configuration
 */
export const CamConfigSchema = z.object({
  type: z.literal('CAM'),
  /** Cam housing diameter */
  camDiaMm: PositiveMmSchema,
  /** Cam housing depth */
  housingDepthMm: PositiveMmSchema,
  /** Cam rotation angle (degrees) */
  rotationAngle: z.number().min(0).max(360).default(90),
});

// ============================================
// DOWEL CONFIGURATION
// ============================================

/**
 * Wooden dowel configuration
 */
export const DowelConfigSchema = z.object({
  type: z.literal('DOWEL'),
  /** Dowel diameter (typically 8mm or 10mm) */
  dowelDiaMm: PositiveMmSchema.default(8),
  /** Dowel length */
  dowelLengthMm: PositiveMmSchema.default(30),
  /** Drilling depth into each panel */
  dowelDepthMm: PositiveMmSchema.default(15),
});

// ============================================
// HINGE CONFIGURATION
// ============================================

/** Hinge type */
export const HingeTypeSchema = z.enum([
  'CONCEALED',       // European concealed hinge
  'PIANO',           // Piano/continuous hinge
  'BUTT',            // Butt hinge
  'PIVOT',           // Pivot hinge
]);

/** Hinge opening angle */
export const HingeAngleSchema = z.enum([
  '95',
  '110',
  '165',
  '170',
]);

/**
 * Door hinge configuration
 */
export const HingeConfigSchema = z.object({
  type: z.literal('HINGE'),
  /** Hinge sub-type */
  hingeType: HingeTypeSchema.default('CONCEALED'),
  /** Cup diameter (typically 35mm) */
  cupDiaMm: PositiveMmSchema.default(35),
  /** Cup boring depth */
  cupDepthMm: PositiveMmSchema.default(12),
  /** Door overlay amount */
  overlayMm: Nullish(z.number()),
  /** Opening angle */
  angle: HingeAngleSchema.default('110'),
  /** Soft-close feature */
  softClose: z.boolean().default(false),
});

// ============================================
// SHELF PIN CONFIGURATION
// ============================================

/**
 * Adjustable shelf pin configuration
 */
export const ShelfPinConfigSchema = z.object({
  type: z.literal('SHELF_PIN'),
  /** Pin diameter (typically 5mm) */
  pinDiaMm: PositiveMmSchema.default(5),
  /** Hole depth */
  holeDepthMm: PositiveMmSchema.default(12),
  /** System 32 pitch (32mm standard) */
  pitchMm: PositiveMmSchema.default(32),
  /** First hole distance from edge */
  firstHoleOffsetMm: PositiveMmSchema.default(37),
});

// ============================================
// DRAWER SLIDE CONFIGURATION
// ============================================

/** Drawer slide type */
export const SlideTypeSchema = z.enum([
  'ROLLER',          // Basic roller slides
  'BALL_BEARING',    // Ball bearing slides
  'UNDERMOUNT',      // Undermount slides
  'SIDE_MOUNT',      // Side mount slides
]);

/**
 * Drawer slide configuration
 */
export const DrawerSlideConfigSchema = z.object({
  type: z.literal('DRAWER_SLIDE'),
  /** Slide sub-type */
  slideType: SlideTypeSchema.default('BALL_BEARING'),
  /** Slide model/SKU */
  slideModel: z.string().min(1).optional(),
  /** Slide extension (mm) */
  extensionMm: PositiveMmSchema.optional(),
  /** Required side clearance */
  requiredClearanceMm: NonNegativeMmSchema.default(12.7),
  /** Weight capacity (kg) */
  capacityKg: z.number().positive().optional(),
  /** Soft-close feature */
  softClose: z.boolean().default(false),
});

// ============================================
// GENERIC HARDWARE CONFIGURATION
// ============================================

/**
 * Generic/custom hardware configuration
 */
export const GenericHardwareConfigSchema = z.object({
  type: z.literal('GENERIC'),
  /** Hardware name/description */
  name: z.string().min(1),
  /** Optional SKU/part number */
  partNumber: z.string().optional(),
  /** Custom properties */
  properties: z.record(z.string(), z.unknown()).optional(),
});

// ============================================
// DISCRIMINATED UNION
// ============================================

/**
 * Hardware configuration - discriminated union by type
 */
export const HardwareConfigSchema = z.discriminatedUnion('type', [
  MinifixConfigSchema,
  CamConfigSchema,
  DowelConfigSchema,
  HingeConfigSchema,
  ShelfPinConfigSchema,
  DrawerSlideConfigSchema,
  GenericHardwareConfigSchema,
]);

// ============================================
// HARDWARE INSTANCE
// ============================================

/**
 * Hardware instance with unique ID
 */
export const HardwareInstanceSchema = z.object({
  id: IdSchema,
  /** Hardware configuration */
  config: HardwareConfigSchema,
  /** Quantity */
  quantity: z.number().int().positive().default(1),
  /** Notes */
  notes: z.string().optional(),
});

/**
 * Hardware point override (per joint/location)
 */
export const HardwarePointOverrideSchema = z.object({
  /** Point identifier (e.g., "left-top-back") */
  pointId: IdSchema,
  /** Override config (partial - allows any hardware config properties) */
  config: z.record(z.string(), z.unknown()).optional(),
  /** Skip this hardware point */
  skip: z.boolean().default(false),
});

// ============================================
// LEGACY COMPATIBILITY
// ============================================

/**
 * Legacy hardware settings (for backwards compatibility)
 */
export const LegacyHardwareSettingsSchema = z.object({
  /** Enable hardware generation */
  enabled: z.boolean().default(true),
  /** Minifix preset ID */
  minifixPreset: z.string().optional(),
  /** Show preview in 3D */
  showPreview: z.boolean().default(true),
});

// ============================================
// TYPE EXPORTS
// ============================================

export type HardwareType = z.infer<typeof HardwareTypeSchema>;
export type MinifixConfig = z.infer<typeof MinifixConfigSchema>;
export type CamConfig = z.infer<typeof CamConfigSchema>;
export type DowelConfig = z.infer<typeof DowelConfigSchema>;
export type HingeConfig = z.infer<typeof HingeConfigSchema>;
export type ShelfPinConfig = z.infer<typeof ShelfPinConfigSchema>;
export type DrawerSlideConfig = z.infer<typeof DrawerSlideConfigSchema>;
export type GenericHardwareConfig = z.infer<typeof GenericHardwareConfigSchema>;
export type HardwareConfig = z.infer<typeof HardwareConfigSchema>;
export type HardwareInstance = z.infer<typeof HardwareInstanceSchema>;
export type HardwarePointOverride = z.infer<typeof HardwarePointOverrideSchema>;
