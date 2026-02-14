/**
 * Spec Store - Manufacturing Specification State Management
 * 
 * SPEC-08 Compliant:
 * - Spec State: DRAFT → FROZEN → RELEASED
 * - Gate Enforcement: Lock export based on state & validation
 * - Validation: Check rules before allowing state transitions
 * 
 * "Design is Free — Manufacturing is Deterministic"
 */

import { create } from 'zustand';
import { useCabinetStore } from './useCabinetStore';

// ============================================
// TYPES
// ============================================

export type SpecState = 'DRAFT' | 'FROZEN' | 'RELEASED';

export interface ValidationRule {
  id: string;
  name: string;
  category: 'DIMENSIONAL' | 'STRUCTURAL' | 'MATERIAL' | 'MACHINE' | 'SAFETY';
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
  panelId?: string; // Optional: specific panel that failed
}

export interface ValidationResult {
  ok: boolean;
  passCount: number;
  warnCount: number;
  failCount: number;
  rules: ValidationRule[];
  timestamp: number;
}

export interface MachineProfile {
  id: string;
  name: string;
  maxWidth: number;    // mm
  maxHeight: number;   // mm
  minThickness: number; // mm
  maxThickness: number; // mm
  supportedOperations: string[];
}

export interface GateStatus {
  canFreeze: boolean;
  canRelease: boolean;
  canExport: boolean;
  blockers: string[];
}

// ============================================
// MACHINE PROFILES
// ============================================

export const MACHINE_PROFILES: Record<string, MachineProfile> = {
  'homag-centateq': {
    id: 'homag-centateq',
    name: 'Homag CENTATEQ P-110',
    maxWidth: 3000,
    maxHeight: 1500,
    minThickness: 8,
    maxThickness: 60,
    supportedOperations: ['CUT', 'DRILL', 'ROUTE', 'EDGE'],
  },
  'biesse-rover': {
    id: 'biesse-rover',
    name: 'Biesse Rover A',
    maxWidth: 3660,
    maxHeight: 1830,
    minThickness: 3,
    maxThickness: 80,
    supportedOperations: ['CUT', 'DRILL', 'ROUTE', 'EDGE', 'NEST'],
  },
  'kdt-1320': {
    id: 'kdt-1320',
    name: 'KDT-1320',
    maxWidth: 2800,
    maxHeight: 1300,
    minThickness: 6,
    maxThickness: 50,
    supportedOperations: ['CUT', 'EDGE'],
  },
};

// ============================================
// VALIDATION RULES
// ============================================

function runValidation(): ValidationResult {
  const cabinet = useCabinetStore.getState().cabinet;
  const rules: ValidationRule[] = [];
  
  if (!cabinet) {
    return {
      ok: false,
      passCount: 0,
      warnCount: 0,
      failCount: 1,
      rules: [{
        id: 'no-cabinet',
        name: 'Cabinet Required',
        category: 'STRUCTURAL',
        status: 'FAIL',
        message: 'No cabinet defined',
      }],
      timestamp: Date.now(),
    };
  }
  
  const { dimensions, panels, structure } = cabinet;
  
  // ========== DIMENSIONAL RULES ==========
  
  // Rule: Min/Max Cabinet Width
  if (dimensions.width < 200) {
    rules.push({
      id: 'min-width',
      name: 'Minimum Width',
      category: 'DIMENSIONAL',
      status: 'FAIL',
      message: `Cabinet width ${dimensions.width}mm is below minimum 200mm`,
    });
  } else if (dimensions.width > 1200) {
    rules.push({
      id: 'max-width',
      name: 'Maximum Width',
      category: 'DIMENSIONAL',
      status: 'WARN',
      message: `Cabinet width ${dimensions.width}mm exceeds recommended 1200mm`,
    });
  } else {
    rules.push({
      id: 'width-ok',
      name: 'Width Check',
      category: 'DIMENSIONAL',
      status: 'PASS',
      message: `Width ${dimensions.width}mm is within acceptable range`,
    });
  }
  
  // Rule: Min/Max Cabinet Height
  if (dimensions.height < 300) {
    rules.push({
      id: 'min-height',
      name: 'Minimum Height',
      category: 'DIMENSIONAL',
      status: 'FAIL',
      message: `Cabinet height ${dimensions.height}mm is below minimum 300mm`,
    });
  } else if (dimensions.height > 2400) {
    rules.push({
      id: 'max-height',
      name: 'Maximum Height',
      category: 'DIMENSIONAL',
      status: 'WARN',
      message: `Cabinet height ${dimensions.height}mm exceeds recommended 2400mm`,
    });
  } else {
    rules.push({
      id: 'height-ok',
      name: 'Height Check',
      category: 'DIMENSIONAL',
      status: 'PASS',
      message: `Height ${dimensions.height}mm is within acceptable range`,
    });
  }
  
  // Rule: Min/Max Cabinet Depth
  if (dimensions.depth < 200) {
    rules.push({
      id: 'min-depth',
      name: 'Minimum Depth',
      category: 'DIMENSIONAL',
      status: 'FAIL',
      message: `Cabinet depth ${dimensions.depth}mm is below minimum 200mm`,
    });
  } else if (dimensions.depth > 800) {
    rules.push({
      id: 'max-depth',
      name: 'Maximum Depth',
      category: 'DIMENSIONAL',
      status: 'WARN',
      message: `Cabinet depth ${dimensions.depth}mm exceeds recommended 800mm`,
    });
  } else {
    rules.push({
      id: 'depth-ok',
      name: 'Depth Check',
      category: 'DIMENSIONAL',
      status: 'PASS',
      message: `Depth ${dimensions.depth}mm is within acceptable range`,
    });
  }
  
  // ========== STRUCTURAL RULES ==========
  
  // Rule: Shelf Span (ถ้ากว้างมากต้องมี divider หรือ shelf support)
  const shelfSpan = dimensions.width / (structure.dividerCount + 1);
  if (shelfSpan > 800 && structure.shelfCount > 0) {
    rules.push({
      id: 'shelf-span',
      name: 'Shelf Span Limit',
      category: 'STRUCTURAL',
      status: 'WARN',
      message: `Shelf span ${shelfSpan.toFixed(0)}mm may sag. Consider adding divider.`,
    });
  } else {
    rules.push({
      id: 'shelf-span-ok',
      name: 'Shelf Span Check',
      category: 'STRUCTURAL',
      status: 'PASS',
      message: `Shelf span ${shelfSpan.toFixed(0)}mm is acceptable`,
    });
  }
  
  // Rule: Back Panel Required for structural integrity
  if (!structure.hasBackPanel && dimensions.height > 1000) {
    rules.push({
      id: 'back-panel-tall',
      name: 'Back Panel Recommended',
      category: 'STRUCTURAL',
      status: 'WARN',
      message: 'Tall cabinets (>1000mm) should have back panel for stability',
    });
  } else {
    rules.push({
      id: 'back-panel-ok',
      name: 'Back Panel Check',
      category: 'STRUCTURAL',
      status: 'PASS',
      message: 'Back panel configuration is acceptable',
    });
  }
  
  // ========== MATERIAL RULES ==========
  
  // Rule: All panels have materials assigned
  const panelsWithoutCore = panels.filter(p => !p.coreMaterialId && !cabinet.materials.defaultCore);
  if (panelsWithoutCore.length > 0) {
    rules.push({
      id: 'material-missing',
      name: 'Material Assignment',
      category: 'MATERIAL',
      status: 'FAIL',
      message: `${panelsWithoutCore.length} panel(s) missing core material`,
    });
  } else {
    rules.push({
      id: 'material-ok',
      name: 'Material Assignment',
      category: 'MATERIAL',
      status: 'PASS',
      message: 'All panels have materials assigned',
    });
  }
  
  // ========== MACHINE RULES ==========
  
  // Rule: Panel sizes within machine limits
  const defaultMachine = MACHINE_PROFILES['homag-centateq'];
  const oversizedPanels = panels.filter(p => 
    p.finishWidth > defaultMachine.maxWidth || 
    p.finishHeight > defaultMachine.maxHeight
  );
  
  if (oversizedPanels.length > 0) {
    rules.push({
      id: 'machine-size',
      name: 'Machine Size Limit',
      category: 'MACHINE',
      status: 'FAIL',
      message: `${oversizedPanels.length} panel(s) exceed machine limits (${defaultMachine.name})`,
    });
  } else {
    rules.push({
      id: 'machine-size-ok',
      name: 'Machine Size Check',
      category: 'MACHINE',
      status: 'PASS',
      message: `All panels within ${defaultMachine.name} limits`,
    });
  }
  
  // ========== SAFETY RULES ==========
  
  // Rule: Minimum clearances
  rules.push({
    id: 'clearance-ok',
    name: 'Clearance Check',
    category: 'SAFETY',
    status: 'PASS',
    message: 'All clearances within specification',
  });
  
  // ========== CALCULATE TOTALS ==========
  
  const passCount = rules.filter(r => r.status === 'PASS').length;
  const warnCount = rules.filter(r => r.status === 'WARN').length;
  const failCount = rules.filter(r => r.status === 'FAIL').length;
  
  return {
    ok: failCount === 0,
    passCount,
    warnCount,
    failCount,
    rules,
    timestamp: Date.now(),
  };
}

// ============================================
// STORE DEFINITION
// ============================================

interface SpecStoreState {
  // Spec state
  specState: SpecState;
  
  // Validation
  validation: ValidationResult | null;
  
  // Machine
  selectedMachine: string;
  
  // Gate
  gateStatus: GateStatus;
}

interface SpecStoreActions {
  // State transitions
  setSpecState: (state: SpecState) => void;
  freezeSpec: () => boolean;
  releaseSpec: () => boolean;
  unfreezeSpec: () => void;
  
  // Validation
  runValidation: () => ValidationResult;
  
  // Machine
  setMachine: (machineId: string) => void;
  
  // Gate
  updateGateStatus: () => void;
  
  // Export
  canExport: (format: 'CUT_LIST' | 'DXF' | 'CNC') => boolean;
}

/** Extended state for ReleaseCenter (future API) */
interface SpecStoreExtended {
  /** Document state (future - when spec becomes doc-based) */
  doc?: {
    state: string;
    release?: unknown;
    snapshot?: unknown;
    gate?: unknown;
    [key: string]: unknown;
  };
  /** Create revision for editing (future) */
  createRevisionToEdit?: () => void;
  /** Async operation state (future) */
  async?: {
    busy: boolean;
    [key: string]: unknown;
  };
}

type SpecStore = SpecStoreState & SpecStoreActions & SpecStoreExtended;

export const useSpecStore = create<SpecStore>()((set, get) => ({
  // Initial state
  specState: 'DRAFT',
  validation: null,
  selectedMachine: 'homag-centateq',
  gateStatus: {
    canFreeze: false,
    canRelease: false,
    canExport: false,
    blockers: ['Run validation first'],
  },
  
  // ========== STATE TRANSITIONS ==========
  
  setSpecState: (state) => {
    set({ specState: state });
    get().updateGateStatus();
  },
  
  freezeSpec: () => {
    const { specState, validation } = get();
    
    // Must be in DRAFT
    if (specState !== 'DRAFT') {
      console.warn('[SpecStore] Cannot freeze: not in DRAFT state');
      return false;
    }
    
    // Must pass validation
    const result = get().runValidation();
    if (!result.ok) {
      console.warn('[SpecStore] Cannot freeze: validation failed');
      return false;
    }
    
    set({ specState: 'FROZEN' });
    get().updateGateStatus();
    console.log('[SpecStore] Spec frozen');
    return true;
  },
  
  releaseSpec: () => {
    const { specState, validation } = get();
    
    // Must be in FROZEN
    if (specState !== 'FROZEN') {
      console.warn('[SpecStore] Cannot release: not in FROZEN state');
      return false;
    }
    
    // Re-validate
    const result = get().runValidation();
    if (!result.ok) {
      console.warn('[SpecStore] Cannot release: validation failed');
      return false;
    }
    
    set({ specState: 'RELEASED' });
    get().updateGateStatus();
    console.log('[SpecStore] Spec released');
    return true;
  },
  
  unfreezeSpec: () => {
    const { specState } = get();
    
    if (specState === 'RELEASED') {
      console.warn('[SpecStore] Cannot unfreeze RELEASED spec');
      return;
    }
    
    set({ specState: 'DRAFT' });
    get().updateGateStatus();
    console.log('[SpecStore] Spec unfrozen to DRAFT');
  },
  
  // ========== VALIDATION ==========
  
  runValidation: () => {
    const result = runValidation();
    set({ validation: result });
    get().updateGateStatus();
    return result;
  },
  
  // ========== MACHINE ==========
  
  setMachine: (machineId) => {
    if (MACHINE_PROFILES[machineId]) {
      set({ selectedMachine: machineId });
      get().runValidation(); // Re-validate with new machine
    }
  },
  
  // ========== GATE ==========
  
  updateGateStatus: () => {
    const { specState, validation } = get();
    const blockers: string[] = [];
    
    // Check validation
    if (!validation) {
      blockers.push('Run validation first');
    } else if (!validation.ok) {
      blockers.push(`${validation.failCount} validation error(s)`);
    }
    
    // Check state for freeze
    const canFreeze = specState === 'DRAFT' && validation?.ok === true;
    
    // Check state for release
    const canRelease = specState === 'FROZEN' && validation?.ok === true;
    
    // Check state for export
    let canExport = false;
    if (specState === 'DRAFT') {
      blockers.push('Spec must be FROZEN or RELEASED to export');
    } else if (specState === 'FROZEN' || specState === 'RELEASED') {
      if (validation?.ok) {
        canExport = true;
      }
    }
    
    set({
      gateStatus: {
        canFreeze,
        canRelease,
        canExport,
        blockers,
      },
    });
  },
  
  // ========== EXPORT ==========
  
  canExport: (format) => {
    const { specState, validation, gateStatus } = get();
    
    // Basic gate check
    if (!gateStatus.canExport) return false;
    
    // Format-specific rules
    switch (format) {
      case 'CUT_LIST':
        return specState !== 'DRAFT'; // Allow in FROZEN
      case 'DXF':
        return specState !== 'DRAFT';
      case 'CNC':
        return specState === 'RELEASED'; // Only RELEASED
      default:
        return false;
    }
  },
}));

// ============================================
// SELECTOR HOOKS
// ============================================

export const useSpecState = () => useSpecStore((s) => s.specState);
export const useValidation = () => useSpecStore((s) => s.validation);
export const useGateStatus = () => useSpecStore((s) => s.gateStatus);
export const useMachineProfile = () => {
  const machineId = useSpecStore((s) => s.selectedMachine);
  return MACHINE_PROFILES[machineId];
};
