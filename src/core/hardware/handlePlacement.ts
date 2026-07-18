/**
 * handlePlacement.ts - Where each bought handle sits, in panel-local mm.
 *
 * Pure geometry: no React, no THREE, so it is unit-testable and so the BOM and
 * the 3D layer can both consume the same answer.
 *
 * PANEL-LOCAL FRAME
 * Panel3DComponent draws BoxGeometry(sizeX,sizeY,sizeZ) inside
 * `<group position={panel.position} rotation={panel.rotation}>`, and the door /
 * drawer-front roles fall through the renderer's default size branch, which maps
 * [finishWidth, finishHeight, realThickness]. So in panel-local space:
 *   +X = panel width,   -finishWidth/2  .. +finishWidth/2
 *   +Y = panel height,  -finishHeight/2 .. +finishHeight/2
 *   +Z = outward (room), front face at +realThickness/2
 * The panel origin is the panel CENTRE.
 *
 * @version 1.0.0 - Initial handle placement
 */

import type { CabinetPanel, CabinetStructure, PanelRole } from '../types/Cabinet';
import type { HandleSpec } from './handleCatalog';
import { getHandleSpec, resolveHandleSku } from './handleCatalog';

// ============================================
// TYPES
// ============================================

/**
 * The slice of a Cabinet this lane reads. Cabinet satisfies it structurally, so
 * callers pass a Cabinet; tests build the three fields and nothing else.
 */
export interface HandleCabinetInput {
  id: string;
  structure: CabinetStructure;
  panels: CabinetPanel[];
}

/** Which panel a handle is mounted on, and where, in PANEL-LOCAL mm. */
export interface HandlePlacement {
  /** Panel this handle rides on. */
  panelId: string;
  /** Cabinet that owns the panel. */
  cabinetId: string;
  /** Catalog entry to render and to bill. */
  spec: HandleSpec;
  /** Panel-local position of the handle mounting origin (front face plane). */
  localPosition: [number, number, number];
  /** Panel-local rotation, radians. [0,0,0] = grip runs along panel +Y. */
  localRotation: [number, number, number];
  /** Copied from the panel so HandleLayer can rebuild the panel frame. */
  panelPosition: [number, number, number];
  panelRotation: [number, number, number];
  /** True when handleConfig.height/offsetY had to be clamped to fit the panel. */
  clamped: boolean;
}

// ============================================
// CONSTANTS
// ============================================

/** Roles that carry a door handle, in the order the door generator emits them. */
const DOOR_ROLES: PanelRole[] = ['DOOR', 'DOOR_LEFT', 'DOOR_RIGHT'];

/** Default distance from the door's opening edge to the handle centreline (mm). */
const DEFAULT_DOOR_EDGE_OFFSET = 40;

/** Default inset from a drawer front's top/bottom edge (mm). */
const DEFAULT_DRAWER_INSET = 40;

/** Clearance kept between the end of a vertical grip and the door edge (mm). */
const DOOR_END_CLEARANCE = 20;

/** Clearance kept between a horizontal grip and the drawer front edge (mm). */
const DRAWER_EDGE_CLEARANCE = 15;

// ============================================
// HELPERS
// ============================================

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Warn once per placement when a configured position had to be pulled back onto
 * the panel. Silently moving hardware is how a drawing stops matching the part.
 */
function warnClamped(what: string, requested: number, applied: number): void {
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[handlePlacement] ${what}: requested ${requested}mm falls off the panel; clamped to ${applied}mm.`
    );
  }
}

/**
 * Rotation that lays the grip along the panel's +X axis instead of +Y.
 * Meaningless for a KNOB, which is rotationally symmetric.
 */
function gripRotation(spec: HandleSpec, horizontal: boolean): [number, number, number] {
  if (spec.form === 'KNOB' || !horizontal) return [0, 0, 0];
  return [0, 0, Math.PI / 2];
}

// ============================================
// MAIN
// ============================================

/**
 * Resolve every handle on a cabinet to a panel-local placement.
 *
 * Quantity comes from structure.doorConfig / structure.drawerConfig, NOT from
 * panel roles — the config is what the user actually set. Panels are matched to
 * config entries by order, which is the order both generators emit them in.
 */
export function resolveHandlePlacements(
  cabinet: HandleCabinetInput
): HandlePlacement[] {
  const placements: HandlePlacement[] = [];
  const { structure, panels } = cabinet;

  // ─────────────────────────────────────────────────────────────────────
  // DOORS
  // ─────────────────────────────────────────────────────────────────────

  const doorConfig = structure.doorConfig;
  if (doorConfig?.hasDoors && doorConfig.doors.length > 0) {
    const doorPanels = panels.filter((p) => DOOR_ROLES.includes(p.role));

    doorConfig.doors.forEach((door, index) => {
      const panel = doorPanels[index];
      if (!panel) return;

      const handleConfig = door.handleConfig;
      if (!handleConfig) return;

      const sku = resolveHandleSku(handleConfig.type);
      if (!sku) return;

      const spec = getHandleSpec(sku);
      if (!spec) return;

      const halfW = panel.finishWidth / 2;
      const halfH = panel.finishHeight / 2;
      const t = panel.computed.realThickness;

      // openingDirection is the HINGE side, so the grip goes on the far edge.
      const mirror = door.openingDirection === 'left' ? 1 : -1;
      const edgeOffset = handleConfig.offset ?? DEFAULT_DOOR_EDGE_OFFSET;
      const xLocal = mirror * (halfW - edgeOffset);

      // handleConfig.height is documented as mm from the bottom of the door.
      const halfSpan = Math.max(
        0,
        halfH - spec.overallLength / 2 - DOOR_END_CLEARANCE
      );
      const yRaw = handleConfig.height - halfH;
      const yLocal = clamp(yRaw, -halfSpan, halfSpan);
      const clamped = yLocal !== yRaw;
      if (clamped) {
        warnClamped(`door ${door.id} handle height`, handleConfig.height, yLocal + halfH);
      }

      placements.push({
        panelId: panel.id,
        cabinetId: cabinet.id,
        spec,
        localPosition: [xLocal, yLocal, t / 2],
        localRotation: gripRotation(spec, false),
        panelPosition: panel.position,
        panelRotation: panel.rotation,
        clamped,
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // DRAWER FRONTS
  // ─────────────────────────────────────────────────────────────────────

  const drawerConfig = structure.drawerConfig;
  if (drawerConfig?.hasDrawers && drawerConfig.rows.length > 0) {
    const frontPanels = panels.filter((p) => p.role === 'DRAWER_FRONT');

    drawerConfig.rows.forEach((row, index) => {
      const panel = frontPanels[index];
      if (!panel) return;

      const handleConfig = row.handleConfig;
      if (!handleConfig) return;

      const sku = resolveHandleSku(handleConfig.type);
      if (!sku) return;

      const spec = getHandleSpec(sku);
      if (!spec) return;

      const halfH = panel.finishHeight / 2;
      const t = panel.computed.realThickness;
      const inset = handleConfig.offsetY ?? DEFAULT_DRAWER_INSET;

      const halfSpanY = Math.max(
        0,
        halfH - spec.gripSize / 2 - DRAWER_EDGE_CLEARANCE
      );

      let yRaw: number;
      if (handleConfig.position === 'top') {
        yRaw = halfH - inset;
      } else if (handleConfig.position === 'bottom') {
        yRaw = -(halfH - inset);
      } else {
        yRaw = 0;
      }

      const yLocal = clamp(yRaw, -halfSpanY, halfSpanY);
      const clamped = yLocal !== yRaw;
      if (clamped) {
        warnClamped(`drawer row ${row.id} handle inset`, yRaw, yLocal);
      }

      placements.push({
        panelId: panel.id,
        cabinetId: cabinet.id,
        spec,
        // Drawer handles are always centred horizontally.
        localPosition: [0, yLocal, t / 2],
        localRotation: gripRotation(spec, true),
        panelPosition: panel.position,
        panelRotation: panel.rotation,
        clamped,
      });
    });
  }

  return placements;
}
