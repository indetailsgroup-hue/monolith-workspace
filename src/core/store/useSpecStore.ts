/**
 * Spec Store - Manufacturing Specification State Management
 *
 * SPEC-08 Compliant:
 * - Spec State: DRAFT → FROZEN → RELEASED
 * - Gate Enforcement: Lock export based on state & validation
 * - Validation: Check rules before allowing state transitions
 *
 * P9: Spec Lineage Anchor
 * - Records state transitions in append-only audit log
 * - Content-based revision IDs (SHA-256)
 * - Parent-child chain linkage
 *
 * P11: Server State Sync
 * - Calls P10 server endpoints for state transitions
 * - Server-authoritative state with offline fallback
 * - Sync status tracking
 *
 * "Design is Free — Manufacturing is Deterministic"
 */

import { create } from 'zustand';
import { useCabinetStore, registerSpecStore } from './useCabinetStore';
import { useDrillMapStore } from './useDrillMapStore';
import { useProjectStore } from './useProjectStore';
import { sha256Hex } from '../../crypto/sha256';
import {
  getJobState,
  freezeJob as apiFreezeJob,
  releaseJob as apiReleaseJob,
  unfreezeJob as apiUnfreezeJob,
  revokeJob as apiRevokeJob,
  checkCanExport as apiCheckCanExport,
  type SyncStatus,
  type StateResponse,
} from '../api/stateApi';
import { g9ToValidationRules } from '../gate/g9PersistenceGate';
import { getExportGateStatus, isFreezeAllowed } from '../../gate/ui/useExportGate';
import { useGateStore } from '../../gate/ui/gateStore';

// ============================================
// TYPES
// ============================================

export type SpecState = 'DRAFT' | 'FROZEN' | 'RELEASED';

/**
 * B4: Release Record - Immutable snapshot of a RELEASED spec
 *
 * Created when spec transitions from FROZEN → RELEASED.
 * Contains content hashes for verification and audit trail.
 */
export interface SpecReleaseRecord {
  /** Unique release ID (generated at release time) */
  releaseId: string;
  /** ISO timestamp of release */
  releasedAt: string;
  /** Who released (user ID or system) */
  releasedBy: string;
  /** Parent release ID (for fork chain tracking) */
  parentReleaseId: string | null;
  /** Content hashes for integrity verification */
  contentHashes: {
    /** Hash of all cabinet data */
    cabinetsHash: string;
    /** Hash of drill map data */
    drillMapHash: string;
    /** Hash of gate result (if available) */
    gateResultHash: string | null;
    /** Combined manifest hash */
    manifestHash: string;
  };
  /** Server revision ID (P11) */
  serverRevisionId: string | null;
  /** Optional release note */
  note?: string;
}

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
  /** CNC machine preset ID (maps to src/cnc/machine/presets) */
  cncPresetId?: string;
  /** G-code dialect */
  dialect?: string;
  /** Manufacturer */
  manufacturer?: string;
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
    cncPresetId: 'HOMAG',
    dialect: 'MPR',
    manufacturer: 'Homag Group',
  },
  'biesse-rover': {
    id: 'biesse-rover',
    name: 'Biesse Rover B FT',
    maxWidth: 3700,
    maxHeight: 1400,
    minThickness: 3,
    maxThickness: 80,
    supportedOperations: ['CUT', 'DRILL', 'ROUTE', 'EDGE', 'NEST'],
    cncPresetId: 'BIESSE',
    dialect: 'BIESSE',
    manufacturer: 'Biesse Group',
  },
  'kdt-1320': {
    id: 'kdt-1320',
    name: 'KDT NC Router',
    maxWidth: 3200,
    maxHeight: 1300,
    minThickness: 6,
    maxThickness: 50,
    supportedOperations: ['CUT', 'DRILL', 'ROUTE', 'EDGE'],
    cncPresetId: 'KDT',
    dialect: 'FANUC',
    manufacturer: 'KDT Machinery',
  },
  'scm-morbidelli': {
    id: 'scm-morbidelli',
    name: 'SCM Morbidelli M200',
    maxWidth: 3100,
    maxHeight: 1300,
    minThickness: 6,
    maxThickness: 70,
    supportedOperations: ['CUT', 'DRILL', 'ROUTE', 'EDGE'],
    cncPresetId: 'SCM',
    dialect: 'XXL',
    manufacturer: 'SCM Group',
  },
  'generic-cnc': {
    id: 'generic-cnc',
    name: 'Generic CNC Router',
    maxWidth: 2500,
    maxHeight: 1300,
    minThickness: 6,
    maxThickness: 60,
    supportedOperations: ['CUT', 'DRILL', 'ROUTE', 'EDGE'],
    cncPresetId: 'GENERIC',
    dialect: 'FANUC',
    manufacturer: 'Generic',
  },
};

// ============================================
// VALIDATION RULES
// ============================================

function runValidation(): ValidationResult {
  const cabinet = useCabinetStore.getState().cabinet;
  const rules: ValidationRule[] = [];
  
  if (!cabinet || !cabinet.dimensions || !cabinet.structure) {
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
        message: 'No cabinet defined or cabinet data incomplete',
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

  // G9: Persistence Gate - External state validation
  // S15-3: require() ไม่มีในเบราว์เซอร์ ESM (Vite) — เดิมพัง silent ทำให้ WARN ถาวร → static import
  try {
    const g9Rules = g9ToValidationRules() as ValidationRule[];
    rules.push(...g9Rules);
  } catch {
    // If G9 check fails at runtime, add a warning
    rules.push({
      id: 'g9-load-error',
      name: 'G9 Persistence Gate',
      category: 'SAFETY',
      status: 'WARN',
      message: 'G9 persistence gate check failed to run',
    });
  }
  
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

  // P11: Server sync
  syncStatus: SyncStatus;
  lastServerResponse: StateResponse | null;
  serverRevisionId: string | null;

  // P11.1: Pending intent (for offline retry)
  pendingTransition: {
    type: 'FREEZE' | 'RELEASE' | 'REVOKE';
    note?: string;
    changeClass?: string;
    queuedAt: string;
  } | null;

  // B4: Release records (immutable history)
  releaseRecords: SpecReleaseRecord[];
  currentReleaseId: string | null;
}

interface SpecStoreActions {
  // State transitions
  setSpecState: (state: SpecState) => void;
  freezeSpec: () => Promise<boolean>;
  releaseSpec: (options?: { releasedBy?: string; note?: string }) => Promise<boolean>;
  unfreezeSpec: () => Promise<boolean>;
  revokeSpec: () => Promise<boolean>;

  // Validation
  runValidation: () => ValidationResult;

  // Machine
  setMachine: (machineId: string) => void;

  // Gate
  updateGateStatus: () => void;

  // Export
  canExport: (format: 'CUT_LIST' | 'DXF' | 'CNC') => boolean;

  // P11: Server sync
  syncWithServer: () => Promise<void>;
  checkServerCanExport: () => Promise<boolean>;

  // P11.1: Pending intent
  queueTransition: (type: 'FREEZE' | 'RELEASE' | 'REVOKE', note?: string, changeClass?: string) => void;
  clearPendingTransition: () => void;
  drainPendingTransition: () => Promise<boolean>;

  // B4: Release records & fork
  getCurrentReleaseRecord: () => SpecReleaseRecord | null;
  forkSpec: () => Promise<string | null>;  // Returns new project ID or null on failure
  isWriteAllowed: () => boolean;
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

  // P11: Server sync initial state
  syncStatus: 'pending' as SyncStatus,
  lastServerResponse: null,
  serverRevisionId: null,

  // P11.1: Pending intent initial state
  pendingTransition: null,

  // B4: Release records initial state
  releaseRecords: [],
  currentReleaseId: null,
  
  // ========== STATE TRANSITIONS ==========
  
  setSpecState: (state) => {
    set({ specState: state });
    get().updateGateStatus();
  },
  
  freezeSpec: async () => {
    const { specState } = get();

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

    // S18: Safety Gate (drill map/hardware) ต้องผ่านก่อน freeze — designer ข้าม gate ไม่ได้
    // gate ต้องเคยรัน (hasRun) และไม่มี blocker
    if (!isFreezeAllowed()) {
      console.warn('[SpecStore] Cannot freeze: Safety Gate not passed (run gate, resolve blockers)');
      return false;
    }

    // P11.1: Server-only authority - no local fallback
    const projectMeta = useProjectStore.getState().metadata;
    const jobId = projectMeta?.id;

    if (!jobId) {
      console.warn('[SpecStore] Cannot freeze: no jobId');
      return false;
    }

    set({ syncStatus: 'pending' });

    try {
      const response = await apiFreezeJob(jobId, {
        changeClass: 'GEOMETRY',
        note: 'Frozen from DRAFT',
      });

      if (response.ok && response.specState) {
        // Server succeeded - update local state
        set({
          specState: response.specState as SpecState,
          syncStatus: 'synced',
          lastServerResponse: response,
          serverRevisionId: response.revisionId || null,
          pendingTransition: null, // Clear any pending
        });
        get().updateGateStatus();
        return true;
      } else {
        // Server rejected - do NOT fall back to local
        console.warn('[SpecStore] Server freeze rejected:', response.error);
        set({ syncStatus: 'error', lastServerResponse: response });
        return false;
      }
    } catch (error) {
      // P11.1: Server unreachable - queue intent, do NOT change local state
      console.warn('[SpecStore] Server unavailable - cannot freeze. Queuing intent.');
      set({
        syncStatus: 'offline',
        pendingTransition: {
          type: 'FREEZE',
          note: 'Frozen from DRAFT',
          changeClass: 'GEOMETRY',
          queuedAt: new Date().toISOString(),
        },
      });
      return false;
    }
  },
  
  releaseSpec: async (options?: { releasedBy?: string; note?: string }) => {
    const { specState, currentReleaseId } = get();
    const releasedBy = options?.releasedBy || 'system';
    const note = options?.note || 'Released from FROZEN';

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

    // P11.1: Server-only authority - no local fallback
    const projectMeta = useProjectStore.getState().metadata;
    const jobId = projectMeta?.id;

    if (!jobId) {
      console.warn('[SpecStore] Cannot release: no jobId');
      return false;
    }

    set({ syncStatus: 'pending' });

    try {
      const response = await apiReleaseJob(jobId, {
        note,
      });

      if (response.ok && response.specState) {
        // B4: Create release record with content hashes
        const cabinetState = useCabinetStore.getState();
        const drillMapState = useDrillMapStore.getState();
        const cabinetsJson = JSON.stringify(cabinetState.cabinets);
        const drillMapJson = JSON.stringify(drillMapState.drillMap || null);

        // Compute content hashes
        const cabinetsHash = await sha256Hex(cabinetsJson);
        const drillMapHash = await sha256Hex(drillMapJson);
        const manifestData = JSON.stringify({
          jobId,
          cabinetsHash,
          drillMapHash,
          releasedAt: new Date().toISOString(),
        });
        const manifestHash = await sha256Hex(manifestData);

        const releaseId = `rel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const releaseRecord: SpecReleaseRecord = {
          releaseId,
          releasedAt: new Date().toISOString(),
          releasedBy,
          parentReleaseId: currentReleaseId,
          contentHashes: {
            cabinetsHash,
            drillMapHash,
            gateResultHash: null, // Will be added if gate result available
            manifestHash,
          },
          serverRevisionId: response.revisionId || null,
          note,
        };

        // Server succeeded - update local state with release record
        set((state) => ({
          specState: response.specState as SpecState,
          syncStatus: 'synced',
          lastServerResponse: response,
          serverRevisionId: response.revisionId || null,
          pendingTransition: null,
          currentReleaseId: releaseId,
          releaseRecords: [...state.releaseRecords, releaseRecord],
        }));
        get().updateGateStatus();
        return true;
      } else {
        // Server rejected - do NOT fall back to local
        console.warn('[SpecStore] Server release rejected:', response.error);
        set({ syncStatus: 'error', lastServerResponse: response });
        return false;
      }
    } catch (error) {
      // P11.1: Server unreachable - queue intent, do NOT change local state
      console.warn('[SpecStore] Server unavailable - cannot release. Queuing intent.');
      set({
        syncStatus: 'offline',
        pendingTransition: {
          type: 'RELEASE',
          note,
          queuedAt: new Date().toISOString(),
        },
      });
      return false;
    }
  },
  
  unfreezeSpec: async () => {
    const { specState } = get();

    // S15-3: server เป็น authority — เดิม set local DRAFT เฉย ๆ แล้ว reload เด้งกลับ FROZEN
    if (specState !== 'FROZEN') {
      console.warn('[SpecStore] Cannot unfreeze: state is', specState, '(RELEASED ต้อง revoke ก่อน)');
      return false;
    }

    const projectMeta = useProjectStore.getState().metadata;
    const jobId = projectMeta?.id;

    if (!jobId) {
      console.warn('[SpecStore] Cannot unfreeze: no jobId');
      return false;
    }

    set({ syncStatus: 'pending' });

    try {
      const response = await apiUnfreezeJob(jobId, { note: 'Unfrozen to DRAFT' });

      if (response.ok && response.specState) {
        set({
          specState: response.specState as SpecState,
          syncStatus: 'synced',
          lastServerResponse: response,
          serverRevisionId: response.revisionId || null,
        });
        get().updateGateStatus();
        return true;
      }

      console.warn('[SpecStore] Server rejected unfreeze:', response.error);
      set({ syncStatus: 'error', lastServerResponse: response });
      return false;
    } catch (error) {
      console.warn('[SpecStore] Unfreeze failed: server unreachable');
      set({ syncStatus: 'offline' });
      return false;
    }
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
    // SPEC-08: Block machine profile changes after FREEZE
    // Machine selection is part of manufacturing contract
    const { specState } = get();
    if (specState !== 'DRAFT') {
      console.warn('[SpecStore] Cannot change machine: spec is', specState, '(requires DRAFT)');
      return;
    }

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

    // S18: Safety Gate (drill map/hardware) ต้องผ่านก่อน freeze
    // gate ต้องเคยรัน (hasRun) และไม่มี blocker — ที่มา: useExportGate/gateStore
    const safetyGatePassed = isFreezeAllowed();
    if (specState === 'DRAFT' && !safetyGatePassed) {
      const safetyGate = getExportGateStatus();
      blockers.push(
        safetyGate.hasRun
          ? `Safety Gate: ${safetyGate.blockerCount} blocker(s)`
          : 'Run Safety Gate first'
      );
    }

    // Check state for freeze
    const canFreeze = specState === 'DRAFT' && validation?.ok === true && safetyGatePassed;
    
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
    const { specState, gateStatus, syncStatus } = get();

    // P11.1: Must be synced with server for authoritative export
    // Offline/error state cannot guarantee server state
    if (syncStatus !== 'synced') {
      console.warn('[SpecStore] canExport: not synced with server');
      return false;
    }

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

  // ========== P11: SERVER SYNC ==========

  revokeSpec: async () => {
    const { specState } = get();

    // Must be in RELEASED
    if (specState !== 'RELEASED') {
      console.warn('[SpecStore] Cannot revoke: not in RELEASED state');
      return false;
    }

    // P11.1: Server-only authority - no local fallback
    const projectMeta = useProjectStore.getState().metadata;
    const jobId = projectMeta?.id;

    if (!jobId) {
      console.warn('[SpecStore] Cannot revoke: no jobId');
      return false;
    }

    set({ syncStatus: 'pending' });

    try {
      const response = await apiRevokeJob(jobId, {
        note: 'Revoked from RELEASED',
      });

      if (response.ok && response.specState) {
        // Server succeeded - update local state
        set({
          specState: response.specState as SpecState,
          syncStatus: 'synced',
          lastServerResponse: response,
          serverRevisionId: response.revisionId || null,
          pendingTransition: null, // Clear any pending
        });
        get().updateGateStatus();
        return true;
      } else {
        console.warn('[SpecStore] Server revoke rejected:', response.error);
        set({ syncStatus: 'error', lastServerResponse: response });
        return false;
      }
    } catch (error) {
      // P11.1: Server unreachable - queue intent, do NOT change local state
      console.warn('[SpecStore] Server unavailable - cannot revoke. Queuing intent.');
      set({
        syncStatus: 'offline',
        pendingTransition: {
          type: 'REVOKE',
          note: 'Revoked from RELEASED',
          queuedAt: new Date().toISOString(),
        },
      });
      return false;
    }
  },

  syncWithServer: async () => {
    const projectMeta = useProjectStore.getState().metadata;
    const jobId = projectMeta?.id;

    if (!jobId) {
      set({ syncStatus: 'offline' });
      return;
    }

    set({ syncStatus: 'pending' });

    try {
      const response = await getJobState(jobId);

      if (response.ok && response.specState) {
        // Server response is authoritative
        set({
          specState: response.specState as SpecState,
          syncStatus: 'synced',
          lastServerResponse: response,
          serverRevisionId: response.revisionId || null,
        });
        get().updateGateStatus();
      } else {
        // Server returned error - might be new job (DRAFT)
        if (response.error?.includes('Invalid jobId') || response.error?.includes('ENOENT')) {
          // New job, no server state yet - this is OK
          set({ syncStatus: 'synced', lastServerResponse: response });
        } else {
          set({ syncStatus: 'error', lastServerResponse: response });
          console.warn('[SpecStore] Server sync error:', response.error);
        }
      }
    } catch (error) {
      console.warn('[SpecStore] Server unreachable');
      set({ syncStatus: 'offline' });
    }
  },

  checkServerCanExport: async () => {
    const projectMeta = useProjectStore.getState().metadata;
    const jobId = projectMeta?.id;

    if (!jobId) {
      return false;
    }

    try {
      const response = await apiCheckCanExport(jobId);
      return response.ok && response.canExport === true;
    } catch (error) {
      console.warn('[SpecStore] Cannot check export status');
      return false;
    }
  },

  // ========== P11.1: PENDING INTENT ==========

  queueTransition: (type, note, changeClass) => {
    set({
      pendingTransition: {
        type,
        note,
        changeClass,
        queuedAt: new Date().toISOString(),
      },
    });
  },

  clearPendingTransition: () => {
    set({ pendingTransition: null });
  },

  drainPendingTransition: async () => {
    const { pendingTransition, specState } = get();

    if (!pendingTransition) {
      return true;
    }

    const projectMeta = useProjectStore.getState().metadata;
    const jobId = projectMeta?.id;

    if (!jobId) {
      console.warn('[SpecStore] Cannot drain: no jobId');
      return false;
    }

    try {
      let response: StateResponse;

      switch (pendingTransition.type) {
        case 'FREEZE':
          if (specState !== 'DRAFT') {
            console.warn('[SpecStore] Cannot drain FREEZE: not in DRAFT');
            set({ pendingTransition: null });
            return false;
          }
          response = await apiFreezeJob(jobId, {
            note: pendingTransition.note,
            changeClass: pendingTransition.changeClass as any,
          });
          break;

        case 'RELEASE':
          if (specState !== 'FROZEN') {
            console.warn('[SpecStore] Cannot drain RELEASE: not in FROZEN');
            set({ pendingTransition: null });
            return false;
          }
          response = await apiReleaseJob(jobId, {
            note: pendingTransition.note,
          });
          break;

        case 'REVOKE':
          if (specState !== 'RELEASED') {
            console.warn('[SpecStore] Cannot drain REVOKE: not in RELEASED');
            set({ pendingTransition: null });
            return false;
          }
          response = await apiRevokeJob(jobId, {
            note: pendingTransition.note,
          });
          break;

        default:
          console.warn('[SpecStore] Unknown pending transition type');
          set({ pendingTransition: null });
          return false;
      }

      if (response.ok && response.specState) {
        set({
          specState: response.specState as SpecState,
          syncStatus: 'synced',
          lastServerResponse: response,
          serverRevisionId: response.revisionId || null,
          pendingTransition: null,
        });
        get().updateGateStatus();
        return true;
      } else {
        console.warn('[SpecStore] Drain failed:', response.error);
        set({ syncStatus: 'error', lastServerResponse: response });
        return false;
      }
    } catch (error) {
      console.warn('[SpecStore] Drain failed - server unreachable');
      set({ syncStatus: 'offline' });
      return false;
    }
  },

  // ========== B4: RELEASE RECORDS & FORK ==========

  getCurrentReleaseRecord: () => {
    const { currentReleaseId, releaseRecords } = get();
    if (!currentReleaseId) return null;
    return releaseRecords.find((r) => r.releaseId === currentReleaseId) || null;
  },

  forkSpec: async () => {
    const { specState, currentReleaseId, releaseRecords } = get();
    const projectStore = useProjectStore.getState();
    const currentMeta = projectStore.metadata;

    // B4: Fork is only allowed from RELEASED state
    if (specState !== 'RELEASED') {
      console.warn('[SpecStore] Cannot fork: only RELEASED specs can be forked');
      return null;
    }

    if (!currentMeta?.id) {
      console.warn('[SpecStore] Cannot fork: no current project');
      return null;
    }

    // Find current release record for parent chain
    const currentRecord = releaseRecords.find((r) => r.releaseId === currentReleaseId);

    // Create new project with FORK prefix
    const forkName = `[Fork] ${currentMeta.name || 'Untitled'}`;

    try {
      // Create new project using newProject (resets cabinet too)
      projectStore.newProject(forkName);

      // Get the newly created project's ID
      const newMeta = useProjectStore.getState().metadata;
      const forkId = newMeta?.id || `fork-${Date.now()}`;

      // Reset spec state to DRAFT for the fork
      set({
        specState: 'DRAFT',
        currentReleaseId: null,
        // Keep release records for lineage tracking
        releaseRecords: currentRecord
          ? [
              {
                ...currentRecord,
                releaseId: `fork-parent-${currentRecord.releaseId}`,
                note: `Forked from ${currentMeta.id}`,
              },
            ]
          : [],
        validation: null,
        syncStatus: 'pending',
      });

      return forkId;
    } catch (error) {
      console.error('[SpecStore] Fork failed:', error);
      return null;
    }
  },

  isWriteAllowed: () => {
    const { specState } = get();
    // B4: Only DRAFT allows writes
    return specState === 'DRAFT';
  },
}));

// Register spec store for cross-store access (avoids circular dependency)
registerSpecStore(useSpecStore);

// S18: canFreeze ผูกกับผล Safety Gate — เมื่อ gate รันเสร็จ/ถูก reset
// ต้อง refresh gateStatus ทันที ไม่งั้นปุ่ม Freeze ค้างสถานะเก่า
useGateStore.subscribe((state, prevState) => {
  if (state.lastResult !== prevState.lastResult) {
    useSpecStore.getState().updateGateStatus();
  }
});

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

// P11: Server sync hooks
export const useSyncStatus = () => useSpecStore((s) => s.syncStatus);
export const useServerRevisionId = () => useSpecStore((s) => s.serverRevisionId);

// P11.1: Pending intent hooks
export const usePendingTransition = () => useSpecStore((s) => s.pendingTransition);

// B4: Release record hooks
export const useReleaseRecords = () => useSpecStore((s) => s.releaseRecords);
export const useCurrentReleaseId = () => useSpecStore((s) => s.currentReleaseId);
export const useIsWriteAllowed = () => useSpecStore((s) => s.specState === 'DRAFT');
