/**
 * Cabinet Store - Parametric Cabinet State Management
 * 
 * Based on MDP (Markov Decision Process) principles:
 * - State: Current cabinet configuration
 * - Action: User modifications (add shelf, change dimension, etc.)
 * - Transition: Recalculate all panels based on new state
 * 
 * Every action triggers a full recalculation to maintain consistency
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  Cabinet,
  CabinetPanel,
  CabinetDimensions,
  CabinetStructure,
  CabinetHardware,
  CabinetType,
  JointType,
  PanelRole,
  PanelPositionOverrides,
  DEFAULT_DIMENSIONS,
  DEFAULT_STRUCTURE,
  DEFAULT_MANUFACTURING,
  DEFAULT_HARDWARE,
  DEFAULT_POSITION_OVERRIDES,
  DEFAULT_DRAWER_CONFIG,
  DEFAULT_DRAWER_ROW,
  DEFAULT_DRAWER_BOX_MATERIALS,
  DEFAULT_DOOR_CONFIG,
  DEFAULT_DOOR_PANEL,
  calculateRealThickness,
  calculateCutSize,
  createId,
  type DrawerSlideType,
  type DrawerRowConfig,
  type DrawerConfig,
  type DoorConfig,
  type DoorPanelConfig,
  type DoorOverlayType,
  type DoorOpeningDirection,
} from '../types/Cabinet';
import {
  generateDrawerPanels,
  createDrawerRowId,
  type DrawerMaterialProps,
} from '../manufacturing/drawer';
import {
  generateDoorPanels,
  createDoorPanelId,
  type DoorMaterialProps,
} from '../manufacturing/door';
import { CABINET_TYPES, type ConstructionType } from '../catalog/CabinetTaxonomy';
import { checkMutationAllowed, type SpecState } from '../spec/specState';
import { getMinifixFullConfigForThickness } from '../manufacturing/hardware/minifixDefaults';
import {
  initMaterialRegistries,
  computePanelTotalThickness,
  computeBackDepthReduction,
} from '../materials/materialThickness';
import {
  recomputeCabinetDerived,
  type CabinetForDerivation,
} from './cabinetDerivations';

// ============================================
// SPEC STATE MUTATION GUARD
// ============================================

// Lazy reference to avoid circular dependency at module load time
// Will be set on first use via dynamic import
let _specStoreRef: { getState: () => { specState: SpecState } } | null = null;

/**
 * Get current spec state from SpecStore
 * Uses lazy initialization to avoid circular dependency
 */
function getSpecState(): SpecState {
  if (!_specStoreRef) {
    // Synchronously access the already-loaded module from the module cache
    // This works because by the time this function is called, useSpecStore is already loaded
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      _specStoreRef = (window as any).__MONOLITH_SPEC_STORE__;
      if (!_specStoreRef) {
        // Fallback: return DRAFT to allow mutations if store not ready
        console.warn('[CabinetStore] SpecStore not ready, defaulting to DRAFT');
        return 'DRAFT';
      }
    } catch {
      return 'DRAFT';
    }
  }
  return _specStoreRef.getState().specState;
}

/**
 * Register spec store reference (called from useSpecStore)
 */
export function registerSpecStore(store: { getState: () => { specState: SpecState } }) {
  _specStoreRef = store;
  (window as any).__MONOLITH_SPEC_STORE__ = store;
}

/**
 * Check if geometry/structure mutation is allowed
 * Returns true if allowed, logs warning and returns false otherwise
 */
function guardMutation(operation: string): boolean {
  const specState = getSpecState();
  const check = checkMutationAllowed(specState, operation);
  if (check.ok === false) {
    console.warn('[CabinetStore] Mutation blocked:', check.reason);
    return false;
  }
  return true;
}

// ============================================
// MATERIAL LIBRARY (Temporary - will move to separate store)
// ============================================

// Manufacturing defaults that match the document specifications
const MANUFACTURING_PARAMS = {
  glueThickness: 0.1,     // T_glue: 0.1 - 0.2 mm (default 0.1)
  preMilling: 0.5,        // P_mill: 0.5 - 1.0 mm per side (default 0.5)
  grooveDepth: 8,         // G_depth: 8 - 10 mm (default 8)
  clearance: 2,           // C: 1 - 2 mm (default 2)
  shelfSetbackFront: 20,  // F_setback: ~20 mm (หลบหน้าบาน)
  shelfSetbackBack: 10,   // B_setback: for LED/ventilation (เดิม - จะคำนวณใหม่)
  
  // === NEW: Back Panel Configuration (ตามเอกสาร Divider Depth) ===
  backPanelConstruction: 'inset' as 'inset' | 'overlay', // วิธีติดตั้งแผงหลัง
  backVoid: 20,           // Back_void: ระยะเว้นหลังตู้ (19-20 mm)
  backThickness: 6,       // Back_thk: ความหนาแผงหลัง (6 or 9 mm)
  safetyGap: 2,           // Gap_safety: ระยะเผื่อไม่ให้ชน (1-2 mm)
};

// ============================================
// MATERIAL CATALOGS (Inline - Single Source of Truth)
// ============================================

// === CORE MATERIALS ===
const CORE_MATERIALS_CATALOG = {
  'core-pb-16': {
    id: 'core-pb-16',
    name: 'Particle Board 16mm',
    thickness: 16,
    costPerSqm: 250,
    co2PerSqm: 8.2,
  },
  'core-pb-18': {
    id: 'core-pb-18',
    name: 'Particle Board 18mm',
    thickness: 18,
    costPerSqm: 280,
    co2PerSqm: 9.0,
  },
  'core-mdf-6': {
    id: 'core-mdf-6',
    name: 'MDF 6mm (Backing)',
    thickness: 6,
    costPerSqm: 180,
    co2PerSqm: 5.0,
  },
  'core-mdf-16': {
    id: 'core-mdf-16',
    name: 'MDF 16mm',
    thickness: 16,
    costPerSqm: 320,
    co2PerSqm: 9.5,
  },
  'core-mdf-18': {
    id: 'core-mdf-18',
    name: 'MDF 18mm',
    thickness: 18,
    costPerSqm: 360,
    co2PerSqm: 10.2,
  },
  'core-hmr-16': {
    id: 'core-hmr-16',
    name: 'HMR Green 16mm',
    thickness: 16,
    costPerSqm: 420,
    co2PerSqm: 9.8,
  },
  'core-hmr-18': {
    id: 'core-hmr-18',
    name: 'HMR Green 18mm',
    thickness: 18,
    costPerSqm: 450,
    co2PerSqm: 10.2,
  },
  'core-ply-18': {
    id: 'core-ply-18',
    name: 'Marine Plywood 18mm',
    thickness: 18,
    costPerSqm: 850,
    co2PerSqm: 12.5,
  },
};

// === SURFACE MATERIALS ===
// Texture Size: 1523 x 3070 mm (real-world laminate sheet size)
// const _TEXTURE_SIZE_MM = { width: 1523, height: 3070 };

const SURFACE_MATERIALS_CATALOG = {
  // --- SOLID COLORS ---
  'surf-mel-white': {
    id: 'surf-mel-white',
    name: 'Melamine White',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 120,
    co2PerSqm: 0.5,
    color: '#F5F5F5',
    textureUrl: '/textures/solid/melamine-white.svg',
  },
  'surf-mel-grey': {
    id: 'surf-mel-grey',
    name: 'Melamine Stone Grey',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 140,
    co2PerSqm: 0.5,
    color: '#6B6B6B',
    textureUrl: '/textures/solid/melamine-stone-grey.svg',
  },
  'surf-mel-black': {
    id: 'surf-mel-black',
    name: 'Melamine Black',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 140,
    co2PerSqm: 0.5,
    color: '#1A1A1A',
    textureUrl: '/textures/solid/melamine-black.svg',
  },
  // --- SOLID COLOR COLLECTION ---
  'surf-789-rosso-namib': {
    id: 'surf-789-rosso-namib',
    name: 'Rosso Namib',
    category: 'Red/Terracotta',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 150,
    co2PerSqm: 0.5,
    color: '#9A4635',
    textureUrl: '/textures/solid/0789-rosso-namib.svg',
  },
  'surf-790-viola-orissa': {
    id: 'surf-790-viola-orissa',
    name: 'Viola Orissa',
    category: 'Purple/Black',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 160,
    co2PerSqm: 0.5,
    color: '#2E272C',
    textureUrl: '/textures/solid/0790-viola-orissa.svg',
  },
  'surf-771-azzurro-naxos': {
    id: 'surf-771-azzurro-naxos',
    name: 'Azzurro Naxos',
    category: 'Blue/Grey',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 140,
    co2PerSqm: 0.5,
    color: '#526372',
    textureUrl: '/textures/solid/0771-azzurro-naxos.svg',
  },
  'surf-770-rosso-askja': {
    id: 'surf-770-rosso-askja',
    name: 'Rosso Askja',
    category: 'Red/Burgundy',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 155,
    co2PerSqm: 0.5,
    color: '#674445',
    textureUrl: '/textures/solid/0770-rosso-askja.svg',
  },
  'surf-791-giallo-evora': {
    id: 'surf-791-giallo-evora',
    name: 'Giallo Evora',
    category: 'Yellow/Orange',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 160,
    co2PerSqm: 0.5,
    color: '#C48D63',
    textureUrl: '/textures/solid/0791-giallo-evora.svg',
  },
  'surf-792-blu-shaba': {
    id: 'surf-792-blu-shaba',
    name: 'Blu Shaba',
    category: 'Blue/Dark',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 165,
    co2PerSqm: 0.5,
    color: '#2B3842',
    textureUrl: '/textures/solid/0792-blu-shaba.svg',
  },
  'surf-773-verde-brac': {
    id: 'surf-773-verde-brac',
    name: 'Verde Brac',
    category: 'Green',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 145,
    co2PerSqm: 0.5,
    color: '#566A5D',
    textureUrl: '/textures/solid/0773-verde-brac.svg',
  },
  'surf-772-giallo-kashmir': {
    id: 'surf-772-giallo-kashmir',
    name: 'Giallo Kashmir',
    category: 'Yellow/Mustard',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 155,
    co2PerSqm: 0.5,
    color: '#CC9E50',
    textureUrl: '/textures/solid/0772-giallo-kashmir.svg',
  },
  'surf-793-grigio-aragona': {
    id: 'surf-793-grigio-aragona',
    name: 'Grigio Aragona',
    category: 'Grey/Dark',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 130,
    co2PerSqm: 0.5,
    color: '#413D3B',
    textureUrl: '/textures/solid/0793-grigio-aragona.svg',
  },
  'surf-794-verde-kitami': {
    id: 'surf-794-verde-kitami',
    name: 'Verde Kitami',
    category: 'Green/Light Grey',
    type: 'MELAMINE',
    thickness: 0.3,
    costPerSqm: 135,
    co2PerSqm: 0.5,
    color: '#8C958C',
    textureUrl: '/textures/solid/0794-verde-kitami.svg',
  },
  // --- DARK TONES ---
  'surf-hpl-black-oak': {
    id: 'surf-hpl-black-oak',
    name: 'HPL Black Oak',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 580,
    co2PerSqm: 1.2,
    color: '#2a2a2a',
    textureUrl: '/textures/wood/black-oak.jpg',
  },
  'surf-hpl-dark-grey-oak': {
    id: 'surf-hpl-dark-grey-oak',
    name: 'HPL Dark Grey Oak',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 520,
    co2PerSqm: 1.2,
    color: '#4a4a4a',
    textureUrl: '/textures/wood/dark-grey-oak.jpg',
  },
  'surf-hpl-charcoal-oak': {
    id: 'surf-hpl-charcoal-oak',
    name: 'HPL Charcoal Oak',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 550,
    co2PerSqm: 1.2,
    color: '#5a5a5a',
    textureUrl: '/textures/wood/charcoal-oak.jpg',
  },
  'surf-hpl-dark-elm': {
    id: 'surf-hpl-dark-elm',
    name: 'HPL Dark Elm',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 560,
    co2PerSqm: 1.2,
    color: '#5a5a52',
    textureUrl: '/textures/wood/dark-elm.jpg',
  },
  // --- GREY TONES ---
  'surf-hpl-grey-oak': {
    id: 'surf-hpl-grey-oak',
    name: 'HPL Grey Oak',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 550,
    co2PerSqm: 1.2,
    color: '#7a7a72',
    textureUrl: '/textures/wood/grey-oak.jpg',
  },
  'surf-hpl-grey-walnut': {
    id: 'surf-hpl-grey-walnut',
    name: 'HPL Grey Walnut',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 580,
    co2PerSqm: 1.2,
    color: '#9a8b7a',
    textureUrl: '/textures/wood/grey-walnut.jpg',
  },
  'surf-hpl-dark-walnut': {
    id: 'surf-hpl-dark-walnut',
    name: 'HPL Dark Walnut',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 620,
    co2PerSqm: 1.2,
    color: '#5a4a3a',
    textureUrl: '/textures/wood/dark-walnut.jpg',
  },
  // --- WARM TONES ---
  'surf-hpl-natural-walnut': {
    id: 'surf-hpl-natural-walnut',
    name: 'HPL Natural Walnut',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 520,
    co2PerSqm: 1.2,
    color: '#9a856d',
    textureUrl: '/textures/wood/natural-walnut.jpg',
  },
  'surf-hpl-light-ash': {
    id: 'surf-hpl-light-ash',
    name: 'HPL Light Ash',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 480,
    co2PerSqm: 1.2,
    color: '#b5a896',
    textureUrl: '/textures/wood/light-ash.jpg',
  },
  'surf-hpl-light-walnut': {
    id: 'surf-hpl-light-walnut',
    name: 'HPL Light Walnut',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 500,
    co2PerSqm: 1.2,
    color: '#a08878',
    textureUrl: '/textures/wood/light-walnut.jpg',
  },
  // --- BROWN TONES ---
  'surf-hpl-brown-oak': {
    id: 'surf-hpl-brown-oak',
    name: 'HPL Brown Oak',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 550,
    co2PerSqm: 1.2,
    color: '#6a5a4a',
    textureUrl: '/textures/wood/brown-oak.jpg',
  },
  'surf-hpl-brown-walnut': {
    id: 'surf-hpl-brown-walnut',
    name: 'HPL Brown Walnut',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 560,
    co2PerSqm: 1.2,
    color: '#7a5a4a',
    textureUrl: '/textures/wood/brown-walnut.jpg',
  },
  'surf-hpl-cherry-walnut': {
    id: 'surf-hpl-cherry-walnut',
    name: 'HPL Cherry Walnut',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 580,
    co2PerSqm: 1.2,
    color: '#8a5a4a',
    textureUrl: '/textures/wood/cherry-walnut.jpg',
  },
  'surf-hpl-dark-cherry': {
    id: 'surf-hpl-dark-cherry',
    name: 'HPL Dark Cherry',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 600,
    co2PerSqm: 1.2,
    color: '#5a3a2a',
    textureUrl: '/textures/wood/dark-cherry.jpg',
  },
  'surf-hpl-teak': {
    id: 'surf-hpl-teak',
    name: 'HPL Teak',
    type: 'HPL',
    thickness: 0.8,
    costPerSqm: 650,
    co2PerSqm: 1.2,
    color: '#9a7a5a',
    textureUrl: '/textures/wood/teak.jpg',
  },

// === FENIX NTM (Super Matte) ===
  'fenix-0757-bianco-dover': {
    id: 'fenix-0757-bianco-dover',
    name: 'Bianco Dover',
    category: 'White',
    type: 'FENIX_NTM',
    thickness: 1.2,
    costPerSqm: 2800,
    co2PerSqm: 3.5,
    color: '#F5F5F5',
    textureUrl: '/textures/solid/0757-bianco-dover.svg',
  },
  'fenix-0030-bianco-alaska': {
    id: 'fenix-0030-bianco-alaska',
    name: 'Bianco Alaska',
    category: 'White',
    type: 'FENIX_NTM',
    thickness: 1.2,
    costPerSqm: 3000,
    co2PerSqm: 3.8,
    color: '#FFFFFF',
    textureUrl: '/textures/solid/0030-bianco-alaska.svg',
  },
  'fenix-0032-bianco-kos': {
    id: 'fenix-0032-bianco-kos',
    name: 'Bianco Kos',
    category: 'White',
    type: 'FENIX_NTM',
    thickness: 1.2,
    costPerSqm: 2850,
    co2PerSqm: 3.6,
    color: '#F2F2F2',
    textureUrl: '/textures/solid/0032-bianco-kos.svg',
  },
  'fenix-0029-bianco-male': {
    id: 'fenix-0029-bianco-male',
    name: 'Bianco Malè',
    category: 'White/Warm',
    type: 'FENIX_NTM',
    thickness: 1.2,
    costPerSqm: 2900,
    co2PerSqm: 3.7,
    color: '#F9F6EF',
    textureUrl: '/textures/solid/0029-bianco-male.svg',
  },
  'fenix-0719-beige-luxor': {
    id: 'fenix-0719-beige-luxor',
    name: 'Beige Luxor',
    category: 'Beige',
    type: 'FENIX_NTM',
    thickness: 1.2,
    costPerSqm: 2650,
    co2PerSqm: 3.3,
    color: '#D5C7B6',
    textureUrl: '/textures/solid/0719-beige-luxor.svg',
  },
  'fenix-0717-castoro-ottawa': {
    id: 'fenix-0717-castoro-ottawa',
    name: 'Castoro Ottawa',
    category: 'Brown/Taupe',
    type: 'FENIX_NTM',
    thickness: 1.2,
    costPerSqm: 2600,
    co2PerSqm: 3.2,
    color: '#93857B',
    textureUrl: '/textures/solid/0717-castoro-ottawa.svg',
  },
  'fenix-0748-beige-arizona': {
    id: 'fenix-0748-beige-arizona',
    name: 'Beige Arizona',
    category: 'Beige/Greige',
    type: 'FENIX_NTM',
    thickness: 1.2,
    costPerSqm: 2700,
    co2PerSqm: 3.4,
    color: '#B1A192',
    textureUrl: '/textures/solid/0748-beige-arizona.svg',
  },
  'fenix-0725-grigio-efeso': {
    id: 'fenix-0725-grigio-efeso',
    name: 'Grigio Efeso',
    category: 'Grey/Light',
    type: 'FENIX_NTM',
    thickness: 1.2,
    costPerSqm: 2550,
    co2PerSqm: 3.1,
    color: '#CFCFD0',
    textureUrl: '/textures/solid/0725-grigio-efeso.svg',
  },
  'fenix-0718-grigio-londra': {
    id: 'fenix-0718-grigio-londra',
    name: 'Grigio Londra',
    category: 'Grey/Medium',
    type: 'FENIX_NTM',
    thickness: 1.2,
    costPerSqm: 2500,
    co2PerSqm: 3.0,
    color: '#757271',
    textureUrl: '/textures/solid/0718-grigio-londra.svg',
  },
  'fenix-0752-grigio-antrim': {
    id: 'fenix-0752-grigio-antrim',
    name: 'Grigio Antrim',
    category: 'Grey/Cool',
    type: 'FENIX_NTM',
    thickness: 1.2,
    costPerSqm: 2580,
    co2PerSqm: 3.2,
    color: '#A0A19F',
    textureUrl: '/textures/solid/0752-grigio-antrim.svg',
  },
  'fenix-0720-nero-ingo': {
    id: 'fenix-0720-nero-ingo',
    name: 'Nero Ingo',
    category: 'Black',
    type: 'FENIX_NTM',
    thickness: 1.2,
    costPerSqm: 2450,
    co2PerSqm: 2.9,
    color: '#2D2D2D',
    textureUrl: '/textures/solid/0720-nero-ingo.svg',
  },
  'fenix-0724-grigio-bromo': {
    id: 'fenix-0724-grigio-bromo',
    name: 'Grigio Bromo',
    category: 'Grey/Dark',
    type: 'FENIX_NTM',
    thickness: 1.2,
    costPerSqm: 2480,
    co2PerSqm: 3.0,
    color: '#505255',
    textureUrl: '/textures/solid/0724-grigio-bromo.svg',
  },

// === FENIX NTA (Metal Surfaces) ===
  'fenix-5000-acciaio-hamilton': {
    id: 'fenix-5000-acciaio-hamilton',
    name: 'Acciaio Hamilton',
    category: 'Metal/Steel',
    type: 'FENIX_NTA',
    thickness: 1.2,
    costPerSqm: 3800,
    co2PerSqm: 4.5,
    color: '#A8A5A1',
    textureUrl: '/textures/solid/5000-acciaio-hamilton.svg',
  },
  'fenix-5001-argento-dukat': {
    id: 'fenix-5001-argento-dukat',
    name: 'Argento Dukat',
    category: 'Metal/Silver',
    type: 'FENIX_NTA',
    thickness: 1.2,
    costPerSqm: 4200,
    co2PerSqm: 5.0,
    color: '#BEBEC0',
    textureUrl: '/textures/solid/5001-argento-dukat.svg',
  },
  'fenix-5003-oro-cortez': {
    id: 'fenix-5003-oro-cortez',
    name: 'Oro Cortez',
    category: 'Metal/Gold',
    type: 'FENIX_NTA',
    thickness: 1.2,
    costPerSqm: 5500,
    co2PerSqm: 6.5,
    color: '#C4B5A0',
    textureUrl: '/textures/solid/5003-oro-cortez.svg',
  },
};

// === EDGE MATERIALS ===
const EDGE_MATERIALS_CATALOG = {
  // FENIX NTM (Super Matte - share texture with Melamine)
  'edge-fenixntm-melamine-white': {
    id: 'edge-fenixntm-melamine-white',
    name: 'ABS Melamine White 1.0mm',
    code: 'ABS-MW-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 15,
    color: '#F5F5F5',
    type: 'ABS',
    textureUrl: '/textures/solid/fenixntm-melamine-white.svg', // Share with Melamine
  },
  'edge-fenixntm-melamine-stone-grey': {
    id: 'edge-fenixntm-melamine-stone-grey',
    name: 'ABS Melamine Grey 1.0mm',
    code: 'ABS-MG-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 16,
    color: '#6B6B6B',
    type: 'ABS',
    textureUrl: '/textures/solid/fenixntm-melamine-stone-grey.svg', // Share with Melamine
  },
  'edge-fenixntm-melamine-black': {
    id: 'edge-fenixntm-melamine-black',
    name: 'ABS Melamine Black 1.0mm',
    code: 'ABS-MK-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 18,
    color: '#1A1A1A',
    type: 'ABS',
    textureUrl: '/textures/solid/fenixntm-melamine-black.svg', // Share with Melamine
  },
  'edge-fenixntm-rosso-namib': {
    id: 'edge-fenixntm-rosso-namib',
    name: 'ABS Rosso Namib 1.0mm',
    code: 'ABS-RN-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 20,
    color: '#9A4635',
    type: 'ABS',
    textureUrl: '/textures/solid/fenixntm-rosso-namib.svg', // Share with Solid Color
  },
  'edge-fenixntm-viola-orissa': {
    id: 'edge-fenixntm-viola-orissa',
    name: 'ABS Viola Orissa 1.0mm',
    code: 'ABS-VO-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 21,
    color: '#2E272C',
    type: 'ABS',
    textureUrl: '/textures/solid/fenixntm-viola-orissa.svg', // Share with Solid Color
  },
  'edge-fenixntm-azzurro-naxos': {
    id: 'edge-fenixntm-azzurro-naxos',
    name: 'ABS Azzurro Naxos 1.0mm',
    code: 'ABS-AN-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 19,
    color: '#526372',
    type: 'ABS',
    textureUrl: '/textures/solid/fenixntm-azzurro-naxos.svg', // Share with Solid Color
  },
  'edge-fenixntm-rosso-askja': {
    id: 'edge-fenixntm-rosso-askja',
    name: 'ABS Rosso Askja 1.0mm',
    code: 'ABS-RS-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 22,
    color: '#674445',
    type: 'ABS',
    textureUrl: '/textures/solid/fenixntm-rosso-askja.svg', // Share with Solid Color
  },
  'edge-fenixntm-giallo-evora': {
    id: 'edge-fenixntm-giallo-evora',
    name: 'ABS Giallo Evora 1.0mm',
    code: 'ABS-GE-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 23,
    color: '#C48D63',
    type: 'ABS',
    textureUrl: '/textures/solid/fenixntm-giallo-evora.svg', // Share with Solid Color
  },
  'edge-fenixntm-blu-shaba': {
    id: 'edge-fenixntm-blu-shaba',
    name: 'ABS Blu Shaba 1.0mm',
    code: 'ABS-BS-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 24,
    color: '#2B3842',
    type: 'ABS',
    textureUrl: '/textures/solid/fenixntm-blu-shaba.svg', // Share with Solid Color
  },
  'edge-fenixntm-verde-brac': {
    id: 'edge-fenixntm-verde-brac',
    name: 'ABS Verde Brac 1.0mm',
    code: 'ABS-VB-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 21,
    color: '#566A5D',
    type: 'ABS',
    textureUrl: '/textures/solid/fenixntm-verde-brac.svg', // Share with Solid Color
  },
  'edge-fenixntm-giallo-kashmir': {
    id: 'edge-fenixntm-giallo-kashmir',
    name: 'ABS Giallo Kashmir 1.0mm',
    code: 'ABS-GK-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 22,
    color: '#CC9E50',
    type: 'ABS',
    textureUrl: '/textures/solid/fenixntm-giallo-kashmir.svg', // Share with Solid Color
  },
  'edge-fenixntm-grigio-aragona': {
    id: 'edge-fenixntm-grigio-aragona',
    name: 'ABS Grigio Aragona 1.0mm',
    code: 'ABS-GA-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 20,
    color: '#413D3B',
    type: 'ABS',
    textureUrl: '/textures/solid/fenixntm-grigio-aragona.svg', // Share with Solid Color
  },
  'edge-fenixntm-verde-kitami': {
    id: 'edge-fenixntm-verde-kitami',
    name: 'ABS Verde Kitami 1.0mm',
    code: 'ABS-VK-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 19,
    color: '#8C958C',
    type: 'ABS',
    textureUrl: '/textures/solid/fenixntm-verde-kitami.svg', // Share with Solid Color
  },

  // PVC Solid Colors (share texture with Melamine solid colors)
  'edge-pvc-white-04': {
    id: 'edge-pvc-white-04',
    name: 'PVC White 0.4mm',
    code: 'PVC-W-0.4',
    thickness: 0.4,
    height: 23,
    costPerMeter: 5,
    color: '#FFFFFF',
    type: 'PVC',
    textureUrl: '/textures/solid/melamine-white.svg', // Match with Surface Materials
  },
  'edge-pvc-white-05': {
    id: 'edge-pvc-white-05',
    name: 'PVC White 0.5mm',
    code: 'PVC-W-0.5',
    thickness: 0.5,
    height: 23,
    costPerMeter: 6,
    color: '#FFFFFF',
    type: 'PVC',
    textureUrl: '/textures/solid/melamine-white.svg', // Match with Surface Materials
  },
  'edge-pvc-white-10': {
    id: 'edge-pvc-white-10',
    name: 'PVC White 1.0mm',
    code: 'PVC-W-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 12,
    color: '#FFFFFF',
    type: 'PVC',
    textureUrl: '/textures/solid/melamine-white.svg', // Match with Surface Materials
  },
  'edge-pvc-white-20': {
    id: 'edge-pvc-white-20',
    name: 'PVC White 2.0mm',
    code: 'PVC-W-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 22,
    color: '#FFFFFF',
    type: 'PVC',
    textureUrl: '/textures/solid/melamine-white.svg', // Match with Surface Materials
  },
  'edge-pvc-grey-10': {
    id: 'edge-pvc-grey-10',
    name: 'PVC Grey 1.0mm',
    code: 'PVC-G-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 12,
    color: '#6B6B6B',
    type: 'PVC',
    textureUrl: '/textures/solid/melamine-stone-grey.svg', // Match with Surface Materials
  },
  'edge-pvc-black-10': {
    id: 'edge-pvc-black-10',
    name: 'PVC Black 1.0mm',
    code: 'PVC-B-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 14,
    color: '#1A1A1A',
    type: 'PVC',
    textureUrl: '/textures/solid/melamine-black.svg', // Match with Surface Materials
  },
  // PVC Solid Color Collection (share texture with Surface Materials)
  'edge-789-rosso-namib': {
    id: 'edge-789-rosso-namib',
    name: 'PVC Rosso Namib 1.0mm',
    code: 'PVC-789-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 18,
    color: '#9A4635',
    type: 'PVC',
    category: 'Red/Terracotta',
    textureUrl: '/textures/solid/0789-rosso-namib.svg', // Match with Surface Materials
  },
  'edge-790-viola-orissa': {
    id: 'edge-790-viola-orissa',
    name: 'PVC Viola Orissa 1.0mm',
    code: 'PVC-790-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 20,
    color: '#2E272C',
    type: 'PVC',
    category: 'Purple/Black',
    textureUrl: '/textures/solid/0790-viola-orissa.svg', // Match with Surface Materials
  },
  'edge-771-azzurro-naxos': {
    id: 'edge-771-azzurro-naxos',
    name: 'PVC Azzurro Naxos 1.0mm',
    code: 'PVC-771-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 17,
    color: '#526372',
    type: 'PVC',
    category: 'Blue/Grey',
    textureUrl: '/textures/solid/0771-azzurro-naxos.svg', // Match with Surface Materials
  },
  'edge-770-rosso-askja': {
    id: 'edge-770-rosso-askja',
    name: 'PVC Rosso Askja 1.0mm',
    code: 'PVC-770-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 19,
    color: '#674445',
    type: 'PVC',
    category: 'Red/Burgundy',
    textureUrl: '/textures/solid/0770-rosso-askja.svg', // Match with Surface Materials
  },
  'edge-791-giallo-evora': {
    id: 'edge-791-giallo-evora',
    name: 'PVC Giallo Evora 1.0mm',
    code: 'PVC-791-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 20,
    color: '#C48D63',
    type: 'PVC',
    category: 'Yellow/Orange',
    textureUrl: '/textures/solid/0791-giallo-evora.svg', // Match with Surface Materials
  },
  'edge-792-blu-shaba': {
    id: 'edge-792-blu-shaba',
    name: 'PVC Blu Shaba 1.0mm',
    code: 'PVC-792-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 21,
    color: '#2B3842',
    type: 'PVC',
    category: 'Blue/Dark',
    textureUrl: '/textures/solid/0792-blu-shaba.svg', // Match with Surface Materials
  },
  'edge-773-verde-brac': {
    id: 'edge-773-verde-brac',
    name: 'PVC Verde Brac 1.0mm',
    code: 'PVC-773-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 18,
    color: '#566A5D',
    type: 'PVC',
    category: 'Green',
    textureUrl: '/textures/solid/0773-verde-brac.svg', // Match with Surface Materials
  },
  'edge-772-giallo-kashmir': {
    id: 'edge-772-giallo-kashmir',
    name: 'PVC Giallo Kashmir 1.0mm',
    code: 'PVC-772-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 19,
    color: '#CC9E50',
    type: 'PVC',
    category: 'Yellow/Mustard',
    textureUrl: '/textures/solid/0772-giallo-kashmir.svg', // Match with Surface Materials
  },
  'edge-793-grigio-aragona': {
    id: 'edge-793-grigio-aragona',
    name: 'PVC Grigio Aragona 1.0mm',
    code: 'PVC-793-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 16,
    color: '#413D3B',
    type: 'PVC',
    category: 'Grey/Dark',
    textureUrl: '/textures/solid/0793-grigio-aragona.svg', // Match with Surface Materials
  },
  'edge-794-verde-kitami': {
    id: 'edge-794-verde-kitami',
    name: 'PVC Verde Kitami 1.0mm',
    code: 'PVC-794-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 17,
    color: '#8C958C',
    type: 'PVC',
    category: 'Green/Light Grey',
    textureUrl: '/textures/solid/0794-verde-kitami.svg', // Match with Surface Materials
  },
  // === FENIX NTM (Super Matte) Edge Materials ===
  'edge-fenix-0757-bianco-dover': {
    id: 'edge-fenix-0757-bianco-dover',
    name: 'ABS Bianco Dover 2.0mm',
    code: 'ABS-757-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 45,
    color: '#F5F5F5',
    type: 'ABS',
    category: 'White',
    textureUrl: '/textures/solid/0757-bianco-dover.svg', // Match with Surface Materials
  },
  'edge-fenix-0030-bianco-alaska': {
    id: 'edge-fenix-0030-bianco-alaska',
    name: 'ABS Bianco Alaska 2.0mm',
    code: 'ABS-030-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 48,
    color: '#FFFFFF',
    type: 'ABS',
    category: 'White',
    textureUrl: '/textures/solid/0030-bianco-alaska.svg', // Match with Surface Materials
  },
  'edge-fenix-0032-bianco-kos': {
    id: 'edge-fenix-0032-bianco-kos',
    name: 'ABS Bianco Kos 2.0mm',
    code: 'ABS-032-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 46,
    color: '#F2F2F2',
    type: 'ABS',
    category: 'White',
    textureUrl: '/textures/solid/0032-bianco-kos.svg', // Match with Surface Materials
  },
  'edge-fenix-0029-bianco-male': {
    id: 'edge-fenix-0029-bianco-male',
    name: 'ABS Bianco Malè 2.0mm',
    code: 'ABS-029-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 47,
    color: '#F9F6EF',
    type: 'ABS',
    category: 'White/Warm',
    textureUrl: '/textures/solid/0029-bianco-male.svg', // Match with Surface Materials
  },
  'edge-fenix-0719-beige-luxor': {
    id: 'edge-fenix-0719-beige-luxor',
    name: 'ABS Beige Luxor 2.0mm',
    code: 'ABS-719-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 43,
    color: '#D5C7B6',
    type: 'ABS',
    category: 'Beige',
    textureUrl: '/textures/solid/0719-beige-luxor.svg', // Match with Surface Materials
  },
  'edge-fenix-0717-castoro-ottawa': {
    id: 'edge-fenix-0717-castoro-ottawa',
    name: 'ABS Castoro Ottawa 2.0mm',
    code: 'ABS-717-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 42,
    color: '#93857B',
    type: 'ABS',
    category: 'Brown/Taupe',
    textureUrl: '/textures/solid/0717-castoro-ottawa.svg', // Match with Surface Materials
  },
  'edge-fenix-0748-beige-arizona': {
    id: 'edge-fenix-0748-beige-arizona',
    name: 'ABS Beige Arizona 2.0mm',
    code: 'ABS-748-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 44,
    color: '#B1A192',
    type: 'ABS',
    category: 'Beige/Greige',
    textureUrl: '/textures/solid/0748-beige-arizona.svg', // Match with Surface Materials
  },
  'edge-fenix-0725-grigio-efeso': {
    id: 'edge-fenix-0725-grigio-efeso',
    name: 'ABS Grigio Efeso 2.0mm',
    code: 'ABS-725-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 41,
    color: '#CFCFD0',
    type: 'ABS',
    category: 'Grey/Light',
    textureUrl: '/textures/solid/0725-grigio-efeso.svg', // Match with Surface Materials
  },
  'edge-fenix-0718-grigio-londra': {
    id: 'edge-fenix-0718-grigio-londra',
    name: 'ABS Grigio Londra 2.0mm',
    code: 'ABS-718-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 40,
    color: '#757271',
    type: 'ABS',
    category: 'Grey/Medium',
    textureUrl: '/textures/solid/0718-grigio-londra.svg', // Match with Surface Materials
  },
  'edge-fenix-0752-grigio-antrim': {
    id: 'edge-fenix-0752-grigio-antrim',
    name: 'ABS Grigio Antrim 2.0mm',
    code: 'ABS-752-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 41,
    color: '#A0A19F',
    type: 'ABS',
    category: 'Grey/Cool',
    textureUrl: '/textures/solid/0752-grigio-antrim.svg', // Match with Surface Materials
  },
  'edge-fenix-0720-nero-ingo': {
    id: 'edge-fenix-0720-nero-ingo',
    name: 'ABS Nero Ingo 2.0mm',
    code: 'ABS-720-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 39,
    color: '#2D2D2D',
    type: 'ABS',
    category: 'Black',
    textureUrl: '/textures/solid/0720-nero-ingo.svg', // Match with Surface Materials
  },
  'edge-fenix-0724-grigio-bromo': {
    id: 'edge-fenix-0724-grigio-bromo',
    name: 'ABS Grigio Bromo 2.0mm',
    code: 'ABS-724-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 40,
    color: '#505255',
    type: 'ABS',
    category: 'Grey/Dark',
    textureUrl: '/textures/solid/0724-grigio-bromo.svg', // Match with Surface Materials
  },

  // === FENIX NTA (Metal Surfaces) Edge Materials ===
  'edge-fenix-5000-acciaio-hamilton': {
    id: 'edge-fenix-5000-acciaio-hamilton',
    name: 'ABS Acciaio Hamilton 2.0mm',
    code: 'ABS-5000-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 65,
    color: '#A8A5A1',
    type: 'ABS',
    category: 'Metal/Steel',
    textureUrl: '/textures/solid/5000-acciaio-hamilton.svg', // Match with Surface Materials
  },
  'edge-fenix-5001-argento-dukat': {
    id: 'edge-fenix-5001-argento-dukat',
    name: 'ABS Argento Dukat 2.0mm',
    code: 'ABS-5001-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 72,
    color: '#BEBEC0',
    type: 'ABS',
    category: 'Metal/Silver',
    textureUrl: '/textures/solid/5001-argento-dukat.svg', // Match with Surface Materials
  },
  'edge-fenix-5003-oro-cortez': {
    id: 'edge-fenix-5003-oro-cortez',
    name: 'ABS Oro Cortez 2.0mm',
    code: 'ABS-5003-2.0',
    thickness: 2.0,
    height: 23,
    costPerMeter: 95,
    color: '#C4B5A0',
    type: 'ABS',
    category: 'Metal/Gold',
    textureUrl: '/textures/solid/5003-oro-cortez.svg', // Match with Surface Materials
  },
  // ABS Wood Grain (share texture with HPL Surface Materials)
  'edge-abs-oak-10': {
    id: 'edge-abs-oak-10',
    name: 'ABS Oak 1.0mm',
    code: 'ABS-OAK-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 22,
    color: '#C4A77D',
    type: 'ABS',
    textureUrl: '/textures/wood/grey-oak.jpg', // Match with Surface Materials HPL Grey Oak
  },
  'edge-abs-walnut-10': {
    id: 'edge-abs-walnut-10',
    name: 'ABS Walnut 1.0mm',
    code: 'ABS-WAL-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 24,
    color: '#5D4037',
    type: 'ABS',
    textureUrl: '/textures/wood/dark-walnut.jpg', // Match with Surface Materials HPL Dark Walnut
  },
  'edge-abs-walnut-grey-10': {
    id: 'edge-abs-walnut-grey-10',
    name: 'ABS Grey Walnut 1.0mm',
    code: 'ABS-GW-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 26,
    color: '#9a8b7a',
    type: 'ABS',
    textureUrl: '/textures/wood/grey-walnut.jpg', // Match with Surface Materials HPL Grey Walnut
  },
  'edge-abs-oak-grey-10': {
    id: 'edge-abs-oak-grey-10',
    name: 'ABS Grey Wash Oak 1.0mm',
    code: 'ABS-GO-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 25,
    color: '#7a7a72',
    textureUrl: '/textures/wood/428c5e7db15f9ac1df0adaa31089124a.jpg',
  },
  'edge-abs-ash-silver-10': {
    id: 'edge-abs-ash-silver-10',
    name: 'ABS Silver Ash 1.0mm',
    code: 'ABS-SA-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 24,
    color: '#8a8a8a',
    textureUrl: '/textures/wood/ae7ac17779fa6e250256872104665661.jpg',
  },
  'edge-abs-walnut-dark-10': {
    id: 'edge-abs-walnut-dark-10',
    name: 'ABS Dark Walnut 1.0mm',
    code: 'ABS-DW-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 28,
    color: '#5a4a3a',
    textureUrl: '/textures/wood/6ec338abc60c08cd95f6fc5c011f60d5.jpg',
  },
  // HPL Edge
  'edge-hpl-oak-08': {
    id: 'edge-hpl-oak-08',
    name: 'HPL Oak Edge 0.8mm',
    code: 'HPL-OAK-0.8',
    thickness: 0.8,
    height: 23,
    costPerMeter: 35,
    color: '#C4A77D',
    textureUrl: '/textures/wood/9880503b9bc4fab08417c0ce7c618301.jpg',
  },
  'edge-hpl-walnut-08': {
    id: 'edge-hpl-walnut-08',
    name: 'HPL Walnut Edge 0.8mm',
    code: 'HPL-WAL-0.8',
    thickness: 0.8,
    height: 23,
    costPerMeter: 38,
    color: '#5D4037',
    textureUrl: '/textures/wood/6ca1ee6c8d4e09b967824c7580f4471b.jpg',
  },
  // Solid Wood Edge
  'edge-wood-oak-30': {
    id: 'edge-wood-oak-30',
    name: 'Solid Oak Edge 3.0mm',
    code: 'WOOD-OAK-3.0',
    thickness: 3.0,
    height: 23,
    costPerMeter: 85,
    color: '#C4A77D',
    textureUrl: '/textures/wood/9880503b9bc4fab08417c0ce7c618301.jpg',
  },
  'edge-wood-walnut-30': {
    id: 'edge-wood-walnut-30',
    name: 'Solid Walnut Edge 3.0mm',
    code: 'WOOD-WAL-3.0',
    thickness: 3.0,
    height: 23,
    costPerMeter: 95,
    color: '#5D4037',
    textureUrl: '/textures/wood/6ca1ee6c8d4e09b967824c7580f4471b.jpg',
  },
  // Aluminum Edge
  'edge-alu-silver-10': {
    id: 'edge-alu-silver-10',
    name: 'Aluminum Silver 1.0mm',
    code: 'ALU-SIL-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 45,
    color: '#C0C0C0',
    textureUrl: undefined as string | undefined,
  },
  'edge-alu-black-10': {
    id: 'edge-alu-black-10',
    name: 'Aluminum Black 1.0mm',
    code: 'ALU-BLK-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 48,
    color: '#1A1A1A',
    textureUrl: undefined as string | undefined,
  },
};

// Re-export for backward compatibility
const CORE_MATERIALS = CORE_MATERIALS_CATALOG;
export const SURFACE_MATERIALS = SURFACE_MATERIALS_CATALOG;
const EDGE_MATERIALS = EDGE_MATERIALS_CATALOG;

// ============================================
// INITIALIZE MATERIAL THICKNESS SYSTEM
// ============================================

// Initialize the material registries for the Truth Module
// This MUST happen after catalogs are defined but before any thickness calculations
initMaterialRegistries(CORE_MATERIALS_CATALOG, SURFACE_MATERIALS_CATALOG);

// ============================================
// PANEL THICKNESS HELPER (Wrapper for Truth Module)
// ============================================

/**
 * Calculate actual total thickness of a panel from its materials
 * DELEGATES to the Truth Module (materialThickness.ts) for single-source-of-truth
 *
 * @param panel - The panel to calculate thickness for
 * @param defaultSurfaceId - Default surface material ID for fallback
 * @returns Total thickness = core + faceA + faceB
 */
function calcPanelTotalThickness(
  panel: { coreMaterialId: string; faces: { faceA: string | null; faceB: string | null } },
  defaultSurfaceId: string
): number {
  return computePanelTotalThickness(panel, defaultSurfaceId);
}

/**
 * TRUTH MODULE WRAPPER: Calculate back depth reduction
 * Uses computeBackDepthReduction from materialThickness.ts
 *
 * @param structure - Cabinet structure with backPanelConstruction
 * @param backPanel - The back panel (from cabinet.panels)
 * @param defaultSurfaceId - Default surface material ID
 * @returns Depth reduction in mm (0 for inset, backTotalT for overlay)
 */
function calcBackDepthReduction(
  structure: { hasBackPanel: boolean; backPanelConstruction: 'inset' | 'overlay' },
  backPanel: { coreMaterialId: string; faces: { faceA: string | null; faceB: string | null } } | null,
  defaultSurfaceId: string
): number {
  return computeBackDepthReduction(structure, backPanel, defaultSurfaceId);
}

/**
 * Recompute carcass geometry when back panel thickness changes (OVERLAY mode)
 *
 * INVARIANTS:
 * - carcassDepth = D - backDepthReduction
 * - carcassZ = backDepthReduction / 2
 * - backZ = -D/2 + backTotalT/2
 *
 * @param cabinet - The cabinet to update (mutated in place)
 * @param edgeMaterials - Edge materials catalog for cut size calculation
 */
function recomputeCarcassGeometry(
  cabinet: Cabinet,
  edgeMaterials: Record<string, { thickness: number }>
): void {
  if (!cabinet.structure?.hasBackPanel || cabinet.structure.backPanelConstruction !== 'overlay') {
    return; // Only applies to overlay mode
  }

  const D = cabinet.dimensions.depth;
  const defaultSurfaceId = cabinet.materials?.defaultSurface ?? 'surf-mel-white';
  const backPanel = cabinet.panels.find(p => p.role === 'BACK');

  if (!backPanel) return;

  // TRUTH MODULE: Calculate back depth reduction
  const backTotalT = calcPanelTotalThickness(backPanel, defaultSurfaceId);
  const backDepthReduction = calcBackDepthReduction(cabinet.structure, backPanel, defaultSurfaceId);
  const newCarcassDepth = D - backDepthReduction;
  const newCarcassZ = backDepthReduction / 2;
  const newBackZ = -D / 2 + backTotalT / 2;

  // Update all panels with new geometry
  for (const p of cabinet.panels) {
    switch (p.role) {
      case 'LEFT_SIDE':
      case 'RIGHT_SIDE':
        // finishWidth = depth for side panels
        p.finishWidth = newCarcassDepth;
        p.position = [p.position[0], p.position[1], newCarcassZ];
        // Recalculate cut dimensions
        if (p.computed) {
          const edgeL = p.edges?.left ? (edgeMaterials[p.edges.left as keyof typeof edgeMaterials]?.thickness ?? 1) : 0;
          const edgeR = p.edges?.right ? (edgeMaterials[p.edges.right as keyof typeof edgeMaterials]?.thickness ?? 1) : 0;
          p.computed.cutWidth = p.finishWidth - edgeL - edgeR + (edgeL > 0 ? 1 : 0) + (edgeR > 0 ? 1 : 0);
          p.computed.surfaceArea = (p.finishWidth * p.finishHeight) / 1000000 * 2;
        }
        break;

      case 'TOP':
      case 'BOTTOM':
      case 'SHELF':
        // finishHeight = depth for horizontal panels
        p.finishHeight = newCarcassDepth;
        p.position = [p.position[0], p.position[1], newCarcassZ];
        // Recalculate cut dimensions
        if (p.computed) {
          const edgeT = p.edges?.top ? (edgeMaterials[p.edges.top as keyof typeof edgeMaterials]?.thickness ?? 1) : 0;
          const edgeB = p.edges?.bottom ? (edgeMaterials[p.edges.bottom as keyof typeof edgeMaterials]?.thickness ?? 1) : 0;
          p.computed.cutHeight = p.finishHeight - edgeT - edgeB + (edgeT > 0 ? 1 : 0) + (edgeB > 0 ? 1 : 0);
          p.computed.surfaceArea = (p.finishWidth * p.finishHeight) / 1000000 * 2;
        }
        break;

      case 'BACK':
        // Update back panel Z position to stay inside OD budget
        p.position = [p.position[0], p.position[1], newBackZ];
        break;

      case 'DIVIDER':
        // Dividers also use finishHeight = depth
        p.finishHeight = newCarcassDepth;
        p.position = [p.position[0], p.position[1], newCarcassZ];
        if (p.computed) {
          p.computed.surfaceArea = (p.finishWidth * p.finishHeight) / 1000000 * 2;
        }
        break;
    }
  }
}

// ============================================
// REACTIVITY CONTRACT: withActiveCabinet Helper
// ============================================

/**
 * PHASE 3: Central helper for mutating the active cabinet
 *
 * CONTRACT:
 * 1. Mutations go through cabinets[idx] (array element = truth)
 * 2. After mutation, recomputeCabinetDerived is called
 * 3. state.cabinet is synced as UI pointer
 *
 * This ensures Cabinet3D subscribers see updates immediately.
 *
 * @param state - The Immer draft state
 * @param fn - Mutation function (receives cabinet, may mutate it)
 * @param options - Control options
 */
function withActiveCabinet(
  state: {
    activeCabinetId: string | null;
    cabinets: Cabinet[];
    cabinet: Cabinet | null;
    edgeMaterials: Record<string, { thickness: number }>;
  },
  fn: (cabinet: Cabinet) => void,
  options: { skipRecompute?: boolean } = {}
): void {
  const id = state.activeCabinetId;
  if (!id) return;

  const idx = state.cabinets.findIndex(c => c.id === id);
  if (idx === -1) return;

  // Get the truth object (cabinet in array)
  const cabinet = state.cabinets[idx];

  // Execute mutation on the truth object
  fn(cabinet);

  // Recompute derived values (unless skipped for batch operations)
  if (!options.skipRecompute) {
    recomputeCabinetDerived(
      cabinet as unknown as CabinetForDerivation,
      state.edgeMaterials
    );
  }

  // Sync UI pointer to truth object
  state.cabinet = cabinet;
}

// ============================================
// PANEL GENERATION LOGIC
// ============================================

/**
 * Generate all panels for a cabinet based on current configuration
 * This is the core "transition function" in MDP terms
 * 
 * MANUFACTURING LOGIC (from North Star Document):
 * 
 * 1. MATERIAL PHYSICS: T_total = T_core + T_surfA + T_surfB + (T_glue × 2)
 * 
 * 2. BACK PANEL LOGIC:
 *    - Inset: BackObstruction = GrooveOffset + T_back
 *    - Overlay: BackObstruction = T_back
 * 
 * 3. ANTI-COLLISION: Depth_internal = D_cabinet - BackObstruction - SafetyGap
 * 
 * 4. FINISH TO CUT: CutSize = FinishSize - (Edge1 + Edge2) + (PreMill × edged_sides)
 * 
 * PANEL SIZE RULE:
 * - Panel Finish Size does NOT include edge thickness
 * - Panel + Edge Band = Cabinet Dimension
 */
function generatePanels(
  dimensions: CabinetDimensions,
  structure: CabinetStructure,
  defaultCoreId: string,
  defaultSurfaceId: string,
  defaultEdgeId: string,
  existingOverrides?: Map<string, {
    role: PanelRole;
    index: number;
    overrides?: PanelPositionOverrides;
    useCustomPosition?: boolean;
    xPosition?: number; // Custom X position for dividers
  }>
): CabinetPanel[] {
  const panels: CabinetPanel[] = [];
  const { width: W, height: H, depth: D, toeKickHeight: Leg } = dimensions;
  
  // Get material properties
  const core = CORE_MATERIALS[defaultCoreId as keyof typeof CORE_MATERIALS] || CORE_MATERIALS['core-pb-16'];
  const surface = SURFACE_MATERIALS[defaultSurfaceId as keyof typeof SURFACE_MATERIALS] || SURFACE_MATERIALS['surf-mel-white'];
  // Edge can be from EDGE_MATERIALS or SURFACE_MATERIALS (user can select surface as edge)
  const edgeFromEdgeMats = EDGE_MATERIALS[defaultEdgeId as keyof typeof EDGE_MATERIALS];
  const edgeFromSurfaceMats = SURFACE_MATERIALS[defaultEdgeId as keyof typeof SURFACE_MATERIALS];
  const edge = edgeFromEdgeMats || edgeFromSurfaceMats || EDGE_MATERIALS['edge-pvc-white-10'];
  const ET = edge.thickness; // Edge thickness (from actual selected material)
  
  // 1. MATERIAL PHYSICS: Calculate real thickness (no glue in displayed thickness)
  const T_real = calculateRealThickness(
    core.thickness,
    surface.thickness,
    surface.thickness,
    0 // No glue in displayed thickness: e.g., 18 + 0.3 + 0.3 = 18.6mm
  );
  const T = T_real; // Use real thickness for position calculations
  
  // 2. BACK PANEL LOGIC: Calculate BackObstruction
  // Use structure.backPanelConstruction (per-cabinet setting) instead of global MANUFACTURING_PARAMS
  const backObstruction = (structure.backPanelConstruction === 'inset')
    ? MANUFACTURING_PARAMS.backVoid + MANUFACTURING_PARAMS.backThickness  // Groove: offset + thickness
    : MANUFACTURING_PARAMS.backThickness;  // Overlay: just thickness
  
  // 3. ANTI-COLLISION: Calculate internal depth
  const depthInternal = D - backObstruction - MANUFACTURING_PARAMS.safetyGap;
  
  // Helper to compute panel manufacturing data
  const computePanel = (finishW: number, finishH: number, edgeTop: number, edgeBottom: number, edgeLeft: number, edgeRight: number) => {
    // 4. FINISH TO CUT transformation
    const cutW = calculateCutSize(finishW, edgeLeft, edgeRight, MANUFACTURING_PARAMS.preMilling);
    const cutH = calculateCutSize(finishH, edgeTop, edgeBottom, MANUFACTURING_PARAMS.preMilling);
    const area = (finishW * finishH) / 1000000; // m² (single face)
    const edgeLen = ((edgeTop > 0 ? finishW : 0) + (edgeBottom > 0 ? finishW : 0) +
                     (edgeLeft > 0 ? finishH : 0) + (edgeRight > 0 ? finishH : 0)) / 1000; // meters

    const cost = (area * core.costPerSqm) + (area * 2 * surface.costPerSqm) + (edgeLen * edge.costPerMeter);
    const co2 = (area * core.co2PerSqm) + (area * 2 * surface.co2PerSqm);

    return {
      realThickness: T_real,
      cutWidth: cutW,
      cutHeight: cutH,
      surfaceArea: area * 2, // Total surface area (both faces)
      edgeLength: edgeLen,
      cost,
      co2,
    };
  };
  
  // Helper to create edge assignment
  // Default: ALL 4 edges get default edge material
  // This ensures Apply Material with "All Panels" applies to ALL sides
  const makeEdges = (front = true, back = true, left = true, right = true) => ({
    top: front ? defaultEdgeId : null,    // "top" in edge config = front edge of panel
    bottom: back ? defaultEdgeId : null,  // "bottom" = back edge
    left: left ? defaultEdgeId : null,    // "left" = left/top edge
    right: right ? defaultEdgeId : null,  // "right" = right/bottom edge
  });

  // Cabinet body height - Toe Kick is ONLY a floor offset, NOT a height reduction
  // H = full cabinet body height, Leg = vertical offset from floor
  // Panel dimensions use H, panel positions offset by Leg
  const bodyH = H;

  // ========== LEFT SIDE & RIGHT SIDE ==========
  // Joint type determines construction:
  // - OVERLAY: Top/Bottom sit ON TOP of sides → Side is SHORTER
  // - INSET: Top/Bottom fit BETWEEN sides → Side is FULL HEIGHT

  // FINISH dimensions = visible panel size AFTER edge banding
  // Edge banding ADDS to the panel edge, it doesn't reduce the panel size
  // CUT dimensions (computed in computePanel) account for edge banding

  // Back panel thickness (needed for depth calculation when OVERLAY)
  // TRUTH MODULE: Use calcPanelTotalThickness for consistent thickness calculation
  const backCoreId = 'core-mdf-6'; // Default back panel core
  const backPanelForCalc = {
    coreMaterialId: backCoreId,
    faces: { faceA: defaultSurfaceId, faceB: defaultSurfaceId } // 2-side finish
  };
  const backTotalT = calcPanelTotalThickness(backPanelForCalc, defaultSurfaceId);

  // Depth reduction when back panel is OVERLAY
  // TRUTH MODULE: Use calcBackDepthReduction for consistent depth reduction
  const backDepthReduction = calcBackDepthReduction(structure, backPanelForCalc, defaultSurfaceId);

  // Width (depth direction): cabinet depth minus back panel if overlay
  const sideW = D - backDepthReduction;

  // Height calculation:
  // OVERLAY = Top/Bottom นั่งบนแผงข้าง → แผงข้างต้องสั้นลง (หัก T ของ Top/Bottom)
  // INSET = Top/Bottom เข้าไประหว่างแผงข้าง → แผงข้างสูงเต็ม

  // Calculate reductions for OVERLAY joints
  const topReduction = structure.topJoint === 'OVERLAY' ? T : 0;      // หักความหนา Top Panel
  const bottomReduction = structure.bottomJoint === 'OVERLAY' ? T : 0; // หักความหนา Bottom Panel

  // Side panel has edge at top/bottom only when it extends to that edge (INSET case)
  // For OVERLAY, the Top/Bottom covers the edge, so side has no edge there
  const hasTopEdge = structure.topJoint === 'INSET';     // INSET = side extends to top = needs edge
  const hasBottomEdge = structure.bottomJoint === 'INSET'; // INSET = side extends to bottom = needs edge

  // Calculate side height (FINISH dimension - before edge banding)
  // Only reduce for OVERLAY joints where Top/Bottom panels take up space
  const sideH = bodyH - topReduction - bottomReduction;
  
  // Edge thicknesses for cut calculation
  const sideEdgeTop = hasTopEdge ? ET : 0;
  const sideEdgeBottom = hasBottomEdge ? ET : 0;

  // Back edge logic depends on back panel construction AND joint types:
  // When INSET (groove): back edges hidden → no edge banding for any panel
  // When OVERLAY:
  //   - Side panels: always need back edge (back edge visible from inside cabinet)
  //   - Top panel: needs back edge only if Top Joint is OVERLAY (extends beyond sides)
  //   - Bottom panel: needs back edge only if Bottom Joint is OVERLAY (extends beyond sides)
  const isOverlayBack = structure.backPanelConstruction === 'overlay';
  const sideHasBackEdge = isOverlayBack;
  const topHasBackEdge = isOverlayBack && structure.topJoint === 'OVERLAY';
  const bottomHasBackEdge = isOverlayBack && structure.bottomJoint === 'OVERLAY';
  const sideBackEdgeT = sideHasBackEdge ? ET : 0;
  const topBackEdgeT = topHasBackEdge ? ET : 0;
  const bottomBackEdgeT = bottomHasBackEdge ? ET : 0;
  
  // Y position: center of side panel
  // For OVERLAY: side starts above bottom panel, ends below top panel
  const sideYOffset = (bottomReduction - topReduction) / 2;
  const sideY = bodyH/2 + Leg + sideYOffset;

  // Z position: shift forward when back panel is OVERLAY (to not overlap with back panel)
  // CRITICAL: Use only backDepthReduction, NOT ET (edge thickness is irrelevant to Z transform)
  // carcassZ = backTotalT/2 when overlay, else 0
  const carcassZ = backDepthReduction / 2;

  // Side panel edges: Front, Back, Top (if INSET), Bottom (if INSET)
  // computePanel params: (finishW, finishH, edgeTop, edgeBottom, edgeLeft, edgeRight)
  // - cutW uses edgeLeft (front) and edgeRight (back)
  // - cutH uses edgeTop (top of panel) and edgeBottom (bottom of panel)
  panels.push({
    id: createId(),
    role: 'LEFT_SIDE',
    name: 'Left Side',
    finishWidth: sideW,
    finishHeight: sideH,
    coreMaterialId: defaultCoreId,
    faces: { faceA: defaultSurfaceId, faceB: null },
    edges: makeEdges(true, sideHasBackEdge, hasTopEdge, hasBottomEdge), // front, back, top, bottom
    grainDirection: 'VERTICAL',
    computed: computePanel(sideW, sideH, sideEdgeTop, sideEdgeBottom, ET, sideBackEdgeT),
    position: [-W/2 + T/2, sideY, carcassZ],
    rotation: [0, 0, 0],
    visible: true,
    selected: false,
  });

  // ========== RIGHT SIDE ==========
  panels.push({
    id: createId(),
    role: 'RIGHT_SIDE',
    name: 'Right Side',
    finishWidth: sideW,
    finishHeight: sideH,
    coreMaterialId: defaultCoreId,
    faces: { faceA: defaultSurfaceId, faceB: null },
    edges: makeEdges(true, sideHasBackEdge, hasTopEdge, hasBottomEdge), // front, back, top, bottom
    grainDirection: 'VERTICAL',
    computed: computePanel(sideW, sideH, sideEdgeTop, sideEdgeBottom, ET, sideBackEdgeT),
    position: [W/2 - T/2, sideY, carcassZ],
    rotation: [0, 0, 0],
    visible: true,
    selected: false,
  });

  // ========== TOP PANEL ==========
  // For INSET joint: fits between sides
  // Edges: Front only
  const topBaseW = structure.topJoint === 'INSET' ? W - (2 * T) : W;
  const topW = topBaseW;      // No side edges on horizontal panels
  const topH = D - backDepthReduction; // Cabinet depth minus back panel if overlay
  
  // Top Y position:
  // INSET: Top fits between sides, center at bodyH - T/2
  // OVERLAY: Top sits ON TOP of sides, center at bodyH - topReduction + T/2
  //          (sides end at bodyH - topReduction, top sits on that)
  const topY = structure.topJoint === 'INSET' 
    ? bodyH - T/2 + Leg                           // INSET: between sides
    : bodyH - topReduction + T/2 + Leg;           // OVERLAY: on top of sides
  
  // Top panel edges: Front, Back, Left, Right
  // computePanel params: (finishW, finishH, edgeTop, edgeBottom, edgeLeft, edgeRight)
  // - cutW (width direction) uses edgeLeft, edgeRight
  // - cutH (depth direction) uses edgeTop (front), edgeBottom (back)
  // Back edge only when backPanelConstruction is 'overlay'
  panels.push({
    id: createId(),
    role: 'TOP',
    name: 'Top Panel',
    finishWidth: topW,
    finishHeight: topH,
    coreMaterialId: defaultCoreId,
    faces: { faceA: defaultSurfaceId, faceB: null },
    edges: makeEdges(true, topHasBackEdge, true, true), // front, back, left, right
    grainDirection: 'HORIZONTAL',
    computed: computePanel(topW, topH, ET, topBackEdgeT, ET, ET),
    position: [0, topY, carcassZ],  // Same Z offset as side panels
    rotation: [0, 0, 0],
    visible: true,
    selected: false,
  });

  // ========== BOTTOM PANEL ==========
  const bottomBaseW = structure.bottomJoint === 'INSET' ? W - (2 * T) : W;
  const bottomW = bottomBaseW;
  const bottomH = D - backDepthReduction; // Cabinet depth minus back panel if overlay

  // Bottom Y position:
  // INSET: Bottom fits between sides, center at T/2
  // OVERLAY: Bottom sits under sides, center at bottomReduction - T/2
  //          (sides start at bottomReduction, bottom sits below that)
  const bottomY = structure.bottomJoint === 'INSET'
    ? T/2 + Leg                                   // INSET: between sides
    : bottomReduction - T/2 + Leg;                // OVERLAY: under sides

  // Bottom panel edges: Front, Back, Left, Right
  // Back edge only when backPanelConstruction is 'overlay'
  panels.push({
    id: createId(),
    role: 'BOTTOM',
    name: 'Bottom Panel',
    finishWidth: bottomW,
    finishHeight: bottomH,
    coreMaterialId: defaultCoreId,
    faces: { faceA: defaultSurfaceId, faceB: null },
    edges: makeEdges(true, bottomHasBackEdge, true, true), // front, back, left, right
    grainDirection: 'HORIZONTAL',
    computed: computePanel(bottomW, bottomH, ET, bottomBackEdgeT, ET, ET),
    position: [0, bottomY, carcassZ],  // Same Z offset as side panels
    rotation: [0, 0, 0],
    visible: true,
    selected: false,
  });

  // ========== BACK PANEL ==========
  if (structure.hasBackPanel) {
    // backTotalT calculated above using Truth Module
    const groove = MANUFACTURING_PARAMS.grooveDepth;
    const clearance = MANUFACTURING_PARAMS.clearance;

    // Calculate back panel dimensions based on construction type
    let backW: number;
    let backH: number;
    let backZ: number;

    if (structure.backPanelConstruction === 'overlay') {
      // OVERLAY: Back panel sits at the back, INSIDE the OD budget
      // Width = full cabinet width (covers side panel back edges)
      // Height = full body height (covers top/bottom panel back edges)
      backW = W;
      backH = bodyH;
      // Position: back panel center is at back of OD, shifted forward by half its total thickness
      // Formula: -D/2 + backTotalT/2 (inside OD budget, not outside)
      // This ensures back panel's back face aligns with cabinet OD back face
      backZ = -D/2 + backTotalT/2;
    } else {
      // INSET (default): Back panel fits into grooves
      backW = (W - 2*T) + (2*groove) - clearance;
      backH = (bodyH - 2*T) + (2*groove) - clearance;
      // Position: recessed into grooves
      backZ = -D/2 + structure.backPanelInset;
    }

    panels.push({
      id: createId(),
      role: 'BACK',
      name: 'Back Panel',
      finishWidth: backW,
      finishHeight: backH,
      coreMaterialId: 'core-mdf-6',
      faces: { faceA: defaultSurfaceId, faceB: defaultSurfaceId }, // 2-side finish
      edges: { top: null, bottom: null, left: null, right: null },
      grainDirection: 'HORIZONTAL',
      computed: {
        realThickness: backTotalT, // Total finished thickness (from Truth Module)
        cutWidth: backW,
        cutHeight: backH,
        surfaceArea: (backW * backH) / 1000000 * 2, // Total surface area (both faces)
        edgeLength: 0,
        cost: (backW * backH / 1000000) * (CORE_MATERIALS[backCoreId]?.costPerSqm ?? 0),
        co2: (backW * backH / 1000000) * (CORE_MATERIALS[backCoreId]?.co2PerSqm ?? 0),
      },
      position: [0, bodyH/2 + Leg, backZ],
      rotation: [0, 0, 0],
      visible: true,
      selected: false,
    });
  }
  
  // ========== SHELVES ==========
  // When dividers exist, shelves are split into segments (Shelf 1a, 1b, 1c, etc.)
  // Each segment can be configured independently
  const usableHeight = bodyH - (2 * T);
  const shelfSpacing = usableHeight / (structure.shelfCount + 1);

  // Calculate shelf segments based on dividers
  const segmentCount = structure.dividerCount + 1; // Number of horizontal segments
  const dividerThickness = T; // Divider panel thickness
  // Main shelves should span between side panels without side clearance.
  const internalWidth = W - (2 * T);

  // Calculate segment positions (X coordinates of dividers)
  // IMPORTANT: Use actual custom positions from existingOverrides if available
  // This ensures shelves resize correctly when dividers are moved
  const dividerPositions: number[] = [];
  if (structure.dividerCount > 0) {
    const dividerSpacingX = (W - 2*T) / (structure.dividerCount + 1);
    for (let d = 0; d < structure.dividerCount; d++) {
      // Check if this divider has a custom X position
      const existingDividerData = existingOverrides?.get(`DIVIDER-${d}`);
      const hasCustomPosition = existingDividerData?.useCustomPosition && existingDividerData?.xPosition !== undefined;

      if (hasCustomPosition && existingDividerData.xPosition !== undefined) {
        // Use the actual custom X position
        dividerPositions.push(existingDividerData.xPosition);
      } else {
        // Use auto-calculated position
        dividerPositions.push(-W/2 + T + dividerSpacingX * (d + 1));
      }
    }
  }

  // Generate segment labels (a, b, c, d, ...)
  const getSegmentLabel = (segIndex: number): string => {
    return String.fromCharCode(97 + segIndex); // 97 = 'a'
  };

  for (let i = 0; i < structure.shelfCount; i++) {
    // For each shelf row, create segments based on dividers
    for (let seg = 0; seg < segmentCount; seg++) {
      // Unique key for this shelf segment
      const segmentKey = `SHELF-${i}-${seg}`;

      // Get existing overrides for this shelf segment
      const existingData = existingOverrides?.get(segmentKey);
      const overrides = existingData?.overrides;
      const useCustomPosition = existingData?.useCustomPosition || false;

      // Use custom setbacks if defined, otherwise use defaults
      const frontSetback = overrides?.frontSetback ?? MANUFACTURING_PARAMS.shelfSetbackFront;
      const backSetback = overrides?.backSetback ?? MANUFACTURING_PARAMS.shelfSetbackBack;

      // Calculate shelf depth based on setbacks (round to 1 decimal)
      const shelfD = Math.round((depthInternal - frontSetback - backSetback) * 10) / 10;

      // Calculate segment width
      let segmentWidth: number;
      let segmentX: number;

      if (segmentCount === 1) {
        // No dividers - full width shelf
        segmentWidth = Math.round(internalWidth * 10) / 10; // Round to 1 decimal
        segmentX = 0;
      } else {
        // Calculate segment boundaries
        const leftBoundary = seg === 0
          ? -W/2 + T
          : dividerPositions[seg - 1] + dividerThickness/2;

        const rightBoundary = seg === segmentCount - 1
          ? W/2 - T
          : dividerPositions[seg] - dividerThickness/2;

        segmentWidth = Math.round((rightBoundary - leftBoundary) * 10) / 10; // Round to 1 decimal
        segmentX = (leftBoundary + rightBoundary) / 2;
      }

      // Calculate Y position
      let shelfY: number;
      if (useCustomPosition && overrides?.gapFromBelow !== null && overrides?.gapFromBelow !== undefined) {
        shelfY = Leg + T + overrides.gapFromBelow + T/2;
      } else {
        shelfY = Leg + T + shelfSpacing * (i + 1);
      }

      // Shelf Z position: centered based on front setback
      const shelfZ = (D/2 - frontSetback - ET/2) - (shelfD/2);

      // Generate name: "Main Shelf 1" if no dividers, "Main Shelf 1a", "Main Shelf 1b" if dividers exist
      const shelfName = segmentCount === 1
        ? `Main Shelf ${i + 1}`
        : `Main Shelf ${i + 1}${getSegmentLabel(seg)}`;

      panels.push({
        id: createId(),
        role: 'SHELF',
        name: shelfName,
        finishWidth: segmentWidth,
        finishHeight: shelfD,
        coreMaterialId: defaultCoreId,
        faces: { faceA: defaultSurfaceId, faceB: null },
        edges: makeEdges(), // Only front edge
        grainDirection: 'HORIZONTAL',
        computed: computePanel(segmentWidth, shelfD, ET, 0, 0, 0),
        position: [segmentX, shelfY, shelfZ],
        rotation: [0, 0, 0],
        visible: true,
        selected: false,
        positionOverrides: overrides,
        useCustomPosition: useCustomPosition,
      });
    }
  }

  // ========== DIVIDERS ==========
  // Divider Depth = depthInternal (no front setback for dividers)
  // Only front edge
  if (structure.dividerCount > 0) {
    const dividerSpacing = (W - 2*T) / (structure.dividerCount + 1);
    const dividerH = usableHeight;

    for (let i = 0; i < structure.dividerCount; i++) {
      // Get existing overrides for this divider
      const existingData = existingOverrides?.get(`DIVIDER-${i}`);
      const overrides = existingData?.overrides;
      const useCustomPosition = existingData?.useCustomPosition || false;

      // Use custom setbacks if defined, otherwise use defaults
      const frontSetback = overrides?.frontSetback ?? 0; // Dividers default to no front setback
      const backSetback = overrides?.backSetback ?? 0;

      // Calculate divider depth based on setbacks
      const dividerD = depthInternal - frontSetback - backSetback - ET;

      // Use custom X position if defined, otherwise calculate auto position
      const autoX = -W/2 + T + dividerSpacing * (i + 1);
      const dividerX = (useCustomPosition && existingData?.xPosition !== undefined)
        ? existingData.xPosition
        : autoX;
      // Divider Z: starts from front with edge, extends back
      const dividerZ = (D/2 - frontSetback - ET/2) - (dividerD/2);

      panels.push({
        id: createId(),
        role: 'DIVIDER',
        name: `Main Divider ${i + 1}`,
        finishWidth: dividerD,
        finishHeight: dividerH,
        coreMaterialId: defaultCoreId,
        faces: { faceA: defaultSurfaceId, faceB: null },
        edges: makeEdges(), // Only front edge
        grainDirection: 'VERTICAL',
        computed: computePanel(dividerD, dividerH, ET, 0, 0, 0),
        position: [dividerX, bodyH/2 + Leg, dividerZ],
        rotation: [0, 0, 0],
        visible: true,
        selected: false,
        positionOverrides: overrides,
        useCustomPosition: useCustomPosition,
      });
    }
  }

  return panels;
}

/**
 * Calculate cabinet totals from panels
 */
/**
 * T017: Single-pass aggregation (was 5 separate reduce calls)
 * Reduces iterations from 5N to N for panel totals calculation
 */
function calculateTotals(panels: CabinetPanel[]) {
  let totalCost = 0;
  let totalCO2 = 0;
  let totalSurfaceArea = 0;
  let totalEdgeLength = 0;
  for (let i = 0; i < panels.length; i++) {
    const c = panels[i].computed;
    totalCost += c.cost;
    totalCO2 += c.co2;
    totalSurfaceArea += c.surfaceArea;
    totalEdgeLength += c.edgeLength;
  }
  return { totalCost, totalCO2, panelCount: panels.length, totalSurfaceArea, totalEdgeLength };
}

// ============================================
// STORE DEFINITION
// ============================================

// Manufacturing parameters type (user-configurable per machine)
interface ManufacturingParams {
  preMilling: number;        // 0.5 - 1.0 mm per side
  glueThickness: number;     // 0.1 - 0.2 mm
  clearance: number;         // 1 - 2 mm
  grooveDepth: number;       // 8 - 10 mm
  backVoid: number;          // 19 - 20 mm
  backThickness: number;     // 6 or 9 mm
  safetyGap: number;         // 1 - 2 mm
}

interface CabinetState {
  cabinet: Cabinet | null;           // Active cabinet (for editing)
  cabinets: Cabinet[];               // All cabinets in scene
  activeCabinetId: string | null;    // ID of active cabinet
  selectedPanelId: string | null;

  // Construction type (Face Frame vs Frameless)
  constructionType: ConstructionType;

  // Materials library (temporary)
  coreMaterials: typeof CORE_MATERIALS;
  surfaceMaterials: typeof SURFACE_MATERIALS;
  edgeMaterials: typeof EDGE_MATERIALS;

  // Manufacturing parameters (user-configurable)
  manufacturingParams: ManufacturingParams;

  // Drilling parameters (editable from X-Ray mode labels)
  drillingParams: {
    firstHoleZ: number;         // System 32 first hole distance (default: 37mm)
    drillingDistanceB: number;  // Häfele Drilling Distance B (default: 24mm per CAD spec)
  };

  // Cabinet visibility (Plasticity-style H/Shift+H/Alt+H)
  // Using array instead of Set because Immer doesn't support Set without enableMapSet()
  hiddenCabinetIds: string[];
}

interface CabinetActions {
  // Cabinet CRUD
  createCabinet: (type?: CabinetType, name?: string) => void;

  // Multi-cabinet actions
  addCabinet: (type: CabinetType, name: string, dimensions?: Partial<CabinetDimensions>, position?: [number, number, number]) => Cabinet;
  removeCabinet: (cabinetId: string) => void;
  selectCabinet: (cabinetId: string | null) => void;
  duplicateCabinet: (cabinetId: string) => Cabinet | null;
  updateCabinetPosition: (cabinetId: string, position: [number, number, number]) => void;
  updateCabinetRotation: (cabinetId: string, rotation: [number, number, number]) => void;
  rotateCabinet90: (cabinetId: string, direction: 'cw' | 'ccw') => void;
  mirrorCabinet: (cabinetId: string, axis: 'x' | 'z') => Cabinet | null;
  resetScenePositions: () => void;

  // Cabinet visibility actions (Plasticity-style)
  hideCabinet: (cabinetId: string) => void;
  showCabinet: (cabinetId: string) => void;
  showAllCabinets: () => void;
  hideUnselectedCabinets: (exceptId: string) => void;
  toggleCabinetVisibility: (cabinetId: string) => void;

  // Panel visibility actions
  setPanelVisible: (panelId: string, visible: boolean) => void;
  togglePanelVisibility: (panelId: string) => void;
  showAllPanels: () => void;
  hideUnselectedPanels: (exceptPanelId: string) => void;

  // Dimension actions
  setDimension: (key: keyof CabinetDimensions, value: number) => void;

  // Drilling parameter actions (for X-Ray mode editable labels)
  setDrillingParam: (param: 'firstHoleZ' | 'drillingDistanceB', value: number) => void;

  // Structure actions
  setJointType: (position: 'top' | 'bottom', type: JointType) => void;
  setShelfCount: (count: number) => void;
  setDividerCount: (count: number) => void;
  toggleBackPanel: () => void;
  setBackPanelConstruction: (type: 'inset' | 'overlay') => void;
  
  // Material actions
  setDefaultCore: (materialId: string) => void;
  setDefaultSurface: (materialId: string) => void;
  setDefaultEdge: (materialId: string) => void;
  
  // Material CRUD - Core
  addCoreMaterial: (material: any) => void;
  updateCoreMaterial: (id: string, updates: any) => void;
  deleteCoreMaterial: (id: string) => void;
  
  // Material CRUD - Surface
  addSurfaceMaterial: (material: any) => void;
  updateSurfaceMaterial: (id: string, updates: any) => void;
  deleteSurfaceMaterial: (id: string) => void;
  
  // Material CRUD - Edge
  addEdgeMaterial: (material: any) => void;
  updateEdgeMaterial: (id: string, updates: any) => void;
  deleteEdgeMaterial: (id: string) => void;
  
  // Panel selection
  selectPanel: (panelId: string | null) => void;

  // Panel removal (for sub-shelves/dividers)
  removePanel: (panelId: string) => void;
  
  // Per-panel material actions
  updatePanelMaterial: (panelId: string, target: 'core' | 'faceA' | 'faceB', materialId: string) => void;
  updatePanelEdge: (panelId: string, side: 'top' | 'bottom' | 'left' | 'right', edgeId: string | null) => void;

  // Per-panel position actions
  updatePanelPositionOverride: (panelId: string, field: keyof PanelPositionOverrides, value: number | null) => void;
  resetPanelPosition: (panelId: string) => void;

  // Divider position action
  moveDivider: (dividerIndex: number, newXPosition: number) => void;
  movePartialDividerById: (panelId: string, newXPosition: number) => void;

  // Compartment actions - add shelf/divider within a specific compartment
  addShelfInCompartment: (col: number, row: number, bounds?: { leftX: number; rightX: number; bottomY: number; topY: number; centerY?: number }) => void;
  addDividerInCompartment: (col: number, row: number, bounds?: { leftX: number; rightX: number; bottomY: number; topY: number; centerX?: number }) => void;

  // Manufacturing parameters actions
  setManufacturingParam: <K extends keyof ManufacturingParams>(key: K, value: ManufacturingParams[K]) => void;
  resetManufacturingParams: () => void;

  // Construction type
  setConstructionType: (type: ConstructionType) => void;

  // Hardware configuration
  updateHardware: (cabinetId: string, hardware: Partial<CabinetHardware>) => void;
  setMinifixPreset: (cabinetId: string, presetId: string | undefined) => void;
  setHingePreset: (cabinetId: string, presetId: string | undefined) => void;

  // Hardware point overrides (per-connector rotation/position)
  setHardwarePointOverride: (
    cabinetId: string,
    pointId: string,
    override: { rotation?: { rotX: number; rotY: number; rotZ: number }; position?: { dx: number; dy: number; dz: number } }
  ) => void;
  clearHardwarePointOverride: (cabinetId: string, pointId: string) => void;
  getHardwarePointOverrides: (cabinetId: string) => Record<string, { rotation?: { rotX: number; rotY: number; rotZ: number }; position?: { dx: number; dy: number; dz: number } }>;

  // Drawer configuration
  enableDrawers: (slideType?: DrawerSlideType) => void;
  disableDrawers: () => void;
  addDrawerRow: (config?: Partial<DrawerRowConfig>) => void;
  removeDrawerRow: (rowIndex: number) => void;
  updateDrawerRow: (rowIndex: number, updates: Partial<DrawerRowConfig>) => void;

  // Door configuration
  enableDoors: (doorCount?: 1 | 2) => void;
  disableDoors: () => void;
  setDoorCount: (count: 1 | 2) => void;
  updateDoorConfig: (updates: Partial<Omit<DoorConfig, 'doors'>>) => void;
  updateDoorPanel: (doorIndex: number, updates: Partial<DoorPanelConfig>) => void;

  // Recalculation
  recalculate: () => void;
}

type CabinetStore = CabinetState & CabinetActions;

export const useCabinetStore = create<CabinetStore>()(
  immer((set, get) => ({
    // Initial state
    cabinet: null,
    cabinets: [],                    // Multi-cabinet array
    activeCabinetId: null,           // Currently selected cabinet
    selectedPanelId: null,
    constructionType: 'FRAMELESS' as ConstructionType,  // Default to European 32mm system
    coreMaterials: CORE_MATERIALS,
    surfaceMaterials: SURFACE_MATERIALS,
    edgeMaterials: EDGE_MATERIALS,

    // Manufacturing parameters with defaults from MANUFACTURING_PARAMS
    manufacturingParams: {
      preMilling: MANUFACTURING_PARAMS.preMilling,           // 0.5 mm per side
      glueThickness: MANUFACTURING_PARAMS.glueThickness,    // 0.1 mm
      clearance: MANUFACTURING_PARAMS.clearance,            // 2 mm
      grooveDepth: MANUFACTURING_PARAMS.grooveDepth,        // 8 mm
      backVoid: MANUFACTURING_PARAMS.backVoid,              // 20 mm
      backThickness: MANUFACTURING_PARAMS.backThickness,    // 6 mm
      safetyGap: MANUFACTURING_PARAMS.safetyGap,            // 2 mm
    },

    // Drilling parameters (editable from X-Ray mode labels)
    drillingParams: {
      firstHoleZ: 37,          // System 32 first hole (37mm from front edge)
      drillingDistanceB: 24,   // Häfele Drilling Distance B (24mm per CAD spec)
    },

    // Cabinet visibility state (Plasticity-style H/Shift+H/Alt+H)
    hiddenCabinetIds: [],

    // ========== CABINET CRUD ==========
    createCabinet: (type = 'BASE', name = 'Base Cabinet') => {
      const defaultCoreId = 'core-hmr-18';
      const defaultSurfaceId = 'surf-hpl-grey-oak';
      const defaultEdgeId = 'edge-pvc-grey-10';
      
      const panels = generatePanels(
        DEFAULT_DIMENSIONS,
        DEFAULT_STRUCTURE,
        defaultCoreId,
        defaultSurfaceId,
        defaultEdgeId
      );
      
      // Get wood thickness from core material for auto-applying Minifix config
      const coreMaterial = CORE_MATERIALS[defaultCoreId as keyof typeof CORE_MATERIALS];
      const woodThickness = coreMaterial?.thickness || 18;
      const minifixConfig = getMinifixFullConfigForThickness(woodThickness);

      const cabinet: Cabinet & { scenePosition: [number, number, number]; sceneRotation: [number, number, number] } = {
        id: createId(),
        name,
        type,
        dimensions: { ...DEFAULT_DIMENSIONS },
        structure: { ...DEFAULT_STRUCTURE },
        materials: {
          defaultCore: defaultCoreId,
          defaultSurface: defaultSurfaceId,
          defaultEdge: defaultEdgeId,
          overrides: new Map(),
        },
        manufacturing: { ...DEFAULT_MANUFACTURING },
        panels,
        computed: calculateTotals(panels),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        scenePosition: [0, 0, 0],
        sceneRotation: [0, 0, 0],
        // Auto-apply Minifix S200 hardware config based on wood thickness
        hardware: {
          minifixConfig,
          minifixPresetId: `builtin_minifix_${woodThickness}mm`,
        },
      };

      set({ cabinet: cabinet as Cabinet, cabinets: [cabinet as Cabinet], activeCabinetId: cabinet.id });
    },

    // ========== MULTI-CABINET ACTIONS ==========
    addCabinet: (type, name, dimensions, position = [0, 0, 0]) => {
      const defaultCoreId = 'core-hmr-18';
      const defaultSurfaceId = 'surf-hpl-grey-oak';
      const defaultEdgeId = 'edge-pvc-grey-10';

      // Get cabinet type standards from imported CABINET_TYPES
      const typeConfig = CABINET_TYPES[type] || CABINET_TYPES['BASE_STANDARD'];

      const cabinetDimensions: CabinetDimensions = {
        width: dimensions?.width ?? typeConfig?.standards?.width?.default ?? DEFAULT_DIMENSIONS.width,
        height: dimensions?.height ?? typeConfig?.standards?.height?.default ?? DEFAULT_DIMENSIONS.height,
        depth: dimensions?.depth ?? typeConfig?.standards?.depth?.default ?? DEFAULT_DIMENSIONS.depth,
        toeKickHeight: dimensions?.toeKickHeight ?? (typeConfig?.toeKickHeight ?? DEFAULT_DIMENSIONS.toeKickHeight),
      };

      const structure: CabinetStructure = {
        ...DEFAULT_STRUCTURE,
        shelfCount: typeConfig?.defaultShelfCount ?? DEFAULT_STRUCTURE.shelfCount,
        topJoint: typeConfig?.defaultTopJoint ?? DEFAULT_STRUCTURE.topJoint,
        bottomJoint: typeConfig?.defaultBottomJoint ?? DEFAULT_STRUCTURE.bottomJoint,
        hasBackPanel: typeConfig?.hasBack ?? DEFAULT_STRUCTURE.hasBackPanel,
      };

      const panels = generatePanels(
        cabinetDimensions,
        structure,
        defaultCoreId,
        defaultSurfaceId,
        defaultEdgeId
      );

      // Get wood thickness from core material for auto-applying Minifix config
      const coreMaterial = CORE_MATERIALS[defaultCoreId as keyof typeof CORE_MATERIALS];
      const woodThickness = coreMaterial?.thickness || 18;
      const minifixConfig = getMinifixFullConfigForThickness(woodThickness);

      const newCabinet: Cabinet & { scenePosition: [number, number, number]; sceneRotation: [number, number, number] } = {
        id: createId(),
        name,
        type: (type.includes('BASE') ? 'BASE' : type.includes('WALL') ? 'WALL' : type.includes('TALL') ? 'TALL' : type.includes('CORNER') ? 'CORNER' : 'BASE') as CabinetType,
        dimensions: cabinetDimensions,
        structure,
        materials: {
          defaultCore: defaultCoreId,
          defaultSurface: defaultSurfaceId,
          defaultEdge: defaultEdgeId,
          overrides: new Map(),
        },
        manufacturing: { ...DEFAULT_MANUFACTURING },
        panels,
        computed: calculateTotals(panels),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        scenePosition: position,
        sceneRotation: [0, 0, 0],
        // Auto-apply Minifix S200 hardware config based on wood thickness
        hardware: {
          minifixConfig,
          minifixPresetId: `builtin_minifix_${woodThickness}mm`,
        },
      };

      set((state) => {
        state.cabinets.push(newCabinet as Cabinet);
        state.cabinet = newCabinet as Cabinet;
        state.activeCabinetId = newCabinet.id;
      });

      return newCabinet as Cabinet;
    },

    removeCabinet: (cabinetId) => {
      set((state) => {
        const index = state.cabinets.findIndex(c => c.id === cabinetId);
        if (index !== -1) {
          state.cabinets.splice(index, 1);
        }
        // If removed active cabinet, select another or null
        if (state.activeCabinetId === cabinetId) {
          if (state.cabinets.length > 0) {
            state.activeCabinetId = state.cabinets[0].id;
            state.cabinet = state.cabinets[0];
          } else {
            state.activeCabinetId = null;
            state.cabinet = null;
          }
        }
      });
    },

    selectCabinet: (cabinetId) => {
      set((state) => {
        if (cabinetId === null) {
          state.activeCabinetId = null;
          state.cabinet = null;
          return;
        }
        const cabinet = state.cabinets.find(c => c.id === cabinetId);
        if (cabinet) {
          state.activeCabinetId = cabinetId;
          state.cabinet = cabinet;
        }
      });
    },

    duplicateCabinet: (cabinetId) => {
      const state = get();
      const source = state.cabinets.find(c => c.id === cabinetId);
      if (!source) return null;

      // Get source position and offset the duplicate
      let sourcePos = (source as any).scenePosition || [0, 0, 0];
      const sourceRot = (source as any).sceneRotation || [0, 0, 0];
      const offsetX = source.dimensions.width + 100; // Offset by cabinet width + 100mm gap

      // SANITY CHECK: Source position should never exceed 10 meters (10000mm)
      const MAX_POSITION = 10000;
      const sourceCorrupted = Math.abs(sourcePos[0]) > MAX_POSITION || Math.abs(sourcePos[2]) > MAX_POSITION;
      if (sourceCorrupted) {
        console.warn('[Cabinet] Source position corrupted, resetting to origin:', sourcePos);
        sourcePos = [0, 0, 0];
        // Also fix the source cabinet's position in the store
        set((state) => {
          const srcCabinet = state.cabinets.find(c => c.id === cabinetId) as any;
          if (srcCabinet) {
            srcCabinet.scenePosition = [0, 0, 0];
          }
        });
      }

      // Deep clone the cabinet
      const newCabinet: Cabinet = {
        ...source,
        id: createId(),
        name: `${source.name} (Copy)`,
        panels: source.panels.map(p => ({ ...p, id: createId() })),
        materials: {
          ...source.materials,
          overrides: new Map(source.materials.overrides),
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Set scene position for the new cabinet (offset from source)
      (newCabinet as any).scenePosition = [sourcePos[0] + offsetX, sourcePos[1], sourcePos[2]];
      (newCabinet as any).sceneRotation = [...sourceRot];

      set((state) => {
        state.cabinets.push(newCabinet);
        state.cabinet = newCabinet;
        state.activeCabinetId = newCabinet.id;
      });

      return newCabinet;
    },

    updateCabinetPosition: (cabinetId, position) => {
      // SANITY CHECK: Position should never exceed 10 meters (10000mm)
      const MAX_POSITION = 10000;
      if (Math.abs(position[0]) > MAX_POSITION || Math.abs(position[1]) > MAX_POSITION || Math.abs(position[2]) > MAX_POSITION) {
        return; // Don't update with invalid position
      }

      set((state) => {
        const cabinet = state.cabinets.find(c => c.id === cabinetId) as any;
        if (cabinet) {
          cabinet.scenePosition = position;
        }
      });
    },

    updateCabinetRotation: (cabinetId, rotation) => {
      set((state) => {
        const cabinet = state.cabinets.find(c => c.id === cabinetId) as any;
        if (cabinet) {
          cabinet.sceneRotation = rotation;
        }
      });
    },

    rotateCabinet90: (cabinetId, direction) => {
      set((state) => {
        const cabinet = state.cabinets.find(c => c.id === cabinetId) as any;
        if (cabinet) {
          const currentY = cabinet.sceneRotation?.[1] || 0;
          // CW = clockwise = negative Y rotation, CCW = counter-clockwise = positive
          const delta = direction === 'cw' ? -Math.PI / 2 : Math.PI / 2;
          cabinet.sceneRotation = [0, currentY + delta, 0];
        }
      });
    },

    mirrorCabinet: (cabinetId, axis) => {
      const state = get();
      const source = state.cabinets.find(c => c.id === cabinetId);
      if (!source) return null;

      // Get source position
      const sourcePos = (source as any).scenePosition || [0, 0, 0];
      const sourceRot = (source as any).sceneRotation || [0, 0, 0];

      // Deep clone the cabinet
      const newCabinet: Cabinet = {
        ...source,
        id: createId(),
        name: `${source.name} (Mirror)`,
        panels: source.panels.map(p => ({ ...p, id: createId() })),
        materials: {
          ...source.materials,
          overrides: new Map(source.materials.overrides),
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Mirror position and rotation
      // For X-axis mirror: flip X position and add 180° Y rotation
      // For Z-axis mirror: flip Z position and add 180° Y rotation
      const offsetAmount = source.dimensions.width + 100;
      let newPos: [number, number, number];
      let newRot: [number, number, number];

      if (axis === 'x') {
        // Mirror across X axis: negate X, rotate 180° around Y
        newPos = [sourcePos[0] - offsetAmount, sourcePos[1], sourcePos[2]];
        newRot = [sourceRot[0], sourceRot[1] + Math.PI, sourceRot[2]];
      } else {
        // Mirror across Z axis: negate Z, rotate 180° around Y
        newPos = [sourcePos[0], sourcePos[1], sourcePos[2] - (source.dimensions.depth + 100)];
        newRot = [sourceRot[0], sourceRot[1] + Math.PI, sourceRot[2]];
      }

      (newCabinet as any).scenePosition = newPos;
      (newCabinet as any).sceneRotation = newRot;

      set((state) => {
        state.cabinets.push(newCabinet);
        state.cabinet = newCabinet;
        state.activeCabinetId = newCabinet.id;
      });

      return newCabinet;
    },

    resetScenePositions: () => {
      set((state) => {
        let xOffset = 0;
        const gap = 100; // 100mm gap between cabinets

        state.cabinets.forEach((cabinet: any) => {
          const newPos: [number, number, number] = [xOffset, 0, 0];
          cabinet.scenePosition = newPos;
          cabinet.sceneRotation = [0, 0, 0];
          xOffset += cabinet.dimensions.width + gap;
        });
      });
    },

    // ========== CABINET VISIBILITY ACTIONS (Plasticity-style) ==========
    hideCabinet: (cabinetId) => {
      set((state) => {
        if (!state.hiddenCabinetIds.includes(cabinetId)) {
          state.hiddenCabinetIds.push(cabinetId);
        }
      });
    },

    showCabinet: (cabinetId) => {
      set((state) => {
        const index = state.hiddenCabinetIds.indexOf(cabinetId);
        if (index !== -1) {
          state.hiddenCabinetIds.splice(index, 1);
        }
      });
    },

    showAllCabinets: () => {
      set((state) => {
        state.hiddenCabinetIds = [];
      });
    },

    hideUnselectedCabinets: (exceptId) => {
      set((state) => {
        state.hiddenCabinetIds = state.cabinets
          .filter((c) => c.id !== exceptId)
          .map((c) => c.id);
      });
    },

    toggleCabinetVisibility: (cabinetId) => {
      const state = get();
      if (state.hiddenCabinetIds.includes(cabinetId)) {
        get().showCabinet(cabinetId);
      } else {
        get().hideCabinet(cabinetId);
      }
    },

    // ========== PANEL VISIBILITY ACTIONS ==========

    setPanelVisible: (panelId, visible) => {
      set((state) => {
        withActiveCabinet(state, (cabinet) => {
          const panel = cabinet.panels.find(p => p.id === panelId);
          if (panel) panel.visible = visible;
        });
      });
    },

    togglePanelVisibility: (panelId) => {
      set((state) => {
        withActiveCabinet(state, (cabinet) => {
          const panel = cabinet.panels.find(p => p.id === panelId);
          if (panel) panel.visible = !panel.visible;
        });
      });
    },

    showAllPanels: () => {
      set((state) => {
        withActiveCabinet(state, (cabinet) => {
          for (const p of cabinet.panels) { p.visible = true; }
        });
      });
    },

    hideUnselectedPanels: (exceptPanelId) => {
      set((state) => {
        withActiveCabinet(state, (cabinet) => {
          for (const p of cabinet.panels) {
            p.visible = p.id === exceptPanelId;
          }
        });
      });
    },

    // ========== DIMENSION ACTIONS ==========
    setDimension: (key, value) => {
      // SPEC-08: Block geometry mutations when not in DRAFT
      if (!guardMutation('setDimension')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          cabinet.dimensions[key] = value;
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });
      get().recalculate();
    },

    // ========== DRILLING PARAM ACTIONS ==========
    setDrillingParam: (param, value) => {
      // SPEC-08: Block geometry mutations when not in DRAFT
      if (!guardMutation('setDrillingParam')) return;

      set((state) => {
        state.drillingParams[param] = value;
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          cabinet.updatedAt = Date.now();
        }, { skipRecompute: true }); // Drill map regenerates via dependency
      });
    },

    // ========== STRUCTURE ACTIONS ==========
    setJointType: (position, type) => {
      // SPEC-08: Block structure mutations when not in DRAFT
      if (!guardMutation('setJointType')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          if (position === 'top') {
            cabinet.structure.topJoint = type;
          } else {
            cabinet.structure.bottomJoint = type;
          }
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });
      get().recalculate();
    },

    setShelfCount: (count) => {
      // SPEC-08: Block structure mutations when not in DRAFT
      if (!guardMutation('setShelfCount')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          cabinet.structure.shelfCount = Math.max(0, Math.min(10, count));
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });
      get().recalculate();
    },

    setDividerCount: (count) => {
      // SPEC-08: Block structure mutations when not in DRAFT
      if (!guardMutation('setDividerCount')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          cabinet.structure.dividerCount = Math.max(0, Math.min(5, count));
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });
      get().recalculate();
    },

    toggleBackPanel: () => {
      // SPEC-08: Block structure mutations when not in DRAFT
      if (!guardMutation('toggleBackPanel')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          cabinet.structure.hasBackPanel = !cabinet.structure.hasBackPanel;
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });
      get().recalculate();
    },

    setBackPanelConstruction: (type) => {
      // SPEC-08: Block structure mutations when not in DRAFT
      if (!guardMutation('setBackPanelConstruction')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          cabinet.structure.backPanelConstruction = type;
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });
      get().recalculate();
    },

    // ========== MATERIAL ACTIONS ==========
    setDefaultCore: (materialId) => {
      // SPEC-08: Block material mutations when not in DRAFT
      if (!guardMutation('setDefaultCore')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          cabinet.materials.defaultCore = materialId;
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });
      get().recalculate();
    },

    setDefaultSurface: (materialId) => {
      // SPEC-08: Block material mutations when not in DRAFT
      if (!guardMutation('setDefaultSurface')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          cabinet.materials.defaultSurface = materialId;
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });
      get().recalculate();
    },

    setDefaultEdge: (materialId) => {
      // SPEC-08: Block material mutations when not in DRAFT
      if (!guardMutation('setDefaultEdge')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          cabinet.materials.defaultEdge = materialId;

          // Force apply edge material to ALL panels (except back panel)
          cabinet.panels.forEach(panel => {
            if (panel.role === 'BACK') return; // Skip back panel

            // Force assign edge material to all sides
            panel.edges = {
              top: materialId,
              bottom: materialId,
              left: materialId,
              right: materialId
            };
          });
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });
      get().recalculate();
    },
    
    // ========== PANEL SELECTION ==========
    selectPanel: (panelId) => {
      set({ selectedPanelId: panelId });
    },

    // ========== PANEL REMOVAL (for sub-shelves/dividers) ==========
    removePanel: (panelId) => {
      // SPEC-08: Block panel removal when not in DRAFT
      if (!guardMutation('removePanel')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          // Find the panel
          const panelIndex = cabinet.panels.findIndex(p => p.id === panelId);
          if (panelIndex === -1) return;

          const panel = cabinet.panels[panelIndex];

          // Only allow removal of Sub Shelf / Sub Divider (custom position panels)
          if (!panel.name.startsWith('Sub')) return;

          // Remove the panel from cabinet
          cabinet.panels.splice(panelIndex, 1);

          // Clear selection if this panel was selected
          if (state.selectedPanelId === panelId) {
            state.selectedPanelId = null;
          }

          // Recalculate totals for cabinet
          cabinet.computed = {
            totalCost: cabinet.panels.reduce((sum, p) => sum + p.computed.cost, 0),
            totalCO2: cabinet.panels.reduce((sum, p) => sum + p.computed.co2, 0),
            panelCount: cabinet.panels.length,
            totalSurfaceArea: cabinet.panels.reduce((sum, p) => sum + p.computed.surfaceArea, 0),
            totalEdgeLength: cabinet.panels.reduce((sum, p) => sum + p.computed.edgeLength, 0),
          };
        });
      });
    },

    // ========== MATERIAL CRUD - CORE ==========
    addCoreMaterial: (material) => {
      set((state) => {
        state.coreMaterials = {
          ...state.coreMaterials,
          [material.id]: material
        };
      });
    },
    
    updateCoreMaterial: (id, updates) => {
      set((state) => {
        if ((state.coreMaterials as Record<string, typeof state.coreMaterials[keyof typeof state.coreMaterials]>)[id]) {
          state.coreMaterials = {
            ...state.coreMaterials,
            [id]: { ...(state.coreMaterials as any)[id], ...updates }
          };
        }
      });
      get().recalculate();
    },
    
    deleteCoreMaterial: (id) => {
      set((state) => {
        const { [id]: removed, ...rest } = state.coreMaterials as any;
        state.coreMaterials = rest as typeof state.coreMaterials;
      });
    },
    
    // ========== MATERIAL CRUD - SURFACE ==========
    addSurfaceMaterial: (material) => {
      set((state) => {
        state.surfaceMaterials = {
          ...state.surfaceMaterials,
          [material.id]: material
        };
      });
    },
    
    updateSurfaceMaterial: (id, updates) => {
      set((state) => {
        if ((state.surfaceMaterials as any)[id]) {
          state.surfaceMaterials = {
            ...state.surfaceMaterials,
            [id]: { ...(state.surfaceMaterials as any)[id], ...updates }
          };
        }
      });
      get().recalculate();
    },
    
    deleteSurfaceMaterial: (id) => {
      set((state) => {
        const { [id]: removed, ...rest } = state.surfaceMaterials as any;
        state.surfaceMaterials = rest as typeof state.surfaceMaterials;
      });
    },
    
    // ========== MATERIAL CRUD - EDGE ==========
    addEdgeMaterial: (material) => {
      set((state) => {
        state.edgeMaterials = {
          ...state.edgeMaterials,
          [material.id]: material
        };
      });
    },
    
    updateEdgeMaterial: (id, updates) => {
      set((state) => {
        if ((state.edgeMaterials as any)[id]) {
          state.edgeMaterials = {
            ...state.edgeMaterials,
            [id]: { ...(state.edgeMaterials as any)[id], ...updates }
          };
        }
      });
      get().recalculate();
    },
    
    deleteEdgeMaterial: (id) => {
      set((state) => {
        const { [id]: removed, ...rest } = state.edgeMaterials as any;
        state.edgeMaterials = rest as typeof state.edgeMaterials;
      });
    },
    
    // ========== PER-PANEL MATERIAL ACTIONS ==========
    updatePanelMaterial: (panelId, target, materialId) => {
      set((state) => {
        if (!state.activeCabinetId) return;

        // CRITICAL: Mutate through state.cabinets[idx] path for proper Immer/Zustand reactivity
        // If we mutate through state.cabinet directly, Zustand won't detect the change
        // because the cabinets array selector uses shallow equality
        const cabinetIndex = state.cabinets.findIndex(c => c.id === state.activeCabinetId);
        if (cabinetIndex === -1) return;

        const cabinet = state.cabinets[cabinetIndex];
        const panel = cabinet.panels.find(p => p.id === panelId);
        if (!panel) return;

        // Update the material reference
        if (target === 'core') {
          panel.coreMaterialId = materialId;
        } else if (target === 'faceA') {
          if (!panel.faces) panel.faces = { faceA: null, faceB: null };
          panel.faces.faceA = materialId || null;
        } else if (target === 'faceB') {
          if (!panel.faces) panel.faces = { faceA: null, faceB: null };
          panel.faces.faceB = materialId || null;
        }

        // Always recalculate realThickness after any material change
        // USES TRUTH MODULE: computePanelTotalThickness for single-source-of-truth
        const defaultSurfaceId = cabinet.materials?.defaultSurface ?? 'surf-mel-white';
        if (panel.computed) {
          panel.computed.realThickness = calcPanelTotalThickness(panel, defaultSurfaceId);
        }

        // ============================================================
        // CRITICAL: Recalculate dependent carcass geometry when BACK panel changes
        // Uses recomputeCarcassGeometry which delegates to Truth Module
        // ============================================================
        if (panel.role === 'BACK') {
          recomputeCarcassGeometry(cabinet, state.edgeMaterials);
        }

        // Update timestamp
        cabinet.updatedAt = Date.now();

        // Recalculate cabinet totals
        cabinet.computed = calculateTotals(cabinet.panels);

        // Sync state.cabinet reference (for UI panels that use state.cabinet)
        state.cabinet = cabinet;
      });
    },
    
    updatePanelEdge: (panelId, side, edgeId) => {
      set((state) => {
        if (!state.activeCabinetId) return;

        // CRITICAL: Mutate through state.cabinets[idx] path for proper Immer/Zustand reactivity
        const cabinetIndex = state.cabinets.findIndex(c => c.id === state.activeCabinetId);
        if (cabinetIndex === -1) return;

        const cabinet = state.cabinets[cabinetIndex];
        const panelIndex = cabinet.panels.findIndex(p => p.id === panelId);
        if (panelIndex === -1) return;

        // Get panel reference (Immer allows direct mutation)
        const panel = cabinet.panels[panelIndex];

        // Ensure edges object exists
        if (!panel.edges) {
          panel.edges = { top: null, bottom: null, left: null, right: null };
        }

        // Direct mutation of the specific edge (Immer tracks this)
        panel.edges[side] = edgeId;

        // Recalculate cut size based on new edge thicknesses
        // Edge can be from edgeMaterials OR surfaceMaterials (user can select surface as edge)
        const getEdgeThickness = (id: string | null) => {
          if (!id) return 0;
          // Check edgeMaterials first, then surfaceMaterials
          const edge = state.edgeMaterials[id as keyof typeof state.edgeMaterials];
          if (edge) return edge.thickness;
          const surface = state.surfaceMaterials[id as keyof typeof state.surfaceMaterials];
          return surface?.thickness || 0;
        };

        const edgeT = getEdgeThickness(panel.edges.top);
        const edgeB = getEdgeThickness(panel.edges.bottom);
        const edgeL = getEdgeThickness(panel.edges.left);
        const edgeR = getEdgeThickness(panel.edges.right);

        // Cut size = Finish - edges + pre-milling (only for sides WITH edges)
        // preMilling is configurable per machine - use MANUFACTURING_PARAMS
        const preMilling = MANUFACTURING_PARAMS.preMilling;
        const preMillWidth = (edgeL > 0 ? preMilling : 0) + (edgeR > 0 ? preMilling : 0);
        const preMillHeight = (edgeT > 0 ? preMilling : 0) + (edgeB > 0 ? preMilling : 0);
        panel.computed.cutWidth = panel.finishWidth - edgeL - edgeR + preMillWidth;
        panel.computed.cutHeight = panel.finishHeight - edgeT - edgeB + preMillHeight;
        panel.computed.edgeLength =
          ((edgeT > 0 ? panel.finishWidth : 0) +
           (edgeB > 0 ? panel.finishWidth : 0) +
           (edgeL > 0 ? panel.finishHeight : 0) +
           (edgeR > 0 ? panel.finishHeight : 0)) / 1000; // Convert to meters (consistent with generatePanels)

        // Update timestamp to trigger re-renders
        cabinet.updatedAt = Date.now();

        // Recalculate cabinet totals
        cabinet.computed = calculateTotals(cabinet.panels);

        // Sync state.cabinet reference (for UI panels that use state.cabinet)
        state.cabinet = cabinet;
      });
    },

    // ========== PER-PANEL POSITION ACTIONS ==========
    updatePanelPositionOverride: (panelId, field, value) => {
      set((state) => {
        if (!state.activeCabinetId) return;

        // CRITICAL: Mutate through state.cabinets[idx] for proper Zustand/Immer reactivity
        const cabinetIndex = state.cabinets.findIndex(c => c.id === state.activeCabinetId);
        if (cabinetIndex === -1) return;

        const cabinet = state.cabinets[cabinetIndex];
        const panel = cabinet.panels.find(p => p.id === panelId);
        if (!panel) return;

        // Initialize position overrides if not exists
        if (!panel.positionOverrides) {
          panel.positionOverrides = { ...DEFAULT_POSITION_OVERRIDES };
        }

        panel.positionOverrides[field] = value as number;
        panel.useCustomPosition = true;

        // Recalculate panel position and dimensions directly (without regenerating all panels)
        const { depth: D, toeKickHeight: Leg } = cabinet.dimensions;
        const T = 18; // Panel thickness
        const ET = 1; // Edge thickness approximation

        // Back panel calculations (use per-cabinet setting)
        const backObstruction = (cabinet.structure.backPanelConstruction === 'inset')
          ? MANUFACTURING_PARAMS.backVoid + MANUFACTURING_PARAMS.backThickness
          : MANUFACTURING_PARAMS.backThickness;
        const depthInternal = D - backObstruction - MANUFACTURING_PARAMS.safetyGap;

        // Get current overrides
        const frontSetback = panel.positionOverrides.frontSetback ?? MANUFACTURING_PARAMS.shelfSetbackFront;
        const backSetback = panel.positionOverrides.backSetback ?? MANUFACTURING_PARAMS.shelfSetbackBack;
        const gapFromBelow = panel.positionOverrides.gapFromBelow;

        if (panel.role === 'SHELF' || panel.role === 'DIVIDER') {
          // Calculate new depth based on setbacks
          const newDepth = Math.round((depthInternal - frontSetback - backSetback) * 10) / 10;

          // Calculate new Z position (centered based on front setback)
          const newZ = (D/2 - frontSetback - ET/2) - (newDepth/2);

          // Calculate new Y position if gapFromBelow is set (for shelves)
          let newY = panel.position[1];
          if (panel.role === 'SHELF' && gapFromBelow !== null && gapFromBelow !== undefined) {
            // Y position = bottom of cabinet + bottom panel thickness + gap + half shelf thickness
            newY = Leg + T + gapFromBelow + T/2;
          }

          // Update panel dimensions (finishHeight is depth for horizontal panels)
          panel.finishHeight = newDepth;
          panel.position = [panel.position[0], newY, newZ];

          // Update computed values
          if (panel.computed) {
            panel.computed.cutHeight = newDepth;
            panel.computed.surfaceArea = (panel.finishWidth * newDepth) / 1000000 * 2;
          }

          // === UPDATE RELATED PARTIAL DIVIDERS ===
          // When a shelf moves, update the height of any partial dividers that are bounded by it
          if (panel.role === 'SHELF') {
            const shelfY = newY;
            const shelfX = panel.position[0];
            const shelfHalfWidth = panel.finishWidth / 2;
            const { height: H, toeKickHeight: LegH } = cabinet.dimensions;
            const usableHeight = H - 2 * T;

            // Find partial dividers (not full-height) that overlap with this shelf's X range
            const partialDividers = cabinet.panels.filter(p => {
              if (p.role !== 'DIVIDER') return false;
              if (p.finishHeight >= usableHeight - 10) return false; // Skip full-height dividers

              // Check X overlap with shelf
              const dividerX = p.position[0];
              return dividerX >= shelfX - shelfHalfWidth && dividerX <= shelfX + shelfHalfWidth;
            });

            // Update each partial divider's height based on new shelf position
            for (const divider of partialDividers) {
              const dividerY = divider.position[1];
              const dividerHalfHeight = divider.finishHeight / 2;
              const dividerTop = dividerY + dividerHalfHeight;
              const dividerBottom = dividerY - dividerHalfHeight;

              // Check if this shelf is above or below the divider
              const shelfTopSurface = shelfY + T/2;
              const shelfBottomSurface = shelfY - T/2;

              // If shelf is above the divider center, it constrains the top
              if (shelfBottomSurface > dividerY && shelfBottomSurface < dividerTop) {
                // Shelf is above - adjust divider's top to shelf's bottom
                const newHeight = Math.round((shelfBottomSurface - dividerBottom) * 10) / 10;
                const newDividerY = Math.round((dividerBottom + shelfBottomSurface) / 2 * 10) / 10;
                divider.finishHeight = newHeight;
                divider.position = [divider.position[0], newDividerY, divider.position[2]];
                if (divider.computed) {
                  divider.computed.cutHeight = newHeight;
                  divider.computed.surfaceArea = (divider.finishWidth * newHeight) / 1000000 * 2;
                }
              }
              // If shelf is below the divider center, it constrains the bottom
              else if (shelfTopSurface < dividerY && shelfTopSurface > dividerBottom) {
                // Shelf is below - adjust divider's bottom to shelf's top
                const newHeight = Math.round((dividerTop - shelfTopSurface) * 10) / 10;
                const newDividerY = Math.round((shelfTopSurface + dividerTop) / 2 * 10) / 10;
                divider.finishHeight = newHeight;
                divider.position = [divider.position[0], newDividerY, divider.position[2]];
                if (divider.computed) {
                  divider.computed.cutHeight = newHeight;
                  divider.computed.surfaceArea = (divider.finishWidth * newHeight) / 1000000 * 2;
                }
              }
            }
          }
        }

        cabinet.updatedAt = Date.now();

        // Sync state.cabinet reference for UI panels
        state.cabinet = cabinet;
      });
      // Don't call recalculate() - we updated the panel directly to preserve panel IDs
    },

    resetPanelPosition: (panelId) => {
      set((state) => {
        // REACTIVITY FIX: Use cabinets[idx] path for Zustand subscribers
        if (!state.activeCabinetId) return;
        const cabinetIndex = state.cabinets.findIndex(c => c.id === state.activeCabinetId);
        if (cabinetIndex === -1) return;
        const cabinet = state.cabinets[cabinetIndex];

        const panel = cabinet.panels.find(p => p.id === panelId);
        if (!panel) return;

        // Reset to default overrides
        panel.positionOverrides = { ...DEFAULT_POSITION_OVERRIDES };
        panel.useCustomPosition = false;

        // Recalculate panel position and dimensions with default values
        const { depth: D } = cabinet.dimensions;
        const ET = 1; // Edge thickness approximation

        // Back panel calculations (use per-cabinet setting)
        const backObstruction = (cabinet.structure.backPanelConstruction === 'inset')
          ? MANUFACTURING_PARAMS.backVoid + MANUFACTURING_PARAMS.backThickness
          : MANUFACTURING_PARAMS.backThickness;
        const depthInternal = D - backObstruction - MANUFACTURING_PARAMS.safetyGap;

        // Use default setbacks
        const frontSetback = MANUFACTURING_PARAMS.shelfSetbackFront;
        const backSetback = MANUFACTURING_PARAMS.shelfSetbackBack;

        if (panel.role === 'SHELF' || panel.role === 'DIVIDER') {
          // Calculate new depth based on default setbacks
          const newDepth = Math.round((depthInternal - frontSetback - backSetback) * 10) / 10;

          // Calculate new Z position (centered based on front setback)
          const newZ = (D/2 - frontSetback - ET/2) - (newDepth/2);

          // Update panel dimensions
          panel.finishHeight = newDepth;
          panel.position = [panel.position[0], panel.position[1], newZ];

          // Update computed values
          if (panel.computed) {
            panel.computed.cutHeight = newDepth;
            panel.computed.surfaceArea = (panel.finishWidth * newDepth) / 1000000 * 2;
          }
        }

        cabinet.updatedAt = Date.now();
        // Sync UI reference
        state.cabinet = cabinet;
      });
      // Don't call recalculate() - we updated the panel directly to preserve panel IDs
    },

    // ========== DIVIDER POSITION ==========
    moveDivider: (dividerIndex, newXPosition) => {
      set((state) => {
        // REACTIVITY FIX: Use cabinets[idx] path for Zustand subscribers
        if (!state.activeCabinetId) return;
        const cabinetIndex = state.cabinets.findIndex(c => c.id === state.activeCabinetId);
        if (cabinetIndex === -1) return;
        const cabinet = state.cabinets[cabinetIndex];

        // Find all dividers sorted by X position
        const dividers = cabinet.panels
          .filter(p => p.role === 'DIVIDER')
          .sort((a, b) => a.position[0] - b.position[0]);

        if (dividerIndex < 0 || dividerIndex >= dividers.length) return;

        const divider = dividers[dividerIndex];
        const T = 18; // Panel thickness
        const W = cabinet.dimensions.width;

        // Clamp new position within cabinet bounds
        const minX = -W/2 + T + 50; // At least 50mm from left side
        const maxX = W/2 - T - 50;  // At least 50mm from right side
        const clampedX = Math.max(minX, Math.min(maxX, newXPosition));

        // Update divider position
        divider.position = [clampedX, divider.position[1], divider.position[2]];
        divider.useCustomPosition = true;

        // Store the X position override
        if (!divider.positionOverrides) {
          divider.positionOverrides = {
            frontSetback: 0,
            backSetback: 0,
            gapFromBelow: null,
          };
        }

        cabinet.updatedAt = Date.now();
        // Sync UI reference
        state.cabinet = cabinet;
      });

      // Recalculate to update shelves that depend on divider positions
      get().recalculate();
    },

    // Move a partial divider by its panel ID (for partial dividers within compartments)
    movePartialDividerById: (panelId, newXPosition) => {
      set((state) => {
        // REACTIVITY FIX: Use cabinets[idx] path for Zustand subscribers
        if (!state.activeCabinetId) return;
        const cabinetIndex = state.cabinets.findIndex(c => c.id === state.activeCabinetId);
        if (cabinetIndex === -1) return;
        const cabinet = state.cabinets[cabinetIndex];

        // Find the panel by ID
        const panel = cabinet.panels.find(p => p.id === panelId);
        if (!panel || panel.role !== 'DIVIDER') return;

        const T = 18; // Panel thickness
        const W = cabinet.dimensions.width;
        const H = cabinet.dimensions.height;

        // Get full-height dividers for column boundaries
        const usableHeight = H - 2 * T;
        const fullHeightDividers = cabinet.panels
          .filter(p => p.role === 'DIVIDER' && p.finishHeight >= usableHeight - 10)
          .sort((a, b) => a.position[0] - b.position[0]);
        const dividerXPositions = fullHeightDividers.map(p => p.position[0]);

        // Find which column this partial divider is in (based on its current position)
        const currentX = panel.position[0];
        let colIndex = 0;
        for (let i = 0; i < dividerXPositions.length; i++) {
          if (currentX > dividerXPositions[i]) {
            colIndex = i + 1;
          }
        }

        // Get column boundaries
        const columnCount = dividerXPositions.length + 1;
        const leftBound = colIndex === 0 ? -W/2 + T : dividerXPositions[colIndex - 1] + T/2;
        const rightBound = colIndex === columnCount - 1 ? W/2 - T : dividerXPositions[colIndex] - T/2;

        // Clamp new position within column bounds (with at least 50mm from each side)
        const minX = leftBound + 50;
        const maxX = rightBound - 50;
        const clampedX = Math.max(minX, Math.min(maxX, newXPosition));

        // Update panel position
        panel.position = [clampedX, panel.position[1], panel.position[2]];
        panel.useCustomPosition = true;

        // Store the X position in a way we can reference later
        if (!panel.positionOverrides) {
          panel.positionOverrides = {
            frontSetback: 0,
            backSetback: 0,
            gapFromBelow: null,
          };
        }

        cabinet.updatedAt = Date.now();
        // Sync UI reference
        state.cabinet = cabinet;
      });

      // Note: Do NOT call recalculate() here because partial dividers
      // are not tracked in structure.dividerCount and would be lost during regeneration.
      // Just update the position directly in the panels array.
    },

    // ========== COMPARTMENT ACTIONS ==========
    // Add a shelf within a specific compartment (splits the compartment horizontally)
    // Creates a PARTIAL shelf only within the compartment bounds (column width)
    // Now accepts optional bounds parameter for sub-compartment support
    addShelfInCompartment: (col, row, bounds) => {
      // SPEC-08: Block panel additions when not in DRAFT
      if (!guardMutation('addShelfInCompartment')) return;

      const state = get();
      if (!state.cabinet) return;

      const { width: W, height: H, depth: D, toeKickHeight: Leg } = state.cabinet.dimensions;
      const { panels } = state.cabinet;
      const T = 18;
      const bodyH = H;
      const ET = 1; // Edge thickness

      // Get divider X positions to determine column boundaries
      // Only count FULL-HEIGHT dividers as column boundaries (exclude partial dividers)
      const usableHeight = H - 2 * T; // Full height minus top and bottom panels
      const dividerPanels = panels
        .filter(p => p.role === 'DIVIDER')
        .filter(p => p.finishHeight >= usableHeight - 10) // Only full-height dividers
        .sort((a, b) => a.position[0] - b.position[0]);
      const dividerXPositions = dividerPanels.map(p => p.position[0]);
      const columnCount = dividerXPositions.length + 1;

      // Get column boundaries (fallback if bounds not provided)
      const colLeftX = col === 0 ? -W/2 + T : dividerXPositions[col - 1] + T/2;
      const colRightX = col === columnCount - 1 ? W/2 - T : dividerXPositions[col] - T/2;
      const colCenterX = (colLeftX + colRightX) / 2;
      const columnWidth = colRightX - colLeftX;

      // Get shelves in this column to determine compartment Y bounds (fallback)
      // Only count FULL-WIDTH shelves as row boundaries (exclude partial shelves)
      const shelvesInCol = panels
        .filter(p => p.role === 'SHELF')
        .filter(p => {
          const shelfX = p.position[0];
          const shelfHalfWidth = p.finishWidth / 2;
          const overlapsColumn = shelfX - shelfHalfWidth <= colCenterX && shelfX + shelfHalfWidth >= colCenterX;
          // Check if shelf spans most of the column width (at least 80%)
          const isFullWidth = p.finishWidth >= columnWidth * 0.8;
          return overlapsColumn && isFullWidth;
        })
        .sort((a, b) => a.position[1] - b.position[1]);

      const shelfYs = [...new Set(shelvesInCol.map(s => s.position[1]))].sort((a, b) => a - b);
      const rowCount = shelfYs.length + 1;

      // Use provided bounds or calculate from col/row (fallback for backward compatibility)
      const leftX = bounds?.leftX ?? colLeftX;
      const rightX = bounds?.rightX ?? colRightX;
      const subCompartmentWidth = rightX - leftX;
      const bottomY = bounds?.bottomY ?? (row === 0 ? Leg + T : shelfYs[row - 1] + T/2);
      const topY = bounds?.topY ?? (row === rowCount - 1 ? Leg + bodyH - T : shelfYs[row] - T/2);

      // New shelf position: use provided centerY or calculate from bounds
      const newShelfY = bounds?.centerY ?? (bottomY + topY) / 2;
      const newShelfX = (leftX + rightX) / 2;

      // Calculate shelf dimensions
      const frontSetback = 20; // Default front setback
      const backSetback = 28;  // Default back setback
      const depthInternal = D - T; // Internal depth
      const shelfDepth = depthInternal - frontSetback - backSetback;
      const shelfWidth = subCompartmentWidth;

      // Shelf Z position
      const shelfZ = (D/2 - frontSetback - ET/2) - (shelfDepth/2);

      // Get materials
      const defaultCoreId = state.cabinet.materials.defaultCore;
      const defaultSurfaceId = state.cabinet.materials.defaultSurface;
      const defaultEdgeId = state.cabinet.materials.defaultEdge;

      // Get edge thickness from materials
      const edgeMat = state.edgeMaterials[defaultEdgeId as keyof typeof state.edgeMaterials];
      const edgeThickness = edgeMat?.thickness || 1;

      // TRUTH MODULE: Calculate actual panel thickness from materials
      const actualPanelThickness = calcPanelTotalThickness(
        { coreMaterialId: defaultCoreId, faces: { faceA: defaultSurfaceId, faceB: null } },
        defaultSurfaceId
      );

      // Compute panel values
      const computePanel = (finishW: number, finishH: number, edgeTop: number) => {
        const cutW = finishW - edgeTop;
        const cutH = finishH;
        const surfaceArea = (finishW * finishH) / 1000000;
        const edgeLength = edgeTop > 0 ? finishW / 1000 : 0;
        return {
          realThickness: actualPanelThickness, // Use Truth Module instead of hardcoded T
          cutWidth: cutW,
          cutHeight: cutH,
          surfaceArea,
          edgeLength,
          cost: 0,
          co2: 0,
        };
      };

      // Create partial shelf panel directly
      set((state) => {
        // REACTIVITY FIX: Use cabinets[idx] path for Zustand subscribers
        if (!state.activeCabinetId) return;
        const cabinetIndex = state.cabinets.findIndex(c => c.id === state.activeCabinetId);
        if (cabinetIndex === -1) return;
        const cabinet = state.cabinets[cabinetIndex];

        // Count existing sub shelves to generate name
        const existingSubShelfCount = cabinet.panels.filter(p => p.role === 'SHELF' && p.name.startsWith('Sub')).length;

        const newShelf: CabinetPanel = {
          id: createId(),
          role: 'SHELF',
          name: `Sub Shelf ${existingSubShelfCount + 1}`,
          finishWidth: shelfWidth,
          finishHeight: shelfDepth, // For shelf, finishHeight is depth
          coreMaterialId: defaultCoreId,
          faces: { faceA: defaultSurfaceId, faceB: null },
          edges: { top: defaultEdgeId, bottom: defaultEdgeId, left: defaultEdgeId, right: defaultEdgeId }, // All 4 edges
          grainDirection: 'HORIZONTAL',
          computed: computePanel(shelfWidth, shelfDepth, edgeThickness),
          position: [newShelfX, newShelfY, shelfZ],
          rotation: [0, 0, 0],
          visible: true,
          selected: false,
          useCustomPosition: true, // Mark as custom since it's a partial shelf
          positionOverrides: {
            frontSetback: frontSetback,
            backSetback: backSetback,
            gapFromBelow: newShelfY - Leg - T - T/2, // Store Y position
          },
        };

        cabinet.panels.push(newShelf);
        cabinet.updatedAt = Date.now();

        // Recalculate totals
        cabinet.computed = {
          totalCost: cabinet.panels.reduce((sum, p) => sum + p.computed.cost, 0),
          totalCO2: cabinet.panels.reduce((sum, p) => sum + p.computed.co2, 0),
          panelCount: cabinet.panels.length,
          totalSurfaceArea: cabinet.panels.reduce((sum, p) => sum + p.computed.surfaceArea, 0),
          totalEdgeLength: cabinet.panels.reduce((sum, p) => sum + p.computed.edgeLength, 0),
        };

        // Sync UI reference
        state.cabinet = cabinet;
      });
    },

    // Add a divider within a specific compartment (splits the compartment horizontally)
    // Creates a PARTIAL divider only within the compartment bounds, not full height
    // Now accepts optional bounds parameter for sub-compartment support
    addDividerInCompartment: (col, row, bounds) => {
      // SPEC-08: Block panel additions when not in DRAFT
      if (!guardMutation('addDividerInCompartment')) return;

      const state = get();
      if (!state.cabinet) return;

      const { width: W, height: H, depth: D, toeKickHeight: Leg } = state.cabinet.dimensions;
      const { panels } = state.cabinet;
      const T = 18;
      const bodyH = H;
      const ET = 1; // Edge thickness

      // Get divider X positions to determine column boundaries
      // Only count FULL-HEIGHT dividers as column boundaries (exclude partial dividers)
      const usableHeight = H - 2 * T; // Full height minus top and bottom panels
      const dividerPanels = panels
        .filter(p => p.role === 'DIVIDER')
        .filter(p => p.finishHeight >= usableHeight - 10) // Only full-height dividers
        .sort((a, b) => a.position[0] - b.position[0]);
      const dividerXPositions = dividerPanels.map(p => p.position[0]);
      const columnCount = dividerXPositions.length + 1;

      // Get column boundaries (fallback if bounds not provided)
      const colLeftX = col === 0 ? -W/2 + T : dividerXPositions[col - 1] + T/2;
      const colRightX = col === columnCount - 1 ? W/2 - T : dividerXPositions[col] - T/2;
      const colCenterX = (colLeftX + colRightX) / 2;
      const columnWidth = colRightX - colLeftX;

      // Get shelves in this column to determine compartment Y bounds (fallback)
      // Only count FULL-WIDTH shelves as row boundaries (exclude partial shelves)
      const shelvesInCol = panels
        .filter(p => p.role === 'SHELF')
        .filter(p => {
          const shelfX = p.position[0];
          const shelfHalfWidth = p.finishWidth / 2;
          const overlapsColumn = shelfX - shelfHalfWidth <= colCenterX && shelfX + shelfHalfWidth >= colCenterX;
          // Check if shelf spans most of the column width (at least 80%)
          const isFullWidth = p.finishWidth >= columnWidth * 0.8;
          return overlapsColumn && isFullWidth;
        })
        .sort((a, b) => a.position[1] - b.position[1]);

      const shelfYs = [...new Set(shelvesInCol.map(s => s.position[1]))].sort((a, b) => a - b);
      const rowCount = shelfYs.length + 1;

      // Use provided bounds or calculate from col/row (fallback for backward compatibility)
      const leftX = bounds?.leftX ?? colLeftX;
      const rightX = bounds?.rightX ?? colRightX;
      let bottomY = bounds?.bottomY ?? (row === 0 ? Leg + T : shelfYs[row - 1] + T/2);
      let topY = bounds?.topY ?? (row === rowCount - 1 ? Leg + bodyH - T : shelfYs[row] - T/2);

      // New partial divider position: use provided centerX or calculate from bounds
      const newDividerX = bounds?.centerX ?? (leftX + rightX) / 2;
      const targetCenterY = (bottomY + topY) / 2;

      // === PARTIAL SHELF CONSTRAINT ===
      // Check for partial shelves that might constrain the divider's height
      // Partial shelves are shelves with useCustomPosition=true or that don't span full column width
      const partialShelves = panels
        .filter(p => p.role === 'SHELF')
        .filter(p => {
          // Check if shelf overlaps with the divider's X position
          const shelfHalfWidth = p.finishWidth / 2;
          const shelfLeftX = p.position[0] - shelfHalfWidth;
          const shelfRightX = p.position[0] + shelfHalfWidth;
          const overlapsX = newDividerX >= shelfLeftX && newDividerX <= shelfRightX;

          // Check if shelf is within the Y bounds (not at the exact boundary)
          const shelfY = p.position[1];
          const isWithinBounds = shelfY > bottomY + T && shelfY < topY - T;

          return overlapsX && isWithinBounds;
        });

      // If there are partial shelves, find the ones closest to the target center Y
      // and adjust the bounds to not overlap with them
      if (partialShelves.length > 0) {
        // Find shelves above and below the target center
        const shelvesBelow = partialShelves
          .filter(s => s.position[1] < targetCenterY)
          .sort((a, b) => b.position[1] - a.position[1]); // Descending - closest first

        const shelvesAbove = partialShelves
          .filter(s => s.position[1] >= targetCenterY)
          .sort((a, b) => a.position[1] - b.position[1]); // Ascending - closest first

        // Adjust bottomY if there's a shelf below
        if (shelvesBelow.length > 0) {
          const closestBelow = shelvesBelow[0];
          const shelfTopSurface = closestBelow.position[1] + T/2;
          if (shelfTopSurface > bottomY) {
            bottomY = shelfTopSurface;
          }
        }

        // Adjust topY if there's a shelf above
        if (shelvesAbove.length > 0) {
          const closestAbove = shelvesAbove[0];
          const shelfBottomSurface = closestAbove.position[1] - T/2;
          if (shelfBottomSurface < topY) {
            topY = shelfBottomSurface;
          }
        }
      }

      // Round to avoid floating point precision issues (0.1mm precision)
      const compartmentHeight = Math.round((topY - bottomY) * 10) / 10;
      const newDividerY = Math.round(((bottomY + topY) / 2) * 10) / 10;

      // Calculate divider dimensions
      const depthInternal = D - T; // Internal depth
      const dividerD = Math.round((depthInternal - ET) * 10) / 10; // Divider depth (no front setback for dividers)
      const dividerH = compartmentHeight; // Only as tall as the compartment

      // Divider Z position
      const dividerZ = (D/2 - ET/2) - (dividerD/2);

      // Get materials
      const defaultCoreId = state.cabinet.materials.defaultCore;
      const defaultSurfaceId = state.cabinet.materials.defaultSurface;
      const defaultEdgeId = state.cabinet.materials.defaultEdge;

      // Get edge thickness from materials
      const edgeMat = state.edgeMaterials[defaultEdgeId as keyof typeof state.edgeMaterials];
      const edgeThickness = edgeMat?.thickness || 1;

      // TRUTH MODULE: Calculate actual panel thickness from materials
      const actualPanelThickness = calcPanelTotalThickness(
        { coreMaterialId: defaultCoreId, faces: { faceA: defaultSurfaceId, faceB: null } },
        defaultSurfaceId
      );

      // Compute panel values
      const computePanel = (finishW: number, finishH: number, edgeTop: number) => {
        const cutW = finishW - edgeTop;
        const cutH = finishH;
        const surfaceArea = (finishW * finishH) / 1000000;
        const edgeLength = edgeTop > 0 ? finishW / 1000 : 0;
        return {
          realThickness: actualPanelThickness, // Use Truth Module instead of hardcoded T
          cutWidth: cutW,
          cutHeight: cutH,
          surfaceArea,
          edgeLength,
          cost: 0,
          co2: 0,
        };
      };

      // Create partial divider panel directly
      set((state) => {
        // REACTIVITY FIX: Use cabinets[idx] path for Zustand subscribers
        if (!state.activeCabinetId) return;
        const cabinetIndex = state.cabinets.findIndex(c => c.id === state.activeCabinetId);
        if (cabinetIndex === -1) return;
        const cabinet = state.cabinets[cabinetIndex];

        // Count existing sub dividers to generate name
        const existingSubDividerCount = cabinet.panels.filter(p => p.role === 'DIVIDER' && p.name.startsWith('Sub')).length;

        const newDivider: CabinetPanel = {
          id: createId(),
          role: 'DIVIDER',
          name: `Sub Divider ${existingSubDividerCount + 1}`,
          finishWidth: dividerD,
          finishHeight: dividerH,
          coreMaterialId: defaultCoreId,
          faces: { faceA: defaultSurfaceId, faceB: null },
          edges: { top: defaultEdgeId, bottom: defaultEdgeId, left: defaultEdgeId, right: defaultEdgeId }, // All 4 edges
          grainDirection: 'VERTICAL',
          computed: computePanel(dividerD, dividerH, edgeThickness),
          position: [newDividerX, newDividerY, dividerZ],
          rotation: [0, 0, 0],
          visible: true,
          selected: false,
          useCustomPosition: true, // Mark as custom since it's a partial divider
          positionOverrides: {
            frontSetback: 0,
            backSetback: 0,
            gapFromBelow: bottomY - Leg - T, // Store bottom boundary
          },
        };

        cabinet.panels.push(newDivider);
        cabinet.updatedAt = Date.now();

        // Recalculate totals
        cabinet.computed = {
          totalCost: cabinet.panels.reduce((sum, p) => sum + p.computed.cost, 0),
          totalCO2: cabinet.panels.reduce((sum, p) => sum + p.computed.co2, 0),
          panelCount: cabinet.panels.length,
          totalSurfaceArea: cabinet.panels.reduce((sum, p) => sum + p.computed.surfaceArea, 0),
          totalEdgeLength: cabinet.panels.reduce((sum, p) => sum + p.computed.edgeLength, 0),
        };

        // Sync UI reference
        state.cabinet = cabinet;
      });
    },

    // ========== MANUFACTURING PARAMETERS ==========
    setManufacturingParam: (key, value) => {
      set((state) => {
        state.manufacturingParams[key] = value;

        // Note: Cut size calculation no longer uses preMilling
        // Cut Size = Finish Size - Edge Thicknesses (preMilling is machine operation only)
        // Manufacturing params like preMilling are for reference/display only
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          // Just mark as updated (no other changes needed)
        }, { skipRecompute: true });
      });
    },

    resetManufacturingParams: () => {
      set((state) => {
        state.manufacturingParams = {
          preMilling: MANUFACTURING_PARAMS.preMilling,
          glueThickness: MANUFACTURING_PARAMS.glueThickness,
          clearance: MANUFACTURING_PARAMS.clearance,
          grooveDepth: MANUFACTURING_PARAMS.grooveDepth,
          backVoid: MANUFACTURING_PARAMS.backVoid,
          backThickness: MANUFACTURING_PARAMS.backThickness,
          safetyGap: MANUFACTURING_PARAMS.safetyGap,
        };
      });
    },

    // ========== CONSTRUCTION TYPE ==========
    setConstructionType: (type) => {
      set((state) => {
        state.constructionType = type;
      });
    },

    // ========== HARDWARE CONFIGURATION ==========
    updateHardware: (cabinetId, hardware) => {
      set((state) => {
        const cabinet = state.cabinets.find((c) => c.id === cabinetId);
        if (cabinet) {
          if (!cabinet.hardware) {
            cabinet.hardware = { ...DEFAULT_HARDWARE };
          }
          cabinet.hardware = { ...cabinet.hardware, ...hardware };
        }
      });
    },

    setMinifixPreset: (cabinetId, presetId) => {
      set((state) => {
        const cabinet = state.cabinets.find((c) => c.id === cabinetId);
        if (cabinet) {
          if (!cabinet.hardware) {
            cabinet.hardware = { ...DEFAULT_HARDWARE };
          }
          cabinet.hardware.minifixPresetId = presetId;
          // Clear inline config when using preset
          if (presetId) {
            cabinet.hardware.minifixConfig = undefined;
          }
        }
      });
    },

    setHingePreset: (cabinetId, presetId) => {
      set((state) => {
        const cabinet = state.cabinets.find((c) => c.id === cabinetId);
        if (cabinet) {
          if (!cabinet.hardware) {
            cabinet.hardware = { ...DEFAULT_HARDWARE };
          }
          cabinet.hardware.hingePresetId = presetId;
          // Clear inline config when using preset
          if (presetId) {
            cabinet.hardware.hingeConfig = undefined;
          }
        }
      });
    },

    // ========== HARDWARE POINT OVERRIDES ==========
    setHardwarePointOverride: (cabinetId, pointId, override) => {
      set((state) => {
        const cabinet = state.cabinets.find((c) => c.id === cabinetId);
        if (cabinet) {
          if (!cabinet.hardwareOverrides) {
            cabinet.hardwareOverrides = {};
          }
          // Merge with existing override (if any)
          const existing = cabinet.hardwareOverrides[pointId] || {};
          cabinet.hardwareOverrides[pointId] = {
            ...existing,
            ...(override.rotation && { rotation: override.rotation }),
            ...(override.position && { position: override.position }),
          };
        }
      });
    },

    clearHardwarePointOverride: (cabinetId, pointId) => {
      set((state) => {
        const cabinet = state.cabinets.find((c) => c.id === cabinetId);
        if (cabinet?.hardwareOverrides) {
          delete cabinet.hardwareOverrides[pointId];
        }
      });
    },

    getHardwarePointOverrides: (cabinetId) => {
      const state = get();
      const cabinet = state.cabinets.find((c) => c.id === cabinetId);
      return cabinet?.hardwareOverrides || {};
    },

    // ========== DRAWER CONFIGURATION ==========
    enableDrawers: (slideType = 'undermount') => {
      if (!guardMutation('enableDrawers')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          // Initialize drawer config if not present
          if (!cabinet.structure.drawerConfig) {
            cabinet.structure.drawerConfig = {
              ...DEFAULT_DRAWER_CONFIG,
              hasDrawers: true,
              slideType,
            };
          } else {
            cabinet.structure.drawerConfig.hasDrawers = true;
            cabinet.structure.drawerConfig.slideType = slideType;
          }
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });

      // Trigger recalculation to generate drawer panels
      get().recalculate();
    },

    disableDrawers: () => {
      if (!guardMutation('disableDrawers')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          if (!cabinet.structure.drawerConfig) return;
          cabinet.structure.drawerConfig.hasDrawers = false;
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });

      // Trigger recalculation to remove drawer panels
      get().recalculate();
    },

    addDrawerRow: (config) => {
      if (!guardMutation('addDrawerRow')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          // Initialize drawer config if not present
          if (!cabinet.structure.drawerConfig) {
            cabinet.structure.drawerConfig = {
              ...DEFAULT_DRAWER_CONFIG,
              hasDrawers: true,
            };
          }

          const newRow: DrawerRowConfig = {
            id: createDrawerRowId(),
            frontHeight: config?.frontHeight ?? DEFAULT_DRAWER_ROW.frontHeight,
            gapAbove: config?.gapAbove ?? DEFAULT_DRAWER_ROW.gapAbove,
            slideSystemId: config?.slideSystemId ?? DEFAULT_DRAWER_ROW.slideSystemId,
            handleConfig: config?.handleConfig ?? DEFAULT_DRAWER_ROW.handleConfig,
          };

          cabinet.structure.drawerConfig.rows.push(newRow);
          cabinet.structure.drawerConfig.hasDrawers = true;
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });

      // Trigger recalculation to generate new drawer panels
      get().recalculate();
    },

    removeDrawerRow: (rowIndex) => {
      if (!guardMutation('removeDrawerRow')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          if (!cabinet.structure.drawerConfig) return;

          const rows = cabinet.structure.drawerConfig.rows;
          if (rowIndex >= 0 && rowIndex < rows.length) {
            rows.splice(rowIndex, 1);
          }

          // If no rows left, disable drawers
          if (rows.length === 0) {
            cabinet.structure.drawerConfig.hasDrawers = false;
          }
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });

      // Trigger recalculation to update panels
      get().recalculate();
    },

    updateDrawerRow: (rowIndex, updates) => {
      if (!guardMutation('updateDrawerRow')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          if (!cabinet.structure.drawerConfig) return;

          const rows = cabinet.structure.drawerConfig.rows;
          if (rowIndex >= 0 && rowIndex < rows.length) {
            Object.assign(rows[rowIndex], updates);
          }
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });

      // Trigger recalculation to update drawer dimensions
      get().recalculate();
    },

    // ========== DOOR CONFIGURATION ==========
    enableDoors: (doorCount = 1) => {
      if (!guardMutation('enableDoors')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          // Initialize door config if not present
          if (!cabinet.structure.doorConfig) {
            // Create door panels based on count
            const doors: DoorPanelConfig[] = [];

            if (doorCount === 1) {
              doors.push({
                ...DEFAULT_DOOR_PANEL,
                id: createDoorPanelId(),
                openingDirection: 'left',
              });
            } else {
              // Two doors: left opens left, right opens right
              doors.push({
                ...DEFAULT_DOOR_PANEL,
                id: createDoorPanelId(),
                openingDirection: 'left',
              });
              doors.push({
                ...DEFAULT_DOOR_PANEL,
                id: createDoorPanelId(),
                openingDirection: 'right',
              });
            }

            cabinet.structure.doorConfig = {
              ...DEFAULT_DOOR_CONFIG,
              hasDoors: true,
              doorCount,
              doors,
            };
          } else {
            cabinet.structure.doorConfig.hasDoors = true;
          }
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });

      // Trigger recalculation to generate door panels
      get().recalculate();
    },

    disableDoors: () => {
      if (!guardMutation('disableDoors')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          if (!cabinet.structure.doorConfig) return;
          cabinet.structure.doorConfig.hasDoors = false;
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });

      // Trigger recalculation to remove door panels
      get().recalculate();
    },

    setDoorCount: (count) => {
      if (!guardMutation('setDoorCount')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          const doorConfig = cabinet.structure.doorConfig;
          if (!doorConfig) {
            // If no door config, enable doors with the new count
            cabinet.structure.doorConfig = {
              ...DEFAULT_DOOR_CONFIG,
              hasDoors: true,
              doorCount: count,
              doors: count === 1
                ? [{
                    ...DEFAULT_DOOR_PANEL,
                    id: createDoorPanelId(),
                    openingDirection: 'left',
                  }]
                : [{
                    ...DEFAULT_DOOR_PANEL,
                    id: createDoorPanelId(),
                    openingDirection: 'left',
                  }, {
                    ...DEFAULT_DOOR_PANEL,
                    id: createDoorPanelId(),
                    openingDirection: 'right',
                  }],
            };
          } else if (doorConfig.doorCount !== count) {
            doorConfig.doorCount = count;

            if (count === 1) {
              // Keep first door, remove second if exists
              doorConfig.doors = [doorConfig.doors[0] || {
                ...DEFAULT_DOOR_PANEL,
                id: createDoorPanelId(),
                openingDirection: 'left',
              }];
            } else {
              // Add second door if needed
              if (doorConfig.doors.length === 1) {
                doorConfig.doors.push({
                  ...DEFAULT_DOOR_PANEL,
                  id: createDoorPanelId(),
                  openingDirection: 'right',
                });
              }
            }
          }
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });

      // Trigger recalculation to update door panels
      get().recalculate();
    },

    updateDoorConfig: (updates) => {
      if (!guardMutation('updateDoorConfig')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          if (!cabinet.structure.doorConfig) return;
          Object.assign(cabinet.structure.doorConfig, updates);
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });

      // Trigger recalculation to update door dimensions
      get().recalculate();
    },

    updateDoorPanel: (doorIndex, updates) => {
      if (!guardMutation('updateDoorPanel')) return;

      set((state) => {
        // PHASE 3: Use withActiveCabinet for reactive mutations
        withActiveCabinet(state, (cabinet) => {
          if (!cabinet.structure.doorConfig) return;

          const doors = cabinet.structure.doorConfig.doors;
          if (doorIndex >= 0 && doorIndex < doors.length) {
            Object.assign(doors[doorIndex], updates);
          }
        }, { skipRecompute: true }); // Skip because recalculate() regenerates panels
      });

      // Trigger recalculation to update door panel
      get().recalculate();
    },

    // ========== RECALCULATION ==========
    recalculate: () => {
      set((state) => {
        // PHASE 3: Get truth object from cabinets array
        if (!state.activeCabinetId) return;
        const idx = state.cabinets.findIndex(c => c.id === state.activeCabinetId);
        if (idx === -1) return;
        const cabinet = state.cabinets[idx];

        const { width: W, height: H, depth: D, toeKickHeight: Leg } = cabinet.dimensions;
        const T = 18;

        // Preserve existing panel overrides before regenerating
        const existingOverrides = new Map<string, {
          role: PanelRole;
          index: number;
          overrides?: PanelPositionOverrides;
          useCustomPosition?: boolean;
          xPosition?: number; // Custom X position for dividers
        }>();

        // Separate partial panels (custom-created) from standard panels
        // Partial panels are those created via addShelfInCompartment/addDividerInCompartment
        // They have useCustomPosition=true and are not full-width shelves or full-height dividers
        const usableHeight = H - 2 * T;
        const usableWidth = W - 2 * T;

        const partialPanels: CabinetPanel[] = [];

        // Index shelves and dividers by their name pattern
        // Main Shelf names: "Main Shelf 1", "Main Shelf 1a", "Main Shelf 1b", etc.
        // Sub Shelf names: "Sub Shelf 1", "Sub Shelf 2", etc. (partial shelves)
        // Main Divider names: "Main Divider 1", "Main Divider 2", etc.
        // Sub Divider names: "Sub Divider 1", "Sub Divider 2", etc. (partial dividers)
        let dividerIndex = 0;
        cabinet.panels.forEach(panel => {
          if (panel.role === 'SHELF') {
            // Check if this is a Sub shelf (partial shelf)
            const isSubShelf = panel.name.startsWith('Sub');

            if (isSubShelf) {
              // This is a Sub shelf - preserve it completely
              partialPanels.push({ ...panel });
            } else {
              // Main shelf - preserve overrides
              const match = panel.name.match(/Main Shelf (\d+)([a-z])?/);
              if (match) {
                const row = parseInt(match[1], 10) - 1;
                const segLetter = match[2];
                const seg = segLetter ? segLetter.charCodeAt(0) - 97 : 0;
                const key = `SHELF-${row}-${seg}`;
                existingOverrides.set(key, {
                  role: panel.role,
                  index: row,
                  overrides: panel.positionOverrides,
                  useCustomPosition: panel.useCustomPosition,
                });
              }
            }
          } else if (panel.role === 'DIVIDER') {
            // Check if this is a Sub divider (partial divider)
            const isSubDivider = panel.name.startsWith('Sub');

            if (isSubDivider) {
              // This is a Sub divider - preserve it completely
              partialPanels.push({ ...panel });
            } else {
              // Main divider - preserve overrides
              existingOverrides.set(`DIVIDER-${dividerIndex}`, {
                role: panel.role,
                index: dividerIndex,
                overrides: panel.positionOverrides,
                useCustomPosition: panel.useCustomPosition,
                xPosition: panel.position[0],
              });
              dividerIndex++;
            }
          }
        });

        const newPanels = generatePanels(
          cabinet.dimensions,
          cabinet.structure,
          cabinet.materials.defaultCore,
          cabinet.materials.defaultSurface,
          cabinet.materials.defaultEdge,
          existingOverrides
        );

        // Recalculate partial panel dimensions based on new compartment boundaries
        // First, find the new full-height divider X positions (column boundaries)
        const fullHeightDividers = newPanels
          .filter(p => p.role === 'DIVIDER' && p.finishHeight >= usableHeight * 0.8)
          .sort((a, b) => a.position[0] - b.position[0]);
        const dividerXPositions = fullHeightDividers.map(p => p.position[0]);

        // Find the new full-width shelf Y positions (row boundaries)
        const fullWidthShelves = newPanels
          .filter(p => p.role === 'SHELF' && p.finishWidth >= usableWidth * 0.8)
          .sort((a, b) => a.position[1] - b.position[1]);
        const shelfYPositions = fullWidthShelves.map(p => p.position[1]);

        // Update partial panels to match new compartment sizes
        partialPanels.forEach(panel => {
          const panelX = panel.position[0];
          const panelY = panel.position[1];

          if (panel.role === 'DIVIDER') {
            // Partial divider - find which compartment (row) it belongs to
            // and update its height to match the new compartment height

            // Find row boundaries based on Y position
            let rowBottomY = Leg + T; // Bottom of cabinet
            let rowTopY = Leg + H - T; // Top of cabinet

            for (let i = 0; i < shelfYPositions.length; i++) {
              if (shelfYPositions[i] < panelY) {
                rowBottomY = shelfYPositions[i] + T / 2;
              } else {
                rowTopY = shelfYPositions[i] - T / 2;
                break;
              }
            }

            // Update divider height and Y position
            const newHeight = rowTopY - rowBottomY;
            const newY = (rowBottomY + rowTopY) / 2;

            panel.finishHeight = newHeight;
            panel.position = [panelX, newY, panel.position[2]];

            // Update computed values
            panel.computed.cutHeight = newHeight;
            panel.computed.surfaceArea = (panel.finishWidth * newHeight) / 1000000;
          } else if (panel.role === 'SHELF') {
            // Partial shelf - find which sub-compartment it belongs to
            // and update its width to match

            // Find column boundaries based on X position
            let colLeftX = -W / 2 + T;
            let colRightX = W / 2 - T;

            for (let i = 0; i < dividerXPositions.length; i++) {
              if (dividerXPositions[i] < panelX) {
                colLeftX = dividerXPositions[i] + T / 2;
              } else {
                colRightX = dividerXPositions[i] - T / 2;
                break;
              }
            }

            // Check for partial dividers that might further subdivide this column
            // Find partial dividers in this column that are at the same vertical level
            const partialDividersInColumn = partialPanels.filter(p => {
              if (p.role !== 'DIVIDER') return false;
              const divX = p.position[0];
              return divX > colLeftX && divX < colRightX;
            });

            // Adjust bounds based on partial dividers
            partialDividersInColumn.forEach(pd => {
              const pdX = pd.position[0];
              if (pdX < panelX && pdX > colLeftX) {
                colLeftX = pdX + T / 2;
              } else if (pdX > panelX && pdX < colRightX) {
                colRightX = pdX - T / 2;
              }
            });

            // Update shelf width and X position
            const newWidth = colRightX - colLeftX - 2; // Small clearance
            const newX = (colLeftX + colRightX) / 2;

            panel.finishWidth = newWidth;
            panel.position = [newX, panelY, panel.position[2]];

            // Update computed values
            panel.computed.cutWidth = newWidth;
            panel.computed.surfaceArea = (newWidth * panel.finishHeight) / 1000000;
          }
        });

        // Add back the partial panels (now with updated dimensions)
        newPanels.push(...partialPanels);

        // ========== DRAWER PANEL GENERATION ==========
        // Generate drawer panels if drawer config is enabled
        if (cabinet.structure.drawerConfig?.hasDrawers) {
          const drawerConfig = cabinet.structure.drawerConfig;

          // Calculate material properties for drawer generation
          const coreMaterial = CORE_MATERIALS[cabinet.materials.defaultCore as keyof typeof CORE_MATERIALS] || CORE_MATERIALS['core-pb-16'];
          const surfaceMaterial = SURFACE_MATERIALS[cabinet.materials.defaultSurface as keyof typeof SURFACE_MATERIALS] || SURFACE_MATERIALS['surf-mel-white'];
          const edgeMaterial = EDGE_MATERIALS[cabinet.materials.defaultEdge as keyof typeof EDGE_MATERIALS] || EDGE_MATERIALS['edge-pvc-white-10'];

          const cabinetPanelThickness = calculateRealThickness(
            coreMaterial.thickness,
            surfaceMaterial.thickness,
            surfaceMaterial.thickness,
            0
          );

          const backObstruction = (cabinet.structure.backPanelConstruction === 'inset')
            ? MANUFACTURING_PARAMS.backVoid + MANUFACTURING_PARAMS.backThickness
            : MANUFACTURING_PARAMS.backThickness;

          const materialProps: DrawerMaterialProps = {
            edgeThickness: edgeMaterial.thickness,
            cabinetPanelThickness,
            backObstruction,
          };

          const drawerResult = generateDrawerPanels({
            dimensions: cabinet.dimensions,
            structure: cabinet.structure,
            frontCoreId: cabinet.materials.defaultCore,
            frontSurfaceId: cabinet.materials.defaultSurface,
            edgeId: cabinet.materials.defaultEdge,
            materialProps,
          });

          // Add drawer panels to the panel list
          newPanels.push(...drawerResult.panels);
        }

        // Generate door panels if enabled
        if (cabinet.structure.doorConfig?.hasDoors) {
          // Get material info for door calculation
          const coreMaterial = CORE_MATERIALS[cabinet.materials.defaultCore as keyof typeof CORE_MATERIALS] || CORE_MATERIALS['core-pb-16'];
          const surfaceMaterial = SURFACE_MATERIALS[cabinet.materials.defaultSurface as keyof typeof SURFACE_MATERIALS] || SURFACE_MATERIALS['surf-mel-white'];
          const edgeMaterial = EDGE_MATERIALS[cabinet.materials.defaultEdge as keyof typeof EDGE_MATERIALS] || EDGE_MATERIALS['edge-pvc-white-10'];

          const cabinetPanelThickness = calculateRealThickness(
            coreMaterial.thickness,
            surfaceMaterial.thickness,
            surfaceMaterial.thickness,
            0
          );

          const doorMaterialProps: DoorMaterialProps = {
            edgeThickness: edgeMaterial.thickness,
            cabinetPanelThickness,
          };

          const doorResult = generateDoorPanels({
            dimensions: cabinet.dimensions,
            structure: cabinet.structure,
            coreId: cabinet.materials.defaultCore,
            surfaceId: cabinet.materials.defaultSurface,
            edgeId: cabinet.materials.defaultEdge,
            materialProps: doorMaterialProps,
          });

          // Add door panels to the panel list
          newPanels.push(...doorResult.panels);
        }

        // PHASE 3: Update cabinet in array (truth) then sync UI pointer
        cabinet.panels = newPanels;
        cabinet.computed = calculateTotals(newPanels);
        cabinet.updatedAt = Date.now();

        // Sync UI pointer to truth object
        state.cabinet = cabinet;
      });
    },
  }))
);

// Selector hooks
export const useCabinet = () => useCabinetStore((s) => s.cabinet);
export const useSelectedPanel = () => {
  const cabinet = useCabinetStore((s) => s.cabinet);
  const selectedId = useCabinetStore((s) => s.selectedPanelId);
  return cabinet?.panels.find(p => p.id === selectedId) || null;
};

/**
 * T017: Optimized selector for active cabinet from array
 *
 * Uses reference equality on the cabinet object itself, not the array.
 * This prevents re-renders when OTHER cabinets change - only triggers
 * when the ACTIVE cabinet's data actually changes.
 */
export const useActiveCabinetFromArray = () => {
  return useCabinetStore((s) => {
    if (!s.activeCabinetId) return null;
    return s.cabinets.find((c) => c.id === s.activeCabinetId) || null;
  });
};

/**
 * T017: Selector to get a specific cabinet by ID without array subscription
 */
export const useCabinetById = (cabinetId: string | null) => {
  return useCabinetStore((s) => {
    if (!cabinetId) return null;
    return s.cabinets.find((c) => c.id === cabinetId) || null;
  });
};

// ============================================
// T017: PERFORMANCE UTILITIES
// ============================================

/**
 * T017: Shallow equality comparator for Zustand selectors
 *
 * Use with selectors that return new objects/arrays to prevent
 * unnecessary re-renders. Compares top-level keys only.
 *
 * @example
 * const dims = useCabinetStore(s => s.cabinet?.dimensions, shallowEqual);
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}

/**
 * T017: Memoized computed totals selector
 *
 * Returns computed totals (cost, CO2, panel count, surface area, edge length)
 * with shallow equality comparison to prevent re-renders when values haven't changed.
 */
export const useCabinetComputed = () => {
  return useCabinetStore(
    (s) => s.cabinet?.computed ?? { totalCost: 0, totalCO2: 0, panelCount: 0, totalSurfaceArea: 0, totalEdgeLength: 0 },
    shallowEqual
  );
};

/**
 * T017: Memoized dimensions selector with shallow equality
 */
export const useCabinetDimensions = () => {
  return useCabinetStore(
    (s) => s.cabinet?.dimensions ?? null,
    shallowEqual
  );
};

/**
 * T017: Memoized structure selector with shallow equality
 */
export const useCabinetStructure = () => {
  return useCabinetStore(
    (s) => s.cabinet?.structure ?? null,
    shallowEqual
  );
};

/**
 * T017: Panel count selector - lightweight for badge/count displays
 */
export const usePanelCount = () => {
  return useCabinetStore((s) => s.cabinet?.panels.length ?? 0);
};

/**
 * T017: Performance diagnostics - measures recalculate time
 *
 * Wraps the store's recalculate() with timing instrumentation.
 * Call this once during development to monitor performance.
 *
 * @example
 * // In development only
 * if (import.meta.env.DEV) {
 *   enablePerformanceMonitoring();
 * }
 */
let _perfMonitoringEnabled = false;
export function enablePerformanceMonitoring(): void {
  if (_perfMonitoringEnabled) return;
  _perfMonitoringEnabled = true;

  const originalRecalculate = useCabinetStore.getState().recalculate;
  const wrappedRecalculate = () => {
    const start = performance.now();
    originalRecalculate();
    const elapsed = performance.now() - start;
    if (elapsed > 16) {
      console.warn(`[Perf] recalculate took ${elapsed.toFixed(1)}ms (exceeds 16ms frame budget)`);
    } else if (elapsed > 5) {
      console.log(`[Perf] recalculate: ${elapsed.toFixed(1)}ms`);
    }
  };

  // Patch the store action
  useCabinetStore.setState({ recalculate: wrappedRecalculate } as any);
}
