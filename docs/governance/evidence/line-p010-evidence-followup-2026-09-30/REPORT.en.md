# P0-10 evidence follow-up — delivery report

30 September 2026. Base `3bdd6f3e5217f3252292cd11c858be151c01f977`. Phase A remains `EVIDENCE_INCOMPLETE`.

## Delivered changes

E1: check/assemble require stderr to exist, match its suite name and recorded SHA256. Missing, deleted, replaced or misnamed files fail; empty stderr and expected negative-test SQL errors remain valid.

E2: the new local replica supplies base SHA, ref, one run ID, 193 applied migrations and the digest of a tested-source manifest. The summary reports provenanceComplete=true with no missing fields. This describes field completeness, not independently authenticated execution. The base SHA plus source digest identifies the uncommitted tested patch.

E3: fullPgTapPass and verdictScope=pgtap-only make the outcome scope explicit. workflowPass=null means unevaluated. pass/fullPass are retained as compatibility aliases of the full pgTAP verdict. No successful workflow result is inferred.

Only the validator and its unit tests change executable product source. Migration 0198, SQL suites and workflow are unchanged. PRD is 1.11. A separate bilingual integration/B12 packet proposes decisions without implementing 0199, changing grants or resolving manufacturing conflicts.

## Test evidence

| Check | Result |
| --- | --- |
| Tests-first RED, old implementation | 22 pass / 11 fail; 33 executed |
| GREEN validator | 33/33; no skip |
| New temporary stack migrations | 193/193 from zero |
| Fail-closed SQL | 28/28 |
| Existing LINE suites | 107/107 and 133/133 |
| Python twelve files | 72/72; no fail/skip |
| Claim race | 10+10; zero overlap |
| Full pgTAP | Twelve suites executed; eleven pass; containment 6/8 exit 3 |
| Local replica | Exit 1, preserving full failure; evidence verifier exit 0 |
| Cleanup | No owned containers/network/CI directory left; no cron execution |

The missing 12-argument factory function remains the sole recorded full-suite failure. No filtered pass substitutes for it. GitHub Actions and production have not been tested here.

## Review and provenance limits

Opus 5.5 authored the two-file patch from a scanned three-source-file packet with tools disabled. Codex ran RED/GREEN and the temporary stack, prepared documentation and commit controls. A separate Codex agent reviewed both the prior commit and new diff with no new blockers; it did not rerun a database or provide cross-vendor acceptance. REVIEW-NOTES.txt records its report.

Source copies for the changed files were taken before tests. The complete source manifest was generated after direct tests and scratch copying; its rows are checked against Git by the final gate. This relies on source stability under a single writer and is not proof against a transient concurrent rewrite. Old evidence is immutable.

The unchanged Actions workflow does not yet provide testedSourceSha256, so future Actions will honestly report incomplete provenance. This follow-up repairs the local run and exposes missing fields; it does not claim every possible runner supplies them. Credential scanning is pattern-based with positive controls, not a guarantee of detecting every format.

## Decisions ready for the owner

The integration/B12 packet identifies the 0170-after-0191 grant recreation risk, an unresolved invalid ref, external RPC-caller uncertainty and the authenticated rpc_record_line_send_result boundary. It proposes tests and retained paths. A manufacturing/integration owner must be named; tenant and overlapping-work decisions remain open. No migration number or role matrix is silently approved.

Independent acceptance, separate containment integration and actual green CI after authorized push remain outstanding. B12/0199, default ACL policy, production catalog and real LINE G-C1 testing remain separate. No push, deploy, real message or shared/production access occurred.
