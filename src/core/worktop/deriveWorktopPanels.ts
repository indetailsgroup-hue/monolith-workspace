/**
 * deriveWorktopPanels — segments in, WORKTOP CabinetPanels out.
 *
 * Slabs are emitted as ordinary CabinetPanels expressed in the local frame of a
 * deterministic HOST cabinet (the segment member lowest along the run axis) and
 * are merged into that host's panels[] by applyWorktops.
 *
 * Hosting is the load-bearing decision. Every downstream consumer is
 * role-agnostic but cabinet-scoped: generateCabinetCutList maps
 * cabinet.panels.filter(visible) (cutList.ts:57-59), calculateTotals sums
 * panel.computed verbatim (useCabinetStore.ts:2014-2027), flatPartFromPanel
 * reads panel.edges/finishWidth only (flatPartBuilder.ts:249-265) and
 * ExportPanel builds its cut list from cabinet.panels (ExportPanel.tsx:742-744).
 * A scene-level worktop collection would render fine and enter the BOM at zero
 * — the exact defect the governance rules forbid. Hosting gets cut list, cost,
 * CO2, DXF and the gate with no downstream edits at all.
 */

import type { CabinetPanel } from '../types/Cabinet';
import { deriveRuns } from './deriveRuns';
import {
  computeWorktopPanel,
  resolveWorktopMaterials,
  worktopRealThickness,
  type WorktopMaterials,
} from './computeWorktopPanel';
import {
  describeAppliedPartDatum,
  frontDatumOffsetMm,
} from '../geometry/appliedPartDatum';
import { resolveSeatingOverhang } from './seatingOverhang';
import {
  DEFAULT_WORKTOP_CONFIG,
  type CabinetPlacement,
  type CabinetRun,
  type RunSegment,
  type WorktopConfig,
  type WorktopDerivationResult,
  type WorktopNote,
} from './types';

/** A segment's slab extents in WORLD run coordinates, before splitting. */
interface Slab {
  readonly segment: RunSegment;
  /** Extent along the run axis u, mm. */
  uLo: number;
  uHi: number;
  /** Extent along the front normal n, mm. */
  readonly nLo: number;
  readonly nHi: number;
  /** True when that end is a butt joint against another slab (no tape, hidden). */
  buttLow: boolean;
  buttHigh: boolean;
}

const length = (s: Slab) => s.uHi - s.uLo;
const depth = (s: Slab) => s.nHi - s.nLo;
const uMid = (s: Slab) => (s.uLo + s.uHi) / 2;
const nMid = (s: Slab) => (s.nLo + s.nHi) / 2;

/**
 * How far past the CARCASS front face the slab reaches.
 *
 * Under the 'FRONT' datum the overhang is measured from the door's OUTER face,
 * not the carcass. generateDoorPanels.ts:185 centres a door at D/2 + doorT/2,
 * so its outer face sits doorT proud of the carcass — with the default 18mm
 * door, measuring from the carcass left the slab 2mm past the door instead of
 * the intended projection, and that finishHeight went straight into the cut
 * list, the BOM and the DXF.
 *
 * The datum offset itself is NOT computed here. It comes from
 * frontDatumOffsetMm in src/core/geometry/appliedPartDatum.ts, the one place
 * that defines what a datum means, so the plinth below this cabinet and the
 * worktop above it cannot drift onto different reference faces again.
 */
function frontReach(segment: RunSegment, config: WorktopConfig): number {
  return (
    config.frontOverhang +
    frontDatumOffsetMm(config.frontDatum, segment.maxFrontProud, config.assumedDoorThickness)
  );
}

/**
 * How far past the CARCASS BACK face the slab reaches.
 *
 * Seating REPLACES backOverhang rather than adding to it. They are different
 * quantities: backOverhang is a decorative projection, the seating overhang is
 * knee clearance off the NKBA ladder. Summing them would produce a slab depth
 * that answers to neither.
 */
function backReach(config: WorktopConfig): number {
  if (config.seating.side !== 'BACK') return config.backOverhang;
  return resolveSeatingOverhang(config.seating.counterHeightMm).overhangMm;
}

function initialSlab(segment: RunSegment, config: WorktopConfig): Slab {
  return {
    segment,
    uLo: segment.u0 - config.endOverhang,
    uHi: segment.u1 + config.endOverhang,
    nLo: segment.nBack - backReach(config),
    nHi: segment.nFront + frontReach(segment, config),
    buttLow: false,
    buttHigh: false,
  };
}

/**
 * L-CORNER = TWO SLABS BUTTING, NOT A MITRE.
 *
 * A butt joint is two square rips; a mitre needs a matched pair of 45° cuts and
 * worktop bolts, and is unforgiving on a laminated board. Decisively, a butt
 * slab stays a RECTANGLE, and flatPartBuilder.ts:268-272 emits
 * `OuterContour { type: 'rectangle', width, height }` with no polygon variant —
 * a mitred slab would need a new contour type, a DXF path change and a gate
 * change, all outside this lane. Mitres are for postformed profiled edges and
 * are explicitly deferred.
 *
 * The THROUGH slab is the longer one (ties break on yaw, then segmentId, so the
 * result never depends on input order). The butting slab is trimmed back to the
 * through slab's face plane.
 */
function applyCornerButts(slabs: Slab[], run: CabinetRun, notes: WorktopNote[]): void {
  for (let i = 0; i < slabs.length; i++) {
    for (let j = i + 1; j < slabs.length; j++) {
      const a = slabs[i];
      const b = slabs[j];

      // Only perpendicular pairs butt. Parallel segments in one run are either
      // the same slab or genuinely separate stretches.
      const uDot = a.segment.members[0].u[0] * b.segment.members[0].u[0] +
                   a.segment.members[0].u[1] * b.segment.members[0].u[1];
      if (Math.abs(uDot) > 0.01) continue;

      // deriveRuns already sorted segments longest-first, so the earlier slab
      // is the through one.
      const through = a;
      const butting = b;

      const tu = through.segment.members[0].u;
      const tn = through.segment.members[0].n;
      const bu = butting.segment.members[0].u;

      // World centre of the through slab, projected onto the butting run axis.
      const centreWorldX = uMid(through) * tu[0] + nMid(through) * tn[0];
      const centreWorldZ = uMid(through) * tu[1] + nMid(through) * tn[1];
      const centre = centreWorldX * bu[0] + centreWorldZ * bu[1];
      const radius =
        (length(through) / 2) * Math.abs(tu[0] * bu[0] + tu[1] * bu[1]) +
        (depth(through) / 2) * Math.abs(tn[0] * bu[0] + tn[1] * bu[1]);

      const tLo = centre - radius;
      const tHi = centre + radius;

      let trimmed = false;
      if (butting.uLo < tHi && butting.uLo >= tLo && butting.uHi > tHi) {
        butting.uLo = tHi;
        butting.buttLow = true;
        trimmed = true;
      } else if (butting.uHi > tLo && butting.uHi <= tHi && butting.uLo < tLo) {
        butting.uHi = tLo;
        butting.buttHigh = true;
        trimmed = true;
      }

      if (trimmed) {
        notes.push({
          code: 'CORNER_BUTT',
          runId: run.runId,
          message:
            `Corner butt joint: slab ${butting.segment.segmentId} is trimmed square against ` +
            `slab ${through.segment.segmentId}. Square rips, no mitre — the joint face is ` +
            `hidden and carries no edge tape.`,
        });
      }
    }
  }
}

/**
 * Interior carcass side faces along the run, in world u. A blank split lands on
 * one of these so the joint always sits over support rather than mid-span.
 */
function junctionsAlongRun(segment: RunSegment): number[] {
  const out: number[] = [];
  for (let i = 0; i < segment.members.length - 1; i++) {
    out.push(segment.members[i].uc + segment.members[i].width / 2);
  }
  return out;
}

/** Cut positions along u, or [] when the slab fits one blank. */
function splitPositions(slab: Slab, config: WorktopConfig): number[] {
  const L = length(slab);
  if (L <= config.maxBlankLength) return [];

  const pieces = Math.ceil(L / config.maxBlankLength);
  const junctions = junctionsAlongRun(slab.segment).filter(j => j > slab.uLo && j < slab.uHi);

  const ideal: number[] = [];
  for (let i = 1; i < pieces; i++) ideal.push(slab.uLo + (L * i) / pieces);

  if (junctions.length === 0) return ideal;

  const snapped = ideal.map(target =>
    junctions.reduce((best, j) => (Math.abs(j - target) < Math.abs(best - target) ? j : best), junctions[0])
  );

  const unique = [...new Set(snapped)].sort((x, y) => x - y);
  // Snapping must not push a piece over a blank; if it would, keep the ideal cut.
  const bounds = [slab.uLo, ...unique, slab.uHi];
  for (let i = 1; i < bounds.length; i++) {
    if (bounds[i] - bounds[i - 1] > config.maxBlankLength) return ideal;
  }
  if (unique.length !== ideal.length) return ideal;

  return unique;
}

function slabToPanels(
  slab: Slab,
  run: CabinetRun,
  config: WorktopConfig,
  materials: WorktopMaterials,
  notes: WorktopNote[]
): { hostCabinetId: string; panels: CabinetPanel[] } {
  const host = slab.segment.members[0];
  const cuts = splitPositions(slab, config);
  const bounds = [slab.uLo, ...cuts, slab.uHi];
  const sliceCount = bounds.length - 1;

  if (cuts.length > 0) {
    notes.push({
      code: 'SPLIT_FOR_BLANK',
      runId: run.runId,
      message:
        `Run stretch ${Math.round(length(slab))}mm exceeds the ${config.maxBlankLength}mm blank; ` +
        `split into ${sliceCount} slabs with the joint(s) landing on a carcass side face. ` +
        `Internal joint faces carry no edge tape.`,
    });
  }

  if (slab.segment.mixedDepth) {
    notes.push({
      code: 'MIXED_DEPTH',
      runId: run.runId,
      message:
        `Run stretch ${slab.segment.segmentId} mixes cabinet depths; the slab is sized to the ` +
        `deepest member (${Math.round(depth(slab))}mm incl. overhangs) and will overhang the ` +
        `shallower ones. A stepped worktop is out of scope.`,
    });
  }

  const slabDepth = depth(slab);
  const thickness = worktopRealThickness(materials);
  const worldY = slab.segment.carcassTopY + thickness / 2;
  const edgeId = config.edgeMaterialId;
  // Explicit config flag, NOT `backOverhang > 0`. Deriving it from the overhang
  // tied "is this edge visible" to "does the slab project", which meant every
  // wall-abutting run — i.e. the default, i.e. all of them — declared its back
  // edge hidden and shipped it raw and unquoted. See WorktopConfig.backIsExposed.
  const backIsExposed = config.backIsExposed;

  const panels: CabinetPanel[] = [];

  for (let i = 0; i < sliceCount; i++) {
    const lo = bounds[i];
    const hi = bounds[i + 1];
    const sliceLength = hi - lo;

    const isFirst = i === 0;
    const isLast = i === sliceCount - 1;

    // An end is taped when it is genuinely exposed: not an internal split face,
    // not a corner butt face.
    //
    // DEVIATION FROM THE APPROVED DESIGN, stated plainly: the design also left
    // wall-abutting ends untaped. Walls are not modelled anywhere in this
    // codebase, so "is this end against a wall" is not derivable. Under-banding
    // puts raw chipboard into the BOM; over-banding costs a metre of tape. The
    // failure mode governance cares about is the under-specified part, so
    // exposed-by-default it is.
    const banding = {
      front: true,
      back: backIsExposed,
      lowEnd: isFirst && !slab.buttLow,
      highEnd: isLast && !slab.buttHigh,
    };

    const computed = computeWorktopPanel(sliceLength, slabDepth, banding, materials);

    // Host-local frame. The host's yaw IS the segment yaw (members are bucketed
    // by yaw), so (u, n) is already the host's local (X, Z) basis and the local
    // coordinates are just the basis components of (slab centre − host origin).
    const localX = (lo + hi) / 2 - host.uc;
    const localZ = nMid(slab) - host.nc;
    const localY = worldY - host.origin[1];

    panels.push({
      id: `worktop:${slab.segment.segmentId}:${i}`,
      role: 'WORKTOP',
      name:
        sliceCount > 1
          ? `Worktop ${run.runId} · slab ${i + 1} of ${sliceCount}`
          : `Worktop ${run.runId}`,
      finishWidth: sliceLength,
      finishHeight: slabDepth,
      coreMaterialId: config.coreMaterialId,
      // Both faces are charged by the cost formula, so both are declared.
      faces: { faceA: config.surfaceMaterialId, faceB: config.surfaceMaterialId },
      edges: {
        top: banding.front ? edgeId : null,     // front edge
        bottom: banding.back ? edgeId : null,   // back edge
        left: banding.lowEnd ? edgeId : null,   // low-u end
        right: banding.highEnd ? edgeId : null, // high-u end
      },
      grainDirection: 'HORIZONTAL',
      computed,
      // Run-level part: the whole slab's cost lands on this host cabinet, so
      // per-cabinet cost consumers need a way to see that and exclude it.
      runId: run.runId,
      position: [localX, localY, localZ],
      rotation: [0, 0, 0],
      visible: true,
      selected: false,
    });
  }

  return { hostCabinetId: host.cabinetId, panels };
}

/**
 * Derive every worktop slab in the scene.
 *
 * Pure and deterministic: identical placements always yield identical panel
 * ids, sizes and positions, whatever order the cabinets arrive in. That is what
 * lets the reconciler run on every geometry change without churning React keys.
 */
export function deriveWorktopPanels(
  placements: readonly CabinetPlacement[],
  config: WorktopConfig = DEFAULT_WORKTOP_CONFIG
): WorktopDerivationResult {
  const runs = deriveRuns(placements);
  if (runs.length === 0) {
    return { panelsByHostId: new Map(), runs: [], notes: [] };
  }

  // Resolve — and validate — once. Throws on an unbandable or non-MR spec.
  const materials = resolveWorktopMaterials(config);
  const notes: WorktopNote[] = [];
  const panelsByHostId = new Map<string, CabinetPanel[]>();

  for (const run of runs) {
    const slabs = run.segments.map(s => initialSlab(s, config));

    // THE DATUM IS DECLARED ON EVERY RUN, UNCONDITIONALLY.
    // Not "when it is unusual" — the whole defect is that an undeclared datum
    // looks perfectly normal. A note that only fires on an exception teaches a
    // reader that silence means CARCASS, which is precisely the assumption that
    // made 50mm and 20mm look comparable when they were measured from planes
    // 18mm apart.
    const proud = run.segments[0]?.maxFrontProud;
    notes.push({
      code: 'DATUM_DECLARED',
      runId: run.runId,
      message:
        describeAppliedPartDatum(
          'Worktop',
          'front overhang',
          config.frontOverhang,
          config.frontDatum,
          proud,
          config.assumedDoorThickness
        ) +
        ` The PLINTH under the same cabinets is measured from the SAME datum ` +
        `(kickboardGeometry.DEFAULT_KICK_SETBACK_DATUM), so the two figures are ` +
        `directly comparable.`,
    });

    if (config.seating.side === 'BACK') {
      const finding = resolveSeatingOverhang(config.seating.counterHeightMm);
      notes.push({
        code: 'SEATING_OVERHANG',
        runId: run.runId,
        message:
          finding.note +
          ` This REPLACES the ${config.backOverhang}mm decorative backOverhang on ` +
          `the seated edge; the two are not summed.`,
      });
    }

    applyCornerButts(slabs, run, notes);

    for (const slab of slabs) {
      // A slab trimmed away to nothing (fully swallowed by a through slab) is
      // dropped rather than emitted as a zero-size part.
      if (length(slab) <= 0) continue;

      const { hostCabinetId, panels } = slabToPanels(slab, run, config, materials, notes);
      const existing = panelsByHostId.get(hostCabinetId);
      if (existing) existing.push(...panels);
      else panelsByHostId.set(hostCabinetId, panels);
    }
  }

  return { panelsByHostId, runs, notes };
}
