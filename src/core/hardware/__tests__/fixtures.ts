/**
 * fixtures.ts - Shared test fixtures for the handle lane.
 *
 * Builds minimal cabinets that satisfy HandleCabinetInput without pulling in
 * the whole Cabinet shape. Values mirror the generators so the placement math
 * is tested against numbers the product actually produces.
 */

import type {
  CabinetPanel,
  CabinetStructure,
  DoorPanelConfig,
  DrawerRowConfig,
  PanelRole,
} from '../../types/Cabinet';
import { DEFAULT_STRUCTURE, DEFAULT_DRAWER_BOX_MATERIALS } from '../../types/Cabinet';
import type { HandleCabinetInput } from '../handlePlacement';

let fixtureCounter = 0;

/**
 * Build a CabinetPanel with only the fields the handle lane reads carried as
 * arguments. Everything else is filler that the lane never looks at.
 */
export function makePanel(
  role: PanelRole,
  finishWidth: number,
  finishHeight: number,
  thickness: number,
  position: [number, number, number]
): CabinetPanel {
  return {
    id: `fixture-panel-${++fixtureCounter}`,
    role,
    name: role,
    finishWidth,
    finishHeight,
    coreMaterialId: 'core-ply-18',
    faces: { faceA: 'surf-test', faceB: 'surf-test' },
    edges: { top: null, bottom: null, left: null, right: null },
    grainDirection: 'VERTICAL',
    computed: {
      realThickness: thickness,
      cutWidth: finishWidth,
      cutHeight: finishHeight,
      surfaceArea: 0,
      edgeLength: 0,
      cost: 0,
      co2: 0,
    },
    position,
    rotation: [0, 0, 0],
    visible: true,
    selected: false,
  };
}

/** A door panel matching the worked example: 600x720x560 base cabinet. */
export function makeWorkedExampleDoorPanel(): CabinetPanel {
  // doorY = H/2 + Leg = 360 + 100 = 460 ; doorZ = D/2 + t/2 = 280 + 9 = 289
  return makePanel('DOOR', 596, 716, 18, [0, 460, 289]);
}

export function makeDoorConfig(doors: Omit<DoorPanelConfig, 'id'>[]): CabinetStructure['doorConfig'] {
  return {
    hasDoors: true,
    doorCount: doors.length === 2 ? 2 : 1,
    doors: doors.map((d, i) => ({ ...d, id: `door-${i}` })),
    doorThickness: 18,
    overlayAmount: 18,
    doorGap: 3,
    revealGap: 2,
  };
}

export function makeDrawerConfig(rows: Omit<DrawerRowConfig, 'id'>[]): CabinetStructure['drawerConfig'] {
  return {
    hasDrawers: true,
    rows: rows.map((r, i) => ({ ...r, id: `row-${i}` })),
    slideType: 'undermount',
    boxMaterials: DEFAULT_DRAWER_BOX_MATERIALS,
    frontOverlay: 18,
  };
}

/** Assemble a cabinet-shaped input for the handle lane. */
export function makeCabinet(
  structure: Partial<CabinetStructure>,
  panels: CabinetPanel[]
): HandleCabinetInput {
  return {
    id: `fixture-cab-${++fixtureCounter}`,
    structure: { ...DEFAULT_STRUCTURE, ...structure },
    panels,
  };
}
