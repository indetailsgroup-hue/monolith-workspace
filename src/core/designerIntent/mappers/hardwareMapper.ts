/**
 * Hardware Mapper - Intent to Hardware Selection
 *
 * Maps designer intent and rule effects to hardware selection.
 *
 * v1.0: Initial implementation
 */

import type {
  DesignerIntentPDF,
  RuleEffect,
  HardwareSelectionPDF,
  HardwareItemPDF,
} from '../types';

// ============================================
// HARDWARE CATALOG REFERENCES
// ============================================

const HARDWARE_CATALOG = {
  // Minifix
  MINIFIX_CAM_15: {
    catalogId: 'MINIFIX-CAM-15',
    nameTH: 'แคมล็อค Minifix Ø15',
    nameEN: 'Minifix Cam Lock Ø15',
  },
  MINIFIX_BOLT_S200: {
    catalogId: 'MINIFIX-BOLT-S200',
    nameTH: 'สลัก Minifix S200',
    nameEN: 'Minifix Bolt S200',
  },

  // Hinges
  CUP_HINGE_35: {
    catalogId: 'CUP-HINGE-35',
    nameTH: 'บานพับถ้วย Ø35',
    nameEN: 'Cup Hinge Ø35',
  },
  AVENTOS_HF: {
    catalogId: 'AVENTOS-HF',
    nameTH: 'Aventos HF',
    nameEN: 'Aventos HF Lift System',
  },
  JET_FLAP: {
    catalogId: 'JET-FLAP',
    nameTH: 'JET Flap',
    nameEN: 'JET Flap System',
  },

  // Shelf Pins
  SHELF_PIN_5: {
    catalogId: 'SHELF-PIN-5',
    nameTH: 'พินรับชั้น Ø5',
    nameEN: 'Shelf Pin Ø5',
  },
  SHELF_PIN_5_14MM: {
    catalogId: 'SHELF-PIN-5-14MM',
    nameTH: 'พินรับชั้น Ø5 สำหรับไม้ 14mm',
    nameEN: 'Shelf Pin Ø5 for 14mm panel',
  },

  // Drawer Slides
  UNDERMOUNT_SLIDE: {
    catalogId: 'UNDERMOUNT-SLIDE',
    nameTH: 'รางลิ้นชักใต้ฐาน',
    nameEN: 'Undermount Drawer Slide',
  },
  SIDE_MOUNT_SLIDE: {
    catalogId: 'SIDE-MOUNT-SLIDE',
    nameTH: 'รางลิ้นชักข้างตู้',
    nameEN: 'Side Mount Drawer Slide',
  },
  SYNC_BAR: {
    catalogId: 'SYNC-BAR',
    nameTH: 'Sync Bar',
    nameEN: 'Sync Bar for Push-Open',
  },
  SOFT_CLOSE_DAMPER: {
    catalogId: 'SOFT-CLOSE-DAMPER',
    nameTH: 'Damper Soft-Close',
    nameEN: 'Soft-Close Damper',
  },

  // Levelers
  ADJUSTABLE_LEVELER: {
    catalogId: 'LEVELER-ADJ',
    nameTH: 'ขาปรับระดับ',
    nameEN: 'Adjustable Cabinet Leveler',
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
 * Create hardware item.
 */
function createHardwareItem(
  catalog: { catalogId: string; nameTH: string; nameEN: string },
  quantity: number,
  noteTH?: string
): HardwareItemPDF {
  return {
    catalogId: catalog.catalogId,
    nameTH: catalog.nameTH,
    nameEN: catalog.nameEN,
    quantity,
    noteTH,
  };
}

// ============================================
// MAIN MAPPER
// ============================================

/**
 * Map intent and effects to hardware selection.
 */
export function hardwareMapper(
  intent: DesignerIntentPDF,
  effects: RuleEffect[],
  derived: Record<string, unknown>
): HardwareSelectionPDF {
  const hardware: HardwareItemPDF[] = [];
  const notesTH: string[] = [];

  // ---- Carcass Connectors ----
  // Base cabinet always needs 8 minifix (4 per joint)
  hardware.push(createHardwareItem(HARDWARE_CATALOG.MINIFIX_CAM_15, 8));
  hardware.push(createHardwareItem(HARDWARE_CATALOG.MINIFIX_BOLT_S200, 8));

  // ---- Base Logic Hardware ----
  if (getDerived(derived, 'requiresLevelerHardware') === true) {
    hardware.push(
      createHardwareItem(
        HARDWARE_CATALOG.ADJUSTABLE_LEVELER,
        4,
        'ขาปรับระดับ 4 ตัว (4 มุม)'
      )
    );
  }

  // ---- Shelf Hardware ----
  if (intent.shelf?.enabled) {
    const shelfCount = intent.shelf.count || 1;
    const shelfSlotType = getDerived(derived, 'shelfSlotType');

    if (intent.shelf.supportType === 'ADJUSTABLE') {
      const pinCatalog =
        shelfSlotType === 'DEDICATED_14MM'
          ? HARDWARE_CATALOG.SHELF_PIN_5_14MM
          : HARDWARE_CATALOG.SHELF_PIN_5;

      hardware.push(
        createHardwareItem(
          pinCatalog,
          shelfCount * 4,
          `พินรับชั้น ${shelfCount} ชั้น (4 ตัว/ชั้น)`
        )
      );
    } else if (intent.shelf.supportType === 'FIXED') {
      // Fixed shelves use minifix
      hardware.push(
        createHardwareItem(
          HARDWARE_CATALOG.MINIFIX_CAM_15,
          shelfCount * 4,
          `Minifix สำหรับชั้นตายตัว ${shelfCount} ชั้น`
        )
      );
      hardware.push(
        createHardwareItem(
          HARDWARE_CATALOG.MINIFIX_BOLT_S200,
          shelfCount * 4
        )
      );
    }
  }

  // ---- Door Hardware ----
  if (intent.door?.enabled) {
    const doorCount = intent.door.doorCount || 1;
    const doorHardwareSystem = getDerived(derived, 'doorHardwareSystem');

    if (doorHardwareSystem === 'CUP_HINGE') {
      // Cup hinges: 2-3 per door based on height
      const hingesPerDoor = intent.door.doorHeight && intent.door.doorHeight > 800 ? 3 : 2;
      hardware.push(
        createHardwareItem(
          HARDWARE_CATALOG.CUP_HINGE_35,
          doorCount * hingesPerDoor,
          `บานพับถ้วย ${hingesPerDoor} ตัว/บาน`
        )
      );
    } else if (doorHardwareSystem === 'AVENTOS') {
      hardware.push(
        createHardwareItem(
          HARDWARE_CATALOG.AVENTOS_HF,
          doorCount,
          'ชุด Aventos HF สำหรับบานยกขึ้น'
        )
      );
    } else if (intent.door.flapSystem === 'JET') {
      hardware.push(
        createHardwareItem(
          HARDWARE_CATALOG.JET_FLAP,
          doorCount,
          'ชุด JET Flap'
        )
      );
      notesTH.push('ระบบ JET Flap ต้องใช้กับตู้ที่มีความลึกเพียงพอ');
    }
  }

  // ---- Drawer Hardware ----
  if (intent.drawer?.enabled) {
    const drawerCount = intent.drawer.drawerCount || 1;
    const drawerSlideType = getDerived(derived, 'drawerSlideType');

    if (drawerSlideType === 'UNDERMOUNT') {
      hardware.push(
        createHardwareItem(
          HARDWARE_CATALOG.UNDERMOUNT_SLIDE,
          drawerCount * 2,
          `รางลิ้นชักใต้ฐาน ${drawerCount} ชุด (2 ราง/ลิ้นชัก)`
        )
      );
    } else if (drawerSlideType === 'SIDE_MOUNT') {
      hardware.push(
        createHardwareItem(
          HARDWARE_CATALOG.SIDE_MOUNT_SLIDE,
          drawerCount * 2,
          `รางลิ้นชักข้างตู้ ${drawerCount} ชุด (2 ราง/ลิ้นชัก)`
        )
      );
    }

    // Sync Bar for push-open
    if (getDerived(derived, 'requiresSyncBar') === true) {
      hardware.push(
        createHardwareItem(
          HARDWARE_CATALOG.SYNC_BAR,
          drawerCount,
          'Sync Bar สำหรับ Push-Open'
        )
      );
    }

    // Soft-close
    if (getDerived(derived, 'requiresSoftCloseHardware') === true) {
      hardware.push(
        createHardwareItem(
          HARDWARE_CATALOG.SOFT_CLOSE_DAMPER,
          drawerCount * 2,
          'Damper Soft-Close'
        )
      );
    }
  }

  // ---- Add notes from effects ----
  for (const effect of effects) {
    if (effect.severity === 'warn' || effect.severity === 'block') {
      notesTH.push(effect.messageTH);
    }
  }

  return {
    hardware,
    notesTH,
  };
}
