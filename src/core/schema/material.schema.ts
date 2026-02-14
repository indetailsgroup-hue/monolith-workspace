/**
 * material.schema.ts - Material Validation Schemas
 *
 * GATE RULE (G9): Validates material definitions and overrides.
 *
 * Material kinds:
 * - CORE: Board material (MDF, particle board, plywood)
 * - SURFACE: Face laminate (melamine, HPL, veneer)
 * - EDGE: Edge banding material
 *
 * @version 1.0.0 - Schema Pack v1
 */

import { z } from 'zod';
import { IdSchema, Nullish, PositiveMmSchema, NonNegativeMmSchema } from './common.schema';

// ============================================
// MATERIAL KIND & FINISH
// ============================================

/** Material kind discriminator */
export const MaterialKindSchema = z.enum(['CORE', 'SURFACE', 'EDGE']);

/** Surface finish type */
export const FinishSchema = z.enum([
  'MATTE',
  'SATIN',
  'GLOSS',
  'TEXTURED',
  'SUPER_MATTE', // FENIX NTM
  'METALLIC',    // FENIX NTA
]);

/** Material type (for backwards compatibility with existing MaterialRegistry) */
export const MaterialTypeSchema = z.enum([
  'MELAMINE',
  'HPL',
  'FENIX_NTM',
  'FENIX_NTA',
  'MDF',
  'PLYWOOD',
  'PARTICLE_BOARD',
  'SOLID_WOOD',
  'EDGE_BAND',
  'OTHER',
]);

// ============================================
// MATERIAL DEFINITION
// ============================================

/**
 * Full material definition (for MaterialRegistry)
 */
export const MaterialSchema = z.object({
  id: IdSchema,
  code: z.string().min(1).optional(),           // e.g. "MEL-WHITE-001"
  name: z.string().min(1),
  kind: MaterialKindSchema.optional(),          // CORE/SURFACE/EDGE
  type: MaterialTypeSchema.optional(),          // Legacy type field
  thicknessMm: PositiveMmSchema.optional(),     // for CORE/EDGE (surface may be thin)
  thickness: z.number().positive().optional(),  // Legacy: thickness without Mm suffix
  finish: Nullish(FinishSchema),
  costTHBPerM2: Nullish(NonNegativeMmSchema),
  costPerSqm: Nullish(z.number().nonnegative()), // Legacy field name
  co2KgPerM2: Nullish(NonNegativeMmSchema),
  textureUrl: Nullish(z.string()),              // Allow relative paths
  texture: Nullish(z.string()),                 // Legacy field name
  thumbnail: Nullish(z.string()),               // Thumbnail URL
  density: Nullish(z.number().positive()),      // kg/m³
  manufacturer: Nullish(z.string()),
  category: Nullish(z.string()),
  description: Nullish(z.string()),
  notes: Nullish(z.string()),
});

/**
 * Material reference (ID only)
 */
export const MaterialRefSchema = z.object({
  materialId: IdSchema,
});

/**
 * Simple material ID reference (string)
 */
export const MaterialIdSchema = IdSchema;

// ============================================
// SURFACE OVERRIDES (Face A/B)
// ============================================

/** Panel face identifier */
export const FaceSchema = z.enum(['A', 'B']);

/**
 * Surface override for a specific face
 */
export const SurfaceOverrideSchema = z.object({
  face: FaceSchema,
  surface: MaterialRefSchema,
});

// ============================================
// EDGE BANDING OVERRIDES
// ============================================

/** Edge side identifier */
export const EdgeSideSchema = z.enum([
  'TOP',
  'BOTTOM',
  'LEFT',
  'RIGHT',
  'FRONT',
  'BACK',
]);

/**
 * Edge banding override for a specific side
 */
export const EdgeBandingOverrideSchema = z.object({
  side: EdgeSideSchema,
  edge: MaterialRefSchema,
});

/**
 * Legacy edge banding map (side -> boolean)
 */
export const EdgeBandingMapSchema = z.object({
  top: z.boolean().default(false),
  bottom: z.boolean().default(false),
  left: z.boolean().default(false),
  right: z.boolean().default(false),
  front: z.boolean().default(false),
  back: z.boolean().default(false),
});

// ============================================
// MATERIAL ASSIGNMENTS
// ============================================

/**
 * Complete material assignment for a cabinet
 * Includes base materials and per-panel overrides
 */
export const MaterialAssignmentSchema = z.object({
  /** Default core material ID */
  core: MaterialIdSchema,
  /** Default surface material ID */
  surface: MaterialIdSchema.optional(),
  /** Default edge material ID */
  edge: MaterialIdSchema.optional(),
  /** Per-panel overrides (panelId -> materialId) */
  overrides: z.record(z.string(), MaterialIdSchema).optional(),
});

// ============================================
// TYPE EXPORTS
// ============================================

export type MaterialKind = z.infer<typeof MaterialKindSchema>;
export type Finish = z.infer<typeof FinishSchema>;
export type MaterialType = z.infer<typeof MaterialTypeSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type MaterialRef = z.infer<typeof MaterialRefSchema>;
export type Face = z.infer<typeof FaceSchema>;
export type EdgeSide = z.infer<typeof EdgeSideSchema>;
export type SurfaceOverride = z.infer<typeof SurfaceOverrideSchema>;
export type EdgeBandingOverride = z.infer<typeof EdgeBandingOverrideSchema>;
export type EdgeBandingMap = z.infer<typeof EdgeBandingMapSchema>;
export type MaterialAssignment = z.infer<typeof MaterialAssignmentSchema>;
