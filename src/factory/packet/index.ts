/**
 * Factory Packet Module
 *
 * Exports all packet types, builders, and utilities.
 *
 * @version 1.0.0 - Phase B2: Factory Packet Generator MVP
 */

// Types
export * from './types';

// Hash utilities
export {
  sha256,
  sha256Bytes,
  roundToPrecision,
  serializeDeterministic,
  serializeDeterministicPretty,
  computeContentHash,
  computeFileEntry,
  verifyFileHash,
  verifyManifest,
} from './manifestHash';

// Builders
export {
  buildDrillMapData,
  buildDrillMapJson,
  buildConnectorsData,
  buildConnectorsJson,
  buildCutListData,
  buildCutListJson,
  buildGateResultData,
  buildGateResultJson,
} from './builders';

// Main builder
export {
  buildFactoryPacket,
  buildFactoryPacketFromStores,
} from './buildFactoryPacket';
export type { FactoryPacketContext } from './buildFactoryPacket';

// ZIP bundle
export {
  createZipBundle,
  downloadZipBundle,
  createAndDownloadZipBundle,
} from './zipBundle';
export type { ZipBundleOptions, ZipBundleResult } from './zipBundle';

// React hook
export {
  useFactoryPacket,
  generateFactoryPacketFromStores,
  generateFactoryPacketPreviewFromStores,
} from './useFactoryPacket';
export type {
  UseFactoryPacketState,
  UseFactoryPacketActions,
  UseFactoryPacketReturn,
  PacketPreview,
  PacketPreviewFile,
  PacketPreviewParsed,
} from './useFactoryPacket';

// UI Components (B3)
export { PacketPreviewModal } from './ui';
export type { PreviewTab } from './ui';

// Phase C: Ingest & Verify
export {
  unzipPacket,
  unzipPacketFromFile,
  unzipPacketFromBase64,
  listZipContents,
  extractSingleFile,
  isValidZip,
  EXPECTED_FILES,
} from './unzipPacket';
export type { UnzipResult, ExtractedFile, ExpectedFileName } from './unzipPacket';

export {
  verifyPacket,
  verifyPacketFromFile,
  quickVerifyPacket,
  formatVerifyResult,
  getVerifyErrors,
  getVerifyWarnings,
} from './verifyPacket';
export type {
  VerifyCheckId,
  VerifyStatus,
  VerifyCheck,
  VerifyPacketResult,
  VerifyOptions,
} from './verifyPacket';
