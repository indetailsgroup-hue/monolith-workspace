/**
 * Designer Rules - Default Rule Set (Thai Language)
 *
 * Rules derived from Assembly PDF specifications.
 * Each rule defines: when conditions → then effects
 *
 * v1.0: Initial rule set
 */

import type { DesignerRulePDF } from './types';

// ============================================
// COMPOSITION RULES
// ============================================

/**
 * COMPOSITION_LEFT_TO_RIGHT
 * การประกอบตู้จาก ซ้าย → ขวา เป็นมาตรฐานโรงงาน
 */
const COMPOSITION_LEFT_TO_RIGHT: DesignerRulePDF = {
  id: 'COMPOSITION_LEFT_TO_RIGHT',
  category: 'assembly',
  when: [
    { path: 'compositionDirection', op: 'eq', value: 'LEFT_TO_RIGHT' },
  ],
  then: [
    {
      severity: 'info',
      code: 'COMPOSITION_LEFT_TO_RIGHT',
      messageTH: 'ประกอบตู้จากซ้ายไปขวา (มาตรฐานโรงงาน)',
      messageEN: 'Assembly from left to right (factory standard)',
      derive: [{ key: 'assemblyDirection', value: 'LEFT_TO_RIGHT' }],
    },
  ],
};

/**
 * COMPOSITION_RIGHT_TO_LEFT
 * การประกอบตู้จาก ขวา → ซ้าย (กรณีพิเศษ)
 */
const COMPOSITION_RIGHT_TO_LEFT: DesignerRulePDF = {
  id: 'COMPOSITION_RIGHT_TO_LEFT',
  category: 'assembly',
  when: [
    { path: 'compositionDirection', op: 'eq', value: 'RIGHT_TO_LEFT' },
  ],
  then: [
    {
      severity: 'warn',
      code: 'COMPOSITION_RIGHT_TO_LEFT',
      messageTH: 'ประกอบตู้จากขวาไปซ้าย (ไม่ใช่มาตรฐาน)',
      messageEN: 'Assembly from right to left (non-standard)',
      derive: [{ key: 'assemblyDirection', value: 'RIGHT_TO_LEFT' }],
    },
  ],
};

// ============================================
// BASE LOGIC RULES
// ============================================

/**
 * ADJUSTABLE_FOOT_IS_JOINT
 * ขาปรับระดับใช้เป็นข้อต่อตู้ได้
 */
const ADJUSTABLE_FOOT_IS_JOINT: DesignerRulePDF = {
  id: 'ADJUSTABLE_FOOT_IS_JOINT',
  category: 'structural',
  when: [
    { path: 'baseLogic', op: 'eq', value: 'ADJUSTABLE_FOOT' },
  ],
  then: [
    {
      severity: 'info',
      code: 'ADJUSTABLE_FOOT_IS_JOINT',
      messageTH: 'ขาปรับระดับทำหน้าที่เป็นข้อต่อตู้',
      messageEN: 'Adjustable feet act as cabinet joints',
      derive: [
        { key: 'requiresLevelerHardware', value: true },
        { key: 'baseJointType', value: 'LEVELER' },
      ],
    },
  ],
};

/**
 * PLINTH_REQUIRES_KICKBOARD
 * ตู้มีขาตั้งต้องมีแผ่น Kickboard
 */
const PLINTH_REQUIRES_KICKBOARD: DesignerRulePDF = {
  id: 'PLINTH_REQUIRES_KICKBOARD',
  category: 'structural',
  when: [
    { path: 'baseLogic', op: 'eq', value: 'PLINTH' },
  ],
  then: [
    {
      severity: 'info',
      code: 'PLINTH_REQUIRES_KICKBOARD',
      messageTH: 'ตู้มีขาตั้งต้องมีแผ่นปิดหน้า (Kickboard)',
      messageEN: 'Plinth base requires kickboard panel',
      derive: [
        { key: 'requiresKickboard', value: true },
        { key: 'baseJointType', value: 'PLINTH' },
      ],
    },
  ],
};

/**
 * FLOOR_MOUNTED_CABINET
 * ตู้วางพื้นโดยตรง (ไม่มีขา)
 */
const FLOOR_MOUNTED_CABINET: DesignerRulePDF = {
  id: 'FLOOR_MOUNTED_CABINET',
  category: 'structural',
  when: [
    { path: 'baseLogic', op: 'eq', value: 'FLOOR' },
  ],
  then: [
    {
      severity: 'info',
      code: 'FLOOR_MOUNTED_CABINET',
      messageTH: 'ตู้วางพื้นโดยตรง',
      messageEN: 'Floor-mounted cabinet (no legs)',
      derive: [
        { key: 'requiresLevelerHardware', value: false },
        { key: 'baseJointType', value: 'DIRECT' },
      ],
    },
  ],
};

// ============================================
// SHELF RULES
// ============================================

/**
 * SHELF_14MM_REQUIRES_DEDICATED_SLOT
 * ชั้นวาง 14mm ต้องใช้ร่องเฉพาะ
 */
const SHELF_14MM_REQUIRES_DEDICATED_SLOT: DesignerRulePDF = {
  id: 'SHELF_14MM_REQUIRES_DEDICATED_SLOT',
  category: 'shelf',
  when: [
    { path: 'shelf.thickness', op: 'eq', value: 14 },
    { path: 'shelf.supportType', op: 'eq', value: 'ADJUSTABLE' },
  ],
  then: [
    {
      severity: 'warn',
      code: 'SHELF_14MM_REQUIRES_DEDICATED_SLOT',
      messageTH: 'ชั้นวาง 14mm ต้องใช้ร่องรับชั้นเฉพาะ (ไม่ใช่ System 32 มาตรฐาน)',
      messageEN: '14mm shelf requires dedicated slot (not standard System 32)',
      derive: [{ key: 'shelfSlotType', value: 'DEDICATED_14MM' }],
    },
  ],
};

/**
 * SHELF_18MM_SYSTEM_32
 * ชั้นวาง 18mm ใช้ System 32 มาตรฐาน
 */
const SHELF_18MM_SYSTEM_32: DesignerRulePDF = {
  id: 'SHELF_18MM_SYSTEM_32',
  category: 'shelf',
  when: [
    { path: 'shelf.thickness', op: 'gte', value: 18 },
    { path: 'shelf.supportType', op: 'eq', value: 'ADJUSTABLE' },
  ],
  then: [
    {
      severity: 'info',
      code: 'SHELF_18MM_SYSTEM_32',
      messageTH: 'ชั้นวาง 18mm ใช้ System 32 มาตรฐาน',
      messageEN: '18mm shelf uses standard System 32',
      derive: [{ key: 'shelfSlotType', value: 'SYSTEM_32' }],
    },
  ],
};

/**
 * SHELF_FIXED_NEEDS_MINIFIX
 * ชั้นวางแบบตายตัวต้องใช้ Minifix
 */
const SHELF_FIXED_NEEDS_MINIFIX: DesignerRulePDF = {
  id: 'SHELF_FIXED_NEEDS_MINIFIX',
  category: 'shelf',
  when: [
    { path: 'shelf.supportType', op: 'eq', value: 'FIXED' },
  ],
  then: [
    {
      severity: 'info',
      code: 'SHELF_FIXED_NEEDS_MINIFIX',
      messageTH: 'ชั้นวางแบบตายตัวใช้ Minifix ยึด',
      messageEN: 'Fixed shelf uses Minifix connectors',
      derive: [{ key: 'shelfConnectorType', value: 'MINIFIX' }],
    },
  ],
};

/**
 * SHELF_SPAN_LIMIT
 * ชั้นวางยาวเกิน 800mm ต้องมีตัวรับกลาง
 */
const SHELF_SPAN_LIMIT: DesignerRulePDF = {
  id: 'SHELF_SPAN_LIMIT',
  category: 'shelf',
  when: [
    { path: 'shelf.spanMM', op: 'gt', value: 800 },
    { path: 'shelf.midSupport', op: 'eq', value: false },
  ],
  then: [
    {
      severity: 'block',
      code: 'SHELF_SPAN_LIMIT',
      messageTH: 'ชั้นวางยาวเกิน 800mm ต้องมีตัวรับกลาง',
      messageEN: 'Shelf span > 800mm requires center support',
      require: [{ path: 'shelf.midSupport', op: 'eq', value: true }],
    },
  ],
};

// ============================================
// DOOR RULES
// ============================================

/**
 * JET_REQUIRES_DEEP_SHELF
 * บานพับ JET ต้องใช้กับตู้ลึก
 */
const JET_REQUIRES_DEEP_SHELF: DesignerRulePDF = {
  id: 'JET_REQUIRES_DEEP_SHELF',
  category: 'door',
  when: [
    { path: 'door.flapSystem', op: 'eq', value: 'JET' },
  ],
  then: [
    {
      severity: 'warn',
      code: 'JET_REQUIRES_DEEP_SHELF',
      messageTH: 'ระบบ JET Flap ต้องใช้กับตู้ที่มีความลึกเพียงพอ (≥350mm)',
      messageEN: 'JET Flap system requires sufficient cabinet depth (≥350mm)',
      require: [{ path: 'dimensions.depth', op: 'gte', value: 350 }],
    },
  ],
};

/**
 * LIFT_SYSTEM_AVENTOS
 * ระบบยกบาน Aventos
 */
const LIFT_SYSTEM_AVENTOS: DesignerRulePDF = {
  id: 'LIFT_SYSTEM_AVENTOS',
  category: 'door',
  when: [
    { path: 'door.flapSystem', op: 'eq', value: 'AVENTOS' },
  ],
  then: [
    {
      severity: 'info',
      code: 'LIFT_SYSTEM_AVENTOS',
      messageTH: 'ระบบ Aventos สำหรับบานยกขึ้น',
      messageEN: 'Aventos system for lift-up doors',
      derive: [
        { key: 'doorHardwareSystem', value: 'AVENTOS' },
        { key: 'requiresAventosHardware', value: true },
      ],
    },
  ],
};

/**
 * DOOR_SWING_CUP_HINGE
 * บานเปิดธรรมดาใช้บานพับถ้วย
 */
const DOOR_SWING_CUP_HINGE: DesignerRulePDF = {
  id: 'DOOR_SWING_CUP_HINGE',
  category: 'door',
  when: [
    { path: 'door.doorType', op: 'eq', value: 'SWING' },
  ],
  then: [
    {
      severity: 'info',
      code: 'DOOR_SWING_CUP_HINGE',
      messageTH: 'บานเปิดธรรมดาใช้บานพับถ้วย (Cup Hinge)',
      messageEN: 'Swing door uses cup hinges',
      derive: [
        { key: 'doorHingeType', value: 'CUP' },
        { key: 'doorHardwareSystem', value: 'CUP_HINGE' },
      ],
    },
  ],
};

/**
 * DOOR_OVERLAY_FULL
 * บานปิดเต็ม (Full Overlay)
 */
const DOOR_OVERLAY_FULL: DesignerRulePDF = {
  id: 'DOOR_OVERLAY_FULL',
  category: 'door',
  when: [
    { path: 'door.overlayType', op: 'eq', value: 'FULL' },
  ],
  then: [
    {
      severity: 'info',
      code: 'DOOR_OVERLAY_FULL',
      messageTH: 'บานปิดเต็ม (Full Overlay) - ปิดหน้าไม้เสริมทั้งหมด',
      messageEN: 'Full overlay door covers entire face frame',
      derive: [{ key: 'doorOverlayMM', value: 18 }],
    },
  ],
};

/**
 * DOOR_OVERLAY_HALF
 * บานปิดครึ่ง (Half Overlay)
 */
const DOOR_OVERLAY_HALF: DesignerRulePDF = {
  id: 'DOOR_OVERLAY_HALF',
  category: 'door',
  when: [
    { path: 'door.overlayType', op: 'eq', value: 'HALF' },
  ],
  then: [
    {
      severity: 'info',
      code: 'DOOR_OVERLAY_HALF',
      messageTH: 'บานปิดครึ่ง (Half Overlay) - ปิดหน้าไม้เสริมครึ่งหนึ่ง',
      messageEN: 'Half overlay door covers half of face frame',
      derive: [{ key: 'doorOverlayMM', value: 9 }],
    },
  ],
};

// ============================================
// DRAWER RULES
// ============================================

/**
 * PUSH_OPEN_REQUIRES_SYNC_BAR
 * ลิ้นชัก Push-Open ต้องมี Sync Bar
 */
const PUSH_OPEN_REQUIRES_SYNC_BAR: DesignerRulePDF = {
  id: 'PUSH_OPEN_REQUIRES_SYNC_BAR',
  category: 'drawer',
  when: [
    { path: 'drawer.openMechanism', op: 'eq', value: 'PUSH_OPEN' },
  ],
  then: [
    {
      severity: 'warn',
      code: 'PUSH_OPEN_REQUIRES_SYNC_BAR',
      messageTH: 'ลิ้นชัก Push-Open ต้องมี Sync Bar เพื่อเปิดพร้อมกันทั้งสองข้าง',
      messageEN: 'Push-open drawer requires Sync Bar for synchronized opening',
      derive: [
        { key: 'requiresSyncBar', value: true },
        { key: 'drawerOpenSystem', value: 'PUSH_OPEN' },
      ],
    },
  ],
};

/**
 * UNDERMOUNT_SLIDE_STANDARD
 * รางลิ้นชักใต้ฐาน (Undermount) มาตรฐาน
 */
const UNDERMOUNT_SLIDE_STANDARD: DesignerRulePDF = {
  id: 'UNDERMOUNT_SLIDE_STANDARD',
  category: 'drawer',
  when: [
    { path: 'drawer.slideType', op: 'eq', value: 'UNDERMOUNT' },
  ],
  then: [
    {
      severity: 'info',
      code: 'UNDERMOUNT_SLIDE_STANDARD',
      messageTH: 'รางลิ้นชักใต้ฐาน (Undermount) - รับน้ำหนักได้ดี',
      messageEN: 'Undermount slides - excellent weight capacity',
      derive: [
        { key: 'drawerSlideType', value: 'UNDERMOUNT' },
        { key: 'drawerMaxLoadKG', value: 30 },
      ],
    },
  ],
};

/**
 * SIDE_MOUNT_SLIDE
 * รางลิ้นชักข้างตู้ (Side Mount)
 */
const SIDE_MOUNT_SLIDE: DesignerRulePDF = {
  id: 'SIDE_MOUNT_SLIDE',
  category: 'drawer',
  when: [
    { path: 'drawer.slideType', op: 'eq', value: 'SIDE_MOUNT' },
  ],
  then: [
    {
      severity: 'info',
      code: 'SIDE_MOUNT_SLIDE',
      messageTH: 'รางลิ้นชักข้างตู้ (Side Mount)',
      messageEN: 'Side-mount drawer slides',
      derive: [
        { key: 'drawerSlideType', value: 'SIDE_MOUNT' },
        { key: 'drawerMaxLoadKG', value: 25 },
      ],
    },
  ],
};

/**
 * DRAWER_FRONT_MIN_HEIGHT
 * ความสูงหน้าลิ้นชักขั้นต่ำ
 */
const DRAWER_FRONT_MIN_HEIGHT: DesignerRulePDF = {
  id: 'DRAWER_FRONT_MIN_HEIGHT',
  category: 'drawer',
  when: [
    { path: 'drawer.frontHeightMM', op: 'lt', value: 80 },
  ],
  then: [
    {
      severity: 'block',
      code: 'DRAWER_FRONT_MIN_HEIGHT',
      messageTH: 'หน้าลิ้นชักต้องสูงอย่างน้อย 80mm',
      messageEN: 'Drawer front must be at least 80mm tall',
      require: [{ path: 'drawer.frontHeightMM', op: 'gte', value: 80 }],
    },
  ],
};

/**
 * SOFT_CLOSE_DRAWER
 * ลิ้นชัก Soft-Close
 */
const SOFT_CLOSE_DRAWER: DesignerRulePDF = {
  id: 'SOFT_CLOSE_DRAWER',
  category: 'drawer',
  when: [
    { path: 'drawer.softClose', op: 'eq', value: true },
  ],
  then: [
    {
      severity: 'info',
      code: 'SOFT_CLOSE_DRAWER',
      messageTH: 'ลิ้นชักแบบ Soft-Close',
      messageEN: 'Soft-close drawer mechanism',
      derive: [{ key: 'requiresSoftCloseHardware', value: true }],
    },
  ],
};

// ============================================
// BACK PANEL RULES
// ============================================

/**
 * BACK_PANEL_GROOVE
 * หลังตู้เดินร่อง
 */
const BACK_PANEL_GROOVE: DesignerRulePDF = {
  id: 'BACK_PANEL_GROOVE',
  category: 'structural',
  when: [
    { path: 'backPanel', op: 'eq', value: true },
  ],
  then: [
    {
      severity: 'info',
      code: 'BACK_PANEL_GROOVE',
      messageTH: 'หลังตู้เดินร่องลึก 8mm จากขอบหลัง',
      messageEN: 'Back panel groove 8mm from back edge',
      derive: [
        { key: 'backPanelGrooveDepth', value: 8 },
        { key: 'backPanelThickness', value: 6 },
      ],
    },
  ],
};

// ============================================
// MINIFIX RULES
// ============================================

/**
 * MINIFIX_REQUIRES_16MM
 * Minifix ต้องใช้ไม้อย่างน้อย 16mm
 */
const MINIFIX_REQUIRES_16MM: DesignerRulePDF = {
  id: 'MINIFIX_REQUIRES_16MM',
  category: 'structural',
  when: [
    { path: 'connectorType', op: 'eq', value: 'MINIFIX' },
    { path: 'panelThickness', op: 'lt', value: 16 },
  ],
  then: [
    {
      severity: 'block',
      code: 'MINIFIX_REQUIRES_16MM',
      messageTH: 'Minifix ต้องใช้ไม้อย่างน้อย 16mm',
      messageEN: 'Minifix requires panel thickness >= 16mm',
      require: [{ path: 'panelThickness', op: 'gte', value: 16 }],
    },
  ],
};

/**
 * MINIFIX_DISTANCE_B
 * ระยะ B สำหรับ Minifix = 24mm
 */
const MINIFIX_DISTANCE_B: DesignerRulePDF = {
  id: 'MINIFIX_DISTANCE_B',
  category: 'drilling',
  when: [
    { path: 'connectorType', op: 'eq', value: 'MINIFIX' },
  ],
  then: [
    {
      severity: 'info',
      code: 'MINIFIX_DISTANCE_B',
      messageTH: 'ระยะ B (ขอบไม้ → แกนกลาง Bolt) = 24mm',
      messageEN: 'Distance B (edge to bolt center) = 24mm',
      derive: [
        { key: 'minifixDistanceB', value: 24 },
        { key: 'minifixCamDia', value: 15 },
        { key: 'minifixBoltDia', value: 10 },
      ],
    },
  ],
};

// ============================================
// SYSTEM 32 RULES
// ============================================

/**
 * SYSTEM_32_FIRST_HOLE
 * รู System 32 ตัวแรกอยู่ที่ 37mm จากขอบหน้า
 */
const SYSTEM_32_FIRST_HOLE: DesignerRulePDF = {
  id: 'SYSTEM_32_FIRST_HOLE',
  category: 'drilling',
  when: [
    { path: 'usesSystem32', op: 'eq', value: true },
  ],
  then: [
    {
      severity: 'info',
      code: 'SYSTEM_32_FIRST_HOLE',
      messageTH: 'รู System 32 ตัวแรกอยู่ที่ 37mm จากขอบหน้า ระยะห่าง 32mm',
      messageEN: 'System 32 first hole at 37mm from front edge, 32mm pitch',
      derive: [
        { key: 'system32FirstHole', value: 37 },
        { key: 'system32Pitch', value: 32 },
      ],
    },
  ],
};

// ============================================
// EXPORT ALL DEFAULT RULES
// ============================================

export const DEFAULT_DESIGNER_RULES: DesignerRulePDF[] = [
  // Composition
  COMPOSITION_LEFT_TO_RIGHT,
  COMPOSITION_RIGHT_TO_LEFT,

  // Base Logic
  ADJUSTABLE_FOOT_IS_JOINT,
  PLINTH_REQUIRES_KICKBOARD,
  FLOOR_MOUNTED_CABINET,

  // Shelf
  SHELF_14MM_REQUIRES_DEDICATED_SLOT,
  SHELF_18MM_SYSTEM_32,
  SHELF_FIXED_NEEDS_MINIFIX,
  SHELF_SPAN_LIMIT,

  // Door
  JET_REQUIRES_DEEP_SHELF,
  LIFT_SYSTEM_AVENTOS,
  DOOR_SWING_CUP_HINGE,
  DOOR_OVERLAY_FULL,
  DOOR_OVERLAY_HALF,

  // Drawer
  PUSH_OPEN_REQUIRES_SYNC_BAR,
  UNDERMOUNT_SLIDE_STANDARD,
  SIDE_MOUNT_SLIDE,
  DRAWER_FRONT_MIN_HEIGHT,
  SOFT_CLOSE_DRAWER,

  // Back Panel
  BACK_PANEL_GROOVE,

  // Minifix
  MINIFIX_REQUIRES_16MM,
  MINIFIX_DISTANCE_B,

  // System 32
  SYSTEM_32_FIRST_HOLE,
];

// Export individual rules for selective use
export {
  COMPOSITION_LEFT_TO_RIGHT,
  COMPOSITION_RIGHT_TO_LEFT,
  ADJUSTABLE_FOOT_IS_JOINT,
  PLINTH_REQUIRES_KICKBOARD,
  FLOOR_MOUNTED_CABINET,
  SHELF_14MM_REQUIRES_DEDICATED_SLOT,
  SHELF_18MM_SYSTEM_32,
  SHELF_FIXED_NEEDS_MINIFIX,
  SHELF_SPAN_LIMIT,
  JET_REQUIRES_DEEP_SHELF,
  LIFT_SYSTEM_AVENTOS,
  DOOR_SWING_CUP_HINGE,
  DOOR_OVERLAY_FULL,
  DOOR_OVERLAY_HALF,
  PUSH_OPEN_REQUIRES_SYNC_BAR,
  UNDERMOUNT_SLIDE_STANDARD,
  SIDE_MOUNT_SLIDE,
  DRAWER_FRONT_MIN_HEIGHT,
  SOFT_CLOSE_DRAWER,
  BACK_PANEL_GROOVE,
  MINIFIX_REQUIRES_16MM,
  MINIFIX_DISTANCE_B,
  SYSTEM_32_FIRST_HOLE,
};
