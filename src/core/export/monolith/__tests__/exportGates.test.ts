/**
 * exportGates.test.ts — THE GATES ARE INSTALLED, NOT JUST BUILT.
 *
 * ── WHAT THIS FILE EXISTS TO PREVENT ────────────────────────────────────────────────
 * Two safety gates were written, documented as blocking, exported from their barrels,
 * unit-tested in isolation — and called by NOTHING:
 *
 *   assertBuildableHeightStack       docstring: "the gate for anything that would commit
 *                                    the configuration to a cut list, a quote or a
 *                                    packet". Production callers: zero.
 *   assertEmissionCompliantForExport docstring: "the one that must sit in front of the
 *                                    border". Production callers: zero.
 *
 * A gate that is built and not installed is WORSE than no gate, because every reader of
 * the module — and every reviewer of the report describing it — believes the system is
 * protected. Both are now wired into createMONOLITHFactoryPackageExporter, the narrowest
 * point every DXF sheet, cut-list row and report in a MONOLITH packet passes through.
 *
 * These tests drive that REAL path. They fail if the call sites are deleted, which is the
 * only property that makes them worth having — the isolated unit tests for both gates
 * passed happily throughout the period when neither gate was reachable.
 */

import { describe, it, expect } from 'vitest';
import { createMONOLITHFactoryPackageExporter, createDefaultExporter } from '../monolithFactoryPackageExporter';
import { createStubContextProvider } from '../monolithExportContext';
import { deriveHeightStack, DEFAULT_HEIGHT_STACK } from '../../../catalog';

const ARGS = { jobId: 'JOB_GATE_TEST', headManifestHashHex: 'a'.repeat(64) };

describe('export gate — the height stack must be buildable', () => {
  it('REFUSES to produce a packet from the shipped default stack', async () => {
    // THE HEADLINE, AND IT IS DELIBERATE. The default Thai configuration declares an
    // 850mm counter and its material stack builds 848.6mm, so DEFAULT_HEIGHT_STACK is
    // not buildable and no cut list may be produced from it. Under the NO_CUT posture
    // that is the correct outcome: cutting every carcass to a 70mm toe kick for a
    // kitchen that assembles 1.4mm short is the exact declared-vs-built defect this
    // system exists to eliminate.
    expect(DEFAULT_HEIGHT_STACK.buildable).toBe(false);

    const exporter = createDefaultExporter(createStubContextProvider());
    await expect(exporter.exportFactoryPackage(ARGS)).rejects.toThrow(/UNBUILDABLE/);
  });

  it('names the real numbers in the refusal, so it is actionable', async () => {
    const exporter = createDefaultExporter(createStubContextProvider());
    await expect(exporter.exportFactoryPackage(ARGS)).rejects.toThrow(
      /WORKTOP_BUILT_THICKNESS_OFF_TARGET/
    );
    // The job id is carried into the message so a refusal can be traced to a packet.
    await expect(exporter.exportFactoryPackage(ARGS)).rejects.toThrow(/JOB_GATE_TEST/);
  });

  it('REFUSES a stack whose plinth is below the leg minimum (worktopThickness 30)', async () => {
    // The configuration the leg-reachability work already proved yields a 60mm plinth
    // against a 70mm minimum leg. Driven through the REAL export path, not the validator.
    const unbuildable = deriveHeightStack({ worktopThickness: 30, worktopConfig: null });
    expect(unbuildable.plinthHeight).toBe(60);
    expect(unbuildable.buildable).toBe(false);

    const exporter = createMONOLITHFactoryPackageExporter({
      contextProvider: createStubContextProvider(),
      heightStack: unbuildable,
    });
    await expect(exporter.exportFactoryPackage(ARGS)).rejects.toThrow(
      /PLINTH_BELOW_LEG_MINIMUM/
    );
  });

  it('the gate is BEFORE any file is built — nothing is emitted on refusal', async () => {
    // Ordering matters: a packet that half-materialises before failing can leave
    // artifacts behind. The context provider is never even consulted.
    let contextRequested = false;
    const spyProvider = {
      getExportContext: async (a: { jobId: string; headManifestHashHex: string }) => {
        contextRequested = true;
        return createStubContextProvider().getExportContext(a);
      },
    };

    const exporter = createMONOLITHFactoryPackageExporter({ contextProvider: spyProvider });
    await expect(exporter.exportFactoryPackage(ARGS)).rejects.toThrow();
    expect(contextRequested).toBe(false);
  });

  it('ALLOWS a packet once the stack is buildable — this is a gate, not a wall', async () => {
    // The positive control. Without it, "the export throws" could equally be an
    // unconditional failure, and the gate would be indistinguishable from a broken build.
    const buildable = deriveHeightStack({ worktopConfig: null });
    expect(buildable.buildable).toBe(true);

    const exporter = createMONOLITHFactoryPackageExporter({
      contextProvider: createStubContextProvider(),
      heightStack: buildable,
    });
    const files = await exporter.exportFactoryPackage(ARGS);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.filename.endsWith('.csv'))).toBe(true);
  });
});

describe('export gate — formaldehyde emission, when a destination is declared', () => {
  const buildable = deriveHeightStack({ worktopConfig: null });

  it('BLOCKS a US-destined packet whose materials cannot even be resolved', async () => {
    // AN EMPTY MATERIAL SET MUST NOT PASS VACUOUSLY, and this test caught it doing so.
    //
    // The stub provider references 'MAT_001', an id in no catalog. The first version of
    // this wiring filtered the catalog by the packet's material ids, got an empty array,
    // and handed it to validateEmissionForExport — which reported COMPLIANT, because it
    // found nothing that broke a rule. It found nothing at all. "Checked and clean" and
    // "nothing was checked" are different states and only one of them may ship a packet.
    const exporter = createMONOLITHFactoryPackageExporter({
      contextProvider: createStubContextProvider(),
      heightStack: buildable,
      exportDestination: 'US',
    });
    await expect(exporter.exportFactoryPackage(ARGS)).rejects.toThrow(/UNRESOLVED_MATERIAL/);
    await expect(exporter.exportFactoryPackage(ARGS)).rejects.toThrow(/MAT_001/);
  });

  it('BLOCKS a US-destined packet of REAL materials, none of which state a CARB class', async () => {
    // The practical state of the catalog: MONOLITH holds no supplier certificate for any
    // SKU, so `formaldehydeEmission` is undefined on every entry. Here the materials DO
    // resolve — so this exercises the emission validator itself rather than the
    // unresolved-material guard above.
    const realCore = 'core-hmr-18';
    const provider = {
      getExportContext: async (a: { jobId: string; headManifestHashHex: string }) => ({
        ...(await createStubContextProvider().getExportContext(a)),
        materialIds: [realCore],
      }),
    };

    const exporter = createMONOLITHFactoryPackageExporter({
      contextProvider: provider,
      heightStack: buildable,
      exportDestination: 'US',
    });
    await expect(exporter.exportFactoryPackage(ARGS)).rejects.toThrow(
      /Formaldehyde emission gate FAILED/
    );
    await expect(exporter.exportFactoryPackage(ARGS)).rejects.toThrow(/EMISSION_DATA_MISSING/);
  });

  it('BLOCKS a TH-destined packet too — an unsourced requirement is not "no requirement"', async () => {
    // Asserting that a market has no formaldehyde rule is itself a regulatory claim, and
    // an unsourced one is exactly as dangerous as an invented limit.
    //
    // Uses a REAL catalog material so the packet gets past the unresolved-material guard
    // and reaches the destination check — otherwise this would pass for the wrong reason.
    const provider = {
      getExportContext: async (a: { jobId: string; headManifestHashHex: string }) => ({
        ...(await createStubContextProvider().getExportContext(a)),
        materialIds: ['core-hmr-18'],
      }),
    };

    const exporter = createMONOLITHFactoryPackageExporter({
      contextProvider: provider,
      heightStack: buildable,
      exportDestination: 'TH',
    });
    await expect(exporter.exportFactoryPackage(ARGS)).rejects.toThrow(
      /DESTINATION_REQUIREMENT_UNSOURCED/
    );
  });

  it('does NOT run when no destination is declared — and the packet is NOT certified', async () => {
    // STATED PLAINLY RATHER THAN IMPLIED. Omitting the destination is not a compliance
    // pass; it means nobody said where this is going, so nothing was checked. The gate
    // must not invent a destination on the caller's behalf, because naming one is itself
    // the regulatory claim.
    const exporter = createMONOLITHFactoryPackageExporter({
      contextProvider: createStubContextProvider(),
      heightStack: buildable,
    });
    const files = await exporter.exportFactoryPackage(ARGS);
    expect(files.length).toBeGreaterThan(0);
  });
});
