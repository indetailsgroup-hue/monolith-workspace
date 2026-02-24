/**
 * Factory CNC Module - Public API
 *
 * Bridges factory packet data with CNC G-code generation.
 *
 * @version 1.3.0 - Phase D4.x (CNC Overlay)
 */

// Helper functions
export {
  generateGcodeForJob,
  buildOperationGraphPreview,
  getAvailableMachines,
  getDefaultMachineId,
  canGenerateGcode,
  getGenerationValidation,
  // D3.1: CNC Bundle ZIP
  generateCncBundleZip,
  generateAndDownloadCncBundle,
} from './generateGcodeForJob';

export type {
  CncBundleZipRequest,
  CncBundleZipResponse,
} from './generateGcodeForJob';

// D3.2: CNC Cache Management
export {
  getCachedBundle,
  cacheBundle,
  hasCachedBundle,
  invalidateJobCache,
  getCacheStatsForJob,
  getCacheStats,
  clearAllCache,
  evictCacheToSize,
  listCachedBundles,
  generateCncCacheKey,
  getShortCacheKey,
} from '../../cnc/cache';

export type {
  StoredCncMetadata,
  StoredCncBundle,
  CncCacheStats,
  CncCacheKey,
  CacheLookupInput,
} from '../../cnc/cache';

// Re-export CNC types for convenience
export type {
  CncCacheEntry,
  CncGenerationStatus,
  CncGenerateRequest,
  CncGenerateResponse,
  CncValidationIssue,
  CncMachineOption,
  CncErrorCode,
  GcodePreviewState,
} from '../types/cnc';

export {
  defaultCncCacheEntry,
  defaultGcodePreviewState,
  isCncSuccess,
  isCncError,
  hasCncBundle,
} from '../types/cnc';

// D4.x: CNC Overlay (Factory Truth View)
export {
  buildCncOverlay,
  isOverlayEmpty,
  getPointsByPanel,
  getThroughHolePoints,
  getPeckDrillPoints,
  getDwellPoints,
  filterOverlayPoints,
  calculateOverlayStats,
  getOverlayPointColor,
  DEFAULT_OVERLAY_FILTER,
  DEFAULT_MARKER_STYLE,
  OVERLAY_COLORS,
  CncOverlayLayer,
  CncOverlayLayerInstanced,
  CncOverlayMarker,
  CncOverlayLegend,
} from './overlay';

export type {
  CncOverlayPoint,
  CncOverlayFilter,
  CncOverlayStats,
  CncOverlayBuildResult,
  CncOverlayMarkerStyle,
  BuildCncOverlayOptions,
  CncOverlayLayerProps,
  CncOverlayMarkerProps,
  CncOverlayLegendProps,
} from './overlay';
