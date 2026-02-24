# Minifix / Dowel Docs Index

This index groups the Minifix + Dowel reference documents created from the regression/debugging work.

It also includes the CAD-derived A/B pattern generator rules:
- side-length threshold branching (`<= 400`, `> 400`)
- long-side vs short-side pattern composition
- worked example reference (`600 x 395`)

## Documents

### 1) Baseline Spec (English)
- `docs/minifix-dowel-baseline-spec.md`

Use this for:
- engineering reference baseline
- system behavior definition
- cross-team technical discussion
- CAD pattern rule source of truth (A/B threshold + composition + spacing intent)

### 2) Baseline Spec (Thai)
- `docs/minifix-dowel-baseline-spec.th.md`

Use this for:
- Thai-speaking operations / coordination
- practical review with non-dev stakeholders
- field/team handoff reference

### 3) Regression Test Plan (Dev / QA)
- `docs/minifix-dowel-regression-test-plan.md`

Use this for:
- post-change validation
- regression checking after sync/merge/worktree copy
- QA sign-off checklist
- verifying long-side/short-side pattern behavior (`A > 400`, `B < 400`)

### 4) North-Star Contract Summary
- `docs/minifix-dowel-north-star-contract-summary.md`

Use this for:
- product/engineering alignment
- contract/requirement summary
- high-level acceptance gates

## Suggested Usage Flow

1. Read the North-Star summary first  
2. Use the baseline spec for implementation details  
3. Run the regression test plan after changes  
4. Use the Thai version for team communication and handoff

## Important Notes

- `localhost` and `127.0.0.1` use different localStorage namespaces
- worktree/port mismatch is a common source of false debugging conclusions
- always hard refresh (`Ctrl+F5`) after Minifix/overlay/transform changes
