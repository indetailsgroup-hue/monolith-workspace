/**
 * monolith/index.ts - MONOLITH Export Module
 *
 * Complete export system for MONOLITH cabinet design workspace:
 * - Context provider interface (extracts data from MONOLITH runtime)
 * - Factory package exporter (generates DXF, CSV, JSON)
 * - Builders for each file type
 */

// ============================================
// CONTEXT
// ============================================

export type {
  CutListRow,
  NestingSheet,
  MONOLITHExportContext,
  MONOLITHExportContextProvider,
} from './monolithExportContext';

export { createStubContextProvider } from './monolithExportContext';

// ============================================
// EXPORTER
// ============================================

export type { MONOLITHExporterConfig, CreateContextProviderFromStoreOptions } from './monolithFactoryPackageExporter';

export {
  createMONOLITHFactoryPackageExporter,
  createContextProviderFromStore,
  createDefaultExporter,
  createKdtExporter,
} from './monolithFactoryPackageExporter';

// ============================================
// BUILDERS
// ============================================

export * from './builders';
