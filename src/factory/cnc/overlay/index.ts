/**
 * index.ts - CNC Overlay Module Exports
 *
 * Visual CNC overlay for Factory Truth View.
 * Shows drilling points derived from OperationGraph (same as G-code).
 *
 * @version 1.0.0 - Phase D4.x
 */

// Types
export * from './cncOverlayTypes';

// Builder
export { buildCncOverlay, isOverlayEmpty, getPointsByPanel, getThroughHolePoints, getPeckDrillPoints, getDwellPoints } from './buildCncOverlay';
export type { BuildCncOverlayOptions } from './buildCncOverlay';

// Components
export { CncOverlayLayer, CncOverlayLayerInstanced } from './CncOverlayLayer';
export type { CncOverlayLayerProps } from './CncOverlayLayer';

export { CncOverlayMarker } from './CncOverlayMarker';
export type { CncOverlayMarkerProps } from './CncOverlayMarker';

export { CncOverlayLegend } from './CncOverlayLegend';
export type { CncOverlayLegendProps } from './CncOverlayLegend';
