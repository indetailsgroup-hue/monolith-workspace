/**
 * Plasticity-Style Modeling Types
 *
 * Core types for the "Plasticity UX on IIMOS Core" approach.
 * Designer thinks in shapes → System records as Manufacturing Intent
 *
 * v1.0: Initial modeling layer types
 */

// ============================================================================
// Selection Types
// ============================================================================

export type SelectionType = 'none' | 'panel' | 'edge' | 'face' | 'hole' | 'compartment' | 'cabinet';

export interface SelectionTarget {
  type: SelectionType;
  cabinetId: string;
  /** Panel ID if selecting panel/edge/face */
  panelId?: string;
  /** Edge index (0-3 for rectangular panels) */
  edgeIndex?: number;
  /** Face: 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right' */
  face?: 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';
  /** Hole ID if selecting a hole */
  holeId?: string;
  /** Compartment ID */
  compartmentId?: string;
}

// ============================================================================
// Modeling Commands (Plasticity-style)
// ============================================================================

export type ModelingCommand =
  // Edge Operations
  | 'apply-edge-profile'
  | 'bevel-edge'
  | 'chamfer-edge'
  | 'round-edge'
  | 'add-edge-band'
  // Face Operations
  | 'add-groove'
  | 'add-dado'
  | 'add-rabbet'
  | 'apply-pattern'
  // Panel Operations
  | 'add-reveal'
  | 'add-shadow-gap'
  | 'kerf-bend'
  // Wall/Surface Operations
  | 'apply-slat-pattern'
  | 'apply-wainscoting'
  // Hole Operations
  | 'add-shelf-pin-holes'
  | 'add-hinge-bore'
  | 'add-system-hole'
  // General
  | 'duplicate'
  | 'mirror'
  | 'array';

/** Command metadata for Command Palette */
export interface CommandDefinition {
  id: ModelingCommand;
  label: string;
  keywords: string[];
  icon: string;
  /** Required selection type to enable this command */
  requiresSelection: SelectionType[];
  /** Category for grouping */
  category: 'edge' | 'face' | 'panel' | 'hole' | 'pattern' | 'general';
}

/** All available commands */
export const MODELING_COMMANDS: CommandDefinition[] = [
  // Edge Operations
  {
    id: 'apply-edge-profile',
    label: 'Apply Edge Profile',
    keywords: ['profile', 'finger', 'pull', 'edge', 'router'],
    icon: '◗',
    requiresSelection: ['edge'],
    category: 'edge',
  },
  {
    id: 'bevel-edge',
    label: 'Bevel Edge',
    keywords: ['bevel', 'angle', 'chamfer', '45'],
    icon: '◢',
    requiresSelection: ['edge'],
    category: 'edge',
  },
  {
    id: 'chamfer-edge',
    label: 'Chamfer Edge',
    keywords: ['chamfer', 'cut', 'angle'],
    icon: '◣',
    requiresSelection: ['edge'],
    category: 'edge',
  },
  {
    id: 'round-edge',
    label: 'Round Edge (Fillet)',
    keywords: ['round', 'fillet', 'radius', 'smooth'],
    icon: '◠',
    requiresSelection: ['edge'],
    category: 'edge',
  },
  {
    id: 'add-edge-band',
    label: 'Add Edge Banding',
    keywords: ['band', 'edgeband', 'tape', 'pvc', 'abs'],
    icon: '▬',
    requiresSelection: ['edge'],
    category: 'edge',
  },
  // Face Operations
  {
    id: 'add-groove',
    label: 'Add Groove',
    keywords: ['groove', 'slot', 'channel', 'dado'],
    icon: '▭',
    requiresSelection: ['face', 'panel'],
    category: 'face',
  },
  {
    id: 'add-dado',
    label: 'Add Dado',
    keywords: ['dado', 'housing', 'cross', 'groove'],
    icon: '╦',
    requiresSelection: ['face', 'panel'],
    category: 'face',
  },
  {
    id: 'add-rabbet',
    label: 'Add Rabbet',
    keywords: ['rabbet', 'rebate', 'step', 'back'],
    icon: '⌐',
    requiresSelection: ['edge', 'panel'],
    category: 'face',
  },
  {
    id: 'apply-pattern',
    label: 'Apply Surface Pattern',
    keywords: ['pattern', 'texture', 'grid', 'diamond'],
    icon: '▦',
    requiresSelection: ['face', 'panel'],
    category: 'face',
  },
  // Panel Operations
  {
    id: 'add-reveal',
    label: 'Add Reveal',
    keywords: ['reveal', 'gap', 'offset', 'step'],
    icon: '┃',
    requiresSelection: ['panel', 'edge'],
    category: 'panel',
  },
  {
    id: 'add-shadow-gap',
    label: 'Add Shadow Gap',
    keywords: ['shadow', 'gap', 'line', 'reveal'],
    icon: '│',
    requiresSelection: ['panel', 'edge'],
    category: 'panel',
  },
  {
    id: 'kerf-bend',
    label: 'Kerf Bend Panel',
    keywords: ['kerf', 'bend', 'curve', 'flexible'],
    icon: '◜',
    requiresSelection: ['panel'],
    category: 'panel',
  },
  // Pattern Operations
  {
    id: 'apply-slat-pattern',
    label: 'Apply Slat Pattern',
    keywords: ['slat', 'batten', 'vertical', 'horizontal', 'wall'],
    icon: '|||',
    requiresSelection: ['face', 'panel'],
    category: 'pattern',
  },
  {
    id: 'apply-wainscoting',
    label: 'Apply Wainscoting',
    keywords: ['wainscot', 'panel', 'wall', 'classic'],
    icon: '▤',
    requiresSelection: ['face', 'panel'],
    category: 'pattern',
  },
  // Hole Operations
  {
    id: 'add-shelf-pin-holes',
    label: 'Add Shelf Pin Holes',
    keywords: ['shelf', 'pin', 'hole', '32mm', 'system'],
    icon: '○○',
    requiresSelection: ['panel', 'face'],
    category: 'hole',
  },
  {
    id: 'add-hinge-bore',
    label: 'Add Hinge Bore',
    keywords: ['hinge', 'bore', '35mm', 'cup', 'blum'],
    icon: '◎',
    requiresSelection: ['panel'],
    category: 'hole',
  },
  {
    id: 'add-system-hole',
    label: 'Add System Hole',
    keywords: ['system', 'hole', 'dowel', 'cam', 'confirmat'],
    icon: '●',
    requiresSelection: ['panel', 'edge'],
    category: 'hole',
  },
  // General Operations
  {
    id: 'duplicate',
    label: 'Duplicate',
    keywords: ['duplicate', 'copy', 'clone'],
    icon: '⧉',
    requiresSelection: ['panel', 'cabinet', 'compartment'],
    category: 'general',
  },
  {
    id: 'mirror',
    label: 'Mirror',
    keywords: ['mirror', 'flip', 'reflect'],
    icon: '⧎',
    requiresSelection: ['panel', 'cabinet'],
    category: 'general',
  },
  {
    id: 'array',
    label: 'Array / Pattern',
    keywords: ['array', 'repeat', 'pattern', 'multiple'],
    icon: '⋮⋮⋮',
    requiresSelection: ['panel', 'hole', 'compartment'],
    category: 'general',
  },
];

// ============================================================================
// Design Intent Types (What gets recorded)
// ============================================================================

export type DesignIntentType =
  | 'edge-profile'
  | 'edge-band'
  | 'groove'
  | 'dado'
  | 'rabbet'
  | 'reveal'
  | 'shadow-gap'
  | 'kerf-bend'
  | 'hole-pattern'
  | 'surface-pattern';

/** Base design intent */
export interface DesignIntentBase {
  id: string;
  type: DesignIntentType;
  createdAt: string;
  /** Target panel/edge */
  target: SelectionTarget;
}

/** Edge profile intent (finger pull, bevel, etc.) */
export interface EdgeProfileIntent extends DesignIntentBase {
  type: 'edge-profile';
  profileId: string;
  depth: number; // mm
  orientation: 'inward' | 'outward' | 'centered';
  /** Offset from edge start (mm) */
  startOffset?: number;
  /** Length of profile (mm), undefined = full edge */
  length?: number;
}

/** Edge banding intent */
export interface EdgeBandIntent extends DesignIntentBase {
  type: 'edge-band';
  materialId: string;
  thickness: number; // mm (typically 0.4, 1, 2)
  /** Pre-glued or loose */
  preGlued: boolean;
}

/** Groove intent */
export interface GrooveIntent extends DesignIntentBase {
  type: 'groove';
  width: number; // mm
  depth: number; // mm
  /** Distance from reference edge */
  offset: number; // mm
  /** Reference edge index */
  referenceEdge: number;
  /** For back panel groove, etc. */
  purpose?: 'back-panel' | 'shelf-support' | 'decorative';
}

/** Dado intent */
export interface DadoIntent extends DesignIntentBase {
  type: 'dado';
  width: number; // mm
  depth: number; // mm
  /** Position from reference edge */
  position: number; // mm
  /** Orientation */
  orientation: 'horizontal' | 'vertical';
}

/** Rabbet intent */
export interface RabbetIntent extends DesignIntentBase {
  type: 'rabbet';
  width: number; // mm
  depth: number; // mm
  /** Which edges */
  edges: number[]; // edge indices
}

/** Reveal intent */
export interface RevealIntent extends DesignIntentBase {
  type: 'reveal';
  depth: number; // mm
  width: number; // mm (step back)
  edges: number[];
}

/** Shadow gap intent */
export interface ShadowGapIntent extends DesignIntentBase {
  type: 'shadow-gap';
  width: number; // mm
  depth: number; // mm
  /** Position from panel edge */
  position: number; // mm
}

/** Kerf bend intent */
export interface KerfBendIntent extends DesignIntentBase {
  type: 'kerf-bend';
  bendRadius: number; // mm
  bendAngle: number; // degrees
  kerfSpacing: number; // mm (calculated or override)
  kerfDepth: number; // mm
  kerfCount: number;
  /** Kerf pattern type */
  pattern: 'straight' | 'cross-hatch' | 'living-hinge';
}

/** Hole pattern intent */
export interface HolePatternIntent extends DesignIntentBase {
  type: 'hole-pattern';
  holeType: 'shelf-pin' | 'hinge-bore' | 'system-32' | 'dowel' | 'confirmat';
  diameter: number; // mm
  depth: number; // mm
  /** Pattern definition */
  pattern: {
    type: 'line' | 'grid' | 'custom';
    spacing?: number; // mm (for line/grid)
    rows?: number;
    columns?: number;
    positions?: Array<{ x: number; y: number }>; // for custom
  };
  /** Offset from reference */
  offsetX: number;
  offsetY: number;
}

/** Surface pattern intent */
export interface SurfacePatternIntent extends DesignIntentBase {
  type: 'surface-pattern';
  patternType: 'slat' | 'wainscoting' | 'grid' | 'diamond';
  /** Pattern-specific params */
  params: Record<string, number | string>;
}

/** Union of all design intents */
export type DesignIntent =
  | EdgeProfileIntent
  | EdgeBandIntent
  | GrooveIntent
  | DadoIntent
  | RabbetIntent
  | RevealIntent
  | ShadowGapIntent
  | KerfBendIntent
  | HolePatternIntent
  | SurfacePatternIntent;

// ============================================================================
// Profile Library Types
// ============================================================================

/** 2D point for bezier curves */
export interface Point2D {
  x: number;
  y: number;
}

/** Bezier curve segment */
export interface BezierSegment {
  type: 'line' | 'quadratic' | 'cubic';
  points: Point2D[];
}

/** Profile asset for edge profiles */
export interface ProfileAsset {
  id: string;
  name: string;
  /** Display category */
  category: 'finger-pull' | 'reveal' | 'bevel' | 'round' | 'decorative' | 'custom';
  /** 2D curve definition (for preview and CAM) */
  curve2D: BezierSegment[];
  /** Minimum panel thickness required */
  minThickness: number; // mm
  /** Required tool radius (for CAM validation) */
  toolRadius: number; // mm
  /** Is this profile CAM-safe (no undercuts, etc.) */
  camSafe: boolean;
  /** Maximum depth this profile can be applied */
  maxDepth: number; // mm
  /** Thumbnail preview (base64 or URL) */
  thumbnail?: string;
  /** Tags for search */
  tags: string[];
}

/** Built-in profile library */
export const BUILT_IN_PROFILES: ProfileAsset[] = [
  {
    id: 'finger-pull-20',
    name: 'Finger Pull 20mm',
    category: 'finger-pull',
    curve2D: [
      { type: 'line', points: [{ x: 0, y: 0 }, { x: 0, y: -20 }] },
      { type: 'quadratic', points: [{ x: 0, y: -20 }, { x: 10, y: -25 }, { x: 20, y: -20 }] },
      { type: 'line', points: [{ x: 20, y: -20 }, { x: 20, y: 0 }] },
    ],
    minThickness: 16,
    toolRadius: 3,
    camSafe: true,
    maxDepth: 25,
    tags: ['finger', 'pull', 'handle', 'grip'],
  },
  {
    id: 'finger-pull-30',
    name: 'Finger Pull 30mm',
    category: 'finger-pull',
    curve2D: [
      { type: 'line', points: [{ x: 0, y: 0 }, { x: 0, y: -30 }] },
      { type: 'quadratic', points: [{ x: 0, y: -30 }, { x: 15, y: -38 }, { x: 30, y: -30 }] },
      { type: 'line', points: [{ x: 30, y: -30 }, { x: 30, y: 0 }] },
    ],
    minThickness: 18,
    toolRadius: 6,
    camSafe: true,
    maxDepth: 40,
    tags: ['finger', 'pull', 'handle', 'grip', 'large'],
  },
  {
    id: 'shadow-gap-5',
    name: 'Shadow Gap 5mm',
    category: 'reveal',
    curve2D: [
      { type: 'line', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] },
      { type: 'line', points: [{ x: 5, y: 0 }, { x: 5, y: -5 }] },
      { type: 'line', points: [{ x: 5, y: -5 }, { x: 10, y: -5 }] },
    ],
    minThickness: 12,
    toolRadius: 3,
    camSafe: true,
    maxDepth: 5,
    tags: ['shadow', 'gap', 'reveal', 'line'],
  },
  {
    id: 'bevel-45',
    name: 'Bevel 45°',
    category: 'bevel',
    curve2D: [
      { type: 'line', points: [{ x: 0, y: 0 }, { x: 10, y: -10 }] },
    ],
    minThickness: 12,
    toolRadius: 0, // V-bit
    camSafe: true,
    maxDepth: 15,
    tags: ['bevel', '45', 'angle', 'chamfer'],
  },
  {
    id: 'bevel-30',
    name: 'Bevel 30°',
    category: 'bevel',
    curve2D: [
      { type: 'line', points: [{ x: 0, y: 0 }, { x: 5.77, y: -10 }] }, // tan(30°) ≈ 0.577
    ],
    minThickness: 12,
    toolRadius: 0,
    camSafe: true,
    maxDepth: 15,
    tags: ['bevel', '30', 'angle', 'chamfer'],
  },
  {
    id: 'round-3',
    name: 'Round 3mm',
    category: 'round',
    curve2D: [
      { type: 'quadratic', points: [{ x: 0, y: 0 }, { x: 0, y: -3 }, { x: 3, y: -3 }] },
    ],
    minThickness: 12,
    toolRadius: 3,
    camSafe: true,
    maxDepth: 3,
    tags: ['round', 'fillet', 'radius', '3mm'],
  },
  {
    id: 'round-6',
    name: 'Round 6mm',
    category: 'round',
    curve2D: [
      { type: 'quadratic', points: [{ x: 0, y: 0 }, { x: 0, y: -6 }, { x: 6, y: -6 }] },
    ],
    minThickness: 16,
    toolRadius: 6,
    camSafe: true,
    maxDepth: 6,
    tags: ['round', 'fillet', 'radius', '6mm'],
  },
  {
    id: 'j-pull',
    name: 'J-Pull Profile',
    category: 'finger-pull',
    curve2D: [
      { type: 'line', points: [{ x: 0, y: 0 }, { x: 0, y: -15 }] },
      { type: 'cubic', points: [
        { x: 0, y: -15 },
        { x: 0, y: -25 },
        { x: 15, y: -25 },
        { x: 15, y: -15 },
      ]},
      { type: 'line', points: [{ x: 15, y: -15 }, { x: 15, y: 0 }] },
    ],
    minThickness: 18,
    toolRadius: 6,
    camSafe: true,
    maxDepth: 30,
    tags: ['j-pull', 'finger', 'pull', 'modern', 'handle'],
  },
];

// ============================================================================
// Tool State Types
// ============================================================================

export type ActiveToolMode =
  | 'select'
  | 'pan'
  | 'orbit'
  | 'measure'
  | 'edge-profile'
  | 'groove'
  | 'hole'
  | 'pattern';

export interface ToolState {
  mode: ActiveToolMode;
  /** Currently selected profile (for edge-profile mode) */
  selectedProfileId?: string;
  /** Tool-specific parameters */
  params: Record<string, number | string | boolean>;
  /** Preview state */
  previewEnabled: boolean;
}

// ============================================================================
// Import Types (Plasticity/STEP/IGES)
// ============================================================================

export type ImportSourceType = 'plasticity' | 'step' | 'iges' | 'obj' | 'stl';

export type ImportAsType = 'profile' | 'reference-solid' | 'render-mesh';

export interface ImportedGeometry {
  id: string;
  sourceType: ImportSourceType;
  sourceFile: string;
  importedAs: ImportAsType;
  /** SHA-256 hash of source file */
  sourceHash: string;
  /** Original units */
  sourceUnits: 'mm' | 'cm' | 'm' | 'inch';
  /** Import timestamp */
  importedAt: string;
  /** Normalized geometry data */
  geometry: {
    vertices?: Float32Array;
    indices?: Uint32Array;
    curves?: BezierSegment[];
  };
  /** Lock status (can't modify after snapshot) */
  locked: boolean;
}
