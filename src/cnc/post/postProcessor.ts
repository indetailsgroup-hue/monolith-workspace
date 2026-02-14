/**
 * postProcessor.ts - Post Processor Registry and Selection
 *
 * Manages dialect selection and provides unified post-processing interface.
 *
 * @version 1.0.0 - Phase D2
 */

import type { MachineProfile } from '../machine/machineProfile';
import type { PostProcessor, GcodeDialect } from './types';
import { fanucPostProcessor } from './dialects/fanuc';
import { biesseIsoPostProcessor } from './dialects/biesseIso';
import { heidenhainPostProcessor } from './dialects/heidenhain';
import { weekePostProcessor } from './dialects/weeke';

// ============================================================================
// Dialect Registry
// ============================================================================

/**
 * Registry of available post processors by dialect.
 */
const postProcessorRegistry: Record<GcodeDialect, PostProcessor> = {
  FANUC: fanucPostProcessor,
  BIESSE_ISO: biesseIsoPostProcessor,
  // Aliases - map to existing processors
  BIESSE: biesseIsoPostProcessor,      // BIESSE uses BIESSE_ISO format
  HEIDENHAIN: heidenhainPostProcessor, // HEIDENHAIN conversational format
  WEEKE: weekePostProcessor,           // WEEKE/Homag ISO variant
};

/**
 * Map machine IDs to dialects.
 */
const machineDialectMap: Record<string, GcodeDialect> = {
  KDT: 'FANUC',
  BIESSE: 'BIESSE_ISO',
};

/**
 * Map dialect aliases to canonical dialect names.
 * Handles variations like machine.dialect='BIESSE' -> registry key 'BIESSE_ISO'.
 */
const dialectAliases: Record<string, GcodeDialect> = {
  BIESSE: 'BIESSE_ISO',
  FANUC: 'FANUC',
  BIESSE_ISO: 'BIESSE_ISO',
};

// ============================================================================
// Public Functions
// ============================================================================

/**
 * Get the post processor for a specific dialect.
 *
 * @param dialect - G-code dialect identifier
 * @returns Post processor for the dialect
 * @throws Error if dialect is not supported
 */
export function getPostProcessorByDialect(dialect: GcodeDialect): PostProcessor {
  const processor = postProcessorRegistry[dialect];
  if (!processor) {
    throw new Error(`Unsupported G-code dialect: ${dialect}`);
  }
  return processor;
}

/**
 * Get the post processor for a machine profile.
 * Uses the machine's dialect field or falls back to ID-based mapping.
 *
 * @param machine - Machine profile or machine ID string
 * @returns Post processor for the machine
 */
export function getPostProcessor(machine: MachineProfile | string): PostProcessor {
  if (typeof machine === 'string') {
    // Machine ID provided
    const dialect = machineDialectMap[machine] ?? 'FANUC';
    return getPostProcessorByDialect(dialect);
  }

  // Machine profile provided - use dialect field with alias resolution
  const rawDialect = machine.dialect ?? machineDialectMap[machine.id] ?? 'FANUC';
  const dialect = dialectAliases[rawDialect] ?? (rawDialect as GcodeDialect);
  return getPostProcessorByDialect(dialect);
}

/**
 * Get list of supported dialects.
 */
export function getSupportedDialects(): GcodeDialect[] {
  return Object.keys(postProcessorRegistry) as GcodeDialect[];
}

/**
 * Check if a dialect is supported.
 */
export function isDialectSupported(dialect: string): dialect is GcodeDialect {
  return dialect in postProcessorRegistry;
}

/**
 * Register a custom post processor.
 * Useful for adding machine-specific posts without modifying core code.
 *
 * @param dialect - Dialect identifier
 * @param processor - Post processor implementation
 */
export function registerPostProcessor(
  dialect: GcodeDialect,
  processor: PostProcessor
): void {
  postProcessorRegistry[dialect] = processor;
}

/**
 * Register a machine ID to dialect mapping.
 *
 * @param machineId - Machine ID
 * @param dialect - Dialect to use for this machine
 */
export function registerMachineDialect(machineId: string, dialect: GcodeDialect): void {
  machineDialectMap[machineId] = dialect;
}
