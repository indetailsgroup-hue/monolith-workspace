/**
 * MaterialRegistry - Default Material Catalog
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Central registry for all materials
 * - Default wood textures (1523 × 3070 px)
 * - Supports True-Grain™ UV mapping
 * 
 * TEXTURE SIZE STANDARD:
 * - Width: 1523 px
 * - Height: 3070 px
 * - Aspect: ~1:2 (portrait, grain vertical)
 * - Real-world scale: 1 texture = 1220mm × 2440mm (standard sheet)
 */

// ============================================
// TYPES
// ============================================

export type MaterialCategory = 
  | 'WOOD_VENEER'
  | 'WOOD_LAMINATE'
  | 'SOLID_COLOR'
  | 'STONE'
  | 'METAL'
  | 'FABRIC';

export type GrainDirection = 'VERTICAL' | 'HORIZONTAL';

export interface MaterialSpec {
  id: string;
  name: string;
  category: MaterialCategory;
  
  // Texture
  textureUrl: string;
  thumbnailUrl?: string;
  
  // Texture size (pixels)
  textureWidth: number;
  textureHeight: number;
  
  // Real-world size this texture represents (mm)
  realWidthMM: number;
  realHeightMM: number;
  
  // Grain
  grainDirection: GrainDirection;
  
  // Appearance
  color: string;           // Dominant color for fallback
  roughness: number;       // 0-1
  metalness: number;       // 0-1
  
  // Metadata
  vendor?: string;
  sku?: string;
  description?: string;
}

// ============================================
// TEXTURE PATHS
// ============================================

/**
 * Base path for textures
 * In production, this would be a CDN URL
 */
const TEXTURE_BASE_PATH = '/textures/wood';

// ============================================
// DEFAULT MATERIALS CATALOG
// ============================================

export const MATERIAL_CATALOG: MaterialSpec[] = [
  // ========== WOOD VENEERS ==========
  {
    id: 'walnut-grey',
    name: 'Grey Walnut',
    category: 'WOOD_VENEER',
    textureUrl: `${TEXTURE_BASE_PATH}/c524e72250b3ddd648c1f317165c7f79.jpg`,
    textureWidth: 1523,
    textureHeight: 3070,
    realWidthMM: 1220,
    realHeightMM: 2440,
    grainDirection: 'VERTICAL',
    color: '#9a8b7a',
    roughness: 0.6,
    metalness: 0.0,
    vendor: 'Premium Veneers',
    description: 'Grey-toned walnut veneer with subtle grain pattern',
  },
  {
    id: 'oak-grey-wash',
    name: 'Grey Wash Oak',
    category: 'WOOD_VENEER',
    textureUrl: `${TEXTURE_BASE_PATH}/428c5e7db15f9ac1df0adaa31089124a__3_.jpg`,
    textureWidth: 1523,
    textureHeight: 3070,
    realWidthMM: 1220,
    realHeightMM: 2440,
    grainDirection: 'VERTICAL',
    color: '#7a7a72',
    roughness: 0.65,
    metalness: 0.0,
    vendor: 'Premium Veneers',
    description: 'Grey-washed oak with prominent grain texture',
  },
  {
    id: 'ash-silver',
    name: 'Silver Ash',
    category: 'WOOD_VENEER',
    textureUrl: `${TEXTURE_BASE_PATH}/ae7ac17779fa6e250256872104665661.jpg`,
    textureWidth: 1523,
    textureHeight: 3070,
    realWidthMM: 1220,
    realHeightMM: 2440,
    grainDirection: 'VERTICAL',
    color: '#8a8a8a',
    roughness: 0.55,
    metalness: 0.0,
    vendor: 'Premium Veneers',
    description: 'Light silver-grey ash with elegant grain',
  },
  {
    id: 'walnut-dark',
    name: 'Dark Walnut',
    category: 'WOOD_VENEER',
    textureUrl: `${TEXTURE_BASE_PATH}/6ec338abc60c08cd95f6fc5c011f60d5.jpg`,
    textureWidth: 1523,
    textureHeight: 3070,
    realWidthMM: 1220,
    realHeightMM: 2440,
    grainDirection: 'VERTICAL',
    color: '#5a4a3a',
    roughness: 0.5,
    metalness: 0.0,
    vendor: 'Premium Veneers',
    description: 'Rich dark walnut with flowing grain pattern',
  },
  {
    id: 'walnut-natural',
    name: 'Natural Walnut',
    category: 'WOOD_VENEER',
    textureUrl: `${TEXTURE_BASE_PATH}/6ca1ee6c8d4e09b967824c7580f4471b.jpg`,
    textureWidth: 1523,
    textureHeight: 3070,
    realWidthMM: 1220,
    realHeightMM: 2440,
    grainDirection: 'VERTICAL',
    color: '#8a6a4a',
    roughness: 0.55,
    metalness: 0.0,
    vendor: 'Premium Veneers',
    description: 'Warm natural walnut with classic grain',
  },
  {
    id: 'oak-natural',
    name: 'Natural Oak',
    category: 'WOOD_VENEER',
    textureUrl: `${TEXTURE_BASE_PATH}/9880503b9bc4fab08417c0ce7c618301.jpg`,
    textureWidth: 1523,
    textureHeight: 3070,
    realWidthMM: 1220,
    realHeightMM: 2440,
    grainDirection: 'VERTICAL',
    color: '#c4a882',
    roughness: 0.6,
    metalness: 0.0,
    vendor: 'Premium Veneers',
    description: 'Light natural oak with gentle grain',
  },
  
  // ========== SOLID COLORS ==========
  {
    id: 'melamine-white',
    name: 'Melamine White',
    category: 'SOLID_COLOR',
    textureUrl: '',  // No texture, solid color
    textureWidth: 0,
    textureHeight: 0,
    realWidthMM: 0,
    realHeightMM: 0,
    grainDirection: 'VERTICAL',
    color: '#f5f5f5',
    roughness: 0.3,
    metalness: 0.0,
    vendor: 'Standard',
    description: 'Clean white melamine finish',
  },
  {
    id: 'melamine-black',
    name: 'Melamine Black',
    category: 'SOLID_COLOR',
    textureUrl: '',
    textureWidth: 0,
    textureHeight: 0,
    realWidthMM: 0,
    realHeightMM: 0,
    grainDirection: 'VERTICAL',
    color: '#1a1a1a',
    roughness: 0.3,
    metalness: 0.0,
    vendor: 'Standard',
    description: 'Matte black melamine finish',
  },
  {
    id: 'melamine-grey',
    name: 'Melamine Grey',
    category: 'SOLID_COLOR',
    textureUrl: '',
    textureWidth: 0,
    textureHeight: 0,
    realWidthMM: 0,
    realHeightMM: 0,
    grainDirection: 'VERTICAL',
    color: '#6a6a6a',
    roughness: 0.3,
    metalness: 0.0,
    vendor: 'Standard',
    description: 'Neutral grey melamine finish',
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get material by ID
 */
export function getMaterial(id: string): MaterialSpec | undefined {
  return MATERIAL_CATALOG.find(m => m.id === id);
}

/**
 * Get materials by category
 */
export function getMaterialsByCategory(category: MaterialCategory): MaterialSpec[] {
  return MATERIAL_CATALOG.filter(m => m.category === category);
}

/**
 * Get default material
 */
export function getDefaultMaterial(): MaterialSpec {
  return MATERIAL_CATALOG.find(m => m.id === 'oak-natural') || MATERIAL_CATALOG[0];
}

/**
 * Calculate texture repeat based on panel size and material
 * 
 * @param panelWidthMM - Panel width in mm
 * @param panelHeightMM - Panel height in mm
 * @param material - Material spec
 * @returns [repeatX, repeatY]
 */
export function calculateTextureRepeat(
  panelWidthMM: number,
  panelHeightMM: number,
  material: MaterialSpec
): [number, number] {
  if (!material.realWidthMM || !material.realHeightMM) {
    return [1, 1];  // Solid colors don't repeat
  }
  
  const repeatX = panelWidthMM / material.realWidthMM;
  const repeatY = panelHeightMM / material.realHeightMM;
  
  return [repeatX, repeatY];
}

/**
 * Get texture scale for World-Scale UV
 * Returns mm per texture repeat
 */
export function getTextureScale(material: MaterialSpec): number {
  if (!material.realWidthMM) {
    return 1000;  // Default 1m
  }
  
  // Use the smaller dimension for consistent scale
  return Math.min(material.realWidthMM, material.realHeightMM);
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Standard texture dimensions
 */
export const TEXTURE_STANDARD = {
  WIDTH_PX: 1523,
  HEIGHT_PX: 3070,
  REAL_WIDTH_MM: 1220,   // 4 feet
  REAL_HEIGHT_MM: 2440,  // 8 feet
};

/**
 * Standard sheet sizes (mm)
 */
export const SHEET_SIZES = {
  STANDARD: { width: 1220, height: 2440 },     // 4x8 feet
  LARGE: { width: 1525, height: 3050 },        // 5x10 feet
  JUMBO: { width: 1830, height: 3660 },        // 6x12 feet
};
