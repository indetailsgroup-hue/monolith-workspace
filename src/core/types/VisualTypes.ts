/**
 * Visual Types - 3D Rendering Configuration Types
 *
 * Types for visual/rendering configuration including:
 * - Render modes (NORMAL, GHOST, PREVIEW)
 * - Highlight states
 * - Material definitions
 * - Camera focus requests
 *
 * Inspired by Indetails Smart visualTypes.
 *
 * v1.0: Initial implementation
 */

// ============================================
// RENDER MODES
// ============================================

/**
 * Render mode for 3D objects
 *
 * - NORMAL: Standard rendering with full materials
 * - GHOST: Semi-transparent, dimmed (for showing original before change)
 * - PREVIEW: Highlighted with outline (for showing proposed changes)
 * - XRAY: Wireframe/transparent for seeing through panels
 */
export type RenderMode = 'NORMAL' | 'GHOST' | 'PREVIEW' | 'XRAY';

// ============================================
// HIGHLIGHT STATES
// ============================================

export type HighlightSeverity = 'ERROR' | 'WARN' | 'INFO' | 'NONE';

export interface ValidationMsgSimple {
  code: string;
  message: string;
  severity: HighlightSeverity;
}

export interface HighlightState {
  /** Currently active/selected part ID */
  activePartId?: string;
  /** Severity level by part ID */
  severityByPart: Record<string, HighlightSeverity>;
  /** Validation messages by part ID */
  messagesByPart: Record<string, ValidationMsgSimple[]>;
}

// ============================================
// PBR MATERIAL DEFINITION
// ============================================

export interface PBRMaterialMaps {
  /** Albedo/diffuse texture URL */
  albedo?: string;
  /** Normal map URL */
  normal?: string;
  /** Roughness map URL */
  roughness?: string;
  /** Ambient occlusion map URL */
  ao?: string;
  /** Metalness map URL */
  metalness?: string;
}

export interface PBRMaterialDefinition {
  /** Material ID */
  id: string;
  /** Display name */
  name?: string;
  /** Real-world texture size in mm */
  realWorldSize: { width: number; height: number };
  /** Base color (hex) */
  color?: string;
  /** Texture maps */
  maps: PBRMaterialMaps;
  /** Default material properties */
  defaults: {
    roughness: number;
    metalness: number;
  };
}

// ============================================
// VISUAL CONFIGURATION
// ============================================

export type GeometryType = 'BOX' | 'CYLINDER' | 'EXTRUSION';
export type GrainDirection = 'VERTICAL' | 'HORIZONTAL' | 'NONE';

export interface VisualConfig {
  /** Geometry type */
  geometryType: GeometryType;
  /** Material ID reference */
  materialId: string;
  /** Grain direction for wood textures */
  grainDirection: GrainDirection;
  /** UV scale [u, v] */
  uvScale: [number, number];
  /** UV offset [u, v] */
  uvOffset: [number, number];
  /** Rotation in radians */
  rotation: number;
}

// ============================================
// RENDERABLE COMPONENT
// ============================================

export interface RenderableComponent {
  /** Component ID */
  id: string;
  /** Dimensions in mm */
  dimensions: { width: number; height: number; depth: number };
  /** Position in mm */
  position: { x: number; y: number; z: number };
  /** Visual configuration */
  visual: VisualConfig;
}

// ============================================
// CAMERA FOCUS REQUEST
// ============================================

export interface FocusRequest {
  /** Target part/cabinet ID */
  partKey: string;
  /** Focus mode */
  mode?: 'FIT' | 'CENTER';
  /** Padding multiplier (default: 1.4) */
  padding?: number;
  /** Animation duration in ms (default: 800) */
  durationMs?: number;
  /** Optional explicit target position (mm) */
  targetPosition?: [number, number, number];
  /** Optional explicit target size (mm) */
  targetSize?: [number, number, number];
}

// ============================================
// COLOR CONSTANTS
// ============================================

export const HIGHLIGHT_COLORS = {
  ERROR: '#ef4444',
  WARN: '#f59e0b',
  INFO: '#3b82f6',
  SUCCESS: '#22c55e',
  GHOST: '#d6d3d1',
  PREVIEW: '#22d3ee',
};

export const GHOST_MATERIAL_OPTIONS = {
  color: HIGHLIGHT_COLORS.GHOST,
  transparent: true,
  opacity: 0.15,
  depthWrite: false,
};

export const PREVIEW_OUTLINE_COLOR = HIGHLIGHT_COLORS.PREVIEW;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get highlight color based on severity
 */
export function getHighlightColor(severity: HighlightSeverity): string {
  switch (severity) {
    case 'ERROR':
      return HIGHLIGHT_COLORS.ERROR;
    case 'WARN':
      return HIGHLIGHT_COLORS.WARN;
    case 'INFO':
      return HIGHLIGHT_COLORS.INFO;
    default:
      return HIGHLIGHT_COLORS.SUCCESS;
  }
}

/**
 * Create a default highlight state
 */
export function createEmptyHighlightState(): HighlightState {
  return {
    activePartId: undefined,
    severityByPart: {},
    messagesByPart: {},
  };
}
