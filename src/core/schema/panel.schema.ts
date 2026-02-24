/**
 * panel.schema.ts - Panel Validation Schemas
 *
 * GATE RULE (G9): Validates panel definitions with role-specific parameters.
 *
 * Panel roles:
 * - Structural: LEFT, RIGHT, TOP, BOTTOM, BACK
 * - Internal: SHELF, DIVIDER
 * - Movable: DOOR, DRAWER_FRONT
 *
 * @version 1.0.0 - Schema Pack v1
 */

import { z } from 'zod';
import { IdSchema, Nullish, PositiveMmSchema, NonNegativeMmSchema, Vec3TupleSchema } from './common.schema';
import {
  MaterialIdSchema,
  MaterialRefSchema,
  SurfaceOverrideSchema,
  EdgeBandingOverrideSchema,
  EdgeBandingMapSchema,
} from './material.schema';

// ============================================
// PANEL ROLE
// ============================================

/** Panel role in cabinet structure */
export const PanelRoleSchema = z.enum([
  // Structural panels
  'LEFT',
  'RIGHT',
  'TOP',
  'BOTTOM',
  'BACK',
  // Internal panels
  'SHELF',
  'DIVIDER',
  'PARTITION',
  // Movable panels
  'DOOR',
  'DRAWER_FRONT',
  'FRONT',
  // Specialty
  'TOE_KICK',
  'STRETCHER',
  'NAILER',
]);

// ============================================
// PANEL DIMENSIONS
// ============================================

/** Panel 2D size (width x height) */
export const PanelRectSchema = z.object({
  widthMm: PositiveMmSchema,
  heightMm: PositiveMmSchema,
});

/** Legacy dimension format (without Mm suffix) */
export const LegacyPanelDimensionsSchema = z.object({
  width: PositiveMmSchema,
  height: PositiveMmSchema,
  thickness: PositiveMmSchema.optional(),
});

// ============================================
// PANEL BASE SCHEMA
// ============================================

/**
 * Base panel properties shared by all panel types
 */
export const PanelBaseSchema = z.object({
  /** Unique panel identifier */
  id: IdSchema,

  /** Panel role in cabinet structure */
  role: PanelRoleSchema,

  /** Human-readable panel name */
  name: z.string().optional(),

  /** Panel dimensions (manufacturing truth) */
  size: PanelRectSchema.optional(),

  /** Legacy dimensions support */
  dimensions: LegacyPanelDimensionsSchema.optional(),

  /** Panel thickness */
  thicknessMm: PositiveMmSchema.optional(),
  thickness: PositiveMmSchema.optional(), // Legacy

  /** Base core material reference */
  core: MaterialRefSchema.optional(),
  materialId: MaterialIdSchema.optional(), // Legacy

  /** Surface overrides (Face A/B) */
  surfaces: z.array(SurfaceOverrideSchema).optional(),

  /** Edge banding overrides */
  edges: z.array(EdgeBandingOverrideSchema).optional(),
  edgeBanding: EdgeBandingMapSchema.optional(), // Legacy

  /** Position in cabinet (for rendering) */
  position: Vec3TupleSchema.optional(),

  /** Notes/comments */
  notes: Nullish(z.string()),
});

// ============================================
// ROLE-SPECIFIC PARAMETERS (Discriminated)
// ============================================

/**
 * Shelf-specific parameters
 */
export const ShelfParamsSchema = z.object({
  kind: z.literal('SHELF'),
  /** Number of shelves */
  count: z.number().int().positive().default(1),
  /** Setback from front edge */
  setbackMm: NonNegativeMmSchema.default(0),
  /** Adjustable shelf (uses shelf pins) */
  adjustable: z.boolean().default(true),
  /** Shelf pin hole pattern */
  pinPattern: z.enum(['SYSTEM_32', 'CUSTOM']).default('SYSTEM_32'),
});

/**
 * Divider-specific parameters
 */
export const DividerParamsSchema = z.object({
  kind: z.literal('DIVIDER'),
  /** Number of dividers */
  count: z.number().int().positive().default(1),
  /** Spacing mode */
  spacingMode: z.enum(['EQUAL', 'CUSTOM']).default('EQUAL'),
  /** Custom positions (if CUSTOM mode) */
  positions: z.array(PositiveMmSchema).optional(),
});

/**
 * Door-specific parameters
 */
export const DoorParamsSchema = z.object({
  kind: z.literal('DOOR'),
  /** Door swing direction */
  swing: z.enum(['LEFT', 'RIGHT', 'UP', 'DOWN', 'DOUBLE']),
  /** Gap around door edges */
  gapMm: NonNegativeMmSchema.default(2),
  /** Overlay type */
  overlay: z.enum(['FULL', 'HALF', 'INSET']).default('FULL'),
  /** Overlay amount (mm) */
  overlayMm: z.number().default(18),
});

/**
 * Drawer front parameters
 */
export const DrawerFrontParamsSchema = z.object({
  kind: z.literal('DRAWER_FRONT'),
  /** Gap around drawer front */
  gapMm: NonNegativeMmSchema.default(2),
  /** Handle/pull type */
  handleType: z.enum(['NONE', 'PULL', 'KNOB', 'J_PULL', 'INTEGRATED']).default('PULL'),
});

/**
 * Generic panel parameters (for structural panels)
 */
export const GenericPanelParamsSchema = z.object({
  kind: z.literal('GENERIC'),
});

/**
 * Discriminated union for panel parameters
 */
export const PanelParamsSchema = z.discriminatedUnion('kind', [
  ShelfParamsSchema,
  DividerParamsSchema,
  DoorParamsSchema,
  DrawerFrontParamsSchema,
  GenericPanelParamsSchema,
]);

// ============================================
// COMPLETE PANEL SCHEMA
// ============================================

/**
 * Complete panel schema with role-specific parameters
 */
export const PanelSchema = PanelBaseSchema.extend({
  /** Role-specific parameters */
  params: PanelParamsSchema.optional(),
});

/**
 * Computed panel values (derived, not user input)
 */
export const PanelComputedSchema = z.object({
  /** Actual cut dimensions after processing */
  cutWidth: PositiveMmSchema.optional(),
  cutHeight: PositiveMmSchema.optional(),
  /** Area in square meters */
  areaSqM: z.number().nonnegative().optional(),
  /** Weight in kg (if density known) */
  weightKg: z.number().nonnegative().optional(),
  /** Edge banding length needed */
  edgeLengthMm: NonNegativeMmSchema.optional(),
});

/**
 * Panel with computed values
 */
export const PanelWithComputedSchema = PanelSchema.extend({
  computed: PanelComputedSchema.optional(),
});

// ============================================
// PANEL ARRAY SCHEMAS
// ============================================

/** Array of panels */
export const PanelArraySchema = z.array(PanelSchema);

/** Array of panels with computed values */
export const PanelWithComputedArraySchema = z.array(PanelWithComputedSchema);

// ============================================
// TYPE EXPORTS
// ============================================

export type PanelRole = z.infer<typeof PanelRoleSchema>;
export type PanelRect = z.infer<typeof PanelRectSchema>;
export type PanelBase = z.infer<typeof PanelBaseSchema>;
export type ShelfParams = z.infer<typeof ShelfParamsSchema>;
export type DividerParams = z.infer<typeof DividerParamsSchema>;
export type DoorParams = z.infer<typeof DoorParamsSchema>;
export type DrawerFrontParams = z.infer<typeof DrawerFrontParamsSchema>;
export type PanelParams = z.infer<typeof PanelParamsSchema>;
export type Panel = z.infer<typeof PanelSchema>;
export type PanelComputed = z.infer<typeof PanelComputedSchema>;
export type PanelWithComputed = z.infer<typeof PanelWithComputedSchema>;
