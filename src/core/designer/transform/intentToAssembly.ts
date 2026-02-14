/**
 * Intent to Assembly - Assembly Sequence Generation
 *
 * Generates step-by-step assembly sequence following
 * the factory standard: Left-to-Right assembly.
 *
 * v1.0: Initial assembly sequence generation
 */

import type {
  DesignerIntent,
  AssemblySequence,
  AssemblyStep,
  HardwareSelection,
} from '../types';
import { ASSEMBLY_TIMING } from '../policy';

// ============================================
// ASSEMBLY STEP CREATORS
// ============================================

/**
 * Create an assembly step.
 */
function step(
  order: number,
  action: AssemblyStep['action'],
  panelId: string,
  panelLabel: string,
  options: Partial<AssemblyStep> = {}
): AssemblyStep {
  return {
    order,
    action,
    panelId,
    panelLabel,
    ...options,
  };
}

// ============================================
// ASSEMBLY SEQUENCE GENERATOR
// ============================================

/**
 * Generate assembly sequence from designer intent.
 *
 * Factory Standard Assembly Order (Left-to-Right):
 * 1. Place left side panel flat
 * 2. Attach bottom panel
 * 3. Attach fixed shelves
 * 4. Attach dividers
 * 5. Attach right side
 * 6. Attach top panel
 * 7. Flip and complete joints
 * 8. Insert back panel
 * 9. Mount doors
 * 10. Insert adjustable shelves
 * 11. Install drawers
 */
export function intentToAssembly(
  intent: DesignerIntent,
  hardware: HardwareSelection[] = []
): AssemblySequence {
  const steps: AssemblyStep[] = [];
  let order = 0;

  // Get connector type for notes
  const connectorType = intent.connectors.primaryJoint;
  const connectorHardware =
    connectorType === 'minifix'
      ? ['minifix-cam', 'minifix-bolt']
      : connectorType === 'dowel'
        ? ['dowel-8x35']
        : connectorType === 'confirmat'
          ? ['confirmat-7x50']
          : ['domino-6x40'];

  // ========================================
  // PHASE 1: Base Structure
  // ========================================

  // Step 1: Place left side panel (starting point)
  steps.push(
    step(++order, 'place', 'left-side', 'Left Side Panel', {
      notes: 'Place left side panel flat on assembly table, interior face up',
      timeMinutes: 1,
    })
  );

  // Step 2: Attach bottom panel
  steps.push(
    step(++order, 'attach', 'bottom', 'Bottom Panel', {
      targetPanelId: 'left-side',
      targetPanelLabel: 'Left Side Panel',
      hardware: connectorHardware,
      notes: `Insert ${connectorType} hardware, align at 90° to left side`,
      timeMinutes: 3,
    })
  );

  // ========================================
  // PHASE 2: Fixed Internal Structure
  // ========================================

  // Attach fixed shelves (sorted by position)
  const fixedShelves = intent.shelves
    .filter((s) => s.type === 'fixed')
    .sort((a, b) => a.positionY - b.positionY);

  for (const shelf of fixedShelves) {
    steps.push(
      step(++order, 'attach', `shelf-${shelf.id}`, `Fixed Shelf at ${shelf.positionY}mm`, {
        targetPanelId: 'left-side',
        targetPanelLabel: 'Left Side Panel',
        hardware: connectorHardware,
        notes: `Fixed shelf at ${shelf.positionY}mm from bottom`,
        timeMinutes: 2,
      })
    );
  }

  // Attach dividers (sorted by position)
  const dividers = [...intent.dividers].sort((a, b) => a.positionX - b.positionX);

  for (const divider of dividers) {
    steps.push(
      step(++order, 'attach', `divider-${divider.id}`, `Divider at ${divider.positionX}mm`, {
        targetPanelId: 'bottom',
        targetPanelLabel: 'Bottom Panel',
        hardware: connectorHardware,
        notes: `Vertical divider at ${divider.positionX}mm from left`,
        timeMinutes: 2,
      })
    );
  }

  // ========================================
  // PHASE 3: Complete Carcass
  // ========================================

  // Step: Attach right side
  steps.push(
    step(++order, 'attach', 'right-side', 'Right Side Panel', {
      targetPanelId: 'bottom',
      targetPanelLabel: 'Bottom Panel',
      hardware: connectorHardware,
      notes: 'Align right side, insert hardware for bottom joint',
      timeMinutes: 3,
    })
  );

  // Step: Attach top panel
  steps.push(
    step(++order, 'attach', 'top', 'Top Panel', {
      targetPanelId: 'left-side',
      targetPanelLabel: 'Left Side Panel',
      hardware: connectorHardware,
      notes: 'Attach top to left side first, then right side',
      timeMinutes: 3,
    })
  );

  // Step: Flip assembly
  steps.push(
    step(++order, 'flip', 'cabinet-assembly', 'Cabinet Assembly', {
      notes: 'Flip cabinet to access right side joints and back',
      timeMinutes: 1,
    })
  );

  // Step: Complete right side joints
  steps.push(
    step(++order, 'attach', 'right-side', 'Right Side Panel', {
      targetPanelId: 'top',
      targetPanelLabel: 'Top Panel',
      hardware: connectorHardware,
      notes: 'Complete remaining hardware on right side joints',
      timeMinutes: 2,
    })
  );

  // ========================================
  // PHASE 4: Back Panel
  // ========================================

  if (intent.backPanel.enabled) {
    const backNotes =
      intent.backPanel.construction === 'inset'
        ? 'Slide back panel into grooves, ensure square'
        : 'Attach back panel with clips/screws';

    steps.push(
      step(++order, 'insert', 'back', 'Back Panel', {
        notes: backNotes,
        timeMinutes: 2,
      })
    );
  }

  // Step: Clamp and verify square
  steps.push(
    step(++order, 'clamp', 'cabinet-assembly', 'Cabinet Assembly', {
      notes: 'Apply clamps, verify square with diagonal measurement',
      timeMinutes: ASSEMBLY_TIMING.clampTimeMinutes,
    })
  );

  // ========================================
  // PHASE 5: Doors
  // ========================================

  if (intent.doors?.enabled) {
    // Mount hinges and doors
    for (let i = 0; i < intent.doors.count; i++) {
      const doorId = i === 0 ? 'door-left' : 'door-right';
      const doorLabel = i === 0 ? 'Left Door' : 'Right Door';
      const targetSide = i === 0 ? 'left-side' : 'right-side';
      const targetLabel = i === 0 ? 'Left Side Panel' : 'Right Side Panel';

      steps.push(
        step(++order, 'attach', doorId, doorLabel, {
          targetPanelId: targetSide,
          targetPanelLabel: targetLabel,
          hardware: ['cup-hinge'],
          notes: `Mount ${intent.doors.hingeType} hinges, attach door, adjust overlay`,
          timeMinutes: 4,
        })
      );
    }

    // Adjust door alignment
    steps.push(
      step(++order, 'wait', 'doors', 'Door Adjustment', {
        notes: 'Adjust hinge screws for proper alignment and gaps',
        timeMinutes: 3,
      })
    );
  }

  // ========================================
  // PHASE 6: Adjustable Shelves
  // ========================================

  const adjustableShelves = intent.shelves.filter((s) => s.type === 'adjustable');

  if (adjustableShelves.length > 0) {
    // Note: This can be done by customer, but included for completeness
    for (const shelf of adjustableShelves) {
      steps.push(
        step(++order, 'insert', `shelf-${shelf.id}`, `Adjustable Shelf`, {
          hardware: ['shelf-pin-5mm'],
          notes: `Insert 4 shelf pins, place shelf at ${shelf.positionY}mm`,
          timeMinutes: 1,
        })
      );
    }
  }

  // ========================================
  // PHASE 7: Drawers
  // ========================================

  if (intent.drawers?.enabled && intent.drawers.rows.length > 0) {
    // Install drawer slides first
    steps.push(
      step(++order, 'attach', 'drawer-slides', 'Drawer Slides', {
        targetPanelId: 'left-side',
        targetPanelLabel: 'Cabinet Sides',
        hardware: [
          intent.drawers.slideType === 'undermount'
            ? 'undermount-slide'
            : 'side-mount-slide',
        ],
        notes: `Install ${intent.drawers.rows.length} pairs of ${intent.drawers.slideType} slides`,
        timeMinutes: intent.drawers.rows.length * 2,
      })
    );

    // Insert drawer boxes
    for (let i = 0; i < intent.drawers.rows.length; i++) {
      const row = intent.drawers.rows[i];
      steps.push(
        step(++order, 'insert', `drawer-${i}`, `Drawer ${i + 1} (${row.frontHeight}mm)`, {
          notes: 'Attach drawer runners, slide drawer box into cabinet',
          timeMinutes: 2,
        })
      );
    }

    // Adjust drawer alignment
    steps.push(
      step(++order, 'wait', 'drawers', 'Drawer Adjustment', {
        notes: 'Adjust drawer fronts for proper alignment and gaps',
        timeMinutes: intent.drawers.rows.length,
      })
    );
  }

  // ========================================
  // Calculate Total Time
  // ========================================

  const totalTimeMinutes = steps.reduce<number>(
    (sum, s) => sum + (s.timeMinutes ?? ASSEMBLY_TIMING.perStepTimeMinutes),
    ASSEMBLY_TIMING.baseTimeMinutes
  );

  return {
    steps,
    totalTimeMinutes,
  };
}
