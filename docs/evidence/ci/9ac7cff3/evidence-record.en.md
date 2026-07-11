# CI Evidence Record — 9ac7cff3

Recorded: 2026-07-11  
Status: **E0 CI PASS — scope-limited**  
Commit: `9ac7cff39d02d9430879275645e377728bc0abc5`  
Evidence-classification authority: Tech Lead decision in CT-DEC-001

> This record proves only the scope actually executed by the workflow. It is not evidence of deployment, operational readiness, production readiness, or P0 closure.

## 1. Primary main run

| Item | Value |
| --- | --- |
| Workflow | `verify-full` |
| Run | `29142280872` — https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/29142280872 |
| Ref | `refs/heads/main` |
| Environment | `ubuntu-latest / node v22.23.1` |
| Test result | **4,553/4,553 passed**, 0 failed, 1,762 suites |
| Successful steps | checkout, install, full typecheck, automated tests, build, evidence manifest, artifact upload |
| Artifact | ID `8245562223`; 90-day retention; expires `2026-10-09T06:06:13Z` |
| Artifact ZIP SHA-256 | `6fb49466fee477b54f05c8e1d2470cacc6c83cba91e889700cc1cdde7f6886fd` |

The adjacent `verify-evidence.json` is the workflow-produced payload for the main run. `artifact.sha256` preserves the GitHub-reported archive digests for both main and branch so they remain referable after the 90-day artifacts expire.

## 2. Corroborating branch run

| Item | Value |
| --- | --- |
| Run | `29142279488` — https://github.com/indetailsgroup-hue/monolith-workspace/actions/runs/29142279488 |
| Ref | `refs/heads/fix/drillmap-bolt-and-brun-dowels` |
| Commit | Same full SHA as main: `9ac7cff39d02d9430879275645e377728bc0abc5` |
| Artifact | ID `8245562538`; 90-day retention; expires `2026-10-09T06:06:10Z` |
| Artifact ZIP SHA-256 | `d777e9a10c716665e8083ce1b5cd5c082ebcdc72afa843809d4501112c0efa78` |

## 3. Exclusion list that must always accompany this claim

1. Two invariants in `tools/vault-builder/src/pipeline.test.ts` return before assertion on CI when development-only `_daph_extract` data is absent; their evidence remains local-only even though the runner counts those test cases as passed.
2. The DB/psql test line (`AB-DB-01`) is not part of this workflow.
3. End-to-end tests are not part of this workflow.
4. This E0 set does not prove deployment, operational readiness, production readiness, P0 closure, or authorization to cut real workpieces.

## 4. Provenance and durability

- `verify-evidence.json`: evidence payload binding commit, environment, time, and test result
- `run-register.json`: register preserving run/artifact IDs, URLs, digests, creation dates, and expiry dates
- `artifact.sha256`: lowercase SHA-256 digests for artifact archives as reported by GitHub metadata; the ZIP files themselves are not stored in the repository
- `evidence-record.sha256`: manifest for this durable record set, calculated over LF UTF-8 bytes with lowercase hex
- The Git commit makes this record pinned/frozen and tamper-evident, but the commit is unsigned and therefore is not called immutable
