/**
 * Machine Profiles + Tool Table
 *
 * Step 10.5: CNC machine configurations for G-code generation
 *
 * Machine profiles define:
 * - Coordinate system (units, safe Z, rapid rates)
 * - Spindle control (M-codes, RPM range)
 * - Feed rate limits
 * - Post-processor formatting
 *
 * Tool table defines:
 * - Available tools (tool number, diameter, type)
 * - Recommended feeds/speeds per material
 * - Max depth of cut
 */

// ============================================================================
// Types
// ============================================================================

export type Units = 'MM' | 'INCH';

export type ToolType = 'ENDMILL' | 'DRILL' | 'VBIT';

export interface Tool {
  toolNo: number;
  diaMm: number;
  type: ToolType;
  flutes: number;
  maxDocMm: number;       // Max depth of cut per pass
  defaultRpm: number;
  defaultFeedMm: number;  // mm/min
  description: string;
}

export interface MachineProfile {
  id: 'KDT_MVP' | 'HOMAG_MVP';
  units: Units;
  safeZMm: number;          // Z height for rapids (above material)
  rapidFeedMm: number;      // Rapid traverse rate (G0)
  maxSpindleRpm: number;
  minSpindleRpm: number;
  spindleOnCode: string;    // e.g., 'M3'
  spindleOffCode: string;   // e.g., 'M5'
  coolantOnCode?: string;   // e.g., 'M8'
  coolantOffCode?: string;  // e.g., 'M9'
  programStart: string[];   // Header lines
  programEnd: string[];     // Footer lines
  lineNumbering: boolean;   // Whether to use N-codes
  decimalPlaces: number;    // Coordinate precision
  commentStyle: 'PAREN' | 'SEMICOLON';  // (comment) vs ; comment
}

// ============================================================================
// KDT MVP Profile (Entry-level CNC Router)
// ============================================================================

export const KDT_MVP_PROFILE: MachineProfile = {
  id: 'KDT_MVP',
  units: 'MM',
  safeZMm: 15,
  rapidFeedMm: 10000,
  maxSpindleRpm: 24000,
  minSpindleRpm: 6000,
  spindleOnCode: 'M3',
  spindleOffCode: 'M5',
  coolantOnCode: undefined,  // No coolant on this machine
  coolantOffCode: undefined,
  programStart: [
    '%',
    'O0001',
    '(IIMOS EXPORT)',
    'G21 (Units: mm)',
    'G90 (Absolute positioning)',
    'G17 (XY plane)',
    'G40 (Cancel cutter comp)',
    'G49 (Cancel tool length comp)',
    'G80 (Cancel canned cycles)',
  ],
  programEnd: [
    'M5 (Spindle off)',
    'G28 Z0 (Return Z home)',
    'G28 X0 Y0 (Return XY home)',
    'M30 (Program end)',
    '%',
  ],
  lineNumbering: true,
  decimalPlaces: 3,
  commentStyle: 'PAREN',
};

// ============================================================================
// HOMAG MVP Profile (Higher-end CNC)
// ============================================================================

export const HOMAG_MVP_PROFILE: MachineProfile = {
  id: 'HOMAG_MVP',
  units: 'MM',
  safeZMm: 20,
  rapidFeedMm: 15000,
  maxSpindleRpm: 24000,
  minSpindleRpm: 8000,
  spindleOnCode: 'M3',
  spindleOffCode: 'M5',
  coolantOnCode: 'M8',
  coolantOffCode: 'M9',
  programStart: [
    '%',
    'O0001',
    '(IIMOS HOMAG EXPORT)',
    'G21',
    'G90',
    'G17',
    'G40',
    'G49',
    'G80',
  ],
  programEnd: [
    'M9',
    'M5',
    'G28 Z0',
    'G28 X0 Y0',
    'M30',
    '%',
  ],
  lineNumbering: true,
  decimalPlaces: 3,
  commentStyle: 'PAREN',
};

// ============================================================================
// Default Tool Table
// ============================================================================

export const DEFAULT_TOOL_TABLE: Tool[] = [
  {
    toolNo: 1,
    diaMm: 6,
    type: 'ENDMILL',
    flutes: 2,
    maxDocMm: 8,
    defaultRpm: 18000,
    defaultFeedMm: 3000,
    description: '6mm Flat End Mill (Profile/Pocket)',
  },
  {
    toolNo: 2,
    diaMm: 3,
    type: 'ENDMILL',
    flutes: 2,
    maxDocMm: 5,
    defaultRpm: 18000,
    defaultFeedMm: 2000,
    description: '3mm Flat End Mill (Kerf/Fine)',
  },
  {
    toolNo: 3,
    diaMm: 8,
    type: 'DRILL',
    flutes: 2,
    maxDocMm: 30,
    defaultRpm: 6000,
    defaultFeedMm: 1500,
    description: '8mm Drill (Dowel holes)',
  },
  {
    toolNo: 4,
    diaMm: 5,
    type: 'DRILL',
    flutes: 2,
    maxDocMm: 25,
    defaultRpm: 8000,
    defaultFeedMm: 1200,
    description: '5mm Drill (System32 holes)',
  },
  {
    toolNo: 5,
    diaMm: 35,
    type: 'DRILL',
    flutes: 2,
    maxDocMm: 15,
    defaultRpm: 3000,
    defaultFeedMm: 500,
    description: '35mm Forstner (Hinge cups)',
  },
  {
    toolNo: 6,
    diaMm: 6,
    type: 'VBIT',
    flutes: 2,
    maxDocMm: 3,
    defaultRpm: 15000,
    defaultFeedMm: 2500,
    description: '90° V-Bit (Chamfer/Engrave)',
  },
];

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get machine profile by ID.
 */
export function getMachineProfile(id: MachineProfile['id']): MachineProfile {
  switch (id) {
    case 'KDT_MVP':
      return KDT_MVP_PROFILE;
    case 'HOMAG_MVP':
      return HOMAG_MVP_PROFILE;
    default:
      throw new Error(`Unknown machine profile: ${id}`);
  }
}

/**
 * Find tool by number in tool table.
 */
export function getToolByNumber(
  toolNo: number,
  toolTable: Tool[] = DEFAULT_TOOL_TABLE
): Tool | undefined {
  return toolTable.find(t => t.toolNo === toolNo);
}

/**
 * Find best tool for a given diameter and type.
 */
export function findToolByDiameter(
  diaMm: number,
  type: ToolType,
  toolTable: Tool[] = DEFAULT_TOOL_TABLE
): Tool | undefined {
  // Exact match first
  const exact = toolTable.find(t => t.diaMm === diaMm && t.type === type);
  if (exact) return exact;

  // Find smallest tool >= requested diameter
  const candidates = toolTable
    .filter(t => t.type === type && t.diaMm >= diaMm)
    .sort((a, b) => a.diaMm - b.diaMm);

  return candidates[0];
}

/**
 * Get recommended tool number for operation type.
 */
export function getDefaultToolForOperation(
  opKind: 'PROFILE' | 'POCKET' | 'DRILL' | 'GROOVE' | 'KERF',
  toolTable: Tool[] = DEFAULT_TOOL_TABLE
): Tool | undefined {
  switch (opKind) {
    case 'PROFILE':
    case 'POCKET':
      return toolTable.find(t => t.type === 'ENDMILL' && t.diaMm === 6);
    case 'DRILL':
      return toolTable.find(t => t.type === 'DRILL' && t.diaMm === 5);
    case 'GROOVE':
    case 'KERF':
      return toolTable.find(t => t.type === 'ENDMILL' && t.diaMm === 3);
    default:
      return undefined;
  }
}

/**
 * Calculate feed rate based on chip load.
 * Feed = RPM × Flutes × ChipLoad
 */
export function calculateFeedRate(
  rpm: number,
  flutes: number,
  chipLoadMm: number
): number {
  return Math.round(rpm * flutes * chipLoadMm);
}

/**
 * Calculate RPM from surface speed.
 * RPM = (SFM × 3.82) / Diameter (for mm)
 */
export function calculateRpm(
  surfaceSpeedMpm: number,  // meters per minute
  diameterMm: number
): number {
  return Math.round((surfaceSpeedMpm * 1000) / (Math.PI * diameterMm));
}

// ============================================================================
// Material-Specific Defaults
// ============================================================================

export interface MaterialFeedSpeed {
  material: string;
  chipLoadMm: number;
  surfaceSpeedMpm: number;
  notes?: string;
}

export const MATERIAL_DEFAULTS: MaterialFeedSpeed[] = [
  {
    material: 'MDF',
    chipLoadMm: 0.15,
    surfaceSpeedMpm: 300,
    notes: 'Dust collection required',
  },
  {
    material: 'PARTICLE_BOARD',
    chipLoadMm: 0.12,
    surfaceSpeedMpm: 250,
    notes: 'Reduce speed for melamine coating',
  },
  {
    material: 'PLYWOOD',
    chipLoadMm: 0.10,
    surfaceSpeedMpm: 200,
    notes: 'Climb milling recommended for clean edges',
  },
  {
    material: 'HARDWOOD',
    chipLoadMm: 0.08,
    surfaceSpeedMpm: 150,
    notes: 'Multiple passes for deep cuts',
  },
  {
    material: 'SOFTWOOD',
    chipLoadMm: 0.12,
    surfaceSpeedMpm: 250,
  },
  {
    material: 'ACRYLIC',
    chipLoadMm: 0.05,
    surfaceSpeedMpm: 100,
    notes: 'Single flute recommended, avoid melting',
  },
];

/**
 * Get feed/speed recommendations for material.
 */
export function getMaterialDefaults(
  material: string
): MaterialFeedSpeed | undefined {
  return MATERIAL_DEFAULTS.find(
    m => m.material.toUpperCase() === material.toUpperCase()
  );
}
