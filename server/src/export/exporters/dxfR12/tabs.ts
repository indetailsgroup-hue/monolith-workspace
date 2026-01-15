/**
 * Tabs/Bridges for Profile Cuts
 *
 * Step 10.4A: Generate profile cut geometry with hold-down tabs
 *
 * Tabs prevent workpieces from falling during CNC profile cutting.
 * The outline is split into segments with gaps (bridges) where the
 * tool doesn't cut through, keeping the part attached to the sheet.
 *
 * Strategies:
 * - MID_EDGES: One tab per edge (4 tabs for rectangle), centered
 * - UNIFORM: Evenly distributed around perimeter
 *
 * Output:
 * - Cut segments on toolpath layer (TP_OUT_CUT_Z*_T*)
 * - Tab markers on SAFE_GUIDES layer for visibility
 */

import type { DxfEntity, DxfPoint } from './dxfTypes.js';
import { line, text } from './dxfGeom.js';

// ============================================================================
// Types
// ============================================================================

export interface TabSpec {
  enabled: boolean;
  count: number;         // Number of tabs (default: 4)
  lengthMm: number;      // Tab length in mm (default: 12)
  insetMm: number;       // Distance from corners (default: 25)
  strategy: 'UNIFORM' | 'MID_EDGES';
}

export const DEFAULT_TAB_SPEC: TabSpec = {
  enabled: true,
  count: 4,
  lengthMm: 12,
  insetMm: 25,
  strategy: 'MID_EDGES',
};

interface Edge {
  a: DxfPoint;
  b: DxfPoint;
  len: number;
  dir: { x: number; y: number };
}

interface TabResult {
  cut: DxfEntity[];     // Profile cut segments
  safe: DxfEntity[];    // Tab marker annotations
  tabPositions: Array<{ x: number; y: number; edgeIndex: number }>;
}

// ============================================================================
// Helpers
// ============================================================================

function dist(a: DxfPoint, b: DxfPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

function makeEdge(a: DxfPoint, b: DxfPoint): Edge {
  const len = dist(a, b);
  const dir = len > 0
    ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
    : { x: 0, y: 0 };
  return { a, b, len, dir };
}

function pointOnEdge(e: Edge, t: number): DxfPoint {
  return {
    x: e.a.x + e.dir.x * t,
    y: e.a.y + e.dir.y * t,
  };
}

// ============================================================================
// Rectangle Outline with Tabs
// ============================================================================

/**
 * Generate profile cut geometry for a rectangle with tabs.
 *
 * For axis-aligned rectangles with corners at (0,0), (W,0), (W,H), (0,H).
 * Returns cut segments (lines with gaps for tabs) and tab markers.
 *
 * @param input - Configuration including dimensions and tab settings
 * @returns Cut segments and tab markers
 */
export function outlineWithTabsRect(input: {
  layerCut: string;
  layerSafe: string;
  W: number;
  H: number;
  tab: TabSpec;
  origin?: DxfPoint;
}): TabResult {
  const { W, H, tab, origin = { x: 0, y: 0 } } = input;

  // Build rectangle edges (CCW from origin)
  const pts: DxfPoint[] = [
    { x: origin.x, y: origin.y },           // bottom-left
    { x: origin.x + W, y: origin.y },       // bottom-right
    { x: origin.x + W, y: origin.y + H },   // top-right
    { x: origin.x, y: origin.y + H },       // top-left
  ];

  const edges = [
    makeEdge(pts[0], pts[1]), // bottom
    makeEdge(pts[1], pts[2]), // right
    makeEdge(pts[2], pts[3]), // top
    makeEdge(pts[3], pts[0]), // left
  ];

  // If tabs disabled, return full outline as 4 lines
  if (!tab.enabled) {
    return {
      cut: [
        line({ layer: input.layerCut, p1: pts[0], p2: pts[1] }),
        line({ layer: input.layerCut, p1: pts[1], p2: pts[2] }),
        line({ layer: input.layerCut, p1: pts[2], p2: pts[3] }),
        line({ layer: input.layerCut, p1: pts[3], p2: pts[0] }),
      ],
      safe: [],
      tabPositions: [],
    };
  }

  // Calculate perimeter and tab positions
  const perim = 2 * (W + H);
  const n = Math.max(1, Math.floor(tab.count));
  const L = Math.max(2, tab.lengthMm);
  const inset = Math.max(0, tab.insetMm);

  // Calculate tab center positions along perimeter
  const centers: number[] = [];

  if (tab.strategy === 'MID_EDGES') {
    // One tab at center of each edge
    const edgeMids = [
      W / 2,                    // bottom edge midpoint
      W + H / 2,                // right edge midpoint
      W + H + W / 2,            // top edge midpoint
      2 * W + H + H / 2,        // left edge midpoint
    ];

    for (let i = 0; i < n; i++) {
      // Distribute tabs across edges, cycling through midpoints
      centers.push(edgeMids[i % 4] + Math.floor(i / 4) * (perim / n));
    }
  } else {
    // UNIFORM: evenly distributed
    for (let i = 0; i < n; i++) {
      centers.push((i + 0.5) * (perim / n));
    }
  }

  // Normalize and apply inset from corners
  const safeCenters = centers
    .map(c => ((c % perim) + perim) % perim)
    .map(c => Math.min(Math.max(c, inset), perim - inset));

  // Convert perimeter position to edge index and local t
  function posToEdge(c: number): { ei: number; t: number } {
    let acc = 0;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (c <= acc + e.len) {
        return { ei: i, t: c - acc };
      }
      acc += e.len;
    }
    return { ei: edges.length - 1, t: edges[edges.length - 1].len };
  }

  // Build blocked intervals (tab regions) per edge
  const blocked: Array<{ ei: number; a: number; b: number }> = [];
  const tabPositions: Array<{ x: number; y: number; edgeIndex: number }> = [];

  for (const c of safeCenters) {
    const { ei, t } = posToEdge(c);
    const a = Math.max(0, t - L / 2);
    const b = Math.min(edges[ei].len, t + L / 2);
    blocked.push({ ei, a, b });

    // Record tab position for metadata
    const midT = (a + b) / 2;
    const midPt = pointOnEdge(edges[ei], midT);
    tabPositions.push({ x: midPt.x, y: midPt.y, edgeIndex: ei });
  }

  // Group and merge overlapping blocked intervals by edge
  const byEdge = new Map<number, Array<{ a: number; b: number }>>();
  for (const b of blocked) {
    const arr = byEdge.get(b.ei) ?? [];
    arr.push({ a: b.a, b: b.b });
    byEdge.set(b.ei, arr);
  }

  for (const [ei, arr] of byEdge.entries()) {
    arr.sort((x, y) => x.a - y.a);
    const merged: Array<{ a: number; b: number }> = [];

    for (const it of arr) {
      const last = merged[merged.length - 1];
      if (!last || it.a > last.b) {
        merged.push({ ...it });
      } else {
        last.b = Math.max(last.b, it.b);
      }
    }

    byEdge.set(ei, merged);
  }

  // Generate cut segments (edge minus blocked intervals)
  const cut: DxfEntity[] = [];
  const safe: DxfEntity[] = [];

  edges.forEach((e, ei) => {
    const blocks = byEdge.get(ei) ?? [];
    let t0 = 0;

    for (const bl of blocks) {
      // Segment before this tab: [t0, bl.a]
      if (bl.a > t0 + 1e-6) {
        const p1 = pointOnEdge(e, t0);
        const p2 = pointOnEdge(e, bl.a);
        cut.push(line({ layer: input.layerCut, p1, p2 }));
      }

      // Tab marker at center of blocked interval
      const mid = (bl.a + bl.b) / 2;
      const pm = pointOnEdge(e, mid);
      safe.push(text({
        layer: input.layerSafe,
        position: { x: pm.x + 2, y: pm.y + 2 },
        height: 2.5,
        text: 'TAB',
      }));

      t0 = bl.b;
    }

    // Tail segment after last tab: [t0, end]
    if (e.len > t0 + 1e-6) {
      cut.push(line({
        layer: input.layerCut,
        p1: pointOnEdge(e, t0),
        p2: e.b,
      }));
    }
  });

  return { cut, safe, tabPositions };
}

// ============================================================================
// Tab Spec Parsing
// ============================================================================

/**
 * Parse tab configuration from operation params.
 */
export function parseTabSpec(params: Record<string, unknown>): TabSpec {
  const tabs = params.tabs as Record<string, unknown> | undefined;

  if (!tabs || tabs.enabled === false) {
    return { ...DEFAULT_TAB_SPEC, enabled: false };
  }

  return {
    enabled: true,
    count: typeof tabs.count === 'number' ? tabs.count : DEFAULT_TAB_SPEC.count,
    lengthMm: typeof tabs.lengthMm === 'number' ? tabs.lengthMm : DEFAULT_TAB_SPEC.lengthMm,
    insetMm: typeof tabs.insetMm === 'number' ? tabs.insetMm : DEFAULT_TAB_SPEC.insetMm,
    strategy: (tabs.strategy === 'UNIFORM' || tabs.strategy === 'MID_EDGES')
      ? tabs.strategy
      : DEFAULT_TAB_SPEC.strategy,
  };
}
