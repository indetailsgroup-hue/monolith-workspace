/**
 * Assembly Mapper - Intent to Assembly Plan
 *
 * Maps designer intent and rule effects to assembly sequence.
 * Follows factory standard: Left-to-Right assembly direction.
 *
 * v1.0: Initial implementation
 */

import type {
  DesignerIntentPDF,
  RuleEffect,
  AssemblyPlanPDF,
  AssemblyStepPDF,
  PanelId,
} from '../types';

// ============================================
// ASSEMBLY STEP TEMPLATES
// ============================================

const STEP_TEMPLATES = {
  // Base structure
  PLACE_LEFT_SIDE: {
    action: 'PLACE',
    panel: 'LEFT_SIDE' as PanelId,
    instructionTH: 'วางแผงข้างซ้ายลงบนโต๊ะ (หงายออก)',
    instructionEN: 'Place left side panel on table (face up)',
    estimatedMinutes: 1,
  },
  ATTACH_BOTTOM: {
    action: 'ATTACH',
    panel: 'BOTTOM' as PanelId,
    instructionTH: 'ยึดแผงล่างกับแผงข้างซ้าย (Minifix)',
    instructionEN: 'Attach bottom panel to left side (Minifix)',
    estimatedMinutes: 2,
  },
  ATTACH_TOP: {
    action: 'ATTACH',
    panel: 'TOP' as PanelId,
    instructionTH: 'ยึดแผงบนกับแผงข้างซ้าย (Minifix)',
    instructionEN: 'Attach top panel to left side (Minifix)',
    estimatedMinutes: 2,
  },
  ATTACH_RIGHT_SIDE: {
    action: 'ATTACH',
    panel: 'RIGHT_SIDE' as PanelId,
    instructionTH: 'ยึดแผงข้างขวากับแผงบน/ล่าง (Minifix)',
    instructionEN: 'Attach right side to top/bottom (Minifix)',
    estimatedMinutes: 3,
  },
  FLIP_CABINET: {
    action: 'FLIP',
    panel: 'CARCASS' as PanelId,
    instructionTH: 'พลิกตู้ ยืนตั้งตรง',
    instructionEN: 'Flip cabinet upright',
    estimatedMinutes: 1,
  },
  COMPLETE_JOINTS: {
    action: 'VERIFY',
    panel: 'CARCASS' as PanelId,
    instructionTH: 'ตรวจสอบและขันแคมล็อคให้แน่น',
    instructionEN: 'Check and tighten all cam locks',
    estimatedMinutes: 2,
  },

  // Back panel
  INSERT_BACK: {
    action: 'INSERT',
    panel: 'BACK' as PanelId,
    instructionTH: 'สอดแผงหลังเข้าร่อง',
    instructionEN: 'Insert back panel into groove',
    estimatedMinutes: 2,
  },

  // Shelves
  ATTACH_FIXED_SHELF: {
    action: 'ATTACH',
    panel: 'SHELF' as PanelId,
    instructionTH: 'ยึดชั้นวางตายตัว (Minifix)',
    instructionEN: 'Attach fixed shelf (Minifix)',
    estimatedMinutes: 2,
  },
  INSERT_SHELF_PINS: {
    action: 'INSERT',
    panel: 'LEFT_SIDE' as PanelId,
    instructionTH: 'ใส่พินรับชั้น (ซ้าย-ขวา)',
    instructionEN: 'Insert shelf pins (both sides)',
    estimatedMinutes: 1,
  },
  PLACE_ADJUSTABLE_SHELF: {
    action: 'PLACE',
    panel: 'SHELF' as PanelId,
    instructionTH: 'วางชั้นวางบนพิน',
    instructionEN: 'Place adjustable shelf on pins',
    estimatedMinutes: 1,
  },

  // Doors
  MOUNT_HINGE_PLATES: {
    action: 'ATTACH',
    panel: 'LEFT_SIDE' as PanelId,
    instructionTH: 'ยึดแผ่นรองบานพับที่แผงข้าง',
    instructionEN: 'Mount hinge plates on side panel',
    estimatedMinutes: 2,
  },
  HANG_DOOR: {
    action: 'ATTACH',
    panel: 'DOOR' as PanelId,
    instructionTH: 'แขวนบานประตู',
    instructionEN: 'Hang door on hinges',
    estimatedMinutes: 2,
  },
  ADJUST_DOOR: {
    action: 'ADJUST',
    panel: 'DOOR' as PanelId,
    instructionTH: 'ปรับตั้งบานประตู (ซ้าย-ขวา, บน-ล่าง)',
    instructionEN: 'Adjust door alignment (horizontal, vertical)',
    estimatedMinutes: 3,
  },

  // Drawers
  MOUNT_SLIDES: {
    action: 'ATTACH',
    panel: 'LEFT_SIDE' as PanelId,
    instructionTH: 'ยึดรางลิ้นชักที่แผงข้าง (ซ้าย-ขวา)',
    instructionEN: 'Mount drawer slides on side panels',
    estimatedMinutes: 3,
  },
  INSERT_DRAWER: {
    action: 'INSERT',
    panel: 'DRAWER' as PanelId,
    instructionTH: 'ใส่ลิ้นชักเข้าราง',
    instructionEN: 'Insert drawer into slides',
    estimatedMinutes: 2,
  },
  ATTACH_DRAWER_FRONT: {
    action: 'ATTACH',
    panel: 'DRAWER' as PanelId,
    instructionTH: 'ยึดหน้าลิ้นชัก',
    instructionEN: 'Attach drawer front',
    estimatedMinutes: 2,
  },
  ADJUST_DRAWER: {
    action: 'ADJUST',
    panel: 'DRAWER' as PanelId,
    instructionTH: 'ปรับตั้งลิ้นชัก',
    instructionEN: 'Adjust drawer alignment',
    estimatedMinutes: 2,
  },

  // Base/Levelers
  INSTALL_LEVELERS: {
    action: 'ATTACH',
    panel: 'BOTTOM' as PanelId,
    instructionTH: 'ติดตั้งขาปรับระดับ (4 ตัว)',
    instructionEN: 'Install adjustable levelers (4 pcs)',
    estimatedMinutes: 3,
  },
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get derived value from effects.
 */
function getDerived(
  derived: Record<string, unknown>,
  key: string
): unknown {
  return derived[key];
}

/**
 * Create assembly step.
 */
function createStep(
  template: typeof STEP_TEMPLATES[keyof typeof STEP_TEMPLATES],
  stepNumber: number,
  overrides?: Partial<AssemblyStepPDF>
): AssemblyStepPDF {
  return {
    stepNumber,
    action: template.action as AssemblyStepPDF['action'],
    panel: template.panel,
    instructionTH: template.instructionTH,
    instructionEN: template.instructionEN,
    estimatedMinutes: template.estimatedMinutes,
    ...overrides,
  };
}

// ============================================
// MAIN MAPPER
// ============================================

/**
 * Map intent and effects to assembly plan.
 */
export function assemblyMapper(
  intent: DesignerIntentPDF,
  effects: RuleEffect[],
  derived: Record<string, unknown>
): AssemblyPlanPDF {
  const steps: AssemblyStepPDF[] = [];
  const notesTH: string[] = [];
  let stepNumber = 1;

  // Determine assembly direction
  const assemblyDirection = getDerived(derived, 'assemblyDirection') || 'LEFT_TO_RIGHT';

  if (assemblyDirection === 'LEFT_TO_RIGHT') {
    notesTH.push('ทิศทางการประกอบ: ซ้าย → ขวา (มาตรฐานโรงงาน)');
  } else {
    notesTH.push('ทิศทางการประกอบ: ขวา → ซ้าย (พิเศษ)');
  }

  // ---- Phase 1: Carcass Assembly ----
  notesTH.push('--- ขั้นตอนที่ 1: ประกอบโครงตู้ ---');

  // Place first side
  if (assemblyDirection === 'LEFT_TO_RIGHT') {
    steps.push(createStep(STEP_TEMPLATES.PLACE_LEFT_SIDE, stepNumber++));
  } else {
    steps.push(createStep(STEP_TEMPLATES.PLACE_LEFT_SIDE, stepNumber++, {
      panel: 'RIGHT_SIDE',
      instructionTH: 'วางแผงข้างขวาลงบนโต๊ะ (หงายออก)',
      instructionEN: 'Place right side panel on table (face up)',
    }));
  }

  // Attach bottom
  steps.push(createStep(STEP_TEMPLATES.ATTACH_BOTTOM, stepNumber++));

  // Attach fixed shelves (before top)
  if (intent.shelf?.enabled && intent.shelf.supportType === 'FIXED') {
    const shelfCount = intent.shelf.count || 1;
    for (let s = 0; s < shelfCount; s++) {
      steps.push(createStep(STEP_TEMPLATES.ATTACH_FIXED_SHELF, stepNumber++, {
        instructionTH: `ยึดชั้นวางตายตัว #${s + 1} (Minifix)`,
        instructionEN: `Attach fixed shelf #${s + 1} (Minifix)`,
      }));
    }
  }

  // Attach top
  steps.push(createStep(STEP_TEMPLATES.ATTACH_TOP, stepNumber++));

  // Attach second side
  if (assemblyDirection === 'LEFT_TO_RIGHT') {
    steps.push(createStep(STEP_TEMPLATES.ATTACH_RIGHT_SIDE, stepNumber++));
  } else {
    steps.push(createStep(STEP_TEMPLATES.ATTACH_RIGHT_SIDE, stepNumber++, {
      panel: 'LEFT_SIDE',
      instructionTH: 'ยึดแผงข้างซ้ายกับแผงบน/ล่าง (Minifix)',
      instructionEN: 'Attach left side to top/bottom (Minifix)',
    }));
  }

  // Flip and verify
  steps.push(createStep(STEP_TEMPLATES.FLIP_CABINET, stepNumber++));
  steps.push(createStep(STEP_TEMPLATES.COMPLETE_JOINTS, stepNumber++));

  // ---- Phase 2: Back Panel ----
  if (intent.backPanel) {
    notesTH.push('--- ขั้นตอนที่ 2: แผงหลัง ---');
    steps.push(createStep(STEP_TEMPLATES.INSERT_BACK, stepNumber++));
  }

  // ---- Phase 3: Levelers/Base ----
  if (getDerived(derived, 'requiresLevelerHardware') === true) {
    notesTH.push('--- ขั้นตอนที่ 3: ขาปรับระดับ ---');
    steps.push(createStep(STEP_TEMPLATES.INSTALL_LEVELERS, stepNumber++));
  }

  // ---- Phase 4: Drawer Slides ----
  if (intent.drawer?.enabled) {
    notesTH.push('--- ขั้นตอนที่ 4: รางลิ้นชัก ---');
    const drawerCount = intent.drawer.drawerCount || 1;

    steps.push(createStep(STEP_TEMPLATES.MOUNT_SLIDES, stepNumber++, {
      instructionTH: `ยึดรางลิ้นชัก ${drawerCount} ชุด`,
      instructionEN: `Mount ${drawerCount} drawer slide sets`,
    }));

    for (let d = 0; d < drawerCount; d++) {
      steps.push(createStep(STEP_TEMPLATES.INSERT_DRAWER, stepNumber++, {
        instructionTH: `ใส่ลิ้นชัก #${d + 1} เข้าราง`,
        instructionEN: `Insert drawer #${d + 1} into slides`,
      }));
      steps.push(createStep(STEP_TEMPLATES.ATTACH_DRAWER_FRONT, stepNumber++, {
        instructionTH: `ยึดหน้าลิ้นชัก #${d + 1}`,
        instructionEN: `Attach drawer front #${d + 1}`,
      }));
    }

    steps.push(createStep(STEP_TEMPLATES.ADJUST_DRAWER, stepNumber++, {
      instructionTH: `ปรับตั้งลิ้นชักทั้งหมด`,
      instructionEN: `Adjust all drawers`,
    }));
  }

  // ---- Phase 5: Doors ----
  if (intent.door?.enabled) {
    notesTH.push('--- ขั้นตอนที่ 5: บานประตู ---');
    const doorCount = intent.door.doorCount || 1;
    const doorHardwareSystem = getDerived(derived, 'doorHardwareSystem');

    if (doorHardwareSystem === 'CUP_HINGE') {
      steps.push(createStep(STEP_TEMPLATES.MOUNT_HINGE_PLATES, stepNumber++, {
        instructionTH: `ยึดแผ่นรองบานพับ (${doorCount} บาน)`,
        instructionEN: `Mount hinge plates (${doorCount} doors)`,
      }));

      for (let d = 0; d < doorCount; d++) {
        steps.push(createStep(STEP_TEMPLATES.HANG_DOOR, stepNumber++, {
          instructionTH: `แขวนบานประตู #${d + 1}`,
          instructionEN: `Hang door #${d + 1}`,
        }));
      }

      steps.push(createStep(STEP_TEMPLATES.ADJUST_DOOR, stepNumber++));
    } else {
      // Aventos or JET Flap - special installation
      notesTH.push('⚠️ ติดตั้งระบบยกบานตามคู่มือผู้ผลิต');
      steps.push({
        stepNumber: stepNumber++,
        action: 'ATTACH',
        panel: 'DOOR',
        instructionTH: 'ติดตั้งระบบยกบาน (ดูคู่มือผู้ผลิต)',
        instructionEN: 'Install lift system (see manufacturer instructions)',
        estimatedMinutes: 10,
      });
    }
  }

  // ---- Phase 6: Adjustable Shelves ----
  if (intent.shelf?.enabled && intent.shelf.supportType === 'ADJUSTABLE') {
    notesTH.push('--- ขั้นตอนสุดท้าย: ชั้นวางปรับได้ ---');
    const shelfCount = intent.shelf.count || 1;

    steps.push(createStep(STEP_TEMPLATES.INSERT_SHELF_PINS, stepNumber++, {
      instructionTH: `ใส่พินรับชั้น ${shelfCount * 4} ตัว`,
      instructionEN: `Insert ${shelfCount * 4} shelf pins`,
    }));

    for (let s = 0; s < shelfCount; s++) {
      steps.push(createStep(STEP_TEMPLATES.PLACE_ADJUSTABLE_SHELF, stepNumber++, {
        instructionTH: `วางชั้นวาง #${s + 1} บนพิน`,
        instructionEN: `Place shelf #${s + 1} on pins`,
      }));
    }
  }

  // ---- Calculate totals ----
  const totalMinutes = steps.reduce((sum, s) => sum + s.estimatedMinutes, 0);

  return {
    steps,
    notesTH,
    totalMinutes,
    assemblyDirection: assemblyDirection as 'LEFT_TO_RIGHT' | 'RIGHT_TO_LEFT',
  };
}
