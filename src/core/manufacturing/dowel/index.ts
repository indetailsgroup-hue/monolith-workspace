/**
 * Dowel Module — Standalone dowel joint drill map generation
 *
 * Provides:
 * - DowelConfig, DowelDrillingParams types + defaults
 * - DowelPreviewState + guard (preview-only field safety)
 * - generateDowelDrillMap() compiler
 *
 * @version 1.0.0
 */

// Types + Defaults
export type { DowelConfig, DowelDrillingParams, DowelPreviewState } from './types';
export {
  DEFAULT_DOWEL_CONFIG,
  DEFAULT_DOWEL_DRILLING_PARAMS,
  DEFAULT_DOWEL_PREVIEW_STATE,
  DOWEL_PREVIEW_ONLY_KEYS,
} from './types';

// Guard
export { dowelGuard } from './dowelGuard';

// Compiler
export { generateDowelDrillMap } from './generateDowelDrillMap';
