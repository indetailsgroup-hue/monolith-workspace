/**
 * Intent to Hardware - Hardware Selection Transform
 *
 * Selects appropriate hardware based on designer intent.
 * Uses hardware catalogs from HardwareLibrary.
 *
 * v1.0: Initial hardware selection
 */

import type {
  DesignerIntent,
  HardwareSelection,
  HardwarePlacement,
  Vec3,
} from '../types';
import { getRequiredHingeCount, SYSTEM_32 } from '../policy';

// ============================================
// HARDWARE CATALOG IDS
// ============================================

const HINGE_CATALOG = {
  cup_full: 'blum-clip-top-full',
  cup_half: 'blum-clip-top-half',
  cup_inset: 'blum-clip-top-inset',
  butt: 'butt-hinge-standard',
  piano: 'piano-hinge-continuous',
};

const CONNECTOR_CATALOG = {
  minifix: 'minifix-s200-15',
  dowel: 'dowel-8x35',
  confirmat: 'confirmat-7x50',
  domino: 'domino-6x40',
};

const SLIDE_CATALOG = {
  undermount: 'metropush-undermount',
  side_mount: 'side-roller-slide',
};

const SHELF_PIN_CATALOG = {
  standard: 'shelf-pin-5mm',
  heavy: 'shelf-pin-6mm-metal',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a hardware placement.
 */
function createPlacement(
  panelId: string,
  x: number,
  y: number,
  z: number,
  face?: 'A' | 'B' | 'edge'
): HardwarePlacement {
  return {
    panelId,
    position: { x, y, z },
    face,
  };
}

/**
 * Calculate inner cabinet width.
 */
function getInnerWidth(intent: DesignerIntent): number {
  return intent.dimensions.width - intent.materials.carcassThickness * 2;
}

/**
 * Calculate inner cabinet height.
 */
function getInnerHeight(intent: DesignerIntent): number {
  const toeKick = intent.dimensions.toeKickHeight ?? 0;
  return intent.dimensions.height - toeKick - intent.materials.carcassThickness * 2;
}

// ============================================
// HARDWARE SELECTION FUNCTIONS
// ============================================

/**
 * Select minifix/dowel connectors for cabinet joints.
 */
function selectConnectors(intent: DesignerIntent): HardwareSelection[] {
  const selections: HardwareSelection[] = [];
  const { primaryJoint, reinforcement } = intent.connectors;
  const thickness = intent.materials.carcassThickness;
  const innerHeight = getInnerHeight(intent);

  // Calculate connector count per joint based on panel size
  // Standard: 2 connectors for panels < 600mm, 3 for larger
  const connectorsPerJoint = innerHeight < 600 ? 2 : 3;

  // 4 main joints: left-top, left-bottom, right-top, right-bottom
  // Plus any fixed shelf joints
  const fixedShelfCount = intent.shelves.filter((s) => s.type === 'fixed').length;
  const dividerJoints = intent.dividers.length * 2;
  const totalJoints = 4 + fixedShelfCount * 2 + dividerJoints;

  // Primary connectors
  const catalogId = CONNECTOR_CATALOG[primaryJoint] || CONNECTOR_CATALOG.minifix;
  const placements: HardwarePlacement[] = [];

  // Generate placements for corner joints
  // Left-bottom joint
  for (let i = 0; i < connectorsPerJoint; i++) {
    const yPos = 50 + i * 100; // Space connectors 100mm apart
    placements.push(createPlacement('left-side', thickness / 2, yPos, 0, 'B'));
  }
  // Left-top joint
  for (let i = 0; i < connectorsPerJoint; i++) {
    const yPos = innerHeight - 50 - i * 100;
    placements.push(createPlacement('left-side', thickness / 2, yPos, 0, 'B'));
  }
  // Right-bottom joint
  for (let i = 0; i < connectorsPerJoint; i++) {
    const yPos = 50 + i * 100;
    placements.push(createPlacement('right-side', thickness / 2, yPos, 0, 'A'));
  }
  // Right-top joint
  for (let i = 0; i < connectorsPerJoint; i++) {
    const yPos = innerHeight - 50 - i * 100;
    placements.push(createPlacement('right-side', thickness / 2, yPos, 0, 'A'));
  }

  selections.push({
    type: primaryJoint === 'minifix' ? 'minifix' : 'dowel',
    catalogId,
    name: primaryJoint === 'minifix' ? 'Minifix S200' : `${primaryJoint} connector`,
    quantity: totalJoints * connectorsPerJoint * (primaryJoint === 'minifix' ? 2 : 1), // Minifix has cam + bolt
    placements,
  });

  // Reinforcement dowels (if specified)
  if (reinforcement === 'dowel' && primaryJoint !== 'dowel') {
    selections.push({
      type: 'dowel',
      catalogId: CONNECTOR_CATALOG.dowel,
      name: 'Reinforcement Dowel 8x35',
      quantity: totalJoints * 2, // 2 dowels per joint
      placements: [], // Dowels placed between main connectors
    });
  }

  return selections;
}

/**
 * Select hinges for doors.
 */
function selectDoorHinges(intent: DesignerIntent): HardwareSelection[] {
  const doors = intent.doors;
  if (!doors?.enabled) {
    return [];
  }

  const doorHeight =
    intent.dimensions.height - (intent.dimensions.toeKickHeight ?? 0);
  const hingeCount = getRequiredHingeCount(doorHeight);

  // Select hinge based on type and overlay
  let catalogId: string;
  if (doors.hingeType === 'cup') {
    catalogId =
      doors.overlayType === 'full'
        ? HINGE_CATALOG.cup_full
        : doors.overlayType === 'half'
          ? HINGE_CATALOG.cup_half
          : HINGE_CATALOG.cup_inset;
  } else if (doors.hingeType === 'piano') {
    catalogId = HINGE_CATALOG.piano;
  } else {
    catalogId = HINGE_CATALOG.butt;
  }

  // Generate hinge placements
  const placements: HardwarePlacement[] = [];
  const positionsFromEdge = [100]; // First hinge at 100mm

  // Add middle hinges for tall doors
  if (hingeCount === 3) {
    positionsFromEdge.push(doorHeight / 2);
  } else if (hingeCount === 4) {
    positionsFromEdge.push(doorHeight / 3);
    positionsFromEdge.push((doorHeight * 2) / 3);
  } else if (hingeCount >= 5) {
    for (let i = 1; i < hingeCount - 1; i++) {
      positionsFromEdge.push(
        100 + ((doorHeight - 200) * i) / (hingeCount - 1)
      );
    }
  }
  positionsFromEdge.push(doorHeight - 100); // Last hinge at 100mm from bottom

  // Create placements for each door
  for (let d = 0; d < doors.count; d++) {
    const panelId = d === 0 ? 'door-left' : 'door-right';
    const hingeSide = d === 0 ? 'left' : 'right';

    for (const yPos of positionsFromEdge) {
      placements.push(
        createPlacement(
          panelId,
          hingeSide === 'left' ? 21.5 : intent.dimensions.width - 21.5,
          yPos,
          0,
          'B'
        )
      );
    }
  }

  return [
    {
      type: 'hinge',
      catalogId,
      name: `${doors.hingeType === 'cup' ? 'Cup' : doors.hingeType} hinge (${doors.overlayType} overlay)`,
      quantity: hingeCount * doors.count,
      placements,
    },
  ];
}

/**
 * Select shelf pins for adjustable shelves.
 */
function selectShelfPins(intent: DesignerIntent): HardwareSelection[] {
  const adjustableShelves = intent.shelves.filter((s) => s.type === 'adjustable');
  if (adjustableShelves.length === 0) {
    return [];
  }

  // Calculate number of System 32 holes needed
  const innerHeight = getInnerHeight(intent);
  const startY = SYSTEM_32.firstHoleZ;
  const endY = innerHeight - startY;
  const holeCount = Math.floor((endY - startY) / SYSTEM_32.pitch) + 1;

  // 2 rows of holes per side panel (front and back)
  // 4 pins per shelf (2 per side, 2 positions)
  const pinsPerShelf = 4;

  // Generate placements for System 32 holes
  const placements: HardwarePlacement[] = [];
  const frontZ = SYSTEM_32.firstHoleZ;
  const backZ = intent.dimensions.depth - 50; // 50mm from back

  for (const shelf of adjustableShelves) {
    // Left side pins
    placements.push(createPlacement('left-side', 0, shelf.positionY, frontZ, 'A'));
    placements.push(createPlacement('left-side', 0, shelf.positionY, backZ, 'A'));
    // Right side pins
    placements.push(createPlacement('right-side', 0, shelf.positionY, frontZ, 'B'));
    placements.push(createPlacement('right-side', 0, shelf.positionY, backZ, 'B'));
  }

  // Determine catalog based on load capacity
  const hasHeavyShelf = adjustableShelves.some((s) => s.loadCapacity === 'heavy');
  const catalogId = hasHeavyShelf
    ? SHELF_PIN_CATALOG.heavy
    : SHELF_PIN_CATALOG.standard;

  return [
    {
      type: 'shelf_pin',
      catalogId,
      name: hasHeavyShelf ? 'Heavy Duty Shelf Pin 6mm' : 'Standard Shelf Pin 5mm',
      quantity: adjustableShelves.length * pinsPerShelf,
      placements,
    },
  ];
}

/**
 * Select drawer slides.
 */
function selectDrawerSlides(intent: DesignerIntent): HardwareSelection[] {
  const drawers = intent.drawers;
  if (!drawers?.enabled || drawers.rows.length === 0) {
    return [];
  }

  const catalogId =
    drawers.slideType === 'undermount'
      ? SLIDE_CATALOG.undermount
      : SLIDE_CATALOG.side_mount;

  // 2 slides per drawer (left and right)
  const placements: HardwarePlacement[] = [];

  let currentY = intent.materials.carcassThickness; // Start from bottom panel
  for (let i = 0; i < drawers.rows.length; i++) {
    const row = drawers.rows[i];
    currentY += row.gapAbove;

    // Slide mount position (37mm from bottom of drawer space)
    const slideY = currentY + 37;

    // Left slide
    placements.push(
      createPlacement('left-side', 0, slideY, SYSTEM_32.firstHoleZ, 'A')
    );
    // Right slide
    placements.push(
      createPlacement('right-side', 0, slideY, SYSTEM_32.firstHoleZ, 'B')
    );

    currentY += row.frontHeight;
  }

  return [
    {
      type: 'slide',
      catalogId,
      name: drawers.slideType === 'undermount' ? 'Undermount Slide' : 'Side Mount Slide',
      quantity: drawers.rows.length * 2,
      placements,
    },
  ];
}

/**
 * Select handles if configured.
 */
function selectHandles(intent: DesignerIntent): HardwareSelection[] {
  const selections: HardwareSelection[] = [];

  // Door handles
  if (
    intent.doors?.enabled &&
    intent.doors.handleConfig?.type &&
    intent.doors.handleConfig.type !== 'none' &&
    intent.doors.handleConfig.type !== 'push_latch'
  ) {
    selections.push({
      type: 'handle',
      catalogId: `handle-${intent.doors.handleConfig.type}`,
      name: `Door ${intent.doors.handleConfig.type}`,
      quantity: intent.doors.count,
      placements: [],
    });
  }

  // Drawer handles
  if (
    intent.drawers?.enabled &&
    intent.drawers.handleConfig?.type &&
    intent.drawers.handleConfig.type !== 'none'
  ) {
    selections.push({
      type: 'handle',
      catalogId: `handle-${intent.drawers.handleConfig.type}`,
      name: `Drawer ${intent.drawers.handleConfig.type}`,
      quantity: intent.drawers.rows.length,
      placements: [],
    });
  }

  return selections;
}

// ============================================
// MAIN EXPORT
// ============================================

/**
 * Transform designer intent into hardware selections.
 */
export function intentToHardware(intent: DesignerIntent): HardwareSelection[] {
  const hardware: HardwareSelection[] = [];

  // 1. Connectors (Minifix/Dowel/Confirmat)
  hardware.push(...selectConnectors(intent));

  // 2. Door hinges
  hardware.push(...selectDoorHinges(intent));

  // 3. Shelf pins
  hardware.push(...selectShelfPins(intent));

  // 4. Drawer slides
  hardware.push(...selectDrawerSlides(intent));

  // 5. Handles
  hardware.push(...selectHandles(intent));

  return hardware;
}
