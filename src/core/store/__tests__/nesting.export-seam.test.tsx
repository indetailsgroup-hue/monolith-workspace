/**
 * @vitest-environment jsdom
 *
 * THE EXPORT SEAM — panel → store → export pipeline.
 *
 * The optimizer has always returned `unplacedParts`. That was never the problem.
 * The problem was that the value died at the component boundary: NestingPanel
 * called `onNestingComplete(sheets)`, ExportPanel called
 * `setNestingSheets(sheets)`, and `getNestingSheetsForExport()` — the function
 * monolithFactoryPackageExporter documents BY NAME as its nesting source —
 * handed a truncated layout to the export pipeline with no unplaced signal
 * attached. Every test in nesting.characterisation.test.ts passed the whole
 * time, because they all stop at `runNesting`.
 *
 * These tests drive the seam itself. They are the ones that would have failed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { NestingPanel } from '../../../components/nesting/NestingPanel';
import type { NestingCompletion } from '../../../components/nesting/NestingPanel';
import type { CutListRow } from '../../export/monolith/monolithExportContext';
import type { NestingPart } from '../../../nesting/types';
import {
  useNestingStore,
  getNestingSheetsForExport,
  hasNestingResults,
  hasUnplacedParts,
} from '../useNestingStore';

// ============================================
// FIXTURES
// ============================================

function row(
  partId: string,
  cutW: number,
  cutH: number,
  opts: { grain?: 'HORIZONTAL' | 'VERTICAL' | 'NONE'; materialId?: string } = {},
): CutListRow {
  return {
    partId,
    cabinetId: 'CAB1',
    materialId: opts.materialId ?? 'core-pb-18',
    finishW: cutW,
    finishH: cutH,
    edgeL: 0,
    edgeR: 0,
    edgeT: 0,
    edgeB: 0,
    premillL: 0,
    premillR: 0,
    premillT: 0,
    premillB: 0,
    cutW,
    cutH,
    qty: 1,
    grain: opts.grain ?? 'NONE',
  };
}

/**
 * A full-length worktop run. On the 1230 x 2450 board this material resolves
 * to, the usable area at the default 10mm clearance is 1210 x 2430 — so 2440mm
 * fails in BOTH orientations. This part is unplaceable by construction.
 */
const WORKTOP_SLAB = row('WORKTOP_SLAB', 2440, 640, { grain: 'HORIZONTAL' });
const DOOR_OK = row('DOOR_OK', 400, 700, { grain: 'NONE' });

/** Click "Run Optimization" and wait for the rAF-deferred run to settle. */
async function runOptimization(): Promise<void> {
  screen.getByRole('button', { name: /run optimization/i }).click();
  await waitFor(() => {
    expect(useNestingStore.getState().lastOptimizedAt).not.toBeNull();
  });
}

beforeEach(() => {
  useNestingStore.getState().clearNesting();
  // jsdom's rAF is timer-backed; run the callback immediately so the assertions
  // do not race the browser frame schedule.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

// RTL auto-cleanup is not wired up globally in this repo (vitest.setup.ts only
// registers jest-dom matchers), so unmount explicitly or every screen query
// after the first test matches two trees.
afterEach(() => {
  cleanup();
});

// ============================================
// 1. THE CALLBACK CARRIES BOTH HALVES
// ============================================

describe('NestingPanel → caller handoff', () => {
  it('forwards unplacedParts alongside sheets, not sheets alone', async () => {
    const onNestingComplete = vi.fn<(r: NestingCompletion) => void>();
    render(
      <NestingPanel
        cutListRows={[WORKTOP_SLAB, DOOR_OK]}
        onNestingComplete={onNestingComplete}
      />,
    );

    screen.getByRole('button', { name: /run optimization/i }).click();
    await waitFor(() => expect(onNestingComplete).toHaveBeenCalled());

    const result = onNestingComplete.mock.calls[0][0];
    // The layout is real but PARTIAL — the door made it, the worktop did not.
    expect(result.sheets.flatMap((s) => s.placements.map((p) => p.partId))).toEqual([
      'DOOR_OK',
    ]);
    // ...and the missing part arrives with it, at the same level.
    expect(result.unplacedParts.map((p) => p.id)).toEqual(['WORKTOP_SLAB']);
  });

  it('names the unplaced part in a role="alert" banner', async () => {
    render(<NestingPanel cutListRows={[WORKTOP_SLAB, DOOR_OK]} />);
    screen.getByRole('button', { name: /run optimization/i }).click();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('WORKTOP_SLAB');
    expect(alert).toHaveTextContent(/INCOMPLETE/);
  });
});

// ============================================
// 2. THE STORE REFUSES TO EXPORT A PARTIAL LAYOUT
// ============================================

describe('useNestingStore → export pipeline', () => {
  it('getNestingSheetsForExport() returns undefined while parts are unplaced', async () => {
    render(
      <NestingPanel
        cutListRows={[WORKTOP_SLAB, DOOR_OK]}
        // Exactly what ExportPanel.handleNestingComplete does.
        onNestingComplete={(r) =>
          useNestingStore.getState().setNestingSheets(r.sheets, r.unplacedParts)
        }
      />,
    );
    await runOptimization();

    // The partial layout IS in the store — it is still worth showing.
    expect(useNestingStore.getState().nestingSheets).toHaveLength(1);
    expect(useNestingStore.getState().unplacedParts.map((p) => p.id)).toEqual([
      'WORKTOP_SLAB',
    ]);

    // But the export-facing accessor will not hand it over.
    expect(getNestingSheetsForExport()).toBeUndefined();
    expect(hasNestingResults()).toBe(false);
    expect(hasUnplacedParts()).toBe(true);
  });

  it('a run where EVERY part is dropped does not read as a completed nest', async () => {
    render(
      <NestingPanel
        cutListRows={[WORKTOP_SLAB]}
        onNestingComplete={(r) =>
          useNestingStore.getState().setNestingSheets(r.sheets, r.unplacedParts)
        }
      />,
    );
    await runOptimization();

    // [] is not null, which is what made the old `nestingSheets !== null` gate
    // render a green ✓ over a layout that placed nothing.
    expect(useNestingStore.getState().nestingSheets).toEqual([]);
    expect(hasNestingResults()).toBe(false);
    expect(getNestingSheetsForExport()).toBeUndefined();
  });

  it('a complete run DOES reach the export pipeline', async () => {
    render(
      <NestingPanel
        cutListRows={[DOOR_OK]}
        onNestingComplete={(r) =>
          useNestingStore.getState().setNestingSheets(r.sheets, r.unplacedParts)
        }
      />,
    );
    await runOptimization();

    expect(useNestingStore.getState().unplacedParts).toEqual([]);
    expect(hasNestingResults()).toBe(true);
    const sheets = getNestingSheetsForExport();
    expect(sheets).toHaveLength(1);
    expect(sheets![0].placements.map((p) => p.partId)).toEqual(['DOOR_OK']);
  });

  it('clearNesting resets the unplaced list too', () => {
    const dropped: NestingPart = {
      id: 'X',
      sourcePartId: 'X',
      cabinetId: 'CAB1',
      width: 2440,
      height: 640,
      materialId: 'core-pb-18',
      canRotate: false,
      grainDirection: 'HORIZONTAL',
    };
    useNestingStore.getState().setNestingSheets([], [dropped]);
    expect(hasUnplacedParts()).toBe(true);
    useNestingStore.getState().clearNesting();
    expect(hasUnplacedParts()).toBe(false);
  });
});
