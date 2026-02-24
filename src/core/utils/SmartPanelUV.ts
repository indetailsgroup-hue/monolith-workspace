/**
 * SmartPanel UV System - World-Scale UV Mapping (Module A)
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Part of SmartPanel Module (Module A)
 * - Implements "True-Grain™" concept from MONOLITH documentation
 * - All dimensions in millimeters (mm)
 * 
 * FEATURES:
 * - World-Scale UV: UV coordinates based on real-world mm, not model size
 * - Deterministic Randomization: Same random offset every time (Mulberry32)
 * - Anti-Stretching: Texture repeats naturally instead of stretching
 */

import { BufferGeometry, Float32BufferAttribute } from 'three';

// ============================================
// DETERMINISTIC RANDOM (Mulberry32)
// ============================================

/**
 * Mulberry32 - Fast deterministic PRNG
 * Same seed = same sequence every time
 * Used for consistent "random" grain offsets
 */
export function mulberry32(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Generate deterministic random offset for a panel
 * Based on panel ID hash - same panel always gets same offset
 */
export function getPanelSeed(panelId: string): number {
  let hash = 0;
  for (let i = 0; i < panelId.length; i++) {
    const char = panelId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// ============================================
// WORLD-SCALE UV CALCULATION
// ============================================

/**
 * Configuration for UV mapping
 */
export interface UVConfig {
  /** Real-world texture size in mm (e.g., 2400x1200 for standard sheet) */
  textureWidthMM: number;
  textureHeightMM: number;
  
  /** Grain direction */
  grainDirection: 'HORIZONTAL' | 'VERTICAL';
  
  /** Random offset (0-1) for anti-repetition */
  randomOffsetU?: number;
  randomOffsetV?: number;
}

/**
 * Default UV config - standard wood sheet 2400x1200mm
 */
export const DEFAULT_UV_CONFIG: UVConfig = {
  textureWidthMM: 2400,
  textureHeightMM: 1200,
  grainDirection: 'HORIZONTAL',
  randomOffsetU: 0,
  randomOffsetV: 0,
};

/**
 * Calculate world-scale UV coordinates for a box face
 * 
 * Unlike default UV (0-1 stretched), this maps real mm to texture space
 * So a 600mm panel on a 2400mm texture = 0.25 UV units
 * 
 * @param widthMM - Panel width in mm
 * @param heightMM - Panel height in mm  
 * @param config - UV configuration
 * @returns UV coordinates array for box face (4 vertices)
 */
export function calculateWorldScaleUV(
  widthMM: number,
  heightMM: number,
  config: UVConfig = DEFAULT_UV_CONFIG
): number[] {
  const { textureWidthMM, textureHeightMM, grainDirection, randomOffsetU = 0, randomOffsetV = 0 } = config;
  
  // Calculate UV scale based on real world size
  let uScale: number;
  let vScale: number;
  
  if (grainDirection === 'HORIZONTAL') {
    // Grain runs along width (U axis)
    uScale = widthMM / textureWidthMM;
    vScale = heightMM / textureHeightMM;
  } else {
    // Grain runs along height (V axis) - rotate 90°
    uScale = widthMM / textureHeightMM;
    vScale = heightMM / textureWidthMM;
  }
  
  // Apply random offset for anti-repetition
  const uOffset = randomOffsetU * (1 - uScale); // Keep within bounds
  const vOffset = randomOffsetV * (1 - vScale);
  
  // UV coordinates for 4 corners of a quad
  // Order: bottom-left, bottom-right, top-right, top-left
  return [
    uOffset, vOffset,                    // bottom-left
    uOffset + uScale, vOffset,           // bottom-right  
    uOffset + uScale, vOffset + vScale,  // top-right
    uOffset, vOffset + vScale,           // top-left
  ];
}

// ============================================
// BOX GEOMETRY UV MODIFICATION
// ============================================

/**
 * Box face indices in Three.js BoxGeometry
 * Each face has 4 vertices (2 triangles)
 */
export const BOX_FACES = {
  RIGHT:  0,  // +X
  LEFT:   1,  // -X
  TOP:    2,  // +Y
  BOTTOM: 3,  // -Y
  FRONT:  4,  // +Z
  BACK:   5,  // -Z
} as const;

/**
 * Apply world-scale UV to a BoxGeometry
 * 
 * @param geometry - Three.js BoxGeometry to modify
 * @param panelWidthMM - Panel width in mm (X dimension)
 * @param panelHeightMM - Panel height in mm (Y dimension)
 * @param panelDepthMM - Panel depth in mm (Z dimension / thickness)
 * @param config - UV configuration
 */
export function applyWorldScaleUVToBox(
  geometry: BufferGeometry,
  panelWidthMM: number,
  panelHeightMM: number,
  panelDepthMM: number,
  config: UVConfig = DEFAULT_UV_CONFIG
): void {
  const uvAttribute = geometry.getAttribute('uv');
  if (!uvAttribute) return;
  
  const uvArray = uvAttribute.array as Float32Array;
  
  // Calculate UVs for each face based on its real dimensions
  const faceUVs = {
    // Front/Back faces: Width x Height
    [BOX_FACES.FRONT]: calculateWorldScaleUV(panelWidthMM, panelHeightMM, config),
    [BOX_FACES.BACK]: calculateWorldScaleUV(panelWidthMM, panelHeightMM, config),
    
    // Left/Right faces: Depth x Height
    [BOX_FACES.LEFT]: calculateWorldScaleUV(panelDepthMM, panelHeightMM, config),
    [BOX_FACES.RIGHT]: calculateWorldScaleUV(panelDepthMM, panelHeightMM, config),
    
    // Top/Bottom faces: Width x Depth
    [BOX_FACES.TOP]: calculateWorldScaleUV(panelWidthMM, panelDepthMM, config),
    [BOX_FACES.BOTTOM]: calculateWorldScaleUV(panelWidthMM, panelDepthMM, config),
  };
  
  // BoxGeometry has 6 faces, each with 4 vertices (but stored as 6 vertices due to triangulation)
  // UV layout: 6 faces × 4 vertices × 2 components = 48 values
  // But actually Three.js uses 6 faces × 6 vertices (2 triangles) × 2 = 72 values
  
  // For each face, we need to set UVs for 6 vertices (2 triangles)
  // Triangle 1: v0, v1, v2 (bottom-left, bottom-right, top-right)
  // Triangle 2: v0, v2, v3 (bottom-left, top-right, top-left)
  
  let uvIndex = 0;
  for (let face = 0; face < 6; face++) {
    const faceUV = (faceUVs as Record<number, number[]>)[face];
    
    // Triangle 1: vertices 0, 1, 2
    // v0 (bottom-left)
    uvArray[uvIndex++] = faceUV[0];
    uvArray[uvIndex++] = faceUV[1];
    // v1 (bottom-right)
    uvArray[uvIndex++] = faceUV[2];
    uvArray[uvIndex++] = faceUV[3];
    // v2 (top-right)
    uvArray[uvIndex++] = faceUV[4];
    uvArray[uvIndex++] = faceUV[5];
    
    // Triangle 2: vertices 0, 2, 3
    // v0 (bottom-left)
    uvArray[uvIndex++] = faceUV[0];
    uvArray[uvIndex++] = faceUV[1];
    // v2 (top-right)
    uvArray[uvIndex++] = faceUV[4];
    uvArray[uvIndex++] = faceUV[5];
    // v3 (top-left)
    uvArray[uvIndex++] = faceUV[6];
    uvArray[uvIndex++] = faceUV[7];
  }
  
  uvAttribute.needsUpdate = true;
}

/**
 * Create UV config with deterministic random offset based on panel ID
 * 
 * @param panelId - Unique panel identifier
 * @param grainDirection - Grain direction
 * @param textureSize - Optional custom texture size
 */
export function createPanelUVConfig(
  panelId: string,
  grainDirection: 'HORIZONTAL' | 'VERTICAL' = 'HORIZONTAL',
  textureSize?: { width: number; height: number }
): UVConfig {
  // Get deterministic random values from panel ID
  const seed = getPanelSeed(panelId);
  const rng = mulberry32(seed);
  
  return {
    textureWidthMM: textureSize?.width ?? 2400,
    textureHeightMM: textureSize?.height ?? 1200,
    grainDirection,
    randomOffsetU: rng() * 0.5, // Max 50% offset
    randomOffsetV: rng() * 0.5,
  };
}

// ============================================
// REACT THREE FIBER HELPERS
// ============================================

/**
 * Hook-friendly function to get UV config for a panel
 * Can be used in useMemo for performance
 */
export function getSmartPanelUVConfig(
  panelId: string,
  grainDirection: 'HORIZONTAL' | 'VERTICAL'
): UVConfig {
  return createPanelUVConfig(panelId, grainDirection);
}
