/**
 * project.schema.ts - Zod Schema for Project Validation
 *
 * GATE RULE (G9): No unvalidated external state enters OperationGraph.
 * This schema validates Project data from external sources:
 * - localStorage
 * - JSON import
 * - API responses
 * - Deep links
 *
 * @version 1.1.0 - Schema Pack v1
 */

import { z } from 'zod';
import { CabinetSchema } from './cabinet.schema';
import { IdSchema, Nullish, IsoDateSchema, TimestampSchema } from './common.schema';

// ============================================
// PROJECT VERSIONING
// ============================================

/** Semantic version string (e.g., "2.1.0") */
export const ProjectVersionSchema = z.string().regex(
  /^\d+\.\d+\.\d+$/,
  'Version must be in semver format (e.g., "2.1.0")'
).or(z.string().min(1)); // Allow non-semver for legacy

/** Schema version for migration support */
export const SchemaVersionSchema = z.number().int().nonnegative().default(1);

// ============================================
// PROJECT METADATA SCHEMA
// ============================================

export const ProjectMetadataSchema = z.object({
  /** Unique project identifier */
  id: z.string().min(1),
  /** Human-readable project name */
  name: z.string().min(1),
  /** Semantic version string */
  version: z.string(),
  /** Unix timestamp of creation */
  createdAt: z.number().int().positive(),
  /** Unix timestamp of last update */
  updatedAt: z.number().int().positive(),
  /** Optional project description */
  description: z.string().optional(),
  /** Optional author/creator name */
  author: z.string().optional(),
});

// ============================================
// SCENE POSITION SCHEMA (for multi-cabinet layout)
// ============================================

export const ScenePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const SceneRotationSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const CabinetSceneConfigSchema = z.object({
  cabinetId: z.string().min(1),
  position: ScenePositionSchema.optional(),
  rotation: SceneRotationSchema.optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
});

// ============================================
// PROJECT DATA SCHEMA
// ============================================

/**
 * Complete project data schema for validation.
 *
 * This validates:
 * - Project metadata (id, name, version, timestamps)
 * - Active cabinet state
 * - Optional multi-cabinet array
 * - Scene layout information
 */
export const ProjectDataSchema = z.object({
  /** Project identification and tracking */
  metadata: ProjectMetadataSchema,

  /** Active cabinet state - can be partial during editing */
  cabinet: CabinetSchema.partial().or(z.record(z.string(), z.unknown())),

  /** All cabinets with scene positions/rotations */
  cabinets: z.array(CabinetSchema.partial().or(z.record(z.string(), z.unknown()))).optional(),

  /** Scene configuration for multi-cabinet layout */
  sceneConfig: z.array(CabinetSceneConfigSchema).optional(),
});

// ============================================
// SAVED PROJECT LIST SCHEMA
// ============================================

export const SavedProjectSchema = z.object({
  /** Project identifier */
  id: z.string().min(1),
  /** Project name for display */
  name: z.string(),
  /** Last update timestamp for sorting */
  updatedAt: z.number(),
  /** Cabinet count in project */
  cabinetCount: z.number().int().nonnegative().optional(),
  /** Thumbnail preview (base64) */
  thumbnail: z.string().optional(),
});

export const SavedProjectsListSchema = z.array(SavedProjectSchema);

// ============================================
// IMPORT/EXPORT SCHEMA
// ============================================

/**
 * Schema for imported project files.
 * More lenient than internal schema to handle legacy data.
 */
export const ImportedProjectSchema = z.object({
  metadata: z.object({
    // At minimum we need an ID or name
    id: z.string().optional(),
    name: z.string().optional(),
    version: z.string().optional(),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
    description: z.string().optional(),
    author: z.string().optional(),
  }),
  cabinet: z.record(z.string(), z.unknown()).optional(),
  cabinets: z.array(z.record(z.string(), z.unknown())).optional(),
}).refine(
  (data) => data.metadata.id || data.metadata.name,
  { message: 'Project must have either id or name' }
);

// ============================================
// STRICT VALIDATION SCHEMA (for export)
// ============================================

/**
 * Strict schema for export - ensures all required data is present.
 */
export const ExportProjectSchema = z.object({
  metadata: ProjectMetadataSchema,
  cabinet: CabinetSchema,
  cabinets: z.array(CabinetSchema).optional(),
});

// ============================================
// TYPE EXPORTS
// ============================================

export type ProjectMetadataSchemaType = z.infer<typeof ProjectMetadataSchema>;
export type ProjectDataSchemaType = z.infer<typeof ProjectDataSchema>;
export type SavedProjectSchemaType = z.infer<typeof SavedProjectSchema>;
export type ImportedProjectSchemaType = z.infer<typeof ImportedProjectSchema>;
export type ExportProjectSchemaType = z.infer<typeof ExportProjectSchema>;
