/**
 * SURFACE_MATERIALS - Updated with Wood Textures
 * 
 * TEXTURE SPECS:
 * - Size: 1523 × 3070 px
 * - Real-world: 1220 × 2440 mm (standard 4×8 ft sheet)
 * - Grain: Vertical
 * 
 * COPY THIS TO REPLACE THE EXISTING SURFACE_MATERIALS IN useCabinetStore.ts
 */

const SURFACE_MATERIALS = {
  // ========== MELAMINE (Solid Colors) ==========
  'surf-mel-white': { 
    id: 'surf-mel-white', 
    name: 'Melamine White', 
    type: 'MELAMINE',
    thickness: 0.3, 
    costPerSqm: 120, 
    co2PerSqm: 0.5, 
    color: '#F5F5F5',
    textureUrl: undefined,  // Solid color, no texture
  },
  'surf-mel-grey': { 
    id: 'surf-mel-grey', 
    name: 'Melamine Stone Grey', 
    type: 'MELAMINE',
    thickness: 0.3, 
    costPerSqm: 140, 
    co2PerSqm: 0.5, 
    color: '#6B6B6B',
    textureUrl: undefined,
  },
  
  // ========== HPL VENEERS (With Textures) ==========
  'surf-hpl-oak': { 
    id: 'surf-hpl-oak', 
    name: 'HPL Oak Veneer', 
    type: 'HPL',
    thickness: 0.8, 
    costPerSqm: 450, 
    co2PerSqm: 1.2, 
    color: '#C4A77D',
    textureUrl: '/textures/wood/9880503b9bc4fab08417c0ce7c618301.jpg',  // Natural Oak
  },
  'surf-hpl-walnut': { 
    id: 'surf-hpl-walnut', 
    name: 'HPL Walnut Veneer', 
    type: 'HPL',
    thickness: 0.8, 
    costPerSqm: 520, 
    co2PerSqm: 1.2, 
    color: '#5D4037',
    textureUrl: '/textures/wood/6ca1ee6c8d4e09b967824c7580f4471b.jpg',  // Natural Walnut
  },
  
  // ========== NEW: Premium Wood Textures ==========
  'surf-hpl-walnut-grey': { 
    id: 'surf-hpl-walnut-grey', 
    name: 'HPL Grey Walnut', 
    type: 'HPL',
    thickness: 0.8, 
    costPerSqm: 580, 
    co2PerSqm: 1.2, 
    color: '#9a8b7a',
    textureUrl: '/textures/wood/c524e72250b3ddd648c1f317165c7f79.jpg',
  },
  'surf-hpl-oak-grey': { 
    id: 'surf-hpl-oak-grey', 
    name: 'HPL Grey Wash Oak', 
    type: 'HPL',
    thickness: 0.8, 
    costPerSqm: 550, 
    co2PerSqm: 1.2, 
    color: '#7a7a72',
    textureUrl: '/textures/wood/428c5e7db15f9ac1df0adaa31089124a__3_.jpg',
  },
  'surf-hpl-ash-silver': { 
    id: 'surf-hpl-ash-silver', 
    name: 'HPL Silver Ash', 
    type: 'HPL',
    thickness: 0.8, 
    costPerSqm: 520, 
    co2PerSqm: 1.2, 
    color: '#8a8a8a',
    textureUrl: '/textures/wood/ae7ac17779fa6e250256872104665661.jpg',
  },
  'surf-hpl-walnut-dark': { 
    id: 'surf-hpl-walnut-dark', 
    name: 'HPL Dark Walnut', 
    type: 'HPL',
    thickness: 0.8, 
    costPerSqm: 620, 
    co2PerSqm: 1.2, 
    color: '#5a4a3a',
    textureUrl: '/textures/wood/6ec338abc60c08cd95f6fc5c011f60d5.jpg',
  },
};

// ============================================
// TEXTURE CONSTANTS
// ============================================

/**
 * Standard texture specs for World-Scale UV
 */
export const TEXTURE_SPECS = {
  WIDTH_PX: 1523,
  HEIGHT_PX: 3070,
  REAL_WIDTH_MM: 1220,   // 4 feet
  REAL_HEIGHT_MM: 2440,  // 8 feet
};

/**
 * Calculate texture repeat for World-Scale UV
 * Ensures grain size stays consistent regardless of panel size
 */
export function calculateTextureRepeat(
  panelWidthMM: number, 
  panelHeightMM: number
): [number, number] {
  const repeatX = panelWidthMM / TEXTURE_SPECS.REAL_WIDTH_MM;
  const repeatY = panelHeightMM / TEXTURE_SPECS.REAL_HEIGHT_MM;
  return [repeatX, repeatY];
}
