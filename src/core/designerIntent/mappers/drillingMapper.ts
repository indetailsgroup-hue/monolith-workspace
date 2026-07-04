/**
 * Drilling Mapper - Intent to Drilling Plan
 *
 * Maps designer intent and rule effects to symbolic drilling operations.
 * This is a "symbolic" drill plan - actual coordinates are generated
 * by the CNC module based on cabinet dimensions.
 *
 * v1.0: Initial implementation
 */

import type {
  DesignerIntentPDF,
  RuleEffect,
  DrillingPlanPDF,
  DrillOpPDF,
  PanelId,
} from '../types';

// ============================================
// DRILL OPERATION TEMPLATES
// ============================================

const DRILL_TEMPLATES = {
  // Minifix cam housing (Ø15 x 13.5mm for 18mm wood per Häfele FF 3.10)
  MINIFIX_CAM: {
    drillType: 'CAM',
    diameter: 15,
    depth: 13.5,
    notesTH: 'รู Minifix Cam Ø15',
  },

  // Minifix bolt sleeve (Ø10 x 17.5mm)
  MINIFIX_BOLT: {
    drillType: 'BOLT',
    diameter: 10,
    depth: 17.5,
    notesTH: 'รู Minifix Bolt Ø10',
  },

  // Shelf pin (Ø5 x 8mm)
  SHELF_PIN: {
    drillType: 'SHELF_PIN',
    diameter: 5,
    depth: 8,
    notesTH: 'รูพินรับชั้น Ø5',
  },

  // Shelf pin for 14mm panel (Ø5 x 6mm)
  SHELF_PIN_14MM: {
    drillType: 'SHELF_PIN',
    diameter: 5,
    depth: 6,
    notesTH: 'รูพินรับชั้น Ø5 (สำหรับไม้ 14mm)',
  },

  // Hinge cup (Ø35 x 12mm)
  HINGE_CUP: {
    drillType: 'HINGE_CUP',
    diameter: 35,
    depth: 12,
    notesTH: 'รูบานพับถ้วย Ø35',
  },

  // Hinge mounting plate (Ø3 x 10mm)
  HINGE_PLATE: {
    drillType: 'PILOT',
    diameter: 3,
    depth: 10,
    notesTH: 'รูสกรูยึดบานพับ Ø3',
  },

  // Back panel groove (6mm wide x 8mm deep)
  BACK_GROOVE: {
    drillType: 'GROOVE',
    diameter: 6,
    depth: 8,
    notesTH: 'ร่องหลังตู้ 6x8mm',
  },

  // Drawer slide mounting (Ø3 x 10mm)
  SLIDE_MOUNT: {
    drillType: 'PILOT',
    diameter: 3,
    depth: 10,
    notesTH: 'รูยึดรางลิ้นชัก Ø3',
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
 * Create symbolic drill operation.
 */
function createDrillOp(
  panel: PanelId,
  template: typeof DRILL_TEMPLATES[keyof typeof DRILL_TEMPLATES],
  symbolRef: string
): DrillOpPDF {
  return {
    panel,
    drillType: template.drillType as DrillOpPDF['drillType'],
    diameter: template.diameter,
    depth: template.depth,
    symbolRef,
    notesTH: template.notesTH,
  };
}

// ============================================
// MAIN MAPPER
// ============================================

/**
 * Map intent and effects to drilling plan.
 */
export function drillingMapper(
  intent: DesignerIntentPDF,
  effects: RuleEffect[],
  derived: Record<string, unknown>
): DrillingPlanPDF {
  const operations: DrillOpPDF[] = [];
  const notesTH: string[] = [];

  // ---- System 32 Parameters ----
  const firstHole = (getDerived(derived, 'system32FirstHole') as number) || 50;
  const pitch = (getDerived(derived, 'system32Pitch') as number) || 32;

  notesTH.push(`System 32: รูแรกที่ ${firstHole}mm, ระยะห่าง ${pitch}mm`);

  // ---- Carcass Minifix (Left Side) ----
  // 4 cams on left side for top and bottom joints
  for (let i = 0; i < 4; i++) {
    operations.push(createDrillOp('LEFT_SIDE', DRILL_TEMPLATES.MINIFIX_CAM, `CAM_L_${i}`));
  }

  // 4 bolts on top and bottom panels for left joints
  for (let i = 0; i < 2; i++) {
    operations.push(createDrillOp('TOP', DRILL_TEMPLATES.MINIFIX_BOLT, `BOLT_T_L_${i}`));
    operations.push(createDrillOp('BOTTOM', DRILL_TEMPLATES.MINIFIX_BOLT, `BOLT_B_L_${i}`));
  }

  // ---- Carcass Minifix (Right Side) ----
  // 4 cams on right side for top and bottom joints
  for (let i = 0; i < 4; i++) {
    operations.push(createDrillOp('RIGHT_SIDE', DRILL_TEMPLATES.MINIFIX_CAM, `CAM_R_${i}`));
  }

  // 4 bolts on top and bottom panels for right joints
  for (let i = 0; i < 2; i++) {
    operations.push(createDrillOp('TOP', DRILL_TEMPLATES.MINIFIX_BOLT, `BOLT_T_R_${i}`));
    operations.push(createDrillOp('BOTTOM', DRILL_TEMPLATES.MINIFIX_BOLT, `BOLT_B_R_${i}`));
  }

  // ---- Shelf Pin Holes ----
  if (intent.shelf?.enabled && intent.shelf.supportType === 'ADJUSTABLE') {
    const shelfSlotType = getDerived(derived, 'shelfSlotType');
    const pinTemplate =
      shelfSlotType === 'DEDICATED_14MM'
        ? DRILL_TEMPLATES.SHELF_PIN_14MM
        : DRILL_TEMPLATES.SHELF_PIN;

    // System 32 holes on left and right sides
    // Symbolic: actual positions calculated by CNC based on height
    operations.push(createDrillOp('LEFT_SIDE', pinTemplate, 'SHELF_LINE_L_FRONT'));
    operations.push(createDrillOp('LEFT_SIDE', pinTemplate, 'SHELF_LINE_L_BACK'));
    operations.push(createDrillOp('RIGHT_SIDE', pinTemplate, 'SHELF_LINE_R_FRONT'));
    operations.push(createDrillOp('RIGHT_SIDE', pinTemplate, 'SHELF_LINE_R_BACK'));

    notesTH.push('รูพินรับชั้น 2 แถว/ข้าง (หน้า-หลัง)');
  }

  // ---- Fixed Shelf Minifix ----
  if (intent.shelf?.enabled && intent.shelf.supportType === 'FIXED') {
    const shelfCount = intent.shelf.count || 1;

    for (let s = 0; s < shelfCount; s++) {
      // 4 cams on each side for shelf
      for (let i = 0; i < 2; i++) {
        operations.push(createDrillOp('LEFT_SIDE', DRILL_TEMPLATES.MINIFIX_CAM, `CAM_SHELF_${s}_L_${i}`));
        operations.push(createDrillOp('RIGHT_SIDE', DRILL_TEMPLATES.MINIFIX_CAM, `CAM_SHELF_${s}_R_${i}`));
      }
      // 4 bolts on shelf panel
      for (let i = 0; i < 4; i++) {
        operations.push(createDrillOp('SHELF', DRILL_TEMPLATES.MINIFIX_BOLT, `BOLT_SHELF_${s}_${i}`));
      }
    }
  }

  // ---- Back Panel Groove ----
  if (intent.backPanel) {
    const grooveDepth = (getDerived(derived, 'backPanelGrooveDepth') as number) || 8;

    operations.push(createDrillOp('LEFT_SIDE', { ...DRILL_TEMPLATES.BACK_GROOVE, depth: grooveDepth }, 'GROOVE_L'));
    operations.push(createDrillOp('RIGHT_SIDE', { ...DRILL_TEMPLATES.BACK_GROOVE, depth: grooveDepth }, 'GROOVE_R'));
    operations.push(createDrillOp('TOP', { ...DRILL_TEMPLATES.BACK_GROOVE, depth: grooveDepth }, 'GROOVE_T'));
    operations.push(createDrillOp('BOTTOM', { ...DRILL_TEMPLATES.BACK_GROOVE, depth: grooveDepth }, 'GROOVE_B'));

    notesTH.push(`ร่องหลังตู้ลึก ${grooveDepth}mm จากขอบหลัง`);
  }

  // ---- Door Hinge Holes ----
  if (intent.door?.enabled) {
    const doorHardwareSystem = getDerived(derived, 'doorHardwareSystem');

    if (doorHardwareSystem === 'CUP_HINGE') {
      const doorCount = intent.door.doorCount || 1;
      const hingesPerDoor = intent.door.doorHeight && intent.door.doorHeight > 800 ? 3 : 2;

      for (let d = 0; d < doorCount; d++) {
        for (let h = 0; h < hingesPerDoor; h++) {
          // Cup hole on door
          operations.push(createDrillOp('DOOR', DRILL_TEMPLATES.HINGE_CUP, `HINGE_CUP_D${d}_${h}`));
          // Mounting plate holes on side panel
          const sidePanel: PanelId = d === 0 ? 'LEFT_SIDE' : 'RIGHT_SIDE';
          operations.push(createDrillOp(sidePanel, DRILL_TEMPLATES.HINGE_PLATE, `HINGE_PLATE_D${d}_${h}_0`));
          operations.push(createDrillOp(sidePanel, DRILL_TEMPLATES.HINGE_PLATE, `HINGE_PLATE_D${d}_${h}_1`));
        }
      }

      notesTH.push(`บานพับถ้วย ${hingesPerDoor} ตำแหน่ง/บาน`);
    }
  }

  // ---- Drawer Slide Holes ----
  if (intent.drawer?.enabled) {
    const drawerCount = intent.drawer.drawerCount || 1;
    const drawerSlideType = getDerived(derived, 'drawerSlideType');

    for (let d = 0; d < drawerCount; d++) {
      if (drawerSlideType === 'UNDERMOUNT') {
        // Undermount slides mount on bottom of drawer area
        operations.push(createDrillOp('LEFT_SIDE', DRILL_TEMPLATES.SLIDE_MOUNT, `SLIDE_L_${d}_0`));
        operations.push(createDrillOp('LEFT_SIDE', DRILL_TEMPLATES.SLIDE_MOUNT, `SLIDE_L_${d}_1`));
        operations.push(createDrillOp('RIGHT_SIDE', DRILL_TEMPLATES.SLIDE_MOUNT, `SLIDE_R_${d}_0`));
        operations.push(createDrillOp('RIGHT_SIDE', DRILL_TEMPLATES.SLIDE_MOUNT, `SLIDE_R_${d}_1`));
      } else if (drawerSlideType === 'SIDE_MOUNT') {
        // Side-mount slides mount on sides
        for (let i = 0; i < 3; i++) {
          operations.push(createDrillOp('LEFT_SIDE', DRILL_TEMPLATES.SLIDE_MOUNT, `SLIDE_L_${d}_${i}`));
          operations.push(createDrillOp('RIGHT_SIDE', DRILL_TEMPLATES.SLIDE_MOUNT, `SLIDE_R_${d}_${i}`));
        }
      }
    }

    notesTH.push(`รูยึดรางลิ้นชัก ${drawerCount} ชุด`);
  }

  // ---- Add warnings from effects ----
  for (const effect of effects) {
    if (effect.severity === 'warn') {
      notesTH.push(`⚠️ ${effect.messageTH}`);
    }
  }

  return {
    operations,
    notesTH,
    system32: {
      firstHole,
      pitch,
    },
  };
}
