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
    expect(s.buildable).toBe(true);

    // ...which means ZERO downward levelling headroom. A flat floor is the lower bound.
    expect(s.levelling.shortenHeadroom).toBe(0);
    expect(s.warnings.map((w) => w.code)).toContain('NO_LEVELLING_HEADROOM_DOWNWARD');
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
    expect(th.buildable).toBe(true);
    expect(eu.buildable).toBe(true);

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
    const th = deriveHeightStack({ counterHeight: 850, carcassHeight: 720, worktopThickness: 30 });
    expect(th.plinthHeight).toBeCloseTo(100, EXACT);
    expect(th.onPublishedRung).toBe(true);
    expect(th.matchedRungStandards).toEqual(['JIS A0017:2018', 'next125']);

    const eu = deriveHeightStack({ counterHeight: 900, carcassHeight: 720, worktopThickness: 30 });
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

  it('the 0.4mm shortfall is absorbed by the leg, which is what the leg is FOR', () => {
    // Build the real 19.6mm slab under the Thai target and the stack still reaches 850 —
    // the legs simply wind up 0.4mm, well inside the adjustment range.
    const s = deriveHeightStack({ worktopThickness: 19.6 });
    expect(s.plinthHeight).toBeCloseTo(70.4, 6);
    expect(s.plinthHeight + s.carcassHeight + s.worktopThickness).toBeCloseTo(850, EXACT);
    expect(s.legReachability.reachable).toBe(true);
    expect(s.buildable).toBe(true);
    expect(s.levelling.shortenHeadroom).toBeCloseTo(0.4, 6);
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

  it('the built stack matches the declared counter height (the original defect)', () => {
    // Before: declared 900, built 838.6. Now the declaration IS the derivation.
    const built =
      DEFAULT_DIMENSIONS.toeKickHeight +
      BASE_CABINET_STANDARDS.height.default +
      DEFAULT_WORKTOP_THICKNESS_MM;
    expect(built).toBeCloseTo(ERGONOMIC_STANDARDS.counterHeight, EXACT);
    expect(ERGONOMIC_STANDARDS.counterHeight).toBe(DEFAULT_COUNTER_HEIGHT_MM);
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
  it('wall cabinet underside is derived and lands on the JIS minimum', () => {
    expect(ERGONOMIC_STANDARDS.wallCabinetBottom).toBe(
      ERGONOMIC_STANDARDS.counterHeight + ERGONOMIC_STANDARDS.backsplashHeight
    );
    expect(ERGONOMIC_STANDARDS.wallCabinetBottom).toBe(JIS_A0017_2018.wallUnitMinUndersideMm);
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
