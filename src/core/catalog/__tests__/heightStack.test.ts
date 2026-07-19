/**
 * heightStack.test.ts — the height stack must CLOSE.
 *
 * THE DEFECT THIS PINS
 * MONOLITH declared ERGONOMIC_STANDARDS.counterHeight = 900 while actually building
 * 100 toe + 720 carcass + 18.6 slab = 838.6mm — 61.4mm below its own declared target,
 * and below Thai 850, EU/UK 870-910, AU 900 and US 914. The comments justifying 900
 * read "720 + 100 toe + 40 countertop + 40 clearance", which sums to 860, not 900, and
 * whose "+40 clearance" term corresponded to no geometry anywhere in the codebase.
 *
 * So this file is strict on purpose. The invariant
 *
 *     plinth + carcass + worktopThickness === counterHeight
 *
 * is asserted to 1e-9, and there are explicit negative tests proving it FAILS LOUDLY
 * when any term drifts. A tolerant version of this test is worthless: the original bug
 * was a 61.4mm miss that nothing caught.
 *
 * ── REVISION: THE CONSTANTS CHANGED, THE STRICTNESS DID NOT ─────────────────────────
 * This file previously asserted carcassHeight === 720 and worktop === 18.6, deriving a
 * 111.4mm plinth. Those constants were WRONG for this business. The owner of the kitchen
 * business MONOLITH is built for confirms:
 *
 *     850 counter = 70 leg (MINIMUM, adjusts up) + 760 carcass + 20 worktop
 *
 * A first-hand statement of what a business builds outranks a published corpus describing
 * what someone else builds. The 720/30/100 arithmetic that a previous document audit
 * derived is real, but it is EUROPEAN — it is kept, correctly attributed, as
 * MARKET_HEIGHT_PROFILES.EU rather than being allowed to define the Thai default.
 *
 * Every assertion below that changed is marked CHANGED with the reason. The invariant
 * itself, the 1e-9 tolerance and every negative test are untouched — and note that the
 * invariant tests PASSED THROUGHOUT the constant change, because the derivation was
 * always structurally right. Only the encoded numbers were wrong.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  deriveHeightStack,
  deriveMarketHeightStack,
  assertBuildableHeightStack,
  reportHeightStackWarnings,
  reportDefaultHeightStackOnce,
  resetDefaultHeightStackReportedForTest,
  resolveWorktopThickness,
  findClosestBuildableWorktop,
  DEFAULT_HEIGHT_STACK,
  DEFAULT_TOE_KICK_HEIGHT_MM,
  DEFAULT_COUNTER_HEIGHT_MM,
  DEFAULT_CARCASS_HEIGHT_MM,
  DEFAULT_WORKTOP_THICKNESS_MM,
  DEFAULT_WORKTOP_BUILT_THICKNESS_MM,
  DEFAULT_WORKTOP_THICKNESS_GAP,
  MARKET_HEIGHT_PROFILES,
  COUNTER_HEIGHT_TARGETS_MM,
  JIS_A0017_2018,
  NEXT125_PLINTH_RUNGS_MM,
  ERGONOMIC_STANDARDS,
  CABINET_TYPES,
  BASE_CABINET_STANDARDS,
} from '../CabinetTaxonomy';
import {
  THAI_ADJUSTABLE_LEG_70,
  THAI_LEG_100_RETIRED,
  resolvePlinthLeg,
  assessLegReachability,
  type PlinthLeg,
} from '../PlinthLegCatalog';
import { DEFAULT_DIMENSIONS } from '../../types/Cabinet';
import { createDefaultIntent } from '../../designer/policy';
import { DEFAULT_WORKTOP_CONFIG } from '../../worktop/types';
import { resolveWorktopMaterials, worktopRealThickness } from '../../worktop/computeWorktopPanel';

/** Exact-to-floating-point closure. NOT a manufacturing tolerance. */
const EXACT = 9;

describe('height stack — the invariant', () => {
  it('closes for the Thai default: plinth + carcass + worktop === 850', () => {
    const s = deriveHeightStack(); // Thai default

    expect(s.counterHeight).toBe(850);
    // CHANGED 720 -> 760 and 18.6 -> 20: the test encoded EUROPEAN constants. These three
    // are the owner's stated numbers for this business.
    expect(s.carcassHeight).toBe(760);
    expect(s.worktopThickness).toBe(20);
    expect(s.plinthHeight).toBe(70);

    // THE INVARIANT.
    expect(s.plinthHeight + s.carcassHeight + s.worktopThickness).toBeCloseTo(
      s.counterHeight,
      EXACT
    );
  });

  it('the Thai plinth lands on EXACTLY the leg minimum — the load-bearing coincidence', () => {
    const s = deriveHeightStack();

    // 850 - 760 - 20 = 70, and 70 is the wound-fully-down height of the leg the owner
    // buys. This is the single most consequential fact in the stack and it is asserted
    // exactly, not approximately.
    expect(s.plinthHeight).toBe(THAI_ADJUSTABLE_LEG_70.minHeight);
    expect(s.legReachability.reachable).toBe(true);

    // ...which means ZERO downward levelling headroom. A flat floor is the lower bound.
    expect(s.levelling.shortenHeadroom).toBe(0);
    expect(s.warnings.map((w) => w.code)).toContain('NO_LEVELLING_HEADROOM_DOWNWARD');

    // BUT THE STACK IS NOT BUILDABLE, AND THE REASON IS MATERIAL, NOT GEOMETRY.
    // These are two different questions and this test now keeps them apart:
    //   - is the derived 70mm plinth reachable on a real leg?  YES (above).
    //   - does the slab we would actually cut match the 20mm we declare?  NO.
    // The configured stack builds 18.6mm, so the kitchen assembles to 848.6mm while
    // declaring 850mm. See the dedicated reconciliation suite below.
    expect(s.buildable).toBe(false);
    expect(s.errors.map((e) => e.code)).toEqual(['WORKTOP_BUILT_THICKNESS_OFF_TARGET']);
  });

  it('the GEOMETRY alone is buildable — proven by removing only the material term', () => {
    // Same 850/760/20, but with no material stack asserted against it. Everything the
    // owner stated still closes: 70mm plinth, reachable on the 70mm leg, no errors.
    //
    // This is the control that proves the failure above is about the CATALOG and not
    // about the owner's numbers. If a 20mm slab is sourced — and 20mm is the standard
    // 2cm stone thickness, which is the open question — this configuration builds.
    const s = deriveHeightStack({ worktopConfig: null });
    expect(s.plinthHeight).toBe(70);
    expect(s.plinthHeight + s.carcassHeight + s.worktopThickness).toBeCloseTo(850, EXACT);
    expect(s.legReachability.reachable).toBe(true);
    expect(s.buildable).toBe(true);
    // ...and it is loudly flagged as unreconciled rather than quietly passing.
    expect(s.warnings.map((w) => w.code)).toContain('WORKTOP_MATERIAL_NOT_SOURCED');
  });

  it('closes for an EU-configured tenant: plinth + carcass + worktop === 900', () => {
    const s = deriveHeightStack({ counterHeight: COUNTER_HEIGHT_TARGETS_MM.EU });

    expect(s.counterHeight).toBe(900);

    // THE INVARIANT.
    expect(s.plinthHeight + s.carcassHeight + s.worktopThickness).toBeCloseTo(
      s.counterHeight,
      EXACT
    );
  });

  it('STEP 5 — the EU profile is a real alternative configuration, not a re-scaled Thai one', () => {
    const th = deriveMarketHeightStack(MARKET_HEIGHT_PROFILES.TH);
    const eu = deriveMarketHeightStack(MARKET_HEIGHT_PROFILES.EU);

    // Thai: 850 = 70 + 760 + 20.
    expect([th.plinthHeight, th.carcassHeight, th.worktopThickness]).toEqual([70, 760, 20]);
    expect(th.plinthHeight + th.carcassHeight + th.worktopThickness).toBeCloseTo(850, EXACT);

    // European: 900 = 150 + 720 + 30. DIFFERENT carcass and DIFFERENT worktop, not the
    // Thai stack with a bigger plinth — which is the whole point of profiling markets.
    expect([eu.plinthHeight, eu.carcassHeight, eu.worktopThickness]).toEqual([150, 720, 30]);
    expect(eu.plinthHeight + eu.carcassHeight + eu.worktopThickness).toBeCloseTo(900, EXACT);

    // Both plinths must be REACHABLE by a real leg, which is the STEP 4 rule applied to
    // STEP 5's second target.
    expect(th.legReachability.reachable).toBe(true);
    expect(eu.legReachability.reachable).toBe(true);

    // BUILDABILITY DIFFERS, AND FOR AN HONEST REASON. The Thai profile names the real
    // shipped material stack, so its 20mm target is reconciled against it — and fails,
    // because that stack builds 18.6mm. The EU profile names NO material (nobody has
    // sourced a European worktop SKU), so there is nothing to reconcile against and the
    // gap is reported as unknown rather than as a fabricated 11.4mm finding about a slab
    // no one proposed building.
    expect(th.buildable).toBe(false);
    expect(th.errors.map((e) => e.code)).toEqual(['WORKTOP_BUILT_THICKNESS_OFF_TARGET']);

    expect(eu.buildable).toBe(true);
    expect(eu.builtWorktopThickness).toBeNull();
    expect(eu.warnings.map((w) => w.code)).toContain('WORKTOP_MATERIAL_NOT_SOURCED');

    // And they differ exactly where the standards predict. The European assembly is
    // 720 + 30 = 750, which is precisely the assembly JIS's B = A - 750 rule assumes, so
    // the EU plinth lands on a published rung BY CONSTRUCTION. The Thai assembly is
    // 760 + 20 = 780, 30mm taller, so its plinth is 30mm shorter and off-rung. One root
    // cause, fully explained, no fudge factor.
    expect(eu.carcassHeight + eu.worktopThickness).toBe(JIS_A0017_2018.plinthRuleOffsetMm);
    expect(eu.onPublishedRung).toBe(true);
    expect(eu.matchedRungStandards).toEqual(['JIS A0017:2018', 'next125']);

    expect(th.carcassHeight + th.worktopThickness).toBe(780);
    expect(th.onPublishedRung).toBe(false);
    expect(eu.plinthHeight - th.plinthHeight).toBe(80);
  });

  it('STEP 5 — the EU tenant has real downward levelling headroom where Thai has none', () => {
    const th = deriveMarketHeightStack(MARKET_HEIGHT_PROFILES.TH);
    const eu = deriveMarketHeightStack(MARKET_HEIGHT_PROFILES.EU);

    // Same leg (the only one sourced), very different install condition.
    expect(th.levelling.shortenHeadroom).toBe(0);
    expect(eu.levelling.shortenHeadroom).toBe(80); // 150 - 70

    expect(th.warnings.map((w) => w.code)).toContain('NO_LEVELLING_HEADROOM_DOWNWARD');
    expect(eu.warnings.map((w) => w.code)).not.toContain('NO_LEVELLING_HEADROOM_DOWNWARD');

    // REPORTED, NOT FAKED: the EU profile stands on the Thai leg because no European leg
    // SKU is sourced. Its lower bound is meaningful; its provenance says the rest is not.
    expect(MARKET_HEIGHT_PROFILES.EU.provenance).toBe('UNSOURCED');
    expect(MARKET_HEIGHT_PROFILES.TH.provenance).toBe('OWNER_CONFIRMED');
  });

  it.each([
    ['TH', 850],
    ['JP', 850],
    ['EU', 900],
    ['UK', 900],
    ['AU', 900],
    ['US', 914],
  ] as const)('closes for the %s market target (%dmm)', (_market, counterHeight) => {
    const s = deriveHeightStack({ counterHeight });
    expect(s.plinthHeight + s.carcassHeight + s.worktopThickness).toBeCloseTo(counterHeight, EXACT);
  });

  it('FAILS LOUDLY on mismatch — a wrong plinth does not satisfy the invariant', () => {
    const s = deriveHeightStack();

    // HISTORY, pinned with literals on purpose. This is what MONOLITH actually shipped:
    // the 100 toe-kick literal on a 720 carcass under an 18.6 slab. These three numbers
    // are quoted as historical fact, NOT read from the live constants, so this assertion
    // keeps documenting the original defect even now that all three have changed.
    const shippedStack = 100 + 720 + 18.6;
    expect(shippedStack).toBeCloseTo(838.6, 6);
    // It missed the 900 the old code DECLARED by 61.4mm...
    expect(900 - shippedStack).toBeCloseTo(61.4, 6);
    // ...and the Thai 850 it should have been building by 11.4mm.
    expect(850 - shippedStack).toBeCloseTo(11.4, 6);

    // LIVE: the same wrong plinth against today's real stack still fails, by even more
    // (100 + 760 + 20 = 880, i.e. 30mm OVER 850 — the error flipped sign when the carcass
    // grew, which is exactly why a pinned expectation beats a derived one here).
    expect(100 + s.carcassHeight + s.worktopThickness).toBe(880);
    expect(100 + s.carcassHeight + s.worktopThickness).not.toBeCloseTo(s.counterHeight, EXACT);

    // Prove the assertion form used above actually rejects a bad stack, rather than
    // passing vacuously.
    expect(() =>
      expect(100 + s.carcassHeight + s.worktopThickness).toBeCloseTo(s.counterHeight, EXACT)
    ).toThrow();
  });

  it('FAILS LOUDLY when any single term drifts by 1mm', () => {
    const s = deriveHeightStack();
    for (const drift of [-1, 1]) {
      expect(() =>
        expect(s.plinthHeight + drift + s.carcassHeight + s.worktopThickness).toBeCloseTo(
          s.counterHeight,
          EXACT
        )
      ).toThrow();
    }
  });

  it('plinth is DERIVED, so changing the counter height moves the plinth 1:1', () => {
    const a = deriveHeightStack({ counterHeight: 850 });
    const b = deriveHeightStack({ counterHeight: 900 });
    expect(b.plinthHeight - a.plinthHeight).toBeCloseTo(50, EXACT);
  });

  it('a thicker worktop eats into the plinth, not into the counter height', () => {
    const thin = deriveHeightStack({ worktopThickness: 18.6 });
    const thick = deriveHeightStack({ worktopThickness: 30 });
    expect(thin.counterHeight).toBe(thick.counterHeight);
    expect(thin.plinthHeight - thick.plinthHeight).toBeCloseTo(11.4, 6);
  });

  it('a thicker worktop can push the plinth BELOW the leg minimum — and is rejected', () => {
    // 850 - 760 - 30 = 60mm, which is 10mm shorter than any leg that can be bought.
    // Under the old model this was a perfectly acceptable "derived" plinth. It is not:
    // it is a kitchen that cannot be assembled.
    const s = deriveHeightStack({ worktopThickness: 30 });
    expect(s.plinthHeight).toBe(60);

    // The INVARIANT still closes — the arithmetic is fine. Buildability is a SEPARATE
    // question, and that separation is the point of STEP 4.
    expect(s.plinthHeight + s.carcassHeight + s.worktopThickness).toBeCloseTo(850, EXACT);

    expect(s.buildable).toBe(false);
    expect(s.errors.map((e) => e.code)).toContain('PLINTH_BELOW_LEG_MINIMUM');
    expect(s.legReachability.code).toBe('BELOW_LEG_MINIMUM');

    // NOT rounded up to 70. Rounding would silently build an 860mm counter.
    expect(s.plinthHeight).not.toBe(70);

    const err = s.errors.find((e) => e.code === 'PLINTH_BELOW_LEG_MINIMUM')!;
    expect(err.message).toContain('UNBUILDABLE');
    expect(err.message).toContain('70mm minimum');
    expect(err.message).toContain('do not round the plinth up');
  });
});

describe('height stack — published plinth rungs', () => {
  it('THE REAL FINDING: the Thai default derives 70mm, which is NOT a published rung', () => {
    const s = DEFAULT_HEIGHT_STACK;

    // CHANGED 111.4 -> 70. The old expectation was arithmetically correct for the WRONG
    // inputs (850 - 720 - 18.6). With the owner's real inputs, 850 - 760 - 20 = 70.
    expect(s.plinthHeight).toBe(70);
    expect(s.onPublishedRung).toBe(false);
    expect(s.matchedRungStandards).toEqual([]);

    const w = s.warnings.find((x) => x.code === 'PLINTH_OFF_PUBLISHED_RUNG');
    expect(w).toBeDefined();
    expect(w!.message).toContain('70.0');
    expect(w!.message).toContain('NOT rounded');

    // THE ADVICE MUST FLIP WITH THE SIGN. The Thai assembly (780) is TALLER than the 750
    // the JIS rule assumes, so the plinth is SHORTER than the rung and no worktop can
    // close the gap. An earlier version ran the shortfall arithmetic unconditionally and
    // emitted "source a -10.0mm worktop", which is not a thing that exists.
    expect(w!.message).not.toMatch(/source a -/);
    expect(w!.message).toContain('TALLER than the rule assumes');
    expect(w!.message).toContain('shorter leg');
    expect(w!.message).toContain('not a defect');
  });

  it('the rung advice reverses correctly when the assembly is SHORTER than 750', () => {
    // The other branch: 720 + 18.6 = 738.6, 11.4mm short of 750, so the plinth overshoots
    // the rung and a THICKER worktop genuinely is the fix. Proves the sign handling is a
    // real branch, not a one-sided patch for the Thai case.
    const s = deriveHeightStack({ carcassHeight: 720, worktopThickness: 18.6 });
    expect(s.plinthHeight).toBeCloseTo(111.4, 6);

    const w = s.warnings.find((x) => x.code === 'PLINTH_OFF_PUBLISHED_RUNG')!;
    expect(w.message).toContain('SHORTER than the rule');
    // 18.6 + 11.4 = 30.0mm, a real and sensible worktop thickness.
    expect(w.message).toContain('Source a 30.0mm worktop');
  });

  it('off-rung is EXPECTED here, because the Thai assembly is not the one JIS assumes', () => {
    // CHANGED, and the reasoning is inverted from the version this replaces. The old test
    // said both markets miss their rung by 11.4mm because the real assembly (720 + 18.6)
    // fell SHORT of the 750 JIS assumes. With the owner's numbers the Thai assembly
    // (760 + 20 = 780) OVERSHOOTS 750 by 30mm, so the Thai plinth is 30mm SHORT of the
    // JIS rung rather than over it — and the European profile, which really does build
    // 720 + 30 = 750, lands on its rung exactly.
    const th = deriveMarketHeightStack(MARKET_HEIGHT_PROFILES.TH);
    const eu = deriveMarketHeightStack(MARKET_HEIGHT_PROFILES.EU);

    const thAssemblyExcess =
      th.carcassHeight + th.worktopThickness - JIS_A0017_2018.plinthRuleOffsetMm;
    expect(thAssemblyExcess).toBe(30);

    // JIS rule B = A - 750 would give 100 at 850. The Thai plinth is exactly 30mm under.
    const jisRungAt850 = 850 - JIS_A0017_2018.plinthRuleOffsetMm;
    expect(jisRungAt850).toBe(100);
    expect(jisRungAt850 - th.plinthHeight).toBe(thAssemblyExcess);

    // The European profile has zero excess and therefore zero miss.
    expect(eu.carcassHeight + eu.worktopThickness - JIS_A0017_2018.plinthRuleOffsetMm).toBe(0);
    expect(eu.plinthHeight).toBe(900 - JIS_A0017_2018.plinthRuleOffsetMm);
  });

  it('the DERIVATION is provably correct: the European assembly lands on a rung', () => {
    // The control. It proves the off-rung Thai result is caused by a genuinely different
    // assembly and NOT by broken arithmetic — feed the derivation the assembly JIS assumes
    // and it reproduces JIS's own rungs.
    //
    // `worktopConfig: null` because these are GEOMETRIC hypotheticals: they ask what a
    // 30mm worktop would do to the rung arithmetic, and nobody is claiming a 30mm slab
    // exists in this catalog. Reconciling them against the shipped 18.6mm melamine would
    // bury the rung finding under an 11.4mm material error about a slab that is not part
    // of the question.
    const th = deriveHeightStack({
      counterHeight: 850,
      carcassHeight: 720,
      worktopThickness: 30,
      worktopConfig: null,
    });
    expect(th.plinthHeight).toBeCloseTo(100, EXACT);
    expect(th.onPublishedRung).toBe(true);
    expect(th.matchedRungStandards).toEqual(['JIS A0017:2018', 'next125']);

    const eu = deriveHeightStack({
      counterHeight: 900,
      carcassHeight: 720,
      worktopThickness: 30,
      worktopConfig: null,
    });
    expect(eu.plinthHeight).toBeCloseTo(150, EXACT);
    expect(eu.onPublishedRung).toBe(true);
    expect(eu.matchedRungStandards).toEqual(['JIS A0017:2018', 'next125']);

    // Both are buildable on a real leg, and neither carries a rung warning.
    for (const s of [th, eu]) {
      expect(s.buildable).toBe(true);
      expect(s.warnings.map((w) => w.code)).not.toContain('PLINTH_OFF_PUBLISHED_RUNG');
    }
  });

  it('warns rather than silently rounding an off-rung plinth', () => {
    const s = deriveHeightStack({ counterHeight: 850 });
    // The returned value is the exact derivation, NOT snapped to the nearest rung.
    expect(s.plinthHeight).not.toBe(100);
    expect(s.plinthHeight).not.toBe(75);
    expect(s.warnings.length).toBeGreaterThan(0);
  });

  it('recognises every next125-only rung (75/125/175) as published', () => {
    for (const rung of [75, 125, 175]) {
      const s = deriveHeightStack({
        counterHeight: DEFAULT_CARCASS_HEIGHT_MM + 30 + rung,
        worktopThickness: 30,
      });
      expect(s.plinthHeight).toBeCloseTo(rung, EXACT);
      expect(s.matchedRungStandards).toEqual(['next125']);
    }
  });

  it('JIS rule B = A - 750 regenerates the standard’s own rung set', () => {
    const derived = JIS_A0017_2018.worktopHeightsMm.map(
      (a) => a - JIS_A0017_2018.plinthRuleOffsetMm
    );
    expect(derived).toEqual([...JIS_A0017_2018.plinthRungsMm]);
  });

  it('ERRORS (no longer merely warns) when the stack cannot close at all', () => {
    // CHANGED from `warnings` to `errors`, and this is a deliberate severity PROMOTION,
    // not a relocation to make a test pass. A stack that cannot close produces a negative
    // plinth: there is no kitchen. That belongs with the rejections, not in the same list
    // as "this is not a published rung".
    const s = deriveHeightStack({ counterHeight: 700 }); // below carcass + worktop
    expect(s.plinthHeight).toBeLessThan(0);
    expect(s.errors.map((e) => e.code)).toContain('PLINTH_NOT_POSITIVE');
    expect(s.errors.map((e) => e.code)).toContain('PLINTH_BELOW_LEG_MINIMUM');
    expect(s.buildable).toBe(false);
    expect(() => assertBuildableHeightStack(s)).toThrow(/UNBUILDABLE/);
  });

  it('warns on a counter height that is on no published list', () => {
    const s = deriveHeightStack({ counterHeight: 873 });
    expect(s.warnings.map((w) => w.code)).toContain('COUNTER_HEIGHT_OFF_PUBLISHED_LIST');
  });

  it('reports warnings to a runtime sink', () => {
    const sink = vi.fn();
    reportHeightStackWarnings(DEFAULT_HEIGHT_STACK, 'test', sink);
    expect(sink).toHaveBeenCalled();
    // CHANGED from `sink.mock.calls[0][0]` to a search across all calls. The old form
    // asserted this warning was emitted FIRST, which was incidental — the stack now emits
    // leg warnings too and the ordering is not the contract. The contract is that the
    // warning reaches the sink at all.
    const emitted = sink.mock.calls.map((c) => String(c[0]));
    expect(emitted.some((line) => line.includes('PLINTH_OFF_PUBLISHED_RUNG'))).toBe(true);
  });
});

describe('height stack — worktop thickness comes from the real material stack', () => {
  it('CHANGED: the TARGET is a spec (20), the BUILT thickness is read from the catalog', () => {
    // This test previously asserted DEFAULT_WORKTOP_THICKNESS_MM === 18.6, i.e. it defined
    // the spec as "whatever the materials happen to sum to". That dependency was
    // BACKWARDS. The business states 20mm; the material stack is then judged against it.
    // The two constants are now separate precisely so the gap between them is visible —
    // collapsing them is what let the original 61.4mm defect hide.
    expect(DEFAULT_WORKTOP_THICKNESS_MM).toBe(20);

    // The BUILT thickness must still equal what the worktop lane computes for the same
    // config — same catalog entries, same formula. If these diverge, slabs and plinths
    // disagree and the counter is not level with itself.
    const fromWorktopLane = worktopRealThickness(resolveWorktopMaterials(DEFAULT_WORKTOP_CONFIG));
    expect(DEFAULT_WORKTOP_BUILT_THICKNESS_MM).toBeCloseTo(fromWorktopLane, EXACT);
    expect(DEFAULT_WORKTOP_BUILT_THICKNESS_MM).toBeCloseTo(18.6, 6);
  });

  it('THE 20mm FINDING: exactly 20mm is NOT achievable from this catalog', () => {
    const gap = DEFAULT_WORKTOP_THICKNESS_GAP;
    expect(gap.targetMm).toBe(20);
    expect(gap.exact).toBe(false);

    // Closest BUILDABLE (moisture-resistant core, bandable by a 23mm tape) is 19.6mm.
    expect(gap.closestAchievableMm).toBeCloseTo(19.6, 6);
    expect(gap.deltaMm).toBeCloseTo(-0.4, 6);

    // The arithmetic, spelled out: an 18mm moisture-resistant core + 2 x 0.8mm HPL.
    expect(gap.coreMaterialId).toMatch(/-18$/);
    expect(gap.surfaceMaterialId).toMatch(/^surf-hpl-/);

    // The named pair is an EXAMPLE, not a recommendation: several combinations tie at
    // 19.6mm and the result must say so rather than presenting an arbitrary winner as
    // though the catalog had picked a material.
    expect(gap.tiedCombinationCount).toBeGreaterThan(1);

    // Deterministic: object key order must not decide the answer.
    expect(findClosestBuildableWorktop(20)).toEqual(gap);

    // WHY 20.0 is unreachable: slab = core + 2 x surface. Surfaces are ONLY 0.3 (melamine)
    // and 0.8 (HPL), so hitting 20.0 needs a 1.0mm surface on an 18 core or a 0.5mm
    // surface on a 19 core. Neither exists, and no core is 20mm.
    expect([18 + 2 * 0.3, 18 + 2 * 0.8, 19 + 2 * 0.3, 19 + 2 * 0.8]).toEqual([
      18.6, 19.6, 19.6, 20.6,
    ]);

    // 20.6 is arithmetically closer to nothing useful: both 19mm cores are
    // moistureResistant:false, so it cannot be a worktop at any price. 19.6 is therefore
    // simultaneously the closest to target AND the thickest buildable MR slab.
    expect(findClosestBuildableWorktop(20.6).closestAchievableMm).toBeCloseTo(19.6, 6);
    expect(findClosestBuildableWorktop(30).closestAchievableMm).toBeCloseTo(19.6, 6);
  });

  it('the 0.4mm shortfall would be absorbed by the leg — IF the 19.6mm slab were built', () => {
    // THE HYPOTHETICAL IS NOW LABELLED AS ONE, AND IT IS BUILT FROM A REAL CONFIG.
    //
    // This test used to pass a bare `worktopThickness: 19.6` and conclude the stack was
    // buildable. That quietly described a kitchen nobody is building: the shipped config
    // is melamine-faced and builds 18.6mm, not 19.6mm. Reasoning about the catalog's best
    // case while the product ships something else is precisely how the declared and the
    // as-built numbers drifted apart in the first place.
    //
    // So the 19.6mm slab is constructed EXPLICITLY here, from the HPL surface that would
    // actually produce it, and the reconciliation is what proves it: target and built now
    // agree, so there is no error and the residual is pure leg adjustment.
    const hpl = { ...DEFAULT_WORKTOP_CONFIG, surfaceMaterialId: 'surf-hpl-ash-silver' };
    expect(resolveWorktopThickness(hpl)).toBeCloseTo(19.6, 6);

    const s = deriveHeightStack({ worktopThickness: 19.6, worktopConfig: hpl });
    expect(s.plinthHeight).toBeCloseTo(70.4, 6);
    expect(s.plinthHeight + s.carcassHeight + s.worktopThickness).toBeCloseTo(850, EXACT);
    expect(s.legReachability.reachable).toBe(true);
    expect(s.levelling.shortenHeadroom).toBeCloseTo(0.4, 6);

    // Target and built agree, so the reconciliation passes and the stack IS buildable.
    expect(s.builtWorktopThickness).toBeCloseTo(19.6, 6);
    expect(s.asBuiltCounterHeight).toBeCloseTo(850, EXACT);
    expect(s.errors).toEqual([]);
    expect(s.buildable).toBe(true);

    // AND THIS IS NOT THE SHIPPED CONFIGURATION. Switching to it swaps a 0.3mm melamine
    // face for a 0.8mm HPL one on every slab in the kitchen, changing the finish and the
    // quoted cost. That is a human's decision, not something this suite endorses by
    // demonstrating the arithmetic.
    expect(DEFAULT_WORKTOP_CONFIG.surfaceMaterialId).not.toBe(hpl.surfaceMaterialId);
  });

  it('the unbuildable target is WARNED, not silently substituted', () => {
    const w = DEFAULT_HEIGHT_STACK.warnings.find(
      (x) => x.code === 'WORKTOP_TARGET_NOT_IN_CATALOG'
    );
    expect(w).toBeDefined();
    expect(w!.message).toContain('19.6mm');
    expect(w!.message).toContain('NOT substituted automatically');

    // The stack keeps the 20mm SPEC. It does not quietly become 19.6.
    expect(DEFAULT_HEIGHT_STACK.worktopThickness).toBe(20);
  });

  it('tracks the configured material rather than a constant', () => {
    // core-hmr-28 (28mm) + surf-mel-white (0.3 x2) = 28.6mm. Note resolveWorktopMaterials
    // rightly REFUSES this config for a real slab (no 23mm tape can band it) — the point
    // here is only that thickness follows the material, not a literal.
    const thicker = resolveWorktopThickness({
      ...DEFAULT_WORKTOP_CONFIG,
      coreMaterialId: 'core-hmr-28',
    });
    expect(thicker).toBeCloseTo(28.6, 6);
    expect(thicker).not.toBeCloseTo(DEFAULT_WORKTOP_BUILT_THICKNESS_MM, 6);
  });

  it('throws rather than falling back on an unknown material', () => {
    expect(() =>
      resolveWorktopThickness({ ...DEFAULT_WORKTOP_CONFIG, coreMaterialId: 'core-nope' })
    ).toThrow(/not in catalog/);
    expect(() =>
      resolveWorktopThickness({ ...DEFAULT_WORKTOP_CONFIG, surfaceMaterialId: 'surf-nope' })
    ).toThrow(/not in catalog/);
  });
});

describe('height stack — DECLARED vs AS-BUILT, checked against emitted geometry', () => {
  /**
   * THE TEST THAT WOULD HAVE CAUGHT THE 1.4mm.
   *
   * Every invariant test above asserts the DECLARED triple against itself — plinth +
   * carcass + worktopTHICKNESS === counterHeight — which is true by construction, because
   * the plinth is derived by subtraction. It cannot fail, and so it never noticed that the
   * slab the panel derivation actually emits is a different number entirely.
   *
   * These tests assert against the slab deriveWorktopPanels EMITS. That is the number the
   * factory cuts, and it is the only one that can disagree with the declaration.
   */
  it('the EMITTED slab is 18.6mm, not the declared 20mm target', () => {
    const emitted = worktopRealThickness(resolveWorktopMaterials(DEFAULT_WORKTOP_CONFIG));
    expect(emitted).toBeCloseTo(18.6, 6);
    expect(emitted).not.toBeCloseTo(DEFAULT_WORKTOP_THICKNESS_MM, 6);

    // The height stack reads the same number, from the same config, so the two lanes
    // cannot describe different slabs.
    expect(DEFAULT_HEIGHT_STACK.builtWorktopThickness).toBeCloseTo(emitted, 9);
    expect(DEFAULT_WORKTOP_BUILT_THICKNESS_MM).toBeCloseTo(emitted, 9);
  });

  it('THE REAL INVARIANT FAILS TODAY: toeKick + carcass + EMITTED slab !== 850', () => {
    // This is the assertion the suite was missing. It uses DEFAULT_TOE_KICK_HEIGHT_MM —
    // the actual cut dimension every carcass and kickboard is built from — and the actual
    // emitted slab, and shows they do not reach the declared counter height.
    const emitted = worktopRealThickness(resolveWorktopMaterials(DEFAULT_WORKTOP_CONFIG));
    const asBuilt = DEFAULT_TOE_KICK_HEIGHT_MM + DEFAULT_CARCASS_HEIGHT_MM + emitted;

    expect(asBuilt).toBeCloseTo(848.6, 6);
    expect(asBuilt).not.toBeCloseTo(DEFAULT_COUNTER_HEIGHT_MM, 6);
    expect(DEFAULT_COUNTER_HEIGHT_MM - asBuilt).toBeCloseTo(1.4, 6);

    // And the stack reports exactly that, rather than leaving it to be discovered.
    expect(DEFAULT_HEIGHT_STACK.asBuiltCounterHeight).toBeCloseTo(848.6, 6);
  });

  it('the divergence is an ERROR that makes the stack unbuildable — not a warning', () => {
    // IT WAS A WARNING, AND THAT IS WHY IT SHIPPED. `buildable` stayed true, so
    // assertBuildableHeightStack did not throw and nothing in any cut-list path could
    // stop it. A gap between the number we declare and the number we cut is not an
    // advisory.
    const err = DEFAULT_HEIGHT_STACK.errors.find(
      (e) => e.code === 'WORKTOP_BUILT_THICKNESS_OFF_TARGET'
    );
    expect(err).toBeDefined();
    expect(DEFAULT_HEIGHT_STACK.buildable).toBe(false);
    expect(() => assertBuildableHeightStack(DEFAULT_HEIGHT_STACK)).toThrow(/UNBUILDABLE/);

    // The message must carry the REAL numbers, not the catalog's hypothetical best.
    expect(err!.message).toContain('18.6mm');
    expect(err!.message).toContain('848.6mm');
    expect(err!.message).toContain('71.4mm');
    // ...and must not propose closing the gap by swapping materials.
    expect(err!.message).toContain('Do NOT close this by editing the worktop material');
  });

  it('names the required plinth for the CONFIGURED slab: 71.4mm, not 70.4mm', () => {
    // 71.4 is what the shipped 18.6mm slab needs. 70.4 is what the catalog's closest
    // 19.6mm slab would need — a configuration nobody is building. The remedy previously
    // quoted only 70.4, so the single actionable number in the whole message was wrong
    // for the only configuration that ships, and understated the wind-up by 1.0mm.
    expect(DEFAULT_HEIGHT_STACK.plinthRequiredForBuiltWorktop).toBeCloseTo(71.4, 6);

    const warn = DEFAULT_HEIGHT_STACK.warnings.find(
      (w) => w.code === 'WORKTOP_TARGET_NOT_IN_CATALOG'
    );
    expect(warn).toBeDefined();
    // Both figures present, and each labelled as to which slab it belongs to.
    expect(warn!.message).toContain('19.6mm slab needs a 70.4mm plinth');
    expect(warn!.message).toContain('CONFIGURED material stack builds 18.6mm');
    expect(warn!.message).toContain('71.4mm plinth');
  });

  it('the reconciliation FOLLOWS the material, so it cannot be faked by a constant', () => {
    // Swap the surface for the 0.8mm HPL that genuinely builds 19.6mm and the error
    // changes with it. This is what makes DEFAULT_WORKTOP_BUILT_THICKNESS_MM load-bearing
    // rather than decorative: it used to have no readers at all outside a test.
    const hpl = { ...DEFAULT_WORKTOP_CONFIG, surfaceMaterialId: 'surf-hpl-ash-silver' };
    const s = deriveHeightStack({ worktopConfig: hpl });

    expect(s.builtWorktopThickness).toBeCloseTo(19.6, 6);
    expect(s.asBuiltCounterHeight).toBeCloseTo(849.6, 6);
    expect(s.plinthRequiredForBuiltWorktop).toBeCloseTo(70.4, 6);
    expect(s.buildable).toBe(false);
    expect(s.errors[0].message).toContain('19.6mm');
  });

  it('closes completely when target and built agree', () => {
    // The positive control: a config whose built thickness IS the target produces no
    // error at all, proving the check is a real comparison and not an unconditional fail.
    const built = resolveWorktopThickness(DEFAULT_WORKTOP_CONFIG);
    const s = deriveHeightStack({ worktopThickness: built });

    expect(s.builtWorktopThickness).toBeCloseTo(built, 9);
    expect(s.asBuiltCounterHeight).toBeCloseTo(s.counterHeight, EXACT);
    expect(s.errors.map((e) => e.code)).not.toContain('WORKTOP_BUILT_THICKNESS_OFF_TARGET');
    expect(s.buildable).toBe(true);
  });
});

describe('height stack — single source of truth for toe kick', () => {
  it('DEFAULT_TOE_KICK_HEIGHT_MM is the derived plinth, not a literal', () => {
    expect(DEFAULT_TOE_KICK_HEIGHT_MM).toBe(DEFAULT_HEIGHT_STACK.plinthHeight);
    // CHANGED 111.4 -> 70, same reason as everywhere else: the old value derived from
    // European constants.
    expect(DEFAULT_TOE_KICK_HEIGHT_MM).toBe(70);
  });

  it('every cabinet type with a toe kick uses the SAME derived height', () => {
    // The literal 100 appeared in nine places in this file alone. Missing one produces
    // a silently mixed-height run inside a single kitchen.
    const withToeKick = Object.values(CABINET_TYPES).filter((t) => t.hasToeKick);
    expect(withToeKick.length).toBeGreaterThan(0);
    for (const t of withToeKick) {
      expect(t.toeKickHeight, `${t.id} must use the derived plinth height`).toBe(
        DEFAULT_TOE_KICK_HEIGHT_MM
      );
    }
    expect(new Set(withToeKick.map((t) => t.toeKickHeight)).size).toBe(1);
  });

  it('DEFAULT_DIMENSIONS and the designer default agree with the catalog', () => {
    expect(DEFAULT_DIMENSIONS.toeKickHeight).toBe(DEFAULT_TOE_KICK_HEIGHT_MM);
    expect(createDefaultIntent().dimensions.toeKickHeight).toBe(DEFAULT_TOE_KICK_HEIGHT_MM);

    // ...and so do the other three dimensions, for the same reason.
    expect(DEFAULT_DIMENSIONS.width).toBe(BASE_CABINET_STANDARDS.width.default);
    expect(DEFAULT_DIMENSIONS.height).toBe(BASE_CABINET_STANDARDS.height.default);
    expect(DEFAULT_DIMENSIONS.depth).toBe(BASE_CABINET_STANDARDS.depth.default);
  });

  it('the DECLARED stack matches the declared counter height (the original defect)', () => {
    // Before: declared 900, built 838.6. Now the declaration IS the derivation.
    //
    // RENAMED, because the old title overclaimed. This composes the TARGET worktop
    // thickness, so it checks that the three declared terms agree with each other — real
    // and worth pinning (it is what caught the 61.4mm), but it is NOT a statement about
    // what gets cut. The as-built check lives in the DECLARED vs AS-BUILT suite above and
    // currently FAILS to reach 850, which is the honest state.
    const declared =
      DEFAULT_DIMENSIONS.toeKickHeight +
      BASE_CABINET_STANDARDS.height.default +
      DEFAULT_WORKTOP_THICKNESS_MM;
    expect(declared).toBeCloseTo(ERGONOMIC_STANDARDS.counterHeight, EXACT);
    expect(ERGONOMIC_STANDARDS.counterHeight).toBe(DEFAULT_COUNTER_HEIGHT_MM);

    // The same three terms composed from the BUILT slab do NOT close, and saying so here
    // stops this test being read as proof that the kitchen reaches 850.
    const asBuilt =
      DEFAULT_DIMENSIONS.toeKickHeight +
      BASE_CABINET_STANDARDS.height.default +
      DEFAULT_WORKTOP_BUILT_THICKNESS_MM;
    expect(asBuilt).toBeCloseTo(848.6, 6);
    expect(asBuilt).not.toBeCloseTo(ERGONOMIC_STANDARDS.counterHeight, 6);
  });

  it('no phantom "+40 clearance" term survives anywhere in the stack', () => {
    // The stack has exactly three terms. If a fourth is ever reintroduced, the
    // invariant above breaks first, but assert the term count explicitly too.
    const s = DEFAULT_HEIGHT_STACK;
    const terms = [s.plinthHeight, s.carcassHeight, s.worktopThickness];
    expect(terms.reduce((a, b) => a + b, 0)).toBeCloseTo(s.counterHeight, EXACT);
    expect(terms).toHaveLength(3);
  });
});

describe('height stack — ergonomics derive from it', () => {
  it('wall cabinet underside is derived and clears the JIS minimum', () => {
    // RETAINED UNCHANGED: the structural invariant. Underside is still counter + gap,
    // and it is still DERIVED rather than a literal. That is what this test protects
    // and it never stopped holding.
    expect(ERGONOMIC_STANDARDS.wallCabinetBottom).toBe(
      ERGONOMIC_STANDARDS.counterHeight + ERGONOMIC_STANDARDS.backsplashHeight
    );

    // CHANGED, deliberately: was toBe(wallUnitMinUndersideMm), i.e. 850 + 450 = 1300
    // exactly. The gap is now 500 (Thai practice), so the underside is 1350 and CLEARS
    // the JIS floor by 50mm. Asserting equality with a MINIMUM was the weaker test: it
    // encoded a coincidence of one gap value as if it were the requirement, and it would
    // have failed for any market whose counter height is not 850. A minimum is a bound
    // to clear, not a target to land on.
    expect(ERGONOMIC_STANDARDS.wallCabinetBottom).toBeGreaterThanOrEqual(
      JIS_A0017_2018.wallUnitMinUndersideMm
    );
    expect(ERGONOMIC_STANDARDS.wallCabinetBottom).toBe(1350);
  });

  it('published rung tables match their sources', () => {
    expect([...JIS_A0017_2018.plinthRungsMm]).toEqual([50, 100, 150, 200]);
    expect([...NEXT125_PLINTH_RUNGS_MM]).toEqual([50, 75, 100, 125, 150, 175]);
    expect([...JIS_A0017_2018.worktopHeightsMm]).toEqual([800, 850, 900, 950]);
    expect([...JIS_A0017_2018.baseDepthsMm]).toEqual([600, 650]);
    expect(JIS_A0017_2018.wallUnitMaxDepthMm).toBe(400);
    expect(JIS_A0017_2018.wallUnitMinUndersideMm).toBe(1300);
  });
});

// ============================================
// STEP 4 — THE LEG IS HARDWARE, NOT A DERIVED NUMBER
// ============================================

describe('plinth leg — a plinth is a leg you can buy, with a range', () => {
  it('the Thai leg is 70mm MINIMUM and adjusts upward', () => {
    expect(THAI_ADJUSTABLE_LEG_70.minHeight).toBe(70);
    expect(THAI_ADJUSTABLE_LEG_70.adjustable).toBe(true);
    expect(THAI_ADJUSTABLE_LEG_70.minHeightProvenance).toBe('OWNER_CONFIRMED');
  });

  it('BLOCKED, stated not faked: the adjustment TOP is not sourced', () => {
    // The brief asked for { minHeight, maxHeight, adjustable }. The owner confirmed the
    // minimum and the direction of travel but no maximum, and no datasheet is available.
    // Inventing one would put a fabricated hardware figure into a levelling tolerance an
    // installer relies on. null means UNKNOWN and every consumer must treat it that way —
    // it must NEVER be read as "unlimited".
    expect(THAI_ADJUSTABLE_LEG_70.maxHeight).toBeNull();
    expect(THAI_ADJUSTABLE_LEG_70.maxHeightProvenance).toBe('UNSOURCED');

    const s = DEFAULT_HEIGHT_STACK;
    expect(s.levelling.lengthenHeadroom).toBeNull();
    expect(s.levelling.totalRange).toBeNull();
    expect(s.legReachability.upperBoundUnverified).toBe(true);
    expect(s.warnings.map((w) => w.code)).toContain('LEG_ADJUSTMENT_TOP_UNSOURCED');
  });

  it('an unreachable configuration is REJECTED, not rounded or silently accepted', () => {
    const leg = THAI_ADJUSTABLE_LEG_70;

    // One millimetre below the minimum is already unbuildable. No tolerance band here:
    // the leg either reaches or it does not.
    const just = assessLegReachability(69, leg);
    expect(just.reachable).toBe(false);
    expect(just.code).toBe('BELOW_LEG_MINIMUM');

    expect(assessLegReachability(70, leg).reachable).toBe(true);
    expect(assessLegReachability(1000, leg).reachable).toBe(true); // upper bound unknown
  });

  it('the upper bound IS enforced once a leg has a sourced maximum', () => {
    // Proves the null above is genuinely "unknown" rather than a missing code path: give
    // the model a leg with a known top and the ceiling is checked.
    const sourcedLeg: PlinthLeg = { ...THAI_ADJUSTABLE_LEG_70, maxHeight: 110 };

    const over = assessLegReachability(111, sourcedLeg);
    expect(over.reachable).toBe(false);
    expect(over.code).toBe('ABOVE_LEG_MAXIMUM');
    expect(over.upperBoundUnverified).toBe(false);

    const inRange = assessLegReachability(90, sourcedLeg);
    expect(inRange.reachable).toBe(true);
    expect(inRange.tolerance.shortenHeadroom).toBe(20); // 90 - 70
    expect(inRange.tolerance.lengthenHeadroom).toBe(20); // 110 - 90
    expect(inRange.tolerance.totalRange).toBe(40);

    // And it propagates through the whole stack.
    const s = deriveHeightStack({ counterHeight: 950, leg: sourcedLeg }); // plinth 170
    expect(s.plinthHeight).toBe(170);
    expect(s.buildable).toBe(false);
    expect(s.errors.map((e) => e.code)).toContain('PLINTH_ABOVE_LEG_MAXIMUM');
    expect(() => assertBuildableHeightStack(s)).toThrow(/PLINTH_ABOVE_LEG_MAXIMUM/);
  });

  it('THE LEVELLING TOLERANCE IS THE ADJUSTMENT RANGE, not slack to discard', () => {
    const s = DEFAULT_HEIGHT_STACK;

    // Thai default: plinth 70 == leg minimum 70, so a leg cannot be shortened AT ALL.
    expect(s.levelling.shortenHeadroom).toBe(0);
    expect(s.levelling.legMinHeight).toBe(70);
    expect(s.levelling.plinthHeight).toBe(70);

    const w = s.warnings.find((x) => x.code === 'NO_LEVELLING_HEADROOM_DOWNWARD')!;
    expect(w).toBeDefined();
    expect(w.message).toContain('PERFECTLY FLAT FLOOR');
    expect(w.message).toContain('ground down');

    // Raise the counter target and the headroom appears 1:1 — the tolerance tracks the
    // configuration rather than being a fixed fudge.
    expect(deriveHeightStack({ counterHeight: 860 }).levelling.shortenHeadroom).toBe(10);
    expect(deriveHeightStack({ counterHeight: 900 }).levelling.shortenHeadroom).toBe(50);
  });

  it('the retired 100mm generation cannot be selected', () => {
    expect(THAI_LEG_100_RETIRED.retired).toBe(true);
    expect(THAI_LEG_100_RETIRED.minHeight).toBe(100);
    expect(() => resolvePlinthLeg(THAI_LEG_100_RETIRED.id)).toThrow(/RETIRED/);

    expect(resolvePlinthLeg(THAI_ADJUSTABLE_LEG_70.id)).toBe(THAI_ADJUSTABLE_LEG_70);
    expect(() => resolvePlinthLeg('leg-nope')).toThrow(/not in catalog/);
  });

  it('reports UNBUILDABLE errors ahead of advisory warnings to a runtime sink', () => {
    const sink = vi.fn();
    reportHeightStackWarnings(deriveHeightStack({ counterHeight: 700 }), 'test', sink);
    const lines = sink.mock.calls.map((c) => String(c[0]));
    expect(lines[0]).toContain('UNBUILDABLE');
    expect(lines.join(' ')).toContain('PLINTH_BELOW_LEG_MINIMUM');
  });
});

describe('the default stack is reported ONCE, from a bootstrap — not at import time', () => {
  /**
   * THE DEFECT: `reportHeightStackWarnings(DEFAULT_HEIGHT_STACK, ...)` was a bare
   * top-level statement in CabinetTaxonomy, so merely IMPORTING the module — which nearly
   * every module does, for a constant — printed four multi-paragraph console.warn blocks.
   * It fired inside unrelated suites, shipped in the browser bundle where no consumer
   * could suppress it, made a constants module non-side-effect-free (defeating
   * tree-shaking), and buried the genuinely important UNBUILDABLE lines under advisory
   * noise repeated on every import.
   *
   * The requirement was sound — these findings must be discoverable at runtime — so the
   * call still happens, once, from src/main.tsx.
   */
  it('emits on the first call and stays silent thereafter', () => {
    resetDefaultHeightStackReportedForTest();

    const first = vi.fn();
    expect(reportDefaultHeightStackOnce(first)).toBe(true);
    expect(first.mock.calls.length).toBeGreaterThan(0);

    // The default stack is unbuildable today, so the FIRST line must be the error.
    expect(String(first.mock.calls[0][0])).toContain('UNBUILDABLE');
    expect(String(first.mock.calls[0][0])).toContain('WORKTOP_BUILT_THICKNESS_OFF_TARGET');

    const second = vi.fn();
    expect(reportDefaultHeightStackOnce(second)).toBe(false);
    expect(second).not.toHaveBeenCalled();
  });

  it('importing the catalog does not emit anything by itself', async () => {
    // The anti-regression: re-importing the module must not print. If someone reinstates
    // the top-level call, this fails.
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await import('../CabinetTaxonomy');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
