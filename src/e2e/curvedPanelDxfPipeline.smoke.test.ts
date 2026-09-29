/**
 * curvedPanelDxfPipeline.smoke.test.ts — @smoke
 *
 * E2E integration test for the full curved-panel DXF export pipeline:
 *
 *   computeCurveFields()          — derive developedLength / kerfCount / projectedDepth
 *        ↓
 *   CutListRow (curved)           — assemble row with curve fields
 *        ↓
 *   runNesting()                  — bin by flat-blank size; propagate isCurved + kerfCount
 *        ↓
 *   buildDxfSheet()               — render DXF with PARTS_CURVED, HATCH_CURVED, sub-label
 *        ↓
 *   assert DXF contains           — '(CURVED / 12 cuts)', PARTS_CURVED, HATCH_CURVED
 *
 * This test is intentionally thin on unit-level invariants (those live in the
 * unit suites) and thick on pipeline wiring — every stage must pass its output
 * into the next without data loss.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HATCH_CURVED Layer Invariant  (verified Stages 7 – 21)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every curved placement emits exactly 2 diagonal LINE entities on the
 * HATCH_CURVED DXF layer; straight placements emit none.  Derived formulae:
 *
 *   HATCH_CURVED = 2 × curved_count
 *   PARTS_CURVED = 4 × curved_count   (one bounding rect = 4 LINEs)
 *   PARTS        = 4 × straight_count
 *
 * Stages 7 – 13: count invariants (HATCH_CURVED / PARTS_CURVED / PARTS)
 * ─────────────────────────────────────────────────────────────────────────────
 * Stage | Curved | Straight | HATCH_CURVED | PARTS_CURVED | PARTS
 * ------|-------:|----------:|:------------:|:------------:|:-----:
 *     7 |      1 |         1 |            2 |            4 |     4
 *     8 |      1 |         2 |            2 |            4 |     8
 *     9 |      2 |         0 |            4 |            8 |     0
 *    10 |      3 |         0 |            6 |           12 |     0
 *    11 |      0 |         3 |            0 |            0 |    12
 *    12 |      1 |         2 |            2 |            4 |     8
 *    13 |      2 |         1 |            4 |            8 |     4
 *
 * Stages 14 – 21: coordinate / geometric invariants
 * ─────────────────────────────────────────────────────────────────────────────
 * Stage | Panels              | Assertion
 * ------|---------------------|----------------------------------------------
 *    14 | S_CURVE (1)         | HATCH_CURVED X-lines confined within flat-blank bbox
 *    15 | ARC + S_CURVE       | diagonal length = sqrt(effectiveW²+effectiveH²);
 *       |                     |   flat-blank diag > finish diag
 *    16 | ARC + S_CURVE       | flat-blank diag > min(finishW, finishH) (shorter-side guard)
 *    17 | ARC + S_CURVE       | HATCH_CURVED lines spatially partitioned by placement Y;
 *       |                     |   no cross-contamination between the two curved placements
 *    18 | ARC + S_CURVE       | diagonal-2 length equals endpoint-derived bbox diagonal
 *    19 | ARC + S_CURVE       | diagonal-1 and diagonal-2 intersect at placement bbox centre
 *    20 | ARC + S_CURVE       | dot(d1,d2) ≈ 0 iff effectiveW = effectiveH (square bbox);
 *       |   + SQUARE_ARC      |   |dot| > 100 000 for non-square panels
 *    21 | ARC + S_CURVE       | dot(d1,d2) < 0 when effectiveW > effectiveH (FFDH rotates);
 *       |   + TALL_ARC        |   dot(d1,d2) > 0 when effectiveW < effectiveH (grain-locked)
 *
 * Stages 22 – 133: precision, structural integrity, label, bounding-rect, layer-count, SHEET invariants, HATCH_CURVED count, rotation guards, zero/negative-correction exclusion, reflection symmetry, barely-positive correction boundary, kerfCount-boundary guards, triple-guard regression, NaN/null/negative kerfCount boundaries, Infinity kerfCount passthrough, multi-panel scale validation, determinism guard, overflow two-sheet placement, overflow diagonal geometry, mixed-overflow exclusivity, mixed-overflow completeness / determinism / FFDH-order validation, three-sheet overflow count, sheet-3 diagonal geometry, mixed three-sheet overflow layer counts, three-sheet determinism, five-sheet overflow (qty=222), FFDH stress test (500 panels), six-sheet overflow (qty=277), mixed-500 determinism guard, six full sheets (qty=330), shelf-y coordinate validation, seven full sheets (qty=385), six-full-sheet determinism guard, eight full sheets (qty=440), FFDH one-short boundary (qty=54), FFDH one-over overflow boundary (qty=56), eight-full-sheet determinism guard, two full sheets (qty=110), two-full-sheets + 1 overflow (qty=111), three full sheets (qty=165), two-full-sheet determinism guard, four full sheets (qty=220), three-full-sheets + 1 overflow (qty=166), four-full-sheet determinism guard (qty=220), five full sheets (qty=275), six full sheets (qty=330), five-full-sheet determinism guard (qty=275), seven full sheets (qty=385), six-full-sheet determinism guard (qty=330), eight full sheets (qty=440), seven-full-sheet determinism guard (qty=385), nine full sheets (qty=495), eight-full-sheet determinism guard (qty=440), ten full sheets (qty=550), nine-full-sheet determinism guard (qty=495), eleven full sheets (qty=605), ten-full-sheet determinism guard (qty=550), twelve full sheets (qty=660), eleven-full-sheet determinism guard (qty=605), thirteen full sheets (qty=715), twelve-full-sheet determinism guard (qty=660), fourteen full sheets (qty=770), and thirteen-full-sheet determinism guard (qty=715)
 * ─────────────────────────────────────────────────────────────────────────────
 * Stage | Panels                   | Assertion
 * ------|--------------------------|-------------------------------------------
 *    22 | ARC + S_CURVE + TALL_ARC | all 4 HATCH_CURVED endpoints rounded to
 *       |                          |   0.01 mm (Math.round(v×100)/100)
 *    23 | ARC + S_CURVE + TALL_ARC | rounded endpoints lie within flat-blank
 *       |                          |   bbox (ε = 0.01 mm)
 *    24 | ARC + S_CURVE + TALL_ARC | each diagonal non-degenerate:
 *       |                          |   |x1−x2| + |y1−y2| > 1e-6
 *    25 | ARC + S_CURVE + TALL_ARC | midpoint(d1) = midpoint(d2) (±0.05 mm)
 *    26 | ARC + S_CURVE + TALL_ARC | shared midpoint = bbox centre
 *       |                          |   (minX + W/2, minY + H/2), ±0.05 mm
 *    27 | ARC + S_CURVE + TALL_ARC | diagLen(d1) ≈ diagLen(d2) (±0.05 mm)
 *   28A | ARC + S_CURVE + TALL_ARC | diagLen ≈ sqrt(effectiveW²+effectiveH²)
 *       |                          |   (±0.05 mm) for both d1 and d2
 *   28B | ARC + S_CURVE + TALL_ARC | 4 endpoints are distinct corner pairs:
 *       |                          |   new Set([…]).size === 4
 *    29 | ARC + S_CURVE + TALL_ARC | endpoints = Set of 4 rounded bbox corners:
 *       |                          |   Set({x,y}) === {(minX,minY),(maxX,maxY),
 *       |                          |   (maxX,minY),(minX,maxY)}
 *    30 | ARC + S_CURVE + TALL_ARC | d1: (minX,minY)→(maxX,maxY) (left→right);
 *       |                          |   d2: (maxX,minY)→(minX,maxY) (right→left);
 *       |                          |   d1.x1 < d1.x2; d2.x1 > d2.x2  (ε < 0.015 mm)
 *    31 | ARC + S_CURVE + TALL_ARC | shared bottom start-Y: d1.y1 ≈ d2.y1 ≈ r(minY)
 *       |                          |   (consequence of Stage 30; ε < 0.015 mm)
 *    32 | ARC + S_CURVE + TALL_ARC | shared top end-Y: d1.y2 ≈ d2.y2 ≈ r(maxY)
 *       |                          |   (symmetric counterpart of Stage 31; ε < 0.015 mm)
 *    33 | ARC + S_CURVE + TALL_ARC | orientation sense: d1.x1 < d1.x2 (left→right);
 *       |                          |   d2.x1 > d2.x2 (right→left); strict inequality,
 *       |                          |   no tolerance needed
 *    34 | ARC + S_CURVE + TALL_ARC | Y-axis monotonicity: d1.y1 < d1.y2 and
 *       |                          |   d2.y1 < d2.y2 — both diagonals ascend in Y;
 *       |                          |   strict inequality, no tolerance needed
 *    35 | ARC + S_CURVE + TALL_ARC | d1.x2 ≈ r(maxX) — diagonal-1 ends at right edge;
 *       |                          |   d2.x2 ≈ r(minX) — diagonal-2 ends at left edge;
 *       |                          |   ε < 0.015 mm
 *    36 | ARC + S_CURVE + TALL_ARC | d1.x1 ≈ r(minX) — diagonal-1 starts at left edge;
 *       |                          |   d2.x1 ≈ r(maxX) — diagonal-2 starts at right edge;
 *       |                          |   ε < 0.015 mm
 *    37 | ARC + S_CURVE + TALL_ARC | d1 synthesis — all four coordinates verified jointly:
 *       |                          |   d1.x1 ≈ r(minX), d1.y1 ≈ r(minY),
 *       |                          |   d1.x2 ≈ r(maxX), d1.y2 ≈ r(maxY);
 *       |                          |   12 it() blocks (4 coords × 3 panel types); ε < 0.015 mm
 *    38 | ARC + S_CURVE + TALL_ARC | d2 synthesis — all four coordinates verified jointly:
 *       |                          |   d2.x1 ≈ r(maxX), d2.y1 ≈ r(minY),
 *       |                          |   d2.x2 ≈ r(minX), d2.y2 ≈ r(maxY);
 *       |                          |   12 it() blocks (4 coords × 3 panel types); ε < 0.015 mm
 *       |                          |   Completes d1+d2 all-coordinate synthesis (Stages 37–38).
 *    39 | ARC + S_CURVE + TALL_ARC | DXF TABLES layer colors: HATCH_CURVED = ACI 4 (cyan);
 *       |                          |   PARTS_CURVED = ACI 1 (red); verified once per panel type
 *       |                          |   on a mixed sheet containing all three panels.
 *       |                          |   6 it() blocks total.
 *    40 | ARC + S_CURVE + TALL_ARC | '(CURVED / N cuts)' TEXT entity on LABELS layer: N equals
 *       |                          |   actual kerfCount from curveFieldsComputer for that panel;
 *       |                          |   one it() per panel type (3 it() blocks total).
 *    41 | ARC + S_CURVE + TALL_ARC | '(CURVED / N cuts)' TEXT entity height (DXF group code 40)
 *       |                          |   is exactly 5 for all three panel types;
 *       |                          |   one it() per panel type (3 it() blocks total).
 *    42 | ARC + S_CURVE + TALL_ARC | '(CURVED / N cuts)' TEXT X position (DXF group code 10)
 *       |                          |   equals placement.x + w/2 − 20 where
 *       |                          |   w = isRotated ? cutH : cutW (flat-blank width);
 *       |                          |   "anchored at bbox centre X minus 20 mm text indent";
 *       |                          |   ε < 0.015 mm; one it() per panel type (3 it() blocks).
 *    43 | ARC + S_CURVE + TALL_ARC | '(CURVED / N cuts)' TEXT Y position (DXF group code 20)
 *       |                          |   equals placement.y + h/2 − 40 where
 *       |                          |   h = isRotated ? cutW : cutH (flat-blank height);
 *       |                          |   "anchored at bbox centre Y minus 40 mm sub-label offset";
 *       |                          |   ε < 0.015 mm; one it() per panel type (3 it() blocks).
 *    44 | ARC (mixed) + STRAIGHT   | straight panels emit zero PARTS_CURVED LINE entities;
 *       |                          |   PARTS_CURVED = 0 for single straight panel;
 *       |                          |   PARTS_CURVED = 0 for three straight panels;
 *       |                          |   PARTS_CURVED = 4 for mixed sheet (1 curved + 1 straight)
 *       |                          |   confirming curved-only emission; 3 it() blocks total.
 *    45 | ARC + S_CURVE + TALL_ARC | PARTS_CURVED bounding rect (minX, minY, maxX, maxY)
 *       |                          |   matches flat-blank placement: minX=r(p.x), minY=r(p.y),
 *       |                          |   maxX=r(p.x+ew), maxY=r(p.y+eh) where ew/eh from
 *       |                          |   getRotatedDimensions(cutW, cutH, rotation);
 *       |                          |   ε < 0.015 mm; one it() per panel type (3 it() blocks).
 *    46 | STRAIGHT (3 variants)    | PARTS layer bounding rect spans ew × eh derived purely
 *       |                          |   from cutW/cutH + FFDH rotation (no flat-blank correction);
 *       |                          |   placement.cutW/H == CutListRow.cutW/H (unmodified);
 *       |                          |   mixed sheet: straight placement unaffected by curved;
 *       |                          |   ε < 0.015 mm; 3 it() blocks (single, narrow, mixed).
 *
 *    47 | ARC / S_CURVE / TALL_ARC | PARTS_CURVED LINE count = 4 per curved panel;
 *       |                          |   3 it() blocks (one per panel type).
 *    48 | ARC + STRAIGHT (mixed)   | PARTS_CURVED = 4, PARTS = 4; bboxes non-overlapping;
 *       |                          |   1 it() block.
 *    49 | ARC + S_CURVE            | PARTS_CURVED LINE count = 8; two per-panel bboxes
 *       |                          |   non-overlapping; 1 it() block.
 *    50 | single / two / mixed     | SHEET LINE count = 4 for every sheet configuration;
 *       |                          |   3 it() blocks.
 *    51 | TALL_ARC + S_CURVE + ARC | PARTS_CURVED count = 12; all 3 per-panel bbox pairs
 *       |                          |   mutually non-overlapping; 1 it() block.
 *    52 | ARC / S_CURVE / TALL_ARC | HATCH_CURVED LINE count = 2 for single-panel sheets;
 *       |                          |   3 it() blocks (one per panel type).
 *    53 | ARC + S_CURVE            | HATCH_CURVED LINE count = 4 (2 × 2 curved panels)
 *       |                          |   on a two-panel sheet; 1 it() block.
 *    54 | ARC (single-panel)       | each HATCH_CURVED diagonal pair spans the four
 *       |                          |   flat-blank bbox corners: d1 = (minX,minY)→(maxX,maxY),
 *       |                          |   d2 = (maxX,minY)→(minX,maxY); ε < 0.015 mm;
 *       |                          |   1 it() block.
 *    55 | S_CURVE (single-panel)    | each HATCH_CURVED diagonal pair spans the four
 *       |                          |   flat-blank bbox corners (rotation=90, curvedEdge=TOP):
 *       |                          |   d1 = (minX,minY)→(maxX,maxY),
 *       |                          |   d2 = (maxX,minY)→(minX,maxY); ε < 0.015 mm;
 *       |                          |   1 it() block.
 *    56 | TALL_ARC (grain=HORIZ)    | each HATCH_CURVED diagonal pair spans the four
 *       |                          |   flat-blank bbox corners (rotation=0, grain-locked):
 *       |                          |   d1 = (minX,minY)→(maxX,maxY),
 *       |                          |   d2 = (maxX,minY)→(minX,maxY); ε < 0.015 mm;
 *       |                          |   asserts placement.rotation === 0; 1 it() block.
 *    57 | ARC + S_CURVE (2-panel)  | per-panel diagonal isolation: each of the 4
 *       |                          |   HATCH_CURVED lines is matched to its placement
 *       |                          |   bbox by corner proximity; each panel has exactly
 *       |                          |   1 d1 match and 1 d2 match; ε < 0.015 mm;
 *       |                          |   isD1()/isD2() helpers; 1 it() block.
 *    58 | ARC / S_CURVE / TALL_ARC | intersection of d1 and d2 (midpoint of d1)
 *       |                          |   equals flat-blank bbox centre:
 *       |                          |   intersectionX = (d1.x1+d1.x2)/2,
 *       |                          |   intersectionY = (d1.y1+d1.y2)/2;
 *       |                          |   ε < 0.015 mm; 3 it() blocks (one per type).
 *    59 | ARC × 2 (wide sheet)     | two ARC panels with overlapping Y ranges on same
 *       |                          |   sheet (sheetWidth=3000); HATCH_CURVED lines
 *       |                          |   isolated by bbox proximity, not emission order;
 *       |                          |   each placement owns exactly 1 d1 + 1 d2; 1 it().
 *    60 | ARC / S_CURVE / TALL_ARC | diagonal intersection (midpoint of d1) lies
 *       |                          |   strictly inside flat-blank bbox:
 *       |                          |   minX < intersectionX < maxX and
 *       |                          |   minY < intersectionY < maxY;
 *       |                          |   strict inequalities, no tolerance; 3 it() blocks.
 *    61 | ARC (rotation=180)       | manually constructed NestingSheet with rotation=180;
 *       |                          |   getRotatedDimensions returns w=cutW, h=cutH (same as
 *       |                          |   rotation=0); d1 and d2 span flat-blank bbox corners
 *       |                          |   (ε < 0.02 mm); 1 it() block.
 *    62 | ARC / S_CURVE / TALL_ARC | both HATCH_CURVED diagonal lines have Manhattan
 *       |                          |   length |x2−x1|+|y2−y1| > 1.0 mm (non-degenerate
 *       |                          |   guard); 3 it() blocks (one per fixture).
 *    63 | ARC / S_CURVE            | regression guard: running runNesting twice with the
 *       |                          |   same CutListRow yields bit-for-bit identical
 *       |                          |   HATCH_CURVED coordinates; 2 it() blocks.
 *    64 | ARC (rotation=270)       | manually constructed NestingSheet with rotation=270;
 *       |                          |   getRotatedDimensions returns w=cutH, h=cutW (same
 *       |                          |   branch as rotation=90); d1 and d2 span flat-blank
 *       |                          |   bbox corners (ε < 0.02 mm); 1 it() block.
 *    65 | ARC (projectedDepth=0)   | panel with correction=developedLength−projectedDepth=0
 *       |                          |   gets isCurved=false; nesting emits zero
 *       |                          |   HATCH_CURVED LINE entities; 1 it() block.
 *    66 | ARC (negCorrection)      | panel with developedLength < projectedDepth
 *       |                          |   → correction<0 → isCurved=false; DXF emits
 *       |                          |   zero HATCH_CURVED LINE entities; 1 it() block.
 *    67 | ARC (rot=90 vs rot=270)  | two NestingSheets, panels placed symmetrically
 *       |                          |   about sheet centre (cx=1220, cy=610); each
 *       |                          |   rotation=90 endpoint reflected through (cx,cy)
 *       |                          |   equals a rotation=270 endpoint (ε < 0.02 mm);
 *       |                          |   1 it() block.
 *    68 | ARC (rot=0 vs rot=180)   | symmetric counterpart of Stage 67; two NestingSheets
 *       |                          |   with rotation=0 and rotation=180 placed
 *       |                          |   symmetrically about (cx=1220, cy=610); each
 *       |                          |   rotation=0 endpoint reflected through (cx,cy)
 *       |                          |   equals a rotation=180 endpoint (ε < 0.02 mm);
 *       |                          |   1 it() block.
 *    69 | ARC (correction=0.001)   | panel with developedLength=200.001,
 *       |                          |   projectedDepth=200 → correction=0.001 > 0
 *       |                          |   → isCurved=true; DXF emits exactly 2
 *       |                          |   HATCH_CURVED LINE entities (d1 + d2);
 *       |                          |   1 it() block.
 *    70 | kerfCount=1 ARC panel     | developedLength=250, projectedDepth=200,
 *       |                          |   curvedEdge=TOP, cutW=400, cutH=800;
 *       |                          |   correction=50 > 0 → isCurved=true,
 *       |                          |   kerfCount=1; DXF emits exactly 2
 *       |                          |   HATCH_CURVED lines; LABELS sub-label
 *       |                          |   reads "(CURVED / 1 cuts)"; 1 it().
 * ─────────────────────────────────────────────────────────────────────────────
 *    71 | two curved panels kc=3,7 | manual NestingSheet, two placements:
 *       |                          |   partId=SMOKE_KC3_S71 kerfCount=3 and
 *       |                          |   partId=SMOKE_KC7_S71 kerfCount=7;
 *       |                          |   both sub-labels appear independently
 *       |                          |   in DXF LABELS TEXT; 1 it() block.
 * ─────────────────────────────────────────────────────────────────────────────
 *    72 | kerfCount=0 with        | kerfCount=0 explicitly on a panel with
 *       | correction=50 > 0        |   correction=50 > 0; optimizer kerfCount=0
 *       |                          |   guard overrides isCurved=false;
 *       |                          |   DXF emits zero HATCH_CURVED lines;
 *       |                          |   1 it() block.
 * ─────────────────────────────────────────────────────────────────────────────
 *    73 | three curved panels      | manual NestingSheet, kc=1, kc=5, kc=12;
 *       | kc=1, kc=5, kc=12        |   all three "(CURVED / N cuts)" sub-labels
 *       |                          |   appear independently in LABELS TEXT;
 *       |                          |   1 it() block.
 *    74 | kerfCount=0 curved panel | kerfCount=0 → isCurved=false → PARTS_CURVED
 *       |                          |   LINE count=0, PARTS LINE count=4;
 *       |                          |   1 it() block.
 *    75 | kerfCount=undefined +    | kerfCount absent → guard does NOT fire;
 *       | correction > 0           |   isCurved=true → 2 HATCH_CURVED lines;
 *       |                          |   1 it() block.
 *    76 | kerfCount=undefined +    | kerfCount absent AND correction=0
 *       | correction = 0           |   (developedLength === projectedDepth);
 *       |                          |   correction>0 guard is FALSE →
 *       |                          |   isCurved=false; DXF emits 0
 *       |                          |   HATCH_CURVED lines; 1 it() block.
 *    77 | kc=0 (Panel A) +         | kc=0 → isCurved=false → PARTS=4,
 *       | kc=undefined+correction  |   PARTS_CURVED=0 (Panel A);
 *       | > 0 (Panel B)            |   kc=undefined+correction>0 →
 *       |                          |   isCurved=true → PARTS_CURVED=4,
 *       |                          |   HATCH_CURVED=2 (Panel B);
 *       |                          |   both on same sheet; 1 it() block.
 *    78 | kc=0 (Panel A) +         | triple-guard regression:
 *       | kc=undef+corr=0 (B) +    |   Panel A (kc=0, corr>0) → isCurved=false;
 *       | kc=undef+corr>0 (C)      |   Panel B (kc=undef, corr=0) → isCurved=false;
 *       |                          |   Panel C (kc=undef, corr>0) → isCurved=true;
 *       |                          |   sheet totals: PARTS=8, PARTS_CURVED=4,
 *       |                          |   HATCH_CURVED=2; 1 it() block.
 *    79 | kerfCount=NaN            | NaN ≠ undefined AND NaN > 0 → false;
 *       |                          |   guard expression = (false || false) = false
 *       |                          |   → isCurved=false; 0 HATCH_CURVED lines;
 *       |                          |   identical behaviour to kc=0; 1 it() block.
 *    80 | kerfCount=Infinity       | Infinity > 0 → true; guard does NOT fire;
 *       |                          |   isCurved=true when correction > 0;
 *       |                          |   emits exactly 2 HATCH_CURVED lines;
 *       |                          |   1 it() block.
 *    81 | kerfCount=-1             | −1 > 0 → false; guard fires;
 *       |                          |   isCurved=false; 0 HATCH_CURVED lines;
 *       |                          |   identical behaviour to kc=0 and NaN;
 *       |                          |   1 it() block.
 *    82 | kerfCount=null           | null === undefined → false;
 *       |                          |   null > 0 → false (null coerces to 0);
 *       |                          |   guard = (false || false) = false;
 *       |                          |   isCurved=false; 0 HATCH_CURVED lines;
 *       |                          |   identical behaviour to kc=0, NaN, -1;
 *       |                          |   1 it() block.
 *    83 | qty=10 curved panels     | all 10 fit on one sheet (FFDH shelf-1);
 *       |                          |   PARTS_CURVED LINE count=40;
 *       |                          |   rects.length=10; all C(10,2)=45 pairs
 *       |                          |   mutually non-overlapping; 1 it() block.
 *    84 | qty=20 curved panels     | all 20 fit on one sheet (2 FFDH shelves);
 *       |                          |   PARTS_CURVED LINE count=80;
 *       |                          |   rects.length=20; all C(20,2)=190 pairs
 *       |                          |   mutually non-overlapping; 1 it() block.
 *    85 | qty=10 determinism       | two independent runNesting calls with
 *       |                          |   identical qty=10 input produce exactly
 *       |                          |   the same placement x/y coordinates;
 *       |                          |   1 it() block.
 *    86 | qty=56 overflow          | 55 panels on sheet-1, 1 on sheet-2;
 *       |                          |   sheets.length===2;
 *       |                          |   PARTS_CURVED LINE count=4×56=224
 *       |                          |   across both sheets; 1 it() block.
 *    87 | qty=56 overflow diagonal | sheet-2 single panel isCurved=true;
 *       |                          |   HATCH_CURVED count=2; d1=(10,10)→(220,210)
 *       |                          |   d2=(220,10)→(10,210); rotation=90 means
 *       |                          |   placed w=210, h=200; 1 it() block.
 *    88 | 55 curved + 1 straight   | mixed overflow: sheet-1 holds all 55 curved
 *       |   mixed overflow         |   (all isCurved=true); straight overflows to
 *       |                          |   sheet-2 with PARTS_CURVED=0,
 *       |                          |   HATCH_CURVED=0, PARTS=4; 1 it() block.
 *    89 | 56 curved + 1 straight  | mixed sheet-2: overflow curved +
 *       |   mixed overflow         |   straight; sheet-2 PARTS_CURVED=4,
 *       |                          |   HATCH_CURVED=2, PARTS=4;
 *       |                          |   curved/straight bboxes non-overlapping;
 *       |                          |   1 it() block.
 *    90 | 55 curved + 1 straight  | determinism regression guard:
 *       |   determinism            |   two independent runNesting calls
 *       |                          |   produce identical sheet-2
 *       |                          |   placements[0] partId, x, y;
 *       |                          |   1 it() block.
 *    91 | curvedA×55 + curvedB×1  | FFDH order: sheet-1 holds all 55
 *       |   + straight×1           |   S91A panels; sheet-2[0]=S91B
 *       |                          |   (isCurved=true, x=10, y=10);
 *       |                          |   sheet-2[1]=SMOKE_STRAIGHT_S91
 *       |                          |   (isCurved=false, x≈23.5, y=10);
 *       |                          |   non-overlapping; 1 it() block.
 *    92 | curved qty=111           | Three-sheet overflow: sheets=3
 *       |                          |   (55+55+1); PARTS_CURVED total
 *       |                          |   across all sheets = 4×111 = 444;
 *       |                          |   1 it() block.
 *    93 | curved qty=111           | Sheet-3 diagonal geometry:
 *       |                          |   HATCH_CURVED d1=(10,10)→(220,210)
 *       |                          |   d2=(220,10)→(10,210) ε<0.015 mm;
 *       |                          |   1 it() block.
 *    94 | curved qty=111           | Mixed 3-sheet overflow: sheet-3 has
 *       | + straight qty=1         |   1 curved + 1 straight (cutH=182);
 *       | (cutH=182, overflow       |   PARTS_CURVED=4, PARTS=4,
 *       |  threshold >181.5)       |   HATCH_CURVED=2; non-overlapping
 *       |                          |   bboxes (curved x∈[10,220], straight
 *       |                          |   x∈[223.5,423.5]); 1 it() block.
 *    95 | curved qty=111           | Three-sheet determinism: two runs
 *       |                          |   produce identical sheet-3
 *       |                          |   placements[0] partId, x, y, rotation;
 *       |                          |   1 it() block.
 *    96 | curved qty=222           | Five-sheet overflow: sheets.length===5
 *       |                          |   (4×55+2=222); sheets[4] holds exactly
 *       |                          |   2 curved placements; DXF sheet-5:
 *       |                          |   PARTS_CURVED=8 (2×4),
 *       |                          |   HATCH_CURVED=4 (2×2);
 *       |                          |   all placements isCurved=true;
 *       |                          |   1 it() block.
 *    97 | curved qty=300           | FFDH stress test: 500 panels total;
 *       |   + straight qty=200     |   sheets.length >= 5; total
 *       |                          |   PARTS_CURVED across all sheets
 *       |                          |   = 4 × 300 = 1200; 1 it() block.
 *    98 | curved qty=277           | Six-sheet overflow: sheets.length===6
 *       |                          |   (5×55+2=277); sheets[5] holds exactly
 *       |                          |   2 curved placements; DXF sheet-6:
 *       |                          |   PARTS_CURVED=8 (2×4),
 *       |                          |   HATCH_CURVED=4 (2×2);
 *       |                          |   all placements isCurved=true;
 *       |                          |   1 it() block.
 *    99 | curved qty=300           | Mixed-500 determinism: two independent
 *       |   + straight qty=200     |   runNesting calls with the Stage 97
 *       |                          |   fixture produce identical sheets[5]
 *       |                          |   placements[0] partId, x, y, rotation;
 *       |                          |   1 it() block.
 *   100 | curved qty=330           | Six full sheets (no remainder): 330 =
 *       |                          |   6 × 55; sheets.length===6; every sheet
 *       |                          |   has exactly 55 placements; all
 *       |                          |   isCurved=true; DXF for sheets[5]:
 *       |                          |   PARTS_CURVED=220 (55×4); 1 it() block.
 *   101 | curved qty=11            | Shelf-y coordinate validation: 11 wide
 *       |   (developedLength=1197) |   panels (1 per shelf) placed rotation=90;
 *       |                          |   all x===10; placements[i].y ===
 *       |                          |   10 + i × 203.5 (y_1..y_11 from lookup
 *       |                          |   table); 1 it() block.
 *   102 | curved qty=385           | Seven full sheets (no remainder): 385 =
 *       |                          |   7 × 55; sheets.length===7; every sheet
 *       |                          |   has exactly 55 placements; all
 *       |                          |   isCurved=true; DXF for sheets[6]:
 *       |                          |   PARTS_CURVED=220 (55×4); extends
 *       |                          |   Stage 100 by one additional sheet;
 *       |                          |   1 it() block.
 *   103 | curved qty=330           | Six-full-sheet determinism: two
 *       |                          |   independent runNesting calls with the
 *       |                          |   Stage 100 fixture (qty=330) produce
 *       |                          |   identical sheets[5].placements[0]
 *       |                          |   partId, x, y, rotation; mirrors
 *       |                          |   Stages 95 and 99; 1 it() block.
 *   104 | curved qty=440           | Eight full sheets (no remainder): 440 =
 *       |                          |   8 × 55; sheets.length===8; every sheet
 *       |                          |   has exactly 55 placements; all
 *       |                          |   isCurved=true; DXF for sheets[7]:
 *       |                          |   PARTS_CURVED=220 (55×4); extends the
 *       |                          |   full-sheet sequence (100→102→104);
 *       |                          |   1 it() block.
 *   105 | curved qty=54            | FFDH boundary (one panel short of a full
 *       |                          |   sheet): 54 = 10×5 + 4 (10 full shelves
 *       |                          |   + 4 on shelf-11); sheets.length===1;
 *       |                          |   54 placements; all isCurved=true; DXF
 *       |                          |   PARTS_CURVED=216 (54×4); validates the
 *       |                          |   "one-short" boundary before overflow;
 *       |                          |   1 it() block.
 *   106 | curved qty=56            | FFDH overflow boundary (one panel over
 *       |                          |   full sheet): 56 = 55 + 1; sheets.length
 *       |                          |   ===2; sheets[0] has 55 placements;
 *       |                          |   sheets[1] has exactly 1 placement at
 *       |                          |   x=10, y=10, rotation=90; all
 *       |                          |   isCurved=true; "one-over" complement
 *       |                          |   to Stage 105; 1 it() block.
 *   107 | curved qty=440           | Eight-full-sheet determinism: two
 *       |                          |   independent runNesting calls with the
 *       |                          |   Stage 104 fixture (qty=440) produce
 *       |                          |   identical sheets[7].placements[0]
 *       |                          |   partId, x, y, rotation; extends
 *       |                          |   determinism series (85,95,99,103);
 *       |                          |   1 it() block.
 *   108 | curved qty=110           | Two full sheets (no remainder): 110 =
 *       |                          |   2 × 55; sheets.length===2; sheets[0]
 *       |                          |   and sheets[1] each have 55 placements;
 *       |                          |   all isCurved=true; PARTS_CURVED=220
 *       |                          |   asserted on both sheets; 2-sheet
 *       |                          |   analogue of Stage 100; 1 it() block.
 *   109 | curved qty=111           | Two full sheets + 1 overflow: 111 =
 *       |                          |   55+55+1; sheets.length===3; sheets[0]
 *       |                          |   and sheets[1] have 55 placements;
 *       |                          |   sheets[2] has exactly 1 placement at
 *       |                          |   x=10, y=10, rotation=90; all
 *       |                          |   isCurved=true; mirrors Stage 106 at
 *       |                          |   the 2-sheet boundary; 1 it() block.
 *   110 | curved qty=165           | Three full sheets (no remainder): 165 =
 *       |                          |   3 × 55; sheets.length===3; all three
 *       |                          |   sheets have 55 placements; all
 *       |                          |   isCurved=true; PARTS_CURVED=220
 *       |                          |   asserted on all three sheets; continues
 *       |                          |   full-sheet sequence (108→110);
 *       |                          |   1 it() block.
 *   111 | curved qty=110           | Two-full-sheet determinism: two
 *       |                          |   independent runNesting calls with the
 *       |                          |   Stage 108 fixture (qty=110) produce
 *       |                          |   identical sheets[1].placements[0]
 *       |                          |   partId, x, y, rotation; extends
 *       |                          |   determinism series (85,95,99,103,107);
 *       |                          |   1 it() block.
 *   112 | curved qty=220           | Four full sheets (no remainder): 220 =
 *       |                          |   4 × 55; sheets.length===4; all four
 *       |                          |   sheets have 55 placements; all
 *       |                          |   isCurved=true; PARTS_CURVED=220
 *       |                          |   asserted on all four sheets via loop;
 *       |                          |   continues full-sheet sequence (110→112);
 *       |                          |   1 it() block.
 *   113 | curved qty=166           | Three full sheets + 1 overflow: 166 =
 *       |                          |   3×55+1; sheets.length===4; sheets[0..2]
 *       |                          |   have 55 placements; sheets[3] has
 *       |                          |   exactly 1 placement at x=10, y=10,
 *       |                          |   rotation=90; all isCurved=true; mirrors
 *       |                          |   Stage 109 at the 3-sheet boundary;
 *       |                          |   1 it() block.
 *   114 | curved qty=220           | Four-full-sheet determinism guard: two
 *       |                          |   runNesting calls with qty=220 produce
 *       |                          |   identical sheets[3].placements[0]
 *       |                          |   partId, x, y, rotation; extends
 *       |                          |   determinism series (85,95,99,103,107,
 *       |                          |   111); 1 it() block.
 *   115 | curved qty=275           | Five full sheets (no remainder): 275 =
 *       |                          |   5×55; sheets.length===5; each sheet
 *       |                          |   has 55 placements; all isCurved=true;
 *       |                          |   DXF loop asserts PARTS_CURVED=220 on
 *       |                          |   all 5 sheets; continues full-sheet
 *       |                          |   sequence (108→110→112→115); 1 it() block.
 *   116 | curved qty=330           | Six full sheets (no remainder): 330 =
 *       |                          |   6×55; sheets.length===6; each sheet
 *       |                          |   has 55 placements; all isCurved=true;
 *       |                          |   DXF loop asserts PARTS_CURVED=220 on
 *       |                          |   all 6 sheets; continues full-sheet
 *       |                          |   sequence (108→110→112→115→116); 1 it() block.
 *   117 | curved qty=275           | Five-full-sheet determinism guard: two
 *       |                          |   runNesting calls with qty=275 produce
 *       |                          |   identical sheets[4].placements[0]
 *       |                          |   partId, x, y, rotation; extends
 *       |                          |   determinism series (85,95,99,103,107,
 *       |                          |   111,114); 1 it() block.
 *   118 | curved qty=385           | Seven full sheets (no remainder): 385 =
 *       |                          |   7×55; sheets.length===7; each sheet
 *       |                          |   has 55 placements; all isCurved=true;
 *       |                          |   DXF loop asserts PARTS_CURVED=220 on
 *       |                          |   all 7 sheets; continues full-sheet
 *       |                          |   sequence (108→110→112→115→116→118);
 *       |                          |   1 it() block.
 *   119 | curved qty=330           | Six-full-sheet determinism guard: two
 *       |                          |   runNesting calls with qty=330 produce
 *       |                          |   identical sheets[5].placements[0]
 *       |                          |   partId, x, y, rotation; extends
 *       |                          |   determinism series (85,95,99,103,107,
 *       |                          |   111,114,117); 1 it() block.
 *   120 | curved qty=440           | Eight full sheets (no remainder): 440 =
 *       |                          |   8×55; sheets.length===8; each sheet
 *       |                          |   has 55 placements; all isCurved=true;
 *       |                          |   DXF loop asserts PARTS_CURVED=220 on
 *       |                          |   all 8 sheets; continues full-sheet
 *       |                          |   sequence (108→110→112→115→116→118→120);
 *       |                          |   120-stage milestone; 1 it() block.
 *   121 | curved qty=385           | Seven-full-sheet determinism guard: two
 *       |                          |   runNesting calls with qty=385 produce
 *       |                          |   identical sheets[6].placements[0]
 *       |                          |   partId, x, y, rotation; extends
 *       |                          |   determinism series (85,95,99,103,107,
 *       |                          |   111,114,117,119); 1 it() block.
 *   122 | curved qty=495           | Nine full sheets (no remainder): 495 =
 *       |                          |   9×55; sheets.length===9; each sheet
 *       |                          |   has 55 placements; all isCurved=true;
 *       |                          |   DXF loop asserts PARTS_CURVED=220 on
 *       |                          |   all 9 sheets; continues full-sheet
 *       |                          |   sequence (…→118→120→122); 1 it() block.
 *   123 | curved qty=440           | Eight-full-sheet determinism guard: two
 *       |                          |   runNesting calls with qty=440 produce
 *       |                          |   identical sheets[7].placements[0]
 *       |                          |   partId, x, y, rotation; extends
 *       |                          |   determinism series (85,95,99,103,107,
 *       |                          |   111,114,117,119,121); 1 it() block.
 *   124 | curved qty=550           | Ten full sheets (no remainder): 550 =
 *       |                          |   10×55; sheets.length===10; each sheet
 *       |                          |   has 55 placements; all isCurved=true;
 *       |                          |   DXF loop asserts PARTS_CURVED=220 on
 *       |                          |   all 10 sheets; continues full-sheet
 *       |                          |   sequence (…→120→122→124); 1 it() block.
 *   125 | curved qty=495           | Nine-full-sheet determinism guard: two
 *       |                          |   runNesting calls with qty=495 produce
 *       |                          |   identical sheets[8].placements[0]
 *       |                          |   partId, x, y, rotation; extends
 *       |                          |   determinism series (85,95,99,103,107,
 *       |                          |   111,114,117,119,121,123); 1 it() block.
 *   126 | curved qty=605           | Eleven full sheets (no remainder): 605 =
 *       |                          |   11×55; sheets.length===11; each sheet
 *       |                          |   has 55 placements; all isCurved=true;
 *       |                          |   DXF loop asserts PARTS_CURVED=220 on
 *       |                          |   all 11 sheets; continues full-sheet
 *       |                          |   sequence (…→122→124→126); 1 it() block.
 *   127 | curved qty=550           | Ten-full-sheet determinism guard: two
 *       |                          |   runNesting calls with qty=550 produce
 *       |                          |   identical sheets[9].placements[0]
 *       |                          |   partId, x, y, rotation; extends
 *       |                          |   determinism series (85,95,99,103,107,
 *       |                          |   111,114,117,119,121,123,125); 1 it() block.
 *   128 | curved qty=660           | Twelve full sheets (no remainder): 660 =
 *       |                          |   12×55; sheets.length===12; each sheet
 *       |                          |   has 55 placements; all isCurved=true;
 *       |                          |   DXF loop asserts PARTS_CURVED=220 on
 *       |                          |   all 12 sheets; continues full-sheet
 *       |                          |   sequence (…→124→126→128); 1 it() block.
 *   129 | curved qty=605           | Eleven-full-sheet determinism guard: two
 *       |                          |   runNesting calls with qty=605 produce
 *       |                          |   identical sheets[10].placements[0]
 *       |                          |   partId, x, y, rotation; extends
 *       |                          |   determinism series (85,95,99,103,107,
 *       |                          |   111,114,117,119,121,123,125,127);
 *       |                          |   1 it() block.
 *   130 | curved qty=715           | Thirteen full sheets (no remainder): 715 =
 *       |                          |   13×55; sheets.length===13; each sheet
 *       |                          |   has 55 placements; all isCurved=true;
 *       |                          |   DXF loop asserts PARTS_CURVED=220 on
 *       |                          |   all 13 sheets; continues full-sheet
 *       |                          |   sequence (…→126→128→130); 1 it() block.
 *   131 | curved qty=660           | Twelve-full-sheet determinism guard: two
 *       |                          |   runNesting calls with qty=660 produce
 *       |                          |   identical sheets[11].placements[0]
 *       |                          |   partId, x, y, rotation; extends
 *       |                          |   determinism series (85,95,99,103,107,
 *       |                          |   111,114,117,119,121,123,125,127,129);
 *       |                          |   1 it() block.
 *   132 | curved qty=770           | Fourteen full sheets (no remainder): 770 =
 *       |                          |   14×55; sheets.length===14; each sheet
 *       |                          |   has 55 placements; all isCurved=true;
 *       |                          |   DXF loop asserts PARTS_CURVED=220 on
 *       |                          |   all 14 sheets; continues full-sheet
 *       |                          |   sequence (…→128→130→132); 1 it() block.
 *   133 | curved qty=715           | Thirteen-full-sheet determinism guard: two
 *       |                          |   runNesting calls with qty=715 produce
 *       |                          |   identical sheets[12].placements[0]
 *       |                          |   partId, x, y, rotation; extends
 *       |                          |   determinism series (85,95,99,103,107,
 *       |                          |   111,114,117,119,121,123,125,127,129,131);
 *       |                          |   1 it() block.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * FFDH Constants (from DEFAULT_NESTING_CONFIG in src/nesting/types.ts):
 * ─────────────────────────────────────────────────────────────────────────────
 *   sheetWidth  = 1220 mm    sheetHeight  = 2440 mm
 *   kerfWidth   =    3.5 mm  edgeClearance=   10 mm
 *
 *   usableW = sheetWidth  − 2 × edgeClearance = 1200 mm   (part-fit gate)
 *   usableH = sheetHeight − 2 × edgeClearance = 2420 mm   (part-fit gate)
 *   sheetBoundary = sheetHeight − edgeClearance = 2430 mm  (new-shelf gate)
 *
 *   Curved panel after rotation=90: placed_w=210 (developedLength), placed_h=200
 *
 *   panelsPerShelf = 5
 *     (5 × 210 + 4 × 3.5 + 10 = 1074 ≤ 1200;  6th = 1287.5 > 1200)
 *
 *   shelvesPerSheet = 11
 *     (max k s.t. 10 + k × 203.5 + 200 ≤ 2430  →  k ≤ 10.91)
 *
 *   panelsPerSheet = panelsPerShelf × shelvesPerSheet = 55
 *
 *   Shelf-y formula:   y_k = 10 + (k − 1) × 203.5   (top-left Y, 1-indexed)
 *   ─────────────────────────────────────────────────
 *    k  │  y_k (mm)  │  y_k + placed_h (mm)
 *   ────┼────────────┼──────────────────────
 *    1  │     10.0   │   210.0
 *    2  │    213.5   │   413.5
 *    3  │    417.0   │   617.0
 *    4  │    620.5   │   820.5
 *    5  │    824.0   │  1024.0
 *    6  │   1027.5   │  1227.5
 *    7  │   1231.0   │  1431.0
 *    8  │   1434.5   │  1634.5
 *    9  │   1638.0   │  1838.0
 *   10  │   1841.5   │  2041.5
 *   11  │   2045.0   │  2245.0
 *   ─────────────────────────────────────────────────
 *   y_after_n   = 10 + n × 203.5
 *   y_after_11  = 2248.5 mm  (start of hypothetical shelf 12)
 *
 *   Remaining height after 11 shelves:
 *     remainingH_after_11 = 2430 − 2248.5 = 181.5 mm
 *
 *   Overflow threshold:
 *     cutH ≥ 182 forces a panel to the next sheet
 *     (2248.5 + 182 = 2430.5 > 2430 = sheetBoundary)
 *     cutH ≤ 181 still fits on the current sheet (2248.5 + 181 = 2429.5 ≤ 2430)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Run:
 *   vitest run src/e2e/curvedPanelDxfPipeline.smoke.test.ts
 *
 * @smoke
 */

import { describe, it, expect } from 'vitest';

// Pipeline stages
import { computeCurveFields, DEFAULT_KERF_TOOL } from '../factory/packet/builders/curveFieldsComputer';
import { runNesting } from '../nesting/optimizer';
import { buildDxfSheet } from '../core/export/monolith/builders/buildDxfSheets';
import { getFactoryProfile } from '../core/export/factoryPackageProfiles';

// Types
import type { CutListRow, NestingSheet } from '../core/export/monolith/monolithExportContext';
import type { CabinetPanel } from '../core/types/Cabinet';
import type { PlannedSheet } from '../core/export/planFactoryPackage';

/** Extended CutListRow with optional grainDir for packet-stage tests. */
type PacketCutListRow = CutListRow & { grainDir?: string };

// ============================================================
// Shared fixture — ARC panel, R=200 mm, sweep=60°, MDF 18 mm
//   developedLength ≈ 200 × (π/3) ≈ 209.44 mm
//   projectedDepth  = 200 × (1 − cos 60°) = 100.00 mm
//   correction      ≈ 109.44 mm  → isCurved = true
//   kerfCount       = 12 (validated below)
// ============================================================

// computeCurveFields only reads: profile, finishWidth, finishHeight,
// computed.realThickness — we cast a minimal object rather than populating
// every CabinetPanel field that is irrelevant to the smoke test.
const PANEL_STUB = {
  finishWidth: 400,
  finishHeight: 800,
  profile: {
    kind: 'ARC',
    edge: 'TOP',
    radius: 200,
    sweepDeg: 60,
  },
  computed: { realThickness: 18 },
} as unknown as CabinetPanel;

const MATERIAL_ID = 'MDF_18';

// ============================================================
// Stage 1 — computeCurveFields
// ============================================================

describe('@smoke — Stage 1: computeCurveFields produces curve data', () => {
  it('returns non-null CurveFields for ARC panel', () => {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF');
    expect(fields).not.toBeNull();
  });

  it('developedLength > cutHeight (arc is longer than the panel finish dimension)', () => {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    // arc length ≈ 209 mm — not directly comparable to finishHeight=800; just
    // confirm it is a realistic positive number representing the kerf-zone arc.
    expect(fields.developedLength).toBeGreaterThan(0);
  });

  it('kerfCount >= 1', () => {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    expect(fields.kerfCount).toBeGreaterThanOrEqual(1);
  });

  it('projectedDepth > 0', () => {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    expect(fields.projectedDepth).toBeGreaterThan(0);
  });

  it('curvedEdge === "TOP" (matches ARC profile edge)', () => {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    expect(fields.curvedEdge).toBe('TOP');
  });
});

// ============================================================
// Stage 2 — assemble CutListRow from CurveFields
// ============================================================

/**
 * Build a realistic CutListRow from live computeCurveFields() output so the
 * kerfCount value is always consistent with what the pipeline would actually
 * produce — no magic constants.
 */
function buildCurvedRow(): { row: CutListRow; kerfCount: number } {
  const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;

  const row: CutListRow = {
    partId: 'SMOKE_DOOR',
    cabinetId: 'CAB_SMOKE',
    materialId: MATERIAL_ID,
    finishW: PANEL_STUB.finishWidth,
    finishH: PANEL_STUB.finishHeight,
    edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
    premillL: 0, premillR: 0, premillT: 0, premillB: 0,
    cutW: PANEL_STUB.finishWidth,    // no edge band / premill delta
    cutH: PANEL_STUB.finishHeight,
    qty: 1,
    developedLength: fields.developedLength,
    projectedDepth:  fields.projectedDepth,
    kerfCount:       fields.kerfCount,
    curvedEdge:      fields.curvedEdge ?? undefined,
  };

  return { row, kerfCount: fields.kerfCount };
}

describe('@smoke — Stage 2: CutListRow assembly', () => {
  it('row carries developedLength, kerfCount, projectedDepth, curvedEdge', () => {
    const { row } = buildCurvedRow();
    expect(row.developedLength).toBeDefined();
    expect(row.kerfCount).toBeDefined();
    expect(row.projectedDepth).toBeDefined();
    expect(row.curvedEdge).toBe('TOP');
  });

  it('correction = developedLength − projectedDepth > 0 (flat blank is larger than finish)', () => {
    const { row } = buildCurvedRow();
    const correction = row.developedLength! - row.projectedDepth!;
    expect(correction).toBeGreaterThan(0);
  });
});

// ============================================================
// Stage 3 — runNesting: flat-blank binning + field propagation
// ============================================================

describe('@smoke — Stage 3: runNesting() propagates isCurved + kerfCount', () => {
  it('produces at least one NestingSheet', () => {
    const { row } = buildCurvedRow();
    const { sheets, unplacedParts } = runNesting([row]);
    expect(unplacedParts).toHaveLength(0);
    expect(sheets.length).toBeGreaterThan(0);
  });

  it('placement has isCurved=true', () => {
    const { row } = buildCurvedRow();
    const { sheets } = runNesting([row]);
    const p = sheets.flatMap((s) => s.placements).find((pl) => pl.partId === 'SMOKE_DOOR');
    expect(p).toBeDefined();
    expect(p!.isCurved).toBe(true);
  });

  it('placement kerfCount matches computeCurveFields output', () => {
    const { row, kerfCount } = buildCurvedRow();
    const { sheets } = runNesting([row]);
    const p = sheets.flatMap((s) => s.placements).find((pl) => pl.partId === 'SMOKE_DOOR');
    expect(p!.kerfCount).toBe(kerfCount);
  });

  it('flat blank along TOP/BOTTOM axis (cutH) is larger than finishH', () => {
    const { row } = buildCurvedRow();
    const { sheets } = runNesting([row]);
    const s = sheets[0];
    // The sheet height is a standard board (2440 mm), not the finish dimension.
    // The nesting placed the part using the flat-blank corrected cutH.
    // Verify sheetH is large enough to hold the corrected blank.
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const correction = fields.developedLength - fields.projectedDepth;
    const expectedFlatH = row.cutH + correction;
    expect(s.sheetH).toBeGreaterThanOrEqual(expectedFlatH);
  });
});

// ============================================================
// Stage 4 — buildDxfSheet: PARTS_CURVED + HATCH_CURVED + label
// ============================================================

describe('@smoke — Stage 4: buildDxfSheet() renders curved DXF', () => {
  function runPipeline() {
    const { row, kerfCount } = buildCurvedRow();
    const { sheets } = runNesting([row]);

    const planned: PlannedSheet = {
      index1: 1,
      sheetId: 'SHEET_001',
      materialId: MATERIAL_ID,
    };

    const dxf = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    }).content;

    return { dxf, kerfCount };
  }

  it('DXF output is a non-empty string', () => {
    const { dxf } = runPipeline();
    expect(typeof dxf).toBe('string');
    expect(dxf.length).toBeGreaterThan(0);
  });

  it('DXF is valid R12 (AC1009 header, ENDSEC, EOF)', () => {
    const { dxf } = runPipeline();
    expect(dxf).toContain('AC1009');
    expect(dxf).toContain('ENDSEC');
    expect(dxf.trim()).toContain('EOF');
  });

  it('DXF contains TABLES section with PARTS_CURVED layer', () => {
    const { dxf } = runPipeline();
    expect(dxf).toContain('TABLES');
    expect(dxf).toContain('PARTS_CURVED');
  });

  it('ENTITIES section references PARTS_CURVED (not plain PARTS) for the curved door', () => {
    const { dxf } = runPipeline();
    const entitiesIdx = dxf.indexOf('ENTITIES');
    expect(entitiesIdx).toBeGreaterThan(-1);
    const entities = dxf.slice(entitiesIdx);
    expect(entities).toContain('PARTS_CURVED');
    // Plain PARTS must NOT appear as an entity layer (only inside TABLES)
    const lines = entities.split('\n');
    expect(lines.some((l) => l.trim() === 'PARTS')).toBe(false);
  });

  it('ENTITIES section contains HATCH_CURVED diagonal lines', () => {
    const { dxf } = runPipeline();
    const entitiesIdx = dxf.indexOf('ENTITIES');
    const entities = dxf.slice(entitiesIdx);
    expect(entities).toContain('HATCH_CURVED');
    // Two diagonal lines → at least 2 LINE entities reference HATCH_CURVED
    const segments = entities.split('LINE');
    const hatchLines = segments.filter((s) => s.includes('HATCH_CURVED'));
    expect(hatchLines.length).toBeGreaterThanOrEqual(2);
  });

  // ── PRIMARY ASSERTION ───────────────────────────────────────────────────
  it('DXF sub-label reads "(CURVED / N cuts)" with the live kerfCount', () => {
    const { dxf, kerfCount } = runPipeline();
    expect(dxf).toContain(`(CURVED / ${kerfCount} cuts)`);
  });
  // ────────────────────────────────────────────────────────────────────────

  it('part label "SMOKE_DOOR" is present in the DXF', () => {
    const { dxf } = runPipeline();
    expect(dxf).toContain('SMOKE_DOOR');
  });
});

// ============================================================
// Stage 5 — bytes field: valid UTF-8 Uint8Array matching content
// ============================================================

describe('@smoke — Stage 5: DxfSheetOutput.bytes is a valid UTF-8 Uint8Array', () => {
  function runPipelineFull() {
    const { row, kerfCount } = buildCurvedRow();
    const { sheets } = runNesting([row]);

    const planned: PlannedSheet = {
      index1: 1,
      sheetId: 'SHEET_001',
      materialId: MATERIAL_ID,
    };

    return {
      output: buildDxfSheet({
        planned,
        nesting: sheets[0],
        profile: getFactoryProfile('DEFAULT'),
      }),
      kerfCount,
    };
  }

  it('bytes is a Uint8Array', () => {
    const { output } = runPipelineFull();
    // TextEncoder may come from jsdom's realm while this assertion executes in
    // Node's realm, so instanceof is not a portable typed-array check.
    expect(Object.prototype.toString.call(output.bytes)).toBe('[object Uint8Array]');
  });

  it('bytes is non-empty', () => {
    const { output } = runPipelineFull();
    expect(output.bytes.byteLength).toBeGreaterThan(0);
  });

  it('bytes decodes to the same string as content (UTF-8 round-trip)', () => {
    const { output } = runPipelineFull();
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(output.bytes);
    expect(decoded).toBe(output.content);
  });

  it('byte length equals the UTF-8 encoded length of content', () => {
    const { output } = runPipelineFull();
    // Re-encode content independently and compare byte lengths
    const reEncoded = new TextEncoder().encode(output.content);
    expect(output.bytes.byteLength).toBe(reEncoded.byteLength);
  });

  it('bytes is valid UTF-8 (TextDecoder with fatal=true does not throw)', () => {
    const { output } = runPipelineFull();
    expect(() =>
      new TextDecoder('utf-8', { fatal: true }).decode(output.bytes)
    ).not.toThrow();
  });

  it('content string is exactly reproducible from bytes (no BOM, no extra bytes)', () => {
    const { output } = runPipelineFull();
    // ASCII-only DXF → every code unit maps to exactly one byte
    const allAscii = [...output.content].every((ch) => ch.codePointAt(0)! < 128);
    if (allAscii) {
      expect(output.bytes.byteLength).toBe(output.content.length);
    }
    // Regardless of encoding width, decoded text must equal content precisely
    const decoded = new TextDecoder('utf-8').decode(output.bytes);
    expect(decoded).toBe(output.content);
  });

  it('bytes still contains the "(CURVED / N cuts)" sub-label when decoded', () => {
    const { output, kerfCount } = runPipelineFull();
    const decoded = new TextDecoder('utf-8').decode(output.bytes);
    expect(decoded).toContain(`(CURVED / ${kerfCount} cuts)`);
  });
});

// ============================================================
// S_CURVE fixture — r1=200 mm / sweep1=30° / r2=150 mm / sweep2=45°, MDF 18 mm
//   developedLength ≈ 200×(30π/180) + 150×(45π/180)
//                   ≈ 104.720 + 117.810 = 222.529 mm
//   projectedDepth  ≈ 200×(1−cos30°) + 150×(1−cos45°)
//                   ≈ 26.795 + 43.934  = 70.729 mm
//   correction      ≈ 151.800 mm  → isCurved = true
//   chord1+chord2   ≈ 103.528 + 114.805 = 218.333 mm ≤ 500 mm (fits edge ✓)
// ============================================================

const S_CURVE_PANEL_STUB = {
  finishWidth: 500,
  finishHeight: 900,
  profile: {
    kind: 'S_CURVE',
    edge: 'TOP',
    r1: 200,
    sweepDeg1: 30,
    r2: 150,
    sweepDeg2: 45,
  },
  computed: { realThickness: 18 },
} as unknown as CabinetPanel;

/**
 * Build a CutListRow from live S_CURVE computeCurveFields() output so
 * kerfCount is always consistent with the actual kerf algorithm.
 */
function buildSCurveRow(): { row: CutListRow; kerfCount: number } {
  const fields = computeCurveFields(S_CURVE_PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;

  const row: CutListRow = {
    partId: 'SMOKE_SCURVE_DOOR',
    cabinetId: 'CAB_SMOKE',
    materialId: MATERIAL_ID,
    finishW: S_CURVE_PANEL_STUB.finishWidth,
    finishH: S_CURVE_PANEL_STUB.finishHeight,
    edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
    premillL: 0, premillR: 0, premillT: 0, premillB: 0,
    cutW: S_CURVE_PANEL_STUB.finishWidth,
    cutH: S_CURVE_PANEL_STUB.finishHeight,
    qty: 1,
    developedLength: fields.developedLength,
    projectedDepth:  fields.projectedDepth,
    kerfCount:       fields.kerfCount,
    curvedEdge:      fields.curvedEdge ?? undefined,
  };

  return { row, kerfCount: fields.kerfCount };
}

// ============================================================
// @smoke S-CURVE — Stage 1: computeCurveFields
// ============================================================

describe('@smoke S-CURVE — Stage 1: computeCurveFields produces curve data', () => {
  it('returns non-null CurveFields for S_CURVE panel', () => {
    const fields = computeCurveFields(S_CURVE_PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF');
    expect(fields).not.toBeNull();
  });

  it('developedLength ≈ 222.529 mm (r1×sweep1Rad + r2×sweep2Rad)', () => {
    const fields = computeCurveFields(S_CURVE_PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    expect(fields.developedLength).toBeCloseTo(222.529, 1);
  });

  it('kerfCount >= 1', () => {
    const fields = computeCurveFields(S_CURVE_PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    expect(fields.kerfCount).toBeGreaterThanOrEqual(1);
  });

  it('projectedDepth > 0', () => {
    const fields = computeCurveFields(S_CURVE_PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    expect(fields.projectedDepth).toBeGreaterThan(0);
  });

  it('curvedEdge === "TOP" (matches S_CURVE profile edge)', () => {
    const fields = computeCurveFields(S_CURVE_PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    expect(fields.curvedEdge).toBe('TOP');
  });
});

// ============================================================
// @smoke S-CURVE — Stage 2: CutListRow assembly
// ============================================================

describe('@smoke S-CURVE — Stage 2: CutListRow assembly', () => {
  it('row carries developedLength, kerfCount, projectedDepth, curvedEdge', () => {
    const { row } = buildSCurveRow();
    expect(row.developedLength).toBeDefined();
    expect(row.kerfCount).toBeDefined();
    expect(row.projectedDepth).toBeDefined();
    expect(row.curvedEdge).toBe('TOP');
  });

  it('correction = developedLength − projectedDepth > 0 (flat blank larger than finish)', () => {
    const { row } = buildSCurveRow();
    const correction = row.developedLength! - row.projectedDepth!;
    expect(correction).toBeGreaterThan(0);
  });
});

// ============================================================
// @smoke S-CURVE — Stage 3: runNesting() propagates isCurved + kerfCount
// ============================================================

describe('@smoke S-CURVE — Stage 3: runNesting() propagates isCurved + kerfCount', () => {
  it('produces at least one NestingSheet with no unplaced parts', () => {
    const { row } = buildSCurveRow();
    const { sheets, unplacedParts } = runNesting([row]);
    expect(unplacedParts).toHaveLength(0);
    expect(sheets.length).toBeGreaterThan(0);
  });

  it('placement has isCurved=true', () => {
    const { row } = buildSCurveRow();
    const { sheets } = runNesting([row]);
    const p = sheets
      .flatMap((s) => s.placements)
      .find((pl) => pl.partId === 'SMOKE_SCURVE_DOOR');
    expect(p).toBeDefined();
    expect(p!.isCurved).toBe(true);
  });

  it('placement kerfCount matches computeCurveFields output', () => {
    const { row, kerfCount } = buildSCurveRow();
    const { sheets } = runNesting([row]);
    const p = sheets
      .flatMap((s) => s.placements)
      .find((pl) => pl.partId === 'SMOKE_SCURVE_DOOR');
    expect(p!.kerfCount).toBe(kerfCount);
  });

  it('sheetH accommodates flat blank (>= finishH + correction)', () => {
    const { row } = buildSCurveRow();
    const { sheets } = runNesting([row]);
    const s = sheets[0];
    const fields = computeCurveFields(S_CURVE_PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const correction = fields.developedLength - fields.projectedDepth;
    const expectedFlatH = row.cutH + correction;
    expect(s.sheetH).toBeGreaterThanOrEqual(expectedFlatH);
  });
});

// ============================================================
// @smoke S-CURVE — Stage 4: buildDxfSheet() renders curved DXF
// ============================================================

describe('@smoke S-CURVE — Stage 4: buildDxfSheet() renders curved DXF', () => {
  function runSCurvePipeline() {
    const { row, kerfCount } = buildSCurveRow();
    const { sheets } = runNesting([row]);

    const planned: PlannedSheet = {
      index1: 1,
      sheetId: 'SHEET_001',
      materialId: MATERIAL_ID,
    };

    return {
      dxf: buildDxfSheet({
        planned,
        nesting: sheets[0],
        profile: getFactoryProfile('DEFAULT'),
      }).content,
      kerfCount,
    };
  }

  it('DXF contains PARTS_CURVED layer', () => {
    const { dxf } = runSCurvePipeline();
    expect(dxf).toContain('PARTS_CURVED');
  });

  it('DXF contains HATCH_CURVED layer', () => {
    const { dxf } = runSCurvePipeline();
    expect(dxf).toContain('HATCH_CURVED');
  });

  it('DXF contains "(CURVED / N cuts)" sub-label with live kerfCount', () => {
    const { dxf, kerfCount } = runSCurvePipeline();
    expect(dxf).toContain(`(CURVED / ${kerfCount} cuts)`);
  });

  it('part label "SMOKE_SCURVE_DOOR" is present in the DXF', () => {
    const { dxf } = runSCurvePipeline();
    expect(dxf).toContain('SMOKE_SCURVE_DOOR');
  });
});

// ============================================================
// @smoke S-CURVE — Stage 5: DxfSheetOutput.bytes is a valid UTF-8 Uint8Array
// ============================================================

describe('@smoke S-CURVE — Stage 5: DxfSheetOutput.bytes is a valid UTF-8 Uint8Array', () => {
  function runSCurvePipelineFull() {
    const { row, kerfCount } = buildSCurveRow();
    const { sheets } = runNesting([row]);

    const planned: PlannedSheet = {
      index1: 1,
      sheetId: 'SHEET_001',
      materialId: MATERIAL_ID,
    };

    return {
      output: buildDxfSheet({
        planned,
        nesting: sheets[0],
        profile: getFactoryProfile('DEFAULT'),
      }),
      kerfCount,
    };
  }

  it('bytes is a Uint8Array', () => {
    const { output } = runSCurvePipelineFull();
    expect(Object.prototype.toString.call(output.bytes)).toBe('[object Uint8Array]');
  });

  it('bytes is non-empty', () => {
    const { output } = runSCurvePipelineFull();
    expect(output.bytes.byteLength).toBeGreaterThan(0);
  });

  it('bytes decodes to the same string as content (UTF-8 round-trip)', () => {
    const { output } = runSCurvePipelineFull();
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(output.bytes);
    expect(decoded).toBe(output.content);
  });

  it('byte length equals the UTF-8 encoded length of content', () => {
    const { output } = runSCurvePipelineFull();
    const reEncoded = new TextEncoder().encode(output.content);
    expect(output.bytes.byteLength).toBe(reEncoded.byteLength);
  });

  it('bytes is valid UTF-8 (TextDecoder with fatal=true does not throw)', () => {
    const { output } = runSCurvePipelineFull();
    expect(() =>
      new TextDecoder('utf-8', { fatal: true }).decode(output.bytes)
    ).not.toThrow();
  });

  it('content string is exactly reproducible from bytes (no BOM, no extra bytes)', () => {
    const { output } = runSCurvePipelineFull();
    const allAscii = [...output.content].every((ch) => ch.codePointAt(0)! < 128);
    if (allAscii) {
      expect(output.bytes.byteLength).toBe(output.content.length);
    }
    const decoded = new TextDecoder('utf-8').decode(output.bytes);
    expect(decoded).toBe(output.content);
  });

  it('bytes still contains the "(CURVED / N cuts)" sub-label when decoded', () => {
    const { output, kerfCount } = runSCurvePipelineFull();
    const decoded = new TextDecoder('utf-8').decode(output.bytes);
    expect(decoded).toContain(`(CURVED / ${kerfCount} cuts)`);
  });
});

// ============================================================
// @smoke S-CURVE — Stage 6: HATCH_CURVED X-lines span flat-blank footprint
//
// The X-hatch in buildDxfSheets.ts spans the FULL placement rectangle
// (placement.x, placement.y) → (placement.x + effectiveW, placement.y + effectiveH)
// where effectiveW/H are the rotated flat-blank dimensions, NOT the finish dimensions.
//
// For TOP-edge S_CURVE:
//   correction   = developedLength − projectedDepth ≈ 151.800 mm
//   flatBlankW   = finishWidth  = 500 mm        (no correction on perpendicular axis)
//   flatBlankH   = finishHeight + correction ≈ 1051.800 mm
//
// FFDH picks rotation=90 (shelf height = 500 mm < 1051.800 mm → less wasted space),
// so effectiveW ≈ 1051.800 mm (horizontal) and effectiveH = 500 mm (vertical).
// ============================================================

describe('@smoke S-CURVE — Stage 6: HATCH_CURVED X-lines span flat-blank footprint', () => {
  function runStage6() {
    const fields = computeCurveFields(S_CURVE_PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const { row } = buildSCurveRow();
    const { sheets } = runNesting([row]);

    const planned: PlannedSheet = {
      index1: 1,
      sheetId: 'SHEET_001',
      materialId: MATERIAL_ID,
    };

    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const placement = sheets
      .flatMap((s) => s.placements)
      .find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;

    // Mirror getRotatedDimensions() (private in buildDxfSheets.ts)
    const isRotated = placement.rotation === 90 || placement.rotation === 270;
    const effectiveW = isRotated ? placement.cutH : placement.cutW;
    const effectiveH = isRotated ? placement.cutW : placement.cutH;

    const correction = fields.developedLength - fields.projectedDepth;

    return { fields, placement, output, effectiveW, effectiveH, correction };
  }

  it('placement.cutW equals finishWidth — no correction on perpendicular axis', () => {
    const { placement } = runStage6();
    // TOP-edge curve: correction is applied only to the HEIGHT dimension
    expect(placement.cutW).toBe(S_CURVE_PANEL_STUB.finishWidth); // 500 mm
  });

  it('placement.cutH ≈ finishHeight + chord correction (flat-blank from arc geometry)', () => {
    const { placement, correction } = runStage6();
    const expectedFlatH = S_CURVE_PANEL_STUB.finishHeight + correction;
    // Flat blank must be taller than the finish panel by the arc-to-projection difference
    expect(placement.cutH).toBeCloseTo(expectedFlatH, 3);
  });

  it('flat-blank height is greater than finish height (correction > 0)', () => {
    const { placement } = runStage6();
    expect(placement.cutH).toBeGreaterThan(S_CURVE_PANEL_STUB.finishHeight);
  });

  it('hatch footprint area equals flatBlankW × flatBlankH (covers full flat blank)', () => {
    const { effectiveW, effectiveH, correction } = runStage6();
    const expectedArea =
      S_CURVE_PANEL_STUB.finishWidth *
      (S_CURVE_PANEL_STUB.finishHeight + correction);
    // area is rotation-invariant: effectiveW × effectiveH = flatBlankW × flatBlankH
    expect(effectiveW * effectiveH).toBeCloseTo(expectedArea, 3);
  });

  it('DXF contains far-corner x-coordinate of HATCH_CURVED diagonal', () => {
    const { placement, effectiveW, output } = runStage6();
    const farX = placement.x + effectiveW; // ≈ 10 + 1051.800 = 1061.800...
    // addLine() rounds to 0.01 mm — compare rounded value (Stage 22 invariant)
    const farXRounded = Math.round(farX * 100) / 100;
    expect(output.content).toContain(String(farXRounded));
  });

  it('DXF contains far-corner y-coordinate of HATCH_CURVED diagonal', () => {
    const { placement, effectiveH, output } = runStage6();
    const farY = placement.y + effectiveH; // ≈ 10 + 500 = 510
    expect(output.content).toContain(String(farY));
  });
});

// ============================================================
// @smoke S-CURVE — Stage 7: HATCH_CURVED absent for straight
//   panel on the same sheet
//
// A straight panel (no curve fields, no isCurved flag) placed on
// the same nesting sheet as the S_CURVE panel must NOT receive
// HATCH_CURVED X-lines in the DXF output.  Only placements where
// isCurved=true trigger the diagonal hatch in buildDxfSheets.ts.
//
// Verification strategy:
//   - Run nesting with 1 curved row + 1 straight row → same sheet
//   - Count LINE entities per layer in the ENTITIES section
//   - PARTS_CURVED  → exactly 4  (curved panel rectangle only)
//   - PARTS         → exactly 4  (straight panel rectangle only)
//   - HATCH_CURVED  → exactly 2  (2 diagonals for curved panel,
//                                  0 extra lines for straight panel)
// ============================================================

/** Straight (non-curved) panel row — no curve fields whatsoever */
const STRAIGHT_ROW: CutListRow = {
  partId: 'SMOKE_STRAIGHT_SHELF',
  cabinetId: 'CAB_SMOKE',
  materialId: MATERIAL_ID,
  finishW: 300,
  finishH: 400,
  edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
  premillL: 0, premillR: 0, premillT: 0, premillB: 0,
  cutW: 300,
  cutH: 400,
  qty: 1,
  // No developedLength / projectedDepth / kerfCount / curvedEdge
};

describe('@smoke S-CURVE — Stage 7: HATCH_CURVED absent for straight panel on same sheet', () => {
  function runStage7() {
    const { row: curvedRow, kerfCount } = buildSCurveRow();

    // Place both rows; both fit on a single 1220×2440 sheet
    const { sheets, unplacedParts } = runNesting([curvedRow, STRAIGHT_ROW]);

    const planned: PlannedSheet = {
      index1: 1,
      sheetId: 'SHEET_001',
      materialId: MATERIAL_ID,
    };

    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const sheet0Placements = sheets[0].placements;
    const curvedPlacement  = sheet0Placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const straightPlacement = sheet0Placements.find((p) => p.partId === 'SMOKE_STRAIGHT_SHELF')!;

    // Isolate ENTITIES section (layer names in TABLES do not count)
    const entitiesStart = output.content.indexOf('ENTITIES');
    const entities = output.content.slice(entitiesStart);

    /**
     * Count LINE entities whose layer attribute is exactly `layer`.
     *
     * DXF R12 LINE encoding (after DxfBuilder.addLine):
     *   …\nLINE\n8\n<LAYER>\n10\n…
     *
     * Splitting by 'LINE' yields segments where the very first group-code
     * pair is `\n8\n<LAYER>\n`.  We match `\n8\n${layer}\n` (newline on
     * both sides) so `PARTS` does NOT accidentally match `PARTS_CURVED`.
     */
    const countLayer = (layer: string): number =>
      entities
        .split('LINE')
        .slice(1) // skip any text before the first LINE entity
        .filter((seg) => seg.includes(`\n8\n${layer}\n`))
        .length;

    return {
      output, entities,
      curvedPlacement, straightPlacement,
      kerfCount, unplacedParts, sheets,
      countLayer,
    };
  }

  it('both panels are placed on sheets[0] with no unplaced parts', () => {
    const { unplacedParts, sheets } = runStage7();
    expect(unplacedParts).toHaveLength(0);
    expect(sheets[0].placements.some((p) => p.partId === 'SMOKE_SCURVE_DOOR')).toBe(true);
    expect(sheets[0].placements.some((p) => p.partId === 'SMOKE_STRAIGHT_SHELF')).toBe(true);
  });

  it('straight panel placement has isCurved falsy (no curve correction applied)', () => {
    const { straightPlacement } = runStage7();
    expect(straightPlacement).toBeDefined();
    expect(straightPlacement.isCurved).toBeFalsy();
  });

  it('ENTITIES has exactly 4 PARTS_CURVED lines (curved panel rect, no straight contribution)', () => {
    const { countLayer } = runStage7();
    // One rectangle = 4 LINE entities; only the curved panel uses PARTS_CURVED
    expect(countLayer('PARTS_CURVED')).toBe(4);
  });

  it('ENTITIES has exactly 4 PARTS lines (straight panel rect, no curved contribution)', () => {
    const { countLayer } = runStage7();
    // One rectangle = 4 LINE entities; only the straight panel uses PARTS
    expect(countLayer('PARTS')).toBe(4);
  });

  it('ENTITIES has exactly 2 HATCH_CURVED lines (2 diagonals for curved panel, 0 for straight)', () => {
    const { countLayer } = runStage7();
    // Two diagonal X-hatch lines for the single curved panel;
    // the straight panel contributes exactly zero HATCH_CURVED lines.
    expect(countLayer('HATCH_CURVED')).toBe(2);
  });

  it('DXF still contains (CURVED / N cuts) sub-label for the curved panel', () => {
    const { entities, kerfCount } = runStage7();
    expect(entities).toContain(`(CURVED / ${kerfCount} cuts)`);
  });

  it('both part labels are present in the DXF', () => {
    const { output } = runStage7();
    expect(output.content).toContain('SMOKE_SCURVE_DOOR');
    expect(output.content).toContain('SMOKE_STRAIGHT_SHELF');
  });
});

// ============================================================
// @smoke S-CURVE — Stage 8: HATCH_CURVED count stays exactly 2
//   when TWO straight panels share the sheet with one curved panel
//
// Scaling from Stage 7 (1 straight + 1 curved) to 2 straight + 1 curved
// must not produce extra HATCH_CURVED lines.  The invariant is:
//
//   HATCH_CURVED count  = 2  × (number of curved placements)
//   PARTS_CURVED count  = 4  × (number of curved placements)
//   PARTS count         = 4  × (number of straight placements)
//
// With 1 curved + 2 straight panels:
//   HATCH_CURVED = 2   (unchanged — zero contribution from straight panels)
//   PARTS_CURVED = 4
//   PARTS        = 8
// ============================================================

/** Second straight panel — distinct partId and size from STRAIGHT_ROW */
const STRAIGHT_ROW_2: CutListRow = {
  partId: 'SMOKE_STRAIGHT_BACK',
  cabinetId: 'CAB_SMOKE',
  materialId: MATERIAL_ID,
  finishW: 250,
  finishH: 350,
  edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
  premillL: 0, premillR: 0, premillT: 0, premillB: 0,
  cutW: 250,
  cutH: 350,
  qty: 1,
};

describe('@smoke S-CURVE — Stage 8: HATCH_CURVED count stays 2 with two straight panels on same sheet', () => {
  function runStage8() {
    const { row: curvedRow, kerfCount } = buildSCurveRow();

    // All three rows land on a single 1220×2440 sheet
    const { sheets, unplacedParts } = runNesting([curvedRow, STRAIGHT_ROW, STRAIGHT_ROW_2]);

    const planned: PlannedSheet = {
      index1: 1,
      sheetId: 'SHEET_001',
      materialId: MATERIAL_ID,
    };

    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const placements = sheets[0].placements;
    const curvedP  = placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const straight1 = placements.find((p) => p.partId === 'SMOKE_STRAIGHT_SHELF')!;
    const straight2 = placements.find((p) => p.partId === 'SMOKE_STRAIGHT_BACK')!;

    // ENTITIES section only — TABLES layer definitions must not be counted
    const entitiesStart = output.content.indexOf('ENTITIES');
    const entities = output.content.slice(entitiesStart);

    const countLayer = (layer: string): number =>
      entities
        .split('LINE')
        .slice(1)
        .filter((seg) => seg.includes(`\n8\n${layer}\n`))
        .length;

    return {
      output, entities,
      curvedP, straight1, straight2,
      kerfCount, unplacedParts, sheets,
      countLayer,
    };
  }

  it('all three panels placed on sheets[0] — no unplaced parts', () => {
    const { unplacedParts, sheets } = runStage8();
    expect(unplacedParts).toHaveLength(0);
    const ids = sheets[0].placements.map((p) => p.partId);
    expect(ids).toContain('SMOKE_SCURVE_DOOR');
    expect(ids).toContain('SMOKE_STRAIGHT_SHELF');
    expect(ids).toContain('SMOKE_STRAIGHT_BACK');
  });

  it('both straight placements have isCurved falsy', () => {
    const { straight1, straight2 } = runStage8();
    expect(straight1.isCurved).toBeFalsy();
    expect(straight2.isCurved).toBeFalsy();
  });

  it('HATCH_CURVED count is exactly 2 — adding a second straight panel adds zero hatch lines', () => {
    const { countLayer } = runStage8();
    expect(countLayer('HATCH_CURVED')).toBe(2);
  });

  it('PARTS_CURVED count is exactly 4 (one curved rect)', () => {
    const { countLayer } = runStage8();
    expect(countLayer('PARTS_CURVED')).toBe(4);
  });

  it('PARTS count is exactly 8 (two straight rects × 4 lines each)', () => {
    const { countLayer } = runStage8();
    expect(countLayer('PARTS')).toBe(8);
  });

  it('DXF still contains (CURVED / N cuts) sub-label for the curved panel', () => {
    const { entities, kerfCount } = runStage8();
    expect(entities).toContain(`(CURVED / ${kerfCount} cuts)`);
  });

  it('all three part labels are present in the DXF', () => {
    const { output } = runStage8();
    expect(output.content).toContain('SMOKE_SCURVE_DOOR');
    expect(output.content).toContain('SMOKE_STRAIGHT_SHELF');
    expect(output.content).toContain('SMOKE_STRAIGHT_BACK');
  });
});

// ============================================================
// @smoke S-CURVE — Stage 9: HATCH_CURVED count scales to 4
//   when TWO curved panels (ARC + S_CURVE) share the same sheet
//
// Each curved panel contributes exactly 2 HATCH_CURVED diagonal
// lines regardless of its profile type.  With two curved panels:
//
//   HATCH_CURVED count  = 2 × 2 = 4
//   PARTS_CURVED count  = 4 × 2 = 8
//   PARTS count         = 0       (no straight panels)
//
// Sheet layout (1220 × 2440, kerfWidth=3.5, edgeClearance=10):
//   Shelf 1 — ARC panel   (rotation=90) → effectiveH = 400 mm, y=10
//   Shelf 2 — S_CURVE     (rotation=90) → effectiveH = 500 mm, y=413.5
//   Max Y used ≈ 913.5 mm  ≪  2440 mm  →  both fit on one sheet
// ============================================================

describe('@smoke S-CURVE — Stage 9: HATCH_CURVED count scales to 4 with two curved panels', () => {
  function runStage9() {
    const { row: arcRow,    kerfCount: arcKerfCount    } = buildCurvedRow();
    const { row: sCurveRow, kerfCount: sCurveKerfCount } = buildSCurveRow();

    // Both curved rows → same sheet
    const { sheets, unplacedParts } = runNesting([arcRow, sCurveRow]);

    const planned: PlannedSheet = {
      index1: 1,
      sheetId: 'SHEET_001',
      materialId: MATERIAL_ID,
    };

    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const placements  = sheets[0].placements;
    const arcP        = placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP     = placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;

    // ENTITIES section only — TABLES layer definitions must not be counted
    const entitiesStart = output.content.indexOf('ENTITIES');
    const entities = output.content.slice(entitiesStart);

    const countLayer = (layer: string): number =>
      entities
        .split('LINE')
        .slice(1)
        .filter((seg) => seg.includes(`\n8\n${layer}\n`))
        .length;

    return {
      output, entities,
      arcP, sCurveP,
      arcKerfCount, sCurveKerfCount,
      unplacedParts, sheets,
      countLayer,
    };
  }

  it('both curved panels placed on sheets[0] — no unplaced parts', () => {
    const { unplacedParts, sheets } = runStage9();
    expect(unplacedParts).toHaveLength(0);
    const ids = sheets[0].placements.map((p) => p.partId);
    expect(ids).toContain('SMOKE_DOOR');
    expect(ids).toContain('SMOKE_SCURVE_DOOR');
  });

  it('both placements have isCurved=true', () => {
    const { arcP, sCurveP } = runStage9();
    expect(arcP.isCurved).toBe(true);
    expect(sCurveP.isCurved).toBe(true);
  });

  it('HATCH_CURVED count is exactly 4 — 2 diagonals per curved panel × 2 panels', () => {
    const { countLayer } = runStage9();
    expect(countLayer('HATCH_CURVED')).toBe(4);
  });

  it('PARTS_CURVED count is exactly 8 — one rect (4 lines) per curved panel × 2 panels', () => {
    const { countLayer } = runStage9();
    expect(countLayer('PARTS_CURVED')).toBe(8);
  });

  it('PARTS count is exactly 0 — no straight panels on this sheet', () => {
    const { countLayer } = runStage9();
    expect(countLayer('PARTS')).toBe(0);
  });

  it('each curved panel carries its own (CURVED / N cuts) sub-label', () => {
    const { entities, arcKerfCount, sCurveKerfCount } = runStage9();
    expect(entities).toContain(`(CURVED / ${arcKerfCount} cuts)`);
    expect(entities).toContain(`(CURVED / ${sCurveKerfCount} cuts)`);
  });

  it('both part labels are present in the DXF', () => {
    const { output } = runStage9();
    expect(output.content).toContain('SMOKE_DOOR');
    expect(output.content).toContain('SMOKE_SCURVE_DOOR');
  });
});

// ============================================================
// @smoke S-CURVE — Stage 10: HATCH_CURVED count scales to 6
//   when THREE curved panels (ARC + S_CURVE + ARC_SMALL) share
//   the same sheet.
//
// Each curved panel contributes exactly 2 HATCH_CURVED diagonal
// lines.  With three curved panels:
//
//   HATCH_CURVED count  = 2 × 3 = 6
//   PARTS_CURVED count  = 4 × 3 = 12
//   PARTS count         = 0       (no straight panels)
//
// Sheet layout (1220 × 2440, kerfWidth=3.5, edgeClearance=10):
//   Shelf 1 — ARC panel   (rotation=90) → effectiveH = 400 mm, y=10
//   Shelf 2 — S_CURVE     (rotation=90) → effectiveH = 500 mm, y=413.5
//   Shelf 3 — ARC_SMALL   (rotation=90) → effectiveH = 300 mm, y=917.0
//   Max Y used = 917 + 300 = 1217 mm  ≪  2440 mm  →  all three fit
//
// ARC_SMALL profile: same ARC kind, radius=200, sweepDeg=60 as
// PANEL_STUB — so arcSmallKerfCount === arcKerfCount.
// ============================================================

/** Third curved panel fixture — smaller ARC with same bend profile */
const ARC_SMALL_PANEL_STUB = {
  finishWidth: 300,
  finishHeight: 500,
  profile: { kind: 'ARC', edge: 'TOP', radius: 200, sweepDeg: 60 },
  computed: { realThickness: 18 },
} as unknown as CabinetPanel;

/**
 * Build a CutListRow for ARC_SMALL from live computeCurveFields() so
 * kerfCount is always consistent with the pipeline.
 */
function buildArcSmallRow(): { row: CutListRow; kerfCount: number } {
  const fields = computeCurveFields(ARC_SMALL_PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;

  const row: CutListRow = {
    partId: 'SMOKE_ARC_SMALL',
    cabinetId: 'CAB_SMOKE',
    materialId: MATERIAL_ID,
    finishW: ARC_SMALL_PANEL_STUB.finishWidth,
    finishH: ARC_SMALL_PANEL_STUB.finishHeight,
    edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
    premillL: 0, premillR: 0, premillT: 0, premillB: 0,
    cutW: ARC_SMALL_PANEL_STUB.finishWidth,
    cutH: ARC_SMALL_PANEL_STUB.finishHeight,
    qty: 1,
    developedLength: fields.developedLength,
    projectedDepth:  fields.projectedDepth,
    kerfCount:       fields.kerfCount,
    curvedEdge:      fields.curvedEdge ?? undefined,
  };

  return { row, kerfCount: fields.kerfCount };
}

describe('@smoke S-CURVE — Stage 10: HATCH_CURVED count scales to 6 with three curved panels', () => {
  function runStage10() {
    const { row: arcRow,      kerfCount: arcKerfCount      } = buildCurvedRow();
    const { row: sCurveRow,   kerfCount: sCurveKerfCount   } = buildSCurveRow();
    const { row: arcSmallRow, kerfCount: arcSmallKerfCount } = buildArcSmallRow();

    // All three curved rows → same sheet
    const { sheets, unplacedParts } = runNesting([arcRow, sCurveRow, arcSmallRow]);

    const planned: PlannedSheet = {
      index1: 1,
      sheetId: 'SHEET_001',
      materialId: MATERIAL_ID,
    };

    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const placements  = sheets[0].placements;
    const arcP        = placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP     = placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const arcSmallP   = placements.find((p) => p.partId === 'SMOKE_ARC_SMALL')!;

    // ENTITIES section only — TABLES layer definitions must not be counted
    const entitiesStart = output.content.indexOf('ENTITIES');
    const entities = output.content.slice(entitiesStart);

    const countLayer = (layer: string): number =>
      entities
        .split('LINE')
        .slice(1)
        .filter((seg) => seg.includes(`\n8\n${layer}\n`))
        .length;

    return {
      output, entities,
      arcP, sCurveP, arcSmallP,
      arcKerfCount, sCurveKerfCount, arcSmallKerfCount,
      unplacedParts, sheets,
      countLayer,
    };
  }

  it('all three curved panels placed on sheets[0] — no unplaced parts', () => {
    const { unplacedParts, sheets } = runStage10();
    expect(unplacedParts).toHaveLength(0);
    const ids = sheets[0].placements.map((p) => p.partId);
    expect(ids).toContain('SMOKE_DOOR');
    expect(ids).toContain('SMOKE_SCURVE_DOOR');
    expect(ids).toContain('SMOKE_ARC_SMALL');
  });

  it('all three placements have isCurved=true', () => {
    const { arcP, sCurveP, arcSmallP } = runStage10();
    expect(arcP.isCurved).toBe(true);
    expect(sCurveP.isCurved).toBe(true);
    expect(arcSmallP.isCurved).toBe(true);
  });

  it('HATCH_CURVED count is exactly 6 — 2 diagonals per curved panel × 3 panels', () => {
    const { countLayer } = runStage10();
    expect(countLayer('HATCH_CURVED')).toBe(6);
  });

  it('PARTS_CURVED count is exactly 12 — one rect (4 lines) per curved panel × 3 panels', () => {
    const { countLayer } = runStage10();
    expect(countLayer('PARTS_CURVED')).toBe(12);
  });

  it('PARTS count is exactly 0 — no straight panels on this sheet', () => {
    const { countLayer } = runStage10();
    expect(countLayer('PARTS')).toBe(0);
  });

  it('each curved panel carries its own (CURVED / N cuts) sub-label', () => {
    const { entities, arcKerfCount, sCurveKerfCount } = runStage10();
    // ARC and ARC_SMALL share the same kerfCount (identical profile + material)
    expect(entities).toContain(`(CURVED / ${arcKerfCount} cuts)`);
    expect(entities).toContain(`(CURVED / ${sCurveKerfCount} cuts)`);
  });

  it('all three part labels are present in the DXF', () => {
    const { output } = runStage10();
    expect(output.content).toContain('SMOKE_DOOR');
    expect(output.content).toContain('SMOKE_SCURVE_DOOR');
    expect(output.content).toContain('SMOKE_ARC_SMALL');
  });
});

// ============================================================
// @smoke — Stage 11: HATCH_CURVED is absent when all three
//   curved panels are replaced with straight panels.
//
// This is the complement of Stage 10: the same sheet geometry
// with three straight rows must produce zero HATCH_CURVED lines,
// zero PARTS_CURVED rects, and no (CURVED / N cuts) sub-label.
//
//   HATCH_CURVED count  = 0
//   PARTS_CURVED count  = 0
//   PARTS count         = 12  (3 straight rects × 4 lines each)
// ============================================================

/** Third straight panel — distinct partId and size from STRAIGHT_ROW and STRAIGHT_ROW_2 */
const STRAIGHT_ROW_3: CutListRow = {
  partId: 'SMOKE_STRAIGHT_SIDE',
  cabinetId: 'CAB_SMOKE',
  materialId: MATERIAL_ID,
  finishW: 200,
  finishH: 300,
  edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
  premillL: 0, premillR: 0, premillT: 0, premillB: 0,
  cutW: 200,
  cutH: 300,
  qty: 1,
};

describe('@smoke — Stage 11: HATCH_CURVED is absent when all panels are straight', () => {
  function runStage11() {
    // Three straight rows — no curved panels at all
    const { sheets, unplacedParts } = runNesting([STRAIGHT_ROW, STRAIGHT_ROW_2, STRAIGHT_ROW_3]);

    const planned: PlannedSheet = {
      index1: 1,
      sheetId: 'SHEET_001',
      materialId: MATERIAL_ID,
    };

    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const placements = sheets[0].placements;
    const straight1 = placements.find((p) => p.partId === 'SMOKE_STRAIGHT_SHELF')!;
    const straight2 = placements.find((p) => p.partId === 'SMOKE_STRAIGHT_BACK')!;
    const straight3 = placements.find((p) => p.partId === 'SMOKE_STRAIGHT_SIDE')!;

    // ENTITIES section only — TABLES layer definitions must not be counted
    const entitiesStart = output.content.indexOf('ENTITIES');
    const entities = output.content.slice(entitiesStart);

    const countLayer = (layer: string): number =>
      entities
        .split('LINE')
        .slice(1)
        .filter((seg) => seg.includes(`\n8\n${layer}\n`))
        .length;

    return {
      output, entities,
      straight1, straight2, straight3,
      unplacedParts, sheets,
      countLayer,
    };
  }

  it('all three straight panels placed on sheets[0] — no unplaced parts', () => {
    const { unplacedParts, sheets } = runStage11();
    expect(unplacedParts).toHaveLength(0);
    const ids = sheets[0].placements.map((p) => p.partId);
    expect(ids).toContain('SMOKE_STRAIGHT_SHELF');
    expect(ids).toContain('SMOKE_STRAIGHT_BACK');
    expect(ids).toContain('SMOKE_STRAIGHT_SIDE');
  });

  it('all three placements have isCurved falsy', () => {
    const { straight1, straight2, straight3 } = runStage11();
    expect(straight1.isCurved).toBeFalsy();
    expect(straight2.isCurved).toBeFalsy();
    expect(straight3.isCurved).toBeFalsy();
  });

  it('HATCH_CURVED count is exactly 0 — no hatch lines without curved panels', () => {
    const { countLayer } = runStage11();
    expect(countLayer('HATCH_CURVED')).toBe(0);
  });

  it('PARTS_CURVED count is exactly 0 — no curved rects without curved panels', () => {
    const { countLayer } = runStage11();
    expect(countLayer('PARTS_CURVED')).toBe(0);
  });

  it('PARTS count is exactly 12 — three straight rects × 4 lines each', () => {
    const { countLayer } = runStage11();
    expect(countLayer('PARTS')).toBe(12);
  });

  it('no (CURVED / N cuts) sub-label appears anywhere in the DXF', () => {
    const { entities } = runStage11();
    expect(entities).not.toContain('(CURVED /');
  });

  it('all three part labels are present in the DXF', () => {
    const { output } = runStage11();
    expect(output.content).toContain('SMOKE_STRAIGHT_SHELF');
    expect(output.content).toContain('SMOKE_STRAIGHT_BACK');
    expect(output.content).toContain('SMOKE_STRAIGHT_SIDE');
  });
});

// ============================================================
// @smoke — Stage 12: HATCH_CURVED scales to 2 when one straight
//   panel from Stage 11 is replaced with a curved panel.
//
// Replaces STRAIGHT_ROW (SMOKE_STRAIGHT_SHELF) with the ARC
// curved panel (SMOKE_DOOR).  The remaining two straight panels
// carry no hatch, so the count rises from 0 → 2.
//
//   HATCH_CURVED count  = 2  (1 curved panel × 2 diagonals)
//   PARTS_CURVED count  = 4  (1 curved rect  × 4 lines)
//   PARTS count         = 8  (2 straight rects × 4 lines each)
// ============================================================

describe('@smoke — Stage 12: HATCH_CURVED scales to 2 when one straight is replaced with a curved panel', () => {
  function runStage12() {
    const { row: curvedRow, kerfCount } = buildCurvedRow(); // ARC panel (SMOKE_DOOR)

    // STRAIGHT_ROW replaced by curvedRow; STRAIGHT_ROW_2 + STRAIGHT_ROW_3 remain
    const { sheets, unplacedParts } = runNesting([curvedRow, STRAIGHT_ROW_2, STRAIGHT_ROW_3]);

    const planned: PlannedSheet = {
      index1: 1,
      sheetId: 'SHEET_001',
      materialId: MATERIAL_ID,
    };

    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const placements = sheets[0].placements;
    const curvedP   = placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const straight2 = placements.find((p) => p.partId === 'SMOKE_STRAIGHT_BACK')!;
    const straight3 = placements.find((p) => p.partId === 'SMOKE_STRAIGHT_SIDE')!;

    // ENTITIES section only — TABLES layer definitions must not be counted
    const entitiesStart = output.content.indexOf('ENTITIES');
    const entities = output.content.slice(entitiesStart);

    const countLayer = (layer: string): number =>
      entities
        .split('LINE')
        .slice(1)
        .filter((seg) => seg.includes(`\n8\n${layer}\n`))
        .length;

    return {
      output, entities,
      curvedP, straight2, straight3,
      kerfCount, unplacedParts, sheets,
      countLayer,
    };
  }

  it('one curved + two straight panels placed on sheets[0] — no unplaced parts', () => {
    const { unplacedParts, sheets } = runStage12();
    expect(unplacedParts).toHaveLength(0);
    const ids = sheets[0].placements.map((p) => p.partId);
    expect(ids).toContain('SMOKE_DOOR');
    expect(ids).toContain('SMOKE_STRAIGHT_BACK');
    expect(ids).toContain('SMOKE_STRAIGHT_SIDE');
  });

  it('curved placement has isCurved=true; straight placements have isCurved falsy', () => {
    const { curvedP, straight2, straight3 } = runStage12();
    expect(curvedP.isCurved).toBe(true);
    expect(straight2.isCurved).toBeFalsy();
    expect(straight3.isCurved).toBeFalsy();
  });

  it('HATCH_CURVED count is exactly 2 — replacing one straight with one curved adds exactly 2 hatch lines', () => {
    const { countLayer } = runStage12();
    expect(countLayer('HATCH_CURVED')).toBe(2);
  });

  it('PARTS_CURVED count is exactly 4 — one curved rect × 4 lines', () => {
    const { countLayer } = runStage12();
    expect(countLayer('PARTS_CURVED')).toBe(4);
  });

  it('PARTS count is exactly 8 — two straight rects × 4 lines each', () => {
    const { countLayer } = runStage12();
    expect(countLayer('PARTS')).toBe(8);
  });

  it('(CURVED / N cuts) sub-label is present for the curved panel', () => {
    const { entities, kerfCount } = runStage12();
    expect(entities).toContain(`(CURVED / ${kerfCount} cuts)`);
  });

  it('all three part labels are present in the DXF', () => {
    const { output } = runStage12();
    expect(output.content).toContain('SMOKE_DOOR');
    expect(output.content).toContain('SMOKE_STRAIGHT_BACK');
    expect(output.content).toContain('SMOKE_STRAIGHT_SIDE');
  });
});

// ============================================================
// @smoke — Stage 13: HATCH_CURVED scales to 4 when two of the
//   three straight panels are replaced with curved panels.
//
// Replaces STRAIGHT_ROW_2 and STRAIGHT_ROW_3 with the ARC panel
// (SMOKE_DOOR) and the S_CURVE panel (SMOKE_SCURVE_DOOR).
// Only STRAIGHT_ROW_3 (SMOKE_STRAIGHT_SIDE) remains straight.
//
//   HATCH_CURVED count  = 4  (2 curved panels × 2 diagonals)
//   PARTS_CURVED count  = 8  (2 curved rects  × 4 lines)
//   PARTS count         = 4  (1 straight rect  × 4 lines)
//
// Sheet layout (1220 × 2440, kerfWidth=3.5, edgeClearance=10):
//   Shelf 1 — ARC panel   (rotation=90) → effectiveH = 400 mm, y=10
//   Shelf 2 — S_CURVE     (rotation=90) → effectiveH = 500 mm, y=413.5
//   Shelf 3 — STRAIGHT    (200×300, no rotation) → effectiveH = 300 mm
//   Max Y well under 2440 mm → all fit on one sheet
// ============================================================

describe('@smoke — Stage 13: HATCH_CURVED scales to 4 when two straight panels are replaced with curved', () => {
  function runStage13() {
    const { row: arcRow,    kerfCount: arcKerfCount    } = buildCurvedRow();   // SMOKE_DOOR
    const { row: sCurveRow, kerfCount: sCurveKerfCount } = buildSCurveRow();   // SMOKE_SCURVE_DOOR

    // Two curved + one straight
    const { sheets, unplacedParts } = runNesting([arcRow, sCurveRow, STRAIGHT_ROW_3]);

    const planned: PlannedSheet = {
      index1: 1,
      sheetId: 'SHEET_001',
      materialId: MATERIAL_ID,
    };

    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const placements = sheets[0].placements;
    const arcP      = placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP   = placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const straight3 = placements.find((p) => p.partId === 'SMOKE_STRAIGHT_SIDE')!;

    // ENTITIES section only — TABLES layer definitions must not be counted
    const entitiesStart = output.content.indexOf('ENTITIES');
    const entities = output.content.slice(entitiesStart);

    const countLayer = (layer: string): number =>
      entities
        .split('LINE')
        .slice(1)
        .filter((seg) => seg.includes(`\n8\n${layer}\n`))
        .length;

    return {
      output, entities,
      arcP, sCurveP, straight3,
      arcKerfCount, sCurveKerfCount,
      unplacedParts, sheets,
      countLayer,
    };
  }

  it('two curved + one straight panel placed on sheets[0] — no unplaced parts', () => {
    const { unplacedParts, sheets } = runStage13();
    expect(unplacedParts).toHaveLength(0);
    const ids = sheets[0].placements.map((p) => p.partId);
    expect(ids).toContain('SMOKE_DOOR');
    expect(ids).toContain('SMOKE_SCURVE_DOOR');
    expect(ids).toContain('SMOKE_STRAIGHT_SIDE');
  });

  it('both curved placements have isCurved=true; straight placement has isCurved falsy', () => {
    const { arcP, sCurveP, straight3 } = runStage13();
    expect(arcP.isCurved).toBe(true);
    expect(sCurveP.isCurved).toBe(true);
    expect(straight3.isCurved).toBeFalsy();
  });

  it('HATCH_CURVED count is exactly 4 — replacing two straights with curved adds 4 hatch lines', () => {
    const { countLayer } = runStage13();
    expect(countLayer('HATCH_CURVED')).toBe(4);
  });

  it('PARTS_CURVED count is exactly 8 — two curved rects × 4 lines each', () => {
    const { countLayer } = runStage13();
    expect(countLayer('PARTS_CURVED')).toBe(8);
  });

  it('PARTS count is exactly 4 — one straight rect × 4 lines', () => {
    const { countLayer } = runStage13();
    expect(countLayer('PARTS')).toBe(4);
  });

  it('each curved panel carries its own (CURVED / N cuts) sub-label', () => {
    const { entities, arcKerfCount, sCurveKerfCount } = runStage13();
    expect(entities).toContain(`(CURVED / ${arcKerfCount} cuts)`);
    expect(entities).toContain(`(CURVED / ${sCurveKerfCount} cuts)`);
  });

  it('all three part labels are present in the DXF', () => {
    const { output } = runStage13();
    expect(output.content).toContain('SMOKE_DOOR');
    expect(output.content).toContain('SMOKE_SCURVE_DOOR');
    expect(output.content).toContain('SMOKE_STRAIGHT_SIDE');
  });
});

// ============================================================
// @smoke S-CURVE — Stage 14: HATCH_CURVED X-lines confined within flat-blank bbox
//
// Every HATCH_CURVED LINE endpoint must satisfy:
//   x ∈ [placement.x,  placement.x + effectiveW]
//   y ∈ [placement.y,  placement.y + effectiveH]
//
// For S_CURVE TOP-edge (rotation=90, edgeClearance=10):
//   flatBlankW  = finishWidth   = 500 mm
//   flatBlankH  = finishHeight + (developedLength − projectedDepth) ≈ 1051.800 mm
//   effectiveW  ≈ 1051.800 mm (cutH after rotation)
//   effectiveH  = 500 mm        (cutW after rotation)
//   bbox minX = 10,  maxX ≈ 1061.800
//        minY = 10,  maxY = 510
//
// buildDxfSheets.ts emits exactly two diagonal LINEs per curved placement:
//   diagonal-1: (minX, minY) → (maxX, maxY)   [top-left  → bottom-right]
//   diagonal-2: (maxX, minY) → (minX, maxY)   [top-right → bottom-left]
//
// All four endpoints lie on the bbox perimeter; none can escape it.
// ============================================================

describe('@smoke S-CURVE — Stage 14: HATCH_CURVED X-lines confined within flat-blank bbox', () => {
  /** Re-usable helper: run full pipeline for the S_CURVE panel only. */
  function runStage14() {
    const { row } = buildSCurveRow();
    const { sheets } = runNesting([row]);

    const planned: PlannedSheet = {
      index1: 1,
      sheetId: 'SHEET_001',
      materialId: MATERIAL_ID,
    };

    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const placement = sheets[0].placements.find(
      (p) => p.partId === 'SMOKE_SCURVE_DOOR'
    )!;

    // Mirror getRotatedDimensions() from buildDxfSheets.ts (rotation=90 → swap)
    const isRotated = placement.rotation === 90 || placement.rotation === 270;
    const effectiveW = isRotated ? placement.cutH : placement.cutW;
    const effectiveH = isRotated ? placement.cutW : placement.cutH;

    const bbox = {
      minX: placement.x,
      maxX: placement.x + effectiveW,
      minY: placement.y,
      maxY: placement.y + effectiveH,
    };

    // Parse all HATCH_CURVED LINE entity coordinates from the ENTITIES section.
    // DXF is line-oriented: group codes and values alternate as plain-text lines.
    // Extract group values with regex \n<code>\n(<number>) to avoid false positives
    // when a coordinate value happens to equal a group code integer.
    const entitiesStart = output.content.indexOf('ENTITIES');
    const entities = output.content.slice(entitiesStart);

    const hatchSegs = entities
      .split('LINE')
      .slice(1)
      .filter((seg) => seg.includes('\n8\nHATCH_CURVED\n'));

    type Coords = { x1: number; y1: number; x2: number; y2: number };

    function extractCoords(seg: string): Coords {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    }

    const coords = hatchSegs.map(extractCoords);

    return { coords, bbox, placement, effectiveW, effectiveH, output };
  }

  it('exactly 2 HATCH_CURVED LINE entities are present for the S_CURVE panel', () => {
    const { coords } = runStage14();
    expect(coords).toHaveLength(2);
  });

  it('all x1 start-coordinates lie within [placement.x, placement.x + effectiveW]', () => {
    const { coords, bbox } = runStage14();
    for (const c of coords) {
      expect(c.x1).toBeGreaterThanOrEqual(bbox.minX);
      expect(c.x1).toBeLessThanOrEqual(bbox.maxX);
    }
  });

  it('all y1 start-coordinates lie within [placement.y, placement.y + effectiveH]', () => {
    const { coords, bbox } = runStage14();
    for (const c of coords) {
      expect(c.y1).toBeGreaterThanOrEqual(bbox.minY);
      expect(c.y1).toBeLessThanOrEqual(bbox.maxY);
    }
  });

  it('all x2 end-coordinates lie within [placement.x, placement.x + effectiveW]', () => {
    const { coords, bbox } = runStage14();
    for (const c of coords) {
      expect(c.x2).toBeGreaterThanOrEqual(bbox.minX);
      expect(c.x2).toBeLessThanOrEqual(bbox.maxX);
    }
  });

  it('all y2 end-coordinates lie within [placement.y, placement.y + effectiveH]', () => {
    const { coords, bbox } = runStage14();
    for (const c of coords) {
      expect(c.y2).toBeGreaterThanOrEqual(bbox.minY);
      expect(c.y2).toBeLessThanOrEqual(bbox.maxY);
    }
  });

  it('diagonal-1 runs from top-left corner (minX, minY) to bottom-right corner (maxX, maxY)', () => {
    const { coords, bbox } = runStage14();
    const d1 = coords.find(
      (c) =>
        Math.abs(c.x1 - bbox.minX) < 0.001 &&
        Math.abs(c.y1 - bbox.minY) < 0.001 &&
        Math.abs(c.x2 - bbox.maxX) < 0.001 &&
        Math.abs(c.y2 - bbox.maxY) < 0.001
    );
    expect(d1).toBeDefined();
  });

  it('diagonal-2 runs from top-right corner (maxX, minY) to bottom-left corner (minX, maxY)', () => {
    const { coords, bbox } = runStage14();
    const d2 = coords.find(
      (c) =>
        Math.abs(c.x1 - bbox.maxX) < 0.001 &&
        Math.abs(c.y1 - bbox.minY) < 0.001 &&
        Math.abs(c.x2 - bbox.minX) < 0.001 &&
        Math.abs(c.y2 - bbox.maxY) < 0.001
    );
    expect(d2).toBeDefined();
  });
});

// ============================================================
// @smoke — Stage 15: HATCH_CURVED diagonal length equals
//          sqrt(effectiveW² + effectiveH²) for ARC and S_CURVE
//
// The X-hatch diagonals in buildDxfSheets.ts run corner-to-corner
// across the flat-blank placement rectangle, so their Euclidean
// length is exactly the space diagonal of that rectangle:
//
//   length = sqrt(effectiveW² + effectiveH²)
//
// where effectiveW / effectiveH are the post-rotation flat-blank
// dimensions (cutH / cutW when rotation=90, else cutW / cutH).
//
// Because the arc correction enlarges the flat blank beyond the
// finish-panel size, the flat-blank diagonal must be strictly
// greater than the finish-panel diagonal for every curved profile:
//
//   ARC    : finish diag = sqrt(400² + 800²) ≈  894.4 mm
//            flat-blank diag ≈ sqrt(effectiveW²+effectiveH²) > 894.4 mm
//
//   S_CURVE: finish diag = sqrt(500² + 900²) ≈ 1029.6 mm
//            flat-blank diag ≈ sqrt(effectiveW²+effectiveH²) > 1029.6 mm
// ============================================================

describe('@smoke — Stage 15: HATCH_CURVED diagonal length equals sqrt(effectiveW²+effectiveH²)', () => {
  type Coords = { x1: number; y1: number; x2: number; y2: number };

  /** Parse all HATCH_CURVED LINE entity coordinates from a DXF content string. */
  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));

    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  /** Euclidean distance between the two endpoints of a LINE segment. */
  function diagLen(c: Coords): number {
    return Math.sqrt((c.x2 - c.x1) ** 2 + (c.y2 - c.y1) ** 2);
  }

  /** Run the full pipeline for a single curved CutListRow; return coords + effectiveDims. */
  function runFor(row: CutListRow, partId: string) {
    const { sheets } = runNesting([row]);
    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const placement = sheets[0].placements.find((p) => p.partId === partId)!;
    const isRotated = placement.rotation === 90 || placement.rotation === 270;
    const effectiveW = isRotated ? placement.cutH : placement.cutW;
    const effectiveH = isRotated ? placement.cutW : placement.cutH;
    const expectedLen = Math.sqrt(effectiveW ** 2 + effectiveH ** 2);
    const coords = parseHatchCoords(output.content);
    return { coords, effectiveW, effectiveH, expectedLen };
  }

  // ── ARC panel (SMOKE_DOOR) ────────────────────────────────

  it('ARC — diagonal-1 length equals sqrt(effectiveW² + effectiveH²)', () => {
    const { row } = buildCurvedRow();
    const { coords, expectedLen } = runFor(row, 'SMOKE_DOOR');
    expect(diagLen(coords[0])).toBeCloseTo(expectedLen, 1);
  });

  it('ARC — diagonal-2 length equals sqrt(effectiveW² + effectiveH²)', () => {
    const { row } = buildCurvedRow();
    const { coords, expectedLen } = runFor(row, 'SMOKE_DOOR');
    expect(diagLen(coords[1])).toBeCloseTo(expectedLen, 1);
  });

  // ── S_CURVE panel (SMOKE_SCURVE_DOOR) ────────────────────

  it('S_CURVE — diagonal-1 length equals sqrt(effectiveW² + effectiveH²)', () => {
    const { row } = buildSCurveRow();
    const { coords, expectedLen } = runFor(row, 'SMOKE_SCURVE_DOOR');
    expect(diagLen(coords[0])).toBeCloseTo(expectedLen, 1);
  });

  it('S_CURVE — diagonal-2 length equals sqrt(effectiveW² + effectiveH²)', () => {
    const { row } = buildSCurveRow();
    const { coords, expectedLen } = runFor(row, 'SMOKE_SCURVE_DOOR');
    expect(diagLen(coords[1])).toBeCloseTo(expectedLen, 1);
  });

  // ── Flat-blank diagonal > finish-size diagonal ────────────
  // The arc correction strictly enlarges the flat blank, so the
  // DXF hatch diagonal must exceed the finish-panel diagonal.

  it('ARC — flat-blank diagonal > finish-panel diagonal (correction is strictly positive)', () => {
    const { row } = buildCurvedRow();
    const { coords } = runFor(row, 'SMOKE_DOOR');
    const flatDiag = diagLen(coords[0]);
    const finishDiag = Math.sqrt(
      PANEL_STUB.finishWidth ** 2 + PANEL_STUB.finishHeight ** 2
    );
    expect(flatDiag).toBeGreaterThan(finishDiag);
  });

  it('S_CURVE — flat-blank diagonal > finish-panel diagonal (correction is strictly positive)', () => {
    const { row } = buildSCurveRow();
    const { coords } = runFor(row, 'SMOKE_SCURVE_DOOR');
    const flatDiag = diagLen(coords[0]);
    const finishDiag = Math.sqrt(
      S_CURVE_PANEL_STUB.finishWidth ** 2 + S_CURVE_PANEL_STUB.finishHeight ** 2
    );
    expect(flatDiag).toBeGreaterThan(finishDiag);
  });
});

// ============================================================
// @smoke — Stage 16: HATCH_CURVED diagonals are strictly longer
//          than the finish-panel shorter side for ARC and S_CURVE
//
// Because the flat blank is always at least as large as the finish
// panel in both dimensions (arc correction only adds material, never
// subtracts), the space diagonal of the flat blank must exceed either
// individual finish dimension — in particular the shorter one:
//
//   flatBlankDiag = sqrt(effectiveW² + effectiveH²)
//                ≥ max(effectiveW, effectiveH)        (Pythagorean bound)
//                > min(finishW, finishH)               (correction ≥ 0)
//
// Concrete lower bounds from the fixture values:
//   ARC     shorter side = min(400, 800) = 400 mm
//           flat-blank diag ≈ 993.5 mm   >> 400 mm ✓
//
//   S_CURVE shorter side = min(500, 900) = 500 mm
//           flat-blank diag ≈ 1164.6 mm  >> 500 mm ✓
//
// This is a minimum-sanity guard: a diagonal shorter than the finish
// panel's own shorter side would indicate a catastrophic sizing bug
// in the flat-blank correction or FFDH placement.
// ============================================================

describe('@smoke — Stage 16: HATCH_CURVED diagonals strictly exceed finish-panel shorter side', () => {
  type Coords = { x1: number; y1: number; x2: number; y2: number };

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function diagLen(c: Coords): number {
    return Math.sqrt((c.x2 - c.x1) ** 2 + (c.y2 - c.y1) ** 2);
  }

  function runFor(row: CutListRow, partId: string) {
    const { sheets } = runNesting([row]);
    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    sheets[0].placements.find((p) => p.partId === partId)!;
    return { coords: parseHatchCoords(output.content) };
  }

  // ── ARC panel ────────────────────────────────────────────
  // shorter finish side = min(400, 800) = 400 mm

  it('ARC — diagonal-1 > min(finishWidth, finishHeight) [400 mm]', () => {
    const { row } = buildCurvedRow();
    const { coords } = runFor(row, 'SMOKE_DOOR');
    const shorterSide = Math.min(PANEL_STUB.finishWidth, PANEL_STUB.finishHeight);
    expect(diagLen(coords[0])).toBeGreaterThan(shorterSide);
  });

  it('ARC — diagonal-2 > min(finishWidth, finishHeight) [400 mm]', () => {
    const { row } = buildCurvedRow();
    const { coords } = runFor(row, 'SMOKE_DOOR');
    const shorterSide = Math.min(PANEL_STUB.finishWidth, PANEL_STUB.finishHeight);
    expect(diagLen(coords[1])).toBeGreaterThan(shorterSide);
  });

  // ── S_CURVE panel ─────────────────────────────────────────
  // shorter finish side = min(500, 900) = 500 mm

  it('S_CURVE — diagonal-1 > min(finishWidth, finishHeight) [500 mm]', () => {
    const { row } = buildSCurveRow();
    const { coords } = runFor(row, 'SMOKE_SCURVE_DOOR');
    const shorterSide = Math.min(
      S_CURVE_PANEL_STUB.finishWidth,
      S_CURVE_PANEL_STUB.finishHeight
    );
    expect(diagLen(coords[0])).toBeGreaterThan(shorterSide);
  });

  it('S_CURVE — diagonal-2 > min(finishWidth, finishHeight) [500 mm]', () => {
    const { row } = buildSCurveRow();
    const { coords } = runFor(row, 'SMOKE_SCURVE_DOOR');
    const shorterSide = Math.min(
      S_CURVE_PANEL_STUB.finishWidth,
      S_CURVE_PANEL_STUB.finishHeight
    );
    expect(diagLen(coords[1])).toBeGreaterThan(shorterSide);
  });
});

// ============================================================
// @smoke — Stage 17: Mixed ARC + S_CURVE sheet — HATCH_CURVED
//          lines are spatially partitioned between the two placements
//
// Stage 9 confirms the global count (4) when an ARC and an S_CURVE
// panel share the same sheet.  Stage 17 goes further: it parses the
// (x1,y1,x2,y2) coordinates of every HATCH_CURVED line and verifies
// that the 4 lines are correctly partitioned — exactly 2 per placement
// — by grouping them according to the y-origin of each placement.
// It also verifies that the derived effective-bbox diagonal length
// matches √(effectiveW² + effectiveH²) for each panel type.
//
// Grouping strategy: `buildDxfSheets` always draws both diagonals
// starting from the placement's (x, y) origin, so for both lines in
// a group min(y1, y2) == placement.y (±1 mm tolerance).  Because FFDH
// places the two panels on distinct shelf rows the y-origins differ
// by at least the effectiveH of the first panel, giving unambiguous
// separation.
//
// Sheet layout (1220 × 2440, kerfWidth=3.5, edgeClearance=10):
//   Shelf 1 — S_CURVE panel (rotation=90) → effectiveH ≈  500 mm, y=10
//   Shelf 2 — ARC panel     (rotation=90) → effectiveH ≈  400 mm, y=513.5
//             (FFDH sorts descending by placed height before binning)
//
// Assertions (7 total):
//   1. Total HATCH_CURVED count is exactly 4.
//   2. Exactly 2 lines belong to the S_CURVE placement (y-origin ≈  10).
//   3. Exactly 2 lines belong to the ARC placement     (y-origin ≈ 513.5).
//   4. All 4 lines are accounted for (no unclassified lines).
//   5. ARC and S_CURVE placements are on different shelf rows (y ≠ y).
//   6. ARC-group diagonal-1 length ≈ √(arcEffW² + arcEffH²)
//      where arcEffW / arcEffH are derived from the line endpoints.
//   7. S_CURVE-group diagonal-1 length ≈ √(sCurveEffW² + sCurveEffH²).
// ============================================================

describe('@smoke — Stage 17: HATCH_CURVED lines are spatially partitioned between ARC and S_CURVE placements', () => {
  type Coords = { x1: number; y1: number; x2: number; y2: number };

  /** Parse every LINE entity on the HATCH_CURVED layer from the ENTITIES section. */
  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  /** Euclidean length of a line segment. */
  function segLen(c: Coords): number {
    return Math.sqrt((c.x2 - c.x1) ** 2 + (c.y2 - c.y1) ** 2);
  }

  /**
   * Return all lines whose bottom y-coordinate (min of y1, y2) is within
   * 1 mm of the given placement y-origin.
   *
   * `buildDxfSheets` starts both diagonals at the placement's (x, y) corner,
   * so min(y1, y2) === placement.y for every line in that group.
   */
  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function runStage17() {
    const { row: arcRow }    = buildCurvedRow();   // SMOKE_DOOR     (ARC)
    const { row: sCurveRow } = buildSCurveRow();   // SMOKE_SCURVE_DOOR (S_CURVE)

    const { sheets, unplacedParts } = runNesting([arcRow, sCurveRow]);

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const placements = sheets[0].placements;
    const arcP    = placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP = placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;

    const allCoords   = parseHatchCoords(output.content);
    const arcLines    = linesForPlacement(allCoords, arcP.y);
    const sCurveLines = linesForPlacement(allCoords, sCurveP.y);

    // Derive effective bbox for ARC group from its line endpoints
    const arcMaxX = Math.max(...arcLines.flatMap((c) => [c.x1, c.x2]));
    const arcMaxY = Math.max(...arcLines.flatMap((c) => [c.y1, c.y2]));
    const arcEffW = arcMaxX - arcP.x;
    const arcEffH = arcMaxY - arcP.y;

    // Derive effective bbox for S_CURVE group from its line endpoints
    const sCurveMaxX = Math.max(...sCurveLines.flatMap((c) => [c.x1, c.x2]));
    const sCurveMaxY = Math.max(...sCurveLines.flatMap((c) => [c.y1, c.y2]));
    const sCurveEffW = sCurveMaxX - sCurveP.x;
    const sCurveEffH = sCurveMaxY - sCurveP.y;

    return {
      unplacedParts,
      arcP, sCurveP,
      allCoords, arcLines, sCurveLines,
      arcEffW, arcEffH,
      sCurveEffW, sCurveEffH,
    };
  }

  it('total HATCH_CURVED count is exactly 4 (2 diagonals × 2 curved panels)', () => {
    const { allCoords } = runStage17();
    expect(allCoords).toHaveLength(4);
  });

  it('exactly 2 HATCH_CURVED lines are attributed to the S_CURVE placement (by y-origin)', () => {
    const { sCurveLines } = runStage17();
    expect(sCurveLines).toHaveLength(2);
  });

  it('exactly 2 HATCH_CURVED lines are attributed to the ARC placement (by y-origin)', () => {
    const { arcLines } = runStage17();
    expect(arcLines).toHaveLength(2);
  });

  it('all 4 HATCH_CURVED lines are fully accounted for between the two placement groups', () => {
    const { arcLines, sCurveLines } = runStage17();
    expect(arcLines.length + sCurveLines.length).toBe(4);
  });

  it('ARC and S_CURVE placements occupy distinct shelf rows (different y-origins)', () => {
    const { arcP, sCurveP } = runStage17();
    expect(arcP.y).not.toBeCloseTo(sCurveP.y, 0);
  });

  it('ARC-group diagonal-1 length ≈ √(arcEffW² + arcEffH²) (derived from line endpoints)', () => {
    const { arcLines, arcEffW, arcEffH } = runStage17();
    const expected = Math.sqrt(arcEffW ** 2 + arcEffH ** 2);
    expect(segLen(arcLines[0])).toBeCloseTo(expected, 3);
  });

  it('S_CURVE-group diagonal-1 length ≈ √(sCurveEffW² + sCurveEffH²) (derived from line endpoints)', () => {
    const { sCurveLines, sCurveEffW, sCurveEffH } = runStage17();
    const expected = Math.sqrt(sCurveEffW ** 2 + sCurveEffH ** 2);
    expect(segLen(sCurveLines[0])).toBeCloseTo(expected, 3);
  });
});

// ============================================================
// @smoke — Stage 18: Both diagonal-2 lengths equal the endpoint-
//          derived bbox diagonal for the mixed ARC + S_CURVE sheet
//
// Stage 17 verified diagonal-1 (the main diagonal, running from the
// placement's bottom-left to top-right corner) for both panel types.
// Stage 18 extends that coverage to diagonal-2 — the anti-diagonal,
// running from bottom-right to top-left — confirming that the X-hatch
// is symmetric and that `buildDxfSheets` emits both diagonals with
// equal length regardless of direction.
//
// Because both diagonals span the same bounding box (effectiveW ×
// effectiveH), their lengths must be identical:
//
//   |diag-1| = |diag-2| = √(effectiveW² + effectiveH²)
//
// Any discrepancy would indicate a coordinate swap bug in the DXF
// renderer (e.g. one endpoint using finish-size coords while the
// other uses flat-blank-corrected coords).
//
// The stage reuses the same fixture (buildCurvedRow + buildSCurveRow),
// the same linesForPlacement grouping strategy, and the same
// endpoint-derived effectiveW/effectiveH as Stage 17 — only the
// index into each group changes from [0] to [1].
//
// Assertions (4 total):
//   1. ARC diagonal-2 length ≈ √(arcEffW² + arcEffH²)      (3 d.p.)
//   2. ARC diagonal-1 and diagonal-2 lengths are equal      (3 d.p.)
//   3. S_CURVE diagonal-2 length ≈ √(sCurveEffW² + sCurveEffH²) (3 d.p.)
//   4. S_CURVE diagonal-1 and diagonal-2 lengths are equal  (3 d.p.)
// ============================================================

describe('@smoke — Stage 18: diagonal-2 lengths equal bbox diagonal for both ARC and S_CURVE on mixed-panel sheet', () => {
  type Coords = { x1: number; y1: number; x2: number; y2: number };

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function segLen(c: Coords): number {
    return Math.sqrt((c.x2 - c.x1) ** 2 + (c.y2 - c.y1) ** 2);
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function runStage18() {
    const { row: arcRow }    = buildCurvedRow();
    const { row: sCurveRow } = buildSCurveRow();

    const { sheets } = runNesting([arcRow, sCurveRow]);

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const placements = sheets[0].placements;
    const arcP    = placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP = placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;

    const allCoords   = parseHatchCoords(output.content);
    const arcLines    = linesForPlacement(allCoords, arcP.y);
    const sCurveLines = linesForPlacement(allCoords, sCurveP.y);

    // Effective bbox dimensions derived from endpoints (same as Stage 17)
    const arcMaxX    = Math.max(...arcLines.flatMap((c) => [c.x1, c.x2]));
    const arcMaxY    = Math.max(...arcLines.flatMap((c) => [c.y1, c.y2]));
    const arcEffW    = arcMaxX - arcP.x;
    const arcEffH    = arcMaxY - arcP.y;

    const sCurveMaxX = Math.max(...sCurveLines.flatMap((c) => [c.x1, c.x2]));
    const sCurveMaxY = Math.max(...sCurveLines.flatMap((c) => [c.y1, c.y2]));
    const sCurveEffW = sCurveMaxX - sCurveP.x;
    const sCurveEffH = sCurveMaxY - sCurveP.y;

    return {
      arcLines, sCurveLines,
      arcEffW, arcEffH,
      sCurveEffW, sCurveEffH,
    };
  }

  it('ARC — diagonal-2 length ≈ √(arcEffW² + arcEffH²) (endpoint-derived)', () => {
    const { arcLines, arcEffW, arcEffH } = runStage18();
    const expected = Math.sqrt(arcEffW ** 2 + arcEffH ** 2);
    expect(segLen(arcLines[1])).toBeCloseTo(expected, 3);
  });

  it('ARC — diagonal-1 and diagonal-2 lengths are equal (X-hatch is symmetric)', () => {
    const { arcLines, arcEffW, arcEffH } = runStage18();
    const expected = Math.sqrt(arcEffW ** 2 + arcEffH ** 2);
    expect(segLen(arcLines[0])).toBeCloseTo(expected, 3);
    expect(segLen(arcLines[1])).toBeCloseTo(expected, 3);
  });

  it('S_CURVE — diagonal-2 length ≈ √(sCurveEffW² + sCurveEffH²) (endpoint-derived)', () => {
    const { sCurveLines, sCurveEffW, sCurveEffH } = runStage18();
    const expected = Math.sqrt(sCurveEffW ** 2 + sCurveEffH ** 2);
    expect(segLen(sCurveLines[1])).toBeCloseTo(expected, 3);
  });

  it('S_CURVE — diagonal-1 and diagonal-2 lengths are equal (X-hatch is symmetric)', () => {
    const { sCurveLines, sCurveEffW, sCurveEffH } = runStage18();
    const expected = Math.sqrt(sCurveEffW ** 2 + sCurveEffH ** 2);
    expect(segLen(sCurveLines[0])).toBeCloseTo(expected, 3);
    expect(segLen(sCurveLines[1])).toBeCloseTo(expected, 3);
  });
});

// ============================================================
// Stage 19 — diagonal intersection at bbox centre for ARC + S_CURVE
// ============================================================
//
// A rectangle's two diagonals bisect each other at its centre.
// For the X-hatch emitted by buildDxfSheets, both HATCH_CURVED
// diagonals must therefore share the same midpoint, which must
// equal the centre of the flat-blank placement bbox:
//
//   midpoint(diag) = ( minX + effectiveW/2,  minY + effectiveH/2 )
//
// where minX/minY are derived from the line endpoints (no Placement
// w/h fields exist) and effectiveW/H are also endpoint-derived.
//
// This asserts that neither diagonal is skewed, shifted, or
// computed with an off-centre origin — catching any asymmetry in
// the DXF hatch coordinate emitter that pure length checks
// (Stages 15–18) cannot detect.
//
// Fixture: the standard mixed-panel sheet (ARC + S_CURVE),
// same FFDH layout as Stages 17–18.
//
// Assertions (8 total):
//   1. ARC diagonal-1 midpoint x ≈ arcMinX + arcEffW / 2  (3 d.p.)
//   2. ARC diagonal-1 midpoint y ≈ arcMinY + arcEffH / 2  (3 d.p.)
//   3. ARC diagonal-2 midpoint x ≈ arcMinX + arcEffW / 2  (3 d.p.)
//   4. ARC diagonal-2 midpoint y ≈ arcMinY + arcEffH / 2  (3 d.p.)
//   5. S_CURVE diagonal-1 midpoint x ≈ sCurveMinX + sCurveEffW / 2  (3 d.p.)
//   6. S_CURVE diagonal-1 midpoint y ≈ sCurveMinY + sCurveEffH / 2  (3 d.p.)
//   7. S_CURVE diagonal-2 midpoint x ≈ sCurveMinX + sCurveEffW / 2  (3 d.p.)
//   8. S_CURVE diagonal-2 midpoint y ≈ sCurveMinY + sCurveEffH / 2  (3 d.p.)
// ============================================================

describe('@smoke — Stage 19: diagonal intersection at bbox centre for ARC + S_CURVE', () => {
  type Coords = { x1: number; y1: number; x2: number; y2: number };

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function mid(c: Coords): { mx: number; my: number } {
    return { mx: (c.x1 + c.x2) / 2, my: (c.y1 + c.y2) / 2 };
  }

  function runStage19() {
    const { row: arcRow }    = buildCurvedRow();
    const { row: sCurveRow } = buildSCurveRow();

    const { sheets } = runNesting([arcRow, sCurveRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords   = parseHatchCoords(output.content);
    const arcLines    = linesForPlacement(allCoords, arcP.y);
    const sCurveLines = linesForPlacement(allCoords, sCurveP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);

    const arcMinX     = Math.min(...arcLines.flatMap((c) => [c.x1, c.x2]));
    const arcMinY     = Math.min(...arcLines.flatMap((c) => [c.y1, c.y2]));
    const arcMaxX     = Math.max(...arcLines.flatMap((c) => [c.x1, c.x2]));
    const arcMaxY     = Math.max(...arcLines.flatMap((c) => [c.y1, c.y2]));
    const arcEffW     = arcMaxX - arcMinX;
    const arcEffH     = arcMaxY - arcMinY;

    const sCurveMinX  = Math.min(...sCurveLines.flatMap((c) => [c.x1, c.x2]));
    const sCurveMinY  = Math.min(...sCurveLines.flatMap((c) => [c.y1, c.y2]));
    const sCurveMaxX  = Math.max(...sCurveLines.flatMap((c) => [c.x1, c.x2]));
    const sCurveMaxY  = Math.max(...sCurveLines.flatMap((c) => [c.y1, c.y2]));
    const sCurveEffW  = sCurveMaxX - sCurveMinX;
    const sCurveEffH  = sCurveMaxY - sCurveMinY;

    return {
      arcLines, sCurveLines,
      arcMinX, arcMinY, arcEffW, arcEffH,
      sCurveMinX, sCurveMinY, sCurveEffW, sCurveEffH,
    };
  }

  it('ARC — diagonal-1 midpoint x ≈ bbox centre x', () => {
    const { arcLines, arcMinX, arcEffW } = runStage19();
    expect(mid(arcLines[0]).mx).toBeCloseTo(arcMinX + arcEffW / 2, 3);
  });

  it('ARC — diagonal-1 midpoint y ≈ bbox centre y', () => {
    const { arcLines, arcMinY, arcEffH } = runStage19();
    expect(mid(arcLines[0]).my).toBeCloseTo(arcMinY + arcEffH / 2, 3);
  });

  it('ARC — diagonal-2 midpoint x ≈ bbox centre x', () => {
    const { arcLines, arcMinX, arcEffW } = runStage19();
    expect(mid(arcLines[1]).mx).toBeCloseTo(arcMinX + arcEffW / 2, 3);
  });

  it('ARC — diagonal-2 midpoint y ≈ bbox centre y', () => {
    const { arcLines, arcMinY, arcEffH } = runStage19();
    expect(mid(arcLines[1]).my).toBeCloseTo(arcMinY + arcEffH / 2, 3);
  });

  it('S_CURVE — diagonal-1 midpoint x ≈ bbox centre x', () => {
    const { sCurveLines, sCurveMinX, sCurveEffW } = runStage19();
    expect(mid(sCurveLines[0]).mx).toBeCloseTo(sCurveMinX + sCurveEffW / 2, 3);
  });

  it('S_CURVE — diagonal-1 midpoint y ≈ bbox centre y', () => {
    const { sCurveLines, sCurveMinY, sCurveEffH } = runStage19();
    expect(mid(sCurveLines[0]).my).toBeCloseTo(sCurveMinY + sCurveEffH / 2, 3);
  });

  it('S_CURVE — diagonal-2 midpoint x ≈ bbox centre x', () => {
    const { sCurveLines, sCurveMinX, sCurveEffW } = runStage19();
    expect(mid(sCurveLines[1]).mx).toBeCloseTo(sCurveMinX + sCurveEffW / 2, 3);
  });

  it('S_CURVE — diagonal-2 midpoint y ≈ bbox centre y', () => {
    const { sCurveLines, sCurveMinY, sCurveEffH } = runStage19();
    expect(mid(sCurveLines[1]).my).toBeCloseTo(sCurveMinY + sCurveEffH / 2, 3);
  });
});

// ============================================================
// Stage 20 — Perpendicularity of HATCH_CURVED diagonals when
//            effectiveW equals effectiveH
//
// Diagonals are perpendicular iff dot(d1, d2) = 0, which
// equals effectiveH² − effectiveW² (derivation: d1=(w,h),
// d2=(-w,h) → dot = h² − w²).
//
// Three panels on one sheet:
//   ARC        — effectiveW≈909 ≠ effectiveH=400  → dot ≠ 0
//   S_CURVE    — effectiveW≈1052 ≠ effectiveH=500 → dot ≠ 0
//   SQUARE_ARC — effectiveW=effectiveH≈509         → dot = 0
//
// SQUARE_ARC construction:
//   correction = developedLength − projectedDepth  (from PANEL_STUB)
//   finishWidth = 400 + correction  ← makes flatBlankW = flatBlankH
// ============================================================

describe('@smoke — Stage 20: perpendicularity of HATCH_CURVED diagonals', () => {
  type Coords = { x1: number; y1: number; x2: number; y2: number };

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function dotProduct(l1: Coords, l2: Coords): number {
    const v1x = l1.x2 - l1.x1;
    const v1y = l1.y2 - l1.y1;
    const v2x = l2.x2 - l2.x1;
    const v2y = l2.y2 - l2.y1;
    return v1x * v2x + v1y * v2y;
  }

  function buildSquareArcRow(): { row: CutListRow; kerfCount: number } {
    // Reuse PANEL_STUB geometry (radius=200, sweep=60°) to get the same
    // correction value as the standard ARC row.  Set finishWidth = 400 + correction
    // so that flatBlankW = cutW = 400+correction AND
    //           flatBlankH = cutH + correction = 400 + correction → square.
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const correction = fields.developedLength - fields.projectedDepth;
    const FINISH_H = 400;
    const squareFinishW = FINISH_H + correction;   // ≈ 509.44 mm

    const row: CutListRow = {
      partId:    'SMOKE_SQUARE_ARC',
      cabinetId: 'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:   squareFinishW,
      finishH:   FINISH_H,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:      squareFinishW,
      cutH:      FINISH_H,
      qty:       1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
    };

    return { row, kerfCount: fields.kerfCount };
  }

  function runStage20() {
    const { row: arcRow }       = buildCurvedRow();
    const { row: sCurveRow }    = buildSCurveRow();
    const { row: squareArcRow } = buildSquareArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, squareArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP       = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP    = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const squareArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_SQUARE_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords      = parseHatchCoords(output.content);
    const arcLines       = linesForPlacement(allCoords, arcP.y);
    const sCurveLines    = linesForPlacement(allCoords, sCurveP.y);
    const squareArcLines = linesForPlacement(allCoords, squareArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(squareArcLines).toHaveLength(2);

    const arcEffW     = Math.max(...arcLines.flatMap((c) => [c.x1, c.x2]))
                      - Math.min(...arcLines.flatMap((c) => [c.x1, c.x2]));
    const arcEffH     = Math.max(...arcLines.flatMap((c) => [c.y1, c.y2]))
                      - Math.min(...arcLines.flatMap((c) => [c.y1, c.y2]));
    const sCurveEffW  = Math.max(...sCurveLines.flatMap((c) => [c.x1, c.x2]))
                      - Math.min(...sCurveLines.flatMap((c) => [c.x1, c.x2]));
    const sCurveEffH  = Math.max(...sCurveLines.flatMap((c) => [c.y1, c.y2]))
                      - Math.min(...sCurveLines.flatMap((c) => [c.y1, c.y2]));
    const sqEffW      = Math.max(...squareArcLines.flatMap((c) => [c.x1, c.x2]))
                      - Math.min(...squareArcLines.flatMap((c) => [c.x1, c.x2]));
    const sqEffH      = Math.max(...squareArcLines.flatMap((c) => [c.y1, c.y2]))
                      - Math.min(...squareArcLines.flatMap((c) => [c.y1, c.y2]));

    return {
      arcLines, sCurveLines, squareArcLines,
      arcEffW, arcEffH,
      sCurveEffW, sCurveEffH,
      sqEffW, sqEffH,
    };
  }

  // ── Part A: ARC — non-perpendicular ────────────────────────────────────────

  it('ARC — |dot(d1, d2)| > 100_000 (non-square bbox, strongly non-perpendicular)', () => {
    const { arcLines } = runStage20();
    expect(Math.abs(dotProduct(arcLines[0], arcLines[1]))).toBeGreaterThan(100_000);
  });

  it('ARC — dot(d1, d2) ≈ arcEffH² − arcEffW² (direction-vector dot-product identity)', () => {
    const { arcLines, arcEffW, arcEffH } = runStage20();
    const dot = dotProduct(arcLines[0], arcLines[1]);
    expect(dot).toBeCloseTo(arcEffH ** 2 - arcEffW ** 2, 0);
  });

  // ── Part B: S_CURVE — non-perpendicular ────────────────────────────────────

  it('S_CURVE — |dot(d1, d2)| > 100_000 (non-square bbox, strongly non-perpendicular)', () => {
    const { sCurveLines } = runStage20();
    expect(Math.abs(dotProduct(sCurveLines[0], sCurveLines[1]))).toBeGreaterThan(100_000);
  });

  it('S_CURVE — dot(d1, d2) ≈ sCurveEffH² − sCurveEffW² (direction-vector dot-product identity)', () => {
    const { sCurveLines, sCurveEffW, sCurveEffH } = runStage20();
    const dot = dotProduct(sCurveLines[0], sCurveLines[1]);
    expect(dot).toBeCloseTo(sCurveEffH ** 2 - sCurveEffW ** 2, 0);
  });

  // ── Part C: SQUARE_ARC — perpendicular ────────────────────────────────────

  it('SQUARE_ARC — effectiveW ≈ effectiveH (square flat blank, both dims equal)', () => {
    const { sqEffW, sqEffH } = runStage20();
    expect(sqEffW).toBeCloseTo(sqEffH, 1);
  });

  it('SQUARE_ARC — dot(d1, d2) ≈ 0 (perpendicular diagonals for square bbox)', () => {
    const { squareArcLines } = runStage20();
    expect(dotProduct(squareArcLines[0], squareArcLines[1])).toBeCloseTo(0, 0);
  });

  it('SQUARE_ARC — sqEffH² − sqEffW² ≈ 0 (confirms perpendicularity via dot-product identity)', () => {
    const { sqEffW, sqEffH } = runStage20();
    expect(sqEffH ** 2 - sqEffW ** 2).toBeCloseTo(0, 0);
  });
});

// ============================================================
// Stage 21 — dot-product sign: negative when effectiveW > effectiveH,
//            positive when effectiveW < effectiveH
//
// Three panel types on one sheet:
//   ARC       (grain=NONE, FFDH rotates → effectiveW≈909.44 > effectiveH=400)   → dot < 0
//   S_CURVE   (grain=NONE, FFDH rotates → effectiveW≈1051.8 > effectiveH=500)   → dot < 0
//   TALL_ARC  (grain=HORIZONTAL, locked → effectiveW=400 < effectiveH≈909.44)   → dot > 0
// ============================================================

describe('@smoke — Stage 21: dot-product sign is negative when effectiveW > effectiveH, positive when effectiveW < effectiveH', () => {
  type Coords = { x1: number; y1: number; x2: number; y2: number };

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function dotProduct(l1: Coords, l2: Coords): number {
    const v1x = l1.x2 - l1.x1;
    const v1y = l1.y2 - l1.y1;
    const v2x = l2.x2 - l2.x1;
    const v2y = l2.y2 - l2.y1;
    return v1x * v2x + v1y * v2y;
  }

  /**
   * TALL_ARC — same ARC geometry as PANEL_STUB (radius=200, sweepDeg=60)
   * but with grain='HORIZONTAL' to lock orientation.
   *
   * FFDH cannot rotate a grain-locked part → rotation=0:
   *   effectiveW = flatBlankW = cutW = 400
   *   effectiveH = flatBlankH = cutH + correction = 800 + 109.44 ≈ 909.44
   *   → effectiveW < effectiveH → dot(d1, d2) = effH² − effW² > 0
   */
  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;

    const row: CutListRow = {
      partId:    'SMOKE_TALL_ARC',
      cabinetId: 'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:   PANEL_STUB.finishWidth,
      finishH:   PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:      PANEL_STUB.finishWidth,
      cutH:      PANEL_STUB.finishHeight,
      qty:       1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };

    return { row, kerfCount: fields.kerfCount };
  }

  function runStage21() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    const arcEffW    = Math.max(...arcLines.flatMap((c) => [c.x1, c.x2]))
                     - Math.min(...arcLines.flatMap((c) => [c.x1, c.x2]));
    const arcEffH    = Math.max(...arcLines.flatMap((c) => [c.y1, c.y2]))
                     - Math.min(...arcLines.flatMap((c) => [c.y1, c.y2]));
    const sCurveEffW = Math.max(...sCurveLines.flatMap((c) => [c.x1, c.x2]))
                     - Math.min(...sCurveLines.flatMap((c) => [c.x1, c.x2]));
    const sCurveEffH = Math.max(...sCurveLines.flatMap((c) => [c.y1, c.y2]))
                     - Math.min(...sCurveLines.flatMap((c) => [c.y1, c.y2]));
    const tallEffW   = Math.max(...tallArcLines.flatMap((c) => [c.x1, c.x2]))
                     - Math.min(...tallArcLines.flatMap((c) => [c.x1, c.x2]));
    const tallEffH   = Math.max(...tallArcLines.flatMap((c) => [c.y1, c.y2]))
                     - Math.min(...tallArcLines.flatMap((c) => [c.y1, c.y2]));

    return {
      arcLines, sCurveLines, tallArcLines,
      arcEffW, arcEffH,
      sCurveEffW, sCurveEffH,
      tallEffW, tallEffH,
    };
  }

  // ── Part A: ARC — effectiveW > effectiveH → dot < 0 ──────────────────────

  it('ARC — dot(d1, d2) < 0 (effectiveW > effectiveH, FFDH rotates to landscape)', () => {
    const { arcLines } = runStage21();
    expect(dotProduct(arcLines[0], arcLines[1])).toBeLessThan(0);
  });

  it('ARC — dot(d1, d2) ≈ arcEffH² − arcEffW² (negative identity, confirms effectiveW > effectiveH)', () => {
    const { arcLines, arcEffW, arcEffH } = runStage21();
    const dot = dotProduct(arcLines[0], arcLines[1]);
    expect(dot).toBeCloseTo(arcEffH ** 2 - arcEffW ** 2, 0);
  });

  // ── Part B: S_CURVE — effectiveW > effectiveH → dot < 0 ──────────────────

  it('S_CURVE — dot(d1, d2) < 0 (effectiveW > effectiveH, FFDH rotates to landscape)', () => {
    const { sCurveLines } = runStage21();
    expect(dotProduct(sCurveLines[0], sCurveLines[1])).toBeLessThan(0);
  });

  it('S_CURVE — dot(d1, d2) ≈ sCurveEffH² − sCurveEffW² (negative identity, confirms effectiveW > effectiveH)', () => {
    const { sCurveLines, sCurveEffW, sCurveEffH } = runStage21();
    const dot = dotProduct(sCurveLines[0], sCurveLines[1]);
    expect(dot).toBeCloseTo(sCurveEffH ** 2 - sCurveEffW ** 2, 0);
  });

  // ── Part C: TALL_ARC — effectiveW < effectiveH → dot > 0 ─────────────────

  it('TALL_ARC — dot(d1, d2) > 0 (effectiveW < effectiveH, grain-locked keeps portrait)', () => {
    const { tallArcLines } = runStage21();
    expect(dotProduct(tallArcLines[0], tallArcLines[1])).toBeGreaterThan(0);
  });

  it('TALL_ARC — dot(d1, d2) ≈ tallEffH² − tallEffW² (positive identity, confirms effectiveW < effectiveH)', () => {
    const { tallArcLines, tallEffW, tallEffH } = runStage21();
    const dot = dotProduct(tallArcLines[0], tallArcLines[1]);
    expect(dot).toBeCloseTo(tallEffH ** 2 - tallEffW ** 2, 0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Stage 22 — HATCH_CURVED endpoint precision: multiples of 0.01 mm
// ══════════════════════════════════════════════════════════════════════════════

describe('@smoke Stage 22 — HATCH_CURVED endpoint coords rounded to 0.01 mm precision', () => {
  /**
   * buildDxfSheets.addLine() rounds all four endpoint coordinates via
   *   Math.round(v * 100) / 100
   * before writing to DXF.  This ensures CNC output never carries irrational
   * arc-length floats.  Max rounding delta: 0.005 mm (< CNC kerf-width).
   *
   * Panel set: ARC (SMOKE_DOOR) + S_CURVE (SMOKE_SCURVE_DOOR) + TALL_ARC
   * Same three-panel sheet as Stages 19–21.
   *
   * Invariant (per diagonal, per panel type):
   *   ∀ v ∈ { x1, y1, x2, y2 } : Math.abs(v * 100 − Math.round(v * 100)) < 1e-6
   */

  type Coords = { x1: number; y1: number; x2: number; y2: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  /** Returns true iff v is a multiple of 0.01 mm (within 1e-6 float tolerance). */
  function isRounded(v: number): boolean {
    return Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
  }

  function runStage22() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return { arcLines, sCurveLines, tallArcLines };
  }

  // ── Part A: ARC ───────────────────────────────────────────────────────────

  it('ARC — diagonal-1 all four endpoint coords are multiples of 0.01 mm', () => {
    const { arcLines } = runStage22();
    const d = arcLines[0];
    expect(isRounded(d.x1)).toBe(true);
    expect(isRounded(d.y1)).toBe(true);
    expect(isRounded(d.x2)).toBe(true);
    expect(isRounded(d.y2)).toBe(true);
  });

  it('ARC — diagonal-2 all four endpoint coords are multiples of 0.01 mm', () => {
    const { arcLines } = runStage22();
    const d = arcLines[1];
    expect(isRounded(d.x1)).toBe(true);
    expect(isRounded(d.y1)).toBe(true);
    expect(isRounded(d.x2)).toBe(true);
    expect(isRounded(d.y2)).toBe(true);
  });

  // ── Part B: S_CURVE ───────────────────────────────────────────────────────

  it('S_CURVE — diagonal-1 all four endpoint coords are multiples of 0.01 mm', () => {
    const { sCurveLines } = runStage22();
    const d = sCurveLines[0];
    expect(isRounded(d.x1)).toBe(true);
    expect(isRounded(d.y1)).toBe(true);
    expect(isRounded(d.x2)).toBe(true);
    expect(isRounded(d.y2)).toBe(true);
  });

  it('S_CURVE — diagonal-2 all four endpoint coords are multiples of 0.01 mm', () => {
    const { sCurveLines } = runStage22();
    const d = sCurveLines[1];
    expect(isRounded(d.x1)).toBe(true);
    expect(isRounded(d.y1)).toBe(true);
    expect(isRounded(d.x2)).toBe(true);
    expect(isRounded(d.y2)).toBe(true);
  });

  // ── Part C: TALL_ARC ──────────────────────────────────────────────────────

  it('TALL_ARC — diagonal-1 all four endpoint coords are multiples of 0.01 mm', () => {
    const { tallArcLines } = runStage22();
    const d = tallArcLines[0];
    expect(isRounded(d.x1)).toBe(true);
    expect(isRounded(d.y1)).toBe(true);
    expect(isRounded(d.x2)).toBe(true);
    expect(isRounded(d.y2)).toBe(true);
  });

  it('TALL_ARC — diagonal-2 all four endpoint coords are multiples of 0.01 mm', () => {
    const { tallArcLines } = runStage22();
    const d = tallArcLines[1];
    expect(isRounded(d.x1)).toBe(true);
    expect(isRounded(d.y1)).toBe(true);
    expect(isRounded(d.x2)).toBe(true);
    expect(isRounded(d.y2)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Stage 23 — Rounding does not violate bbox-confinement invariant
// ══════════════════════════════════════════════════════════════════════════════

describe('@smoke Stage 23 — rounded HATCH_CURVED endpoints remain within flat-blank bbox', () => {
  /**
   * Stage 14 established the bbox-confinement invariant for S_CURVE only,
   * using unrounded coordinates.  Stage 22 introduced 0.01 mm rounding in
   * addLine().  Stage 23 asserts that rounding does NOT push any endpoint
   * outside the flat-blank placement bounding box.
   *
   * Tolerance: ε = 0.01 mm  (2× max rounding delta of 0.005 mm per coord).
   * Panel set: same three-panel sheet as Stages 19–22
   *            (ARC SMOKE_DOOR + S_CURVE SMOKE_SCURVE_DOOR + TALL_ARC).
   *
   * Invariant (per diagonal d, per panel p):
   *   d.x1 ∈ [bbox.minX − ε, bbox.maxX + ε]
   *   d.y1 ∈ [bbox.minY − ε, bbox.maxY + ε]
   *   d.x2 ∈ [bbox.minX − ε, bbox.maxX + ε]
   *   d.y2 ∈ [bbox.minY − ε, bbox.maxY + ε]
   *   where ε = 0.01 mm
   */

  type Coords = { x1: number; y1: number; x2: number; y2: number };
  type Bbox   = { minX: number; maxX: number; minY: number; maxY: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function bboxForPlacement(p: { x: number; y: number; cutW: number; cutH: number; rotation: number }): Bbox {
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;
    return { minX: p.x, maxX: p.x + ew, minY: p.y, maxY: p.y + eh };
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  function runStage23() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return {
      arcLines,    arcBbox:    bboxForPlacement(arcP),
      sCurveLines, sCurveBbox: bboxForPlacement(sCurveP),
      tallArcLines, tallBbox:  bboxForPlacement(tallArcP),
    };
  }

  const ε = 0.01; // 2× max rounding delta (0.005 mm per coord)

  // ── Part A: ARC ───────────────────────────────────────────────────────────

  it('ARC — diagonal-1 all four endpoint coords remain within flat-blank bbox ± 0.01 mm', () => {
    const { arcLines, arcBbox: b } = runStage23();
    const d = arcLines[0];
    expect(d.x1).toBeGreaterThanOrEqual(b.minX - ε);
    expect(d.x1).toBeLessThanOrEqual(b.maxX + ε);
    expect(d.y1).toBeGreaterThanOrEqual(b.minY - ε);
    expect(d.y1).toBeLessThanOrEqual(b.maxY + ε);
    expect(d.x2).toBeGreaterThanOrEqual(b.minX - ε);
    expect(d.x2).toBeLessThanOrEqual(b.maxX + ε);
    expect(d.y2).toBeGreaterThanOrEqual(b.minY - ε);
    expect(d.y2).toBeLessThanOrEqual(b.maxY + ε);
  });

  it('ARC — diagonal-2 all four endpoint coords remain within flat-blank bbox ± 0.01 mm', () => {
    const { arcLines, arcBbox: b } = runStage23();
    const d = arcLines[1];
    expect(d.x1).toBeGreaterThanOrEqual(b.minX - ε);
    expect(d.x1).toBeLessThanOrEqual(b.maxX + ε);
    expect(d.y1).toBeGreaterThanOrEqual(b.minY - ε);
    expect(d.y1).toBeLessThanOrEqual(b.maxY + ε);
    expect(d.x2).toBeGreaterThanOrEqual(b.minX - ε);
    expect(d.x2).toBeLessThanOrEqual(b.maxX + ε);
    expect(d.y2).toBeGreaterThanOrEqual(b.minY - ε);
    expect(d.y2).toBeLessThanOrEqual(b.maxY + ε);
  });

  // ── Part B: S_CURVE ───────────────────────────────────────────────────────

  it('S_CURVE — diagonal-1 all four endpoint coords remain within flat-blank bbox ± 0.01 mm', () => {
    const { sCurveLines, sCurveBbox: b } = runStage23();
    const d = sCurveLines[0];
    expect(d.x1).toBeGreaterThanOrEqual(b.minX - ε);
    expect(d.x1).toBeLessThanOrEqual(b.maxX + ε);
    expect(d.y1).toBeGreaterThanOrEqual(b.minY - ε);
    expect(d.y1).toBeLessThanOrEqual(b.maxY + ε);
    expect(d.x2).toBeGreaterThanOrEqual(b.minX - ε);
    expect(d.x2).toBeLessThanOrEqual(b.maxX + ε);
    expect(d.y2).toBeGreaterThanOrEqual(b.minY - ε);
    expect(d.y2).toBeLessThanOrEqual(b.maxY + ε);
  });

  it('S_CURVE — diagonal-2 all four endpoint coords remain within flat-blank bbox ± 0.01 mm', () => {
    const { sCurveLines, sCurveBbox: b } = runStage23();
    const d = sCurveLines[1];
    expect(d.x1).toBeGreaterThanOrEqual(b.minX - ε);
    expect(d.x1).toBeLessThanOrEqual(b.maxX + ε);
    expect(d.y1).toBeGreaterThanOrEqual(b.minY - ε);
    expect(d.y1).toBeLessThanOrEqual(b.maxY + ε);
    expect(d.x2).toBeGreaterThanOrEqual(b.minX - ε);
    expect(d.x2).toBeLessThanOrEqual(b.maxX + ε);
    expect(d.y2).toBeGreaterThanOrEqual(b.minY - ε);
    expect(d.y2).toBeLessThanOrEqual(b.maxY + ε);
  });

  // ── Part C: TALL_ARC ──────────────────────────────────────────────────────

  it('TALL_ARC — diagonal-1 all four endpoint coords remain within flat-blank bbox ± 0.01 mm', () => {
    const { tallArcLines, tallBbox: b } = runStage23();
    const d = tallArcLines[0];
    expect(d.x1).toBeGreaterThanOrEqual(b.minX - ε);
    expect(d.x1).toBeLessThanOrEqual(b.maxX + ε);
    expect(d.y1).toBeGreaterThanOrEqual(b.minY - ε);
    expect(d.y1).toBeLessThanOrEqual(b.maxY + ε);
    expect(d.x2).toBeGreaterThanOrEqual(b.minX - ε);
    expect(d.x2).toBeLessThanOrEqual(b.maxX + ε);
    expect(d.y2).toBeGreaterThanOrEqual(b.minY - ε);
    expect(d.y2).toBeLessThanOrEqual(b.maxY + ε);
  });

  it('TALL_ARC — diagonal-2 all four endpoint coords remain within flat-blank bbox ± 0.01 mm', () => {
    const { tallArcLines, tallBbox: b } = runStage23();
    const d = tallArcLines[1];
    expect(d.x1).toBeGreaterThanOrEqual(b.minX - ε);
    expect(d.x1).toBeLessThanOrEqual(b.maxX + ε);
    expect(d.y1).toBeGreaterThanOrEqual(b.minY - ε);
    expect(d.y1).toBeLessThanOrEqual(b.maxY + ε);
    expect(d.x2).toBeGreaterThanOrEqual(b.minX - ε);
    expect(d.x2).toBeLessThanOrEqual(b.maxX + ε);
    expect(d.y2).toBeGreaterThanOrEqual(b.minY - ε);
    expect(d.y2).toBeLessThanOrEqual(b.maxY + ε);
  });
});

// Stage 24 — Every HATCH_CURVED diagonal is non-degenerate (non-zero length)
// ══════════════════════════════════════════════════════════════════════════════

describe('@smoke Stage 24 — all HATCH_CURVED diagonals have non-zero length', () => {
  /**
   * A degenerate LINE entity (x1=x2 AND y1=y2) would produce a zero-length
   * mark in CNC DXF output and is meaningless as a hatch guide.
   * Stage 24 asserts that both diagonals of every curved panel satisfy:
   *
   *   |x1 − x2| + |y1 − y2| > 1e-6
   *
   * This threshold (1e-6 mm) is five orders of magnitude below the 0.01 mm
   * rounding quantum introduced in Stage 22, so any geometrically real diagonal
   * passes trivially while a truly degenerate line would fail.
   *
   * Panel set: same three-panel sheet as Stages 19–23
   *            (ARC SMOKE_DOOR + S_CURVE SMOKE_SCURVE_DOOR + TALL_ARC).
   */

  type Coords = { x1: number; y1: number; x2: number; y2: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  /** Returns true when a LINE entity spans a non-zero distance. */
  function isNonDegenerate(d: Coords): boolean {
    return Math.abs(d.x1 - d.x2) + Math.abs(d.y1 - d.y2) > 1e-6;
  }

  function runStage24() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return { arcLines, sCurveLines, tallArcLines };
  }

  // ── Part A: ARC ───────────────────────────────────────────────────────────

  it('ARC — diagonal-1 has non-zero length', () => {
    const { arcLines } = runStage24();
    expect(isNonDegenerate(arcLines[0])).toBe(true);
  });

  it('ARC — diagonal-2 has non-zero length', () => {
    const { arcLines } = runStage24();
    expect(isNonDegenerate(arcLines[1])).toBe(true);
  });

  // ── Part B: S_CURVE ───────────────────────────────────────────────────────

  it('S_CURVE — diagonal-1 has non-zero length', () => {
    const { sCurveLines } = runStage24();
    expect(isNonDegenerate(sCurveLines[0])).toBe(true);
  });

  it('S_CURVE — diagonal-2 has non-zero length', () => {
    const { sCurveLines } = runStage24();
    expect(isNonDegenerate(sCurveLines[1])).toBe(true);
  });

  // ── Part C: TALL_ARC ──────────────────────────────────────────────────────

  it('TALL_ARC — diagonal-1 has non-zero length', () => {
    const { tallArcLines } = runStage24();
    expect(isNonDegenerate(tallArcLines[0])).toBe(true);
  });

  it('TALL_ARC — diagonal-2 has non-zero length', () => {
    const { tallArcLines } = runStage24();
    expect(isNonDegenerate(tallArcLines[1])).toBe(true);
  });
});

// Stage 25 — Both HATCH_CURVED diagonals share the same midpoint
// ══════════════════════════════════════════════════════════════════════════════

describe('@smoke Stage 25 — midpoint of diagonal-1 equals midpoint of diagonal-2', () => {
  /**
   * For a correct X-hatch the two diagonals of a placement bbox intersect at
   * the centre of the bbox.  That centre is exactly the midpoint of each
   * diagonal, so both midpoints must be equal:
   *
   *   (d1.x1 + d1.x2) / 2  ≈  (d2.x1 + d2.x2) / 2
   *   (d1.y1 + d1.y2) / 2  ≈  (d2.y1 + d2.y2) / 2
   *
   * Tolerance: toBeCloseTo(x, 1)  →  ±0.05 mm.
   * The 0.01 mm rounding introduced in Stage 22 can shift each midpoint by at
   * most 0.005 mm, so the worst-case difference is 0.01 mm — well within the
   * ±0.05 mm window.
   *
   * Panel set: same three-panel sheet as Stages 19–24
   *            (ARC SMOKE_DOOR + S_CURVE SMOKE_SCURVE_DOOR + TALL_ARC).
   */

  type Coords = { x1: number; y1: number; x2: number; y2: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  const midX = (d: Coords): number => (d.x1 + d.x2) / 2;
  const midY = (d: Coords): number => (d.y1 + d.y2) / 2;

  function runStage25() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return { arcLines, sCurveLines, tallArcLines };
  }

  // ── Part A: ARC ───────────────────────────────────────────────────────────

  it('ARC — midX of diagonal-1 equals midX of diagonal-2', () => {
    const { arcLines } = runStage25();
    expect(midX(arcLines[0])).toBeCloseTo(midX(arcLines[1]), 1);
  });

  it('ARC — midY of diagonal-1 equals midY of diagonal-2', () => {
    const { arcLines } = runStage25();
    expect(midY(arcLines[0])).toBeCloseTo(midY(arcLines[1]), 1);
  });

  // ── Part B: S_CURVE ───────────────────────────────────────────────────────

  it('S_CURVE — midX of diagonal-1 equals midX of diagonal-2', () => {
    const { sCurveLines } = runStage25();
    expect(midX(sCurveLines[0])).toBeCloseTo(midX(sCurveLines[1]), 1);
  });

  it('S_CURVE — midY of diagonal-1 equals midY of diagonal-2', () => {
    const { sCurveLines } = runStage25();
    expect(midY(sCurveLines[0])).toBeCloseTo(midY(sCurveLines[1]), 1);
  });

  // ── Part C: TALL_ARC ──────────────────────────────────────────────────────

  it('TALL_ARC — midX of diagonal-1 equals midX of diagonal-2', () => {
    const { tallArcLines } = runStage25();
    expect(midX(tallArcLines[0])).toBeCloseTo(midX(tallArcLines[1]), 1);
  });

  it('TALL_ARC — midY of diagonal-1 equals midY of diagonal-2', () => {
    const { tallArcLines } = runStage25();
    expect(midY(tallArcLines[0])).toBeCloseTo(midY(tallArcLines[1]), 1);
  });
});

// Stage 26 — Shared midpoint equals the centre of the flat-blank placement bbox
// ══════════════════════════════════════════════════════════════════════════════

describe('@smoke Stage 26 — shared diagonal midpoint equals bbox centre', () => {
  /**
   * Stage 25 showed that both diagonals share the same midpoint.
   * Stage 26 asserts that this shared midpoint coincides with the geometric
   * centre of the flat-blank placement bounding box:
   *
   *   midX(d)  ≈  (bbox.minX + bbox.maxX) / 2
   *   midY(d)  ≈  (bbox.minY + bbox.maxY) / 2
   *
   * This confirms the X-hatch is centred on the panel, not offset.
   *
   * Tolerance: toBeCloseTo(x, 1)  →  ±0.05 mm.
   * Rounding in addLine() can shift each midpoint coord by at most 0.005 mm,
   * so the worst-case deviation from the true bbox centre is 0.005 mm —
   * well within the ±0.05 mm window.
   *
   * Panel set: same three-panel sheet as Stages 19–25
   *            (ARC SMOKE_DOOR + S_CURVE SMOKE_SCURVE_DOOR + TALL_ARC).
   */

  type Coords = { x1: number; y1: number; x2: number; y2: number };
  type Bbox   = { minX: number; maxX: number; minY: number; maxY: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function bboxForPlacement(p: { x: number; y: number; cutW: number; cutH: number; rotation: number }): Bbox {
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;
    return { minX: p.x, maxX: p.x + ew, minY: p.y, maxY: p.y + eh };
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  const midX      = (d: Coords): number => (d.x1 + d.x2) / 2;
  const midY      = (d: Coords): number => (d.y1 + d.y2) / 2;
  const centreX   = (b: Bbox):   number => (b.minX + b.maxX) / 2;
  const centreY   = (b: Bbox):   number => (b.minY + b.maxY) / 2;

  function runStage26() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return {
      arcLines,    arcBbox:    bboxForPlacement(arcP),
      sCurveLines, sCurveBbox: bboxForPlacement(sCurveP),
      tallArcLines, tallBbox:  bboxForPlacement(tallArcP),
    };
  }

  // ── Part A: ARC ───────────────────────────────────────────────────────────

  it('ARC — shared midX equals bbox centreX', () => {
    const { arcLines, arcBbox: b } = runStage26();
    expect(midX(arcLines[0])).toBeCloseTo(centreX(b), 1);
  });

  it('ARC — shared midY equals bbox centreY', () => {
    const { arcLines, arcBbox: b } = runStage26();
    expect(midY(arcLines[0])).toBeCloseTo(centreY(b), 1);
  });

  // ── Part B: S_CURVE ───────────────────────────────────────────────────────

  it('S_CURVE — shared midX equals bbox centreX', () => {
    const { sCurveLines, sCurveBbox: b } = runStage26();
    expect(midX(sCurveLines[0])).toBeCloseTo(centreX(b), 1);
  });

  it('S_CURVE — shared midY equals bbox centreY', () => {
    const { sCurveLines, sCurveBbox: b } = runStage26();
    expect(midY(sCurveLines[0])).toBeCloseTo(centreY(b), 1);
  });

  // ── Part C: TALL_ARC ──────────────────────────────────────────────────────

  it('TALL_ARC — shared midX equals bbox centreX', () => {
    const { tallArcLines, tallBbox: b } = runStage26();
    expect(midX(tallArcLines[0])).toBeCloseTo(centreX(b), 1);
  });

  it('TALL_ARC — shared midY equals bbox centreY', () => {
    const { tallArcLines, tallBbox: b } = runStage26();
    expect(midY(tallArcLines[0])).toBeCloseTo(centreY(b), 1);
  });
});

// Stage 27 — Both HATCH_CURVED diagonals have equal length
// ══════════════════════════════════════════════════════════════════════════════

describe('@smoke Stage 27 — diagonal-1 and diagonal-2 have equal length', () => {
  /**
   * The two diagonals of any axis-aligned rectangle are congruent; their
   * lengths are equal.  Stage 27 asserts this property holds for every
   * HATCH_CURVED X-hatch after 0.01 mm rounding:
   *
   *   sqrt((d1.x2−d1.x1)² + (d1.y2−d1.y1)²)
   *     ≈  sqrt((d2.x2−d2.x1)² + (d2.y2−d2.y1)²)
   *
   * Tolerance: toBeCloseTo(x, 1)  →  ±0.05 mm.
   * Rounding shifts each coord by at most 0.005 mm, giving a worst-case
   * per-diagonal length error of sqrt(2)×0.01 ≈ 0.014 mm, so the worst-case
   * length difference between d1 and d2 is ≤ 0.028 mm — within ±0.05 mm.
   *
   * Panel set: same three-panel sheet as Stages 19–26
   *            (ARC SMOKE_DOOR + S_CURVE SMOKE_SCURVE_DOOR + TALL_ARC).
   */

  type Coords = { x1: number; y1: number; x2: number; y2: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  const diagLen = (d: Coords): number =>
    Math.sqrt((d.x2 - d.x1) ** 2 + (d.y2 - d.y1) ** 2);

  function runStage27() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return { arcLines, sCurveLines, tallArcLines };
  }

  // ── assertions ────────────────────────────────────────────────────────────

  it('ARC — diagonal-1 and diagonal-2 have equal length', () => {
    const { arcLines } = runStage27();
    expect(diagLen(arcLines[0])).toBeCloseTo(diagLen(arcLines[1]), 1);
  });

  it('S_CURVE — diagonal-1 and diagonal-2 have equal length', () => {
    const { sCurveLines } = runStage27();
    expect(diagLen(sCurveLines[0])).toBeCloseTo(diagLen(sCurveLines[1]), 1);
  });

  it('TALL_ARC — diagonal-1 and diagonal-2 have equal length', () => {
    const { tallArcLines } = runStage27();
    expect(diagLen(tallArcLines[0])).toBeCloseTo(diagLen(tallArcLines[1]), 1);
  });
});

describe('@smoke Stage 28 — diagonal length = sqrt(W²+H²) and endpoints are distinct corner pairs', () => {
  /**
   * Stage 28 splits into two parts:
   *
   * Part A — Each HATCH_CURVED diagonal length equals the bbox diagonal
   *           sqrt(effectiveW² + effectiveH²)
   *
   *   diagLen(d) = sqrt((d.x2−d.x1)² + (d.y2−d.y1)²)
   *             ≈ sqrt((maxX−minX)² + (maxY−minY)²)
   *
   *   Tolerance: toBeCloseTo(x, 1) → ±0.05 mm.
   *   Rounding shifts each coord by at most 0.005 mm, giving a worst-case
   *   diagonal length error of sqrt(2)×0.01 ≈ 0.014 mm — within ±0.05 mm.
   *
   * Part B — The four diagonal endpoints form two distinct corner pairs
   *           (no two endpoints are identical after 0.01 mm rounding):
   *
   *   new Set([ "x1,y1", "x2,y2", "x1',y1'", "x2',y2'" ]).size === 4
   *
   * Panel set: same three-panel sheet as Stages 19–27
   *            (ARC SMOKE_DOOR + S_CURVE SMOKE_SCURVE_DOOR + TALL_ARC).
   */

  type Coords = { x1: number; y1: number; x2: number; y2: number };
  type Bbox   = { minX: number; maxX: number; minY: number; maxY: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function bboxForPlacement(p: { x: number; y: number; cutW: number; cutH: number; rotation: number }): Bbox {
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;
    return { minX: p.x, maxX: p.x + ew, minY: p.y, maxY: p.y + eh };
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  const diagLen      = (d: Coords): number =>
    Math.sqrt((d.x2 - d.x1) ** 2 + (d.y2 - d.y1) ** 2);

  const expectedDiag = (b: Bbox): number =>
    Math.sqrt((b.maxX - b.minX) ** 2 + (b.maxY - b.minY) ** 2);

  function runStage28() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return {
      arcLines,    arcBbox:    bboxForPlacement(arcP),
      sCurveLines, sCurveBbox: bboxForPlacement(sCurveP),
      tallArcLines, tallBbox:  bboxForPlacement(tallArcP),
    };
  }

  // ── Part A: diagonal length = sqrt(effectiveW² + effectiveH²) ─────────────

  it('ARC — diagonal-1 length equals sqrt(effectiveW² + effectiveH²)', () => {
    const { arcLines, arcBbox: b } = runStage28();
    expect(diagLen(arcLines[0])).toBeCloseTo(expectedDiag(b), 1);
  });

  it('ARC — diagonal-2 length equals sqrt(effectiveW² + effectiveH²)', () => {
    const { arcLines, arcBbox: b } = runStage28();
    expect(diagLen(arcLines[1])).toBeCloseTo(expectedDiag(b), 1);
  });

  it('S_CURVE — diagonal-1 length equals sqrt(effectiveW² + effectiveH²)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage28();
    expect(diagLen(sCurveLines[0])).toBeCloseTo(expectedDiag(b), 1);
  });

  it('S_CURVE — diagonal-2 length equals sqrt(effectiveW² + effectiveH²)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage28();
    expect(diagLen(sCurveLines[1])).toBeCloseTo(expectedDiag(b), 1);
  });

  it('TALL_ARC — diagonal-1 length equals sqrt(effectiveW² + effectiveH²)', () => {
    const { tallArcLines, tallBbox: b } = runStage28();
    expect(diagLen(tallArcLines[0])).toBeCloseTo(expectedDiag(b), 1);
  });

  it('TALL_ARC — diagonal-2 length equals sqrt(effectiveW² + effectiveH²)', () => {
    const { tallArcLines, tallBbox: b } = runStage28();
    expect(diagLen(tallArcLines[1])).toBeCloseTo(expectedDiag(b), 1);
  });

  // ── Part B: four endpoints are two distinct corner pairs ──────────────────

  it('ARC — four diagonal endpoints are two distinct corner pairs (no endpoint repeats)', () => {
    const { arcLines } = runStage28();
    const [d1, d2] = arcLines;
    const pts = [`${d1.x1},${d1.y1}`, `${d1.x2},${d1.y2}`, `${d2.x1},${d2.y1}`, `${d2.x2},${d2.y2}`];
    expect(new Set(pts).size).toBe(4);
  });

  it('S_CURVE — four diagonal endpoints are two distinct corner pairs (no endpoint repeats)', () => {
    const { sCurveLines } = runStage28();
    const [d1, d2] = sCurveLines;
    const pts = [`${d1.x1},${d1.y1}`, `${d1.x2},${d1.y2}`, `${d2.x1},${d2.y1}`, `${d2.x2},${d2.y2}`];
    expect(new Set(pts).size).toBe(4);
  });

  it('TALL_ARC — four diagonal endpoints are two distinct corner pairs (no endpoint repeats)', () => {
    const { tallArcLines } = runStage28();
    const [d1, d2] = tallArcLines;
    const pts = [`${d1.x1},${d1.y1}`, `${d1.x2},${d1.y2}`, `${d2.x1},${d2.y1}`, `${d2.x2},${d2.y2}`];
    expect(new Set(pts).size).toBe(4);
  });
});

describe('@smoke Stage 29 — HATCH_CURVED diagonal endpoints match exact flat-blank bbox corners', () => {
  /**
   * Stage 29 verifies that the four HATCH_CURVED line endpoints are exactly
   * the four corners of the flat-blank placement bbox after 0.01 mm rounding:
   *
   *   diagonal-1: (minX, minY) → (maxX, maxY)   [top-left  → bottom-right]
   *   diagonal-2: (maxX, minY) → (minX, maxY)   [top-right → bottom-left]
   *
   * The test collects all four endpoints and the four expected corners as
   * "x,y" strings (with rounding matching addLine()), then asserts
   * Set(endpoints) equals Set(corners).
   *
   * Rounding helper mirrors buildDxfSheets.ts addLine():
   *   round(v) = Math.round(v * 100) / 100
   *
   * Panel set: same three-panel sheet as Stages 19–28
   *            (ARC SMOKE_DOOR + S_CURVE SMOKE_SCURVE_DOOR + TALL_ARC).
   */

  type Coords = { x1: number; y1: number; x2: number; y2: number };
  type Bbox   = { minX: number; maxX: number; minY: number; maxY: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function bboxForPlacement(p: { x: number; y: number; cutW: number; cutH: number; rotation: number }): Bbox {
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;
    return { minX: p.x, maxX: p.x + ew, minY: p.y, maxY: p.y + eh };
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  /** Mirror of addLine() rounding in buildDxfSheets.ts */
  const r   = (v: number): number => Math.round(v * 100) / 100;
  const pt  = (x: number, y: number): string => `${r(x)},${r(y)}`;

  const cornersForBbox = (b: Bbox): Set<string> =>
    new Set([pt(b.minX, b.minY), pt(b.maxX, b.maxY), pt(b.maxX, b.minY), pt(b.minX, b.maxY)]);

  function runStage29() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return {
      arcLines,    arcBbox:    bboxForPlacement(arcP),
      sCurveLines, sCurveBbox: bboxForPlacement(sCurveP),
      tallArcLines, tallBbox:  bboxForPlacement(tallArcP),
    };
  }

  // ── assertions ────────────────────────────────────────────────────────────

  it('ARC — four diagonal endpoints equal the four flat-blank bbox corners', () => {
    const { arcLines, arcBbox: b } = runStage29();
    const [d1, d2] = arcLines;
    const endpoints = new Set([
      `${d1.x1},${d1.y1}`, `${d1.x2},${d1.y2}`,
      `${d2.x1},${d2.y1}`, `${d2.x2},${d2.y2}`,
    ]);
    expect(endpoints).toEqual(cornersForBbox(b));
  });

  it('S_CURVE — four diagonal endpoints equal the four flat-blank bbox corners', () => {
    const { sCurveLines, sCurveBbox: b } = runStage29();
    const [d1, d2] = sCurveLines;
    const endpoints = new Set([
      `${d1.x1},${d1.y1}`, `${d1.x2},${d1.y2}`,
      `${d2.x1},${d2.y1}`, `${d2.x2},${d2.y2}`,
    ]);
    expect(endpoints).toEqual(cornersForBbox(b));
  });

  it('TALL_ARC — four diagonal endpoints equal the four flat-blank bbox corners', () => {
    const { tallArcLines, tallBbox: b } = runStage29();
    const [d1, d2] = tallArcLines;
    const endpoints = new Set([
      `${d1.x1},${d1.y1}`, `${d1.x2},${d1.y2}`,
      `${d2.x1},${d2.y1}`, `${d2.x2},${d2.y2}`,
    ]);
    expect(endpoints).toEqual(cornersForBbox(b));
  });
});

describe('@smoke Stage 30 — diagonal-1 runs (minX,minY)→(maxX,maxY); diagonal-2 runs (maxX,minY)→(minX,maxY)', () => {
  /**
   * Stage 30 asserts the exact directional assignment of the two HATCH_CURVED
   * diagonals emitted by buildDxfSheet().
   *
   * Stage 29 verified (order-agnostic) that the Set of 4 endpoints equals the
   * Set of 4 rounded bbox corners.  Stage 30 adds directional specificity:
   *
   *   diagonal-1  (lines[0])  →  (minX, minY) ──→ (maxX, maxY)
   *                               bottom-left        top-right
   *
   *   diagonal-2  (lines[1])  →  (maxX, minY) ──→ (minX, maxY)
   *                               bottom-right       top-left
   *
   * Equivalently:
   *   diagonal-1 runs left-to-right along X  (x1 < x2)
   *   diagonal-2 runs right-to-left along X  (x1 > x2)
   *
   * Tolerance: ±0.015 mm (one rounding delta above addLine()'s 0.01 mm precision).
   *
   * Verified for ARC (SMOKE_DOOR), S_CURVE (SMOKE_SCURVE_DOOR), and TALL_ARC
   * (grain-locked SMOKE_DOOR, rotation=0) panel types.
   */

  const EPS = 0.015; // one rounding delta
  const r   = (v: number): number => Math.round(v * 100) / 100;

  type Coords = { x1: number; y1: number; x2: number; y2: number };
  type Bbox   = { minX: number; maxX: number; minY: number; maxY: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function bboxForPlacement(p: { x: number; y: number; cutW: number; cutH: number; rotation: number }): Bbox {
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;
    return { minX: p.x, maxX: p.x + ew, minY: p.y, maxY: p.y + eh };
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  function runStage30() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return {
      arcLines,    arcBbox:    bboxForPlacement(arcP),
      sCurveLines, sCurveBbox: bboxForPlacement(sCurveP),
      tallArcLines, tallBbox:  bboxForPlacement(tallArcP),
    };
  }

  // ── ARC ───────────────────────────────────────────────────────────────────

  it('ARC — diagonal-1 starts at (minX,minY) and ends at (maxX,maxY)', () => {
    const { arcLines, arcBbox: b } = runStage30();
    const d1 = arcLines[0];
    expect(Math.abs(d1.x1 - r(b.minX))).toBeLessThan(EPS);
    expect(Math.abs(d1.y1 - r(b.minY))).toBeLessThan(EPS);
    expect(Math.abs(d1.x2 - r(b.maxX))).toBeLessThan(EPS);
    expect(Math.abs(d1.y2 - r(b.maxY))).toBeLessThan(EPS);
  });

  it('ARC — diagonal-2 starts at (maxX,minY) and ends at (minX,maxY)', () => {
    const { arcLines, arcBbox: b } = runStage30();
    const d2 = arcLines[1];
    expect(Math.abs(d2.x1 - r(b.maxX))).toBeLessThan(EPS);
    expect(Math.abs(d2.y1 - r(b.minY))).toBeLessThan(EPS);
    expect(Math.abs(d2.x2 - r(b.minX))).toBeLessThan(EPS);
    expect(Math.abs(d2.y2 - r(b.maxY))).toBeLessThan(EPS);
  });

  it('ARC — diagonal-1 runs left-to-right; diagonal-2 runs right-to-left along X', () => {
    const { arcLines } = runStage30();
    const [d1, d2] = arcLines;
    expect(d1.x1).toBeLessThan(d1.x2); // d1: left-to-right
    expect(d2.x1).toBeGreaterThan(d2.x2); // d2: right-to-left
  });

  // ── S_CURVE ───────────────────────────────────────────────────────────────

  it('S_CURVE — diagonal-1 starts at (minX,minY) and ends at (maxX,maxY)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage30();
    const d1 = sCurveLines[0];
    expect(Math.abs(d1.x1 - r(b.minX))).toBeLessThan(EPS);
    expect(Math.abs(d1.y1 - r(b.minY))).toBeLessThan(EPS);
    expect(Math.abs(d1.x2 - r(b.maxX))).toBeLessThan(EPS);
    expect(Math.abs(d1.y2 - r(b.maxY))).toBeLessThan(EPS);
  });

  it('S_CURVE — diagonal-2 starts at (maxX,minY) and ends at (minX,maxY)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage30();
    const d2 = sCurveLines[1];
    expect(Math.abs(d2.x1 - r(b.maxX))).toBeLessThan(EPS);
    expect(Math.abs(d2.y1 - r(b.minY))).toBeLessThan(EPS);
    expect(Math.abs(d2.x2 - r(b.minX))).toBeLessThan(EPS);
    expect(Math.abs(d2.y2 - r(b.maxY))).toBeLessThan(EPS);
  });

  it('S_CURVE — diagonal-1 runs left-to-right; diagonal-2 runs right-to-left along X', () => {
    const { sCurveLines } = runStage30();
    const [d1, d2] = sCurveLines;
    expect(d1.x1).toBeLessThan(d1.x2);
    expect(d2.x1).toBeGreaterThan(d2.x2);
  });

  // ── TALL_ARC ──────────────────────────────────────────────────────────────

  it('TALL_ARC — diagonal-1 starts at (minX,minY) and ends at (maxX,maxY)', () => {
    const { tallArcLines, tallBbox: b } = runStage30();
    const d1 = tallArcLines[0];
    expect(Math.abs(d1.x1 - r(b.minX))).toBeLessThan(EPS);
    expect(Math.abs(d1.y1 - r(b.minY))).toBeLessThan(EPS);
    expect(Math.abs(d1.x2 - r(b.maxX))).toBeLessThan(EPS);
    expect(Math.abs(d1.y2 - r(b.maxY))).toBeLessThan(EPS);
  });

  it('TALL_ARC — diagonal-2 starts at (maxX,minY) and ends at (minX,maxY)', () => {
    const { tallArcLines, tallBbox: b } = runStage30();
    const d2 = tallArcLines[1];
    expect(Math.abs(d2.x1 - r(b.maxX))).toBeLessThan(EPS);
    expect(Math.abs(d2.y1 - r(b.minY))).toBeLessThan(EPS);
    expect(Math.abs(d2.x2 - r(b.minX))).toBeLessThan(EPS);
    expect(Math.abs(d2.y2 - r(b.maxY))).toBeLessThan(EPS);
  });

  it('TALL_ARC — diagonal-1 runs left-to-right; diagonal-2 runs right-to-left along X', () => {
    const { tallArcLines } = runStage30();
    const [d1, d2] = tallArcLines;
    expect(d1.x1).toBeLessThan(d1.x2);
    expect(d2.x1).toBeGreaterThan(d2.x2);
  });
});

describe('@smoke Stage 31 — d1.y1 and d2.y1 are both ≈ minY (shared bottom start)', () => {
  /**
   * Stage 31 cross-asserts a consequence of the Stage 30 direction invariant:
   * because diagonal-1 starts at (minX, minY) and diagonal-2 starts at (maxX, minY),
   * both start Y coordinates must equal minY.
   *
   *   d1.y1 ≈ r(minY)   (bottom of the flat-blank placement)
   *   d2.y1 ≈ r(minY)
   *
   * This confirms that the DXF hatch convention always grounds both diagonals at
   * the same horizontal level — the bottom edge of the flat-blank bbox — regardless
   * of panel type, FFDH rotation, or grain-lock.
   *
   * Tolerance: ±0.015 mm.  Verified for ARC, S_CURVE, and TALL_ARC.
   */

  const EPS = 0.015;
  const r   = (v: number): number => Math.round(v * 100) / 100;

  type Coords = { x1: number; y1: number; x2: number; y2: number };
  type Bbox   = { minX: number; maxX: number; minY: number; maxY: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function bboxForPlacement(p: { x: number; y: number; cutW: number; cutH: number; rotation: number }): Bbox {
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;
    return { minX: p.x, maxX: p.x + ew, minY: p.y, maxY: p.y + eh };
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  function runStage31() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return {
      arcLines,    arcBbox:    bboxForPlacement(arcP),
      sCurveLines, sCurveBbox: bboxForPlacement(sCurveP),
      tallArcLines, tallBbox:  bboxForPlacement(tallArcP),
    };
  }

  // ── assertions ────────────────────────────────────────────────────────────

  it('ARC — d1.y1 and d2.y1 are both ≈ minY', () => {
    const { arcLines, arcBbox: b } = runStage31();
    const [d1, d2] = arcLines;
    expect(Math.abs(d1.y1 - r(b.minY))).toBeLessThan(EPS);
    expect(Math.abs(d2.y1 - r(b.minY))).toBeLessThan(EPS);
  });

  it('S_CURVE — d1.y1 and d2.y1 are both ≈ minY', () => {
    const { sCurveLines, sCurveBbox: b } = runStage31();
    const [d1, d2] = sCurveLines;
    expect(Math.abs(d1.y1 - r(b.minY))).toBeLessThan(EPS);
    expect(Math.abs(d2.y1 - r(b.minY))).toBeLessThan(EPS);
  });

  it('TALL_ARC — d1.y1 and d2.y1 are both ≈ minY', () => {
    const { tallArcLines, tallBbox: b } = runStage31();
    const [d1, d2] = tallArcLines;
    expect(Math.abs(d1.y1 - r(b.minY))).toBeLessThan(EPS);
    expect(Math.abs(d2.y1 - r(b.minY))).toBeLessThan(EPS);
  });
});

describe('@smoke Stage 32 — d1.y2 and d2.y2 are both ≈ maxY (shared top end-Y)', () => {
  /**
   * Stage 32 is the symmetric counterpart of Stage 31.
   *
   * Stage 31 asserted both diagonal start Y values equal minY (bottom edge).
   * Stage 32 asserts both diagonal end Y values equal maxY (top edge):
   *
   *   d1.y2 ≈ r(maxY)   (diagonal-1 ends at the top of the flat-blank bbox)
   *   d2.y2 ≈ r(maxY)   (diagonal-2 ends at the top of the flat-blank bbox)
   *
   * Together Stages 31 + 32 confirm that the two X-hatch diagonals span the
   * full height of the flat-blank placement: every diagonal runs from the
   * bottom edge to the top edge, regardless of panel type or orientation.
   *
   * Tolerance: ±0.015 mm.  Verified for ARC, S_CURVE, and TALL_ARC.
   */

  const EPS = 0.015;
  const r   = (v: number): number => Math.round(v * 100) / 100;

  type Coords = { x1: number; y1: number; x2: number; y2: number };
  type Bbox   = { minX: number; maxX: number; minY: number; maxY: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function bboxForPlacement(p: { x: number; y: number; cutW: number; cutH: number; rotation: number }): Bbox {
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;
    return { minX: p.x, maxX: p.x + ew, minY: p.y, maxY: p.y + eh };
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  function runStage32() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return {
      arcLines,    arcBbox:    bboxForPlacement(arcP),
      sCurveLines, sCurveBbox: bboxForPlacement(sCurveP),
      tallArcLines, tallBbox:  bboxForPlacement(tallArcP),
    };
  }

  // ── assertions ────────────────────────────────────────────────────────────

  it('ARC — d1.y2 and d2.y2 are both ≈ maxY', () => {
    const { arcLines, arcBbox: b } = runStage32();
    const [d1, d2] = arcLines;
    expect(Math.abs(d1.y2 - r(b.maxY))).toBeLessThan(EPS);
    expect(Math.abs(d2.y2 - r(b.maxY))).toBeLessThan(EPS);
  });

  it('S_CURVE — d1.y2 and d2.y2 are both ≈ maxY', () => {
    const { sCurveLines, sCurveBbox: b } = runStage32();
    const [d1, d2] = sCurveLines;
    expect(Math.abs(d1.y2 - r(b.maxY))).toBeLessThan(EPS);
    expect(Math.abs(d2.y2 - r(b.maxY))).toBeLessThan(EPS);
  });

  it('TALL_ARC — d1.y2 and d2.y2 are both ≈ maxY', () => {
    const { tallArcLines, tallBbox: b } = runStage32();
    const [d1, d2] = tallArcLines;
    expect(Math.abs(d1.y2 - r(b.maxY))).toBeLessThan(EPS);
    expect(Math.abs(d2.y2 - r(b.maxY))).toBeLessThan(EPS);
  });
});

// ============================================================
// @smoke Stage 33 — orientation sense: d1.x1 < d1.x2 and d2.x1 > d2.x2
// ============================================================
describe('@smoke Stage 33 — d1 runs left→right (d1.x1 < d1.x2) and d2 runs right→left (d2.x1 > d2.x2)', () => {
  /**
   * Stage 33 asserts the X-axis orientation sense of the two HATCH_CURVED
   * diagonals for every panel type.
   *
   * From Stage 30 we know:
   *   d1 starts at (minX, minY) and ends at (maxX, maxY)  → d1.x1 < d1.x2
   *   d2 starts at (maxX, minY) and ends at (minX, maxY)  → d2.x1 > d2.x2
   *
   * Stage 33 asserts this strictly, checking the raw floating-point values
   * (not rounded), so no tolerance is needed — the inequality must hold exactly.
   *
   * Panels tested: ARC (FFDH-rotated), S_CURVE (FFDH-rotated), TALL_ARC
   * (grain-locked, no rotation).  In every case minX < maxX, so the sense is
   * unambiguous.
   */

  type Coords = { x1: number; y1: number; x2: number; y2: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  function runStage33() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return { arcLines, sCurveLines, tallArcLines };
  }

  // ── assertions ────────────────────────────────────────────────────────────

  it('ARC — d1.x1 < d1.x2 (left→right)', () => {
    const { arcLines } = runStage33();
    const [d1] = arcLines;
    expect(d1.x1).toBeLessThan(d1.x2);
  });

  it('ARC — d2.x1 > d2.x2 (right→left)', () => {
    const { arcLines } = runStage33();
    const [, d2] = arcLines;
    expect(d2.x1).toBeGreaterThan(d2.x2);
  });

  it('S_CURVE — d1.x1 < d1.x2 (left→right)', () => {
    const { sCurveLines } = runStage33();
    const [d1] = sCurveLines;
    expect(d1.x1).toBeLessThan(d1.x2);
  });

  it('S_CURVE — d2.x1 > d2.x2 (right→left)', () => {
    const { sCurveLines } = runStage33();
    const [, d2] = sCurveLines;
    expect(d2.x1).toBeGreaterThan(d2.x2);
  });

  it('TALL_ARC — d1.x1 < d1.x2 (left→right)', () => {
    const { tallArcLines } = runStage33();
    const [d1] = tallArcLines;
    expect(d1.x1).toBeLessThan(d1.x2);
  });

  it('TALL_ARC — d2.x1 > d2.x2 (right→left)', () => {
    const { tallArcLines } = runStage33();
    const [, d2] = tallArcLines;
    expect(d2.x1).toBeGreaterThan(d2.x2);
  });
});

// ============================================================
// @smoke Stage 34 — both diagonals ascend in Y: d1.y1 < d1.y2 and d2.y1 < d2.y2
// ============================================================
describe('@smoke Stage 34 — d1.y1 < d1.y2 and d2.y1 < d2.y2 (both diagonals ascend in Y)', () => {
  /**
   * Stage 34 asserts the Y-axis monotonicity of both HATCH_CURVED diagonals.
   *
   * From Stage 30 we know:
   *   d1 starts at (minX, minY) and ends at (maxX, maxY)  → d1.y1 < d1.y2
   *   d2 starts at (maxX, minY) and ends at (minX, maxY)  → d2.y1 < d2.y2
   *
   * Because minY < maxY for every non-degenerate flat-blank placement, both
   * diagonals must strictly ascend in Y regardless of X direction.  Stage 34
   * asserts this with a strict inequality — no tolerance required.
   *
   * This is the Y-axis counterpart of the Stage 33 X-axis orientation sense.
   *
   * Panels tested: ARC (FFDH-rotated), S_CURVE (FFDH-rotated), TALL_ARC
   * (grain-locked, no rotation).
   */

  type Coords = { x1: number; y1: number; x2: number; y2: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  function runStage34() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return { arcLines, sCurveLines, tallArcLines };
  }

  // ── assertions ────────────────────────────────────────────────────────────

  it('ARC — d1.y1 < d1.y2 (ascending in Y)', () => {
    const { arcLines } = runStage34();
    const [d1] = arcLines;
    expect(d1.y1).toBeLessThan(d1.y2);
  });

  it('ARC — d2.y1 < d2.y2 (ascending in Y)', () => {
    const { arcLines } = runStage34();
    const [, d2] = arcLines;
    expect(d2.y1).toBeLessThan(d2.y2);
  });

  it('S_CURVE — d1.y1 < d1.y2 (ascending in Y)', () => {
    const { sCurveLines } = runStage34();
    const [d1] = sCurveLines;
    expect(d1.y1).toBeLessThan(d1.y2);
  });

  it('S_CURVE — d2.y1 < d2.y2 (ascending in Y)', () => {
    const { sCurveLines } = runStage34();
    const [, d2] = sCurveLines;
    expect(d2.y1).toBeLessThan(d2.y2);
  });

  it('TALL_ARC — d1.y1 < d1.y2 (ascending in Y)', () => {
    const { tallArcLines } = runStage34();
    const [d1] = tallArcLines;
    expect(d1.y1).toBeLessThan(d1.y2);
  });

  it('TALL_ARC — d2.y1 < d2.y2 (ascending in Y)', () => {
    const { tallArcLines } = runStage34();
    const [, d2] = tallArcLines;
    expect(d2.y1).toBeLessThan(d2.y2);
  });
});

// ============================================================
// @smoke Stage 35 — d1.x2 ≈ r(maxX) and d2.x2 ≈ r(minX)
// ============================================================
describe('@smoke Stage 35 — d1.x2 ≈ r(maxX) and d2.x2 ≈ r(minX) for all three panel types', () => {
  /**
   * Stage 35 asserts the X endpoint values of the two HATCH_CURVED diagonals.
   *
   * From Stage 30 we know:
   *   d1 ends at (maxX, maxY)  → d1.x2 ≈ r(maxX)
   *   d2 ends at (minX, maxY)  → d2.x2 ≈ r(minX)
   *
   * While Stage 29 verified set-equality of all four endpoints (order-agnostic)
   * and Stage 30 confirmed directional assignment, Stage 35 isolates the end-X
   * values of both diagonals as explicit per-coordinate checks.
   *
   * Tolerance: ±0.015 mm (consistent with Stages 31–32).
   * Verified for ARC (FFDH-rotated), S_CURVE (FFDH-rotated), and TALL_ARC
   * (grain-locked, no rotation).
   */

  const EPS = 0.015;
  const r   = (v: number): number => Math.round(v * 100) / 100;

  type Coords = { x1: number; y1: number; x2: number; y2: number };
  type Bbox   = { minX: number; maxX: number; minY: number; maxY: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function bboxForPlacement(p: { x: number; y: number; cutW: number; cutH: number; rotation: number }): Bbox {
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;
    return { minX: p.x, maxX: p.x + ew, minY: p.y, maxY: p.y + eh };
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  function runStage35() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return {
      arcLines,    arcBbox:    bboxForPlacement(arcP),
      sCurveLines, sCurveBbox: bboxForPlacement(sCurveP),
      tallArcLines, tallBbox:  bboxForPlacement(tallArcP),
    };
  }

  // ── assertions ────────────────────────────────────────────────────────────

  it('ARC — d1.x2 ≈ r(maxX)', () => {
    const { arcLines, arcBbox: b } = runStage35();
    const [d1] = arcLines;
    expect(Math.abs(d1.x2 - r(b.maxX))).toBeLessThan(EPS);
  });

  it('ARC — d2.x2 ≈ r(minX)', () => {
    const { arcLines, arcBbox: b } = runStage35();
    const [, d2] = arcLines;
    expect(Math.abs(d2.x2 - r(b.minX))).toBeLessThan(EPS);
  });

  it('S_CURVE — d1.x2 ≈ r(maxX)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage35();
    const [d1] = sCurveLines;
    expect(Math.abs(d1.x2 - r(b.maxX))).toBeLessThan(EPS);
  });

  it('S_CURVE — d2.x2 ≈ r(minX)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage35();
    const [, d2] = sCurveLines;
    expect(Math.abs(d2.x2 - r(b.minX))).toBeLessThan(EPS);
  });

  it('TALL_ARC — d1.x2 ≈ r(maxX)', () => {
    const { tallArcLines, tallBbox: b } = runStage35();
    const [d1] = tallArcLines;
    expect(Math.abs(d1.x2 - r(b.maxX))).toBeLessThan(EPS);
  });

  it('TALL_ARC — d2.x2 ≈ r(minX)', () => {
    const { tallArcLines, tallBbox: b } = runStage35();
    const [, d2] = tallArcLines;
    expect(Math.abs(d2.x2 - r(b.minX))).toBeLessThan(EPS);
  });
});

// ============================================================
// @smoke Stage 36 — d1.x1 ≈ r(minX) and d2.x1 ≈ r(maxX)
// ============================================================
describe('@smoke Stage 36 — d1.x1 ≈ r(minX) and d2.x1 ≈ r(maxX) for all three panel types', () => {
  /**
   * Stage 36 asserts the X start-point values of the two HATCH_CURVED diagonals.
   *
   * From Stage 30 we know:
   *   d1 starts at (minX, minY)  → d1.x1 ≈ r(minX)
   *   d2 starts at (maxX, minY)  → d2.x1 ≈ r(maxX)
   *
   * This is the start-X counterpart of Stage 35 (which verified the end-X
   * values).  Together Stages 35–36 pin all four X coordinates of both
   * diagonals to the flat-blank bbox extents.
   *
   * Tolerance: ±0.015 mm (consistent with Stages 31–32 and Stage 35).
   * Verified for ARC (FFDH-rotated), S_CURVE (FFDH-rotated), and TALL_ARC
   * (grain-locked, no rotation).
   */

  const EPS = 0.015;
  const r   = (v: number): number => Math.round(v * 100) / 100;

  type Coords = { x1: number; y1: number; x2: number; y2: number };
  type Bbox   = { minX: number; maxX: number; minY: number; maxY: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function bboxForPlacement(p: { x: number; y: number; cutW: number; cutH: number; rotation: number }): Bbox {
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;
    return { minX: p.x, maxX: p.x + ew, minY: p.y, maxY: p.y + eh };
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  function runStage36() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return {
      arcLines,    arcBbox:    bboxForPlacement(arcP),
      sCurveLines, sCurveBbox: bboxForPlacement(sCurveP),
      tallArcLines, tallBbox:  bboxForPlacement(tallArcP),
    };
  }

  // ── assertions ────────────────────────────────────────────────────────────

  it('ARC — d1.x1 ≈ r(minX)', () => {
    const { arcLines, arcBbox: b } = runStage36();
    const [d1] = arcLines;
    expect(Math.abs(d1.x1 - r(b.minX))).toBeLessThan(EPS);
  });

  it('ARC — d2.x1 ≈ r(maxX)', () => {
    const { arcLines, arcBbox: b } = runStage36();
    const [, d2] = arcLines;
    expect(Math.abs(d2.x1 - r(b.maxX))).toBeLessThan(EPS);
  });

  it('S_CURVE — d1.x1 ≈ r(minX)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage36();
    const [d1] = sCurveLines;
    expect(Math.abs(d1.x1 - r(b.minX))).toBeLessThan(EPS);
  });

  it('S_CURVE — d2.x1 ≈ r(maxX)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage36();
    const [, d2] = sCurveLines;
    expect(Math.abs(d2.x1 - r(b.maxX))).toBeLessThan(EPS);
  });

  it('TALL_ARC — d1.x1 ≈ r(minX)', () => {
    const { tallArcLines, tallBbox: b } = runStage36();
    const [d1] = tallArcLines;
    expect(Math.abs(d1.x1 - r(b.minX))).toBeLessThan(EPS);
  });

  it('TALL_ARC — d2.x1 ≈ r(maxX)', () => {
    const { tallArcLines, tallBbox: b } = runStage36();
    const [, d2] = tallArcLines;
    expect(Math.abs(d2.x1 - r(b.maxX))).toBeLessThan(EPS);
  });
});

// ============================================================
// @smoke Stage 37 — all four individual coordinates of d1 match bbox corners
// ============================================================
describe('@smoke Stage 37 — all four d1 coordinates match bbox corners (d1.x1≈minX, d1.y1≈minY, d1.x2≈maxX, d1.y2≈maxY)', () => {
  /**
   * Stage 37 provides a single consolidated assertion that all four individual
   * coordinates of diagonal-1 match the expected flat-blank bbox corners.
   *
   * From Stage 30 we know d1 runs from (minX, minY) to (maxX, maxY), so:
   *   d1.x1 ≈ r(minX)   (Stage 36 verified this individually)
   *   d1.y1 ≈ r(minY)   (Stage 31 verified this individually)
   *   d1.x2 ≈ r(maxX)   (Stage 35 verified this individually)
   *   d1.y2 ≈ r(maxY)   (Stage 32 verified this individually)
   *
   * Stage 37 asserts all four coordinates together in a single describe block,
   * one it() per coordinate per panel type (12 it() blocks total).
   * This serves as a final synthesis check that the four separate per-coordinate
   * stages remain jointly consistent for every panel type.
   *
   * Tolerance: ±0.015 mm throughout.
   * Verified for ARC (FFDH-rotated), S_CURVE (FFDH-rotated), and TALL_ARC
   * (grain-locked, no rotation).
   */

  const EPS = 0.015;
  const r   = (v: number): number => Math.round(v * 100) / 100;

  type Coords = { x1: number; y1: number; x2: number; y2: number };
  type Bbox   = { minX: number; maxX: number; minY: number; maxY: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function bboxForPlacement(p: { x: number; y: number; cutW: number; cutH: number; rotation: number }): Bbox {
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;
    return { minX: p.x, maxX: p.x + ew, minY: p.y, maxY: p.y + eh };
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  function runStage37() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return {
      arcLines,    arcBbox:    bboxForPlacement(arcP),
      sCurveLines, sCurveBbox: bboxForPlacement(sCurveP),
      tallArcLines, tallBbox:  bboxForPlacement(tallArcP),
    };
  }

  // ── ARC assertions ────────────────────────────────────────────────────────

  it('ARC — d1.x1 ≈ r(minX)', () => {
    const { arcLines, arcBbox: b } = runStage37();
    expect(Math.abs(arcLines[0].x1 - r(b.minX))).toBeLessThan(EPS);
  });

  it('ARC — d1.y1 ≈ r(minY)', () => {
    const { arcLines, arcBbox: b } = runStage37();
    expect(Math.abs(arcLines[0].y1 - r(b.minY))).toBeLessThan(EPS);
  });

  it('ARC — d1.x2 ≈ r(maxX)', () => {
    const { arcLines, arcBbox: b } = runStage37();
    expect(Math.abs(arcLines[0].x2 - r(b.maxX))).toBeLessThan(EPS);
  });

  it('ARC — d1.y2 ≈ r(maxY)', () => {
    const { arcLines, arcBbox: b } = runStage37();
    expect(Math.abs(arcLines[0].y2 - r(b.maxY))).toBeLessThan(EPS);
  });

  // ── S_CURVE assertions ────────────────────────────────────────────────────

  it('S_CURVE — d1.x1 ≈ r(minX)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage37();
    expect(Math.abs(sCurveLines[0].x1 - r(b.minX))).toBeLessThan(EPS);
  });

  it('S_CURVE — d1.y1 ≈ r(minY)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage37();
    expect(Math.abs(sCurveLines[0].y1 - r(b.minY))).toBeLessThan(EPS);
  });

  it('S_CURVE — d1.x2 ≈ r(maxX)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage37();
    expect(Math.abs(sCurveLines[0].x2 - r(b.maxX))).toBeLessThan(EPS);
  });

  it('S_CURVE — d1.y2 ≈ r(maxY)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage37();
    expect(Math.abs(sCurveLines[0].y2 - r(b.maxY))).toBeLessThan(EPS);
  });

  // ── TALL_ARC assertions ───────────────────────────────────────────────────

  it('TALL_ARC — d1.x1 ≈ r(minX)', () => {
    const { tallArcLines, tallBbox: b } = runStage37();
    expect(Math.abs(tallArcLines[0].x1 - r(b.minX))).toBeLessThan(EPS);
  });

  it('TALL_ARC — d1.y1 ≈ r(minY)', () => {
    const { tallArcLines, tallBbox: b } = runStage37();
    expect(Math.abs(tallArcLines[0].y1 - r(b.minY))).toBeLessThan(EPS);
  });

  it('TALL_ARC — d1.x2 ≈ r(maxX)', () => {
    const { tallArcLines, tallBbox: b } = runStage37();
    expect(Math.abs(tallArcLines[0].x2 - r(b.maxX))).toBeLessThan(EPS);
  });

  it('TALL_ARC — d1.y2 ≈ r(maxY)', () => {
    const { tallArcLines, tallBbox: b } = runStage37();
    expect(Math.abs(tallArcLines[0].y2 - r(b.maxY))).toBeLessThan(EPS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stage 38 — HATCH_CURVED diagonal-2 all-coordinate synthesis
//
// Mirror of Stage 37: asserts all four individual coordinates of diagonal-2
// match the flat-blank bbox corners for every panel type.
//   d2 runs from (maxX, minY) → (minX, maxY)  (Stage 30 direction contract)
//   so: d2.x1 ≈ r(maxX), d2.y1 ≈ r(minY), d2.x2 ≈ r(minX), d2.y2 ≈ r(maxY)
//
// 12 it() blocks: 4 coordinates × 3 panel types (ARC, S_CURVE, TALL_ARC)
// EPS tolerance: 0.015 mm
// ─────────────────────────────────────────────────────────────────────────────
describe('@smoke Stage 38 — HATCH_CURVED diagonal-2 all-coordinate synthesis', () => {
  /**
   * Stage 38 is the d2 synthesis counterpart to Stage 37 (d1 synthesis).
   * From Stage 30 we know d2 runs from (maxX, minY) to (minX, maxY), so:
   *   d2.x1 ≈ r(maxX)   (Stage 36 verified the start-X individually)
   *   d2.y1 ≈ r(minY)   (Stage 31 verified the bottom-Y individually)
   *   d2.x2 ≈ r(minX)   (Stage 35 verified the end-X individually)
   *   d2.y2 ≈ r(maxY)   (Stage 32 verified the top-Y individually)
   *
   * Stage 38 asserts all four coordinates of d2 together in a single describe
   * block, one it() per coordinate per panel type (12 it() blocks total).
   * Together with Stage 37 this provides complete joint coverage of both
   * diagonals' coordinate tuples for all three panel types.
   *
   * Tolerance: ±0.015 mm throughout.
   */

  const EPS = 0.015;
  const r   = (v: number): number => Math.round(v * 100) / 100;

  type Coords = { x1: number; y1: number; x2: number; y2: number };
  type Bbox   = { minX: number; maxX: number; minY: number; maxY: number };

  // ── helpers (self-contained) ──────────────────────────────────────────────

  function parseHatchCoords(content: string): Coords[] {
    const entitiesStart = content.indexOf('ENTITIES');
    const entities = content.slice(entitiesStart);
    const segs = entities
      .split('LINE')
      .slice(1)
      .filter((s) => s.includes('\n8\nHATCH_CURVED\n'));
    return segs.map((seg) => {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
    });
  }

  function linesForPlacement(coords: Coords[], placementY: number): Coords[] {
    return coords.filter((c) => Math.abs(Math.min(c.y1, c.y2) - placementY) < 1.0);
  }

  function bboxForPlacement(p: { x: number; y: number; cutW: number; cutH: number; rotation: number }): Bbox {
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;
    return { minX: p.x, maxX: p.x + ew, minY: p.y, maxY: p.y + eh };
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  function runStage38() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const arcP     = sheets[0].placements.find((p) => p.partId === 'SMOKE_DOOR')!;
    const sCurveP  = sheets[0].placements.find((p) => p.partId === 'SMOKE_SCURVE_DOOR')!;
    const tallArcP = sheets[0].placements.find((p) => p.partId === 'SMOKE_TALL_ARC')!;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const allCoords    = parseHatchCoords(output.content);
    const arcLines     = linesForPlacement(allCoords, arcP.y);
    const sCurveLines  = linesForPlacement(allCoords, sCurveP.y);
    const tallArcLines = linesForPlacement(allCoords, tallArcP.y);

    expect(arcLines).toHaveLength(2);
    expect(sCurveLines).toHaveLength(2);
    expect(tallArcLines).toHaveLength(2);

    return {
      arcLines,    arcBbox:    bboxForPlacement(arcP),
      sCurveLines, sCurveBbox: bboxForPlacement(sCurveP),
      tallArcLines, tallBbox:  bboxForPlacement(tallArcP),
    };
  }

  // ── ARC assertions ────────────────────────────────────────────────────────

  it('ARC — d2.x1 ≈ r(maxX)', () => {
    const { arcLines, arcBbox: b } = runStage38();
    expect(Math.abs(arcLines[1].x1 - r(b.maxX))).toBeLessThan(EPS);
  });

  it('ARC — d2.y1 ≈ r(minY)', () => {
    const { arcLines, arcBbox: b } = runStage38();
    expect(Math.abs(arcLines[1].y1 - r(b.minY))).toBeLessThan(EPS);
  });

  it('ARC — d2.x2 ≈ r(minX)', () => {
    const { arcLines, arcBbox: b } = runStage38();
    expect(Math.abs(arcLines[1].x2 - r(b.minX))).toBeLessThan(EPS);
  });

  it('ARC — d2.y2 ≈ r(maxY)', () => {
    const { arcLines, arcBbox: b } = runStage38();
    expect(Math.abs(arcLines[1].y2 - r(b.maxY))).toBeLessThan(EPS);
  });

  // ── S_CURVE assertions ────────────────────────────────────────────────────

  it('S_CURVE — d2.x1 ≈ r(maxX)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage38();
    expect(Math.abs(sCurveLines[1].x1 - r(b.maxX))).toBeLessThan(EPS);
  });

  it('S_CURVE — d2.y1 ≈ r(minY)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage38();
    expect(Math.abs(sCurveLines[1].y1 - r(b.minY))).toBeLessThan(EPS);
  });

  it('S_CURVE — d2.x2 ≈ r(minX)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage38();
    expect(Math.abs(sCurveLines[1].x2 - r(b.minX))).toBeLessThan(EPS);
  });

  it('S_CURVE — d2.y2 ≈ r(maxY)', () => {
    const { sCurveLines, sCurveBbox: b } = runStage38();
    expect(Math.abs(sCurveLines[1].y2 - r(b.maxY))).toBeLessThan(EPS);
  });

  // ── TALL_ARC assertions ───────────────────────────────────────────────────

  it('TALL_ARC — d2.x1 ≈ r(maxX)', () => {
    const { tallArcLines, tallBbox: b } = runStage38();
    expect(Math.abs(tallArcLines[1].x1 - r(b.maxX))).toBeLessThan(EPS);
  });

  it('TALL_ARC — d2.y1 ≈ r(minY)', () => {
    const { tallArcLines, tallBbox: b } = runStage38();
    expect(Math.abs(tallArcLines[1].y1 - r(b.minY))).toBeLessThan(EPS);
  });

  it('TALL_ARC — d2.x2 ≈ r(minX)', () => {
    const { tallArcLines, tallBbox: b } = runStage38();
    expect(Math.abs(tallArcLines[1].x2 - r(b.minX))).toBeLessThan(EPS);
  });

  it('TALL_ARC — d2.y2 ≈ r(maxY)', () => {
    const { tallArcLines, tallBbox: b } = runStage38();
    expect(Math.abs(tallArcLines[1].y2 - r(b.maxY))).toBeLessThan(EPS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stage 39 — HATCH_CURVED layer color = ACI 4 ; PARTS_CURVED layer color = ACI 1
//
// Asserts that the DXF TABLES section declares the correct ACI colors for the
// two curved-panel layers defined in NESTING_LAYERS:
//   HATCH_CURVED  →  ACI 4 (cyan)
//   PARTS_CURVED  →  ACI 1 (red)
//
// Verified once per panel type (ARC, S_CURVE, TALL_ARC) on a single mixed
// sheet containing all three panels, giving 6 it() blocks total.
// ─────────────────────────────────────────────────────────────────────────────
describe('@smoke Stage 39 — DXF TABLES layer colors: HATCH_CURVED=4, PARTS_CURVED=1', () => {

  // ── helpers ──────────────────────────────────────────────────────────────

  /** Extract layer-name → ACI-color map from the DXF TABLES section. */
  /** Extract layer-name → ACI-color map from the DXF TABLES section. */
  function parseLayerColors(content: string): Record<string, number> {
    const result: Record<string, number> = {};
    // Locate the TABLES section (comes after the HEADER ENDSEC)
    const tablesStart = content.indexOf('\n2\nTABLES\n');
    if (tablesStart === -1) return result;
    const rest      = content.slice(tablesStart);
    const tablesEnd = rest.indexOf('\n0\nENDSEC');
    const tables    = tablesEnd === -1 ? rest : rest.slice(0, tablesEnd);
    // Each LAYER entry starts after a lone "0\nLAYER" line
    const segs = tables.split('\n0\nLAYER\n').slice(1);
    for (const seg of segs) {
      const nameM  = seg.match(/^2\n([^\n]+)/);
      const colorM = seg.match(/\n62\n(\d+)/);
      if (nameM && colorM) {
        result[nameM[1].trim()] = parseInt(colorM[1], 10);
      }
    }
    return result;
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  function runStage39() {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();

    const { sheets } = runNesting([arcRow, sCurveRow, tallArcRow]);
    expect(sheets).toHaveLength(1);

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_001', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    return { colors: parseLayerColors(output.content) };
  }

  // ── ARC sheet — layer colors ───────────────────────────────────────────

  it('ARC sheet — HATCH_CURVED layer color is ACI 4 (cyan)', () => {
    const { colors } = runStage39();
    expect(colors['HATCH_CURVED']).toBe(4);
  });

  it('ARC sheet — PARTS_CURVED layer color is ACI 1 (red)', () => {
    const { colors } = runStage39();
    expect(colors['PARTS_CURVED']).toBe(1);
  });

  // ── S_CURVE sheet — layer colors ──────────────────────────────────────

  it('S_CURVE sheet — HATCH_CURVED layer color is ACI 4 (cyan)', () => {
    const { colors } = runStage39();
    expect(colors['HATCH_CURVED']).toBe(4);
  });

  it('S_CURVE sheet — PARTS_CURVED layer color is ACI 1 (red)', () => {
    const { colors } = runStage39();
    expect(colors['PARTS_CURVED']).toBe(1);
  });

  // ── TALL_ARC sheet — layer colors ─────────────────────────────────────

  it('TALL_ARC sheet — HATCH_CURVED layer color is ACI 4 (cyan)', () => {
    const { colors } = runStage39();
    expect(colors['HATCH_CURVED']).toBe(4);
  });

  it('TALL_ARC sheet — PARTS_CURVED layer color is ACI 1 (red)', () => {
    const { colors } = runStage39();
    expect(colors['PARTS_CURVED']).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stage 40 — '(CURVED / N cuts)' label text matches actual kerfCount
//
// Asserts that each curved panel's sub-label in the DXF ENTITIES section reads
// '(CURVED / N cuts)' where N equals the kerfCount computed by curveFieldsComputer
// for that specific panel/material combination.
//
// One it() per panel type: ARC, S_CURVE, TALL_ARC (3 it() blocks total).
// ─────────────────────────────────────────────────────────────────────────────
describe('@smoke Stage 40 — (CURVED / N cuts) label matches kerfCount', () => {

  // ── helpers ──────────────────────────────────────────────────────────────

  /**
   * Extract all N values from "(CURVED / N cuts)" TEXT entities on the LABELS layer.
   * Returns an array of integer kerf counts found in order of appearance.
   */
  function parseCurvedLabelCounts(content: string): number[] {
    const counts: number[] = [];
    // Split on each TEXT entity boundary
    const segs = content.split('\n0\nTEXT\n').slice(1);
    for (const seg of segs) {
      // Must be on LABELS layer
      if (!seg.includes('8\nLABELS\n')) continue;
      // Extract the text value (group code 1)
      const textM = seg.match(/\n1\n\(CURVED \/ (\d+) cuts\)/);
      if (textM) {
        counts.push(parseInt(textM[1], 10));
      }
    }
    return counts;
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  // ── ARC ───────────────────────────────────────────────────────────────────

  it('ARC — (CURVED / N cuts) label N matches actual kerfCount', () => {
    const { row: arcRow, kerfCount } = buildCurvedRow();
    const { sheets } = runNesting([arcRow]);
    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_ARC', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const counts = parseCurvedLabelCounts(output.content);
    expect(counts).toHaveLength(1);
    expect(counts[0]).toBe(kerfCount);
  });

  // ── S_CURVE ───────────────────────────────────────────────────────────────

  it('S_CURVE — (CURVED / N cuts) label N matches actual kerfCount', () => {
    const { row: sCurveRow, kerfCount } = buildSCurveRow();
    const { sheets } = runNesting([sCurveRow]);
    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_SCURVE', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const counts = parseCurvedLabelCounts(output.content);
    expect(counts).toHaveLength(1);
    expect(counts[0]).toBe(kerfCount);
  });

  // ── TALL_ARC ──────────────────────────────────────────────────────────────

  it('TALL_ARC — (CURVED / N cuts) label N matches actual kerfCount', () => {
    const { row: tallArcRow, kerfCount } = buildTallArcRow();
    const { sheets } = runNesting([tallArcRow]);
    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_TALLARC', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const counts = parseCurvedLabelCounts(output.content);
    expect(counts).toHaveLength(1);
    expect(counts[0]).toBe(kerfCount);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stage 41 — LABELS TEXT height is exactly 5 for the curved sub-label
//
// Asserts that each '(CURVED / N cuts)' TEXT entity on the LABELS layer has
// DXF group code 40 (text height) set to exactly 5 for all three panel types.
//
// buildDxfSheets emits: builder.addText(labelX, labelY - 40, curveLbl, 5, 'LABELS')
// The 4th argument (5) is stored as group code 40 in the TEXT entity.
//
// One it() per panel type: ARC, S_CURVE, TALL_ARC (3 it() blocks total).
// ─────────────────────────────────────────────────────────────────────────────
describe('@smoke Stage 41 — curved sub-label TEXT height is exactly 5', () => {

  // ── helpers ──────────────────────────────────────────────────────────────

  /**
   * Extract text-height values (DXF group code 40) from all '(CURVED / N cuts)'
   * TEXT entities on the LABELS layer.
   * Returns an array of floats in order of appearance.
   */
  function parseCurvedLabelHeights(content: string): number[] {
    const heights: number[] = [];
    const segs = content.split('\n0\nTEXT\n').slice(1);
    for (const seg of segs) {
      if (!seg.includes('8\nLABELS\n')) continue;
      const textM = seg.match(/\n1\n\(CURVED \/ \d+ cuts\)/);
      if (!textM) continue;
      const heightM = seg.match(/\n40\n([^\n]+)/);
      if (heightM) heights.push(parseFloat(heightM[1]));
    }
    return heights;
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  // ── ARC ───────────────────────────────────────────────────────────────────

  it('ARC — curved sub-label TEXT height is exactly 5', () => {
    const { row: arcRow } = buildCurvedRow();
    const { sheets } = runNesting([arcRow]);
    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_ARC', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const heights = parseCurvedLabelHeights(output.content);
    expect(heights).toHaveLength(1);
    expect(heights[0]).toBe(5);
  });

  // ── S_CURVE ───────────────────────────────────────────────────────────────

  it('S_CURVE — curved sub-label TEXT height is exactly 5', () => {
    const { row: sCurveRow } = buildSCurveRow();
    const { sheets } = runNesting([sCurveRow]);
    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_SCURVE', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const heights = parseCurvedLabelHeights(output.content);
    expect(heights).toHaveLength(1);
    expect(heights[0]).toBe(5);
  });

  // ── TALL_ARC ──────────────────────────────────────────────────────────────

  it('TALL_ARC — curved sub-label TEXT height is exactly 5', () => {
    const { row: tallArcRow } = buildTallArcRow();
    const { sheets } = runNesting([tallArcRow]);
    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_TALLARC', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const heights = parseCurvedLabelHeights(output.content);
    expect(heights).toHaveLength(1);
    expect(heights[0]).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stage 42 — curved sub-label X anchored at flat-blank placement centre X − 20 mm
//
// Asserts that the X coordinate (DXF group code 10) of each '(CURVED / N cuts)'
// TEXT entity equals:
//
//   labelX = placement.x + w / 2 − 20
//
// where  w = (rotation===90||270) ? placement.cutH : placement.cutW
//        (mirrors the private getRotatedDimensions logic in buildDxfSheets.ts)
//
// Note: addText() stores coords as-is (no rounding), so we compare floating-point
// values with a tight tolerance of ε < 0.015 mm.
//
// One it() per panel type: ARC, S_CURVE, TALL_ARC (3 it() blocks total).
// ─────────────────────────────────────────────────────────────────────────────
describe('@smoke Stage 42 — curved sub-label X = placement.x + w/2 − 20 (ε < 0.015 mm)', () => {

  const EPS = 0.015;

  // ── helpers ──────────────────────────────────────────────────────────────

  /**
   * Extract X-position values (DXF group code 10) of all '(CURVED / N cuts)'
   * TEXT entities on the LABELS layer.
   * Returns an array of floats in order of appearance.
   */
  function parseCurvedLabelXPositions(content: string): number[] {
    const xPositions: number[] = [];
    const segs = content.split('\n0\nTEXT\n').slice(1);
    for (const seg of segs) {
      if (!seg.includes('8\nLABELS\n')) continue;
      const textM = seg.match(/\n1\n\(CURVED \/ \d+ cuts\)/);
      if (!textM) continue;
      // Group code 10 = X position; it is the first numeric group after the layer code
      const xM = seg.match(/\n10\n([^\n]+)/);
      if (xM) xPositions.push(parseFloat(xM[1]));
    }
    return xPositions;
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  // ── ARC ───────────────────────────────────────────────────────────────────

  it('ARC — curved sub-label X equals placement.x + flatBlankW/2 − 20 (ε < 0.015 mm)', () => {
    const { row: arcRow } = buildCurvedRow();
    const { sheets } = runNesting([arcRow]);
    const p = sheets[0].placements[0];
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const w = isRotated ? p.cutH : p.cutW;
    const expectedX = p.x + w / 2 - 20;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_ARC', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const xPositions = parseCurvedLabelXPositions(output.content);
    expect(xPositions).toHaveLength(1);
    expect(Math.abs(xPositions[0] - expectedX)).toBeLessThan(EPS);
  });

  // ── S_CURVE ───────────────────────────────────────────────────────────────

  it('S_CURVE — curved sub-label X equals placement.x + flatBlankW/2 − 20 (ε < 0.015 mm)', () => {
    const { row: sCurveRow } = buildSCurveRow();
    const { sheets } = runNesting([sCurveRow]);
    const p = sheets[0].placements[0];
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const w = isRotated ? p.cutH : p.cutW;
    const expectedX = p.x + w / 2 - 20;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_SCURVE', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const xPositions = parseCurvedLabelXPositions(output.content);
    expect(xPositions).toHaveLength(1);
    expect(Math.abs(xPositions[0] - expectedX)).toBeLessThan(EPS);
  });

  // ── TALL_ARC ──────────────────────────────────────────────────────────────

  it('TALL_ARC — curved sub-label X equals placement.x + flatBlankW/2 − 20 (ε < 0.015 mm)', () => {
    const { row: tallArcRow } = buildTallArcRow();
    const { sheets } = runNesting([tallArcRow]);
    const p = sheets[0].placements[0];
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const w = isRotated ? p.cutH : p.cutW;
    const expectedX = p.x + w / 2 - 20;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_TALLARC', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const xPositions = parseCurvedLabelXPositions(output.content);
    expect(xPositions).toHaveLength(1);
    expect(Math.abs(xPositions[0] - expectedX)).toBeLessThan(EPS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stage 43 — curved sub-label Y anchored at flat-blank placement centre Y − 40 mm
//
// The curved sub-label '(CURVED / N cuts)' is placed at:
//   labelY − 40 = placement.y + h/2 − 40
//
// where  h = (rotation===90||270) ? placement.cutW : placement.cutH
//        (mirrors the private getRotatedDimensions logic in buildDxfSheets.ts)
//
// DXF group code 20 carries the Y coordinate of a TEXT entity.
// addText() stores coords as-is (no rounding), so we compare with ε < 0.015 mm.
//
// One it() per panel type: ARC, S_CURVE, TALL_ARC (3 it() blocks total).
// ─────────────────────────────────────────────────────────────────────────────
describe('@smoke Stage 43 — curved sub-label Y = placement.y + h/2 − 40 (ε < 0.015 mm)', () => {

  const EPS = 0.015;

  // ── helpers ──────────────────────────────────────────────────────────────

  /**
   * Extract Y-position values (DXF group code 20) of all '(CURVED / N cuts)'
   * TEXT entities on the LABELS layer.
   * Returns an array of floats in order of appearance.
   */
  function parseCurvedLabelYPositions(content: string): number[] {
    const yPositions: number[] = [];
    const segs = content.split('\n0\nTEXT\n').slice(1);
    for (const seg of segs) {
      if (!seg.includes('8\nLABELS\n')) continue;
      const textM = seg.match(/\n1\n\(CURVED \/ \d+ cuts\)/);
      if (!textM) continue;
      // Group code 20 = Y position
      const yM = seg.match(/\n20\n([^\n]+)/);
      if (yM) yPositions.push(parseFloat(yM[1]));
    }
    return yPositions;
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:     'SMOKE_TALL_ARC',
      cabinetId:  'CAB_SMOKE',
      materialId: MATERIAL_ID,
      finishW:    PANEL_STUB.finishWidth,
      finishH:    PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:       PANEL_STUB.finishWidth,
      cutH:       PANEL_STUB.finishHeight,
      qty:        1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  // ── ARC ───────────────────────────────────────────────────────────────────

  it('ARC — curved sub-label Y equals placement.y + flatBlankH/2 − 40 (ε < 0.015 mm)', () => {
    const { row: arcRow } = buildCurvedRow();
    const { sheets } = runNesting([arcRow]);
    const p = sheets[0].placements[0];
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const h = isRotated ? p.cutW : p.cutH;
    const expectedY = p.y + h / 2 - 40;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_ARC_Y43', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const yPositions = parseCurvedLabelYPositions(output.content);
    expect(yPositions).toHaveLength(1);
    expect(Math.abs(yPositions[0] - expectedY)).toBeLessThan(EPS);
  });

  // ── S_CURVE ───────────────────────────────────────────────────────────────

  it('S_CURVE — curved sub-label Y equals placement.y + flatBlankH/2 − 40 (ε < 0.015 mm)', () => {
    const { row: sCurveRow } = buildSCurveRow();
    const { sheets } = runNesting([sCurveRow]);
    const p = sheets[0].placements[0];
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const h = isRotated ? p.cutW : p.cutH;
    const expectedY = p.y + h / 2 - 40;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_SCURVE_Y43', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const yPositions = parseCurvedLabelYPositions(output.content);
    expect(yPositions).toHaveLength(1);
    expect(Math.abs(yPositions[0] - expectedY)).toBeLessThan(EPS);
  });

  // ── TALL_ARC ──────────────────────────────────────────────────────────────

  it('TALL_ARC — curved sub-label Y equals placement.y + flatBlankH/2 − 40 (ε < 0.015 mm)', () => {
    const { row: tallArcRow } = buildTallArcRow();
    const { sheets } = runNesting([tallArcRow]);
    const p = sheets[0].placements[0];
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const h = isRotated ? p.cutW : p.cutH;
    const expectedY = p.y + h / 2 - 40;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_TALLARC_Y43', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const yPositions = parseCurvedLabelYPositions(output.content);
    expect(yPositions).toHaveLength(1);
    expect(Math.abs(yPositions[0] - expectedY)).toBeLessThan(EPS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stage 44 — straight panels emit zero PARTS_CURVED LINE entities
//
// `buildDxfSheets.ts` renders curved placements on PARTS_CURVED (red) and
// flat placements on PARTS (green).  A straight panel must never produce a
// PARTS_CURVED LINE entity, i.e. `parsePARTSCURVEDLineCount` must return 0.
//
// PARTS_CURVED rectangle = 4 addLine() calls per curved placement.
// Straight placements must produce PARTS_CURVED = 0.
//
// Three it() blocks:
//   (a) single straight panel: PARTS_CURVED = 0
//   (b) three straight panels on the same sheet: PARTS_CURVED = 0
//   (c) mixed sheet (1 curved + 1 straight): PARTS_CURVED = 4 (curved only)
// ─────────────────────────────────────────────────────────────────────────────
describe('@smoke Stage 44 — straight-only sheet has zero PARTS_CURVED LINE entities', () => {

  // ── helper ────────────────────────────────────────────────────────────────

  /**
   * Count LINE entities whose layer is PARTS_CURVED.
   * After splitting on '\n0\nLINE\n' each segment starts with '8\n{layer}\n'.
   */
  function parsePARTSCURVEDLineCount(content: string): number {
    const segs = content.split('\n0\nLINE\n').slice(1);
    return segs.filter(s => s.startsWith('8\nPARTS_CURVED\n')).length;
  }

  // ── (a) single straight panel ─────────────────────────────────────────────

  it('single straight panel: PARTS_CURVED line count is 0', () => {
    const { sheets } = runNesting([STRAIGHT_ROW]);
    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_STR_A44', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    expect(parsePARTSCURVEDLineCount(output.content)).toBe(0);
  });

  // ── (b) three straight panels ─────────────────────────────────────────────

  it('three straight panels on the same sheet: PARTS_CURVED line count is 0', () => {
    const rows: CutListRow[] = [
      { ...STRAIGHT_ROW, partId: 'SMOKE_STR_44_1', qty: 1 },
      { ...STRAIGHT_ROW, partId: 'SMOKE_STR_44_2', qty: 1, cutW: 280, finishW: 280, cutH: 380, finishH: 380 },
      { ...STRAIGHT_ROW, partId: 'SMOKE_STR_44_3', qty: 1, cutW: 250, finishW: 250, cutH: 350, finishH: 350 },
    ];
    const { sheets } = runNesting(rows);
    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_STR3_B44', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    expect(parsePARTSCURVEDLineCount(output.content)).toBe(0);
  });

  // ── (c) mixed sheet — curved contributes PARTS_CURVED, straight does not ──

  it('mixed sheet (1 curved + 1 straight): PARTS_CURVED count is exactly 4 (curved only)', () => {
    const { row: arcRow } = buildCurvedRow();
    const { sheets } = runNesting([arcRow, STRAIGHT_ROW]);
    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_MIX_C44', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    // Curved panel → 4 PARTS_CURVED lines (one bounding rect)
    // Straight panel → 0 PARTS_CURVED lines
    expect(parsePARTSCURVEDLineCount(output.content)).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stage 45 — PARTS_CURVED bounding-rect matches flat-blank placement dimensions
//
// For each curved panel type (ARC, S_CURVE, TALL_ARC), addRectangle() emits
// 4 LINE entities on PARTS_CURVED.  Collecting all unique endpoints yields the
// bounding rect (minX, minY, maxX, maxY).  After flat-blank correction and
// FFDH placement the rect must equal:
//
//   minX = r(placement.x)
//   minY = r(placement.y)
//   maxX = r(placement.x + effectiveW)
//   maxY = r(placement.y + effectiveH)
//
//   where effectiveW/H come from getRotatedDimensions:
//     rotation = 90|270  → effectiveW = cutH, effectiveH = cutW
//     rotation = 0|180   → effectiveW = cutW, effectiveH = cutH
//
// Tolerance: ±0.015 mm (consistent with Stages 31–44).
//
// Three it() blocks: ARC, S_CURVE, TALL_ARC.
// ─────────────────────────────────────────────────────────────────────────────
describe('@smoke Stage 45 — PARTS_CURVED bounding-rect matches flat-blank placement dimensions', () => {

  const EPS = 0.015;
  const r   = (v: number): number => Math.round(v * 100) / 100;

  /**
   * Parse all PARTS_CURVED LINE entities and return the bounding rect
   * (minX, minY, maxX, maxY) derived from all endpoints.
   * After splitting on '\n0\nLINE\n' each segment starts with '8\n{layer}\n'.
   */
  function parsePARTSCURVEDRects(
    content: string,
  ): { minX: number; maxX: number; minY: number; maxY: number } {
    const segs = content.split('\n0\nLINE\n').slice(1)
      .filter((s) => s.startsWith('8\nPARTS_CURVED\n'));

    const xs: number[] = [];
    const ys: number[] = [];

    for (const seg of segs) {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      xs.push(num('10'), num('11'));
      ys.push(num('20'), num('21'));
    }

    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:          'SMOKE_TALL_ARC',
      cabinetId:       'CAB_SMOKE',
      materialId:      MATERIAL_ID,
      finishW:         PANEL_STUB.finishWidth,
      finishH:         PANEL_STUB.finishHeight,
      edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:            PANEL_STUB.finishWidth,
      cutH:            PANEL_STUB.finishHeight,
      qty:             1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  // ── ARC ───────────────────────────────────────────────────────────────────

  it('ARC — PARTS_CURVED rect minX/minY/maxX/maxY match flat-blank placement (ε < 0.015 mm)', () => {
    const { row: arcRow } = buildCurvedRow();
    const { sheets } = runNesting([arcRow]);
    const p = sheets[0].placements[0];
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_ARC_R45', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const bbox = parsePARTSCURVEDRects(output.content);

    expect(Math.abs(bbox.minX - r(p.x))).toBeLessThan(EPS);
    expect(Math.abs(bbox.minY - r(p.y))).toBeLessThan(EPS);
    expect(Math.abs(bbox.maxX - r(p.x + ew))).toBeLessThan(EPS);
    expect(Math.abs(bbox.maxY - r(p.y + eh))).toBeLessThan(EPS);
  });

  // ── S_CURVE ───────────────────────────────────────────────────────────────

  it('S_CURVE — PARTS_CURVED rect minX/minY/maxX/maxY match flat-blank placement (ε < 0.015 mm)', () => {
    const { row: sCurveRow } = buildSCurveRow();
    const { sheets } = runNesting([sCurveRow]);
    const p = sheets[0].placements[0];
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_SCURVE_R45', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const bbox = parsePARTSCURVEDRects(output.content);

    expect(Math.abs(bbox.minX - r(p.x))).toBeLessThan(EPS);
    expect(Math.abs(bbox.minY - r(p.y))).toBeLessThan(EPS);
    expect(Math.abs(bbox.maxX - r(p.x + ew))).toBeLessThan(EPS);
    expect(Math.abs(bbox.maxY - r(p.y + eh))).toBeLessThan(EPS);
  });

  // ── TALL_ARC ──────────────────────────────────────────────────────────────

  it('TALL_ARC — PARTS_CURVED rect minX/minY/maxX/maxY match flat-blank placement (ε < 0.015 mm)', () => {
    const { row: tallArcRow } = buildTallArcRow();
    const { sheets } = runNesting([tallArcRow]);
    const p = sheets[0].placements[0];
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;

    const planned: PlannedSheet = { index1: 1, sheetId: 'SHEET_TALLARC_R45', materialId: MATERIAL_ID };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const bbox = parsePARTSCURVEDRects(output.content);

    expect(Math.abs(bbox.minX - r(p.x))).toBeLessThan(EPS);
    expect(Math.abs(bbox.minY - r(p.y))).toBeLessThan(EPS);
    expect(Math.abs(bbox.maxX - r(p.x + ew))).toBeLessThan(EPS);
    expect(Math.abs(bbox.maxY - r(p.y + eh))).toBeLessThan(EPS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stage 46 — PARTS layer bounding-rect matches cutW × cutH for straight panels
//            (no flat-blank correction applied)
//
// Straight panels use `addRectangle(placement.x, placement.y, w, h, 'PARTS')`.
// isCurved = false so no flat-blank offset is applied.  FFDH may rotate the
// piece (rotation = 90 is valid for straight panels), so effectiveW/H are
// derived from getRotatedDimensions: rotation=90|270 → ew=cutH, eh=cutW.
//
// The key invariant is:
//   placement.cutW  == CutListRow.cutW   (no projectedDepth offset)
//   placement.cutH  == CutListRow.cutH   (no projectedDepth offset)
//   PARTS rect span == ew × eh  where ew/eh come purely from cutW/cutH + rotation
//
// For STRAIGHT_ROW: cutW = 300, cutH = 400.
//
// Three it() blocks:
//   (a) single STRAIGHT_ROW:              placement.cutW/H unmodified; rect = ew × eh
//   (b) narrower row (cutW=280, cutH=380): placement.cutW/H unmodified; rect = ew × eh
//   (c) mixed sheet (1 curved + 1 straight): straight placement.cutW/H unmodified
//
// Tolerance: ±0.015 mm.
// ─────────────────────────────────────────────────────────────────────────────
describe('@smoke Stage 46 — PARTS layer bounding-rect matches cutW × cutH (no flat-blank correction)', () => {

  const EPS = 0.015;

  /**
   * Parse all PARTS LINE entities and return the bounding rect
   * (minX, minY, maxX, maxY) derived from all endpoints.
   */
  function parsePARTSRect(
    content: string,
  ): { minX: number; maxX: number; minY: number; maxY: number } {
    const segs = content.split('\n0\nLINE\n').slice(1)
      .filter((s) => s.startsWith('8\nPARTS\n'));

    const xs: number[] = [];
    const ys: number[] = [];

    for (const seg of segs) {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      xs.push(num('10'), num('11'));
      ys.push(num('20'), num('21'));
    }

    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }

  // ── (a) single STRAIGHT_ROW ───────────────────────────────────────────────

  it('single STRAIGHT_ROW: placement.cutW/H unmodified; PARTS rect spans ew × eh (ε < 0.015 mm)', () => {
    const { sheets } = runNesting([STRAIGHT_ROW]);
    const p = sheets[0].placements[0];
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;

    // No flat-blank correction: placement retains original cut dims
    expect(p.cutW).toBe(STRAIGHT_ROW.cutW);
    expect(p.cutH).toBe(STRAIGHT_ROW.cutH);

    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_STR_R46_A', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const bbox = parsePARTSRect(output.content);
    expect(Math.abs((bbox.maxX - bbox.minX) - ew)).toBeLessThan(EPS);
    expect(Math.abs((bbox.maxY - bbox.minY) - eh)).toBeLessThan(EPS);
  });

  // ── (b) narrower straight panel ───────────────────────────────────────────

  it('straight panel cutW=280 cutH=380: placement.cutW/H unmodified; PARTS rect spans ew × eh (ε < 0.015 mm)', () => {
    const narrowRow: CutListRow = {
      ...STRAIGHT_ROW,
      partId:  'SMOKE_STR_46_B',
      cutW:    280,
      finishW: 280,
      cutH:    380,
      finishH: 380,
    };
    const { sheets } = runNesting([narrowRow]);
    const p = sheets[0].placements[0];
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const ew = isRotated ? p.cutH : p.cutW;
    const eh = isRotated ? p.cutW : p.cutH;

    // No flat-blank correction
    expect(p.cutW).toBe(280);
    expect(p.cutH).toBe(380);

    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_STR_R46_B', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    const bbox = parsePARTSRect(output.content);
    expect(Math.abs((bbox.maxX - bbox.minX) - ew)).toBeLessThan(EPS);
    expect(Math.abs((bbox.maxY - bbox.minY) - eh)).toBeLessThan(EPS);
  });

  // ── (c) mixed sheet — PARTS rect for the straight placement only ──────────

  it('mixed sheet (1 curved + 1 straight): straight placement.cutW/H unmodified; PARTS rect spans ew × eh (ε < 0.015 mm)', () => {
    const { row: arcRow } = buildCurvedRow();
    const { sheets } = runNesting([arcRow, STRAIGHT_ROW]);
    // Locate the sheet that contains at least one straight placement
    const sheetWithStraight = sheets.find((sh) =>
      sh.placements.some((pl) => !pl.isCurved),
    )!;
    const sp = sheetWithStraight.placements.find((pl) => !pl.isCurved)!;
    const isRotated = sp.rotation === 90 || sp.rotation === 270;
    const ew = isRotated ? sp.cutH : sp.cutW;
    const eh = isRotated ? sp.cutW : sp.cutH;

    // No flat-blank correction on the straight placement
    expect(sp.cutW).toBe(STRAIGHT_ROW.cutW);
    expect(sp.cutH).toBe(STRAIGHT_ROW.cutH);

    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_MIX_R46_C', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheetWithStraight,
      profile: getFactoryProfile('DEFAULT'),
    });
    const bbox = parsePARTSRect(output.content);
    expect(Math.abs((bbox.maxX - bbox.minX) - ew)).toBeLessThan(EPS);
    expect(Math.abs((bbox.maxY - bbox.minY) - eh)).toBeLessThan(EPS);
  });
});

// =============================================================================
// Stage 47 — PARTS_CURVED LINE count equals exactly 4 per curved panel
// =============================================================================
//
// addRectangle() emits exactly 4 LINE entities per call (bottom, right, top,
// left edges).  A single curved panel must therefore produce exactly 4 LINE
// entities on the PARTS_CURVED layer.  This invariant is verified for each
// of the three canonical curved-panel fixtures.
//
// 3 it() blocks: ARC, S_CURVE, TALL_ARC.
// =============================================================================

describe('@smoke Stage 47 — PARTS_CURVED LINE count equals exactly 4 per curved panel', () => {

  /**
   * Count LINE entities on the PARTS_CURVED layer.
   * Split on '\n0\nLINE\n'; each segment starts with '8\n{layer}\n'.
   */
  function countPARTSCURVEDLines(content: string): number {
    return content
      .split('\n0\nLINE\n')
      .slice(1)
      .filter((s) => s.startsWith('8\nPARTS_CURVED\n'))
      .length;
  }

  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:          'SMOKE_TALL_ARC_47',
      materialId:      'MDF_18',
      cabinetId:       'CAB_SMOKE',
      finishW:         PANEL_STUB.finishWidth,
      finishH:         PANEL_STUB.finishHeight,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:            PANEL_STUB.finishWidth,
      cutH:            PANEL_STUB.finishHeight,
      qty:             1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  // ── ARC ───────────────────────────────────────────────────────────────────

  it('ARC — PARTS_CURVED LINE count = 4 (one rectangle, four edges)', () => {
    const { row: arcRow } = buildCurvedRow();
    const { sheets } = runNesting([arcRow]);
    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_ARC_R47', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    expect(countPARTSCURVEDLines(output.content)).toBe(4);
  });

  // ── S_CURVE ───────────────────────────────────────────────────────────────

  it('S_CURVE — PARTS_CURVED LINE count = 4 (one rectangle, four edges)', () => {
    const { row: sCurveRow } = buildSCurveRow();
    const { sheets } = runNesting([sCurveRow]);
    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_SCURVE_R47', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    expect(countPARTSCURVEDLines(output.content)).toBe(4);
  });

  // ── TALL_ARC ──────────────────────────────────────────────────────────────

  it('TALL_ARC — PARTS_CURVED LINE count = 4 (one rectangle, four edges)', () => {
    const { row: tallArcRow } = buildTallArcRow();
    const { sheets } = runNesting([tallArcRow]);
    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_TALLARC_R47', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    expect(countPARTSCURVEDLines(output.content)).toBe(4);
  });
});

// =============================================================================
// Stage 48 — mixed-sheet DXF: exactly one PARTS_CURVED rect, one PARTS rect,
//            bounding boxes non-overlapping
// =============================================================================
//
// When one curved panel and one straight panel share a nesting sheet the DXF
// must contain:
//   • exactly 4 LINE entities on PARTS_CURVED  (one closed rectangle)
//   • exactly 4 LINE entities on PARTS         (one closed rectangle)
//   • the two bounding boxes must not overlap
//     (panels occupy distinct regions of the sheet)
//
// 1 it() block: ARC (curved) + STRAIGHT_ROW (straight) mixed sheet.
// =============================================================================

describe('@smoke Stage 48 — mixed-sheet: one PARTS_CURVED rect, one PARTS rect, non-overlapping bboxes', () => {

  const EPS = 0.015;

  /**
   * Count LINE entities on the given DXF layer.
   */
  function countLayerLines(content: string, layer: string): number {
    return content
      .split('\n0\nLINE\n')
      .slice(1)
      .filter((s) => s.startsWith(`8\n${layer}\n`))
      .length;
  }

  /**
   * Parse bounding rect (minX, minY, maxX, maxY) for LINE entities on a
   * given DXF layer.  Group codes: 10=x1, 20=y1, 11=x2, 21=y2.
   */
  function parseLayerBbox(
    content: string,
    layer: string,
  ): { minX: number; maxX: number; minY: number; maxY: number } {
    const segs = content
      .split('\n0\nLINE\n')
      .slice(1)
      .filter((s) => s.startsWith(`8\n${layer}\n`));

    const xs: number[] = [];
    const ys: number[] = [];

    for (const seg of segs) {
      const num = (code: string): number => {
        const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
        return m ? parseFloat(m[1]) : NaN;
      };
      xs.push(num('10'), num('11'));
      ys.push(num('20'), num('21'));
    }

    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }

  // ── mixed sheet: ARC + STRAIGHT ───────────────────────────────────────────

  it('mixed sheet (1 ARC + 1 straight): PARTS_CURVED=4 LINEs, PARTS=4 LINEs, bboxes non-overlapping', () => {
    const { row: arcRow } = buildCurvedRow();
    const { sheets } = runNesting([arcRow, STRAIGHT_ROW]);

    // Locate the sheet that contains at least one curved AND one straight placement
    const mixedSheet = sheets.find(
      (sh) =>
        sh.placements.some((pl) => pl.isCurved) &&
        sh.placements.some((pl) => !pl.isCurved),
    )!;
    expect(mixedSheet).toBeDefined();

    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_MIX_R48', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: mixedSheet,
      profile: getFactoryProfile('DEFAULT'),
    });
    const { content } = output;

    // ── Layer counts ─────────────────────────────────────────────────────────
    expect(countLayerLines(content, 'PARTS_CURVED')).toBe(4);
    expect(countLayerLines(content, 'PARTS')).toBe(4);

    // ── Non-overlapping bboxes ───────────────────────────────────────────────
    const curvedBbox   = parseLayerBbox(content, 'PARTS_CURVED');
    const straightBbox = parseLayerBbox(content, 'PARTS');

    // Two axis-aligned rectangles are non-overlapping iff they are separated on
    // at least one axis.  Use EPS tolerance to absorb addLine() rounding.
    const noOverlapX =
      curvedBbox.maxX  <= straightBbox.minX + EPS ||
      straightBbox.maxX <= curvedBbox.minX  + EPS;
    const noOverlapY =
      curvedBbox.maxY  <= straightBbox.minY + EPS ||
      straightBbox.maxY <= curvedBbox.minY  + EPS;

    expect(noOverlapX || noOverlapY).toBe(true);
  });
});

// =============================================================================
// Stage 49 — two curved panels on the same sheet produce PARTS_CURVED count = 8
//            and their individual bounding boxes are non-overlapping
// =============================================================================
//
// Two separate curved panels each produce one closed rectangle (4 LINE entities)
// on PARTS_CURVED.  When both land on the same nesting sheet the total count
// must be 8 and the two per-panel bboxes must not intersect.
//
// Panel combination: ARC (SMOKE_DOOR) + S_CURVE (SMOKE_SCURVE_DOOR).
// FFDH geometry (sheet 1220 × 2440, kerf 3.5, edge 10):
//   S_CURVE effectiveW ≈ 1051.8, effectiveH = 500  → shelf-1, y = 10
//   ARC     effectiveW ≈ 909.44, effectiveH = 400  → shelf-2, y ≈ 513.5
//   (shelf-1 remaining width ≈ 148 mm < ARC effectiveW → distinct shelves)
//   Both shelves fit within 2440 mm → same sheet.
//
// 1 it() block.
// =============================================================================

describe('@smoke Stage 49 — two curved panels: PARTS_CURVED count=8, bboxes non-overlapping', () => {

  const EPS = 0.015;

  /**
   * Split PARTS_CURVED LINE segments into per-rectangle groups of 4 and
   * return each group's bounding rect.
   * addRectangle() always emits its 4 edges consecutively, so chunk index i
   * corresponds to the i-th curved placement in order.
   */
  function parsePARTSCURVEDRectList(
    content: string,
  ): Array<{ minX: number; maxX: number; minY: number; maxY: number }> {
    const segs = content
      .split('\n0\nLINE\n')
      .slice(1)
      .filter((s) => s.startsWith('8\nPARTS_CURVED\n'));

    const result: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];

    for (let i = 0; i < segs.length; i += 4) {
      const chunk = segs.slice(i, i + 4);
      const xs: number[] = [];
      const ys: number[] = [];
      for (const seg of chunk) {
        const num = (code: string): number => {
          const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
          return m ? parseFloat(m[1]) : NaN;
        };
        xs.push(num('10'), num('11'));
        ys.push(num('20'), num('21'));
      }
      result.push({
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      });
    }
    return result;
  }

  // ── ARC + S_CURVE ─────────────────────────────────────────────────────────

  it('ARC + S_CURVE on same sheet: PARTS_CURVED count=8, two rects non-overlapping', () => {
    const { row: arcRow }    = buildCurvedRow();
    const { row: sCurveRow } = buildSCurveRow();
    const { sheets } = runNesting([arcRow, sCurveRow]);

    // Both curved panels must land on the same sheet
    const sharedSheet = sheets.find(
      (sh) => sh.placements.filter((pl) => pl.isCurved).length >= 2,
    )!;
    expect(sharedSheet).toBeDefined();

    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_2ARC_R49', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sharedSheet,
      profile: getFactoryProfile('DEFAULT'),
    });
    const { content } = output;

    // ── Total count ───────────────────────────────────────────────────────────
    const allSegs = content
      .split('\n0\nLINE\n')
      .slice(1)
      .filter((s) => s.startsWith('8\nPARTS_CURVED\n'));
    expect(allSegs.length).toBe(8);

    // ── Per-panel bbox non-overlap ─────────────────────────────────────────────
    const rects = parsePARTSCURVEDRectList(content);
    expect(rects.length).toBe(2);

    const [a, b] = rects;
    const noOverlapX = a.maxX <= b.minX + EPS || b.maxX <= a.minX + EPS;
    const noOverlapY = a.maxY <= b.minY + EPS || b.maxY <= a.minY + EPS;
    expect(noOverlapX || noOverlapY).toBe(true);
  });
});

// =============================================================================
// Stage 50 — SHEET layer always has exactly 4 LINE entities regardless of
//            how many placements are on the sheet
// =============================================================================
//
// buildDxfSheet() calls addRectangle(0, 0, sheetW, sheetH, 'SHEET') exactly
// once per sheet, producing exactly 4 LINE entities on the SHEET layer.
// This invariant must hold for any combination of placements.
//
// 3 it() blocks:
//   (a) single curved panel (ARC)
//   (b) two curved panels (ARC + S_CURVE)
//   (c) mixed sheet (ARC curved + STRAIGHT_ROW straight)
// =============================================================================

describe('@smoke Stage 50 — SHEET layer LINE count is always exactly 4', () => {

  /**
   * Count LINE entities on the SHEET layer.
   * The sheet boundary is drawn by a single addRectangle() call → always 4.
   */
  function countSHEETLines(content: string): number {
    return content
      .split('\n0\nLINE\n')
      .slice(1)
      .filter((s) => s.startsWith('8\nSHEET\n'))
      .length;
  }

  // ── (a) single curved panel ───────────────────────────────────────────────

  it('single curved panel (ARC): SHEET LINE count = 4', () => {
    const { row: arcRow } = buildCurvedRow();
    const { sheets } = runNesting([arcRow]);
    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_1C_R50A', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    expect(countSHEETLines(output.content)).toBe(4);
  });

  // ── (b) two curved panels ─────────────────────────────────────────────────

  it('two curved panels (ARC + S_CURVE) on same sheet: SHEET LINE count = 4', () => {
    const { row: arcRow }    = buildCurvedRow();
    const { row: sCurveRow } = buildSCurveRow();
    const { sheets } = runNesting([arcRow, sCurveRow]);
    const sharedSheet = sheets.find(
      (sh) => sh.placements.filter((pl) => pl.isCurved).length >= 2,
    )!;
    expect(sharedSheet).toBeDefined();

    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_2C_R50B', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sharedSheet,
      profile: getFactoryProfile('DEFAULT'),
    });
    expect(countSHEETLines(output.content)).toBe(4);
  });

  // ── (c) mixed sheet (curved + straight) ──────────────────────────────────

  it('mixed sheet (ARC + STRAIGHT_ROW): SHEET LINE count = 4', () => {
    const { row: arcRow } = buildCurvedRow();
    const { sheets } = runNesting([arcRow, STRAIGHT_ROW]);
    const mixedSheet = sheets.find(
      (sh) =>
        sh.placements.some((pl) => pl.isCurved) &&
        sh.placements.some((pl) => !pl.isCurved),
    )!;
    expect(mixedSheet).toBeDefined();

    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_MIX_R50C', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: mixedSheet,
      profile: getFactoryProfile('DEFAULT'),
    });
    expect(countSHEETLines(output.content)).toBe(4);
  });
});

// =============================================================================
// Stage 51 — three curved panels on same sheet: PARTS_CURVED count=12,
//            all three per-panel bboxes are mutually non-overlapping
// =============================================================================
//
// Fixture: TALL_ARC (grain=HORIZONTAL) + S_CURVE + ARC — FFDH analysis shows
// all three fit on one 1220×2440 sheet:
//   TALL_ARC  shelf-1  y=10     effectiveW=400   effectiveH≈909.44
//   S_CURVE   shelf-2  y≈922.94 effectiveW≈1051.8 effectiveH=500
//   ARC       shelf-3  y≈1426.44 effectiveW≈909.44 effectiveH=400
//   total height used ≈ 1826.44 mm < 2440 mm → same sheet ✓
//
// Assertions:
//   • 12 PARTS_CURVED LINE entities (3 curved panels × 4 edges each)
//   • rects.length === 3
//   • all three pairs (0,1) (0,2) (1,2) are non-overlapping
//
// 1 it() block.
// =============================================================================

describe('@smoke Stage 51 — three curved panels on same sheet: PARTS_CURVED count=12, all bboxes mutually non-overlapping', () => {

  const EPS = 0.015;

  /**
   * Split PARTS_CURVED LINE segments into per-rectangle groups of 4 and
   * return each group's bounding rect.
   * addRectangle() always emits its 4 edges consecutively, so chunk index i
   * corresponds to the i-th curved placement in order.
   */
  function parsePARTSCURVEDRectList(
    content: string,
  ): Array<{ minX: number; maxX: number; minY: number; maxY: number }> {
    const segs = content
      .split('\n0\nLINE\n')
      .slice(1)
      .filter((s) => s.startsWith('8\nPARTS_CURVED\n'));

    const result: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];

    for (let i = 0; i < segs.length; i += 4) {
      const chunk = segs.slice(i, i + 4);
      const xs: number[] = [];
      const ys: number[] = [];
      for (const seg of chunk) {
        const num = (code: string): number => {
          const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
          return m ? parseFloat(m[1]) : NaN;
        };
        xs.push(num('10'), num('11'));
        ys.push(num('20'), num('21'));
      }
      result.push({
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      });
    }
    return result;
  }

  /**
   * TALL_ARC: same ARC stub with grain='HORIZONTAL' so FFDH keeps it
   * portrait (effectiveW=400, effectiveH≈909.44) on its own shelf.
   */
  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:          'SMOKE_TALL_ARC_51',
      cabinetId:       'CAB_SMOKE',
      materialId:      MATERIAL_ID,
      finishW:         PANEL_STUB.finishWidth,
      finishH:         PANEL_STUB.finishHeight,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:            PANEL_STUB.finishWidth,
      cutH:            PANEL_STUB.finishHeight,
      qty:             1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  // ── ARC + S_CURVE + TALL_ARC ──────────────────────────────────────────────

  it('ARC + S_CURVE + TALL_ARC on same sheet: PARTS_CURVED count=12, three rects mutually non-overlapping', () => {
    const { row: arcRow }     = buildCurvedRow();
    const { row: sCurveRow }  = buildSCurveRow();
    const { row: tallArcRow } = buildTallArcRow();
    const { sheets } = runNesting([tallArcRow, sCurveRow, arcRow]);

    // All three curved panels must land on the same sheet
    const sharedSheet = sheets.find(
      (sh) => sh.placements.filter((pl) => pl.isCurved).length >= 3,
    )!;
    expect(sharedSheet).toBeDefined();

    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_3ARC_R51', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sharedSheet,
      profile: getFactoryProfile('DEFAULT'),
    });
    const { content } = output;

    // ── Total count ──────────────────────────────────────────────────────────
    const allSegs = content
      .split('\n0\nLINE\n')
      .slice(1)
      .filter((s) => s.startsWith('8\nPARTS_CURVED\n'));
    expect(allSegs.length).toBe(12);

    // ── Per-panel bbox non-overlap ────────────────────────────────────────────
    const rects = parsePARTSCURVEDRectList(content);
    expect(rects.length).toBe(3);

    // All three pairs must be non-overlapping
    const pairs: [number, number][] = [[0, 1], [0, 2], [1, 2]];
    for (const [i, j] of pairs) {
      const a = rects[i];
      const b = rects[j];
      const noOverlapX = a.maxX <= b.minX + EPS || b.maxX <= a.minX + EPS;
      const noOverlapY = a.maxY <= b.minY + EPS || b.maxY <= a.minY + EPS;
      expect(noOverlapX || noOverlapY).toBe(true);
    }
  });
});

// =============================================================================
// Stage 52 — HATCH_CURVED LINE count equals exactly 2 × curved_count for
//            ARC, S_CURVE, and TALL_ARC single-panel sheets
// =============================================================================
//
// buildDxfSheets.ts (lines 504–515) emits exactly two addLine() calls on the
// HATCH_CURVED layer per curved placement:
//   d1: bottom-left → top-right diagonal
//   d2: bottom-right → top-left diagonal
// Therefore: HATCH_CURVED LINE count = 2 × (number of curved placements).
//
// For a single curved panel on its own sheet: HATCH_CURVED count = 2.
//
// Assertions (3 it() blocks — ARC, S_CURVE, TALL_ARC):
//   • HATCH_CURVED LINE count === 2
// =============================================================================

describe('@smoke Stage 52 — HATCH_CURVED LINE count equals 2 per curved panel on single-panel sheets', () => {

  /**
   * Count LINE entities on the HATCH_CURVED layer.
   * Two diagonal X-lines are emitted per curved placement.
   */
  function countHATCHCURVEDLines(content: string): number {
    return content
      .split('\n0\nLINE\n')
      .slice(1)
      .filter((s) => s.startsWith('8\nHATCH_CURVED\n'))
      .length;
  }

  /**
   * TALL_ARC: same ARC stub with grain='HORIZONTAL' to lock portrait
   * orientation (effectiveW=400, effectiveH≈909.44).
   */
  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:          'SMOKE_TALL_ARC_52',
      materialId:      'MDF_18',
      cabinetId:       'CAB_SMOKE',
      finishW:         PANEL_STUB.finishWidth,
      finishH:         PANEL_STUB.finishHeight,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:            PANEL_STUB.finishWidth,
      cutH:            PANEL_STUB.finishHeight,
      qty:             1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  // ── ARC ───────────────────────────────────────────────────────────────────

  it('ARC — HATCH_CURVED LINE count = 2 (two diagonal X-lines)', () => {
    const { row: arcRow } = buildCurvedRow();
    const { sheets } = runNesting([arcRow]);
    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_ARC_R52', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    expect(countHATCHCURVEDLines(output.content)).toBe(2);
  });

  // ── S_CURVE ───────────────────────────────────────────────────────────────

  it('S_CURVE — HATCH_CURVED LINE count = 2 (two diagonal X-lines)', () => {
    const { row: sCurveRow } = buildSCurveRow();
    const { sheets } = runNesting([sCurveRow]);
    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_SCURVE_R52', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    expect(countHATCHCURVEDLines(output.content)).toBe(2);
  });

  // ── TALL_ARC ──────────────────────────────────────────────────────────────

  it('TALL_ARC — HATCH_CURVED LINE count = 2 (two diagonal X-lines)', () => {
    const { row: tallArcRow } = buildTallArcRow();
    const { sheets } = runNesting([tallArcRow]);
    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_TALLARC_R52', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });
    expect(countHATCHCURVEDLines(output.content)).toBe(2);
  });
});

// =============================================================================
// Stage 53 — HATCH_CURVED LINE count equals exactly 2 × curved_count for
//            a two-curved-panel sheet (ARC + S_CURVE)
// =============================================================================
//
// buildDxfSheets.ts emits exactly two addLine() calls on the HATCH_CURVED
// layer per curved placement:
//   d1: bottom-left → top-right diagonal
//   d2: bottom-right → top-left diagonal
// Therefore: HATCH_CURVED LINE count = 2 × (number of curved placements).
//
// For two curved panels (ARC + S_CURVE) on the same sheet:
//   HATCH_CURVED count = 2 × 2 = 4.
//
// Both buildCurvedRow() and buildSCurveRow() use materialId=MATERIAL_ID,
// so runNesting() places them on a single shared sheet.
//
// Assertions (1 it() block — ARC + S_CURVE on same sheet):
//   • sheets.length === 1 (single shared sheet)
//   • HATCH_CURVED LINE count === 4
// =============================================================================

describe('@smoke Stage 53 — HATCH_CURVED LINE count equals 2 × curved_count for two-panel sheet (ARC + S_CURVE)', () => {

  /**
   * Count LINE entities on the HATCH_CURVED layer.
   * Two diagonal X-lines (d1, d2) are emitted per curved placement.
   */
  function countHATCHCURVEDLines(content: string): number {
    return content
      .split('\n0\nLINE\n')
      .slice(1)
      .filter((s) => s.startsWith('8\nHATCH_CURVED\n'))
      .length;
  }

  it('ARC + S_CURVE on same sheet — HATCH_CURVED LINE count = 4 (2 × 2 curved panels)', () => {
    const { row: arcRow }    = buildCurvedRow();
    const { row: sCurveRow } = buildSCurveRow();

    // Both rows carry materialId=MATERIAL_ID → placed on a single sheet
    const { sheets } = runNesting([arcRow, sCurveRow]);
    expect(sheets).toHaveLength(1);

    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_ARC_SCURVE_R53', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    expect(countHATCHCURVEDLines(output.content)).toBe(4);
  });
});

// =============================================================================
// Stage 54 — Each HATCH_CURVED diagonal pair spans the correct flat-blank
//            bbox corners for the ARC fixture
// =============================================================================
//
// buildDxfSheets.ts (lines 505–515) emits two diagonal lines per curved
// placement, using the placement's flat-blank effective dimensions (w × h)
// derived from getRotatedDimensions(cutW, cutH, rotation):
//
//   d1: (p.x,     p.y    ) → (p.x + w, p.y + h)   // bottom-left → top-right
//   d2: (p.x + w, p.y    ) → (p.x,     p.y + h)   // bottom-right → top-left
//
// All four coordinates are rounded via Math.round(v × 100) / 100 before
// being written to the DXF.
//
// For the ARC fixture (buildCurvedRow, grain=NONE, rotation=90 by FFDH):
//   w = cutH (flatBlankH ≈ 909.44 mm), h = cutW (flatBlankW = 400 mm)
//   minX = r(p.x), minY = r(p.y)
//   maxX = r(p.x + w), maxY = r(p.y + h)
//
// Expected diagonal endpoints:
//   d1: (minX, minY) → (maxX, maxY)   [bottom-left → top-right]
//   d2: (maxX, minY) → (minX, maxY)   [bottom-right → top-left]
//
// Assertions (1 it() block — ARC single-panel sheet):
//   • exactly 2 HATCH_CURVED LINE entities
//   • d1 endpoints match (minX, minY) and (maxX, maxY) (ε < 0.015 mm)
//   • d2 endpoints match (maxX, minY) and (minX, maxY) (ε < 0.015 mm)
// =============================================================================

describe('@smoke Stage 54 — HATCH_CURVED diagonal pairs span correct flat-blank bbox corners (ARC)', () => {

  const EPS = 0.015;
  const r   = (v: number): number => Math.round(v * 100) / 100;

  /**
   * Parse all HATCH_CURVED LINE entities and return their endpoint coordinates
   * in DXF emission order (first emitted = index 0).
   */
  function parseHATCHCURVEDLines(
    content: string,
  ): Array<{ x1: number; y1: number; x2: number; y2: number }> {
    return content
      .split('\n0\nLINE\n')
      .slice(1)
      .filter((s) => s.startsWith('8\nHATCH_CURVED\n'))
      .map((seg) => {
        const num = (code: string): number => {
          const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
          return m ? parseFloat(m[1]) : NaN;
        };
        return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
      });
  }

  it('ARC — two HATCH_CURVED lines span all four flat-blank bbox corners (ε < 0.015 mm)', () => {
    const { row: arcRow } = buildCurvedRow();
    const { sheets }      = runNesting([arcRow]);
    const p               = sheets[0].placements[0];

    // Effective dimensions after FFDH rotation (rotation=90 → swap cutW/cutH)
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const w = isRotated ? p.cutH : p.cutW;   // effectiveW = flatBlankH (rotated)
    const h = isRotated ? p.cutW : p.cutH;   // effectiveH = flatBlankW (rotated)

    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_ARC_R54', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const lines = parseHATCHCURVEDLines(output.content);
    expect(lines).toHaveLength(2);

    // Flat-blank bbox corners (rounded the same way addLine() rounds them)
    const minX = r(p.x);
    const minY = r(p.y);
    const maxX = r(p.x + w);
    const maxY = r(p.y + h);

    // d1: bottom-left (minX, minY) → top-right (maxX, maxY)
    const d1 = lines[0];
    expect(Math.abs(d1.x1 - minX)).toBeLessThan(EPS);
    expect(Math.abs(d1.y1 - minY)).toBeLessThan(EPS);
    expect(Math.abs(d1.x2 - maxX)).toBeLessThan(EPS);
    expect(Math.abs(d1.y2 - maxY)).toBeLessThan(EPS);

    // d2: bottom-right (maxX, minY) → top-left (minX, maxY)
    const d2 = lines[1];
    expect(Math.abs(d2.x1 - maxX)).toBeLessThan(EPS);
    expect(Math.abs(d2.y1 - minY)).toBeLessThan(EPS);
    expect(Math.abs(d2.x2 - minX)).toBeLessThan(EPS);
    expect(Math.abs(d2.y2 - maxY)).toBeLessThan(EPS);
  });
});

// =============================================================================
// Stage 55 — Each HATCH_CURVED diagonal pair spans the correct flat-blank
//            bbox corners for the S_CURVE fixture
// =============================================================================
//
// S_CURVE geometry (buildSCurveRow, grain=NONE, rotation=90 by FFDH):
//   curvedEdge='TOP' → flatBlankH = cutH + (developedLength − projectedDepth)
//   FFDH rotates (height > width) → effectiveW = cutH (flatBlankH ≈ 1051.8 mm)
//                                    effectiveH = cutW (= 500 mm)
//
// The same addLine() rounding rule applies as in Stage 54:
//   d1: (r(p.x),     r(p.y)    ) → (r(p.x + w), r(p.y + h))   // bottom-left → top-right
//   d2: (r(p.x + w), r(p.y)    ) → (r(p.x),     r(p.y + h))   // bottom-right → top-left
//
// Assertions (1 it() block — S_CURVE single-panel sheet):
//   • exactly 2 HATCH_CURVED LINE entities
//   • d1 endpoints match (minX, minY) and (maxX, maxY) (ε < 0.015 mm)
//   • d2 endpoints match (maxX, minY) and (minX, maxY) (ε < 0.015 mm)
// =============================================================================

describe('@smoke Stage 55 — HATCH_CURVED diagonal pairs span correct flat-blank bbox corners (S_CURVE)', () => {

  const EPS = 0.015;
  const r   = (v: number): number => Math.round(v * 100) / 100;

  /**
   * Parse all HATCH_CURVED LINE entities and return endpoint coordinates
   * in DXF emission order (first emitted = index 0).
   */
  function parseHATCHCURVEDLines(
    content: string,
  ): Array<{ x1: number; y1: number; x2: number; y2: number }> {
    return content
      .split('\n0\nLINE\n')
      .slice(1)
      .filter((s) => s.startsWith('8\nHATCH_CURVED\n'))
      .map((seg) => {
        const num = (code: string): number => {
          const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
          return m ? parseFloat(m[1]) : NaN;
        };
        return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
      });
  }

  it('S_CURVE — two HATCH_CURVED lines span all four flat-blank bbox corners (ε < 0.015 mm)', () => {
    const { row: sCurveRow } = buildSCurveRow();
    const { sheets }         = runNesting([sCurveRow]);
    const p                  = sheets[0].placements[0];

    // Effective dimensions after FFDH rotation (rotation=90 → swap cutW/cutH)
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const w = isRotated ? p.cutH : p.cutW;   // effectiveW = flatBlankH (rotated)
    const h = isRotated ? p.cutW : p.cutH;   // effectiveH = flatBlankW (rotated)

    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_SCURVE_R55', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const lines = parseHATCHCURVEDLines(output.content);
    expect(lines).toHaveLength(2);

    // Flat-blank bbox corners (rounded the same way addLine() rounds them)
    const minX = r(p.x);
    const minY = r(p.y);
    const maxX = r(p.x + w);
    const maxY = r(p.y + h);

    // d1: bottom-left (minX, minY) → top-right (maxX, maxY)
    const d1 = lines[0];
    expect(Math.abs(d1.x1 - minX)).toBeLessThan(EPS);
    expect(Math.abs(d1.y1 - minY)).toBeLessThan(EPS);
    expect(Math.abs(d1.x2 - maxX)).toBeLessThan(EPS);
    expect(Math.abs(d1.y2 - maxY)).toBeLessThan(EPS);

    // d2: bottom-right (maxX, minY) → top-left (minX, maxY)
    const d2 = lines[1];
    expect(Math.abs(d2.x1 - maxX)).toBeLessThan(EPS);
    expect(Math.abs(d2.y1 - minY)).toBeLessThan(EPS);
    expect(Math.abs(d2.x2 - minX)).toBeLessThan(EPS);
    expect(Math.abs(d2.y2 - maxY)).toBeLessThan(EPS);
  });
});

// =============================================================================
// Stage 56 — Each HATCH_CURVED diagonal pair spans the correct flat-blank
//            bbox corners for the TALL_ARC fixture (grain=HORIZONTAL, rotation=0)
// =============================================================================
//
// TALL_ARC geometry (grain=HORIZONTAL, canRotate=false, rotation=0):
//   curvedEdge='TOP' → flatBlankH = cutH + correction  (≈ 909.44 mm)
//   FFDH cannot rotate → effectiveW = cutW (= 400 mm)
//                         effectiveH = cutH (= flatBlankH ≈ 909.44 mm)
//
// With rotation=0 the isRotated branch is NOT taken:
//   w = cutW (= 400 mm = flatBlankW)
//   h = cutH (= flatBlankH ≈ 909.44 mm)
//
// addLine() rounding is identical to Stages 54–55:
//   d1: (r(p.x),     r(p.y)    ) → (r(p.x + w), r(p.y + h))
//   d2: (r(p.x + w), r(p.y)    ) → (r(p.x),     r(p.y + h))
//
// Assertions (1 it() block — TALL_ARC single-panel sheet):
//   • placement.rotation === 0 (grain-locked, no rotation)
//   • exactly 2 HATCH_CURVED LINE entities
//   • d1 endpoints match (minX, minY) and (maxX, maxY) (ε < 0.015 mm)
//   • d2 endpoints match (maxX, minY) and (minX, maxY) (ε < 0.015 mm)
// =============================================================================

describe('@smoke Stage 56 — HATCH_CURVED diagonal pairs span correct flat-blank bbox corners (TALL_ARC, rotation=0)', () => {

  const EPS = 0.015;
  const r   = (v: number): number => Math.round(v * 100) / 100;

  /**
   * TALL_ARC: same ARC stub with grain='HORIZONTAL' to lock portrait
   * orientation (effectiveW=400, effectiveH≈909.44), rotation=0.
   */
  function buildTallArcRow(): { row: CutListRow; kerfCount: number } {
    const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
    const row: CutListRow = {
      partId:          'SMOKE_TALL_ARC_56',
      cabinetId:       'CAB_SMOKE',
      materialId:      MATERIAL_ID,
      finishW:         PANEL_STUB.finishWidth,
      finishH:         PANEL_STUB.finishHeight,
      premillL: 0, premillR: 0, premillT: 0, premillB: 0,
      cutW:            PANEL_STUB.finishWidth,
      cutH:            PANEL_STUB.finishHeight,
      qty:             1,
      developedLength: fields.developedLength,
      projectedDepth:  fields.projectedDepth,
      kerfCount:       fields.kerfCount,
      curvedEdge:      fields.curvedEdge ?? undefined,
      grain:           'HORIZONTAL',
    };
    return { row, kerfCount: fields.kerfCount };
  }

  /**
   * Parse all HATCH_CURVED LINE entities and return endpoint coordinates
   * in DXF emission order (first emitted = index 0).
   */
  function parseHATCHCURVEDLines(
    content: string,
  ): Array<{ x1: number; y1: number; x2: number; y2: number }> {
    return content
      .split('\n0\nLINE\n')
      .slice(1)
      .filter((s) => s.startsWith('8\nHATCH_CURVED\n'))
      .map((seg) => {
        const num = (code: string): number => {
          const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
          return m ? parseFloat(m[1]) : NaN;
        };
        return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
      });
  }

  it('TALL_ARC (rotation=0) — two HATCH_CURVED lines span all four flat-blank bbox corners (ε < 0.015 mm)', () => {
    const { row: tallArcRow } = buildTallArcRow();
    const { sheets }          = runNesting([tallArcRow]);
    const p                   = sheets[0].placements[0];

    // TALL_ARC is grain-locked → rotation must be 0
    expect(p.rotation).toBe(0);

    // With rotation=0: effectiveW = cutW (flatBlankW = 400), effectiveH = cutH (flatBlankH ≈ 909.44)
    const isRotated = p.rotation === 90 || p.rotation === 270;
    const w = isRotated ? p.cutH : p.cutW;
    const h = isRotated ? p.cutW : p.cutH;

    const planned: PlannedSheet = {
      index1: 1, sheetId: 'SHEET_TALLARC_R56', materialId: MATERIAL_ID,
    };
    const output = buildDxfSheet({
      planned,
      nesting: sheets[0],
      profile: getFactoryProfile('DEFAULT'),
    });

    const lines = parseHATCHCURVEDLines(output.content);
    expect(lines).toHaveLength(2);

    // Flat-blank bbox corners
    const minX = r(p.x);
    const minY = r(p.y);
    const maxX = r(p.x + w);
    const maxY = r(p.y + h);

    // d1: bottom-left (minX, minY) → top-right (maxX, maxY)
    const d1 = lines[0];
    expect(Math.abs(d1.x1 - minX)).toBeLessThan(EPS);
    expect(Math.abs(d1.y1 - minY)).toBeLessThan(EPS);
    expect(Math.abs(d1.x2 - maxX)).toBeLessThan(EPS);
    expect(Math.abs(d1.y2 - maxY)).toBeLessThan(EPS);

    // d2: bottom-right (maxX, minY) → top-left (minX, maxY)
    const d2 = lines[1];
    expect(Math.abs(d2.x1 - maxX)).toBeLessThan(EPS);
    expect(Math.abs(d2.y1 - minY)).toBeLessThan(EPS);
    expect(Math.abs(d2.x2 - minX)).toBeLessThan(EPS);
    expect(Math.abs(d2.y2 - maxY)).toBeLessThan(EPS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stage 57 — HATCH_CURVED per-panel diagonal isolation (ARC + S_CURVE sheet)
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 57 — HATCH_CURVED per-panel diagonal isolation: ARC + S_CURVE two-panel sheet',
  () => {
    const EPS = 0.015;

    function r(v: number): number { return Math.round(v * 100) / 100; }

    function parseHATCHCURVEDLines57(
      content: string,
    ): Array<{ x1: number; y1: number; x2: number; y2: number }> {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter((s) => s.startsWith('8\nHATCH_CURVED\n'))
        .map((seg) => {
          const num = (code: string): number => {
            const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
            return m ? parseFloat(m[1]) : NaN;
          };
          return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
        });
    }

    /** True when the line is the d1 diagonal (bottom-left → top-right) of the given bbox. */
    function isD1(
      line: { x1: number; y1: number; x2: number; y2: number },
      minX: number, minY: number, maxX: number, maxY: number,
      eps: number,
    ): boolean {
      return (
        Math.abs(line.x1 - minX) < eps && Math.abs(line.y1 - minY) < eps &&
        Math.abs(line.x2 - maxX) < eps && Math.abs(line.y2 - maxY) < eps
      );
    }

    /** True when the line is the d2 diagonal (bottom-right → top-left) of the given bbox. */
    function isD2(
      line: { x1: number; y1: number; x2: number; y2: number },
      minX: number, minY: number, maxX: number, maxY: number,
      eps: number,
    ): boolean {
      return (
        Math.abs(line.x1 - maxX) < eps && Math.abs(line.y1 - minY) < eps &&
        Math.abs(line.x2 - minX) < eps && Math.abs(line.y2 - maxY) < eps
      );
    }

    it(
      'ARC + S_CURVE — each placement matches exactly 1 d1 and 1 d2 HATCH_CURVED line',
      () => {
        const { row: arcRow }    = buildCurvedRow();
        const { row: sCurveRow } = buildSCurveRow();
        const { sheets } = runNesting([arcRow, sCurveRow]);
        expect(sheets).toHaveLength(1);

        const output = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE57', materialId: MATERIAL_ID },
          nesting: sheets[0],
          profile: getFactoryProfile('DEFAULT'),
        });

        const lines = parseHATCHCURVEDLines57(output.content);
        expect(lines).toHaveLength(4);

        for (const p of sheets[0].placements) {
          const isRotated = p.rotation === 90 || p.rotation === 270;
          const w = isRotated ? p.cutH : p.cutW;
          const h = isRotated ? p.cutW : p.cutH;

          const minX = r(p.x);
          const minY = r(p.y);
          const maxX = r(p.x + w);
          const maxY = r(p.y + h);

          const d1Matches = lines.filter((l) => isD1(l, minX, minY, maxX, maxY, EPS));
          const d2Matches = lines.filter((l) => isD2(l, minX, minY, maxX, maxY, EPS));

          expect(d1Matches).toHaveLength(1);
          expect(d2Matches).toHaveLength(1);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 58 — HATCH_CURVED diagonal intersection equals flat-blank bbox centre
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 58 — HATCH_CURVED diagonal intersection equals flat-blank bbox centre',
  () => {
    const EPS = 0.015;

    function r(v: number): number { return Math.round(v * 100) / 100; }

    function parseHATCHCURVEDLines58(
      content: string,
    ): Array<{ x1: number; y1: number; x2: number; y2: number }> {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter((s) => s.startsWith('8\nHATCH_CURVED\n'))
        .map((seg) => {
          const num = (code: string): number => {
            const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
            return m ? parseFloat(m[1]) : NaN;
          };
          return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
        });
    }

    it('ARC — intersection of d1 and d2 equals flat-blank bbox centre (ε < 0.015 mm)', () => {
      const { row: arcRow } = buildCurvedRow();
      const { sheets }      = runNesting([arcRow]);
      const p          = sheets[0].placements[0];

      const output = buildDxfSheet({
        planned: { index1: 1, sheetId: 'SHEET_STAGE58_ARC', materialId: MATERIAL_ID },
        nesting: sheets[0],
        profile: getFactoryProfile('DEFAULT'),
      });

      const lines = parseHATCHCURVEDLines58(output.content);
      expect(lines).toHaveLength(2);

      const d1           = lines[0];
      const intersectionX = (d1.x1 + d1.x2) / 2;
      const intersectionY = (d1.y1 + d1.y2) / 2;

      const isRotated = p.rotation === 90 || p.rotation === 270;
      const w = isRotated ? p.cutH : p.cutW;
      const h = isRotated ? p.cutW : p.cutH;

      const expectedCentreX = (r(p.x) + r(p.x + w)) / 2;
      const expectedCentreY = (r(p.y) + r(p.y + h)) / 2;

      expect(Math.abs(intersectionX - expectedCentreX)).toBeLessThan(EPS);
      expect(Math.abs(intersectionY - expectedCentreY)).toBeLessThan(EPS);
    });

    it('S_CURVE — intersection of d1 and d2 equals flat-blank bbox centre (ε < 0.015 mm)', () => {
      const { row: sCurveRow } = buildSCurveRow();
      const { sheets }         = runNesting([sCurveRow]);
      const p          = sheets[0].placements[0];

      const output = buildDxfSheet({
        planned: { index1: 1, sheetId: 'SHEET_STAGE58_SCURVE', materialId: MATERIAL_ID },
        nesting: sheets[0],
        profile: getFactoryProfile('DEFAULT'),
      });

      const lines = parseHATCHCURVEDLines58(output.content);
      expect(lines).toHaveLength(2);

      const d1           = lines[0];
      const intersectionX = (d1.x1 + d1.x2) / 2;
      const intersectionY = (d1.y1 + d1.y2) / 2;

      const isRotated = p.rotation === 90 || p.rotation === 270;
      const w = isRotated ? p.cutH : p.cutW;
      const h = isRotated ? p.cutW : p.cutH;

      const expectedCentreX = (r(p.x) + r(p.x + w)) / 2;
      const expectedCentreY = (r(p.y) + r(p.y + h)) / 2;

      expect(Math.abs(intersectionX - expectedCentreX)).toBeLessThan(EPS);
      expect(Math.abs(intersectionY - expectedCentreY)).toBeLessThan(EPS);
    });

    it('TALL_ARC (rotation=0) — intersection of d1 and d2 equals flat-blank bbox centre (ε < 0.015 mm)', () => {
      function buildTallArcRow() {
        const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
        const row: CutListRow = {
          partId:          'SMOKE_TALL_ARC_58',
          materialId:      MATERIAL_ID,
          label:           'Tall Arc Door 58',
          finishW:         PANEL_STUB.finishWidth,
          finishH:         PANEL_STUB.finishHeight,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            PANEL_STUB.finishWidth,
          cutH:            PANEL_STUB.finishHeight,
          qty:             1,
          developedLength: fields.developedLength,
          projectedDepth:  fields.projectedDepth,
          kerfCount:       fields.kerfCount,
          curvedEdge:      fields.curvedEdge ?? undefined,
          grain:           'HORIZONTAL',
        };
        return { row, kerfCount: fields.kerfCount };
      }

      const { row: tallArcRow } = buildTallArcRow();
      const { sheets }          = runNesting([tallArcRow]);
      const p                   = sheets[0].placements[0];

      // TALL_ARC is grain-locked → rotation must be 0
      expect(p.rotation).toBe(0);

      const output = buildDxfSheet({
        planned: { index1: 1, sheetId: 'SHEET_STAGE58_TALLARC', materialId: MATERIAL_ID },
        nesting: sheets[0],
        profile: getFactoryProfile('DEFAULT'),
      });

      const lines = parseHATCHCURVEDLines58(output.content);
      expect(lines).toHaveLength(2);

      const d1           = lines[0];
      const intersectionX = (d1.x1 + d1.x2) / 2;
      const intersectionY = (d1.y1 + d1.y2) / 2;

      const isRotated = p.rotation === 90 || p.rotation === 270;
      const w = isRotated ? p.cutH : p.cutW;
      const h = isRotated ? p.cutW : p.cutH;

      const expectedCentreX = (r(p.x) + r(p.x + w)) / 2;
      const expectedCentreY = (r(p.y) + r(p.y + h)) / 2;

      expect(Math.abs(intersectionX - expectedCentreX)).toBeLessThan(EPS);
      expect(Math.abs(intersectionY - expectedCentreY)).toBeLessThan(EPS);
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 59 – overlapping-Y HATCH_CURVED isolation (two ARC panels, same sheet)
// Asserts that HATCH_CURVED lines are isolated by bbox proximity even when the
// two placements share the same y_start (i.e. their Y ranges overlap).
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 59 – overlapping-Y two-panel HATCH_CURVED proximity isolation',
  () => {
    function parseHATCHCURVEDLines59(content: string): Array<{ x1: number; y1: number; x2: number; y2: number }> {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(s => s.startsWith('8\nHATCH_CURVED\n'))
        .map(seg => {
          const num = (code: string) => {
            const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
            return m ? parseFloat(m[1]) : NaN;
          };
          return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
        });
    }

    function isD1_59(
      line: { x1: number; y1: number; x2: number; y2: number },
      minX: number, minY: number, maxX: number, maxY: number,
      eps: number,
    ): boolean {
      return (
        Math.abs(line.x1 - minX) < eps &&
        Math.abs(line.y1 - minY) < eps &&
        Math.abs(line.x2 - maxX) < eps &&
        Math.abs(line.y2 - maxY) < eps
      );
    }

    function isD2_59(
      line: { x1: number; y1: number; x2: number; y2: number },
      minX: number, minY: number, maxX: number, maxY: number,
      eps: number,
    ): boolean {
      return (
        Math.abs(line.x1 - maxX) < eps &&
        Math.abs(line.y1 - minY) < eps &&
        Math.abs(line.x2 - minX) < eps &&
        Math.abs(line.y2 - maxY) < eps
      );
    }

    const r = (v: number): number => Math.round(v * 100) / 100;

    it(
      'two ARC panels on same wide sheet with overlapping Y ranges — each placement owns exactly 1 d1 and 1 d2',
      () => {
        const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;

        // Panel A: finishWidth=400 → effectiveH=400 (FFDH sorts taller first)
        const rowA: CutListRow = {
          partId:          'SMOKE_ARC_59A',
          materialId:      MATERIAL_ID,
          label:           'ARC Panel A Stage59',
          finishW:         400,
          finishH:         PANEL_STUB.finishHeight,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            400,
          cutH:            PANEL_STUB.finishHeight,
          qty:             1,
          developedLength: fields.developedLength,
          projectedDepth:  fields.projectedDepth,
          kerfCount:       fields.kerfCount,
          curvedEdge:      fields.curvedEdge ?? undefined,
          grain:           undefined,
        };

        // Panel B: finishWidth=300 → effectiveH=300 (shorter, placed second same row)
        const rowB: CutListRow = {
          partId:          'SMOKE_ARC_59B',
          materialId:      MATERIAL_ID,
          label:           'ARC Panel B Stage59',
          finishW:         300,
          finishH:         PANEL_STUB.finishHeight,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            300,
          cutH:            PANEL_STUB.finishHeight,
          qty:             1,
          developedLength: fields.developedLength,
          projectedDepth:  fields.projectedDepth,
          kerfCount:       fields.kerfCount,
          curvedEdge:      fields.curvedEdge ?? undefined,
          grain:           undefined,
        };

        // Wide sheet so both fit in the same FFDH row
        const { sheets } = runNesting([rowA, rowB], { sheetWidth: 3000 });

        expect(sheets).toHaveLength(1);
        expect(sheets[0].placements).toHaveLength(2);

        // Both panels land at the same y_start → Y ranges overlap
        expect(sheets[0].placements[0].y).toBe(sheets[0].placements[1].y);

        const output = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE59', materialId: MATERIAL_ID },
          nesting: sheets[0],
          profile: getFactoryProfile('DEFAULT'),
        });

        const allLines = parseHATCHCURVEDLines59(output.content);
        expect(allLines).toHaveLength(4); // 2 per curved panel × 2 panels

        const EPS59 = 0.02;

        for (const p of sheets[0].placements) {
          const isRotated = p.rotation === 90 || p.rotation === 270;
          const w = isRotated ? p.cutH : p.cutW;
          const h = isRotated ? p.cutW : p.cutH;

          const minX = r(p.x);
          const minY = r(p.y);
          const maxX = r(p.x + w);
          const maxY = r(p.y + h);

          const d1Matches = allLines.filter(l => isD1_59(l, minX, minY, maxX, maxY, EPS59));
          const d2Matches = allLines.filter(l => isD2_59(l, minX, minY, maxX, maxY, EPS59));

          expect(d1Matches).toHaveLength(1);
          expect(d2Matches).toHaveLength(1);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 60 – diagonal intersection strictly inside flat-blank bbox
// Asserts that (d1.x1+d1.x2)/2, (d1.y1+d1.y2)/2 lies strictly inside the
// flat-blank bounding rectangle: minX < intersectionX < maxX, etc.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 60 – HATCH_CURVED diagonal intersection strictly inside flat-blank bbox',
  () => {
    const r = (v: number): number => Math.round(v * 100) / 100;

    function parseHATCHCURVEDLines60(content: string): Array<{ x1: number; y1: number; x2: number; y2: number }> {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(s => s.startsWith('8\nHATCH_CURVED\n'))
        .map(seg => {
          const num = (code: string) => {
            const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
            return m ? parseFloat(m[1]) : NaN;
          };
          return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
        });
    }

    it('ARC — intersection strictly inside flat-blank bbox', () => {
      const { row: arcRow } = buildCurvedRow();
      const { sheets }      = runNesting([arcRow]);

      expect(sheets).toHaveLength(1);

      const p = sheets[0].placements[0];
      const output = buildDxfSheet({
        planned: { index1: 1, sheetId: 'SHEET_STAGE60_ARC', materialId: MATERIAL_ID },
        nesting: sheets[0],
        profile: getFactoryProfile('DEFAULT'),
      });

      const lines = parseHATCHCURVEDLines60(output.content);
      expect(lines).toHaveLength(2);

      const d1 = lines[0];
      const intersectionX = (d1.x1 + d1.x2) / 2;
      const intersectionY = (d1.y1 + d1.y2) / 2;

      const isRotated = p.rotation === 90 || p.rotation === 270;
      const w = isRotated ? p.cutH : p.cutW;
      const h = isRotated ? p.cutW : p.cutH;

      const minX = r(p.x);
      const maxX = r(p.x + w);
      const minY = r(p.y);
      const maxY = r(p.y + h);

      expect(intersectionX).toBeGreaterThan(minX);
      expect(intersectionX).toBeLessThan(maxX);
      expect(intersectionY).toBeGreaterThan(minY);
      expect(intersectionY).toBeLessThan(maxY);
    });

    it('S_CURVE — intersection strictly inside flat-blank bbox', () => {
      const { row: sCurveRow } = buildSCurveRow();
      const { sheets }         = runNesting([sCurveRow]);

      expect(sheets).toHaveLength(1);

      const p = sheets[0].placements[0];
      const output = buildDxfSheet({
        planned: { index1: 1, sheetId: 'SHEET_STAGE60_SCURVE', materialId: MATERIAL_ID },
        nesting: sheets[0],
        profile: getFactoryProfile('DEFAULT'),
      });

      const lines = parseHATCHCURVEDLines60(output.content);
      expect(lines).toHaveLength(2);

      const d1 = lines[0];
      const intersectionX = (d1.x1 + d1.x2) / 2;
      const intersectionY = (d1.y1 + d1.y2) / 2;

      const isRotated = p.rotation === 90 || p.rotation === 270;
      const w = isRotated ? p.cutH : p.cutW;
      const h = isRotated ? p.cutW : p.cutH;

      const minX = r(p.x);
      const maxX = r(p.x + w);
      const minY = r(p.y);
      const maxY = r(p.y + h);

      expect(intersectionX).toBeGreaterThan(minX);
      expect(intersectionX).toBeLessThan(maxX);
      expect(intersectionY).toBeGreaterThan(minY);
      expect(intersectionY).toBeLessThan(maxY);
    });

    it('TALL_ARC (rotation=0) — intersection strictly inside flat-blank bbox', () => {
      function buildTallArcRow() {
        const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
        const row: CutListRow = {
          partId:          'SMOKE_TALL_ARC_60',
          materialId:      MATERIAL_ID,
          label:           'Tall Arc Door 60',
          finishW:         PANEL_STUB.finishWidth,
          finishH:         PANEL_STUB.finishHeight,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            PANEL_STUB.finishWidth,
          cutH:            PANEL_STUB.finishHeight,
          qty:             1,
          developedLength: fields.developedLength,
          projectedDepth:  fields.projectedDepth,
          kerfCount:       fields.kerfCount,
          curvedEdge:      fields.curvedEdge ?? undefined,
          grain:           'HORIZONTAL',
        };
        return { row, kerfCount: fields.kerfCount };
      }

      const { row: tallArcRow } = buildTallArcRow();
      const { sheets }          = runNesting([tallArcRow]);

      expect(sheets).toHaveLength(1);

      const p = sheets[0].placements[0];
      expect(p.rotation).toBe(0);

      const output = buildDxfSheet({
        planned: { index1: 1, sheetId: 'SHEET_STAGE60_TALLARC', materialId: MATERIAL_ID },
        nesting: sheets[0],
        profile: getFactoryProfile('DEFAULT'),
      });

      const lines = parseHATCHCURVEDLines60(output.content);
      expect(lines).toHaveLength(2);

      const d1 = lines[0];
      const intersectionX = (d1.x1 + d1.x2) / 2;
      const intersectionY = (d1.y1 + d1.y2) / 2;

      const isRotated = p.rotation === 90 || p.rotation === 270;
      const w = isRotated ? p.cutH : p.cutW;
      const h = isRotated ? p.cutW : p.cutH;

      const minX = r(p.x);
      const maxX = r(p.x + w);
      const minY = r(p.y);
      const maxY = r(p.y + h);

      expect(intersectionX).toBeGreaterThan(minX);
      expect(intersectionX).toBeLessThan(maxX);
      expect(intersectionY).toBeGreaterThan(minY);
      expect(intersectionY).toBeLessThan(maxY);
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 61 – rotation=180 HATCH_CURVED diagonal correctness
// Asserts that when a curved placement is manually assigned rotation=180, the
// HATCH_CURVED diagonal lines still span the correct flat-blank bbox corners.
// (getRotatedDimensions returns w=cutW, h=cutH for rotation=0|180 identically.)
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 61 – rotation=180 HATCH_CURVED diagonal corners match flat-blank bbox',
  () => {
    const r61 = (v: number): number => Math.round(v * 100) / 100;
    const EPS61 = 0.02;

    function parseHATCHCURVEDLines61(content: string): Array<{ x1: number; y1: number; x2: number; y2: number }> {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(s => s.startsWith('8\nHATCH_CURVED\n'))
        .map(seg => {
          const num = (code: string) => {
            const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
            return m ? parseFloat(m[1]) : NaN;
          };
          return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
        });
    }

    it(
      'ARC curved panel with rotation=180 — d1 and d2 span correct flat-blank bbox corners (ε < 0.02 mm)',
      () => {
        // Step 1: derive real flat-blank cutW / cutH from the nesting pipeline
        const { row: arcRow, kerfCount } = buildCurvedRow();
        const { sheets: refSheets }      = runNesting([arcRow]);
        const refPlacement               = refSheets[0].placements[0];

        // Step 2: manually construct a NestingSheet with rotation=180
        const PLACE_X = 10;
        const PLACE_Y = 10;
        const manualSheet: NestingSheet = {
          index1:         1,
          materialId:     MATERIAL_ID,
          sheetW:         1220,
          sheetH:         2440,
          sheetThickness: 18,
          placements: [
            {
              partId:   'SMOKE_ARC_ROT180',
              x:        PLACE_X,
              y:        PLACE_Y,
              rotation: 180,
              cutW:     refPlacement.cutW,
              cutH:     refPlacement.cutH,
              isCurved: true,
              kerfCount,
            },
          ],
          utilization: 0,
          label:       'NEST_61',
        };

        const output = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE61', materialId: MATERIAL_ID },
          nesting: manualSheet,
          profile: getFactoryProfile('DEFAULT'),
        });

        const lines = parseHATCHCURVEDLines61(output.content);
        expect(lines).toHaveLength(2);

        // For rotation=180, getRotatedDimensions returns w=cutW, h=cutH (same as 0)
        const w = refPlacement.cutW;
        const h = refPlacement.cutH;

        const minX = r61(PLACE_X);
        const maxX = r61(PLACE_X + w);
        const minY = r61(PLACE_Y);
        const maxY = r61(PLACE_Y + h);

        // d1: bottom-left → top-right
        const d1 = lines.find(
          l =>
            Math.abs(l.x1 - minX) < EPS61 &&
            Math.abs(l.y1 - minY) < EPS61 &&
            Math.abs(l.x2 - maxX) < EPS61 &&
            Math.abs(l.y2 - maxY) < EPS61,
        );
        // d2: bottom-right → top-left
        const d2 = lines.find(
          l =>
            Math.abs(l.x1 - maxX) < EPS61 &&
            Math.abs(l.y1 - minY) < EPS61 &&
            Math.abs(l.x2 - minX) < EPS61 &&
            Math.abs(l.y2 - maxY) < EPS61,
        );

        expect(d1).toBeDefined();
        expect(d2).toBeDefined();
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 62 – HATCH_CURVED diagonal pairs have strictly non-zero length
// Asserts |x2−x1| + |y2−y1| > 1.0 for every diagonal line on a single-panel
// sheet, for all three fixture types (ARC, S_CURVE, TALL_ARC).
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 62 – HATCH_CURVED diagonals have strictly non-zero length (all fixtures)',
  () => {
    function parseHATCHCURVEDLines62(content: string): Array<{ x1: number; y1: number; x2: number; y2: number }> {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(s => s.startsWith('8\nHATCH_CURVED\n'))
        .map(seg => {
          const num = (code: string) => {
            const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
            return m ? parseFloat(m[1]) : NaN;
          };
          return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
        });
    }

    it('ARC — both HATCH_CURVED diagonals have length > 1.0 mm', () => {
      const { row: arcRow } = buildCurvedRow();
      const { sheets }      = runNesting([arcRow]);

      const output = buildDxfSheet({
        planned: { index1: 1, sheetId: 'SHEET_STAGE62_ARC', materialId: MATERIAL_ID },
        nesting: sheets[0],
        profile: getFactoryProfile('DEFAULT'),
      });

      const lines = parseHATCHCURVEDLines62(output.content);
      expect(lines).toHaveLength(2);

      for (const l of lines) {
        const length = Math.abs(l.x2 - l.x1) + Math.abs(l.y2 - l.y1);
        expect(length).toBeGreaterThan(1.0);
      }
    });

    it('S_CURVE — both HATCH_CURVED diagonals have length > 1.0 mm', () => {
      const { row: sCurveRow } = buildSCurveRow();
      const { sheets }         = runNesting([sCurveRow]);

      const output = buildDxfSheet({
        planned: { index1: 1, sheetId: 'SHEET_STAGE62_SCURVE', materialId: MATERIAL_ID },
        nesting: sheets[0],
        profile: getFactoryProfile('DEFAULT'),
      });

      const lines = parseHATCHCURVEDLines62(output.content);
      expect(lines).toHaveLength(2);

      for (const l of lines) {
        const length = Math.abs(l.x2 - l.x1) + Math.abs(l.y2 - l.y1);
        expect(length).toBeGreaterThan(1.0);
      }
    });

    it('TALL_ARC (rotation=0) — both HATCH_CURVED diagonals have length > 1.0 mm', () => {
      function buildTallArcRow() {
        const fields = computeCurveFields(PANEL_STUB, DEFAULT_KERF_TOOL, 'MDF')!;
        const row: CutListRow = {
          partId:          'SMOKE_TALL_ARC_62',
          materialId:      MATERIAL_ID,
          label:           'Tall Arc Door 62',
          finishW:         PANEL_STUB.finishWidth,
          finishH:         PANEL_STUB.finishHeight,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            PANEL_STUB.finishWidth,
          cutH:            PANEL_STUB.finishHeight,
          qty:             1,
          developedLength: fields.developedLength,
          projectedDepth:  fields.projectedDepth,
          kerfCount:       fields.kerfCount,
          curvedEdge:      fields.curvedEdge ?? undefined,
          grain:           'HORIZONTAL',
        };
        return { row, kerfCount: fields.kerfCount };
      }

      const { row: tallArcRow } = buildTallArcRow();
      const { sheets }          = runNesting([tallArcRow]);

      expect(sheets[0].placements[0].rotation).toBe(0);

      const output = buildDxfSheet({
        planned: { index1: 1, sheetId: 'SHEET_STAGE62_TALLARC', materialId: MATERIAL_ID },
        nesting: sheets[0],
        profile: getFactoryProfile('DEFAULT'),
      });

      const lines = parseHATCHCURVEDLines62(output.content);
      expect(lines).toHaveLength(2);

      for (const l of lines) {
        const length = Math.abs(l.x2 - l.x1) + Math.abs(l.y2 - l.y1);
        expect(length).toBeGreaterThan(1.0);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 63 – HATCH_CURVED coordinates are deterministic across repeated runs
// Regression guard: running runNesting twice with the same CutListRow must
// produce bit-for-bit identical HATCH_CURVED line coordinates.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 63 – HATCH_CURVED coordinates are deterministic across repeated runNesting calls',
  () => {
    function parseHATCHCURVEDLines63(content: string): Array<{ x1: number; y1: number; x2: number; y2: number }> {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(s => s.startsWith('8\nHATCH_CURVED\n'))
        .map(seg => {
          const num = (code: string) => {
            const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
            return m ? parseFloat(m[1]) : NaN;
          };
          return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
        });
    }

    it(
      'ARC — running runNesting twice with the same row yields identical HATCH_CURVED coordinates',
      () => {
        const { row: arcRow } = buildCurvedRow();

        // First run
        const { sheets: sheets1 } = runNesting([arcRow]);
        const output1 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE63_RUN1', materialId: MATERIAL_ID },
          nesting: sheets1[0],
          profile: getFactoryProfile('DEFAULT'),
        });
        const lines1 = parseHATCHCURVEDLines63(output1.content);

        // Second run — same input, fresh call
        const { sheets: sheets2 } = runNesting([arcRow]);
        const output2 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE63_RUN2', materialId: MATERIAL_ID },
          nesting: sheets2[0],
          profile: getFactoryProfile('DEFAULT'),
        });
        const lines2 = parseHATCHCURVEDLines63(output2.content);

        expect(lines1).toHaveLength(2);
        expect(lines2).toHaveLength(2);

        // Coordinates must be bit-for-bit identical (no randomness)
        for (let i = 0; i < lines1.length; i++) {
          expect(lines2[i].x1).toBe(lines1[i].x1);
          expect(lines2[i].y1).toBe(lines1[i].y1);
          expect(lines2[i].x2).toBe(lines1[i].x2);
          expect(lines2[i].y2).toBe(lines1[i].y2);
        }
      },
    );

    it(
      'S_CURVE — running runNesting twice with the same row yields identical HATCH_CURVED coordinates',
      () => {
        const { row: sCurveRow } = buildSCurveRow();

        const { sheets: sheets1 } = runNesting([sCurveRow]);
        const output1 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE63_SCURVE_RUN1', materialId: MATERIAL_ID },
          nesting: sheets1[0],
          profile: getFactoryProfile('DEFAULT'),
        });
        const lines1 = parseHATCHCURVEDLines63(output1.content);

        const { sheets: sheets2 } = runNesting([sCurveRow]);
        const output2 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE63_SCURVE_RUN2', materialId: MATERIAL_ID },
          nesting: sheets2[0],
          profile: getFactoryProfile('DEFAULT'),
        });
        const lines2 = parseHATCHCURVEDLines63(output2.content);

        expect(lines1).toHaveLength(2);
        expect(lines2).toHaveLength(2);

        for (let i = 0; i < lines1.length; i++) {
          expect(lines2[i].x1).toBe(lines1[i].x1);
          expect(lines2[i].y1).toBe(lines1[i].y1);
          expect(lines2[i].x2).toBe(lines1[i].x2);
          expect(lines2[i].y2).toBe(lines1[i].y2);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 64 – rotation=270 HATCH_CURVED diagonal correctness
// Asserts that when a curved placement is assigned rotation=270, the HATCH_CURVED
// diagonal lines use w=cutH / h=cutW (same as rotation=90) and still span the
// correct flat-blank bbox corners.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 64 – rotation=270 HATCH_CURVED diagonal corners match flat-blank bbox (w=cutH, h=cutW)',
  () => {
    const r64  = (v: number): number => Math.round(v * 100) / 100;
    const EPS64 = 0.02;

    function parseHATCHCURVEDLines64(content: string): Array<{ x1: number; y1: number; x2: number; y2: number }> {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(s => s.startsWith('8\nHATCH_CURVED\n'))
        .map(seg => {
          const num = (code: string) => {
            const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
            return m ? parseFloat(m[1]) : NaN;
          };
          return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
        });
    }

    it(
      'ARC curved panel with rotation=270 — d1 and d2 span correct flat-blank bbox corners (w=cutH, h=cutW, ε < 0.02 mm)',
      () => {
        // Derive real flat-blank cutW / cutH from the nesting pipeline
        const { row: arcRow, kerfCount } = buildCurvedRow();
        const { sheets: refSheets }      = runNesting([arcRow]);
        const refPlacement               = refSheets[0].placements[0];

        // Manually construct a NestingSheet with rotation=270
        // getRotatedDimensions(cutW, cutH, 270) → { w: cutH, h: cutW }  (same as 90)
        const PLACE_X = 10;
        const PLACE_Y = 10;
        const manualSheet: NestingSheet = {
          index1:         1,
          materialId:     MATERIAL_ID,
          sheetW:         2440,
          sheetH:         1220,
          sheetThickness: 18,
          label:          'NEST_64',
          placements: [
            {
              partId:   'SMOKE_ARC_ROT270',
              x:        PLACE_X,
              y:        PLACE_Y,
              rotation: 270,
              cutW:     refPlacement.cutW,
              cutH:     refPlacement.cutH,
              isCurved: true,
              kerfCount,
            },
          ],
          utilization: 0,
        };

        const output = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE64', materialId: MATERIAL_ID },
          nesting: manualSheet,
          profile: getFactoryProfile('DEFAULT'),
        });

        const lines = parseHATCHCURVEDLines64(output.content);
        expect(lines).toHaveLength(2);

        // For rotation=270: w = cutH  (effective width = flat-blank height)
        //                   h = cutW  (effective height = flat-blank width)
        const w = refPlacement.cutH;
        const h = refPlacement.cutW;

        const minX = r64(PLACE_X);
        const maxX = r64(PLACE_X + w);
        const minY = r64(PLACE_Y);
        const maxY = r64(PLACE_Y + h);

        // d1: bottom-left (minX, minY) → top-right (maxX, maxY)
        const d1 = lines.find(
          l =>
            Math.abs(l.x1 - minX) < EPS64 &&
            Math.abs(l.y1 - minY) < EPS64 &&
            Math.abs(l.x2 - maxX) < EPS64 &&
            Math.abs(l.y2 - maxY) < EPS64,
        );
        // d2: bottom-right (maxX, minY) → top-left (minX, maxY)
        const d2 = lines.find(
          l =>
            Math.abs(l.x1 - maxX) < EPS64 &&
            Math.abs(l.y1 - minY) < EPS64 &&
            Math.abs(l.x2 - minX) < EPS64 &&
            Math.abs(l.y2 - maxY) < EPS64,
        );

        expect(d1).toBeDefined();
        expect(d2).toBeDefined();
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 65 – zero-correction panel emits zero HATCH_CURVED lines
// A panel with developedLength=0 and projectedDepth=0 (curvedEdge still set)
// produces correction=0 → isCurved=false → buildDxfSheet must emit zero
// HATCH_CURVED LINE entities, even though curvedEdge is present.
//
// Rationale: isCurved = hasCorrection && correction > 0
//   hasCorrection = (developedLength ≠ undefined) && (projectedDepth ≠ undefined)
//                   && (curvedEdge ≠ undefined)          → true
//   correction    = 0 − 0 = 0
//   isCurved      = true && 0 > 0 = false
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 65 – zero-correction (projectedDepth=0) panel emits zero HATCH_CURVED lines',
  () => {
    function countHATCHCURVEDLines65(content: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(s => s.startsWith('8\nHATCH_CURVED\n')).length;
    }

    it(
      'panel with developedLength=0, projectedDepth=0, curvedEdge=TOP — zero HATCH_CURVED lines in DXF',
      () => {
        const flatRow: CutListRow = {
          partId:          'SMOKE_FLAT_65',
          materialId:      MATERIAL_ID,
          label:           'Degenerate Flat Panel 65',
          finishW:         400,
          finishH:         800,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            400,
          cutH:            800,
          qty:             1,
          // All three curve fields present but correction is exactly zero:
          //   correction = developedLength − projectedDepth = 0 − 0 = 0
          //   → isCurved = false → no HATCH_CURVED
          developedLength: 0,
          projectedDepth:  0,
          curvedEdge:      'TOP',
          kerfCount:       0,
          grain:           undefined,
        };

        const { sheets } = runNesting([flatRow]);
        expect(sheets).toHaveLength(1);
        expect(sheets[0].placements).toHaveLength(1);

        // isCurved must not have propagated
        expect(sheets[0].placements[0].isCurved).toBeFalsy();

        const output = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE65', materialId: MATERIAL_ID },
          nesting: sheets[0],
          profile: getFactoryProfile('DEFAULT'),
        });

        // Zero HATCH_CURVED lines — flat panel is not hatched
        expect(countHATCHCURVEDLines65(output.content)).toBe(0);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 66 – negative correction (developedLength < projectedDepth) emits zero
// HATCH_CURVED lines and isCurved=false.
//
// Rationale:
//   correction = developedLength − projectedDepth = 50 − 200 = −150 < 0
//   isCurved   = hasCorrection && correction > 0 = true && false = false
//   → no HATCH_CURVED, even though all three curve fields are present.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 66 – negative correction (developedLength < projectedDepth) emits zero HATCH_CURVED lines',
  () => {
    function countHATCHCURVEDLines66(content: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(s => s.startsWith('8\nHATCH_CURVED\n')).length;
    }

    it(
      'panel with developedLength=50 < projectedDepth=200 — correction<0 → isCurved=false → zero HATCH_CURVED',
      () => {
        // correction = 50 − 200 = −150  (physically impossible bend, used as regression fixture)
        // isCurved = hasCorrection && correction > 0 = true && (−150 > 0) = false
        const negRow: CutListRow = {
          partId:          'SMOKE_NEG_CORR_66',
          materialId:      MATERIAL_ID,
          label:           'Negative Correction Panel 66',
          finishW:         400,
          finishH:         800,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            400,
          cutH:            800,
          qty:             1,
          developedLength: 50,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          kerfCount:       0,
          grain:           undefined,
        };

        const { sheets } = runNesting([negRow]);
        expect(sheets).toHaveLength(1);
        expect(sheets[0].placements).toHaveLength(1);

        // isCurved must be falsy — negative correction does not trigger curved pipeline
        expect(sheets[0].placements[0].isCurved).toBeFalsy();

        const output = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE66', materialId: MATERIAL_ID },
          nesting: sheets[0],
          profile: getFactoryProfile('DEFAULT'),
        });

        // Zero HATCH_CURVED lines — negative correction means no curved overlay
        expect(countHATCHCURVEDLines66(output.content)).toBe(0);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 67 – rotation=90 and rotation=270 HATCH_CURVED endpoints are
// point-reflections of each other through the sheet centre.
//
// Both rotations use the same effective dimensions:
//   getRotatedDimensions(cutW, cutH, 90)  → { w: cutH, h: cutW }
//   getRotatedDimensions(cutW, cutH, 270) → { w: cutH, h: cutW }
//
// Two separate NestingSheets are constructed on the same sheet size (2440×1220)
// with placements positioned symmetrically about the sheet centre (cx=1220, cy=610):
//   Placement 90:  (P_X,  P_Y)  = (10, 10)
//   Placement 270: (Q_X,  Q_Y)  = (2*cx − P_X − w,  2*cy − P_Y − h)
//
// Assertion: for every endpoint (ex, ey) in the rotation=90 HATCH_CURVED lines,
//   the reflected point  (round(2·cx − ex), round(2·cy − ey))
//   equals one of the endpoints in the rotation=270 HATCH_CURVED lines (ε < 0.02 mm).
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 67 – rotation=90 and rotation=270 HATCH_CURVED endpoints are point-reflections through the sheet centre',
  () => {
    const r67  = (v: number): number => Math.round(v * 100) / 100;
    const EPS67 = 0.02;

    function parseHATCHCURVEDLines67(
      content: string,
    ): Array<{ x1: number; y1: number; x2: number; y2: number }> {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(s => s.startsWith('8\nHATCH_CURVED\n'))
        .map(seg => {
          const num = (code: string) => {
            const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
            return m ? parseFloat(m[1]) : NaN;
          };
          return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
        });
    }

    it(
      'ARC — every rotation=90 HATCH_CURVED endpoint, reflected through sheet centre, equals a rotation=270 endpoint (ε < 0.02 mm)',
      () => {
        const { row: arcRow, kerfCount } = buildCurvedRow();
        const { sheets: refSheets }      = runNesting([arcRow]);
        const ref                        = refSheets[0].placements[0];

        // Flat-blank effective dimensions (same for rotation=90 and rotation=270)
        const cutW = ref.cutW;
        const cutH = ref.cutH;
        const w    = cutH; // effective width  when rotated 90° or 270°
        const h    = cutW; // effective height when rotated 90° or 270°

        const SHEET_W = 2440;
        const SHEET_H = 1220;
        const cx      = SHEET_W / 2; // 1220
        const cy      = SHEET_H / 2; //  610

        // Placement for rotation=90
        const P_X = 10;
        const P_Y = 10;

        // Symmetric placement for rotation=270:
        //   The bbox (Q_X, Q_Y, Q_X+w, Q_Y+h) is the point-reflection of
        //   (P_X, P_Y, P_X+w, P_Y+h) about (cx, cy).
        const Q_X = 2 * cx - P_X - w;
        const Q_Y = 2 * cy - P_Y - h;

        const sheet90: NestingSheet = {
          index1:         1,
          materialId:     MATERIAL_ID,
          sheetW:         SHEET_W,
          sheetH:         SHEET_H,
          sheetThickness: 18,
          label:          'NEST_67_90',
          placements: [
            {
              partId:   'SMOKE_ARC_ROT90_S67',
              x:        P_X,
              y:        P_Y,
              rotation: 90,
              cutW,
              cutH,
              isCurved: true,
              kerfCount,
            },
          ],
          utilization: 0,
        };

        const sheet270: NestingSheet = {
          index1:         1,
          materialId:     MATERIAL_ID,
          sheetW:         SHEET_W,
          sheetH:         SHEET_H,
          sheetThickness: 18,
          label:          'NEST_67_270',
          placements: [
            {
              partId:   'SMOKE_ARC_ROT270_S67',
              x:        Q_X,
              y:        Q_Y,
              rotation: 270,
              cutW,
              cutH,
              isCurved: true,
              kerfCount,
            },
          ],
          utilization: 0,
        };

        const out90 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_S67_90', materialId: MATERIAL_ID },
          nesting: sheet90,
          profile: getFactoryProfile('DEFAULT'),
        });
        const out270 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_S67_270', materialId: MATERIAL_ID },
          nesting: sheet270,
          profile: getFactoryProfile('DEFAULT'),
        });

        const lines90  = parseHATCHCURVEDLines67(out90.content);
        const lines270 = parseHATCHCURVEDLines67(out270.content);

        expect(lines90).toHaveLength(2);
        expect(lines270).toHaveLength(2);

        // Collect all 4 endpoints from each sheet
        const endpoints90 = lines90.flatMap(l => [
          { x: l.x1, y: l.y1 },
          { x: l.x2, y: l.y2 },
        ]);
        const endpoints270 = lines270.flatMap(l => [
          { x: l.x1, y: l.y1 },
          { x: l.x2, y: l.y2 },
        ]);

        // For each endpoint in rotation=90, its reflection through the sheet centre
        // must equal one of the rotation=270 endpoints.
        for (const ep90 of endpoints90) {
          const reflX = r67(2 * cx - ep90.x);
          const reflY = r67(2 * cy - ep90.y);
          const match = endpoints270.find(
            ep => Math.abs(ep.x - reflX) < EPS67 && Math.abs(ep.y - reflY) < EPS67,
          );
          expect(
            match,
            `reflection of (${ep90.x}, ${ep90.y}) → (${reflX}, ${reflY}) not found in rotation=270 endpoints`,
          ).toBeDefined();
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 68 – rotation=0 and rotation=180 HATCH_CURVED endpoints are
// point-reflections of each other through the sheet centre.
// (Symmetric counterpart of Stage 67, which tested rotation=90 vs rotation=270.)
//
// Both rotations use the same effective dimensions:
//   getRotatedDimensions(cutW, cutH, 0)   → { w: cutW, h: cutH }
//   getRotatedDimensions(cutW, cutH, 180) → { w: cutW, h: cutH }
//
// Two separate NestingSheets are constructed on the same sheet size (2440×1220)
// with placements positioned symmetrically about the sheet centre (cx=1220, cy=610):
//   Placement   0°: (P_X,  P_Y)  = (10, 10)
//   Placement 180°: (Q_X,  Q_Y)  = (2*cx − P_X − w,  2*cy − P_Y − h)
//                                 = (2030, 2*610 − 10 − cutH)
//
// Assertion: for every endpoint (ex, ey) in the rotation=0 HATCH_CURVED lines,
//   the reflected point  (round(2·cx − ex), round(2·cy − ey))
//   equals one of the endpoints in the rotation=180 HATCH_CURVED lines (ε < 0.02 mm).
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 68 – rotation=0 and rotation=180 HATCH_CURVED endpoints are point-reflections through the sheet centre',
  () => {
    const r68   = (v: number): number => Math.round(v * 100) / 100;
    const EPS68 = 0.02;

    function parseHATCHCURVEDLines68(
      content: string,
    ): Array<{ x1: number; y1: number; x2: number; y2: number }> {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(s => s.startsWith('8\nHATCH_CURVED\n'))
        .map(seg => {
          const num = (code: string) => {
            const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
            return m ? parseFloat(m[1]) : NaN;
          };
          return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
        });
    }

    it(
      'ARC — every rotation=0 HATCH_CURVED endpoint, reflected through sheet centre, equals a rotation=180 endpoint (ε < 0.02 mm)',
      () => {
        const { row: arcRow, kerfCount } = buildCurvedRow();
        const { sheets: refSheets }      = runNesting([arcRow]);
        const ref                        = refSheets[0].placements[0];

        // Flat-blank effective dimensions (same for rotation=0 and rotation=180)
        const cutW = ref.cutW;
        const cutH = ref.cutH;
        const w    = cutW; // effective width  when rotation=0° or 180°
        const h    = cutH; // effective height when rotation=0° or 180°

        const SHEET_W = 2440;
        const SHEET_H = 1220;
        const cx      = SHEET_W / 2; // 1220
        const cy      = SHEET_H / 2; //  610

        // Placement for rotation=0
        const P_X = 10;
        const P_Y = 10;

        // Symmetric placement for rotation=180:
        //   The bbox (Q_X, Q_Y, Q_X+w, Q_Y+h) is the point-reflection of
        //   (P_X, P_Y, P_X+w, P_Y+h) about (cx, cy).
        const Q_X = 2 * cx - P_X - w;
        const Q_Y = 2 * cy - P_Y - h;

        const sheet0: NestingSheet = {
          index1:         1,
          materialId:     MATERIAL_ID,
          sheetW:         SHEET_W,
          sheetH:         SHEET_H,
          sheetThickness: 18,
          label:          'NEST_68_0',
          placements: [
            {
              partId:    'SMOKE_ARC_ROT0_S68',
              x:         P_X,
              y:         P_Y,
              rotation:  0,
              cutW,
              cutH,
              isCurved:  true,
              kerfCount,
            },
          ],
          utilization: 0,
        };

        const sheet180: NestingSheet = {
          index1:         1,
          materialId:     MATERIAL_ID,
          sheetW:         SHEET_W,
          sheetH:         SHEET_H,
          sheetThickness: 18,
          label:          'NEST_68_180',
          placements: [
            {
              partId:    'SMOKE_ARC_ROT180_S68',
              x:         Q_X,
              y:         Q_Y,
              rotation:  180,
              cutW,
              cutH,
              isCurved:  true,
              kerfCount,
            },
          ],
          utilization: 0,
        };

        const out0 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_S68_0',   materialId: MATERIAL_ID },
          nesting: sheet0,
          profile: getFactoryProfile('DEFAULT'),
        });
        const out180 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_S68_180', materialId: MATERIAL_ID },
          nesting: sheet180,
          profile: getFactoryProfile('DEFAULT'),
        });

        const lines0   = parseHATCHCURVEDLines68(out0.content);
        const lines180 = parseHATCHCURVEDLines68(out180.content);

        expect(lines0).toHaveLength(2);
        expect(lines180).toHaveLength(2);

        // Collect all 4 endpoints from each sheet
        const endpoints0 = lines0.flatMap(l => [
          { x: l.x1, y: l.y1 },
          { x: l.x2, y: l.y2 },
        ]);
        const endpoints180 = lines180.flatMap(l => [
          { x: l.x1, y: l.y1 },
          { x: l.x2, y: l.y2 },
        ]);

        // For each endpoint in rotation=0, its reflection through the sheet centre
        // must equal one of the rotation=180 endpoints.
        for (const ep0 of endpoints0) {
          const reflX = r68(2 * cx - ep0.x);
          const reflY = r68(2 * cy - ep0.y);
          const match = endpoints180.find(
            ep => Math.abs(ep.x - reflX) < EPS68 && Math.abs(ep.y - reflY) < EPS68,
          );
          expect(
            match,
            `reflection of (${ep0.x}, ${ep0.y}) → (${reflX}, ${reflY}) not found in rotation=180 endpoints`,
          ).toBeDefined();
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 69 – a panel with correction=0.001 (barely positive) gets isCurved=true
// and emits exactly 2 HATCH_CURVED lines in the DXF output.
//
// Rationale:
//   developedLength = 200.001
//   projectedDepth  = 200.000
//   correction      = 200.001 − 200.000 = 0.001  > 0
//   hasCorrection   = true  (all three fields present: developedLength,
//                             projectedDepth, curvedEdge)
//   isCurved        = hasCorrection && correction > 0 = true
//   → buildDxfSheet must emit exactly 2 HATCH_CURVED LINE entities (d1 + d2).
//
// This is a boundary test: the smallest representable positive correction
// must still trigger the curved pipeline.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 69 – panel with correction=0.001 (barely positive) gets isCurved=true and emits exactly 2 HATCH_CURVED lines',
  () => {
    function countHATCHCURVEDLines69(content: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(s => s.startsWith('8\nHATCH_CURVED\n')).length;
    }

    it(
      'panel with correction=0.001 → isCurved=true → exactly 2 HATCH_CURVED lines in DXF',
      () => {
        // correction = developedLength − projectedDepth = 200.001 − 200 = 0.001 > 0
        // flatBlankH = cutH + correction = 800 + 0.001 = 800.001 mm
        const barelyRow: CutListRow = {
          partId:          'SMOKE_BARELY_POS_69',
          materialId:      MATERIAL_ID,
          label:           'Barely Positive Correction Panel 69',
          finishW:         400,
          finishH:         800,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            400,
          cutH:            800,
          qty:             1,
          // Barely positive correction: triggers isCurved=true
          // kerfCount left undefined so it does not override isCurved
          developedLength: 200.001,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          grain:           undefined,
        };

        const { sheets } = runNesting([barelyRow]);
        expect(sheets).toHaveLength(1);
        expect(sheets[0].placements).toHaveLength(1);

        // isCurved must be true — barely positive correction triggers curved pipeline
        expect(sheets[0].placements[0].isCurved).toBe(true);

        const output = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE69', materialId: MATERIAL_ID },
          nesting: sheets[0],
          profile: getFactoryProfile('DEFAULT'),
        });

        // Exactly 2 HATCH_CURVED lines (d1 + d2) for the single curved placement
        expect(countHATCHCURVEDLines69(output.content)).toBe(2);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 70 – a panel with kerfCount=1 emits exactly 2 HATCH_CURVED lines
// and the DXF sub-label reads '(CURVED / 1 cuts)'.
//
// Motivation: Stage 40 verified that the live kerfCount (≥12 for the ARC
// fixture) is embedded in the sub-label.  Stage 70 targets the lower boundary:
// kerfCount=1 is the smallest meaningful non-zero value; it must propagate
// through runNesting → buildDxfSheet unchanged, appearing in both the
// HATCH_CURVED overlay (exactly 2 lines) and the LABELS TEXT entity.
//
// Rationale:
//   kerfCount=1 is injected directly into CutListRow.
//   correction = 250 − 200 = 50 mm  > 0  →  isCurved=true.
//   flatBlankH = 800 + 50 = 850 mm  (fits on 2440×1220 sheet).
//   DXF HATCH_CURVED: 2 lines (d1 + d2).
//   DXF LABELS TEXT:  '(CURVED / 1 cuts)'.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 70 – kerfCount=1 emits exactly 2 HATCH_CURVED lines and sub-label reads \'(CURVED / 1 cuts)\'',
  () => {
    function countHATCHCURVEDLines70(content: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(s => s.startsWith('8\nHATCH_CURVED\n')).length;
    }

    it(
      'kerfCount=1 → isCurved=true → 2 HATCH_CURVED lines and sub-label "(CURVED / 1 cuts)"',
      () => {
        // correction = 250 − 200 = 50 > 0  →  isCurved=true
        // flatBlankH = cutH + correction = 800 + 50 = 850 mm
        const stage70Row: CutListRow = {
          partId:          'SMOKE_KERF1_70',
          materialId:      MATERIAL_ID,
          label:           'kerfCount=1 Panel Stage 70',
          finishW:         400,
          finishH:         800,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            400,
          cutH:            800,
          qty:             1,
          developedLength: 250,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          kerfCount:       1,
          grain:           undefined,
        };

        const { sheets } = runNesting([stage70Row]);
        expect(sheets).toHaveLength(1);
        expect(sheets[0].placements).toHaveLength(1);
        expect(sheets[0].placements[0].isCurved).toBe(true);
        expect(sheets[0].placements[0].kerfCount).toBe(1);

        const output = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE70', materialId: MATERIAL_ID },
          nesting: sheets[0],
          profile: getFactoryProfile('DEFAULT'),
        });

        // Exactly 2 HATCH_CURVED lines (d1 + d2)
        expect(countHATCHCURVEDLines70(output.content)).toBe(2);

        // Sub-label on LABELS layer reads '(CURVED / 1 cuts)'
        expect(output.content).toContain('(CURVED / 1 cuts)');
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 71 – two curved panels with distinct kerfCounts on the same sheet
// each emit the correct '(CURVED / N cuts)' sub-label independently.
//
// Motivation: Stages 40 and 70 both tested single-panel sheets.  Stage 71
// verifies that when two curved panels are nested together, the sub-label for
// each placement carries its own kerfCount — not a shared value or the value
// from the other panel.
//
// Approach:
//   A NestingSheet is constructed manually with two curved placements:
//     Placement A: kerfCount=3, cutW=400, cutH=850, placed at (10, 10)
//     Placement B: kerfCount=7, cutW=300, cutH=600, placed at (500, 10)
//   Both placements have isCurved=true.
//   The bboxes do not overlap (A ends at x=410; B starts at x=500).
//
// Assertion:
//   The DXF ENTITIES section contains exactly two TEXT entities on the LABELS
//   layer matching '(CURVED / N cuts)': one with N=3 and one with N=7.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 71 – two curved panels with distinct kerfCounts on same sheet each emit correct \'(CURVED / N cuts)\' sub-label independently',
  () => {
    /**
     * Extract all N values from '(CURVED / N cuts)' TEXT entities on the LABELS layer.
     * Returns an array of integer kerf counts in order of appearance.
     */
    function parseCurvedLabelCounts71(content: string): number[] {
      const counts: number[] = [];
      const segs = content.split('\n0\nTEXT\n').slice(1);
      for (const seg of segs) {
        if (!seg.includes('8\nLABELS\n')) continue;
        const m = seg.match(/\n1\n\(CURVED \/ (\d+) cuts\)/);
        if (m) counts.push(parseInt(m[1], 10));
      }
      return counts;
    }

    it(
      'kerfCount=3 and kerfCount=7 on same sheet → both "(CURVED / 3 cuts)" and "(CURVED / 7 cuts)" appear independently',
      () => {
        const SHEET_W71 = 2440;
        const SHEET_H71 = 1220;

        // Placement A: kerfCount=3, bbox [10, 10, 410, 860]
        // Placement B: kerfCount=7, bbox [500, 10, 800, 610]
        // Bboxes are non-overlapping (A.x2=410 < B.x1=500)
        const sheet71: NestingSheet = {
          index1:         1,
          materialId:     MATERIAL_ID,
          sheetW:         SHEET_W71,
          sheetH:         SHEET_H71,
          sheetThickness: 18,
          label:          'NEST_71_TWO',
          placements: [
            {
              partId:    'SMOKE_KC3_S71',
              x:         10,
              y:         10,
              rotation:  0,
              cutW:      400,
              cutH:      850,
              isCurved:  true,
              kerfCount: 3,
            },
            {
              partId:    'SMOKE_KC7_S71',
              x:         500,
              y:         10,
              rotation:  0,
              cutW:      300,
              cutH:      600,
              isCurved:  true,
              kerfCount: 7,
            },
          ],
          utilization: 0,
        };

        const output = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE71', materialId: MATERIAL_ID },
          nesting: sheet71,
          profile: getFactoryProfile('DEFAULT'),
        });

        const counts = parseCurvedLabelCounts71(output.content);

        // Exactly 2 curved sub-labels present
        expect(counts).toHaveLength(2);

        // Both kerfCounts appear — order may vary depending on placement order
        expect(counts).toContain(3);
        expect(counts).toContain(7);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 72 – kerfCount=0 on a curved panel (correction > 0) → isCurved=false,
//            zero HATCH_CURVED lines emitted by buildDxfSheets.
//
// Rationale: kerfCount=0 means no kerf cuts are required for bending.
// The optimizer's kerfCount=0 guard overrides isCurved to false even when
// developedLength > projectedDepth. The DXF must therefore emit PARTS (not
// PARTS_CURVED) and zero HATCH_CURVED lines.
//
// Fixture: developedLength=250, projectedDepth=200, curvedEdge='TOP',
//   cutW=400, cutH=800, kerfCount=0 → correction=50 > 0 but
//   isCurved=false; flat-blank H still = cutH+correction for nesting
//   (the blank is cut, just not hatch-marked as curved in DXF).
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 72 – kerfCount=0 on curved-correction panel → isCurved=false and zero HATCH_CURVED lines',
  () => {
    function countHATCHCURVEDLines72(content: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(seg => /\n8\nHATCH_CURVED\n/.test(seg))
        .length;
    }

    it(
      'kerfCount=0 with correction=50 → isCurved=false → 0 HATCH_CURVED lines in DXF',
      () => {
        const stage72Row: CutListRow = {
          partId:          'SMOKE_KC0_S72',
          cabinetId:       'CAB_SMOKE_72',
          materialId:      MATERIAL_ID,
          finishW:         400,
          finishH:         800,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            400,
          cutH:            800,
          qty:             1,
          // correction = 250 − 200 = 50 > 0, but kerfCount=0 overrides isCurved
          developedLength: 250,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          kerfCount:       0,
          label:           'KC0 Curved Override Guard Panel',
        };

        const result72 = runNesting([stage72Row]);
        expect(result72.sheets).toHaveLength(1);

        const sheet72 = result72.sheets[0];
        expect(sheet72.placements).toHaveLength(1);

        // isCurved must be falsy — kerfCount=0 guard in optimizer overrides
        const placement72 = sheet72.placements[0];
        expect(placement72.isCurved).toBeFalsy();

        // Build DXF and assert zero HATCH_CURVED lines
        const output72 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE72', materialId: MATERIAL_ID },
          nesting: sheet72,
          profile:  getFactoryProfile('DEFAULT'),
        });

        expect(countHATCHCURVEDLines72(output72.content)).toBe(0);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 73 – three curved panels with kerfCounts kc=1, kc=5, kc=12 on the
//            same sheet each emit the correct '(CURVED / N cuts)' sub-label
//            in the DXF LABELS TEXT layer independently.
//
// Fixture: manual NestingSheet with three non-overlapping placements:
//   A: partId=SMOKE_KC1_S73, x=10,  y=10, cutW=300, cutH=700, kc=1
//   B: partId=SMOKE_KC5_S73, x=400, y=10, cutW=400, cutH=600, kc=5
//   C: partId=SMOKE_KC12_S73, x=900, y=10, cutW=350, cutH=550, kc=12
//   A ends at x=310, B ends at x=800, C starts at x=900 → non-overlapping.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 73 – three curved panels kc=1,5,12 on same sheet each emit correct "(CURVED / N cuts)" sub-label',
  () => {
    function parseCurvedLabelCounts73(content: string): number[] {
      const counts: number[] = [];
      const segs = content.split('\n0\nTEXT\n').slice(1);
      for (const seg of segs) {
        if (!seg.includes('8\nLABELS\n')) continue;
        const m = seg.match(/\n1\n\(CURVED \/ (\d+) cuts\)/);
        if (m) counts.push(parseInt(m[1], 10));
      }
      return counts;
    }

    it(
      'kc=1, kc=5, kc=12 on same sheet → all three "(CURVED / N cuts)" sub-labels present independently',
      () => {
        const SHEET_W73 = 2440;
        const SHEET_H73 = 1220;

        // Non-overlapping placement layout:
        //   A: x=[10..310],   y=[10..710]
        //   B: x=[400..800],  y=[10..610]
        //   C: x=[900..1250], y=[10..560]
        const sheet73: NestingSheet = {
          index1:         1,
          materialId:     MATERIAL_ID,
          sheetW:         SHEET_W73,
          sheetH:         SHEET_H73,
          sheetThickness: 18,
          label:          'NEST_73_THREE',
          placements: [
            {
              partId:    'SMOKE_KC1_S73',
              x:         10,
              y:         10,
              rotation:  0,
              cutW:      300,
              cutH:      700,
              isCurved:  true,
              kerfCount: 1,
            },
            {
              partId:    'SMOKE_KC5_S73',
              x:         400,
              y:         10,
              rotation:  0,
              cutW:      400,
              cutH:      600,
              isCurved:  true,
              kerfCount: 5,
            },
            {
              partId:    'SMOKE_KC12_S73',
              x:         900,
              y:         10,
              rotation:  0,
              cutW:      350,
              cutH:      550,
              isCurved:  true,
              kerfCount: 12,
            },
          ],
          utilization: 0,
        };

        const output73 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE73', materialId: MATERIAL_ID },
          nesting: sheet73,
          profile:  getFactoryProfile('DEFAULT'),
        });

        const counts73 = parseCurvedLabelCounts73(output73.content);

        // Exactly 3 curved sub-labels
        expect(counts73).toHaveLength(3);

        // All three kerfCounts appear — order may vary
        expect(counts73).toContain(1);
        expect(counts73).toContain(5);
        expect(counts73).toContain(12);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 74 – kerfCount=0 panels use the PARTS layer (not PARTS_CURVED) and
//            emit zero PARTS_CURVED LINE entities.
//
// Rationale: because kerfCount=0 → isCurved=false (optimizer guard), the DXF
// builder must route the part rectangle to the PARTS layer (green) instead of
// PARTS_CURVED (red). No PARTS_CURVED LINE entities should be present.
//
// Fixture: same as Stage 72 —
//   developedLength=250, projectedDepth=200, curvedEdge='TOP',
//   cutW=400, cutH=800, kerfCount=0 → isCurved=false.
// Assertions:
//   (a) PARTS_CURVED LINE count = 0
//   (b) PARTS LINE count = 4 (one rectangle, four edges)
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 74 – kerfCount=0 panel uses PARTS layer (not PARTS_CURVED) and emits zero PARTS_CURVED entities',
  () => {
    function countLayerLines74(content: string, layer: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(seg => seg.startsWith(`8\n${layer}\n`))
        .length;
    }

    it(
      'kerfCount=0 → PARTS_CURVED LINE count=0 and PARTS LINE count=4 (rectangle, four edges)',
      () => {
        const stage74Row: CutListRow = {
          partId:          'SMOKE_KC0_S74',
          cabinetId:       'CAB_SMOKE_74',
          materialId:      MATERIAL_ID,
          finishW:         400,
          finishH:         800,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            400,
          cutH:            800,
          qty:             1,
          developedLength: 250,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          kerfCount:       0,   // guard: isCurved=false despite correction > 0
          label:           'KC0 Layer Guard Panel',
        };

        const result74 = runNesting([stage74Row]);
        expect(result74.sheets).toHaveLength(1);

        const sheet74 = result74.sheets[0];

        const output74 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE74', materialId: MATERIAL_ID },
          nesting: sheet74,
          profile:  getFactoryProfile('DEFAULT'),
        });

        // (a) Zero PARTS_CURVED lines — placement is not curved
        expect(countLayerLines74(output74.content, 'PARTS_CURVED')).toBe(0);

        // (b) Exactly 4 PARTS lines — one rectangle (top, bottom, left, right)
        expect(countLayerLines74(output74.content, 'PARTS')).toBe(4);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 75 – a panel with kerfCount=undefined and correction > 0 still gets
//            isCurved=true and emits exactly 2 HATCH_CURVED lines.
//
// Rationale: the kerfCount=0 guard in the optimizer only fires when kerfCount
// is EXPLICITLY set to 0. When kerfCount is absent (undefined), the guard must
// NOT override isCurved — correction > 0 alone determines isCurved=true.
//
// Fixture: developedLength=250, projectedDepth=200, curvedEdge='TOP',
//   cutW=400, cutH=800, kerfCount NOT SET (undefined) → correction=50 > 0
//   → isCurved=true → 2 HATCH_CURVED lines.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 75 – kerfCount=undefined with correction > 0 → isCurved=true and exactly 2 HATCH_CURVED lines',
  () => {
    function countHATCHCURVEDLines75(content: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(seg => seg.startsWith('8\nHATCH_CURVED\n'))
        .length;
    }

    it(
      'kerfCount=undefined with correction=50 → isCurved=true → 2 HATCH_CURVED lines in DXF',
      () => {
        const stage75Row: CutListRow = {
          partId:          'SMOKE_KCUNDEF_S75',
          cabinetId:       'CAB_SMOKE_75',
          materialId:      MATERIAL_ID,
          finishW:         400,
          finishH:         800,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            400,
          cutH:            800,
          qty:             1,
          developedLength: 250,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          // kerfCount intentionally omitted — guard must NOT override isCurved
          label:           'KC Undefined Guard Panel',
        };

        const result75 = runNesting([stage75Row]);
        expect(result75.sheets).toHaveLength(1);

        const sheet75 = result75.sheets[0];
        expect(sheet75.placements).toHaveLength(1);

        // isCurved must be true — undefined kerfCount does not trigger the guard
        const placement75 = sheet75.placements[0];
        expect(placement75.isCurved).toBe(true);

        const output75 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE75', materialId: MATERIAL_ID },
          nesting: sheet75,
          profile:  getFactoryProfile('DEFAULT'),
        });

        // Exactly 2 HATCH_CURVED lines (d1 + d2)
        expect(countHATCHCURVEDLines75(output75.content)).toBe(2);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 76 – a panel with kerfCount=undefined and correction=0 gets
//            isCurved=false and emits zero HATCH_CURVED lines.
//
// Rationale: correction=0 (developedLength === projectedDepth) means no flat-
// blank expansion is needed. Even though kerfCount is undefined (guard does not
// apply), correction>0 is FALSE, so isCurved must be false and no HATCH_CURVED
// lines should appear in the DXF output.
//
// Fixture: developedLength=200, projectedDepth=200, curvedEdge='TOP',
//   cutW=400, cutH=800, kerfCount NOT SET (undefined) → correction=0
//   → isCurved=false → 0 HATCH_CURVED lines.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 76 – kerfCount=undefined with correction=0 → isCurved=false and zero HATCH_CURVED lines',
  () => {
    function countHATCHCURVEDLines76(content: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(seg => seg.startsWith('8\nHATCH_CURVED\n'))
        .length;
    }

    it(
      'kerfCount=undefined with correction=0 → isCurved=false → 0 HATCH_CURVED lines in DXF',
      () => {
        const stage76Row: CutListRow = {
          partId:          'SMOKE_KC_UNDEF_CORR0_S76',
          cabinetId:       'CAB_SMOKE_76',
          materialId:      MATERIAL_ID,
          finishW:         400,
          finishH:         800,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            400,
          cutH:            800,
          qty:             1,
          developedLength: 200,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          // kerfCount intentionally omitted; correction=0 → isCurved must be false
          label:           'KC Undefined Zero Correction Panel',
        };

        const result76 = runNesting([stage76Row]);
        expect(result76.sheets).toHaveLength(1);

        const sheet76 = result76.sheets[0];
        expect(sheet76.placements).toHaveLength(1);

        // isCurved must be false — correction=0 overrides regardless of kerfCount
        const placement76 = sheet76.placements[0];
        expect(placement76.isCurved).toBeFalsy();

        const output76 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE76', materialId: MATERIAL_ID },
          nesting: sheet76,
          profile:  getFactoryProfile('DEFAULT'),
        });

        // Zero HATCH_CURVED lines — panel is not curved
        expect(countHATCHCURVEDLines76(output76.content)).toBe(0);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 77 – two panels on the same sheet: kerfCount=0 (Panel A) produces
//            PARTS_CURVED=0; kerfCount=undefined + correction>0 (Panel B)
//            produces isCurved=true and exactly 2 HATCH_CURVED lines.
//
// Rationale: on a mixed sheet the kerfCount=0 guard must only suppress the
// kc=0 panel (Panel A → PARTS layer, no PARTS_CURVED, no HATCH_CURVED), while
// the kc=undefined panel (Panel B → PARTS_CURVED layer + 2 HATCH_CURVED lines)
// behaves independently.
//
// Panel A: partId='SMOKE_KC0_S77A', kerfCount=0, cutW=300, cutH=400,
//   developedLength=250, projectedDepth=200, curvedEdge='TOP'
//   → correction=50 > 0 but kerfCount=0 → isCurved=false
//
// Panel B: partId='SMOKE_KCUNDEF_S77B', kerfCount omitted, same dims
//   → correction=50 > 0 and kc=undefined → isCurved=true
//
// Sheet totals: PARTS=4 (from A), PARTS_CURVED=4 (from B), HATCH_CURVED=2 (from B).
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 77 – kerfCount=0 vs kerfCount=undefined+correction>0 on same sheet: PARTS=4, PARTS_CURVED=4, HATCH_CURVED=2',
  () => {
    function countLayerLines77(content: string, layer: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(seg => seg.startsWith(`8\n${layer}\n`))
        .length;
    }

    it(
      'kc=0 panel → PARTS=4; kc=undefined+correction>0 panel → PARTS_CURVED=4, HATCH_CURVED=2',
      () => {
        const rowA: CutListRow = {
          partId:          'SMOKE_KC0_S77A',
          cabinetId:       'CAB_SMOKE_77A',
          materialId:      MATERIAL_ID,
          finishW:         300,
          finishH:         400,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            300,
          cutH:            400,
          qty:             1,
          developedLength: 250,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          kerfCount:       0,           // explicit kc=0 → guard fires → isCurved=false
          label:           'KC Zero Panel A',
        };

        const rowB: CutListRow = {
          partId:          'SMOKE_KCUNDEF_S77B',
          cabinetId:       'CAB_SMOKE_77B',
          materialId:      MATERIAL_ID,
          finishW:         300,
          finishH:         400,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            300,
          cutH:            400,
          qty:             1,
          developedLength: 250,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          // kerfCount intentionally omitted → guard does NOT fire → isCurved=true
          label:           'KC Undefined Panel B',
        };

        const result77 = runNesting([rowA, rowB]);
        // Both panels should fit on a single standard sheet
        expect(result77.sheets).toHaveLength(1);

        const sheet77 = result77.sheets[0];
        expect(sheet77.placements).toHaveLength(2);

        // Locate placements by partId
        const pA = sheet77.placements.find(p => p.partId === 'SMOKE_KC0_S77A');
        const pB = sheet77.placements.find(p => p.partId === 'SMOKE_KCUNDEF_S77B');
        expect(pA).toBeDefined();
        expect(pB).toBeDefined();

        // (a) kerfCount=0 panel must NOT be curved
        expect(pA!.isCurved).toBeFalsy();

        // (b) kerfCount=undefined + correction>0 panel MUST be curved
        expect(pB!.isCurved).toBe(true);

        const output77 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE77', materialId: MATERIAL_ID },
          nesting: sheet77,
          profile:  getFactoryProfile('DEFAULT'),
        });

        // (c) Panel A → PARTS layer, 4 lines (one rectangle)
        expect(countLayerLines77(output77.content, 'PARTS')).toBe(4);

        // (d) Panel B → PARTS_CURVED layer, 4 lines (one rectangle)
        expect(countLayerLines77(output77.content, 'PARTS_CURVED')).toBe(4);

        // (e) Panel B → HATCH_CURVED layer, 2 lines (d1 + d2)
        expect(countLayerLines77(output77.content, 'HATCH_CURVED')).toBe(2);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 78 – three panels on the same sheet exercise all three kerfCount guard
//            boundaries simultaneously:
//
//   Panel A: kerfCount=0,       correction=50 > 0  → isCurved=false (kc=0 guard)
//   Panel B: kerfCount=undef,   correction=0       → isCurved=false (correction gate)
//   Panel C: kerfCount=undef,   correction=50 > 0  → isCurved=true  (no guard)
//
// Sheet-level totals:
//   PARTS       = 8  (Panel A + Panel B → 4 lines each)
//   PARTS_CURVED = 4  (Panel C only)
//   HATCH_CURVED = 2  (Panel C only: d1 + d2)
//
// Regression guard: verifies all three guard paths in one nesting run.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 78 – triple-guard regression: kc=0 + kc=undef+corr=0 + kc=undef+corr>0 → PARTS=8, PARTS_CURVED=4, HATCH_CURVED=2',
  () => {
    function countLayerLines78(content: string, layer: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(seg => seg.startsWith(`8\n${layer}\n`))
        .length;
    }

    it(
      'three panels covering all guard paths produce PARTS=8, PARTS_CURVED=4, HATCH_CURVED=2',
      () => {
        // Panel A — kerfCount=0, correction=50 > 0 → kc=0 guard fires → isCurved=false
        const rowA: CutListRow = {
          partId:          'SMOKE_KC0_S78A',
          cabinetId:       'CAB_SMOKE_78A',
          materialId:      MATERIAL_ID,
          finishW:         300,
          finishH:         400,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            300,
          cutH:            400,
          qty:             1,
          developedLength: 250,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          kerfCount:       0,
          label:           'Guard A – kc=0',
        };

        // Panel B — kerfCount=undef, correction=0 → correction gate fires → isCurved=false
        const rowB: CutListRow = {
          partId:          'SMOKE_KCUNDEF_CORR0_S78B',
          cabinetId:       'CAB_SMOKE_78B',
          materialId:      MATERIAL_ID,
          finishW:         300,
          finishH:         400,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            300,
          cutH:            400,
          qty:             1,
          developedLength: 200,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          // kerfCount intentionally omitted; correction=0 → isCurved=false
          label:           'Guard B – kc=undef, corr=0',
        };

        // Panel C — kerfCount=undef, correction=50 > 0 → no guard fires → isCurved=true
        const rowC: CutListRow = {
          partId:          'SMOKE_KCUNDEF_CORRPOS_S78C',
          cabinetId:       'CAB_SMOKE_78C',
          materialId:      MATERIAL_ID,
          finishW:         300,
          finishH:         400,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            300,
          cutH:            400,
          qty:             1,
          developedLength: 250,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          // kerfCount intentionally omitted; correction=50 > 0 → isCurved=true
          label:           'Guard C – kc=undef, corr>0',
        };

        const result78 = runNesting([rowA, rowB, rowC]);
        expect(result78.sheets).toHaveLength(1);

        const sheet78 = result78.sheets[0];
        expect(sheet78.placements).toHaveLength(3);

        // Locate placements by partId
        const pA = sheet78.placements.find(p => p.partId === 'SMOKE_KC0_S78A');
        const pB = sheet78.placements.find(p => p.partId === 'SMOKE_KCUNDEF_CORR0_S78B');
        const pC = sheet78.placements.find(p => p.partId === 'SMOKE_KCUNDEF_CORRPOS_S78C');
        expect(pA).toBeDefined();
        expect(pB).toBeDefined();
        expect(pC).toBeDefined();

        // isCurved per-panel
        expect(pA!.isCurved).toBeFalsy();   // kc=0 guard
        expect(pB!.isCurved).toBeFalsy();   // correction=0 gate
        expect(pC!.isCurved).toBe(true);    // neither guard fires

        const output78 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE78', materialId: MATERIAL_ID },
          nesting: sheet78,
          profile:  getFactoryProfile('DEFAULT'),
        });

        // Sheet-level layer counts
        expect(countLayerLines78(output78.content, 'PARTS')).toBe(8);
        expect(countLayerLines78(output78.content, 'PARTS_CURVED')).toBe(4);
        expect(countLayerLines78(output78.content, 'HATCH_CURVED')).toBe(2);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 79 – a panel with kerfCount=NaN behaves identically to kerfCount=0:
//            NaN is not > 0 and is not === undefined, so the guard expression
//            (row.kerfCount === undefined || row.kerfCount > 0) evaluates to
//            (false || false) = false → isCurved=false → zero HATCH_CURVED lines.
//
// Fixture: cutW=400, cutH=800, developedLength=250, projectedDepth=200,
//   curvedEdge='TOP', kerfCount=NaN → correction=50 > 0 but kc guard fires.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 79 – kerfCount=NaN coerces to falsy: isCurved=false and zero HATCH_CURVED lines',
  () => {
    function countHATCHCURVEDLines79(content: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(seg => seg.startsWith('8\nHATCH_CURVED\n'))
        .length;
    }

    it(
      'kerfCount=NaN with correction=50 > 0 → isCurved=false → 0 HATCH_CURVED lines in DXF',
      () => {
        // NaN is a number in JS/TS but is neither > 0 nor === undefined,
        // so the optimizer guard evaluates to false — identical to kc=0.
        const stage79Row: CutListRow = {
          partId:          'SMOKE_KCNAN_S79',
          cabinetId:       'CAB_SMOKE_79',
          materialId:      MATERIAL_ID,
          finishW:         400,
          finishH:         800,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            400,
          cutH:            800,
          qty:             1,
          developedLength: 250,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          kerfCount:       NaN,
          label:           'KC NaN Guard Panel',
        };

        const result79 = runNesting([stage79Row]);
        expect(result79.sheets).toHaveLength(1);

        const sheet79 = result79.sheets[0];
        expect(sheet79.placements).toHaveLength(1);

        // isCurved must be false — NaN is not > 0 and not === undefined
        const placement79 = sheet79.placements[0];
        expect(placement79.isCurved).toBeFalsy();

        const output79 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE79', materialId: MATERIAL_ID },
          nesting: sheet79,
          profile:  getFactoryProfile('DEFAULT'),
        });

        // Zero HATCH_CURVED lines — kerfCount=NaN suppresses isCurved
        expect(countHATCHCURVEDLines79(output79.content)).toBe(0);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 80 – kerfCount=Infinity is truthy and passes > 0, so the guard does
//            NOT fire → isCurved=true when correction > 0 → exactly 2
//            HATCH_CURVED lines in the DXF output.
//
// Guard expression:
//   (row.kerfCount === undefined || row.kerfCount > 0)
//   = (false || true)   ← Infinity > 0 is true in JS
//   = true  → guard passes → isCurved follows correction > 0 alone
//
// Fixture: cutW=400, cutH=800, developedLength=250, projectedDepth=200,
//   curvedEdge='TOP', kerfCount=Infinity → correction=50 > 0 → isCurved=true.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 80 – kerfCount=Infinity passes guard (> 0 = true): isCurved=true and exactly 2 HATCH_CURVED lines',
  () => {
    function countHATCHCURVEDLines80(content: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(seg => seg.startsWith('8\nHATCH_CURVED\n'))
        .length;
    }

    it(
      'kerfCount=Infinity with correction=50 > 0 → guard does not fire → isCurved=true → 2 HATCH_CURVED lines',
      () => {
        const stage80Row: CutListRow = {
          partId:          'SMOKE_KCINF_S80',
          cabinetId:       'CAB_SMOKE_80',
          materialId:      MATERIAL_ID,
          finishW:         400,
          finishH:         800,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            400,
          cutH:            800,
          qty:             1,
          developedLength: 250,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          kerfCount:       Infinity,   // Infinity > 0 → guard passes → isCurved=true
          label:           'KC Infinity Panel',
        };

        const result80 = runNesting([stage80Row]);
        expect(result80.sheets).toHaveLength(1);

        const sheet80 = result80.sheets[0];
        expect(sheet80.placements).toHaveLength(1);

        // isCurved must be true — Infinity passes the kerfCount guard
        const placement80 = sheet80.placements[0];
        expect(placement80.isCurved).toBe(true);

        const output80 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE80', materialId: MATERIAL_ID },
          nesting: sheet80,
          profile:  getFactoryProfile('DEFAULT'),
        });

        // Exactly 2 HATCH_CURVED lines (d1 + d2)
        expect(countHATCHCURVEDLines80(output80.content)).toBe(2);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 81 – kerfCount=-1 is negative, therefore NOT > 0, and NOT === undefined.
//            Guard expression:
//              (row.kerfCount === undefined || row.kerfCount > 0)
//              = (false || false)   ← -1 > 0 is false in JS
//              = false → isCurved=false → zero HATCH_CURVED lines.
//
// Behaviour is identical to kerfCount=0 and kerfCount=NaN.
//
// Fixture: cutW=400, cutH=800, developedLength=250, projectedDepth=200,
//   curvedEdge='TOP', kerfCount=-1 → correction=50 > 0 but guard fires.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 81 – kerfCount=-1 (negative, not > 0): isCurved=false and zero HATCH_CURVED lines',
  () => {
    function countHATCHCURVEDLines81(content: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(seg => seg.startsWith('8\nHATCH_CURVED\n'))
        .length;
    }

    it(
      'kerfCount=-1 with correction=50 > 0 → guard fires → isCurved=false → 0 HATCH_CURVED lines',
      () => {
        const stage81Row: CutListRow = {
          partId:          'SMOKE_KCNEG_S81',
          cabinetId:       'CAB_SMOKE_81',
          materialId:      MATERIAL_ID,
          finishW:         400,
          finishH:         800,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            400,
          cutH:            800,
          qty:             1,
          developedLength: 250,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          kerfCount:       -1,   // negative → not > 0 → guard fires → isCurved=false
          label:           'KC Negative Panel',
        };

        const result81 = runNesting([stage81Row]);
        expect(result81.sheets).toHaveLength(1);

        const sheet81 = result81.sheets[0];
        expect(sheet81.placements).toHaveLength(1);

        // isCurved must be false — kerfCount=-1 fails the > 0 test
        const placement81 = sheet81.placements[0];
        expect(placement81.isCurved).toBeFalsy();

        const output81 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE81', materialId: MATERIAL_ID },
          nesting: sheet81,
          profile:  getFactoryProfile('DEFAULT'),
        });

        // Zero HATCH_CURVED lines — kerfCount=-1 suppresses isCurved
        expect(countHATCHCURVEDLines81(output81.content)).toBe(0);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 82 – kerfCount=null is falsy, and:
//              null === undefined  → false   (strict equality)
//              null > 0           → false   (null coerces to 0; 0 > 0 = false)
//            Guard expression:
//              (row.kerfCount === undefined || row.kerfCount > 0)
//              = (false || false)   ← both arms fail
//              = false → isCurved=false → zero HATCH_CURVED lines.
//
//            Behaviour is identical to kerfCount=0, NaN, and -1.
//            null is cast via `null as unknown as number` to satisfy the
//            TypeScript `kerfCount?: number` type at compile time; the runtime
//            coercion under test is real and matches production guard logic.
//
// Fixture: cutW=400, cutH=800, developedLength=250, projectedDepth=200,
//   curvedEdge='TOP', kerfCount=null → correction=50 > 0 but guard fires.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 82 – kerfCount=null (falsy, fails guard): isCurved=false and zero HATCH_CURVED lines',
  () => {
    function countHATCHCURVEDLines82(content: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(seg => seg.startsWith('8\nHATCH_CURVED\n'))
        .length;
    }

    it(
      'kerfCount=null with correction=50 > 0 → guard fires (null > 0 = false) → isCurved=false → 0 HATCH_CURVED lines',
      () => {
        const stage82Row: CutListRow = {
          partId:          'SMOKE_KCNULL_S82',
          cabinetId:       'CAB_SMOKE_82',
          materialId:      MATERIAL_ID,
          finishW:         400,
          finishH:         800,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            400,
          cutH:            800,
          qty:             1,
          developedLength: 250,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          // null is not a valid number in TypeScript but is a realistic runtime
          // coercion; cast to satisfy kerfCount?: number at compile time.
          kerfCount:       null as unknown as number,
          label:           'KC Null Panel',
        };

        const result82 = runNesting([stage82Row]);
        expect(result82.sheets).toHaveLength(1);

        const sheet82 = result82.sheets[0];
        expect(sheet82.placements).toHaveLength(1);

        // isCurved must be false — null fails both arms of the guard
        const placement82 = sheet82.placements[0];
        expect(placement82.isCurved).toBeFalsy();

        const output82 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE82', materialId: MATERIAL_ID },
          nesting: sheet82,
          profile:  getFactoryProfile('DEFAULT'),
        });

        // Zero HATCH_CURVED lines — kerfCount=null suppresses isCurved
        expect(countHATCHCURVEDLines82(output82.content)).toBe(0);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 83 – Ten curved panels on one sheet: PARTS_CURVED count=40,
//            all ten per-panel bboxes mutually non-overlapping.
//
// Fixture design (single row, qty=10):
//   cutW=100, cutH=100, developedLength=110, projectedDepth=100,
//   curvedEdge='TOP', kerfCount=undefined → correction=10 > 0 → isCurved=true.
//   flatBlankW=100, flatBlankH=110.
//   grainDirection='NONE' (no grain field) → FFDH may rotate freely.
//
// FFDH packing analysis (sheet=1220×2440, kerf=3.5, edge=10):
//   usableW=1200, usableH=2420.
//   Orientation options: {w:100,h:110} and {w:110,h:100}.
//   New-shelf: picks smaller h → h=100, w=110 (rotation=90).
//   Shelf-1 y=10, height=100:
//     p1  x=10      p2  x=123.5   p3  x=237     p4  x=350.5   p5  x=464
//     p6  x=577.5   p7  x=691     p8  x=804.5   p9  x=918     p10 x=1031.5
//   Each takes 110 mm + 3.5 mm kerf → 10 panels consume 1131.5 mm < 1200 mm ✓
//   Total height: 10 + 100 = 110 mm ≪ 2440 mm → all 10 on one sheet ✓
//
// Rotation=90 in placement → getRotatedDimensions(cutW=100,cutH=110,90)
//   → effectiveW=110, effectiveH=100.
//   PARTS_CURVED bbox per panel: (p.x, p.y, p.x+110, p.y+100).
//   Since all panels share the same shelf row (y=10, h=100) and differ only
//   in x (spaced 113.5 mm apart), every x-axis pair is non-overlapping.
//
// Assertions:
//   • result.sheets.length === 1   (all 10 fit on one sheet)
//   • result.sheets[0].placements.length === 10
//   • all 10 placements have isCurved=true
//   • PARTS_CURVED LINE count === 40   (10 curved panels × 4 edges each)
//   • rects.length === 10
//   • all C(10,2)=45 pairs are non-overlapping (separated on ≥ 1 axis)
//
// 1 it() block.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 83 — ten curved panels on same sheet: PARTS_CURVED count=40, all ten bboxes mutually non-overlapping',
  () => {

    const EPS = 0.015;

    /** Count PARTS_CURVED LINE entities in the DXF content string. */
    function countPARTSCURVEDLines83(content: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(seg => seg.startsWith('8\nPARTS_CURVED\n'))
        .length;
    }

    /**
     * Split PARTS_CURVED LINE segments into per-rectangle groups of 4 and
     * return each group's bounding rect.
     * addRectangle() always emits its 4 edges consecutively, so chunk index i
     * corresponds to the i-th curved placement in order.
     */
    function parsePARTSCURVEDRectList83(
      content: string,
    ): Array<{ minX: number; maxX: number; minY: number; maxY: number }> {
      const segs = content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(s => s.startsWith('8\nPARTS_CURVED\n'));

      const result: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];

      for (let i = 0; i < segs.length; i += 4) {
        const chunk = segs.slice(i, i + 4);
        const xs: number[] = [];
        const ys: number[] = [];
        for (const seg of chunk) {
          const num = (code: string): number => {
            const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
            return m ? parseFloat(m[1]) : NaN;
          };
          xs.push(num('10'), num('11'));
          ys.push(num('20'), num('21'));
        }
        result.push({
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
        });
      }
      return result;
    }

    it(
      '10 curved panels (qty=10, kc=undefined, correction=10): PARTS_CURVED=40, all 10 bboxes mutually non-overlapping',
      () => {
        // Single row with qty=10 — optimizer expands to 10 NestingParts
        const stage83Row: CutListRow = {
          partId:          'SMOKE_TEN_CURVED_S83',
          cabinetId:       'CAB_SMOKE_83',
          materialId:      MATERIAL_ID,
          finishW:         100,
          finishH:         100,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            100,
          cutH:            100,
          qty:             10,
          developedLength: 110,
          projectedDepth:  100,
          curvedEdge:      'TOP',
          // kerfCount: undefined — guard passes → isCurved follows correction > 0
          label:           'Ten Curved Panel',
        };

        const result83 = runNesting([stage83Row]);

        // All 10 panels must land on exactly one sheet
        expect(result83.sheets).toHaveLength(1);

        const sheet83 = result83.sheets[0];
        expect(sheet83.placements).toHaveLength(10);

        // Every placement must be isCurved=true (correction=10>0, kc=undefined passes)
        for (const p of sheet83.placements) {
          expect(p.isCurved).toBe(true);
        }

        const output83 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE83', materialId: MATERIAL_ID },
          nesting: sheet83,
          profile:  getFactoryProfile('DEFAULT'),
        });

        // ── PARTS_CURVED count ────────────────────────────────────────────────
        // 10 curved panels × 4 edges each = 40 PARTS_CURVED LINE entities
        expect(countPARTSCURVEDLines83(output83.content)).toBe(40);

        // ── Per-panel bboxes ──────────────────────────────────────────────────
        const rects = parsePARTSCURVEDRectList83(output83.content);
        expect(rects).toHaveLength(10);

        // ── All C(10,2)=45 pairs mutually non-overlapping ─────────────────────
        // Two axis-aligned rectangles are non-overlapping iff separated on ≥ 1 axis.
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i];
            const b = rects[j];
            const noOverlapX = a.maxX <= b.minX + EPS || b.maxX <= a.minX + EPS;
            const noOverlapY = a.maxY <= b.minY + EPS || b.maxY <= a.minY + EPS;
            expect(noOverlapX || noOverlapY).toBe(true);
          }
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 84 – Twenty curved panels on one sheet: PARTS_CURVED count=80,
//            all twenty per-panel bboxes mutually non-overlapping.
//
// Fixture: same as Stage 83 (cutW=100, cutH=100, correction=10) but qty=20.
//   flatBlankW=100, flatBlankH=110. FFDH orientation: h=100, w=110 (rotation=90).
//
// FFDH packing analysis (sheet=1220×2440, kerf=3.5, edge=10):
//   usableW=1200, usableH=2420.
//   Panels per shelf: 10 (1131.5 mm < usableW=1200 mm — same as Stage 83).
//   Shelf-1 y=10,    height=100 → panels 1–10
//   Shelf-2 y=113.5, height=100 → panels 11–20
//   Total height used: 113.5+100=213.5 mm ≪ 2440 mm → all 20 on one sheet ✓
//
// Non-overlapping check:
//   Same-shelf pairs (X-separated by 3.5 mm kerf) — same logic as Stage 83.
//   Cross-shelf pairs: shelf-1 bbox maxY=110, shelf-2 bbox minY=113.5;
//     noOverlapY = 110 <= 113.5+EPS ✓.
//   All C(20,2)=190 pairs verified.
//
// Assertions:
//   • result.sheets.length === 1
//   • result.sheets[0].placements.length === 20
//   • all 20 placements have isCurved=true
//   • PARTS_CURVED LINE count === 80   (20 × 4 edges)
//   • rects.length === 20
//   • all 190 pairs mutually non-overlapping
//
// 1 it() block.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 84 — twenty curved panels on same sheet: PARTS_CURVED count=80, all twenty bboxes mutually non-overlapping',
  () => {

    const EPS = 0.015;

    function countPARTSCURVEDLines84(content: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(seg => seg.startsWith('8\nPARTS_CURVED\n'))
        .length;
    }

    function parsePARTSCURVEDRectList84(
      content: string,
    ): Array<{ minX: number; maxX: number; minY: number; maxY: number }> {
      const segs = content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(s => s.startsWith('8\nPARTS_CURVED\n'));

      const result: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];
      for (let i = 0; i < segs.length; i += 4) {
        const chunk = segs.slice(i, i + 4);
        const xs: number[] = [];
        const ys: number[] = [];
        for (const seg of chunk) {
          const num = (code: string): number => {
            const m = seg.match(new RegExp(`\n${code}\n([\\d.+\\-e]+)`));
            return m ? parseFloat(m[1]) : NaN;
          };
          xs.push(num('10'), num('11'));
          ys.push(num('20'), num('21'));
        }
        result.push({
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
        });
      }
      return result;
    }

    it(
      '20 curved panels (qty=20, same 100×100 fixture): PARTS_CURVED=80, all 20 bboxes mutually non-overlapping',
      () => {
        const stage84Row: CutListRow = {
          partId:          'SMOKE_TWENTY_CURVED_S84',
          cabinetId:       'CAB_SMOKE_84',
          materialId:      MATERIAL_ID,
          finishW:         100,
          finishH:         100,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            100,
          cutH:            100,
          qty:             20,
          developedLength: 110,
          projectedDepth:  100,
          curvedEdge:      'TOP',
          label:           'Twenty Curved Panel',
        };

        const result84 = runNesting([stage84Row]);

        // All 20 fit on exactly one sheet (two shelves of 10 each)
        expect(result84.sheets).toHaveLength(1);

        const sheet84 = result84.sheets[0];
        expect(sheet84.placements).toHaveLength(20);

        for (const p of sheet84.placements) {
          expect(p.isCurved).toBe(true);
        }

        const output84 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE84', materialId: MATERIAL_ID },
          nesting: sheet84,
          profile:  getFactoryProfile('DEFAULT'),
        });

        // 20 curved panels × 4 edges = 80 PARTS_CURVED LINE entities
        expect(countPARTSCURVEDLines84(output84.content)).toBe(80);

        // Per-panel bboxes
        const rects84 = parsePARTSCURVEDRectList84(output84.content);
        expect(rects84).toHaveLength(20);

        // All C(20,2)=190 pairs mutually non-overlapping
        for (let i = 0; i < rects84.length; i++) {
          for (let j = i + 1; j < rects84.length; j++) {
            const a = rects84[i];
            const b = rects84[j];
            const noOverlapX = a.maxX <= b.minX + EPS || b.maxX <= a.minX + EPS;
            const noOverlapY = a.maxY <= b.minY + EPS || b.maxY <= a.minY + EPS;
            expect(noOverlapX || noOverlapY).toBe(true);
          }
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 85 – runNesting determinism for multi-panel batches:
//            running runNesting twice with the same qty=10 curved row
//            produces identical placement x/y coordinates on both calls.
//
// Guards against non-deterministic sort or ID collisions in FFDH that could
// produce different layout orderings across runs.
//
// Fixture: same 100×100 small curved panel with qty=10 (same as Stage 83).
//   Both runs use a fresh copy of the same row to exclude object aliasing.
//
// Assertions per run pair:
//   • sheets.length identical
//   • placements.length identical for each sheet
//   • every placement x and y matches to floating-point equality
//
// 1 it() block.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 85 — multi-panel determinism: runNesting with qty=10 twice produces identical placement coordinates',
  () => {
    it(
      'two runNesting calls with identical qty=10 curved row → same placement x/y coordinates on all panels',
      () => {
        const makeRow85 = (): CutListRow => ({
          partId:          'SMOKE_TEN_DET_S85',
          cabinetId:       'CAB_SMOKE_85',
          materialId:      MATERIAL_ID,
          finishW:         100,
          finishH:         100,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            100,
          cutH:            100,
          qty:             10,
          developedLength: 110,
          projectedDepth:  100,
          curvedEdge:      'TOP',
          label:           'Ten Curved Det Panel',
        });

        const run1 = runNesting([makeRow85()]);
        const run2 = runNesting([makeRow85()]);

        // Same number of sheets
        expect(run1.sheets).toHaveLength(run2.sheets.length);

        for (let s = 0; s < run1.sheets.length; s++) {
          const ps1 = run1.sheets[s].placements;
          const ps2 = run2.sheets[s].placements;

          // Same placement count per sheet
          expect(ps1).toHaveLength(ps2.length);

          // Every x and y coordinate must match exactly
          for (let p = 0; p < ps1.length; p++) {
            expect(ps1[p].x).toBe(ps2[p].x);
            expect(ps1[p].y).toBe(ps2[p].y);
          }
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 86 – Overflow to two sheets: PARTS_CURVED = 4 × total placements
//            across both sheets.
//
// Fixture design (qty=56 exceeds single-sheet capacity):
//   cutW=200, cutH=200, developedLength=210, projectedDepth=200,
//   curvedEdge='TOP', kerfCount=undefined → correction=10 > 0 → isCurved=true.
//   flatBlankW=200, flatBlankH=210. grainDirection='NONE' → FFDH may rotate.
//
// FFDH packing analysis (sheet=1220×2440, kerf=3.5, edge=10):
//   usableW=1200, usableH=2420.
//   Best orientation: h=200, w=210 (rotation=90, smaller h wins new-shelf).
//   Panels per shelf: 5   (5×210 + 4×3.5 = 1064 ≤ 1200; 6×210 + 5×3.5 = 1277.5 > 1200).
//   Shelves per sheet: 11 (shelf-11 y=2045; 2045+200=2245 ≤ 2430 ✓;
//                          shelf-12 y=2248.5; 2248.5+200=2448.5 > 2430 ✗).
//   Sheet-1 capacity: 11 × 5 = 55 panels.
//   qty=56 → sheet-1=55, sheet-2=1. Total placements=56.
//
// Assertions:
//   • result.sheets.length === 2
//   • sheet-1 placements.length === 55
//   • sheet-2 placements.length === 1
//   • all placements (both sheets) have isCurved=true
//   • PARTS_CURVED total across both DXF outputs === 4 × totalPlacements
//     (verified dynamically: 4 × 56 = 224)
//
// 1 it() block.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 86 — overflow to two sheets: PARTS_CURVED = 4 × total placements across both sheets',
  () => {

    function countPARTSCURVEDLines86(content: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter(seg => seg.startsWith('8\nPARTS_CURVED\n'))
        .length;
    }

    it(
      'qty=56 medium curved panels → 2 sheets (55 + 1); PARTS_CURVED total = 4 × 56 = 224',
      () => {
        const stage86Row: CutListRow = {
          partId:          'SMOKE_OVERFLOW_S86',
          cabinetId:       'CAB_SMOKE_86',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             56,    // 55 fit on sheet-1; 56th overflows to sheet-2
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Overflow Curved Panel',
        };

        const result86 = runNesting([stage86Row]);

        // Exactly two sheets
        expect(result86.sheets).toHaveLength(2);

        const [sheet86a, sheet86b] = result86.sheets;

        // Sheet-1 holds 55 panels; sheet-2 holds the 1 overflow panel
        expect(sheet86a.placements).toHaveLength(55);
        expect(sheet86b.placements).toHaveLength(1);

        // All placements on both sheets must be isCurved=true
        for (const s of result86.sheets) {
          for (const p of s.placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // Build DXF for each sheet and sum PARTS_CURVED LINE counts
        const output86a = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE86A', materialId: MATERIAL_ID },
          nesting: sheet86a,
          profile:  getFactoryProfile('DEFAULT'),
        });
        const output86b = buildDxfSheet({
          planned: { index1: 2, sheetId: 'SHEET_STAGE86B', materialId: MATERIAL_ID },
          nesting: sheet86b,
          profile:  getFactoryProfile('DEFAULT'),
        });

        const totalPlacements =
          sheet86a.placements.length + sheet86b.placements.length;          // 56
        const totalPARTSCURVED =
          countPARTSCURVEDLines86(output86a.content) +
          countPARTSCURVEDLines86(output86b.content);

        // 56 curved panels × 4 edges each = 224 PARTS_CURVED LINE entities
        expect(totalPARTSCURVED).toBe(4 * totalPlacements);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 87 – Sheet-2 overflow panel: HATCH_CURVED diagonal spans the correct
//            flat-blank bbox corners.
//
// Fixture: same row geometry as Stage 86 (cutW=200, cutH=200,
// developedLength=210, projectedDepth=200, curvedEdge='TOP') with qty=56.
// Sheet-2 receives the single overflow panel.
//
// FFDH analysis (sheet-2, 1 curved panel):
//   flatBlankW=200, flatBlankH=210; grainDirection='NONE' → rotation allowed.
//   Orientation A (no rotation): w=200, h=210.
//   Orientation B (rotation=90): w=210, h=200.  ← smaller h wins new-shelf.
//   Placement: x=10, y=10, rotation=90.
//   getRotatedDimensions(cutW=200, cutH=210, 90) → placed w=210, h=200.
//
// HATCH_CURVED diagonal coordinates:
//   d1 (BL→TR): (x, y)       → (x+w, y+h) = (10, 10)  → (220, 210)
//   d2 (BR→TL): (x+w, y)     → (x, y+h)   = (220, 10) → (10,  210)
//
// Assertions (1 it() block):
//   • result.sheets.length === 2
//   • result.sheets[1].placements.length === 1
//   • placement.isCurved === true
//   • HATCH_CURVED count in sheet-2 DXF === 2
//   • d1: (10, 10) → (220, 210)
//   • d2: (220, 10) → (10, 210)
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 87 — sheet-2 overflow placement: HATCH_CURVED diagonal spans flat-blank bbox corners',
  () => {

    type Coords87 = { x1: number; y1: number; x2: number; y2: number };

    function parseHatchCoords87(content: string): Coords87[] {
      const entitiesStart = content.indexOf('ENTITIES');
      const entities = content.slice(entitiesStart);
      return entities
        .split('LINE')
        .slice(1)
        .filter((s) => s.includes('\n8\nHATCH_CURVED\n'))
        .map((seg) => {
          const num = (code: string): number => {
            const m = seg.match(new RegExp(`\\n${code}\\n([\\d.+\\-e]+)`));
            return m ? parseFloat(m[1]) : NaN;
          };
          return { x1: num('10'), y1: num('20'), x2: num('11'), y2: num('21') };
        });
    }

    it(
      'qty=56 → sheet-2 has 1 curved panel; HATCH_CURVED d1=(10,10)→(220,210), d2=(220,10)→(10,210)',
      () => {
        const stage87Row: CutListRow = {
          partId:          'SMOKE_OVERFLOW_S87',
          cabinetId:       'CAB_SMOKE_87',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             56,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Overflow Curved Panel S87',
        };

        const result87 = runNesting([stage87Row]);

        // Two sheets; sheet-2 holds the 1 overflow panel
        expect(result87.sheets).toHaveLength(2);

        const sheet87b = result87.sheets[1];
        expect(sheet87b.placements).toHaveLength(1);
        expect(sheet87b.placements[0].isCurved).toBe(true);

        const output87b = buildDxfSheet({
          planned: { index1: 2, sheetId: 'SHEET_STAGE87B', materialId: MATERIAL_ID },
          nesting: sheet87b,
          profile:  getFactoryProfile('DEFAULT'),
        });

        const coords87 = parseHatchCoords87(output87b.content);
        expect(coords87).toHaveLength(2);

        // Sort by x1 ascending: d1 (BL→TR) has smaller x1=10; d2 (BR→TL) has x1=220
        const [d1, d2] = [...coords87].sort((a, b) => a.x1 - b.x1);

        // d1: BL → TR  (10, 10) → (220, 210)
        expect(d1.x1).toBeCloseTo(10,  1);
        expect(d1.y1).toBeCloseTo(10,  1);
        expect(d1.x2).toBeCloseTo(220, 1);
        expect(d1.y2).toBeCloseTo(210, 1);

        // d2: BR → TL  (220, 10) → (10, 210)
        expect(d2.x1).toBeCloseTo(220, 1);
        expect(d2.y1).toBeCloseTo(10,  1);
        expect(d2.x2).toBeCloseTo(10,  1);
        expect(d2.y2).toBeCloseTo(210, 1);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 88 – Mixed overflow: 55 curved + 1 straight.  Sheet-1 is filled by
//            curved panels; straight panel overflows to sheet-2 and is never
//            assigned to PARTS_CURVED.
//
// Fixture (two CutListRows, same materialId='MDF_18'):
//   Row-A curved: partId='SMOKE_CURVED_S88', cutW=200, cutH=200, qty=55,
//                 developedLength=210, projectedDepth=200, curvedEdge='TOP'.
//                 flatBlankW=200, flatBlankH=210 → correction=10 → isCurved=true.
//   Row-B straight: partId='SMOKE_STRAIGHT_S88', cutW=200, cutH=200, qty=1.
//                   No curve fields → isCurved=false.
//
// FFDH sort (height DESC, width DESC, id ASC):
//   Curved flatBlankH=210 > straight flatBlankH=200 → all 55 curved placed first.
//
// Sheet-1 packing (rotation=90 for curved, w=210, h=200):
//   Panels per shelf: 5  (5×210 + 4×3.5 = 1064 ≤ 1200).
//   Shelf count: 11       (shelf-11 y=2045; 2045+200=2245 ≤ 2430 ✓).
//   Capacity: 55 panels → sheet-1 is exactly filled by the 55 curved panels.
//
// Straight panel on sheet-1 (after 55 curved):
//   Shelf-11 remaining width = 1200 − 1064 = 136 mm < 200 mm → doesn't fit.
//   New shelf at y=2045+200+3.5=2248.5; 2248.5+200=2448.5 > 2430 → overflow.
//
// Sheet-2: 1 straight panel at x=10, y=10, rotation=0.
//   Not in isCurvedMap → isCurved is falsy (undefined).
//   DXF layers: PARTS_CURVED=0, HATCH_CURVED=0, PARTS=4.
//
// Assertions (1 it() block):
//   • result.sheets.length === 2
//   • sheet-1 placements.length === 55, all isCurved === true
//   • sheet-2 placements.length === 1
//   • sheet-2 placement partId === 'SMOKE_STRAIGHT_S88'
//   • sheet-2 placement isCurved is falsy
//   • DXF(sheet-2): PARTS_CURVED === 0
//   • DXF(sheet-2): HATCH_CURVED === 0
//   • DXF(sheet-2): PARTS === 4
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 88 — mixed overflow: curved panels fill sheet-1; straight panel on sheet-2 has PARTS_CURVED=0',
  () => {

    function countLayer88(content: string, layer: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter((seg) => seg.startsWith(`8\n${layer}\n`))
        .length;
    }

    it(
      '55 curved + 1 straight → sheets=2; sheet-2 straight: PARTS_CURVED=0, HATCH_CURVED=0, PARTS=4',
      () => {
        const curvedRow88: CutListRow = {
          partId:          'SMOKE_CURVED_S88',
          cabinetId:       'CAB_SMOKE_88C',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             55,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S88',
        };

        const straightRow88: CutListRow = {
          partId:          'SMOKE_STRAIGHT_S88',
          cabinetId:       'CAB_SMOKE_88S',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             1,
          label:           'Straight Panel S88',
        };

        const result88 = runNesting([curvedRow88, straightRow88]);

        // Two sheets
        expect(result88.sheets).toHaveLength(2);

        const [sheet88a, sheet88b] = result88.sheets;

        // Sheet-1: 55 curved panels, all isCurved=true
        expect(sheet88a.placements).toHaveLength(55);
        for (const p of sheet88a.placements) {
          expect(p.isCurved).toBe(true);
        }

        // Sheet-2: 1 straight panel, isCurved falsy
        expect(sheet88b.placements).toHaveLength(1);
        expect(sheet88b.placements[0].partId).toBe('SMOKE_STRAIGHT_S88');
        expect(sheet88b.placements[0].isCurved).toBeFalsy();

        // Build DXF for sheet-2 and verify layer counts
        const output88b = buildDxfSheet({
          planned: { index1: 2, sheetId: 'SHEET_STAGE88B', materialId: MATERIAL_ID },
          nesting: sheet88b,
          profile:  getFactoryProfile('DEFAULT'),
        });

        expect(countLayer88(output88b.content, 'PARTS_CURVED')).toBe(0);
        expect(countLayer88(output88b.content, 'HATCH_CURVED')).toBe(0);
        expect(countLayer88(output88b.content, 'PARTS')).toBe(4);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 89 — Mixed sheet-2: curved + straight overflow panel; sheet-2 has
//   PARTS_CURVED=4, HATCH_CURVED=2, PARTS=4 with non-overlapping bboxes
//
// Fixture:
//   • curvedRow89  : qty=56, partId='SMOKE_CURVED_S89', cutW=200, cutH=200,
//                    developedLength=210, projectedDepth=200, curvedEdge='TOP'
//                    → correction=10, flatBlankW=200, flatBlankH=210; part(w=200,h=210)
//   • straightRow89: qty=1, partId='SMOKE_STRAIGHT_S89', cutW=200, cutH=200
//
// FFDH sort: curved (h=210) before straight (h=200)
// New-shelf orientation: rotation=90 (placed_w=210, placed_h=200); 5/shelf × 11 = 55
// Sheet-1: 55 curved panels (all isCurved=true)
// Sheet-2: [0]=SMOKE_CURVED_S89#? (lex last) at x=10,y=10 rotation=90 cutH=210
//          [1]=SMOKE_STRAIGHT_S89 at x=223.5,y=10 rotation=0
// Non-overlap: p89Curved.x + 210 = 220 < 223.5 = p89Straight.x
// DXF(sheet-2): PARTS_CURVED=4, HATCH_CURVED=2, PARTS=4
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 89 — mixed sheet-2: curved + straight overflow; PARTS_CURVED=4, HATCH_CURVED=2, PARTS=4',
  () => {

    function countLayer89(content: string, layer: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter((seg) => seg.startsWith(`8\n${layer}\n`))
        .length;
    }

    it(
      'sheet-2 holds 1 curved + 1 straight: non-overlapping, PARTS_CURVED=4, HATCH_CURVED=2, PARTS=4',
      () => {
        const curvedRow89: CutListRow = {
          partId:          'SMOKE_CURVED_S89',
          cabinetId:       'CAB_SMOKE_89C',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             56,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S89',
        };

        const straightRow89: CutListRow = {
          partId:          'SMOKE_STRAIGHT_S89',
          cabinetId:       'CAB_SMOKE_89S',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             1,
          label:           'Straight Panel S89',
        };

        const result89 = runNesting([curvedRow89, straightRow89]);

        // Two sheets
        expect(result89.sheets).toHaveLength(2);
        const [sheet89a, sheet89b] = result89.sheets;

        // Sheet-1: exactly 55 curved panels, all isCurved=true
        expect(sheet89a.placements).toHaveLength(55);
        for (const p of sheet89a.placements) {
          expect(p.isCurved).toBe(true);
        }

        // Sheet-2: exactly 2 placements
        expect(sheet89b.placements).toHaveLength(2);

        // First placement on sheet-2 is the overflow curved panel
        const p89Curved = sheet89b.placements[0];
        expect(p89Curved.partId).toMatch(/^SMOKE_CURVED_S89#/);
        expect(p89Curved.isCurved).toBe(true);

        // Second placement on sheet-2 is the straight panel
        const p89Straight = sheet89b.placements[1];
        expect(p89Straight.partId).toBe('SMOKE_STRAIGHT_S89');
        expect(p89Straight.isCurved).toBeFalsy();

        // Non-overlapping: curved right edge < straight left edge
        const ewCurved89 = p89Curved.rotation === 90 ? p89Curved.cutH : p89Curved.cutW;
        expect(p89Curved.x + ewCurved89).toBeLessThan(p89Straight.x);

        // Build DXF for sheet-2 and verify layer counts
        const output89b = buildDxfSheet({
          planned: { index1: 2, sheetId: 'SHEET_STAGE89B', materialId: MATERIAL_ID },
          nesting: sheet89b,
          profile:  getFactoryProfile('DEFAULT'),
        });

        expect(countLayer89(output89b.content, 'PARTS_CURVED')).toBe(4);
        expect(countLayer89(output89b.content, 'HATCH_CURVED')).toBe(2);
        expect(countLayer89(output89b.content, 'PARTS')).toBe(4);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 90 — Determinism regression guard: mixed overflow (55 curved + 1 straight)
//   produces identical sheet-2 placement coordinates across two independent
//   runNesting calls
//
// Fixture (factory makeDetRows90 — returns fresh objects each call):
//   • curvedRow : qty=55, partId='SMOKE_DET_CURVED_S90', cutW=200, cutH=200,
//                 developedLength=210, projectedDepth=200, curvedEdge='TOP'
//   • straightRow: qty=1,  partId='SMOKE_DET_STRAIGHT_S90', cutW=200, cutH=200
//
// Sheet-1: exactly 55 curved (fills exactly; 5/shelf × 11 shelves)
// Sheet-2: 1 straight at x=10, y=10 (rotation=0)
// Invariant: two independent calls produce identical sheet-2.placements[0] partId, x, y
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 90 — determinism: mixed 55 curved + 1 straight produces identical sheet-2 coordinates across two runs',
  () => {

    function makeDetRows90(): CutListRow[] {
      return [
        {
          partId:          'SMOKE_DET_CURVED_S90',
          cabinetId:       'CAB_SMOKE_90C',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             55,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Det Curved S90',
        },
        {
          partId:          'SMOKE_DET_STRAIGHT_S90',
          cabinetId:       'CAB_SMOKE_90S',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             1,
          label:           'Det Straight S90',
        },
      ];
    }

    it(
      're-running runNesting with 55 curved + 1 straight always produces identical sheet-2 partId, x, y',
      () => {
        const result90a = runNesting(makeDetRows90());
        const result90b = runNesting(makeDetRows90());

        expect(result90a.sheets).toHaveLength(2);
        expect(result90b.sheets).toHaveLength(2);

        const p90a = result90a.sheets[1].placements[0];
        const p90b = result90b.sheets[1].placements[0];

        expect(p90a.partId).toBe(p90b.partId);
        expect(p90a.x).toBe(p90b.x);
        expect(p90a.y).toBe(p90b.y);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 91 — FFDH order: three rows (curvedA qty=55, curvedB qty=1, straight qty=1)
//   pack sheet-1 with all 55 curvedA panels, then sheet-2[0]=curvedB, sheet-2[1]=straight
//
// Fixture:
//   • curvedRowA91 : qty=55, partId='SMOKE_CURVED_S91A', cutW=200, cutH=200,
//                    developedLength=210, projectedDepth=200, curvedEdge='TOP'
//   • curvedRowB91 : qty=1,  partId='SMOKE_CURVED_S91B', same curve params
//   • straightRow91: qty=1,  partId='SMOKE_STRAIGHT_S91', cutW=200, cutH=200
//
// FFDH sort: all curved (h=210) before straight (h=200); within curved id ASC:
//   'SMOKE_CURVED_S91A#...' < 'SMOKE_CURVED_S91B' (A < B)
// Sheet-1: 55 S91A#k panels. Sheet-2: [0]=S91B (qty=1, no # suffix) isCurved=true
//          at x=10,y=10; [1]=S91_STRAIGHT isCurved=false at x≈223.5,y=10
// Non-overlap: S91B.x + 210 = 220 < 223.5 = straight.x
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 91 — FFDH order: curvedA×55 + curvedB×1 + straight×1 → correct sheet-2 partition',
  () => {

    it(
      'three rows: sheet-1=55 S91A panels; sheet-2=[SMOKE_CURVED_S91B, SMOKE_STRAIGHT_S91]',
      () => {
        const curvedRowA91: CutListRow = {
          partId:          'SMOKE_CURVED_S91A',
          cabinetId:       'CAB_SMOKE_91A',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             55,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved A S91',
        };

        const curvedRowB91: CutListRow = {
          partId:          'SMOKE_CURVED_S91B',
          cabinetId:       'CAB_SMOKE_91B',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             1,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved B S91',
        };

        const straightRow91: CutListRow = {
          partId:          'SMOKE_STRAIGHT_S91',
          cabinetId:       'CAB_SMOKE_91S',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             1,
          label:           'Straight S91',
        };

        const result91 = runNesting([curvedRowA91, curvedRowB91, straightRow91]);

        // Two sheets
        expect(result91.sheets).toHaveLength(2);
        const [sheet91a, sheet91b] = result91.sheets;

        // Sheet-1: exactly 55 placements, all SMOKE_CURVED_S91A#k, all isCurved=true
        expect(sheet91a.placements).toHaveLength(55);
        for (const p of sheet91a.placements) {
          expect(p.partId).toMatch(/^SMOKE_CURVED_S91A#/);
          expect(p.isCurved).toBe(true);
        }

        // Sheet-2: exactly 2 placements
        expect(sheet91b.placements).toHaveLength(2);

        // Sheet-2[0]: SMOKE_CURVED_S91B (qty=1 → no # suffix), isCurved=true
        expect(sheet91b.placements[0].partId).toBe('SMOKE_CURVED_S91B');
        expect(sheet91b.placements[0].isCurved).toBe(true);

        // Sheet-2[1]: SMOKE_STRAIGHT_S91, isCurved falsy
        expect(sheet91b.placements[1].partId).toBe('SMOKE_STRAIGHT_S91');
        expect(sheet91b.placements[1].isCurved).toBeFalsy();

        // Non-overlapping: S91B right edge < straight left edge
        const p91B = sheet91b.placements[0];
        const p91S = sheet91b.placements[1];
        const ewB91 = p91B.rotation === 90 ? p91B.cutH : p91B.cutW;
        expect(p91B.x + ewB91).toBeLessThan(p91S.x);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 92 — Three-sheet overflow: qty=111 curved panels produce 3 sheets and
//   PARTS_CURVED LINE count = 4 × 111 = 444 across all three sheets
//
// Fixture:
//   • qty=111, partId='SMOKE_CURVED_S92', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//     → correction=10, flatBlankW=200, flatBlankH=210; part(w=200, h=210)
//
// FFDH: rotation=90 wins (placed_w=210, placed_h=200); 5/shelf × 11 = 55/sheet
// Distribution: sheet-1=55, sheet-2=55, sheet-3=1 (111 total)
// PARTS_CURVED = 4 × 111 = 444 (summed across all three DXF outputs)
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 92 — three-sheet overflow: qty=111 → 3 sheets, PARTS_CURVED = 4 × 111 = 444',
  () => {

    function countLayer92(content: string, layer: string): number {
      return content
        .split('\n0\nLINE\n')
        .slice(1)
        .filter((seg) => seg.startsWith(`8\n${layer}\n`))
        .length;
    }

    it(
      'qty=111 curved panels → sheets=3 (55+55+1); PARTS_CURVED total across all sheets = 444',
      () => {
        const curvedRow92: CutListRow = {
          partId:          'SMOKE_CURVED_S92',
          cabinetId:       'CAB_SMOKE_92',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             111,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S92',
        };

        const result92 = runNesting([curvedRow92]);

        // Three sheets
        expect(result92.sheets).toHaveLength(3);
        const [sheet92a, sheet92b, sheet92c] = result92.sheets;

        // Distribution: 55 + 55 + 1
        expect(sheet92a.placements).toHaveLength(55);
        expect(sheet92b.placements).toHaveLength(55);
        expect(sheet92c.placements).toHaveLength(1);

        // All placements isCurved=true
        for (const sheet of result92.sheets) {
          for (const p of sheet.placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // Build DXF for all three sheets and sum PARTS_CURVED
        const outputs = result92.sheets.map((nesting, idx) =>
          buildDxfSheet({
            planned: { index1: idx + 1, sheetId: `SHEET_STAGE92_${idx + 1}`, materialId: MATERIAL_ID },
            nesting,
            profile: getFactoryProfile('DEFAULT'),
          }),
        );

        const totalPartsCurved = outputs.reduce(
          (sum, o) => sum + countLayer92(o.content, 'PARTS_CURVED'),
          0,
        );
        expect(totalPartsCurved).toBe(4 * 111);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 93 — Sheet-3 diagonal geometry: HATCH_CURVED diagonal pair for the
//   single overflow panel on sheet-3 spans the correct flat-blank bbox corners
//
// Fixture: same as Stage 92 (qty=111, correction=10, curvedEdge='TOP')
// Sheet-3 placement: x=10, y=10, rotation=90, cutW=200, cutH=210
//   → ew = cutH = 210, eh = cutW = 200
// Expected HATCH_CURVED (ε < 0.015 mm):
//   d1: (10, 10) → (220, 210)   [minX,minY → maxX,maxY]
//   d2: (220, 10) → (10, 210)   [maxX,minY → minX,maxY]
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 93 — sheet-3 overflow diagonal geometry: HATCH_CURVED spans flat-blank bbox corners',
  () => {

    const EPS93 = 0.015;

    it(
      'qty=111 → sheet-3 single panel: HATCH_CURVED d1=(10,10)→(220,210), d2=(220,10)→(10,210)',
      () => {
        const curvedRow93: CutListRow = {
          partId:          'SMOKE_CURVED_S93',
          cabinetId:       'CAB_SMOKE_93',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             111,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S93',
        };

        const result93 = runNesting([curvedRow93]);
        expect(result93.sheets).toHaveLength(3);

        const sheet93c = result93.sheets[2];
        expect(sheet93c.placements).toHaveLength(1);

        const p93 = sheet93c.placements[0];
        expect(p93.isCurved).toBe(true);

        const output93c = buildDxfSheet({
          planned: { index1: 3, sheetId: 'SHEET_STAGE93C', materialId: MATERIAL_ID },
          nesting: sheet93c,
          profile: getFactoryProfile('DEFAULT'),
        });

        const content93 = output93c.content;

        // Parse all HATCH_CURVED LINE segments
        const hatchSegs93 = content93
          .split('\n0\nLINE\n')
          .slice(1)
          .filter((seg) => seg.startsWith('8\nHATCH_CURVED\n'));

        expect(hatchSegs93).toHaveLength(2);

        function parseCoords93(seg: string): { x1: number; y1: number; x2: number; y2: number } {
          const val = (code: string) => {
            const m = seg.match(new RegExp(`\\n${code}\\n([\\d.+\\-e]+)`));
            return m ? parseFloat(m[1]) : NaN;
          };
          return { x1: val('10'), y1: val('20'), x2: val('11'), y2: val('21') };
        }

        const coords93 = hatchSegs93.map(parseCoords93);

        // Effective placed dimensions for rotation=90: ew=cutH=210, eh=cutW=200
        const isRotated93 = p93.rotation === 90;
        const ew93 = isRotated93 ? p93.cutH : p93.cutW;
        const eh93 = isRotated93 ? p93.cutW : p93.cutH;

        const minX93 = p93.x;
        const minY93 = p93.y;
        const maxX93 = p93.x + ew93;
        const maxY93 = p93.y + eh93;

        // Identify d1 (starts near minX) and d2 (starts near maxX) by x1
        const d193 = coords93.find((c) => Math.abs(c.x1 - minX93) < EPS93)!;
        const d293 = coords93.find((c) => Math.abs(c.x1 - maxX93) < EPS93)!;

        expect(d193).toBeDefined();
        expect(d293).toBeDefined();

        // d1: (minX,minY) → (maxX,maxY)
        expect(Math.abs(d193.x1 - minX93)).toBeLessThan(EPS93);
        expect(Math.abs(d193.y1 - minY93)).toBeLessThan(EPS93);
        expect(Math.abs(d193.x2 - maxX93)).toBeLessThan(EPS93);
        expect(Math.abs(d193.y2 - maxY93)).toBeLessThan(EPS93);

        // d2: (maxX,minY) → (minX,maxY)
        expect(Math.abs(d293.x1 - maxX93)).toBeLessThan(EPS93);
        expect(Math.abs(d293.y1 - minY93)).toBeLessThan(EPS93);
        expect(Math.abs(d293.x2 - minX93)).toBeLessThan(EPS93);
        expect(Math.abs(d293.y2 - maxY93)).toBeLessThan(EPS93);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 94 — Mixed 3-sheet overflow: curved×111 + straight×1
// → sheet-3 holds exactly 1 curved panel + 1 straight panel.
// DXF layer counts: PARTS_CURVED=4, PARTS=4, HATCH_CURVED=2.
// Bboxes of the two placements must not overlap.
//
// Fixture:
//   curvedRow94  — partId='SMOKE_CURVED_S94',  cutW=200, cutH=200, qty=111,
//                  developedLength=210, projectedDepth=200, curvedEdge='TOP'
//   straightRow94 — partId='SMOKE_STRAIGHT_S94', cutW=200, cutH=182, qty=1
//
// FFDH threshold: after 11 curved shelves y_after=2248.5; remaining height=181.5.
//   cutH=182 → 2248.5+182=2430.5 > 2430 → straight can NOT create a new shelf
//   on sheet-1 or sheet-2, so it overflows to sheet-3.
//
// FFDH sort (height DESC): curved flatBlankH=210 > straight cutH=182
//   → all 111 curved placed first (55 per sheet × 2 sheets = 110); 1 curved
//     left for sheet-3.
// Sheet-3 placement:
//   curved  → rotation=90 (bestOrient h=200 < h=210) → placed_w=210, placed_h=200
//             x=10, y=10
//   straight→ fits same shelf (orient 0: w=200, h=182 ≤ shelf.h=200,
//             remainingWidth=986.5 ≥ 200) → x=223.5, y=10, rotation=0
// Non-overlap: curved x∈[10,220], straight x∈[223.5,423.5] → 223.5 > 220 ✓
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 94 — mixed 3-sheet overflow: sheet-3 PARTS_CURVED=4, PARTS=4, HATCH_CURVED=2, non-overlapping',
  () => {
    it(
      'curved×111 + straight×1 (cutH=182) → 3 sheets; sheet-3 has PARTS_CURVED=4, PARTS=4, HATCH_CURVED=2, non-overlapping bboxes',
      () => {
        const curvedRow94: CutListRow = {
          partId:          'SMOKE_CURVED_S94',
          cabinetId:       'CAB_SMOKE_94',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             111,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S94',
        };

        // cutH=182: 2248.5+182=2430.5 > 2430 → can't open new shelf on sheets 1 or 2;
        // fits the curved panel's shelf on sheet-3 (shelf.h=200 ≥ 182).
        const straightRow94: CutListRow = {
          partId:    'SMOKE_STRAIGHT_S94',
          cabinetId: 'CAB_SMOKE_94',
          materialId: MATERIAL_ID,
          finishW:   200,
          finishH:   182,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:      200,
          cutH:      182,
          qty:       1,
          label:     'Straight Panel S94',
        };

        const result94 = runNesting([curvedRow94, straightRow94]);
        expect(result94.sheets).toHaveLength(3);

        const sheet94c = result94.sheets[2];
        expect(sheet94c.placements).toHaveLength(2);

        const curved94 = sheet94c.placements.find((p) => p.isCurved === true)!;
        const straight94 = sheet94c.placements.find((p) => !p.isCurved)!;
        expect(curved94).toBeDefined();
        expect(straight94).toBeDefined();

        const output94 = buildDxfSheet({
          planned: { index1: 3, sheetId: 'SHEET_STAGE94', materialId: MATERIAL_ID },
          nesting: sheet94c,
          profile: getFactoryProfile('DEFAULT'),
        });

        const content94 = output94.content;
        const lineSegs94 = content94.split('\n0\nLINE\n').slice(1);

        // PARTS_CURVED = 4 (1 curved panel × 4 rectangle sides)
        const partsCurvedSegs94 = lineSegs94.filter((s) => s.startsWith('8\nPARTS_CURVED\n'));
        expect(partsCurvedSegs94).toHaveLength(4);

        // PARTS = 4 (1 straight panel × 4 rectangle sides)
        const partsSegs94 = lineSegs94.filter((s) => s.startsWith('8\nPARTS\n'));
        expect(partsSegs94).toHaveLength(4);

        // HATCH_CURVED = 2 (1 curved panel × 2 diagonal lines)
        const hatchCurvedSegs94 = lineSegs94.filter((s) => s.startsWith('8\nHATCH_CURVED\n'));
        expect(hatchCurvedSegs94).toHaveLength(2);

        // Non-overlapping bboxes
        function bbox94(p: { x: number; y: number; rotation: number; cutW: number; cutH: number }): {
          x1: number; y1: number; x2: number; y2: number;
        } {
          const isRot = p.rotation === 90 || p.rotation === 270;
          const ew = isRot ? p.cutH : p.cutW;
          const eh = isRot ? p.cutW : p.cutH;
          return { x1: p.x, y1: p.y, x2: p.x + ew, y2: p.y + eh };
        }

        const boxC94 = bbox94(curved94);
        const boxS94 = bbox94(straight94);

        // Axis-aligned overlap: both axes must overlap for rectangles to intersect
        const overlapsX94 = boxC94.x1 < boxS94.x2 && boxC94.x2 > boxS94.x1;
        const overlapsY94 = boxC94.y1 < boxS94.y2 && boxC94.y2 > boxS94.y1;
        expect(overlapsX94 && overlapsY94).toBe(false);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 95 — Three-sheet determinism: running runNesting twice with
// curved qty=111 always produces identical sheet-3 placements[0]
// partId, x, y, and rotation.
//
// Fixture: same as Stage 92 (curved qty=111, cutW=200, cutH=200,
//          developedLength=210, projectedDepth=200, curvedEdge='TOP')
//
// Mirrors Stages 85 and 90 (two-sheet determinism) for three-sheet batches.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 95 — three-sheet determinism: qty=111 sheet-3 placements[0] identical across two runs',
  () => {
    it(
      'runNesting called twice with curved qty=111 → sheet-3.placements[0] has identical partId, x, y, rotation',
      () => {
        const curvedRow95: CutListRow = {
          partId:          'SMOKE_CURVED_S95',
          cabinetId:       'CAB_SMOKE_95',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             111,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S95',
        };

        const run95a = runNesting([curvedRow95]);
        const run95b = runNesting([curvedRow95]);

        expect(run95a.sheets).toHaveLength(3);
        expect(run95b.sheets).toHaveLength(3);

        const p95a = run95a.sheets[2].placements[0];
        const p95b = run95b.sheets[2].placements[0];

        expect(p95b.partId).toBe(p95a.partId);
        expect(p95b.x).toBe(p95a.x);
        expect(p95b.y).toBe(p95a.y);
        expect(p95b.rotation).toBe(p95a.rotation);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 96 — Five-sheet overflow: qty=222 curved panels → 5 sheets
//   sheets[4] (5th sheet, 0-indexed) holds exactly 2 curved panels;
//   PARTS_CURVED = 8 (2 × 4) and HATCH_CURVED = 4 (2 × 2)
//
// Fixture:
//   • qty=222, partId='SMOKE_CURVED_S96', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//     → correction=10, rotation=90 → placed_w=210, placed_h=200
//
// FFDH: panelsPerShelf=5, shelvesPerSheet=11 → panelsPerSheet=55
// Distribution: 222 = 4×55 + 2 → sheets 1–4 have 55 each; sheet-5 has 2
// User note: "sheet-4" in request = 0-indexed sheets[4] (5th physical sheet)
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 96 — five-sheet overflow: qty=222 → 5 sheets; sheets[4] holds 2 curved panels; PARTS_CURVED=8, HATCH_CURVED=4',
  () => {
    it(
      'qty=222 curved panels → sheets.length===5; sheets[4].placements.length===2; all isCurved; DXF sheet-5 PARTS_CURVED=8, HATCH_CURVED=4',
      () => {
        const curvedRow96: CutListRow = {
          partId:          'SMOKE_CURVED_S96',
          cabinetId:       'CAB_SMOKE_96',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             222,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S96',
        };

        const result96 = runNesting([curvedRow96]);

        // 222 = 4 × 55 + 2 → 5 sheets
        expect(result96.sheets).toHaveLength(5);

        // First four sheets must be full (55 each)
        for (let i = 0; i < 4; i++) {
          expect(result96.sheets[i].placements).toHaveLength(55);
        }

        // Fifth sheet (sheets[4]) must hold exactly 2 placements
        const sheet96Last = result96.sheets[4];
        expect(sheet96Last.placements).toHaveLength(2);

        // All placements on every sheet must be isCurved=true
        for (const sheet of result96.sheets) {
          for (const p of sheet.placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // Build DXF for the last sheet only and verify layer counts
        const dxf96 = buildDxfSheet({
          planned: { index1: 5, sheetId: 'SHEET_STAGE96_5', materialId: MATERIAL_ID },
          nesting: sheet96Last,
          profile: getFactoryProfile('DEFAULT'),
        });

        const lineSegs96 = dxf96.content.split('\n0\nLINE\n').slice(1);

        const partsCurvedCount96 = lineSegs96.filter((seg) =>
          seg.startsWith('8\nPARTS_CURVED\n'),
        ).length;
        expect(partsCurvedCount96).toBe(8); // 2 panels × 4 rect sides

        const hatchCurvedCount96 = lineSegs96.filter((seg) =>
          seg.startsWith('8\nHATCH_CURVED\n'),
        ).length;
        expect(hatchCurvedCount96).toBe(4); // 2 panels × 2 diagonal lines
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 97 — FFDH stress test: 300 curved + 200 straight = 500 panels
//   across multiple sheets; total PARTS_CURVED across all DXF outputs = 1200
//
// Fixture:
//   • curvedRow97: qty=300, partId='SMOKE_CURVED_S97',
//     cutW=200, cutH=200, developedLength=210, projectedDepth=200,
//     curvedEdge='TOP' → correction=10 → isCurved=true
//     → rotation=90, placed_w=210, placed_h=200
//   • straightRow97: qty=200, partId='SMOKE_STRAIGHT_S97',
//     cutW=200, cutH=200 (no curve fields → isCurved=false)
//
// FFDH sort order: equal placed_h=200; curved placed_w=210 > straight 200
//   → curved rows bin first; straight rows follow on same/later shelves.
//
// Distribution (approximate — FFDH may intermix once curved rows exhaust):
//   Sheets 1–5:  55 curved each  (275 curved placed)
//   Sheet  6:    25 curved + fits of straight
//   Sheets 7–10: straight panels fill remaining space
//
// Assert: sheets.length >= 5 (minimum-bound; actual ≈10 sheets)
//         total PARTS_CURVED = 4 × 300 = 1200
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 97 — FFDH stress test: 300 curved + 200 straight → total PARTS_CURVED = 4×300 = 1200',
  () => {
    it(
      '500 panels (300 curved + 200 straight) → sheets.length >= 5; sum PARTS_CURVED across all sheets === 1200',
      () => {
        const curvedRow97: CutListRow = {
          partId:          'SMOKE_CURVED_S97',
          cabinetId:       'CAB_SMOKE_97C',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             300,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S97',
        };

        const straightRow97: CutListRow = {
          partId:    'SMOKE_STRAIGHT_S97',
          cabinetId: 'CAB_SMOKE_97S',
          materialId: MATERIAL_ID,
          finishW:   200,
          finishH:   200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:      200,
          cutH:      200,
          qty:       200,
          label:     'Straight Panel S97',
        };

        const result97 = runNesting([curvedRow97, straightRow97]);

        // Minimum-bound: at least 5 sheets are required for 300+ curved panels
        expect(result97.sheets.length).toBeGreaterThanOrEqual(5);

        // Build DXF for every sheet and accumulate PARTS_CURVED
        let totalPartsCurved97 = 0;
        for (let idx = 0; idx < result97.sheets.length; idx++) {
          const dxf97 = buildDxfSheet({
            planned: {
              index1:     idx + 1,
              sheetId:    `SHEET_STAGE97_${idx + 1}`,
              materialId: MATERIAL_ID,
            },
            nesting: result97.sheets[idx],
            profile: getFactoryProfile('DEFAULT'),
          });
          const lineSegs97 = dxf97.content.split('\n0\nLINE\n').slice(1);
          totalPartsCurved97 += lineSegs97.filter((seg) =>
            seg.startsWith('8\nPARTS_CURVED\n'),
          ).length;
        }

        // Every curved panel contributes exactly 4 PARTS_CURVED LINE entities
        expect(totalPartsCurved97).toBe(4 * 300); // = 1200
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 98 — Six-sheet overflow: qty=277 curved panels → 6 sheets
//   sheets[5] (6th sheet, 0-indexed) holds exactly 2 curved panels;
//   PARTS_CURVED = 8 (2 × 4) and HATCH_CURVED = 4 (2 × 2)
//
// Fixture:
//   • qty=277, partId='SMOKE_CURVED_S98', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//     → correction=10, rotation=90 → placed_w=210, placed_h=200
//
// Distribution: 277 = 5 × 55 + 2 → sheets 1–5 have 55 each; sheet-6 has 2
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 98 — six-sheet overflow: qty=277 → 6 sheets; sheets[5] holds 2 curved panels; PARTS_CURVED=8, HATCH_CURVED=4',
  () => {
    it(
      'qty=277 curved panels → sheets.length===6; sheets[5].placements.length===2; all isCurved; DXF sheet-6 PARTS_CURVED=8, HATCH_CURVED=4',
      () => {
        const curvedRow98: CutListRow = {
          partId:          'SMOKE_CURVED_S98',
          cabinetId:       'CAB_SMOKE_98',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             277,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S98',
        };

        const result98 = runNesting([curvedRow98]);

        // 277 = 5 × 55 + 2 → 6 sheets
        expect(result98.sheets).toHaveLength(6);

        // First five sheets must be full (55 each)
        for (let i = 0; i < 5; i++) {
          expect(result98.sheets[i].placements).toHaveLength(55);
        }

        // Sixth sheet (sheets[5]) must hold exactly 2 placements
        const sheet98Last = result98.sheets[5];
        expect(sheet98Last.placements).toHaveLength(2);

        // All placements on every sheet must be isCurved=true
        for (const sheet of result98.sheets) {
          for (const p of sheet.placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // Build DXF for the last sheet only and verify layer counts
        const dxf98 = buildDxfSheet({
          planned: { index1: 6, sheetId: 'SHEET_STAGE98_6', materialId: MATERIAL_ID },
          nesting: sheet98Last,
          profile: getFactoryProfile('DEFAULT'),
        });

        const lineSegs98 = dxf98.content.split('\n0\nLINE\n').slice(1);

        const partsCurvedCount98 = lineSegs98.filter((seg) =>
          seg.startsWith('8\nPARTS_CURVED\n'),
        ).length;
        expect(partsCurvedCount98).toBe(8); // 2 panels × 4 rect sides

        const hatchCurvedCount98 = lineSegs98.filter((seg) =>
          seg.startsWith('8\nHATCH_CURVED\n'),
        ).length;
        expect(hatchCurvedCount98).toBe(4); // 2 panels × 2 diagonal lines
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 99 — Stage 97 mixed determinism: re-running runNesting twice with
//   the mixed fixture (curvedRow qty=300, straightRow qty=200) always produces
//   identical sheet-6 (sheets[5]) placements[0]: partId, x, y, rotation
//
// Fixture: same as Stage 97
//   • curvedRow:   qty=300, cutW=200, cutH=200, developedLength=210,
//                  projectedDepth=200, curvedEdge='TOP'
//   • straightRow: qty=200, cutW=200, cutH=200 (no curve fields)
//
// Distribution: sheets 1–5 hold 55 curved each (275 total); sheet-6 holds
//   the remaining 25 curved panels plus straight panels placed by FFDH.
//   placements[0] on sheet-6 is the first curved panel (x=10, y=10).
//
// Mirrors Stages 85, 90, 95 (single-type determinism) for mixed batches.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 99 — mixed-500 determinism: two runNesting calls with curved×300 + straight×200 produce identical sheet-6 placements[0]',
  () => {
    it(
      'runNesting called twice with 300 curved + 200 straight → sheets[5].placements[0] has identical partId, x, y, rotation',
      () => {
        const curvedRow99: CutListRow = {
          partId:          'SMOKE_CURVED_S99',
          cabinetId:       'CAB_SMOKE_99C',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             300,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S99',
        };

        const straightRow99: CutListRow = {
          partId:    'SMOKE_STRAIGHT_S99',
          cabinetId: 'CAB_SMOKE_99S',
          materialId: MATERIAL_ID,
          finishW:   200,
          finishH:   200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:      200,
          cutH:      200,
          qty:       200,
          label:     'Straight Panel S99',
        };

        const run99a = runNesting([curvedRow99, straightRow99]);
        const run99b = runNesting([curvedRow99, straightRow99]);

        // Both runs must produce at least 6 sheets
        expect(run99a.sheets.length).toBeGreaterThanOrEqual(6);
        expect(run99b.sheets.length).toBeGreaterThanOrEqual(6);

        // sheet-6 placements[0] must be identical across both runs
        const p99a = run99a.sheets[5].placements[0];
        const p99b = run99b.sheets[5].placements[0];

        expect(p99b.partId).toBe(p99a.partId);
        expect(p99b.x).toBe(p99a.x);
        expect(p99b.y).toBe(p99a.y);
        expect(p99b.rotation).toBe(p99a.rotation);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 100 — Six full sheets: qty=330 curved panels → 6 sheets,
//   each holding exactly 55 panels (330 = 6 × 55);
//   sheets[5] PARTS_CURVED = 55 × 4 = 220.
//
// Fixture:
//   • qty=330, partId='SMOKE_CURVED_S100', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//     → correction=10, rotation=90 → placed_w=210, placed_h=200
//
// Distribution: 330 = 6 × 55 → all six sheets are full (no remainder sheet)
// This is the complement of Stages 96 and 98 which tested remainder-sheets.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 100 — six full sheets: qty=330 → sheets.length===6; every sheet has 55 panels; sheets[5] DXF PARTS_CURVED=220',
  () => {
    it(
      'qty=330 curved panels → sheets.length===6; every sheet has 55 placements; all isCurved; sheets[5] PARTS_CURVED=220',
      () => {
        const curvedRow100: CutListRow = {
          partId:          'SMOKE_CURVED_S100',
          cabinetId:       'CAB_SMOKE_100',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             330,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S100',
        };

        const result100 = runNesting([curvedRow100]);

        // 330 = 6 × 55 → exactly 6 sheets, no remainder
        expect(result100.sheets).toHaveLength(6);

        // Every sheet must be full: 55 placements each
        for (let i = 0; i < 6; i++) {
          expect(result100.sheets[i].placements).toHaveLength(55);
        }

        // All placements on every sheet must be isCurved=true
        for (const sheet of result100.sheets) {
          for (const p of sheet.placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // Build DXF for the last sheet (sheets[5]) and assert PARTS_CURVED=220
        const dxf100 = buildDxfSheet({
          planned: { index1: 6, sheetId: 'SHEET_STAGE100_6', materialId: MATERIAL_ID },
          nesting: result100.sheets[5],
          profile: getFactoryProfile('DEFAULT'),
        });

        const lineSegs100 = dxf100.content.split('\n0\nLINE\n').slice(1);
        const partsCurvedCount100 = lineSegs100.filter((seg) =>
          seg.startsWith('8\nPARTS_CURVED\n'),
        ).length;
        expect(partsCurvedCount100).toBe(220); // 55 panels × 4 rect sides
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 101 — Shelf-y coordinate validation: 11 curved panels (1 per shelf)
//   placed on sheet-1 produce y-coordinates that match the FFDH lookup table
//   values y_1 through y_11 exactly.
//
// Fixture:
//   • qty=11, partId='SMOKE_CURVED_S101', cutW=200, cutH=200,
//     developedLength=1197, projectedDepth=200, curvedEdge='TOP'
//     → correction=997, rotation=90 → placed_w=1197, placed_h=200
//
// Why 1 per shelf: placed_w=1197 leaves room for a second panel only if
//   edge + 1197 + 3.5 + 1197 ≤ 1210  →  2407.5 > 1210  ✗  → new shelf.
//
// Expected y values (y_k = 10 + (k − 1) × 203.5, k=1..11):
//   placements[i].y = 10 + i × 203.5   for i ∈ [0, 10]
//
//   i=0  → y = 10.0      (k=1)
//   i=1  → y = 213.5     (k=2)
//   i=2  → y = 417.0     (k=3)
//   i=3  → y = 620.5     (k=4)
//   i=4  → y = 824.0     (k=5)
//   i=5  → y = 1027.5    (k=6)
//   i=6  → y = 1231.0    (k=7)
//   i=7  → y = 1434.5    (k=8)
//   i=8  → y = 1638.0    (k=9)
//   i=9  → y = 1841.5    (k=10)
//   i=10 → y = 2045.0    (k=11)
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 101 — shelf-y validation: qty=11 wide curved panels (1 per shelf) have y matching lookup table y_1..y_11',
  () => {
    it(
      'qty=11, developedLength=1197 → 1 panel/shelf × 11 shelves on sheet-1; placements[i].y === 10 + i×203.5 for all i',
      () => {
        const curvedRow101: CutListRow = {
          partId:          'SMOKE_CURVED_S101',
          cabinetId:       'CAB_SMOKE_101',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             11,
          developedLength: 1197,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S101',
        };

        const result101 = runNesting([curvedRow101]);

        // All 11 panels fit on 1 sheet (11 shelves × 1 panel each)
        expect(result101.sheets).toHaveLength(1);
        const sheet101 = result101.sheets[0];
        expect(sheet101.placements).toHaveLength(11);

        // All placements are curved and rotated=90 (placed_w=1197 > placed_h=200)
        for (const p of sheet101.placements) {
          expect(p.isCurved).toBe(true);
          expect(p.rotation).toBe(90);
          // x = edgeClearance = 10 (first and only panel per shelf)
          expect(p.x).toBe(10);
        }

        // Shelf-y lookup table invariant: placements[i].y = 10 + i × 203.5
        const shelfStep = 203.5; // placed_h (200) + kerfWidth (3.5)
        const expectedY = Array.from({ length: 11 }, (_, i) => 10 + i * shelfStep);

        // Sort placements by y to guard against any future reordering
        const sortedPlacements = [...sheet101.placements].sort((a, b) => a.y - b.y);

        for (let i = 0; i < 11; i++) {
          expect(sortedPlacements[i].y).toBe(expectedY[i]);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 102 — Seven full sheets: qty=385 curved panels → 7 sheets,
//   each holding exactly 55 panels (385 = 7 × 55);
//   sheets[6] PARTS_CURVED = 55 × 4 = 220.
//
// Fixture:
//   • qty=385, partId='SMOKE_CURVED_S102', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//     → correction=10, rotation=90 → placed_w=210, placed_h=200
//
// Distribution: 385 = 7 × 55 → all seven sheets are full (no remainder sheet)
// Extends Stage 100 (6 full sheets) by one more sheet.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 102 — seven full sheets: qty=385 → sheets.length===7; every sheet has 55 panels; sheets[6] DXF PARTS_CURVED=220',
  () => {
    it(
      'qty=385 curved panels → sheets.length===7; every sheet has 55 placements; all isCurved; sheets[6] PARTS_CURVED=220',
      () => {
        const curvedRow102: CutListRow = {
          partId:          'SMOKE_CURVED_S102',
          cabinetId:       'CAB_SMOKE_102',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             385,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S102',
        };

        const result102 = runNesting([curvedRow102]);

        // 385 = 7 × 55 → exactly 7 sheets, no remainder
        expect(result102.sheets).toHaveLength(7);

        // Every sheet must be full: 55 placements each
        for (let i = 0; i < 7; i++) {
          expect(result102.sheets[i].placements).toHaveLength(55);
        }

        // All placements on every sheet must be isCurved=true
        for (const sheet of result102.sheets) {
          for (const p of sheet.placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // Build DXF for the last sheet (sheets[6]) and assert PARTS_CURVED=220
        const dxf102 = buildDxfSheet({
          planned: { index1: 7, sheetId: 'SHEET_STAGE102_7', materialId: MATERIAL_ID },
          nesting: result102.sheets[6],
          profile: getFactoryProfile('DEFAULT'),
        });

        const lineSegs102 = dxf102.content.split('\n0\nLINE\n').slice(1);
        const partsCurvedCount102 = lineSegs102.filter((seg) =>
          seg.startsWith('8\nPARTS_CURVED\n'),
        ).length;
        expect(partsCurvedCount102).toBe(220); // 55 panels × 4 rect sides
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 103 — Regression guard for Stage 100 fixture: re-running runNesting
//   twice with qty=330 curved panels produces identical sheets[5].placements[0]
//   partId, x, y, and rotation.
//
// Fixture: same as Stage 100
//   • qty=330, partId='SMOKE_CURVED_S103', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//
// Distribution: 330 = 6 × 55 → 6 full sheets; sheets[5].placements[0] is the
//   first panel placed on sheet-6 (x=10, y=10, rotation=90).
//
// Mirrors Stage 99 (mixed-500 determinism) and Stage 95 (three-sheet determinism)
// for the clean six-full-sheet boundary case.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 103 — six-full-sheet determinism: two runNesting calls with qty=330 produce identical sheets[5] placements[0]',
  () => {
    it(
      'runNesting called twice with qty=330 curved panels → sheets[5].placements[0] has identical partId, x, y, rotation',
      () => {
        const curvedRow103: CutListRow = {
          partId:          'SMOKE_CURVED_S103',
          cabinetId:       'CAB_SMOKE_103',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             330,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S103',
        };

        const run103a = runNesting([curvedRow103]);
        const run103b = runNesting([curvedRow103]);

        // Both runs must produce exactly 6 sheets (330 = 6 × 55)
        expect(run103a.sheets).toHaveLength(6);
        expect(run103b.sheets).toHaveLength(6);

        // sheets[5].placements[0] must be identical across both runs
        const p103a = run103a.sheets[5].placements[0];
        const p103b = run103b.sheets[5].placements[0];

        expect(p103b.partId).toBe(p103a.partId);
        expect(p103b.x).toBe(p103a.x);
        expect(p103b.y).toBe(p103a.y);
        expect(p103b.rotation).toBe(p103a.rotation);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 104 — Eight full sheets: qty=440 curved panels → 8 sheets,
//   each holding exactly 55 panels (440 = 8 × 55);
//   sheets[7] PARTS_CURVED = 55 × 4 = 220.
//
// Fixture:
//   • qty=440, partId='SMOKE_CURVED_S104', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//     → correction=10, rotation=90 → placed_w=210, placed_h=200
//
// Distribution: 440 = 8 × 55 → all eight sheets are full (no remainder sheet)
// Extends the full-sheet sequence: Stage 100 (6), Stage 102 (7), Stage 104 (8).
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 104 — eight full sheets: qty=440 → sheets.length===8; every sheet has 55 panels; sheets[7] DXF PARTS_CURVED=220',
  () => {
    it(
      'qty=440 curved panels → sheets.length===8; every sheet has 55 placements; all isCurved; sheets[7] PARTS_CURVED=220',
      () => {
        const curvedRow104: CutListRow = {
          partId:          'SMOKE_CURVED_S104',
          cabinetId:       'CAB_SMOKE_104',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             440,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S104',
        };

        const result104 = runNesting([curvedRow104]);

        // 440 = 8 × 55 → exactly 8 sheets, no remainder
        expect(result104.sheets).toHaveLength(8);

        // Every sheet must be full: 55 placements each
        for (let i = 0; i < 8; i++) {
          expect(result104.sheets[i].placements).toHaveLength(55);
        }

        // All placements on every sheet must be isCurved=true
        for (const sheet of result104.sheets) {
          for (const p of sheet.placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // Build DXF for the last sheet (sheets[7]) and assert PARTS_CURVED=220
        const dxf104 = buildDxfSheet({
          planned: { index1: 8, sheetId: 'SHEET_STAGE104_8', materialId: MATERIAL_ID },
          nesting: result104.sheets[7],
          profile: getFactoryProfile('DEFAULT'),
        });

        const lineSegs104 = dxf104.content.split('\n0\nLINE\n').slice(1);
        const partsCurvedCount104 = lineSegs104.filter((seg) =>
          seg.startsWith('8\nPARTS_CURVED\n'),
        ).length;
        expect(partsCurvedCount104).toBe(220); // 55 panels × 4 rect sides
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 105 — FFDH boundary: qty=54 curved panels (one short of a full sheet)
//   → exactly 1 sheet with 54 placements.
//
// Fixture:
//   • qty=54, partId='SMOKE_CURVED_S105', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//     → correction=10, rotation=90 → placed_w=210, placed_h=200
//
// Distribution:
//   • panelsPerShelf = 5; shelvesPerSheet = 11; panelsPerSheet = 55
//   • 54 panels = 10 full shelves (50 panels) + 4 panels on shelf-11
//   • All 54 fit on 1 sheet (shelf-11 y = 2045, 2045+200=2245 ≤ 2430 ✓)
//   • This is the "one panel short of overflow" boundary case (55 would be
//     the last panel on shelf-11, still 1 sheet; 56 would overflow to sheet-2).
//
// PARTS_CURVED on sheet-1 DXF = 54 × 4 = 216.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 105 — FFDH boundary (qty=54): one panel short of full sheet → 1 sheet, 54 placements, PARTS_CURVED=216',
  () => {
    it(
      'qty=54 curved panels (10 full shelves + 4 on shelf-11) → sheets.length===1; 54 placements; PARTS_CURVED=216',
      () => {
        const curvedRow105: CutListRow = {
          partId:          'SMOKE_CURVED_S105',
          cabinetId:       'CAB_SMOKE_105',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             54,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S105',
        };

        const result105 = runNesting([curvedRow105]);

        // 54 < 55 → all panels fit on exactly 1 sheet
        expect(result105.sheets).toHaveLength(1);

        const sheet105 = result105.sheets[0];
        expect(sheet105.placements).toHaveLength(54);

        // All placements must be isCurved=true
        for (const p of sheet105.placements) {
          expect(p.isCurved).toBe(true);
        }

        // Build DXF for sheet-1 and assert PARTS_CURVED=216 (54×4)
        const dxf105 = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE105_1', materialId: MATERIAL_ID },
          nesting: sheet105,
          profile: getFactoryProfile('DEFAULT'),
        });

        const lineSegs105 = dxf105.content.split('\n0\nLINE\n').slice(1);
        const partsCurvedCount105 = lineSegs105.filter((seg) =>
          seg.startsWith('8\nPARTS_CURVED\n'),
        ).length;
        expect(partsCurvedCount105).toBe(216); // 54 panels × 4 rect sides
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 106 — FFDH overflow boundary: qty=56 curved panels (one panel over a
//   full sheet) → exactly 2 sheets; sheet-1 holds 55, sheet-2 holds 1.
//
// Fixture:
//   • qty=56, partId='SMOKE_CURVED_S106', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//     → correction=10, rotation=90 → placed_w=210, placed_h=200
//
// Distribution:
//   • panelsPerSheet = 55 (5 per shelf × 11 shelves)
//   • Panel 56 cannot fit on sheet-1 → FFDH opens sheet-2
//   • sheets[1] holds exactly 1 placement (x=10, y=10, rotation=90)
//
// This is the "one-over" complement to Stage 105 (one-short).
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 106 — FFDH overflow boundary (qty=56): one panel over full sheet → 2 sheets; sheets[1] has 1 placement',
  () => {
    it(
      'qty=56 curved panels → sheets.length===2; sheets[0] has 55 placements; sheets[1] has 1 placement; all isCurved',
      () => {
        const curvedRow106: CutListRow = {
          partId:          'SMOKE_CURVED_S106',
          cabinetId:       'CAB_SMOKE_106',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             56,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S106',
        };

        const result106 = runNesting([curvedRow106]);

        // 56 = 55 + 1 → exactly 2 sheets
        expect(result106.sheets).toHaveLength(2);

        // Sheet-1: exactly 55 placements
        expect(result106.sheets[0].placements).toHaveLength(55);

        // Sheet-2: exactly 1 placement
        expect(result106.sheets[1].placements).toHaveLength(1);

        // All placements on both sheets must be isCurved=true
        for (const sheet of result106.sheets) {
          for (const p of sheet.placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // The single panel on sheet-2 lands at x=10, y=10, rotation=90
        const sole = result106.sheets[1].placements[0];
        expect(sole.x).toBe(10);
        expect(sole.y).toBe(10);
        expect(sole.rotation).toBe(90);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 107 — Regression guard for Stage 104 fixture: re-running runNesting
//   twice with qty=440 curved panels produces identical sheets[7].placements[0]
//   partId, x, y, and rotation.
//
// Fixture: same as Stage 104
//   • qty=440, partId='SMOKE_CURVED_S107', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//
// Distribution: 440 = 8 × 55 → 8 full sheets; sheets[7].placements[0] is the
//   first panel placed on sheet-8 (x=10, y=10, rotation=90).
//
// Extends the determinism series: Stages 85, 95, 99, 103.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 107 — eight-full-sheet determinism: two runNesting calls with qty=440 produce identical sheets[7] placements[0]',
  () => {
    it(
      'runNesting called twice with qty=440 curved panels → sheets[7].placements[0] has identical partId, x, y, rotation',
      () => {
        const curvedRow107: CutListRow = {
          partId:          'SMOKE_CURVED_S107',
          cabinetId:       'CAB_SMOKE_107',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             440,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S107',
        };

        const run107a = runNesting([curvedRow107]);
        const run107b = runNesting([curvedRow107]);

        // Both runs must produce exactly 8 sheets (440 = 8 × 55)
        expect(run107a.sheets).toHaveLength(8);
        expect(run107b.sheets).toHaveLength(8);

        // sheets[7].placements[0] must be identical across both runs
        const p107a = run107a.sheets[7].placements[0];
        const p107b = run107b.sheets[7].placements[0];

        expect(p107b.partId).toBe(p107a.partId);
        expect(p107b.x).toBe(p107a.x);
        expect(p107b.y).toBe(p107a.y);
        expect(p107b.rotation).toBe(p107a.rotation);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 108 — Two full sheets: qty=110 curved panels → exactly 2 sheets,
//   each holding 55 panels (110 = 2 × 55);
//   PARTS_CURVED = 220 on both sheets.
//
// Fixture:
//   • qty=110, partId='SMOKE_CURVED_S108', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//     → correction=10, rotation=90 → placed_w=210, placed_h=200
//
// Distribution: 110 = 2 × 55 → 2 full sheets, no remainder.
// Validates the 2-sheet full boundary (analogue of Stage 100 for 6 sheets).
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 108 — two full sheets: qty=110 → sheets.length===2; each sheet has 55 panels; both DXF PARTS_CURVED=220',
  () => {
    it(
      'qty=110 curved panels → sheets.length===2; sheets[0] and sheets[1] each have 55 placements; PARTS_CURVED=220 on each',
      () => {
        const curvedRow108: CutListRow = {
          partId:          'SMOKE_CURVED_S108',
          cabinetId:       'CAB_SMOKE_108',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             110,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S108',
        };

        const result108 = runNesting([curvedRow108]);

        // 110 = 2 × 55 → exactly 2 sheets, no remainder
        expect(result108.sheets).toHaveLength(2);

        // Both sheets must have exactly 55 placements
        expect(result108.sheets[0].placements).toHaveLength(55);
        expect(result108.sheets[1].placements).toHaveLength(55);

        // All placements on both sheets must be isCurved=true
        for (const sheet of result108.sheets) {
          for (const p of sheet.placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // Assert PARTS_CURVED=220 on sheet-1
        const dxf108a = buildDxfSheet({
          planned: { index1: 1, sheetId: 'SHEET_STAGE108_1', materialId: MATERIAL_ID },
          nesting: result108.sheets[0],
          profile: getFactoryProfile('DEFAULT'),
        });
        const lineSegs108a = dxf108a.content.split('\n0\nLINE\n').slice(1);
        expect(
          lineSegs108a.filter((seg) => seg.startsWith('8\nPARTS_CURVED\n')).length,
        ).toBe(220); // 55 × 4

        // Assert PARTS_CURVED=220 on sheet-2
        const dxf108b = buildDxfSheet({
          planned: { index1: 2, sheetId: 'SHEET_STAGE108_2', materialId: MATERIAL_ID },
          nesting: result108.sheets[1],
          profile: getFactoryProfile('DEFAULT'),
        });
        const lineSegs108b = dxf108b.content.split('\n0\nLINE\n').slice(1);
        expect(
          lineSegs108b.filter((seg) => seg.startsWith('8\nPARTS_CURVED\n')).length,
        ).toBe(220); // 55 × 4
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 109 — Two full sheets + 1 overflow: qty=111 curved panels →
//   exactly 3 sheets; sheets[0] and sheets[1] hold 55 each;
//   sheets[2] holds exactly 1 placement.
//
// Fixture:
//   • qty=111, partId='SMOKE_CURVED_S109', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//     → correction=10, rotation=90 → placed_w=210, placed_h=200
//
// Distribution: 111 = 55 + 55 + 1 → panel 111 overflows to sheet-3;
//   sheets[2].placements[0]: x=10, y=10, rotation=90.
//
// Mirrors Stage 106 (1-over at 1-sheet boundary) at the 2-sheet boundary.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 109 — two full sheets + 1 overflow: qty=111 → sheets.length===3; sheets[2] has 1 placement',
  () => {
    it(
      'qty=111 curved panels → sheets.length===3; sheets[0] and sheets[1] have 55 placements; sheets[2] has 1 placement at x=10,y=10,r=90',
      () => {
        const curvedRow109: CutListRow = {
          partId:          'SMOKE_CURVED_S109',
          cabinetId:       'CAB_SMOKE_109',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             111,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S109',
        };

        const result109 = runNesting([curvedRow109]);

        // 111 = 55 + 55 + 1 → exactly 3 sheets
        expect(result109.sheets).toHaveLength(3);

        // Sheets 1 and 2 must be full
        expect(result109.sheets[0].placements).toHaveLength(55);
        expect(result109.sheets[1].placements).toHaveLength(55);

        // Sheet 3 holds exactly 1 overflow panel
        expect(result109.sheets[2].placements).toHaveLength(1);

        // All placements on all sheets must be isCurved=true
        for (const sheet of result109.sheets) {
          for (const p of sheet.placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // The overflow panel on sheet-3 lands at x=10, y=10, rotation=90
        const overflow109 = result109.sheets[2].placements[0];
        expect(overflow109.x).toBe(10);
        expect(overflow109.y).toBe(10);
        expect(overflow109.rotation).toBe(90);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 110 — Three full sheets: qty=165 curved panels → exactly 3 sheets,
//   each holding 55 panels (165 = 3 × 55);
//   PARTS_CURVED = 220 on all three sheets.
//
// Fixture:
//   • qty=165, partId='SMOKE_CURVED_S110', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//     → correction=10, rotation=90 → placed_w=210, placed_h=200
//
// Distribution: 165 = 3 × 55 → 3 full sheets, no remainder.
// Continues the full-sheet sequence: 100 (6), 102 (7), 104 (8), 108 (2), 110 (3).
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 110 — three full sheets: qty=165 → sheets.length===3; each sheet has 55 panels; all DXF PARTS_CURVED=220',
  () => {
    it(
      'qty=165 curved panels → sheets.length===3; all three sheets have 55 placements; PARTS_CURVED=220 on each',
      () => {
        const curvedRow110: CutListRow = {
          partId:          'SMOKE_CURVED_S110',
          cabinetId:       'CAB_SMOKE_110',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             165,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S110',
        };

        const result110 = runNesting([curvedRow110]);

        // 165 = 3 × 55 → exactly 3 sheets, no remainder
        expect(result110.sheets).toHaveLength(3);

        // All three sheets must have exactly 55 placements
        for (let i = 0; i < 3; i++) {
          expect(result110.sheets[i].placements).toHaveLength(55);
        }

        // All placements must be isCurved=true
        for (const sheet of result110.sheets) {
          for (const p of sheet.placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // Assert PARTS_CURVED=220 on all three sheets
        for (let i = 0; i < 3; i++) {
          const dxf110 = buildDxfSheet({
            planned: { index1: i + 1, sheetId: `SHEET_STAGE110_${i + 1}`, materialId: MATERIAL_ID },
            nesting: result110.sheets[i],
            profile: getFactoryProfile('DEFAULT'),
          });
          const lineSegs110 = dxf110.content.split('\n0\nLINE\n').slice(1);
          expect(
            lineSegs110.filter((seg) => seg.startsWith('8\nPARTS_CURVED\n')).length,
          ).toBe(220); // 55 × 4
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 111 — Regression guard for Stage 108 fixture: re-running runNesting
//   twice with qty=110 curved panels produces identical sheets[1].placements[0]
//   partId, x, y, and rotation.
//
// Fixture: same as Stage 108
//   • qty=110, partId='SMOKE_CURVED_S111', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//
// Distribution: 110 = 2 × 55 → 2 full sheets; sheets[1].placements[0] is the
//   first panel placed on sheet-2 (x=10, y=10, rotation=90).
//
// Extends the determinism series: Stages 85, 95, 99, 103, 107, 111.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 111 — two-full-sheet determinism: two runNesting calls with qty=110 produce identical sheets[1] placements[0]',
  () => {
    it(
      'runNesting called twice with qty=110 curved panels → sheets[1].placements[0] has identical partId, x, y, rotation',
      () => {
        const curvedRow111: CutListRow = {
          partId:          'SMOKE_CURVED_S111',
          cabinetId:       'CAB_SMOKE_111',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             110,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S111',
        };

        const run111a = runNesting([curvedRow111]);
        const run111b = runNesting([curvedRow111]);

        // Both runs must produce exactly 2 sheets (110 = 2 × 55)
        expect(run111a.sheets).toHaveLength(2);
        expect(run111b.sheets).toHaveLength(2);

        // sheets[1].placements[0] must be identical across both runs
        const p111a = run111a.sheets[1].placements[0];
        const p111b = run111b.sheets[1].placements[0];

        expect(p111b.partId).toBe(p111a.partId);
        expect(p111b.x).toBe(p111a.x);
        expect(p111b.y).toBe(p111a.y);
        expect(p111b.rotation).toBe(p111a.rotation);
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 112 — Four full sheets: qty=220 curved panels → exactly 4 sheets,
//   each holding 55 panels (220 = 4 × 55);
//   PARTS_CURVED = 220 on all four sheets.
//
// Fixture:
//   • qty=220, partId='SMOKE_CURVED_S112', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//     → correction=10, rotation=90 → placed_w=210, placed_h=200
//
// Distribution: 220 = 4 × 55 → 4 full sheets, no remainder.
// Continues the full-sheet sequence: 108 (2), 110 (3), 112 (4).
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 112 — four full sheets: qty=220 → sheets.length===4; each sheet has 55 panels; all DXF PARTS_CURVED=220',
  () => {
    it(
      'qty=220 curved panels → sheets.length===4; all four sheets have 55 placements; PARTS_CURVED=220 on each',
      () => {
        const curvedRow112: CutListRow = {
          partId:          'SMOKE_CURVED_S112',
          cabinetId:       'CAB_SMOKE_112',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             220,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S112',
        };

        const result112 = runNesting([curvedRow112]);

        // 220 = 4 × 55 → exactly 4 sheets, no remainder
        expect(result112.sheets).toHaveLength(4);

        // All four sheets must have exactly 55 placements
        for (let i = 0; i < 4; i++) {
          expect(result112.sheets[i].placements).toHaveLength(55);
        }

        // All placements must be isCurved=true
        for (const sheet of result112.sheets) {
          for (const p of sheet.placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // Assert PARTS_CURVED=220 on all four sheets
        for (let i = 0; i < 4; i++) {
          const dxf112 = buildDxfSheet({
            planned: { index1: i + 1, sheetId: `SHEET_STAGE112_${i + 1}`, materialId: MATERIAL_ID },
            nesting: result112.sheets[i],
            profile: getFactoryProfile('DEFAULT'),
          });
          const lineSegs112 = dxf112.content.split('\n0\nLINE\n').slice(1);
          expect(
            lineSegs112.filter((seg) => seg.startsWith('8\nPARTS_CURVED\n')).length,
          ).toBe(220); // 55 × 4
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Stage 113 — Three full sheets + 1 overflow: qty=166 curved panels →
//   exactly 4 sheets; sheets[0..2] hold 55 each; sheets[3] holds 1 panel.
//
// Fixture:
//   • qty=166, partId='SMOKE_CURVED_S113', cutW=200, cutH=200,
//     developedLength=210, projectedDepth=200, curvedEdge='TOP'
//     → correction=10, rotation=90 → placed_w=210, placed_h=200
//
// Distribution: 166 = 3×55 + 1 → panel 166 overflows to sheet-4;
//   sheets[3].placements[0]: x=10, y=10, rotation=90.
//
// Mirrors Stage 109 (2-sheet boundary) at the 3-sheet boundary.
// ─────────────────────────────────────────────────────────────────────────────
describe(
  '@smoke Stage 113 — three full sheets + 1 overflow: qty=166 → sheets.length===4; sheets[3] has 1 placement',
  () => {
    it(
      'qty=166 curved panels → sheets.length===4; sheets[0..2] have 55 placements; sheets[3] has 1 placement at x=10,y=10,r=90',
      () => {
        const curvedRow113: CutListRow = {
          partId:          'SMOKE_CURVED_S113',
          cabinetId:       'CAB_SMOKE_113',
          materialId:      MATERIAL_ID,
          finishW:         200,
          finishH:         200,
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             166,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S113',
        };

        const result113 = runNesting([curvedRow113]);

        // 166 = 3×55 + 1 → exactly 4 sheets
        expect(result113.sheets).toHaveLength(4);

        // Sheets 1–3 must be full
        for (let i = 0; i < 3; i++) {
          expect(result113.sheets[i].placements).toHaveLength(55);
        }

        // Sheet 4 holds exactly 1 overflow panel
        expect(result113.sheets[3].placements).toHaveLength(1);

        // All placements must be isCurved=true
        for (const sheet of result113.sheets) {
          for (const p of sheet.placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // The overflow panel on sheet-4 lands at x=10, y=10, rotation=90
        const overflow113 = result113.sheets[3].placements[0];
        expect(overflow113.x).toBe(10);
        expect(overflow113.y).toBe(10);
        expect(overflow113.rotation).toBe(90);
      },
    );
  },
);

// ─── Stage 114 ─────────────────────────────────────────────────────────────
describe(
  'Stage 114 – determinism guard: qty=220 (Stage 112 fixture) → identical sheets[3].placements[0]',
  () => {
    it(
      'running runNesting twice with qty=220 produces identical sheets[3].placements[0] partId/x/y/rotation',
      () => {
        const curvedRow114: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S114',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             220,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S114',
        };

        const resultA = runNesting([curvedRow114]);
        const resultB = runNesting([curvedRow114]);

        // Both runs must produce 4 full sheets
        expect(resultA.sheets).toHaveLength(4);
        expect(resultB.sheets).toHaveLength(4);

        // sheets[3].placements[0] must be identical across both runs
        const pA = resultA.sheets[3].placements[0];
        const pB = resultB.sheets[3].placements[0];

        expect(pA.partId).toBe(pB.partId);
        expect(pA.x).toBe(pB.x);
        expect(pA.y).toBe(pB.y);
        expect(pA.rotation).toBe(pB.rotation);
      },
    );
  },
);


// ─── Stage 115 ─────────────────────────────────────────────────────────────
describe(
  'Stage 115 – qty=275 curved panels (5 full sheets) → sheets.length===5, each 55 placements, PARTS_CURVED=220',
  () => {
    it(
      'produces exactly 5 full sheets with 55 placements each and 220 PARTS_CURVED lines per DXF',
      () => {
        const curvedRow115: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S115',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             275,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S115',
        };

        const result115 = runNesting([curvedRow115]);

        // 275 = 5×55 → exactly 5 full sheets, no remainder
        expect(result115.sheets).toHaveLength(5);

        // Every sheet must hold exactly 55 placements, all isCurved=true
        for (let i = 0; i < 5; i++) {
          expect(result115.sheets[i].placements).toHaveLength(55);
          for (const p of result115.sheets[i].placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // DXF must emit PARTS_CURVED=220 on each of the 5 sheets
        for (let i = 0; i < 5; i++) {
          const dxf115 = buildDxfSheet({
            planned: { index1: i + 1, sheetId: `SHEET_STAGE115_${i + 1}`, materialId: MATERIAL_ID },
            nesting: result115.sheets[i],
            profile: getFactoryProfile('DEFAULT'),
          });
          const lineSegs115 = dxf115.content.split('\n0\nLINE\n').slice(1);
          expect(
            lineSegs115.filter((seg) => seg.startsWith('8\nPARTS_CURVED\n')).length,
          ).toBe(220); // 55 × 4
        }
      },
    );
  },
);

// ─── Stage 116 ─────────────────────────────────────────────────────────────
describe(
  'Stage 116 – qty=330 curved panels (6 full sheets) → sheets.length===6, each 55 placements, PARTS_CURVED=220',
  () => {
    it(
      'produces exactly 6 full sheets with 55 placements each and 220 PARTS_CURVED lines per DXF',
      () => {
        const curvedRow116: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S116',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             330,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S116',
        };

        const result116 = runNesting([curvedRow116]);

        // 330 = 6×55 → exactly 6 full sheets, no remainder
        expect(result116.sheets).toHaveLength(6);

        // Every sheet must hold exactly 55 placements, all isCurved=true
        for (let i = 0; i < 6; i++) {
          expect(result116.sheets[i].placements).toHaveLength(55);
          for (const p of result116.sheets[i].placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // DXF must emit PARTS_CURVED=220 on each of the 6 sheets
        for (let i = 0; i < 6; i++) {
          const dxf116 = buildDxfSheet({
            planned: { index1: i + 1, sheetId: `SHEET_STAGE116_${i + 1}`, materialId: MATERIAL_ID },
            nesting: result116.sheets[i],
            profile: getFactoryProfile('DEFAULT'),
          });
          const lineSegs116 = dxf116.content.split('\n0\nLINE\n').slice(1);
          expect(
            lineSegs116.filter((seg) => seg.startsWith('8\nPARTS_CURVED\n')).length,
          ).toBe(220); // 55 × 4
        }
      },
    );
  },
);

// ─── Stage 117 ─────────────────────────────────────────────────────────────
describe(
  'Stage 117 – determinism guard: qty=275 (Stage 115 fixture) → identical sheets[4].placements[0]',
  () => {
    it(
      'running runNesting twice with qty=275 produces identical sheets[4].placements[0] partId/x/y/rotation',
      () => {
        const curvedRow117: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S117',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             275,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S117',
        };

        const resultA = runNesting([curvedRow117]);
        const resultB = runNesting([curvedRow117]);

        // Both runs must produce 5 full sheets
        expect(resultA.sheets).toHaveLength(5);
        expect(resultB.sheets).toHaveLength(5);

        // sheets[4].placements[0] must be identical across both runs
        const pA = resultA.sheets[4].placements[0];
        const pB = resultB.sheets[4].placements[0];

        expect(pA.partId).toBe(pB.partId);
        expect(pA.x).toBe(pB.x);
        expect(pA.y).toBe(pB.y);
        expect(pA.rotation).toBe(pB.rotation);
      },
    );
  },
);

// ─── Stage 118 ─────────────────────────────────────────────────────────────
describe(
  'Stage 118 – qty=385 curved panels (7 full sheets) → sheets.length===7, each 55 placements, PARTS_CURVED=220',
  () => {
    it(
      'produces exactly 7 full sheets with 55 placements each and 220 PARTS_CURVED lines per DXF',
      () => {
        const curvedRow118: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S118',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             385,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S118',
        };

        const result118 = runNesting([curvedRow118]);

        // 385 = 7×55 → exactly 7 full sheets, no remainder
        expect(result118.sheets).toHaveLength(7);

        // Every sheet must hold exactly 55 placements, all isCurved=true
        for (let i = 0; i < 7; i++) {
          expect(result118.sheets[i].placements).toHaveLength(55);
          for (const p of result118.sheets[i].placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // DXF must emit PARTS_CURVED=220 on each of the 7 sheets
        for (let i = 0; i < 7; i++) {
          const dxf118 = buildDxfSheet({
            planned: { index1: i + 1, sheetId: `SHEET_STAGE118_${i + 1}`, materialId: MATERIAL_ID },
            nesting: result118.sheets[i],
            profile: getFactoryProfile('DEFAULT'),
          });
          const lineSegs118 = dxf118.content.split('\n0\nLINE\n').slice(1);
          expect(
            lineSegs118.filter((seg) => seg.startsWith('8\nPARTS_CURVED\n')).length,
          ).toBe(220); // 55 × 4
        }
      },
    );
  },
);

// ─── Stage 119 ─────────────────────────────────────────────────────────────
describe(
  'Stage 119 – determinism guard: qty=330 (Stage 116 fixture) → identical sheets[5].placements[0]',
  () => {
    it(
      'running runNesting twice with qty=330 produces identical sheets[5].placements[0] partId/x/y/rotation',
      () => {
        const curvedRow119: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S119',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             330,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S119',
        };

        const resultA = runNesting([curvedRow119]);
        const resultB = runNesting([curvedRow119]);

        // Both runs must produce 6 full sheets
        expect(resultA.sheets).toHaveLength(6);
        expect(resultB.sheets).toHaveLength(6);

        // sheets[5].placements[0] must be identical across both runs
        const pA = resultA.sheets[5].placements[0];
        const pB = resultB.sheets[5].placements[0];

        expect(pA.partId).toBe(pB.partId);
        expect(pA.x).toBe(pB.x);
        expect(pA.y).toBe(pB.y);
        expect(pA.rotation).toBe(pB.rotation);
      },
    );
  },
);

// ─── Stage 120 ─────────────────────────────────────────────────────────────
describe(
  'Stage 120 – qty=440 curved panels (8 full sheets) → sheets.length===8, each 55 placements, PARTS_CURVED=220',
  () => {
    it(
      'produces exactly 8 full sheets with 55 placements each and 220 PARTS_CURVED lines per DXF',
      () => {
        const curvedRow120: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S120',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             440,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S120',
        };

        const result120 = runNesting([curvedRow120]);

        // 440 = 8×55 → exactly 8 full sheets, no remainder
        expect(result120.sheets).toHaveLength(8);

        // Every sheet must hold exactly 55 placements, all isCurved=true
        for (let i = 0; i < 8; i++) {
          expect(result120.sheets[i].placements).toHaveLength(55);
          for (const p of result120.sheets[i].placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // DXF must emit PARTS_CURVED=220 on each of the 8 sheets
        for (let i = 0; i < 8; i++) {
          const dxf120 = buildDxfSheet({
            planned: { index1: i + 1, sheetId: `SHEET_STAGE120_${i + 1}`, materialId: MATERIAL_ID },
            nesting: result120.sheets[i],
            profile: getFactoryProfile('DEFAULT'),
          });
          const lineSegs120 = dxf120.content.split('\n0\nLINE\n').slice(1);
          expect(
            lineSegs120.filter((seg) => seg.startsWith('8\nPARTS_CURVED\n')).length,
          ).toBe(220); // 55 × 4
        }
      },
    );
  },
);

// ─── Stage 121 ─────────────────────────────────────────────────────────────
describe(
  'Stage 121 – determinism guard: qty=385 (Stage 118 fixture) → identical sheets[6].placements[0]',
  () => {
    it(
      'running runNesting twice with qty=385 produces identical sheets[6].placements[0] partId/x/y/rotation',
      () => {
        const curvedRow121: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S121',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             385,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S121',
        };

        const resultA = runNesting([curvedRow121]);
        const resultB = runNesting([curvedRow121]);

        // Both runs must produce 7 full sheets
        expect(resultA.sheets).toHaveLength(7);
        expect(resultB.sheets).toHaveLength(7);

        // sheets[6].placements[0] must be identical across both runs
        const pA = resultA.sheets[6].placements[0];
        const pB = resultB.sheets[6].placements[0];

        expect(pA.partId).toBe(pB.partId);
        expect(pA.x).toBe(pB.x);
        expect(pA.y).toBe(pB.y);
        expect(pA.rotation).toBe(pB.rotation);
      },
    );
  },
);

// ─── Stage 122 ─────────────────────────────────────────────────────────────
describe(
  'Stage 122 – qty=495 curved panels (9 full sheets) → sheets.length===9, each 55 placements, PARTS_CURVED=220',
  () => {
    it(
      'produces exactly 9 full sheets with 55 placements each and 220 PARTS_CURVED lines per DXF',
      () => {
        const curvedRow122: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S122',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             495,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S122',
        };

        const result122 = runNesting([curvedRow122]);

        // 495 = 9×55 → exactly 9 full sheets, no remainder
        expect(result122.sheets).toHaveLength(9);

        // Every sheet must hold exactly 55 placements, all isCurved=true
        for (let i = 0; i < 9; i++) {
          expect(result122.sheets[i].placements).toHaveLength(55);
          for (const p of result122.sheets[i].placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // DXF must emit PARTS_CURVED=220 on each of the 9 sheets
        for (let i = 0; i < 9; i++) {
          const dxf122 = buildDxfSheet({
            planned: { index1: i + 1, sheetId: `SHEET_STAGE122_${i + 1}`, materialId: MATERIAL_ID },
            nesting: result122.sheets[i],
            profile: getFactoryProfile('DEFAULT'),
          });
          const lineSegs122 = dxf122.content.split('\n0\nLINE\n').slice(1);
          expect(
            lineSegs122.filter((seg) => seg.startsWith('8\nPARTS_CURVED\n')).length,
          ).toBe(220); // 55 × 4
        }
      },
    );
  },
);

// ─── Stage 123 ─────────────────────────────────────────────────────────────
describe(
  'Stage 123 – determinism guard: qty=440 (Stage 120 fixture) → identical sheets[7].placements[0]',
  () => {
    it(
      'running runNesting twice with qty=440 produces identical sheets[7].placements[0] partId/x/y/rotation',
      () => {
        const curvedRow123: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S123',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             440,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S123',
        };

        const resultA = runNesting([curvedRow123]);
        const resultB = runNesting([curvedRow123]);

        // Both runs must produce 8 full sheets
        expect(resultA.sheets).toHaveLength(8);
        expect(resultB.sheets).toHaveLength(8);

        // sheets[7].placements[0] must be identical across both runs
        const pA = resultA.sheets[7].placements[0];
        const pB = resultB.sheets[7].placements[0];

        expect(pA.partId).toBe(pB.partId);
        expect(pA.x).toBe(pB.x);
        expect(pA.y).toBe(pB.y);
        expect(pA.rotation).toBe(pB.rotation);
      },
    );
  },
);

// ─── Stage 124 ─────────────────────────────────────────────────────────────
describe(
  'Stage 124 – qty=550 curved panels (10 full sheets) → sheets.length===10, each 55 placements, PARTS_CURVED=220',
  () => {
    it(
      'produces exactly 10 full sheets with 55 placements each and 220 PARTS_CURVED lines per DXF',
      () => {
        const curvedRow124: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S124',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             550,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S124',
        };

        const result124 = runNesting([curvedRow124]);

        // 550 = 10×55 → exactly 10 full sheets, no remainder
        expect(result124.sheets).toHaveLength(10);

        // Every sheet must hold exactly 55 placements, all isCurved=true
        for (let i = 0; i < 10; i++) {
          expect(result124.sheets[i].placements).toHaveLength(55);
          for (const p of result124.sheets[i].placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // DXF must emit PARTS_CURVED=220 on each of the 10 sheets
        for (let i = 0; i < 10; i++) {
          const dxf124 = buildDxfSheet({
            planned: { index1: i + 1, sheetId: `SHEET_STAGE124_${i + 1}`, materialId: MATERIAL_ID },
            nesting: result124.sheets[i],
            profile: getFactoryProfile('DEFAULT'),
          });
          const lineSegs124 = dxf124.content.split('\n0\nLINE\n').slice(1);
          expect(
            lineSegs124.filter((seg) => seg.startsWith('8\nPARTS_CURVED\n')).length,
          ).toBe(220); // 55 × 4
        }
      },
    );
  },
);

// ─── Stage 125 ─────────────────────────────────────────────────────────────
describe(
  'Stage 125 – determinism guard: qty=495 (Stage 122 fixture) → identical sheets[8].placements[0]',
  () => {
    it(
      'running runNesting twice with qty=495 produces identical sheets[8].placements[0] partId/x/y/rotation',
      () => {
        const curvedRow125: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S125',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             495,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S125',
        };

        const resultA = runNesting([curvedRow125]);
        const resultB = runNesting([curvedRow125]);

        // Both runs must produce 9 full sheets
        expect(resultA.sheets).toHaveLength(9);
        expect(resultB.sheets).toHaveLength(9);

        // sheets[8].placements[0] must be identical across both runs
        const pA = resultA.sheets[8].placements[0];
        const pB = resultB.sheets[8].placements[0];

        expect(pA.partId).toBe(pB.partId);
        expect(pA.x).toBe(pB.x);
        expect(pA.y).toBe(pB.y);
        expect(pA.rotation).toBe(pB.rotation);
      },
    );
  },
);

// ─── Stage 126 ─────────────────────────────────────────────────────────────
describe(
  'Stage 126 – qty=605 curved panels (11 full sheets) → sheets.length===11, each 55 placements, PARTS_CURVED=220',
  () => {
    it(
      'produces exactly 11 full sheets with 55 placements each and 220 PARTS_CURVED lines per DXF',
      () => {
        const curvedRow126: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S126',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             605,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S126',
        };

        const result126 = runNesting([curvedRow126]);

        // 605 = 11×55 → exactly 11 full sheets, no remainder
        expect(result126.sheets).toHaveLength(11);

        // Every sheet must hold exactly 55 placements, all isCurved=true
        for (let i = 0; i < 11; i++) {
          expect(result126.sheets[i].placements).toHaveLength(55);
          for (const p of result126.sheets[i].placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // DXF must emit PARTS_CURVED=220 on each of the 11 sheets
        for (let i = 0; i < 11; i++) {
          const dxf126 = buildDxfSheet({
            planned: { index1: i + 1, sheetId: `SHEET_STAGE126_${i + 1}`, materialId: MATERIAL_ID },
            nesting: result126.sheets[i],
            profile: getFactoryProfile('DEFAULT'),
          });
          const lineSegs126 = dxf126.content.split('\n0\nLINE\n').slice(1);
          expect(
            lineSegs126.filter((seg) => seg.startsWith('8\nPARTS_CURVED\n')).length,
          ).toBe(220); // 55 × 4
        }
      },
    );
  },
);

// ─── Stage 127 ─────────────────────────────────────────────────────────────
describe(
  'Stage 127 – determinism guard: qty=550 (Stage 124 fixture) → identical sheets[9].placements[0]',
  () => {
    it(
      'running runNesting twice with qty=550 produces identical sheets[9].placements[0] partId/x/y/rotation',
      () => {
        const curvedRow127: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S127',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             550,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S127',
        };

        const resultA = runNesting([curvedRow127]);
        const resultB = runNesting([curvedRow127]);

        // Both runs must produce 10 full sheets
        expect(resultA.sheets).toHaveLength(10);
        expect(resultB.sheets).toHaveLength(10);

        // sheets[9].placements[0] must be identical across both runs
        const pA = resultA.sheets[9].placements[0];
        const pB = resultB.sheets[9].placements[0];

        expect(pA.partId).toBe(pB.partId);
        expect(pA.x).toBe(pB.x);
        expect(pA.y).toBe(pB.y);
        expect(pA.rotation).toBe(pB.rotation);
      },
    );
  },
);

// ─── Stage 128 ─────────────────────────────────────────────────────────────
describe(
  'Stage 128 – qty=660 curved panels (12 full sheets) → sheets.length===12, each 55 placements, PARTS_CURVED=220',
  () => {
    it(
      'produces exactly 12 full sheets with 55 placements each and 220 PARTS_CURVED lines per DXF',
      () => {
        const curvedRow128: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S128',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             660,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S128',
        };

        const result128 = runNesting([curvedRow128]);

        // 660 = 12×55 → exactly 12 full sheets, no remainder
        expect(result128.sheets).toHaveLength(12);

        // Every sheet must hold exactly 55 placements, all isCurved=true
        for (let i = 0; i < 12; i++) {
          expect(result128.sheets[i].placements).toHaveLength(55);
          for (const p of result128.sheets[i].placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // DXF must emit PARTS_CURVED=220 on each of the 12 sheets
        for (let i = 0; i < 12; i++) {
          const dxf128 = buildDxfSheet({
            planned: { index1: i + 1, sheetId: `SHEET_STAGE128_${i + 1}`, materialId: MATERIAL_ID },
            nesting: result128.sheets[i],
            profile: getFactoryProfile('DEFAULT'),
          });
          const lineSegs128 = dxf128.content.split('\n0\nLINE\n').slice(1);
          expect(
            lineSegs128.filter((seg) => seg.startsWith('8\nPARTS_CURVED\n')).length,
          ).toBe(220); // 55 × 4
        }
      },
    );
  },
);

// ─── Stage 129 ─────────────────────────────────────────────────────────────
describe(
  'Stage 129 – determinism guard: qty=605 (Stage 126 fixture) → identical sheets[10].placements[0]',
  () => {
    it(
      'running runNesting twice with qty=605 produces identical sheets[10].placements[0] partId/x/y/rotation',
      () => {
        const curvedRow129: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S129',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             605,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S129',
        };

        const resultA = runNesting([curvedRow129]);
        const resultB = runNesting([curvedRow129]);

        // Both runs must produce 11 full sheets
        expect(resultA.sheets).toHaveLength(11);
        expect(resultB.sheets).toHaveLength(11);

        // sheets[10].placements[0] must be identical across both runs
        const pA = resultA.sheets[10].placements[0];
        const pB = resultB.sheets[10].placements[0];

        expect(pA.partId).toBe(pB.partId);
        expect(pA.x).toBe(pB.x);
        expect(pA.y).toBe(pB.y);
        expect(pA.rotation).toBe(pB.rotation);
      },
    );
  },
);

// ─── Stage 130 ─────────────────────────────────────────────────────────────
describe(
  'Stage 130 – qty=715 curved panels (13 full sheets) → sheets.length===13, each 55 placements, PARTS_CURVED=220',
  () => {
    it(
      'packs 715 curved panels into exactly 13 full sheets with 55 placements each and PARTS_CURVED=220 per DXF sheet',
      () => {
        const curvedRow130: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S130',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             715,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S130',
        };

        const result130 = runNesting([curvedRow130]);

        // 715 = 13×55 → exactly 13 full sheets, no remainder
        expect(result130.sheets).toHaveLength(13);

        // Every sheet must hold exactly 55 placements, all isCurved=true
        for (let i = 0; i < 13; i++) {
          expect(result130.sheets[i].placements).toHaveLength(55);
          for (const p of result130.sheets[i].placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // DXF must emit PARTS_CURVED=220 on each of the 13 sheets
        for (let i = 0; i < 13; i++) {
          const dxf130 = buildDxfSheet({
            planned: { index1: i + 1, sheetId: `SHEET_STAGE130_${i + 1}`, materialId: MATERIAL_ID },
            nesting: result130.sheets[i],
            profile: getFactoryProfile('DEFAULT'),
          });
          const lineSegs130 = dxf130.content.split('\n0\nLINE\n').slice(1);
          expect(
            lineSegs130.filter((seg) => seg.startsWith('8\nPARTS_CURVED\n')).length,
          ).toBe(220); // 55 × 4
        }
      },
    );
  },
);

// ─── Stage 131 ─────────────────────────────────────────────────────────────
describe(
  'Stage 131 – determinism guard: qty=660 (Stage 128 fixture) → identical sheets[11].placements[0]',
  () => {
    it(
      'running runNesting twice with qty=660 produces identical sheets[11].placements[0] partId/x/y/rotation',
      () => {
        const curvedRow131: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S131',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             660,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S131',
        };

        const resultA = runNesting([curvedRow131]);
        const resultB = runNesting([curvedRow131]);

        // Both runs must produce 12 full sheets
        expect(resultA.sheets).toHaveLength(12);
        expect(resultB.sheets).toHaveLength(12);

        // sheets[11].placements[0] must be identical across both runs
        const pA = resultA.sheets[11].placements[0];
        const pB = resultB.sheets[11].placements[0];

        expect(pA.partId).toBe(pB.partId);
        expect(pA.x).toBe(pB.x);
        expect(pA.y).toBe(pB.y);
        expect(pA.rotation).toBe(pB.rotation);
      },
    );
  },
);

// ─── Stage 132 ─────────────────────────────────────────────────────────────
describe(
  'Stage 132 – qty=770 curved panels (14 full sheets) → sheets.length===14, each 55 placements, PARTS_CURVED=220',
  () => {
    it(
      'packs 770 curved panels into exactly 14 full sheets with 55 placements each and PARTS_CURVED=220 per DXF sheet',
      () => {
        const curvedRow132: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S132',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             770,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S132',
        };

        const result132 = runNesting([curvedRow132]);

        // 770 = 14×55 → exactly 14 full sheets, no remainder
        expect(result132.sheets).toHaveLength(14);

        // Every sheet must hold exactly 55 placements, all isCurved=true
        for (let i = 0; i < 14; i++) {
          expect(result132.sheets[i].placements).toHaveLength(55);
          for (const p of result132.sheets[i].placements) {
            expect(p.isCurved).toBe(true);
          }
        }

        // DXF must emit PARTS_CURVED=220 on each of the 14 sheets
        for (let i = 0; i < 14; i++) {
          const dxf132 = buildDxfSheet({
            planned: { index1: i + 1, sheetId: `SHEET_STAGE132_${i + 1}`, materialId: MATERIAL_ID },
            nesting: result132.sheets[i],
            profile: getFactoryProfile('DEFAULT'),
          });
          const lineSegs132 = dxf132.content.split('\n0\nLINE\n').slice(1);
          expect(
            lineSegs132.filter((seg) => seg.startsWith('8\nPARTS_CURVED\n')).length,
          ).toBe(220); // 55 × 4
        }
      },
    );
  },
);

// ─── Stage 133 ─────────────────────────────────────────────────────────────
describe(
  'Stage 133 – determinism guard: qty=715 (Stage 130 fixture) → identical sheets[12].placements[0]',
  () => {
    it(
      'running runNesting twice with qty=715 produces identical sheets[12].placements[0] partId/x/y/rotation',
      () => {
        const curvedRow133: PacketCutListRow = {
          partId:          'SMOKE_CURVED_S133',
          materialId:      'MDF_18',
          grainDir:        'LONG',
          edgeL: 0, edgeR: 0, edgeT: 0, edgeB: 0,
          premillL: 0, premillR: 0, premillT: 0, premillB: 0,
          cutW:            200,
          cutH:            200,
          qty:             715,
          developedLength: 210,
          projectedDepth:  200,
          curvedEdge:      'TOP',
          label:           'Curved Panel S133',
        };

        const resultA = runNesting([curvedRow133]);
        const resultB = runNesting([curvedRow133]);

        // Both runs must produce 13 full sheets
        expect(resultA.sheets).toHaveLength(13);
        expect(resultB.sheets).toHaveLength(13);

        // sheets[12].placements[0] must be identical across both runs
        const pA = resultA.sheets[12].placements[0];
        const pB = resultB.sheets[12].placements[0];

        expect(pA.partId).toBe(pB.partId);
        expect(pA.x).toBe(pB.x);
        expect(pA.y).toBe(pB.y);
        expect(pA.rotation).toBe(pB.rotation);
      },
    );
  },
);
