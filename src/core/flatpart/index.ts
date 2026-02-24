/**
 * FlatPart Module Exports
 *
 * Preview system for Sketch → FlatPart conversion.
 *
 * @version 1.0.0
 */

// Preview Types
export type { Point2D, Poly2, Path2D, FlatPartPreview } from './previewTypes';
export { createPoly2, createPath2D, createEmptyPreview } from './previewTypes';

// FlatPart Types (manufacturing) - Point2D already exported from previewTypes
export type { Contour, Toolpath, FlatPart, WindingDirection } from './flatpartTypes';
export {
  SHEET_SIZES,
  getWindingDirection,
  reverseContour,
  normalizeContourWinding,
} from './flatpartTypes';

// Store
export {
  useFlatPartPreview,
  useFlatPartPreviewOutline,
  useFlatPartPreviewCutouts,
  useFlatPartPreviewPaths,
  useIsPreviewMode,
  useFlatPartPreviewData,
} from './useFlatPartPreview';

// Builder
export { buildPreviewFromSketch, getPreviewSummary } from './previewBuilder';

// Apply to Cabinet
export {
  applyPreviewToActiveCabinet,
  applyPreviewToPanel,
  hasPreviewToApply,
  getApplySummary,
} from './applyToCabinet';

export type { ApplyResult, PanelCutout, PanelPath } from './applyToCabinet';

// Preview to FlatPart Conversion
export { fromPreviewToFlatPart, validateFlatPart } from './fromPreview';
export type { ConvertOptions, ConvertResult } from './fromPreview';
