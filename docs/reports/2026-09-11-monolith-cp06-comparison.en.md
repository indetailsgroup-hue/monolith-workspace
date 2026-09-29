# MONOLITH, CP06 and FieldFlow comparison

Publication note: This is a dated evidence snapshot, not a new runtime or CI audit. Local artifact references are not included in this publication. SC-01–SC-18 are roadmap workstream IDs, distinct from Steering Committee resolutions.

Review date: 11 September 2026 · EN · Advisory review

## Verdict
These are distinct codebases and scopes, not three versions of one application:
- **monolith-workspace:** cabinet design/manufacturing/CNC plus organizational/business modules.
- **cp06-clean-cowork:** Thai Curry Cloud Kitchen — ingredients, recipes, costing, kitchen operations and AI control plane.
- **FieldFlow artifact:** separate incomplete Expo mobile package for field/installation work.

Neither main tree contains the fieldflow-mobile or sprint1–3-dod paths from the artifact. This does not exclude renamed/copied code; exhaustive semantic comparison and all-branch discovery were not performed.

## Revisions and scope
| Repository | Examined main | Inventory |
|---|---|---|
| monolith-workspace | 52e0eeb12527d4bb3866ee726b4f30d4d74dca57 | 4,137 blob files; untruncated tree |
| cp06-clean-cowork | b659916b00fb7fe0ae3a0b38ab4594c919baf62b | 1,622 blob files; 144 SQL migration source files; untruncated tree |

CP06 HEAD merges PR #2 for API-role grants, CI and Actions checklist. MONOLITH HEAD matches the September 10 report. Parent and nested local Git status were checked separately; pre-existing changes remain. Older local HEADs were not substituted for GitHub main. CONTEXT and scope correction were read earlier in this continuous review.

## MONOLITH: implemented and outstanding
**Implementation exists:** Designer/cabinets/3D, drawers/hinges/connectors, curves/kerf/DXF, workflow/LINE, packets/CNC/verifier, field app, digital shadow, accounting/eTax and People/Training/OrgChart/QC/Leadership modules. [Routes](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/routes/index.tsx)

**Outstanding:**
- [Full Verify](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950518) and [Lint](https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/34459950559) remain failure. Previously inspected logs at this same SHA show 2,237 warnings against a 2,235 ceiling.
- Root tests were skipped in Full Verify; separate E2E Smoke and pgTAP workflows succeeded.
- Billing-report failure remains undiagnosed.
- [shadowMode](https://github.com/indetailsgroup-hue/monolith-workspace/blob/52e0eeb12527d4bb3866ee726b4f30d4d74dca57/src/core/config/shadowMode.ts) remains true; Designer packets are not authorized for real cutting.
- Org Health PERFORMANCE placeholder and live AI/integration acceptance remain as previously reported.
- Five open dependency PRs: #72/#71/#69/#64/#63.

Detailed prior report: [TH](2026-09-10-monolith-work-status.th.html) / [EN](2026-09-10-monolith-work-status.en.html).

## CP06: implemented work
| Work | Evidence | Supported conclusion |
|---|---|---|
| Dashboard/ingredients/menu/recipes/purchasing/stock/sales/expenses/reports | README, AppContent and data-table wiring | UI/data workflows exist; README describes local-first state/seed foundation |
| Master Sauce/AI SOP/Lab Analysis | Lazy tabs called from renderSpecialTabContent | Runtime entries exist; released sources require Supabase configuration/active projections |
| AI Control Plane | start/queue/complete/review/promote RPC adapter | Real adapter exists; not proof of autonomous operation or production acceptance for every agent |
| Supplier/Digital Labels/Environmental/CAPA | Tabs, backend/tests and Phase-2B migrations | Read/write lanes implemented; not every complete lifecycle |
| Enterprise Structure/Security Federation | App imports/screens and feature folders | Source implementation; full acceptance unverified |
| Costing/Channel Profitability/Forecasting/Predictive Ordering | Feature directories, tests/components/hooks | Source presence, not production certification |
| Pilot tooling | Auth/runtime/control-plane summaries, packet and approval ledger | Historical evidence/signoff records exist |

Sources: [Tab wiring](https://github.com/indetailsgroup-hue/cp06-clean-cowork/blob/b659916b00fb7fe0ae3a0b38ab4594c919baf62b/src/components/layout/app-content/renderSpecialTabContent.tsx), [Control-plane adapter](https://github.com/indetailsgroup-hue/cp06-clean-cowork/blob/b659916b00fb7fe0ae3a0b38ab4594c919baf62b/src/data/agentControlPlaneBackend.ts), [Coverage](https://github.com/indetailsgroup-hue/cp06-clean-cowork/blob/b659916b00fb7fe0ae3a0b38ab4594c919baf62b/docs/FRANCHISE_EXECUTION_PHASE2B_COVERAGE_TH.md), [README](https://github.com/indetailsgroup-hue/cp06-clean-cowork/blob/b659916b00fb7fe0ae3a0b38ab4594c919baf62b/README.md).

## CP06: incomplete and deliberately deferred
According to coverage/cut-list documents at this SHA; every deferred feature was not traced end-to-end:
- Vendor master create/edit, branch-wide browsing and automatic source-lot/vendor linking.
- CAPA automatic owner roster, SLA timers/escalation and full aging/analytics.
- Training-module authoring/write path.
- Full consumer/branch digital-label presentation.
- Origin-claim writes and multi-market label policies.
- AIQC/computer-vision verification events, waste events and model auto-blocking remain backlog/outside pilot.
- Full sensory relational/calibration scope is deferred with a manual bridge.

[Backlog/pilot scope](https://github.com/indetailsgroup-hue/cp06-clean-cowork/blob/b659916b00fb7fe0ae3a0b38ab4594c919baf62b/docs/FRANCHISE_EXECUTION_PHASE2B_BACKLOG_CUT_LIST_TH.md). Deferred scope is not automatically a defect or permission to reopen it.

## CP06: historical passing evidence exists
The [pilot packet](https://github.com/indetailsgroup-hue/cp06-clean-cowork/blob/b659916b00fb7fe0ae3a0b38ab4594c919baf62b/artifacts/pilot-rollout-packet.json), generated 14 April 2026, records readyForReview=true, readyForGoNoGo=true and four of four required approvals. Control-plane/runtime smoke summaries record passed on the same date.

This establishes stored pilot evidence/signoffs, not that no pilot work occurred. It does not establish applicability to main b659916b and the live environment on September 11. Test counts in the unblock checklist are historical reported local results, not rerun results.

## CP06: current CI evidence does not certify green product gates
The API returned 78/78 runs associated with this HEAD:
- Successful Dependabot and Stale/Triage runs exist.
- No Enterprise Modules CI, Control Plane or Pilot test-run success was found in this set.
- Push run [27497840288](https://github.com/indetailsgroup-hue/cp06-clean-cowork/actions/runs/27497840288), dated June 14, reports startup_failure.
- The [unblock checklist](https://github.com/indetailsgroup-hue/cp06-clean-cowork/blob/b659916b00fb7fe0ae3a0b38ab4594c919baf62b/docs/CI_GITHUB_ACTIONS_UNBLOCK_CHECKLIST.md) says all workflows fail at startup and the repository is private. Those statements are stale: it is currently public and some workflows succeed.
- Enterprise workflow has blocking lint/unit and channel-profitability DB jobs; the all-module DB canary uses continue-on-error and needs separate assessment.
- Three open PRs: #11 development dependencies, #10 production dependencies, #5 GitHub Actions.

No current billing/YAML cause is asserted without supporting evidence.

## Highest-value next work
1. MONOLITH: reduce warnings above the ceiling and complete required CI; retain real-cut authority/field gates.
2. CP06: execute Enterprise Modules CI at the pinned HEAD with its required environment and retain fresh test/DB results.
3. CP06: regenerate revision/environment-bound pilot evidence; owners should assess historical signoff applicability rather than copying approvals.
4. FieldFlow: repair package/photo/auth/storage gaps separately before deciding on MONOLITH integration. CP06 is not established as its backend.

## Verification / STOP
audit-by-inspection; GitHub API snapshot verified; NOT independently re-verified at runtime. Governance memory anchor was not found in the searched .claude scope: may-be-stale applies to static governance context only. No older governance snapshot was used to close a current lane.
STOP: Review/report only; no source, approvals, canonical state, migrations, visibility, CI settings or deployment changed.

