/**
 * lineage.schema.ts - Zod Schemas for P9 Spec Lineage
 *
 * GATE RULE (G9): Validates lineage events from localStorage/JSONL.
 *
 * @version 1.0.0
 */

import { z } from 'zod';

// ============================================
// ENUM SCHEMAS
// ============================================

export const SpecLineageEventTypeSchema = z.enum([
  'SPEC_FROZEN',
  'SPEC_RELEASED',
  'SPEC_REVOKED',
  'EXPORT_SUCCESS_LINK',
]);

export const ChangeClassSchema = z.enum([
  'GEOMETRY',
  'MATERIAL',
  'HARDWARE',
  'TOOLPATHS',
  'NESTING',
  'METADATA',
]);

// ============================================
// NESTED OBJECT SCHEMAS
// ============================================

export const LineageActorSchema = z.object({
  role: z.string().optional(),
  name: z.string().optional(),
  keyId: z.string().optional(),
});

export const LineageRevisionSchema = z.object({
  revisionId: z.string().min(1),
  parentRevisionId: z.string().optional(),
  packetSha256: z.string().optional(),
  manifestSha256: z.string().optional(),
});

export const LineageExportSchema = z.object({
  exportId: z.string().optional(),
  artifactSha256: z.string().optional(),
  dialect: z.string().optional(),
  profileId: z.string().optional(),
  mode: z.string().optional(),
});

// ============================================
// MAIN EVENT SCHEMA
// ============================================

export const SpecLineageEventSchema = z.object({
  id: z.string().min(1),
  at: z.string().min(1), // ISO 8601 timestamp
  jobId: z.string().min(1),
  specId: z.string().min(1),
  type: SpecLineageEventTypeSchema,
  actor: LineageActorSchema.optional(),
  revision: LineageRevisionSchema,
  note: z.string().optional(),
  changeClass: ChangeClassSchema.optional(),
  export: LineageExportSchema.optional(),
});

// ============================================
// ARRAY SCHEMA
// ============================================

export const SpecLineageEventArraySchema = z.array(SpecLineageEventSchema);

// ============================================
// TYPE EXPORTS
// ============================================

export type SpecLineageEventSchemaType = z.infer<typeof SpecLineageEventSchema>;
