/**
 * GateInput Builder — From DrillMap
 *
 * @module gate/builders/fromDrillMap
 *
 * Converts a generated DrillMap into the `DrillOp[]` that the Gate v0.1 safety
 * rules consume.
 *
 * ## Why this file exists
 *
 * `ruleDrillDepthSafety` and `ruleMinMargins` both run in production, but both
 * read `GateInput.drillOps`, and nothing ever put a real hole in that array:
 * `buildGateInputFromBreakdown` defaults it to `[]`, and `setDrillOps` was
 * called with data in exactly one place — a unit test. So MONOLITH shipped a
 * drill-depth safety rule that had never examined a real hole.
 *
 * ## Bore axis, not thickness
 *
 * Every op carries the material available along its OWN axis. A face bore
 * penetrates the panel thickness (~18mm); an edge bore runs down the board's
 * length or width (hundreds of mm). Checking an edge bore against thickness is
 * the exact mistake that made gate G11 condemn correct 18mm dowel joinery, and
 * feeding these rules without this distinction would reproduce it.
 */

import type { DrillMap, DrillMapPanel, DrillMapPoint } from '../../core/manufacturing/drillMap/types';
import type { DrillOp, PartSpec } from '../types';
import {
  dominantAxisOf,
  panelSpanFromRole,
  thicknessAxisOf,
  thicknessAxisFromRole,
  type G11PanelSpan,
  type WorldAxis,
} from '../rules/gateG11_types';

/**
 * Which world axes carry the panel's finish width and finish height, given the
 * axis its thickness runs along. Mirrors {@link panelSpanFromRole}.
 */
function facePlaneAxes(thicknessAxis: WorldAxis): { uAxis: WorldAxis; vAxis: WorldAxis } {
  switch (thicknessAxis) {
    case 0: return { uAxis: 2, vAxis: 1 }; // side panel: W along Z, H along Y
    case 1: return { uAxis: 0, vAxis: 2 }; // horizontal panel: W along X, H along Z
    default: return { uAxis: 0, vAxis: 1 }; // back panel: W along X, H along Y
  }
}

/** Panel-local coordinate of a world position along one axis. */
function localCoord(
  worldValue: number,
  panelCenter: number,
  span: number,
): number {
  return worldValue - (panelCenter - span / 2);
}

/**
 * Geometry resolved for one panel, reused by every point on it.
 */
type PanelFrame = {
  span: G11PanelSpan;
  thicknessAxis: WorldAxis;
  center: [number, number, number];
};

function resolvePanelFrame(panel: DrillMapPanel): PanelFrame | undefined {
  if (!panel.dimensions) return undefined;
  const { width, height, thickness } = panel.dimensions;
  if (thickness === undefined) return undefined;

  const span = panelSpanFromRole(panel.role, width, height, thickness);
  const thicknessAxis = thicknessAxisOf(span, thickness) ?? thicknessAxisFromRole(panel.role);

  return {
    span,
    thicknessAxis,
    center: panel.worldPosition ?? [0, 0, 0],
  };
}

/**
 * Convert one drill point into a gate DrillOp.
 *
 * Returns `undefined` when the panel geometry is unusable, so callers can count
 * the skips instead of silently validating fewer holes than were drilled.
 */
export function drillOpFromPoint(
  point: DrillMapPoint,
  frame: PanelFrame,
): DrillOp {
  const boreAxis = dominantAxisOf(point.normal);
  const isFaceBore = boreAxis === frame.thicknessAxis;

  const { uAxis, vAxis } = facePlaneAxes(frame.thicknessAxis);

  const op: DrillOp = {
    opId: point.id,
    partId: point.panelId,
    x: localCoord(point.position[uAxis], frame.center[uAxis], frame.span[uAxis]),
    y: localCoord(point.position[vAxis], frame.center[vAxis], frame.span[vAxis]),
    depthMm: point.depth,
    diaMm: point.diameter,
    boreAxisMaterialMm: frame.span[boreAxis],
    boreType: isFaceBore ? 'FACE_BORE' : 'EDGE_BORE',
  };

  if (!isFaceBore) {
    // An edge bore enters THROUGH one of the face-plane edges, so its distance
    // to that edge is zero by construction and means nothing. Name the axis so
    // the margin rule skips it and still checks the perpendicular one.
    op.edgeEntryAxis = boreAxis === uAxis ? 'x' : 'y';
  }

  return op;
}

export type BuildDrillOpsResult = {
  /** Ops the rules can validate. */
  ops: DrillOp[];
  /** Points dropped because their panel carried no usable geometry. */
  skipped: { pointId: string; panelId: string; reason: string }[];
};

/**
 * Build gate drill ops from every point in a drill map.
 *
 * @param drillMap - Generated drill map, or null when none exists yet
 */
export function buildDrillOpsFromDrillMap(drillMap: DrillMap | null | undefined): BuildDrillOpsResult {
  const ops: DrillOp[] = [];
  const skipped: BuildDrillOpsResult['skipped'] = [];

  for (const panel of drillMap?.panels ?? []) {
    if (!panel.points?.length) continue;

    const frame = resolvePanelFrame(panel);
    if (!frame) {
      for (const point of panel.points) {
        skipped.push({
          pointId: point.id,
          panelId: panel.panelId,
          reason: 'panel has no usable dimensions',
        });
      }
      continue;
    }

    for (const point of panel.points) {
      ops.push(drillOpFromPoint(point, frame));
    }
  }

  // Deterministic order for reproducible gate reports.
  ops.sort((a, b) => (a.partId === b.partId ? a.opId.localeCompare(b.opId) : a.partId.localeCompare(b.partId)));

  return { ops, skipped };
}

/**
 * Build the minimal `PartSpec[]` the depth and margin rules need to resolve
 * each op's panel.
 *
 * The drill map records finish size and real thickness per panel, which is all
 * these two rules read. Edge banding is not modelled here — that is the Part
 * Breakdown's job, and `buildPartsFromBreakdown` remains the source of truth
 * for cut sizes. Thickness is carried on `coreThicknessMm` so
 * `compositeThicknessMm` returns the real board thickness.
 */
export function buildPartsFromDrillMap(drillMap: DrillMap | null | undefined): PartSpec[] {
  const parts: PartSpec[] = [];

  for (const panel of drillMap?.panels ?? []) {
    if (!panel.dimensions || panel.dimensions.thickness === undefined) continue;

    const thicknessAxis =
      thicknessAxisOf(
        panelSpanFromRole(panel.role, panel.dimensions.width, panel.dimensions.height, panel.dimensions.thickness),
        panel.dimensions.thickness,
      ) ?? thicknessAxisFromRole(panel.role);
    const { uAxis, vAxis } = facePlaneAxes(thicknessAxis);
    const span = panelSpanFromRole(
      panel.role,
      panel.dimensions.width,
      panel.dimensions.height,
      panel.dimensions.thickness,
    );

    parts.push({
      partId: panel.panelId,
      name: `${panel.role} ${panel.panelId}`,
      finishW: span[uAxis],
      finishH: span[vAxis],
      material: {
        coreThicknessMm: panel.dimensions.thickness,
        surfaceAThicknessMm: 0,
        surfaceBThicknessMm: 0,
      },
      edges: {
        L: { enabled: false, thicknessMm: 0, premillMm: 0 },
        R: { enabled: false, thicknessMm: 0, premillMm: 0 },
        T: { enabled: false, thicknessMm: 0, premillMm: 0 },
        B: { enabled: false, thicknessMm: 0, premillMm: 0 },
      },
      tags: [panel.role],
    });
  }

  parts.sort((a, b) => a.partId.localeCompare(b.partId));
  return parts;
}
