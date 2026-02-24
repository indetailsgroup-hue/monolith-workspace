/**
 * Designer Intent Types - Thai-localized rule-based system
 *
 * Based on Assembly/Wall System/Day System PDFs logic:
 * - Assembly starts left-to-right
 * - Adjustable feet act as joints
 * - 14mm shelves require dedicated slots
 * - JET flap requires deep shelves
 * - Push-open drawers require sync bar
 *
 * v1.0: Initial types from PDF logic
 */

// ============================================
// CABINET TYPES
// ============================================

export type CabinetTypeIntent = 'BASE' | 'WALL' | 'TALL' | 'CORNER';

export type BaseLogic = 'ADJUSTABLE_FOOT' | 'PLINTH' | 'FLOOR';

export type CompositionDirection = 'LEFT_TO_RIGHT' | 'RIGHT_TO_LEFT';

// ============================================
// RULE CONDITION TYPES
// ============================================

export type CompareOp =
  | 'eq'
  | 'neq'
  | 'in'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'exists';

export type Severity = 'info' | 'warn' | 'block';

export type RuleCategory =
  | 'structural'
  | 'shelf'
  | 'door'
  | 'drawer'
  | 'assembly'
  | 'drilling';

// ============================================
// PANEL TYPES
// ============================================

export type PanelId =
  | 'LEFT_SIDE'
  | 'RIGHT_SIDE'
  | 'TOP'
  | 'BOTTOM'
  | 'BACK'
  | 'SHELF'
  | 'DOOR'
  | 'DRAWER'
  | 'CARCASS';

// ============================================
// DESIGNER INTENT (Input from UI)
// ============================================

export interface ShelfIntent2 {
  enabled: boolean;
  supportType?: 'ADJUSTABLE' | 'FIXED';
  count?: number;
  thickness?: number;
  spanMM?: number;
  midSupport?: boolean;
}

export interface DoorIntentPDF {
  enabled: boolean;
  doorType?: 'SWING' | 'LIFT' | 'FOLD';
  flapSystem?: 'JET' | 'AVENTOS' | 'NONE';
  overlayType?: 'FULL' | 'HALF' | 'INSET';
  doorCount?: number;
  doorHeight?: number;
}

export interface DrawerIntentPDF {
  enabled: boolean;
  drawerCount?: number;
  slideType?: 'UNDERMOUNT' | 'SIDE_MOUNT';
  openMechanism?: 'PUSH_OPEN' | 'HANDLE';
  softClose?: boolean;
  frontHeightMM?: number;
}

/**
 * Designer Intent - User's design requirements (PDF-based structure)
 */
export interface DesignerIntentPDF {
  cabinetType: CabinetTypeIntent;
  compositionDirection: CompositionDirection;
  baseLogic: BaseLogic;
  backPanel: boolean;

  shelf: ShelfIntent2;
  divider: { enabled: boolean };
  door: DoorIntentPDF;
  drawer: DrawerIntentPDF;

  // Optional fields for rule evaluation
  usesSystem32?: boolean;
  connectorType?: 'MINIFIX' | 'DOWEL' | 'SCREW';
  panelThickness?: number;
  dimensions?: {
    width: number;
    height: number;
    depth: number;
  };
}

// ============================================
// RULE DEFINITION TYPES
// ============================================

/**
 * Rule condition - when to apply the rule
 */
export interface RuleCondition {
  path: string;
  op: CompareOp;
  value?: unknown;
}

/**
 * Rule effect - what happens when rule matches
 */
export interface RuleEffect {
  severity: Severity;
  code: string;
  messageTH: string;
  messageEN?: string;
  require?: RuleCondition[];
  set?: { path: string; value: unknown }[];
  derive?: { key: string; value: unknown }[];
}

/**
 * Designer Rule - declarative rule definition
 */
export interface DesignerRulePDF {
  id: string;
  category: RuleCategory;
  when: RuleCondition[];
  then: RuleEffect[];
}

// ============================================
// HARDWARE OUTPUT TYPES
// ============================================

export interface HardwareItemPDF {
  catalogId: string;
  nameTH: string;
  nameEN: string;
  quantity: number;
  noteTH?: string;
}

export interface HardwareSelectionPDF {
  hardware: HardwareItemPDF[];
  notesTH: string[];
}

// ============================================
// DRILLING OUTPUT TYPES
// ============================================

export interface DrillOpPDF {
  panel: PanelId;
  drillType: 'CAM' | 'BOLT' | 'SHELF_PIN' | 'HINGE_CUP' | 'PILOT' | 'GROOVE';
  diameter: number;
  depth: number;
  symbolRef: string;
  notesTH?: string;
}

export interface DrillingPlanPDF {
  operations: DrillOpPDF[];
  notesTH: string[];
  system32?: {
    firstHole: number;
    pitch: number;
  };
}

// ============================================
// ASSEMBLY OUTPUT TYPES
// ============================================

export interface AssemblyStepPDF {
  stepNumber: number;
  action: 'PLACE' | 'ATTACH' | 'INSERT' | 'FLIP' | 'VERIFY' | 'ADJUST';
  panel: PanelId;
  instructionTH: string;
  instructionEN?: string;
  estimatedMinutes: number;
}

export interface AssemblyPlanPDF {
  steps: AssemblyStepPDF[];
  notesTH: string[];
  totalMinutes: number;
  assemblyDirection: 'LEFT_TO_RIGHT' | 'RIGHT_TO_LEFT';
}

// ============================================
// EVALUATION OUTPUT TYPE
// ============================================

/**
 * Complete evaluation result
 */
export interface DesignerEvaluationPDF {
  intent: DesignerIntentPDF;
  effects: RuleEffect[];
  hardware: HardwareSelectionPDF;
  drilling: DrillingPlanPDF;
  assembly: AssemblyPlanPDF;
  derived: Record<string, unknown>;
  gate: {
    blocked: boolean;
    warnings: string[];
    blocks: string[];
  };
}
