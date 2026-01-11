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
  CabinetType,
  JointType,
  PanelRole,
  DEFAULT_DIMENSIONS,
  DEFAULT_STRUCTURE,
  DEFAULT_MANUFACTURING,
  calculateRealThickness,
  calculateCutSize,
  createId,
} from '../types/Cabinet';

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
    thickness: 12,
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
    thickness: 12,
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
    thickness: 12,
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
    thickness: 12,
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
    thickness: 12,
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
    thickness: 12,
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
    thickness: 12,
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
    thickness: 12,
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
    thickness: 12,
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
    thickness: 12,
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
    thickness: 12,
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
    thickness: 12,
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
    thickness: 12,
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
    thickness: 12,
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
    thickness: 12,
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
    textureUrl: '/textures/materials/428c5e7db15f9ac1df0adaa31089124a.jpg',
  },
  'edge-abs-ash-silver-10': {
    id: 'edge-abs-ash-silver-10',
    name: 'ABS Silver Ash 1.0mm',
    code: 'ABS-SA-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 24,
    color: '#8a8a8a',
    textureUrl: '/textures/materials/ae7ac17779fa6e250256872104665661.jpg',
  },
  'edge-abs-walnut-dark-10': {
    id: 'edge-abs-walnut-dark-10',
    name: 'ABS Dark Walnut 1.0mm',
    code: 'ABS-DW-1.0',
    thickness: 1.0,
    height: 23,
    costPerMeter: 28,
    color: '#5a4a3a',
    textureUrl: '/textures/materials/6ec338abc60c08cd95f6fc5c011f60d5.jpg',
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
    textureUrl: '/textures/materials/9880503b9bc4fab08417c0ce7c618301.jpg',
  },
  'edge-hpl-walnut-08': {
    id: 'edge-hpl-walnut-08',
    name: 'HPL Walnut Edge 0.8mm',
    code: 'HPL-WAL-0.8',
    thickness: 0.8,
    height: 23,
    costPerMeter: 38,
    color: '#5D4037',
    textureUrl: '/textures/materials/6ca1ee6c8d4e09b967824c7580f4471b.jpg',
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
    textureUrl: '/textures/materials/9880503b9bc4fab08417c0ce7c618301.jpg',
  },
  'edge-wood-walnut-30': {
    id: 'edge-wood-walnut-30',
    name: 'Solid Walnut Edge 3.0mm',
    code: 'WOOD-WAL-3.0',
    thickness: 3.0,
    height: 23,
    costPerMeter: 95,
    color: '#5D4037',
    textureUrl: '/textures/materials/6ca1ee6c8d4e09b967824c7580f4471b.jpg',
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
const SURFACE_MATERIALS = SURFACE_MATERIALS_CATALOG;
const EDGE_MATERIALS = EDGE_MATERIALS_CATALOG;

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
  defaultEdgeId: string
): CabinetPanel[] {
  const panels: CabinetPanel[] = [];
  const { width: W, height: H, depth: D, toeKickHeight: Leg } = dimensions;
  
  // Get material properties
  const core = CORE_MATERIALS[defaultCoreId as keyof typeof CORE_MATERIALS] || CORE_MATERIALS['core-pb-16'];
  const surface = SURFACE_MATERIALS[defaultSurfaceId as keyof typeof SURFACE_MATERIALS] || SURFACE_MATERIALS['surf-mel-white'];
  const edge = EDGE_MATERIALS[defaultEdgeId as keyof typeof EDGE_MATERIALS] || EDGE_MATERIALS['edge-pvc-white-10'];
  const ET = edge.thickness; // Edge thickness
  
  // 1. MATERIAL PHYSICS: Calculate real thickness
  const T_real = calculateRealThickness(
    core.thickness, 
    surface.thickness, 
    surface.thickness, 
    MANUFACTURING_PARAMS.glueThickness
  );
  const T = T_real; // Use real thickness for position calculations
  
  // 2. BACK PANEL LOGIC: Calculate BackObstruction
  const backObstruction = (MANUFACTURING_PARAMS.backPanelConstruction === 'inset')
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
  const makeEdges = (front: boolean, back: boolean, top: boolean, bottom: boolean) => ({
    top: front ? defaultEdgeId : null,    // "top" in edge config = front edge of panel
    bottom: back ? defaultEdgeId : null,  // "bottom" = back edge
    left: top ? defaultEdgeId : null,     // "left" = top edge
    right: bottom ? defaultEdgeId : null, // "right" = bottom edge
  });
  
  // Cabinet body height (excluding toe kick)
  const bodyH = H - Leg;
  
  // ========== LEFT SIDE & RIGHT SIDE ==========
  // Joint type determines construction:
  // - OVERLAY: Top/Bottom sit ON TOP of sides → Side is SHORTER
  // - INSET: Top/Bottom fit BETWEEN sides → Side is FULL HEIGHT
  
  // Width (depth direction): always subtract front edge only
  const sideW = D - ET;
  
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
  
  // Calculate side height
  let sideH = bodyH - topReduction - bottomReduction;  // หักความหนา Top/Bottom ถ้า OVERLAY
  if (hasTopEdge) sideH -= ET;      // หัก edge บน (only for INSET)
  if (hasBottomEdge) sideH -= ET;   // หัก edge ล่าง (only for INSET)
  
  // Edge thicknesses for cut calculation
  const sideEdgeTop = hasTopEdge ? ET : 0;
  const sideEdgeBottom = hasBottomEdge ? ET : 0;
  
  // Y position: center of side panel
  // For OVERLAY: side starts above bottom panel, ends below top panel
  const sideYOffset = (bottomReduction - topReduction) / 2;
  const sideY = bodyH/2 + Leg + sideYOffset;
  
  panels.push({
    id: createId(),
    role: 'LEFT_SIDE',
    name: 'Left Side',
    finishWidth: sideW,
    finishHeight: sideH,
    coreMaterialId: defaultCoreId,
    faces: { faceA: defaultSurfaceId, faceB: null },
    edges: {
      top: defaultEdgeId,  // front edge (always)
      bottom: null,        // no back edge
      left: hasTopEdge ? defaultEdgeId : null,   // top edge (only INSET)
      right: hasBottomEdge ? defaultEdgeId : null, // bottom edge (only INSET)
    },
    grainDirection: 'VERTICAL',
    computed: computePanel(sideW, sideH, ET, 0, sideEdgeTop, sideEdgeBottom),
    position: [-W/2 + T/2, sideY, -ET/2],
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
    edges: {
      top: defaultEdgeId,
      bottom: null,
      left: hasTopEdge ? defaultEdgeId : null,
      right: hasBottomEdge ? defaultEdgeId : null,
    },
    grainDirection: 'VERTICAL',
    computed: computePanel(sideW, sideH, ET, 0, sideEdgeTop, sideEdgeBottom),
    position: [W/2 - T/2, sideY, -ET/2],
    rotation: [0, 0, 0],
    visible: true,
    selected: false,
  });
  
  // ========== TOP PANEL ==========
  // For INSET joint: fits between sides
  // Edges: Front only
  const topBaseW = structure.topJoint === 'INSET' ? W - (2 * T) : W;
  const topW = topBaseW;      // No side edges on horizontal panels
  const topH = D - ET;        // Depth - front edge
  
  // Top Y position:
  // INSET: Top fits between sides, center at bodyH - T/2
  // OVERLAY: Top sits ON TOP of sides, center at bodyH - topReduction + T/2
  //          (sides end at bodyH - topReduction, top sits on that)
  const topY = structure.topJoint === 'INSET' 
    ? bodyH - T/2 + Leg                           // INSET: between sides
    : bodyH - topReduction + T/2 + Leg;           // OVERLAY: on top of sides
  
  panels.push({
    id: createId(),
    role: 'TOP',
    name: 'Top Panel',
    finishWidth: topW,
    finishHeight: topH,
    coreMaterialId: defaultCoreId,
    faces: { faceA: defaultSurfaceId, faceB: null },
    edges: makeEdges(true, false, false, false), // Only front edge
    grainDirection: 'HORIZONTAL',
    computed: computePanel(topW, topH, ET, 0, 0, 0),
    position: [0, topY, -ET/2],
    rotation: [0, 0, 0],
    visible: true,
    selected: false,
  });
  
  // ========== BOTTOM PANEL ==========
  const bottomBaseW = structure.bottomJoint === 'INSET' ? W - (2 * T) : W;
  const bottomW = bottomBaseW;
  const bottomH = D - ET;
  
  // Bottom Y position:
  // INSET: Bottom fits between sides, center at T/2
  // OVERLAY: Bottom sits under sides, center at bottomReduction - T/2
  //          (sides start at bottomReduction, bottom sits below that)
  const bottomY = structure.bottomJoint === 'INSET'
    ? T/2 + Leg                                   // INSET: between sides
    : bottomReduction - T/2 + Leg;                // OVERLAY: under sides
  
  panels.push({
    id: createId(),
    role: 'BOTTOM',
    name: 'Bottom Panel',
    finishWidth: bottomW,
    finishHeight: bottomH,
    coreMaterialId: defaultCoreId,
    faces: { faceA: defaultSurfaceId, faceB: null },
    edges: makeEdges(true, false, false, false),
    grainDirection: 'HORIZONTAL',
    computed: computePanel(bottomW, bottomH, ET, 0, 0, 0),
    position: [0, bottomY, -ET/2],
    rotation: [0, 0, 0],
    visible: true,
    selected: false,
  });
  
  // ========== BACK PANEL ==========
  if (structure.hasBackPanel) {
    const backCore = CORE_MATERIALS['core-mdf-6'];
    const backT = backCore.thickness;
    const groove = MANUFACTURING_PARAMS.grooveDepth;
    const clearance = MANUFACTURING_PARAMS.clearance;
    
    // Back panel fits into grooves
    const backW = (W - 2*T) + (2*groove) - clearance;
    const backH = (bodyH - 2*T) + (2*groove) - clearance;
    
    panels.push({
      id: createId(),
      role: 'BACK',
      name: 'Back Panel',
      finishWidth: backW,
      finishHeight: backH,
      coreMaterialId: 'core-mdf-6',
      faces: { faceA: defaultSurfaceId, faceB: null },
      edges: { top: null, bottom: null, left: null, right: null },
      grainDirection: 'HORIZONTAL',
      computed: {
        realThickness: backT,
        cutWidth: backW,
        cutHeight: backH,
        surfaceArea: (backW * backH) / 1000000 * 2, // Total surface area (both faces)
        edgeLength: 0,
        cost: (backW * backH / 1000000) * backCore.costPerSqm,
        co2: (backW * backH / 1000000) * backCore.co2PerSqm,
      },
      position: [0, bodyH/2 + Leg, -D/2 + structure.backPanelInset],
      rotation: [0, 0, 0],
      visible: true,
      selected: false,
    });
  }
  
  // ========== SHELVES ==========
  // Use depthInternal calculated from Back Panel Logic
  // Shelf Depth = depthInternal - FrontSetback - ET(front edge)
  const shelfW = W - (2 * T) - MANUFACTURING_PARAMS.clearance;  // Side clearance for adjustability
  const shelfD = depthInternal - MANUFACTURING_PARAMS.shelfSetbackFront - ET;
  const usableHeight = bodyH - (2 * T);
  const shelfSpacing = usableHeight / (structure.shelfCount + 1);
  
  for (let i = 0; i < structure.shelfCount; i++) {
    const shelfY = Leg + T + shelfSpacing * (i + 1);
    // Shelf Z position: centered in usable depth area
    const shelfZ = (D/2 - MANUFACTURING_PARAMS.shelfSetbackFront - ET/2) - (shelfD/2);
    
    panels.push({
      id: createId(),
      role: 'SHELF',
      name: `Shelf ${i + 1}`,
      finishWidth: shelfW,
      finishHeight: shelfD,
      coreMaterialId: defaultCoreId,
      faces: { faceA: defaultSurfaceId, faceB: null },
      edges: makeEdges(true, false, false, false), // Only front edge
      grainDirection: 'HORIZONTAL',
      computed: computePanel(shelfW, shelfD, ET, 0, 0, 0),
      position: [0, shelfY, shelfZ],
      rotation: [0, 0, 0],
      visible: true,
      selected: false,
    });
  }
  
  // ========== DIVIDERS ==========
  // Divider Depth = depthInternal (no front setback for dividers)
  // Only front edge
  if (structure.dividerCount > 0) {
    const dividerSpacing = (W - 2*T) / (structure.dividerCount + 1);
    const dividerH = usableHeight;
    const dividerD = depthInternal - ET;  // Full internal depth minus front edge
    
    for (let i = 0; i < structure.dividerCount; i++) {
      const dividerX = -W/2 + T + dividerSpacing * (i + 1);
      // Divider Z: starts from front with edge, extends back
      const dividerZ = (D/2 - ET/2) - (dividerD/2);
      
      panels.push({
        id: createId(),
        role: 'DIVIDER',
        name: `Divider ${i + 1}`,
        finishWidth: dividerD,
        finishHeight: dividerH,
        coreMaterialId: defaultCoreId,
        faces: { faceA: defaultSurfaceId, faceB: null },
        edges: makeEdges(true, false, false, false), // Only front edge
        grainDirection: 'VERTICAL',
        computed: computePanel(dividerD, dividerH, ET, 0, 0, 0),
        position: [dividerX, bodyH/2 + Leg, dividerZ],
        rotation: [0, 0, 0],
        visible: true,
        selected: false,
      });
    }
  }
  
  return panels;
}

/**
 * Calculate cabinet totals from panels
 */
function calculateTotals(panels: CabinetPanel[]) {
  return {
    totalCost: panels.reduce((sum, p) => sum + p.computed.cost, 0),
    totalCO2: panels.reduce((sum, p) => sum + p.computed.co2, 0),
    panelCount: panels.length,
    totalSurfaceArea: panels.reduce((sum, p) => sum + p.computed.surfaceArea, 0),
    totalEdgeLength: panels.reduce((sum, p) => sum + p.computed.edgeLength, 0),
  };
}

// ============================================
// STORE DEFINITION
// ============================================

interface CabinetState {
  cabinet: Cabinet | null;
  selectedPanelId: string | null;
  
  // Materials library (temporary)
  coreMaterials: typeof CORE_MATERIALS;
  surfaceMaterials: typeof SURFACE_MATERIALS;
  edgeMaterials: typeof EDGE_MATERIALS;
}

interface CabinetActions {
  // Cabinet CRUD
  createCabinet: (type?: CabinetType, name?: string) => void;
  
  // Dimension actions
  setDimension: (key: keyof CabinetDimensions, value: number) => void;
  
  // Structure actions
  setJointType: (position: 'top' | 'bottom', type: JointType) => void;
  setShelfCount: (count: number) => void;
  setDividerCount: (count: number) => void;
  toggleBackPanel: () => void;
  
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
  
  // Per-panel material actions
  updatePanelMaterial: (panelId: string, target: 'core' | 'faceA' | 'faceB', materialId: string) => void;
  updatePanelEdge: (panelId: string, side: 'top' | 'bottom' | 'left' | 'right', edgeId: string | null) => void;
  
  // Recalculation
  recalculate: () => void;
}

type CabinetStore = CabinetState & CabinetActions;

export const useCabinetStore = create<CabinetStore>()(
  immer((set, get) => ({
    // Initial state
    cabinet: null,
    selectedPanelId: null,
    coreMaterials: CORE_MATERIALS,
    surfaceMaterials: SURFACE_MATERIALS,
    edgeMaterials: EDGE_MATERIALS,
    
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
      
      const cabinet: Cabinet = {
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
      };
      
      set({ cabinet });
    },
    
    // ========== DIMENSION ACTIONS ==========
    setDimension: (key, value) => {
      set((state) => {
        if (!state.cabinet) return;
        state.cabinet.dimensions[key] = value;
        state.cabinet.updatedAt = Date.now();
      });
      get().recalculate();
    },
    
    // ========== STRUCTURE ACTIONS ==========
    setJointType: (position, type) => {
      set((state) => {
        if (!state.cabinet) return;
        if (position === 'top') {
          state.cabinet.structure.topJoint = type;
        } else {
          state.cabinet.structure.bottomJoint = type;
        }
        state.cabinet.updatedAt = Date.now();
      });
      get().recalculate();
    },
    
    setShelfCount: (count) => {
      set((state) => {
        if (!state.cabinet) return;
        state.cabinet.structure.shelfCount = Math.max(0, Math.min(10, count));
        state.cabinet.updatedAt = Date.now();
      });
      get().recalculate();
    },
    
    setDividerCount: (count) => {
      set((state) => {
        if (!state.cabinet) return;
        state.cabinet.structure.dividerCount = Math.max(0, Math.min(5, count));
        state.cabinet.updatedAt = Date.now();
      });
      get().recalculate();
    },
    
    toggleBackPanel: () => {
      set((state) => {
        if (!state.cabinet) return;
        state.cabinet.structure.hasBackPanel = !state.cabinet.structure.hasBackPanel;
        state.cabinet.updatedAt = Date.now();
      });
      get().recalculate();
    },
    
    // ========== MATERIAL ACTIONS ==========
    setDefaultCore: (materialId) => {
      set((state) => {
        if (!state.cabinet) return;
        state.cabinet.materials.defaultCore = materialId;
        state.cabinet.updatedAt = Date.now();
      });
      get().recalculate();
    },
    
    setDefaultSurface: (materialId) => {
      set((state) => {
        if (!state.cabinet) return;
        state.cabinet.materials.defaultSurface = materialId;
        state.cabinet.updatedAt = Date.now();
      });
      get().recalculate();
    },
    
    setDefaultEdge: (materialId) => {
      set((state) => {
        if (!state.cabinet) return;
        state.cabinet.materials.defaultEdge = materialId;

        // Force apply edge material to ALL panels (except back panel)
        state.cabinet.panels.forEach(panel => {
          if (panel.role === 'BACK') return; // Skip back panel

          // Force assign edge material to all sides
          panel.edges = {
            top: materialId,
            bottom: materialId,
            left: materialId,
            right: materialId
          };
        });

        state.cabinet.updatedAt = Date.now();
      });
      get().recalculate();
    },
    
    // ========== PANEL SELECTION ==========
    selectPanel: (panelId) => {
      set({ selectedPanelId: panelId });
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
        if (!state.cabinet) return;
        
        const panel = state.cabinet.panels.find(p => p.id === panelId);
        if (!panel) return;
        
        if (target === 'core') {
          panel.coreMaterialId = materialId;
          // Recalculate panel thickness
          const core = state.coreMaterials[materialId as keyof typeof state.coreMaterials];
          const surface = state.surfaceMaterials[panel.faces?.faceA as keyof typeof state.surfaceMaterials];
          if (core) {
            const surfaceThickness = surface?.thickness || 0;
            panel.computed.realThickness = core.thickness + (surfaceThickness * 2) + 0.2; // 2 faces + glue
          }
        } else if (target === 'faceA') {
          if (!panel.faces) panel.faces = { faceA: null, faceB: null };
          panel.faces.faceA = materialId;
        } else if (target === 'faceB') {
          if (!panel.faces) panel.faces = { faceA: null, faceB: null };
          panel.faces.faceB = materialId;
        }
        
        // Recalculate cabinet totals
        state.cabinet.computed = calculateTotals(state.cabinet.panels);
      });
    },
    
    updatePanelEdge: (panelId, side, edgeId) => {
      set((state) => {
        if (!state.cabinet) return;
        
        const panel = state.cabinet.panels.find(p => p.id === panelId);
        if (!panel) return;
        
        if (!panel.edges) {
          panel.edges = { top: null, bottom: null, left: null, right: null };
        }
        
        panel.edges[side] = edgeId;
        
        // Recalculate cut size based on new edge thicknesses
        const getEdgeThickness = (id: string | null) => {
          if (!id) return 0;
          const edge = state.edgeMaterials[id as keyof typeof state.edgeMaterials];
          return edge?.thickness || 0;
        };
        
        const edgeT = getEdgeThickness(panel.edges.top);
        const edgeB = getEdgeThickness(panel.edges.bottom);
        const edgeL = getEdgeThickness(panel.edges.left);
        const edgeR = getEdgeThickness(panel.edges.right);
        
        // Cut size = Finish - edges + pre-milling
        const preMilling = 0.5;
        panel.computed.cutWidth = panel.finishWidth - edgeL - edgeR + (2 * preMilling);
        panel.computed.cutHeight = panel.finishHeight - edgeT - edgeB + (2 * preMilling);
        
        // Recalculate edge length
        panel.computed.edgeLength = 
          (edgeT > 0 ? panel.finishWidth : 0) +
          (edgeB > 0 ? panel.finishWidth : 0) +
          (edgeL > 0 ? panel.finishHeight : 0) +
          (edgeR > 0 ? panel.finishHeight : 0);
        
        // Recalculate cabinet totals
        state.cabinet.computed = calculateTotals(state.cabinet.panels);
      });
    },
    
    // ========== RECALCULATION ==========
    recalculate: () => {
      set((state) => {
        if (!state.cabinet) return;
        
        const newPanels = generatePanels(
          state.cabinet.dimensions,
          state.cabinet.structure,
          state.cabinet.materials.defaultCore,
          state.cabinet.materials.defaultSurface,
          state.cabinet.materials.defaultEdge
        );
        
        state.cabinet.panels = newPanels;
        state.cabinet.computed = calculateTotals(newPanels);
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
