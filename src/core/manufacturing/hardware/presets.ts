/**
 * Hardware Presets - Standard Hardware Configurations
 *
 * Pre-configured hardware presets for common cabinet configurations.
 * Inspired by Indetails Smart hardware system.
 *
 * v1.0: Initial implementation with Minifix, Hinge, Shelf Pin presets
 */

import {
  HardwarePreset,
  HardwareLibrary,
  MfgOp,
  HardwareCtx,
  DEFAULT_CAM_SPEC,
  hasTag,
  getTagValue,
  snapToSystem32,
  calculateRequiredHinges,
} from './hardwareTypes';

// ============================================
// MINIFIX LAYOUT RULES (from CAD reference)
// B < 400mm: 2 Minifix per joint with dowels
// A > 400mm: 3+ Minifix per joint with dowels
// System 32 pitch = 32mm spacing
// ============================================

/**
 * Calculate number of Minifix connectors based on panel dimension
 * Rules from CAD:
 * - B < 400mm: 2 Minifix
 * - A > 400mm: 3+ Minifix (one per ~128mm = 4× System 32)
 */
function calculateMinifixCount(dimension: number): number {
  if (dimension < 400) {
    return 2;
  }
  // For larger panels: 3+ Minifix at 128mm intervals (4× System 32)
  const additionalPairs = Math.floor((dimension - 400) / 128);
  return 3 + additionalPairs;
}

// ============================================
// MINIFIX PRESET (Updated with CAD specs)
// ============================================

export const PRESET_MINIFIX: HardwarePreset = {
  id: 'MINIFIX_15_STD',
  kind: 'MINIFIX',
  name: 'Minifix 15 Connector',
  nameTh: 'มินิฟิกซ์ 15',

  matches: (ctx) => {
    // Minifix used on side panels, top, bottom connecting to horizontal/vertical panels
    return hasTag(ctx.tags, 'TYPE:SIDE_PANEL') ||
           hasTag(ctx.tags, 'TYPE:TOP') ||
           hasTag(ctx.tags, 'TYPE:BOTTOM') ||
           hasTag(ctx.tags, 'JOINERY:MINIFIX');
  },

  generate: (ctx) => {
    const ops: MfgOp[] = [];
    const spec = ctx.spec || DEFAULT_CAM_SPEC;

    // Minifix layout dimensions (from Häfele specification)
    // CRITICAL: CAM and Bolt must be COAXIAL (same Distance B)
    // - Distance B: 24mm (Minifix 12) or 34mm (Minifix 15)
    // - Cam housing: 15mm diameter, 12.5mm depth
    // - Bolt hole: 8mm diameter
    // - Dowel: 8mm diameter, 32mm offset (System 32), 30mm length

    const SYSTEM_32 = 32; // System 32 pitch for spacing
    const DRILLING_DISTANCE_B = 24; // Distance B = 24mm per CAD spec (Indetails standard)
    const DOWEL_OFFSET_X = 32; // Dowel X offset from cam center (System 32)
    const DOWEL_LENGTH = 30; // Dowel length in mm
    const EDGE_MARGIN = 50; // Margin from panel edge

    // Calculate number of minifix pairs based on panel width
    const pairCount = calculateMinifixCount(ctx.width);

    // Calculate spacing between minifix pairs
    const usableWidth = ctx.width - (2 * EDGE_MARGIN);
    const spacing = pairCount > 1 ? usableWidth / (pairCount - 1) : 0;

    // Snap spacing to System 32 grid
    const snappedSpacing = Math.round(spacing / SYSTEM_32) * SYSTEM_32;

    for (let i = 0; i < pairCount; i++) {
      // Calculate X position (centered on panel)
      const x = EDGE_MARGIN + (i * (snappedSpacing || usableWidth));

      // Cam housing (face drill on horizontal panel - 15mm bore)
      // CRITICAL: CAM center must be at Distance B from panel edge
      ops.push({
        type: 'BORE',
        x: x,
        y: DRILLING_DISTANCE_B, // Distance B from connecting edge (COAXIAL with bolt)
        z: spec.minifixCamDepth,
        dia: spec.minifixCamDia, // 15mm
        face: 'A',
        toolId: 'T_BORE_15',
      });

      // Bolt hole (edge drill - 8mm)
      // CRITICAL: Bolt center must be at Distance B from panel edge (COAXIAL with CAM)
      ops.push({
        type: 'DRILL',
        x: x,
        y: DRILLING_DISTANCE_B, // Distance B from panel edge (COAXIAL with CAM)
        z: spec.minifixBoltLength, // Full bolt length (31mm)
        dia: spec.minifixBoltDia, // 8mm for S200 bolt sleeve
        face: 'A',
        edge: 'BOTTOM',
        toolId: 'T_DRILL_8',
      });

      // Dowel hole (alignment - offset from cam on System 32 grid)
      ops.push({
        type: 'DRILL',
        x: x + DOWEL_OFFSET_X, // 32mm offset from cam center (System 32)
        y: DRILLING_DISTANCE_B, // Same Y as CAM (coplanar)
        z: DOWEL_LENGTH / 2, // Half into panel (15mm)
        dia: spec.minifixDowelDia, // 8mm
        face: 'A',
        toolId: 'T_DRILL_8',
      });
    }

    return ops;
  },
};

// ============================================
// HINGE CUP PRESET (35mm Concealed Hinge)
// ============================================

export const PRESET_HINGE_35: HardwarePreset = {
  id: 'HINGE_35_STD',
  kind: 'HINGE',
  name: 'Concealed Hinge 35mm',
  nameTh: 'บานพับซ่อน 35mm',

  matches: (ctx) => hasTag(ctx.tags, 'TYPE:DOOR'),

  generate: (ctx) => {
    const ops: MfgOp[] = [];
    const spec = ctx.spec || DEFAULT_CAM_SPEC;
    const hingeSide = getTagValue(ctx.tags, 'HINGE') || spec.hingeSide;
    const count = calculateRequiredHinges(ctx.height, ctx.weight);

    // Safety margins
    const topInset = Math.max(spec.hingeCupInsetY, spec.hingeCupMinEdge);
    const botInset = Math.max(spec.hingeCupInsetY, spec.hingeCupMinEdge);
    const usableH = ctx.height - topInset - botInset;

    // X Position
    const xPos = hingeSide === 'left'
      ? spec.hingeCupInsetX
      : (ctx.width - spec.hingeCupInsetX);

    for (let i = 0; i < count; i++) {
      let yPos = 0;
      if (count === 2) {
        yPos = i === 0 ? topInset : (ctx.height - botInset);
      } else {
        // Distribute evenly
        const t = i / (count - 1);
        yPos = topInset + (usableH * t);
      }

      // Snap to System 32 vertical grid
      yPos = snapToSystem32(yPos, spec.system32StartOffset);

      // Cup hole (35mm bore)
      ops.push({
        type: 'BORE',
        x: xPos,
        y: yPos,
        z: spec.hingeCupDepth,
        dia: spec.hingeCupDia,
        face: 'A',
        toolId: 'T_BORE_35',
      });

      // Pilot holes for screws (optional, 2x 3mm)
      // Standard pattern: 45mm spread centered on cup
      const screwSpread = 45;
      ops.push({
        type: 'DRILL',
        x: xPos,
        y: yPos - screwSpread / 2,
        z: 8,
        dia: 3,
        face: 'A',
        toolId: 'T_DRILL_3',
      });
      ops.push({
        type: 'DRILL',
        x: xPos,
        y: yPos + screwSpread / 2,
        z: 8,
        dia: 3,
        face: 'A',
        toolId: 'T_DRILL_3',
      });
    }

    return ops;
  },
};

// ============================================
// SHELF PIN PRESET (System 32)
// ============================================

export const PRESET_SHELF_PIN_5: HardwarePreset = {
  id: 'SHELF_PIN_5_SYS32',
  kind: 'SHELF_PIN',
  name: 'Shelf Pins 5mm (System 32)',
  nameTh: 'หมุดชั้น 5mm (ระบบ 32)',

  matches: (ctx) => {
    return hasTag(ctx.tags, 'TYPE:SIDE_PANEL') ||
           hasTag(ctx.tags, 'TYPE:DIVIDER') ||
           hasTag(ctx.tags, 'SHELF_PIN:TRUE');
  },

  generate: (ctx) => {
    const ops: MfgOp[] = [];
    const spec = ctx.spec || DEFAULT_CAM_SPEC;

    const startY = spec.shelfPinInsetYBottom;
    const endY = ctx.height - spec.shelfPinInsetYTop;
    const pitch = spec.system32Pitch;

    // Front column
    const xFront = spec.shelfPinInsetX;
    // Back column
    const xBack = ctx.width - spec.shelfPinInsetX;

    for (let y = startY; y <= endY; y += pitch) {
      const snappedY = snapToSystem32(y, spec.system32StartOffset);

      // Front hole
      ops.push({
        type: 'DRILL',
        x: xFront,
        y: snappedY,
        z: spec.shelfPinDepth,
        dia: spec.shelfPinDia,
        face: 'A',
        toolId: 'T_DRILL_5',
      });

      // Back hole
      ops.push({
        type: 'DRILL',
        x: xBack,
        y: snappedY,
        z: spec.shelfPinDepth,
        dia: spec.shelfPinDia,
        face: 'A',
        toolId: 'T_DRILL_5',
      });
    }

    return ops;
  },
};

// ============================================
// CONFIRMAT PRESET
// ============================================

export const PRESET_CONFIRMAT: HardwarePreset = {
  id: 'CONFIRMAT_7X50',
  kind: 'CONFIRMAT',
  name: 'Confirmat 7×50mm',
  nameTh: 'คอนเฟอร์แมท 7×50mm',

  matches: (ctx) => hasTag(ctx.tags, 'JOINERY:CONFIRMAT'),

  generate: (ctx) => {
    const ops: MfgOp[] = [];
    const spec = ctx.spec || DEFAULT_CAM_SPEC;

    const edgeDistance = 50; // 50mm from edge
    const spacing = 200; // 200mm between screws

    // Calculate screw positions
    const usableWidth = ctx.width - (2 * edgeDistance);
    const screwCount = Math.max(2, Math.floor(usableWidth / spacing) + 1);

    for (let i = 0; i < screwCount; i++) {
      const x = edgeDistance + (i * (usableWidth / (screwCount - 1)));

      // Pilot hole (5mm)
      ops.push({
        type: 'DRILL',
        x: x,
        y: ctx.thickness / 2, // Center of thickness
        z: 40, // Depth for 50mm screw
        dia: spec.confirmatPilotDia,
        face: 'A',
        edge: 'BOTTOM',
        toolId: 'T_DRILL_5',
      });

      // Countersink (7mm, face drill)
      ops.push({
        type: 'DRILL',
        x: x,
        y: 0,
        z: 8, // Countersink depth
        dia: spec.confirmatCountersinkDia,
        face: 'A',
        toolId: 'T_DRILL_7',
      });
    }

    return ops;
  },
};

// ============================================
// SOFT CLOSE DAMPER PRESET
// ============================================

export const PRESET_SOFT_CLOSE: HardwarePreset = {
  id: 'SOFT_CLOSE_STD',
  kind: 'SOFT_CLOSE',
  name: 'Soft Close Damper',
  nameTh: 'ตัวหน่วงปิดนุ่ม',

  matches: (ctx) => hasTag(ctx.tags, 'SOFT_CLOSE:TRUE'),

  generate: (ctx) => {
    const ops: MfgOp[] = [];

    // Soft close damper typically mounts on side panel
    // near the top/bottom depending on door swing
    const mountY = ctx.height - 100; // 100mm from top
    const mountX = 50; // 50mm from front edge

    // Mounting holes (2x 5mm)
    ops.push({
      type: 'DRILL',
      x: mountX,
      y: mountY,
      z: 12,
      dia: 5,
      face: 'A',
      toolId: 'T_DRILL_5',
    });
    ops.push({
      type: 'DRILL',
      x: mountX + 32, // 32mm apart (System 32)
      y: mountY,
      z: 12,
      dia: 5,
      face: 'A',
      toolId: 'T_DRILL_5',
    });

    return ops;
  },
};

// ============================================
// STANDARD HARDWARE LIBRARY
// ============================================

export const STANDARD_HARDWARE_LIBRARY: HardwareLibrary = {
  id: 'STD_HARDWARE_V1',
  name: 'Standard Hardware Library',
  version: '1.0',
  presets: [
    PRESET_MINIFIX,
    PRESET_HINGE_35,
    PRESET_SHELF_PIN_5,
    PRESET_CONFIRMAT,
    PRESET_SOFT_CLOSE,
  ],
};

// ============================================
// HELPER: Apply presets to panel
// ============================================

/**
 * Apply all matching hardware presets to a panel context
 */
export function applyHardwarePresets(
  ctx: HardwareCtx,
  library: HardwareLibrary = STANDARD_HARDWARE_LIBRARY
): MfgOp[] {
  const ops: MfgOp[] = [];

  for (const preset of library.presets) {
    if (preset.matches(ctx)) {
      const presetOps = preset.generate(ctx);
      ops.push(...presetOps);
      console.log(`[Hardware] Applied preset ${preset.id}: ${presetOps.length} operations`);
    }
  }

  return ops;
}

/**
 * Get all applicable presets for a panel context
 */
export function getApplicablePresets(
  ctx: HardwareCtx,
  library: HardwareLibrary = STANDARD_HARDWARE_LIBRARY
): HardwarePreset[] {
  return library.presets.filter((preset) => preset.matches(ctx));
}
