/**
 * iimos/index.ts - IIMOS Export Module
 *
 * Complete export system for IIMOS cabinet design workspace:
 * - Context provider interface (extracts data from IIMOS runtime)
 * - Factory package exporter (generates DXF, CSV, JSON)
 * - Builders for each file type
 */

// ============================================
// CONTEXT
// ============================================

export type {
  CutListRow,
  NestingSheet,
  IIMOSExportContext,
  IIMOSExportContextProvider,
} from './iimoExportContext';

export { createStubContextProvider } from './iimoExportContext';

// ============================================
// EXPORTER
// ============================================

export type { IIMOSExporterConfig, CreateContextProviderFromStoreOptions } from './iimosFactoryPackageExporter';

export {
  createIIMOSFactoryPackageExporter,
  createContextProviderFromStore,
  createDefaultExporter,
  createKdtExporter,
} from './iimosFactoryPackageExporter';

// ============================================
// BUILDERS
// ============================================

export * from './builders';
