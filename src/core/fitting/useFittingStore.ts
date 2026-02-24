/**
 * FittingStore - Fitting Assignment & BOM Sync
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Implements Fitting Selection → Safety Check → BOM Sync
 * - Designer Override tracking for Gate validation
 * - Audit trail for compliance
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { 
  FittingSpec, 
  FittingAssignment, 
  SafetyStatus,
  checkFittingCompatibility,
  FITTING_CATALOGUE,
  PanelContext,
  CompatibilityResult,
} from './FittingCatalogue';

// ============================================
// TYPES
// ============================================

export interface BOMLine {
  id: string;
  factoryCode: string;
  fittingId: string;
  fittingName: string;
  vendor: string;
  
  // Quantities
  quantity: number;
  side?: 'L' | 'R' | 'PAIR';
  
  // References
  cabinetIds: string[];
  panelIds: string[];
  
  // Safety
  safetyStatus: SafetyStatus;
  overrideFlag: boolean;
  overrideReason?: string;
  
  // Drilling
  drillingPatternId: string;
}

export interface FittingAuditEntry {
  timestamp: string;
  action: 'ASSIGNED' | 'REMOVED' | 'OVERRIDE' | 'VALIDATED';
  fittingId: string;
  factoryCode: string;
  cabinetId: string;
  panelId: string;
  userId?: string;
  details: Record<string, unknown>;
}

export interface GateValidationResult {
  ok: boolean;
  timestamp: string;
  failures: {
    bomLineId: string;
    factoryCode: string;
    reason: string;
    requiresAcknowledgment: boolean;
  }[];
  warnings: {
    bomLineId: string;
    message: string;
  }[];
  overridesRequiringApproval: string[];
}

export interface FittingState {
  // Assignments
  assignments: FittingAssignment[];
  
  // BOM
  bomLines: BOMLine[];
  
  // Audit
  auditTrail: FittingAuditEntry[];
  
  // Gate
  lastGateValidation: GateValidationResult | null;
  
  // Actions
  assignFitting: (
    fittingId: string,
    cabinetId: string,
    panelId: string,
    context: PanelContext,
    position: [number, number, number],
    side: FittingAssignment['side']
  ) => CompatibilityResult;
  
  removeFitting: (assignmentId: string) => void;
  
  overrideFitting: (assignmentId: string, reason: string) => void;
  
  validateForGate: () => GateValidationResult;
  
  acknowledgeFailure: (bomLineId: string) => void;
  
  clearAll: () => void;
}

// ============================================
// HELPERS
// ============================================

function generateId(): string {
  return `fit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function findFitting(fittingId: string): FittingSpec | undefined {
  return FITTING_CATALOGUE.find(f => f.id === fittingId);
}

// ============================================
// STORE
// ============================================

export const useFittingStore = create<FittingState>()(
  immer((set, get) => ({
    assignments: [],
    bomLines: [],
    auditTrail: [],
    lastGateValidation: null,
    
    /**
     * Assign fitting to panel
     * Returns compatibility result for UI to show warnings
     */
    assignFitting: (fittingId, cabinetId, panelId, context, position, side) => {
      const fitting = findFitting(fittingId);
      
      if (!fitting) {
        return {
          isCompatible: false,
          safetyStatus: 'UNKNOWN' as SafetyStatus,
          errors: [`Fitting ${fittingId} not found in catalogue`],
          warnings: [],
        };
      }
      
      // Check compatibility
      const compatibility = checkFittingCompatibility(fitting, context);
      
      set((state) => {
        // Create assignment
        const assignment: FittingAssignment = {
          id: generateId(),
          fittingId,
          factoryCode: fitting.factoryCode,
          cabinetId,
          panelId,
          side,
          position,
          safetyStatus: compatibility.safetyStatus,
          overrideFlag: false,
          validationErrors: compatibility.errors,
        };
        
        state.assignments.push(assignment);
        
        // Update BOM
        const existingBomLine = state.bomLines.find(
          b => b.factoryCode === fitting.factoryCode
        );
        
        if (existingBomLine) {
          existingBomLine.quantity += 1;
          if (!existingBomLine.cabinetIds.includes(cabinetId)) {
            existingBomLine.cabinetIds.push(cabinetId);
          }
          if (!existingBomLine.panelIds.includes(panelId)) {
            existingBomLine.panelIds.push(panelId);
          }
          // Update safety status to worst case
          if (compatibility.safetyStatus === 'UNSAFE') {
            existingBomLine.safetyStatus = 'UNSAFE';
          } else if (compatibility.safetyStatus === 'WARN' && existingBomLine.safetyStatus === 'SAFE') {
            existingBomLine.safetyStatus = 'WARN';
          }
        } else {
          const bomLine: BOMLine = {
            id: generateId(),
            factoryCode: fitting.factoryCode,
            fittingId,
            fittingName: fitting.name,
            vendor: fitting.vendor,
            quantity: 1,
            side: side === 'LEFT' ? 'L' : side === 'RIGHT' ? 'R' : undefined,
            cabinetIds: [cabinetId],
            panelIds: [panelId],
            safetyStatus: compatibility.safetyStatus,
            overrideFlag: false,
            drillingPatternId: fitting.drillingPatternId,
          };
          state.bomLines.push(bomLine);
        }
        
        // Audit
        state.auditTrail.push({
          timestamp: new Date().toISOString(),
          action: 'ASSIGNED',
          fittingId,
          factoryCode: fitting.factoryCode,
          cabinetId,
          panelId,
          details: {
            safetyStatus: compatibility.safetyStatus,
            errors: compatibility.errors,
            warnings: compatibility.warnings,
          },
        });
        
        console.log(`[Fitting] Assigned ${fitting.name} to panel ${panelId}`);
      });
      
      return compatibility;
    },
    
    /**
     * Remove fitting assignment
     */
    removeFitting: (assignmentId) => set((state) => {
      const assignment = state.assignments.find(a => a.id === assignmentId);
      if (!assignment) return;
      
      // Remove assignment
      state.assignments = state.assignments.filter(a => a.id !== assignmentId);
      
      // Update BOM
      const bomLine = state.bomLines.find(b => b.factoryCode === assignment.factoryCode);
      if (bomLine) {
        bomLine.quantity -= 1;
        if (bomLine.quantity <= 0) {
          state.bomLines = state.bomLines.filter(b => b.id !== bomLine.id);
        }
      }
      
      // Audit
      state.auditTrail.push({
        timestamp: new Date().toISOString(),
        action: 'REMOVED',
        fittingId: assignment.fittingId,
        factoryCode: assignment.factoryCode,
        cabinetId: assignment.cabinetId,
        panelId: assignment.panelId,
        details: {},
      });
      
      console.log(`[Fitting] Removed assignment ${assignmentId}`);
    }),
    
    /**
     * Designer override - acknowledge unsafe fitting
     */
    overrideFitting: (assignmentId, reason) => set((state) => {
      const assignment = state.assignments.find(a => a.id === assignmentId);
      if (!assignment) return;
      
      assignment.overrideFlag = true;
      assignment.overrideReason = reason;
      
      // Update BOM line
      const bomLine = state.bomLines.find(b => b.factoryCode === assignment.factoryCode);
      if (bomLine) {
        bomLine.overrideFlag = true;
        bomLine.overrideReason = reason;
      }
      
      // Audit
      state.auditTrail.push({
        timestamp: new Date().toISOString(),
        action: 'OVERRIDE',
        fittingId: assignment.fittingId,
        factoryCode: assignment.factoryCode,
        cabinetId: assignment.cabinetId,
        panelId: assignment.panelId,
        details: { reason },
      });
      
      console.log(`[Fitting] Override applied: ${reason}`);
    }),
    
    /**
     * Validate all fittings for Gate export
     */
    validateForGate: () => {
      const state = get();
      
      const failures: GateValidationResult['failures'] = [];
      const warnings: GateValidationResult['warnings'] = [];
      const overridesRequiringApproval: string[] = [];
      
      for (const bomLine of state.bomLines) {
        // Check factory code
        if (!bomLine.factoryCode || bomLine.factoryCode === '') {
          failures.push({
            bomLineId: bomLine.id,
            factoryCode: bomLine.factoryCode,
            reason: 'Missing factory code',
            requiresAcknowledgment: true,
          });
          continue;
        }
        
        // Check if fitting exists
        const fitting = findFitting(bomLine.fittingId);
        if (!fitting) {
          failures.push({
            bomLineId: bomLine.id,
            factoryCode: bomLine.factoryCode,
            reason: 'Unknown fitting - not in catalogue',
            requiresAcknowledgment: true,
          });
          continue;
        }
        
        // Check drilling pattern
        if (!bomLine.drillingPatternId) {
          failures.push({
            bomLineId: bomLine.id,
            factoryCode: bomLine.factoryCode,
            reason: 'Missing drilling pattern',
            requiresAcknowledgment: true,
          });
          continue;
        }
        
        // Check safety status
        if (bomLine.safetyStatus === 'UNSAFE' && !bomLine.overrideFlag) {
          failures.push({
            bomLineId: bomLine.id,
            factoryCode: bomLine.factoryCode,
            reason: 'Unsafe fitting without designer override',
            requiresAcknowledgment: true,
          });
          continue;
        }
        
        // Track overrides requiring approval
        if (bomLine.overrideFlag) {
          overridesRequiringApproval.push(bomLine.id);
          warnings.push({
            bomLineId: bomLine.id,
            message: `Designer override: ${bomLine.overrideReason || 'No reason provided'}`,
          });
        }
        
        // Add warnings
        if (bomLine.safetyStatus === 'WARN') {
          warnings.push({
            bomLineId: bomLine.id,
            message: 'Fitting has compatibility warnings',
          });
        }
      }
      
      const result: GateValidationResult = {
        ok: failures.length === 0,
        timestamp: new Date().toISOString(),
        failures,
        warnings,
        overridesRequiringApproval,
      };
      
      set((state) => {
        state.lastGateValidation = result;
      });
      
      console.log(`[Fitting] Gate validation: ${result.ok ? 'PASS' : 'FAIL'}`);
      
      return result;
    },
    
    /**
     * Acknowledge a failure (for Gate checklist)
     */
    acknowledgeFailure: (bomLineId) => set((state) => {
      const failure = state.lastGateValidation?.failures.find(f => f.bomLineId === bomLineId);
      if (failure) {
        failure.requiresAcknowledgment = false;
      }
    }),
    
    /**
     * Clear all fittings
     */
    clearAll: () => set((state) => {
      state.assignments = [];
      state.bomLines = [];
      state.lastGateValidation = null;
      console.log('[Fitting] Cleared all');
    }),
  }))
);

// ============================================
// SELECTORS
// ============================================

export const selectBOMTotal = (state: FittingState) => 
  state.bomLines.reduce((sum, line) => sum + line.quantity, 0);

export const selectUnsafeFittings = (state: FittingState) =>
  state.assignments.filter(a => a.safetyStatus === 'UNSAFE' && !a.overrideFlag);

export const selectFittingsForPanel = (panelId: string) => (state: FittingState) =>
  state.assignments.filter(a => a.panelId === panelId);

export const selectGateReady = (state: FittingState) =>
  state.lastGateValidation?.ok ?? false;
