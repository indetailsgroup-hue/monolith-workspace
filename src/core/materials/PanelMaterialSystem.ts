/**
 * PanelMaterialSystem - Complete Panel Material Composition
 * 
 * ARCHITECTURE:
 * Each panel consists of:
 * 1. CORE - The substrate (PB, MDF, HMR, Plywood)
 * 2. SURFACE - Face coverings (Melamine, HPL, Veneer, Lacquer)
 * 3. EDGE - Edge banding per side (PVC, ABS, HPL, Solid Wood, Aluminum)
 * 
 * User can assign materials per-panel with defaults from cabinet
 */

// ============================================
// CORE MATERIALS (Substrate)
// ============================================

export type CoreType = 'PARTICLE_BOARD' | 'MDF' | 'HMR' | 'PLYWOOD' | 'BLOCKBOARD';

export interface CoreMaterial {
  id: string;
  name: string;
  type: CoreType;
  thickness: number;        // mm (6, 9, 12, 16, 18, 25)
  density: number;          // kg/m³ (for weight calculation)
  costPerSqm: number;       // ฿/m²
  co2PerSqm: number;        // kg CO2e/m²
  
  // Manufacturing
  canCNC: boolean;
  canLaser: boolean;
  moistureResistant: boolean;
  
  // Sheet size
  sheetWidth: number;       // mm (typically 1220)
  sheetHeight: number;      // mm (typically 2440)
}

/**
 * Sheet Sizes (Thai Market Standard):
 * - PB / MDF / HMR: 1230 × 2450 mm
 * - Plywood:         1220 × 2440 mm
 */
const SHEET_PB_MDF_HMR = { sheetWidth: 1230, sheetHeight: 2450 } as const;
const SHEET_PLYWOOD     = { sheetWidth: 1220, sheetHeight: 2440 } as const;

export const CORE_MATERIALS_CATALOG: Record<string, CoreMaterial> = {
  // ============================================
  // PARTICLEBOARD E1 (Low Formaldehyde ≤8mg/100g)
  // ความหนา: 9, 12, 15, 16, 18, 19, 25, 28, 35mm
  // ============================================
  'core-pb-9': {
    id: 'core-pb-9',
    name: 'Particleboard E1 9mm',
    type: 'PARTICLE_BOARD',
    thickness: 9,
    density: 650,
    costPerSqm: 150,
    co2PerSqm: 5.0,
    canCNC: true,
    canLaser: false,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-pb-12': {
    id: 'core-pb-12',
    name: 'Particleboard E1 12mm',
    type: 'PARTICLE_BOARD',
    thickness: 12,
    density: 650,
    costPerSqm: 190,
    co2PerSqm: 6.2,
    canCNC: true,
    canLaser: false,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-pb-15': {
    id: 'core-pb-15',
    name: 'Particleboard E1 15mm',
    type: 'PARTICLE_BOARD',
    thickness: 15,
    density: 650,
    costPerSqm: 230,
    co2PerSqm: 7.5,
    canCNC: true,
    canLaser: false,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-pb-16': {
    id: 'core-pb-16',
    name: 'Particleboard E1 16mm',
    type: 'PARTICLE_BOARD',
    thickness: 16,
    density: 650,
    costPerSqm: 250,
    co2PerSqm: 8.2,
    canCNC: true,
    canLaser: false,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-pb-18': {
    id: 'core-pb-18',
    name: 'Particleboard E1 18mm',
    type: 'PARTICLE_BOARD',
    thickness: 18,
    density: 650,
    costPerSqm: 280,
    co2PerSqm: 9.0,
    canCNC: true,
    canLaser: false,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-pb-19': {
    id: 'core-pb-19',
    name: 'Particleboard E1 19mm',
    type: 'PARTICLE_BOARD',
    thickness: 19,
    density: 650,
    costPerSqm: 295,
    co2PerSqm: 9.3,
    canCNC: true,
    canLaser: false,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-pb-25': {
    id: 'core-pb-25',
    name: 'Particleboard E1 25mm',
    type: 'PARTICLE_BOARD',
    thickness: 25,
    density: 650,
    costPerSqm: 380,
    co2PerSqm: 11.5,
    canCNC: true,
    canLaser: false,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-pb-28': {
    id: 'core-pb-28',
    name: 'Particleboard E1 28mm',
    type: 'PARTICLE_BOARD',
    thickness: 28,
    density: 650,
    costPerSqm: 420,
    co2PerSqm: 12.5,
    canCNC: true,
    canLaser: false,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-pb-35': {
    id: 'core-pb-35',
    name: 'Particleboard E1 35mm',
    type: 'PARTICLE_BOARD',
    thickness: 35,
    density: 650,
    costPerSqm: 520,
    co2PerSqm: 15.0,
    canCNC: true,
    canLaser: false,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },

  // ============================================
  // PARTICLEBOARD กันชื้น (Moisture Resistant)
  // ความหนา: 16, 18mm — สีเขียว green core
  // ============================================
  'core-pb-mr-16': {
    id: 'core-pb-mr-16',
    name: 'Particleboard MR 16mm',
    type: 'PARTICLE_BOARD',
    thickness: 16,
    density: 670,
    costPerSqm: 310,
    co2PerSqm: 8.8,
    canCNC: true,
    canLaser: false,
    moistureResistant: true,
    ...SHEET_PB_MDF_HMR,
  },
  'core-pb-mr-18': {
    id: 'core-pb-mr-18',
    name: 'Particleboard MR 18mm',
    type: 'PARTICLE_BOARD',
    thickness: 18,
    density: 670,
    costPerSqm: 340,
    co2PerSqm: 9.5,
    canCNC: true,
    canLaser: false,
    moistureResistant: true,
    ...SHEET_PB_MDF_HMR,
  },

  // ============================================
  // MDF (Medium Density Fiberboard)
  // ความหนา: 2.6, 3, 4, 6, 9, 12, 16, 18, 19, 25mm
  // ============================================
  'core-mdf-2.6': {
    id: 'core-mdf-2.6',
    name: 'MDF 2.6mm (Ultra Thin)',
    type: 'MDF',
    thickness: 2.6,
    density: 750,
    costPerSqm: 95,
    co2PerSqm: 2.0,
    canCNC: false,
    canLaser: true,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-mdf-3': {
    id: 'core-mdf-3',
    name: 'MDF 3mm (Backing)',
    type: 'MDF',
    thickness: 3,
    density: 750,
    costPerSqm: 110,
    co2PerSqm: 2.5,
    canCNC: false,
    canLaser: true,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-mdf-4': {
    id: 'core-mdf-4',
    name: 'MDF 4mm',
    type: 'MDF',
    thickness: 4,
    density: 750,
    costPerSqm: 130,
    co2PerSqm: 3.2,
    canCNC: true,
    canLaser: true,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-mdf-6': {
    id: 'core-mdf-6',
    name: 'MDF 6mm (Backing)',
    type: 'MDF',
    thickness: 6,
    density: 750,
    costPerSqm: 180,
    co2PerSqm: 5.0,
    canCNC: true,
    canLaser: true,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-mdf-9': {
    id: 'core-mdf-9',
    name: 'MDF 9mm',
    type: 'MDF',
    thickness: 9,
    density: 750,
    costPerSqm: 220,
    co2PerSqm: 6.5,
    canCNC: true,
    canLaser: true,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-mdf-12': {
    id: 'core-mdf-12',
    name: 'MDF 12mm',
    type: 'MDF',
    thickness: 12,
    density: 750,
    costPerSqm: 260,
    co2PerSqm: 7.8,
    canCNC: true,
    canLaser: true,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-mdf-16': {
    id: 'core-mdf-16',
    name: 'MDF 16mm',
    type: 'MDF',
    thickness: 16,
    density: 750,
    costPerSqm: 320,
    co2PerSqm: 9.5,
    canCNC: true,
    canLaser: true,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-mdf-18': {
    id: 'core-mdf-18',
    name: 'MDF 18mm',
    type: 'MDF',
    thickness: 18,
    density: 750,
    costPerSqm: 360,
    co2PerSqm: 10.2,
    canCNC: true,
    canLaser: true,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-mdf-19': {
    id: 'core-mdf-19',
    name: 'MDF 19mm',
    type: 'MDF',
    thickness: 19,
    density: 750,
    costPerSqm: 380,
    co2PerSqm: 10.8,
    canCNC: true,
    canLaser: true,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },
  'core-mdf-25': {
    id: 'core-mdf-25',
    name: 'MDF 25mm',
    type: 'MDF',
    thickness: 25,
    density: 750,
    costPerSqm: 480,
    co2PerSqm: 13.5,
    canCNC: true,
    canLaser: false,
    moistureResistant: false,
    ...SHEET_PB_MDF_HMR,
  },

  // ============================================
  // HMR (High Moisture Resistant) — เนื้อสีเขียว
  // ความหนา: 4, 6, 9, 12, 15, 18, 28mm
  // ============================================
  'core-hmr-4': {
    id: 'core-hmr-4',
    name: 'HMR Green 4mm',
    type: 'HMR',
    thickness: 4,
    density: 700,
    costPerSqm: 180,
    co2PerSqm: 3.5,
    canCNC: false,
    canLaser: false,
    moistureResistant: true,
    ...SHEET_PB_MDF_HMR,
  },
  'core-hmr-6': {
    id: 'core-hmr-6',
    name: 'HMR Green 6mm',
    type: 'HMR',
    thickness: 6,
    density: 700,
    costPerSqm: 240,
    co2PerSqm: 5.0,
    canCNC: true,
    canLaser: false,
    moistureResistant: true,
    ...SHEET_PB_MDF_HMR,
  },
  'core-hmr-9': {
    id: 'core-hmr-9',
    name: 'HMR Green 9mm',
    type: 'HMR',
    thickness: 9,
    density: 700,
    costPerSqm: 310,
    co2PerSqm: 6.8,
    canCNC: true,
    canLaser: false,
    moistureResistant: true,
    ...SHEET_PB_MDF_HMR,
  },
  'core-hmr-12': {
    id: 'core-hmr-12',
    name: 'HMR Green 12mm',
    type: 'HMR',
    thickness: 12,
    density: 700,
    costPerSqm: 360,
    co2PerSqm: 8.0,
    canCNC: true,
    canLaser: false,
    moistureResistant: true,
    ...SHEET_PB_MDF_HMR,
  },
  'core-hmr-15': {
    id: 'core-hmr-15',
    name: 'HMR Green 15mm',
    type: 'HMR',
    thickness: 15,
    density: 700,
    costPerSqm: 400,
    co2PerSqm: 9.2,
    canCNC: true,
    canLaser: false,
    moistureResistant: true,
    ...SHEET_PB_MDF_HMR,
  },
  'core-hmr-16': {
    id: 'core-hmr-16',
    name: 'HMR Green 16mm',
    type: 'HMR',
    thickness: 16,
    density: 700,
    costPerSqm: 420,
    co2PerSqm: 9.8,
    canCNC: true,
    canLaser: false,
    moistureResistant: true,
    ...SHEET_PB_MDF_HMR,
  },
  'core-hmr-18': {
    id: 'core-hmr-18',
    name: 'HMR Green 18mm',
    type: 'HMR',
    thickness: 18,
    density: 700,
    costPerSqm: 450,
    co2PerSqm: 10.2,
    canCNC: true,
    canLaser: false,
    moistureResistant: true,
    ...SHEET_PB_MDF_HMR,
  },
  'core-hmr-28': {
    id: 'core-hmr-28',
    name: 'HMR Green 28mm',
    type: 'HMR',
    thickness: 28,
    density: 700,
    costPerSqm: 650,
    co2PerSqm: 14.5,
    canCNC: true,
    canLaser: false,
    moistureResistant: true,
    ...SHEET_PB_MDF_HMR,
  },

  // ============================================
  // PLYWOOD (ไม้อัด)
  // ความหนา: 5, 9, 12, 16, 18mm
  // ขนาดแผ่น: 1220 × 2440mm
  // ============================================
  'core-ply-5': {
    id: 'core-ply-5',
    name: 'Plywood 5mm',
    type: 'PLYWOOD',
    thickness: 5,
    density: 550,
    costPerSqm: 280,
    co2PerSqm: 5.0,
    canCNC: true,
    canLaser: false,
    moistureResistant: false,
    ...SHEET_PLYWOOD,
  },
  'core-ply-9': {
    id: 'core-ply-9',
    name: 'Plywood 9mm',
    type: 'PLYWOOD',
    thickness: 9,
    density: 550,
    costPerSqm: 420,
    co2PerSqm: 7.5,
    canCNC: true,
    canLaser: false,
    moistureResistant: false,
    ...SHEET_PLYWOOD,
  },
  'core-ply-12': {
    id: 'core-ply-12',
    name: 'Plywood 12mm',
    type: 'PLYWOOD',
    thickness: 12,
    density: 550,
    costPerSqm: 550,
    co2PerSqm: 9.0,
    canCNC: true,
    canLaser: false,
    moistureResistant: false,
    ...SHEET_PLYWOOD,
  },
  'core-ply-16': {
    id: 'core-ply-16',
    name: 'Plywood 16mm',
    type: 'PLYWOOD',
    thickness: 16,
    density: 550,
    costPerSqm: 700,
    co2PerSqm: 11.0,
    canCNC: true,
    canLaser: false,
    moistureResistant: false,
    ...SHEET_PLYWOOD,
  },
  'core-ply-18': {
    id: 'core-ply-18',
    name: 'Marine Plywood 18mm',
    type: 'PLYWOOD',
    thickness: 18,
    density: 550,
    costPerSqm: 850,
    co2PerSqm: 12.5,
    canCNC: true,
    canLaser: false,
    moistureResistant: true,
    ...SHEET_PLYWOOD,
  },
};

// ============================================
// SURFACE MATERIALS (Face Finish)
// ============================================

export type SurfaceType = 'MELAMINE' | 'HPL' | 'VENEER' | 'LACQUER' | 'LAMINATE' | 'RAW';

export interface SurfaceMaterial {
  id: string;
  name: string;
  type: SurfaceType;
  thickness: number;        // mm (0.3 melamine, 0.6-0.8 HPL, 0.5-0.8 veneer)
  costPerSqm: number;       // ฿/m²
  co2PerSqm: number;        // kg CO2e/m²
  
  // Appearance
  color: string;            // Hex color for solid/fallback
  textureUrl?: string;      // Texture image path
  
  // Texture specs (for UV mapping)
  textureWidthMM?: number;  // Real-world width texture represents
  textureHeightMM?: number; // Real-world height texture represents
  
  // Properties
  glossLevel: 'MATTE' | 'SATIN' | 'SEMI_GLOSS' | 'HIGH_GLOSS';
  scratchResistant: boolean;
  
  // Can be used as edge banding
  availableAsEdge: boolean;
  edgeThicknesses?: number[]; // Available edge thicknesses if applicable
}

export const SURFACE_MATERIALS_CATALOG: Record<string, SurfaceMaterial> = {
  // ========== MELAMINE ==========
  'surf-mel-white': {
    id: 'surf-mel-white',
    name: 'Melamine White',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 120,
    co2PerSqm: 0.5,
    color: '#F5F5F5',
    glossLevel: 'MATTE',
    scratchResistant: false,
    availableAsEdge: false,
  },
  'surf-mel-grey': {
    id: 'surf-mel-grey',
    name: 'Melamine Stone Grey',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 140,
    co2PerSqm: 0.5,
    color: '#6B6B6B',
    glossLevel: 'MATTE',
    scratchResistant: false,
    availableAsEdge: false,
  },
  'surf-mel-black': {
    id: 'surf-mel-black',
    name: 'Melamine Black',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 140,
    co2PerSqm: 0.5,
    color: '#1A1A1A',
    glossLevel: 'MATTE',
    scratchResistant: false,
    availableAsEdge: false,
  },
  
  // ========== HPL (High Pressure Laminate) ==========
  'surf-hpl-oak': {
    id: 'surf-hpl-oak',
    name: 'HPL Natural Oak',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 450,
    co2PerSqm: 1.2,
    color: '#C4A77D',
    textureUrl: '/textures/wood/9880503b9bc4fab08417c0ce7c618301.jpg',
    textureWidthMM: 1523,
    textureHeightMM: 3070,
    glossLevel: 'MATTE',
    scratchResistant: true,
    availableAsEdge: true,
    edgeThicknesses: [0.8, 1.0, 2.0],
  },
  'surf-hpl-walnut': {
    id: 'surf-hpl-walnut',
    name: 'HPL Natural Walnut',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 520,
    co2PerSqm: 1.2,
    color: '#5D4037',
    textureUrl: '/textures/wood/6ca1ee6c8d4e09b967824c7580f4471b.jpg',
    textureWidthMM: 1523,
    textureHeightMM: 3070,
    glossLevel: 'MATTE',
    scratchResistant: true,
    availableAsEdge: true,
    edgeThicknesses: [0.8, 1.0, 2.0],
  },
  'surf-hpl-walnut-grey': {
    id: 'surf-hpl-walnut-grey',
    name: 'HPL Grey Walnut',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 580,
    co2PerSqm: 1.2,
    color: '#9a8b7a',
    textureUrl: '/textures/wood/c524e72250b3ddd648c1f317165c7f79.jpg',
    textureWidthMM: 1523,
    textureHeightMM: 3070,
    glossLevel: 'MATTE',
    scratchResistant: true,
    availableAsEdge: true,
    edgeThicknesses: [0.8, 1.0, 2.0],
  },
  'surf-hpl-oak-grey': {
    id: 'surf-hpl-oak-grey',
    name: 'HPL Grey Wash Oak',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 550,
    co2PerSqm: 1.2,
    color: '#7a7a72',
    textureUrl: '/textures/wood/428c5e7db15f9ac1df0adaa31089124a.jpg',
    textureWidthMM: 1523,
    textureHeightMM: 3070,
    glossLevel: 'MATTE',
    scratchResistant: true,
    availableAsEdge: true,
    edgeThicknesses: [0.8, 1.0, 2.0],
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
    textureWidthMM: 1523,
    textureHeightMM: 3070,
    glossLevel: 'MATTE',
    scratchResistant: true,
    availableAsEdge: true,
    edgeThicknesses: [0.8, 1.0, 2.0],
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
    textureWidthMM: 1523,
    textureHeightMM: 3070,
    glossLevel: 'MATTE',
    scratchResistant: true,
    availableAsEdge: true,
    edgeThicknesses: [0.8, 1.0, 2.0],
  },
};

// ============================================
// EDGE MATERIALS (Edge Banding)
// ============================================

export type EdgeType = 'PVC' | 'ABS' | 'HPL' | 'SOLID_WOOD' | 'ALUMINUM' | 'ACRYLIC' | 'VENEER';

export interface EdgeMaterial {
  id: string;
  name: string;
  type: EdgeType;
  thickness: number;        // mm (0.4, 0.5, 1.0, 2.0, 3.0)
  height: number;           // mm (standard 23, but can vary)
  costPerMeter: number;     // ฿/m
  
  // Appearance
  color: string;
  textureUrl?: string;
  
  // Linked surface (for matching HPL edge to HPL surface)
  linkedSurfaceId?: string;
  
  // Properties
  preGlued: boolean;
  laserCompatible: boolean;
  
  // Manufacturing code
  code: string;             // Factory code for CNC
}

export const EDGE_MATERIALS_CATALOG: Record<string, EdgeMaterial> = {
  // ========== PVC SOLID COLORS ==========
  'edge-pvc-white-04': {
    id: 'edge-pvc-white-04',
    name: 'PVC White 0.4mm',
    type: 'PVC',
    thickness: 0.4,
    height: 23,
    costPerMeter: 5,
    color: '#FFFFFF',
    preGlued: true,
    laserCompatible: false,
    code: 'PVC-W-0.4',
  },
  'edge-pvc-white-05': {
    id: 'edge-pvc-white-05',
    name: 'PVC White 0.5mm',
    type: 'PVC',
    thickness: 0.5,
    height: 23,
    costPerMeter: 6,
    color: '#FFFFFF',
    preGlued: true,
    laserCompatible: false,
    code: 'PVC-W-0.5',
  },
  'edge-pvc-white-10': {
    id: 'edge-pvc-white-10',
    name: 'PVC White 1.0mm',
    type: 'PVC',
    thickness: 1.0,
    height: 23,
    costPerMeter: 12,
    color: '#FFFFFF',
    preGlued: true,
    laserCompatible: false,
    code: 'PVC-W-1.0',
  },
  'edge-pvc-white-20': {
    id: 'edge-pvc-white-20',
    name: 'PVC White 2.0mm',
    type: 'PVC',
    thickness: 2.0,
    height: 23,
    costPerMeter: 22,
    color: '#FFFFFF',
    preGlued: false,
    laserCompatible: false,
    code: 'PVC-W-2.0',
  },
  'edge-pvc-grey-10': {
    id: 'edge-pvc-grey-10',
    name: 'PVC Grey 1.0mm',
    type: 'PVC',
    thickness: 1.0,
    height: 23,
    costPerMeter: 12,
    color: '#6B6B6B',
    preGlued: true,
    laserCompatible: false,
    code: 'PVC-G-1.0',
  },
  'edge-pvc-black-10': {
    id: 'edge-pvc-black-10',
    name: 'PVC Black 1.0mm',
    type: 'PVC',
    thickness: 1.0,
    height: 23,
    costPerMeter: 14,
    color: '#1A1A1A',
    preGlued: true,
    laserCompatible: false,
    code: 'PVC-B-1.0',
  },
  
  // ========== ABS WOOD GRAIN ==========
  'edge-abs-oak-10': {
    id: 'edge-abs-oak-10',
    name: 'ABS Oak 1.0mm',
    type: 'ABS',
    thickness: 1.0,
    height: 23,
    costPerMeter: 22,
    color: '#C4A77D',
    textureUrl: '/textures/wood/9880503b9bc4fab08417c0ce7c618301.jpg',
    linkedSurfaceId: 'surf-hpl-oak',
    preGlued: true,
    laserCompatible: true,
    code: 'ABS-OAK-1.0',
  },
  'edge-abs-walnut-10': {
    id: 'edge-abs-walnut-10',
    name: 'ABS Walnut 1.0mm',
    type: 'ABS',
    thickness: 1.0,
    height: 23,
    costPerMeter: 24,
    color: '#5D4037',
    textureUrl: '/textures/wood/6ca1ee6c8d4e09b967824c7580f4471b.jpg',
    linkedSurfaceId: 'surf-hpl-walnut',
    preGlued: true,
    laserCompatible: true,
    code: 'ABS-WAL-1.0',
  },
  'edge-abs-walnut-grey-10': {
    id: 'edge-abs-walnut-grey-10',
    name: 'ABS Grey Walnut 1.0mm',
    type: 'ABS',
    thickness: 1.0,
    height: 23,
    costPerMeter: 26,
    color: '#9a8b7a',
    textureUrl: '/textures/wood/c524e72250b3ddd648c1f317165c7f79.jpg',
    linkedSurfaceId: 'surf-hpl-walnut-grey',
    preGlued: true,
    laserCompatible: true,
    code: 'ABS-GW-1.0',
  },
  'edge-abs-oak-grey-10': {
    id: 'edge-abs-oak-grey-10',
    name: 'ABS Grey Wash Oak 1.0mm',
    type: 'ABS',
    thickness: 1.0,
    height: 23,
    costPerMeter: 25,
    color: '#7a7a72',
    textureUrl: '/textures/wood/428c5e7db15f9ac1df0adaa31089124a.jpg',
    linkedSurfaceId: 'surf-hpl-oak-grey',
    preGlued: true,
    laserCompatible: true,
    code: 'ABS-GO-1.0',
  },
  'edge-abs-ash-silver-10': {
    id: 'edge-abs-ash-silver-10',
    name: 'ABS Silver Ash 1.0mm',
    type: 'ABS',
    thickness: 1.0,
    height: 23,
    costPerMeter: 24,
    color: '#8a8a8a',
    textureUrl: '/textures/wood/ae7ac17779fa6e250256872104665661.jpg',
    linkedSurfaceId: 'surf-hpl-ash-silver',
    preGlued: true,
    laserCompatible: true,
    code: 'ABS-SA-1.0',
  },
  'edge-abs-walnut-dark-10': {
    id: 'edge-abs-walnut-dark-10',
    name: 'ABS Dark Walnut 1.0mm',
    type: 'ABS',
    thickness: 1.0,
    height: 23,
    costPerMeter: 28,
    color: '#5a4a3a',
    textureUrl: '/textures/wood/6ec338abc60c08cd95f6fc5c011f60d5.jpg',
    linkedSurfaceId: 'surf-hpl-walnut-dark',
    preGlued: true,
    laserCompatible: true,
    code: 'ABS-DW-1.0',
  },
  
  // ========== HPL EDGE (Match Surface) ==========
  'edge-hpl-oak-08': {
    id: 'edge-hpl-oak-08',
    name: 'HPL Oak Edge 0.8mm',
    type: 'HPL',
    thickness: 0.8,
    height: 23,
    costPerMeter: 35,
    color: '#C4A77D',
    textureUrl: '/textures/wood/9880503b9bc4fab08417c0ce7c618301.jpg',
    linkedSurfaceId: 'surf-hpl-oak',
    preGlued: false,
    laserCompatible: false,
    code: 'HPL-OAK-0.8',
  },
  'edge-hpl-walnut-08': {
    id: 'edge-hpl-walnut-08',
    name: 'HPL Walnut Edge 0.8mm',
    type: 'HPL',
    thickness: 0.8,
    height: 23,
    costPerMeter: 38,
    color: '#5D4037',
    textureUrl: '/textures/wood/6ca1ee6c8d4e09b967824c7580f4471b.jpg',
    linkedSurfaceId: 'surf-hpl-walnut',
    preGlued: false,
    laserCompatible: false,
    code: 'HPL-WAL-0.8',
  },
  
  // ========== SOLID WOOD EDGE ==========
  'edge-wood-oak-30': {
    id: 'edge-wood-oak-30',
    name: 'Solid Oak Edge 3.0mm',
    type: 'SOLID_WOOD',
    thickness: 3.0,
    height: 23,
    costPerMeter: 85,
    color: '#C4A77D',
    textureUrl: '/textures/wood/9880503b9bc4fab08417c0ce7c618301.jpg',
    preGlued: false,
    laserCompatible: false,
    code: 'WOOD-OAK-3.0',
  },
  'edge-wood-walnut-30': {
    id: 'edge-wood-walnut-30',
    name: 'Solid Walnut Edge 3.0mm',
    type: 'SOLID_WOOD',
    thickness: 3.0,
    height: 23,
    costPerMeter: 95,
    color: '#5D4037',
    textureUrl: '/textures/wood/6ca1ee6c8d4e09b967824c7580f4471b.jpg',
    preGlued: false,
    laserCompatible: false,
    code: 'WOOD-WAL-3.0',
  },
  
  // ========== ALUMINUM EDGE ==========
  'edge-alu-silver-10': {
    id: 'edge-alu-silver-10',
    name: 'Aluminum Silver 1.0mm',
    type: 'ALUMINUM',
    thickness: 1.0,
    height: 23,
    costPerMeter: 45,
    color: '#C0C0C0',
    preGlued: false,
    laserCompatible: false,
    code: 'ALU-SIL-1.0',
  },
  'edge-alu-black-10': {
    id: 'edge-alu-black-10',
    name: 'Aluminum Black 1.0mm',
    type: 'ALUMINUM',
    thickness: 1.0,
    height: 23,
    costPerMeter: 48,
    color: '#1A1A1A',
    preGlued: false,
    laserCompatible: false,
    code: 'ALU-BLK-1.0',
  },
};

// ============================================
// PANEL MATERIAL COMPOSITION
// ============================================

export interface PanelMaterialComposition {
  // Core
  coreId: string;
  
  // Surfaces
  faceA: string | null;     // Front face surface ID
  faceB: string | null;     // Back face surface ID (can be different)
  
  // Edges (per side)
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
}

/**
 * Create default panel composition from cabinet defaults
 */
export function createDefaultComposition(
  defaultCoreId: string,
  defaultSurfaceId: string,
  defaultEdgeId: string
): PanelMaterialComposition {
  return {
    coreId: defaultCoreId,
    faceA: defaultSurfaceId,
    faceB: defaultSurfaceId, // Same as front by default
    edgeTop: defaultEdgeId,
    edgeBottom: defaultEdgeId,
    edgeLeft: defaultEdgeId,
    edgeRight: defaultEdgeId,
  };
}

/**
 * Calculate real thickness including all layers
 * T_real = T_core + T_faceA + T_faceB + (2 × T_glue)
 */
export function calculateCompositeThickness(
  composition: PanelMaterialComposition,
  glueThickness: number = 0.1
): number {
  const core = CORE_MATERIALS_CATALOG[composition.coreId];
  const faceA = composition.faceA ? SURFACE_MATERIALS_CATALOG[composition.faceA] : null;
  const faceB = composition.faceB ? SURFACE_MATERIALS_CATALOG[composition.faceB] : null;
  
  const coreT = core?.thickness || 16;
  const faceAT = faceA?.thickness || 0;
  const faceBT = faceB?.thickness || 0;
  
  // Each face has glue layer
  const glueCount = (faceA ? 1 : 0) + (faceB ? 1 : 0);
  
  return coreT + faceAT + faceBT + (glueCount * glueThickness);
}

/**
 * Calculate cut size considering edge banding
 * Cut_W = Finish_W - Edge_L - Edge_R + (2 × Pre_mill)
 */
export function calculateCutSizeWithEdges(
  finishWidth: number,
  finishHeight: number,
  composition: PanelMaterialComposition,
  preMilling: number = 0.5
): { cutWidth: number; cutHeight: number } {
  const edgeTop = composition.edgeTop ? EDGE_MATERIALS_CATALOG[composition.edgeTop] : null;
  const edgeBottom = composition.edgeBottom ? EDGE_MATERIALS_CATALOG[composition.edgeBottom] : null;
  const edgeLeft = composition.edgeLeft ? EDGE_MATERIALS_CATALOG[composition.edgeLeft] : null;
  const edgeRight = composition.edgeRight ? EDGE_MATERIALS_CATALOG[composition.edgeRight] : null;
  
  const edgeT = edgeTop?.thickness || 0;
  const edgeB = edgeBottom?.thickness || 0;
  const edgeL = edgeLeft?.thickness || 0;
  const edgeR = edgeRight?.thickness || 0;
  
  // Cut size = Finish - edges + pre-milling allowance
  const cutWidth = finishWidth - edgeL - edgeR + (2 * preMilling);
  const cutHeight = finishHeight - edgeT - edgeB + (2 * preMilling);
  
  return { cutWidth, cutHeight };
}

/**
 * Calculate panel cost
 */
export function calculatePanelCost(
  finishWidth: number,
  finishHeight: number,
  composition: PanelMaterialComposition
): { 
  coreCost: number; 
  surfaceCost: number; 
  edgeCost: number; 
  totalCost: number;
} {
  const areaSqm = (finishWidth * finishHeight) / 1000000;
  
  // Core cost
  const core = CORE_MATERIALS_CATALOG[composition.coreId];
  const coreCost = areaSqm * (core?.costPerSqm || 0);
  
  // Surface cost (both faces)
  const faceA = composition.faceA ? SURFACE_MATERIALS_CATALOG[composition.faceA] : null;
  const faceB = composition.faceB ? SURFACE_MATERIALS_CATALOG[composition.faceB] : null;
  const surfaceCost = areaSqm * ((faceA?.costPerSqm || 0) + (faceB?.costPerSqm || 0));
  
  // Edge cost (perimeter)
  const edgeTop = composition.edgeTop ? EDGE_MATERIALS_CATALOG[composition.edgeTop] : null;
  const edgeBottom = composition.edgeBottom ? EDGE_MATERIALS_CATALOG[composition.edgeBottom] : null;
  const edgeLeft = composition.edgeLeft ? EDGE_MATERIALS_CATALOG[composition.edgeLeft] : null;
  const edgeRight = composition.edgeRight ? EDGE_MATERIALS_CATALOG[composition.edgeRight] : null;
  
  const edgeCost = 
    (finishWidth / 1000) * ((edgeTop?.costPerMeter || 0) + (edgeBottom?.costPerMeter || 0)) +
    (finishHeight / 1000) * ((edgeLeft?.costPerMeter || 0) + (edgeRight?.costPerMeter || 0));
  
  return {
    coreCost,
    surfaceCost,
    edgeCost,
    totalCost: coreCost + surfaceCost + edgeCost,
  };
}

/**
 * Find matching edge for surface (auto-suggest)
 */
export function findMatchingEdge(surfaceId: string): string | null {
  const edges = Object.values(EDGE_MATERIALS_CATALOG);
  const matching = edges.find(e => e.linkedSurfaceId === surfaceId);
  return matching?.id || null;
}

/**
 * Get all edges that match a surface
 */
export function getMatchingEdges(surfaceId: string): EdgeMaterial[] {
  return Object.values(EDGE_MATERIALS_CATALOG).filter(
    e => e.linkedSurfaceId === surfaceId
  );
}
