# Machine Evidence — KDT KN-2409LP (documented level)

**Received:** 17 July 2026 · **Supplier:** owner (Dave)
**Source:** two owner-supplied deep-research documents, accepted as **owner-supplied documented evidence** under the owner's direct instruction ("use these"). Intake does not upgrade any value that has not been checked at the machine into a verified fact.

| File | Content | Self-declared status |
|---|---|---|
| `assessment.html` | Machine Capability Assessment + Delivery Contract baseline (`MCA-DAPH-KN2409LP-INITIAL@0.1`) | **`MANUFACTURING RELEASE: PROHIBITED` · `NOT_ASSESSED`** — published/typical values; no physical-machine verification |
| `machine-profile.html` | Owner-answered Machine Profile (`KDT-KN-2409LP-CTRL@0.3-draft`) | `machine_verification_pending` — each field carries provenance such as confirmed, documented, verify at machine, or unknown |

## Owner decision (17 July 2026) — CT-DEC-002 FO-5 context

> Use these documents now. Several machines must be added, so photographing every machine immediately is not practical. Continue the work, then have an engineer configure and verify each machine again while physically present before real work.

Recorded as ADR-070:

1. **Machine onboarding is documented-profile first.** A machine may enter the evidence catalog with field-level provenance without blocking shadow implementation.
2. **Engineer bench verification at the machine is mandatory before real work.** The assessment gates cover nameplate, versions, tool table, origin, import, transfer, known-good job, simulation, dry-run, first article, and human acceptance.
3. **There is no real-cut shortcut.** `manufacturing_release: PROHIBITED` remains until Gate E passes. CT-DEC-002 §11.6 independently requires a calibrated machine profile before disabling NFP/NO_CUT.

## Relationship to `kdt_mvp_v1`

- At documented level, the sources identify **KDT / NCstudio (Weihong) / native G-code `.nc`**. This supports the KDT-path direction but is not physical-machine confirmation.
- Nameplate suffix, controller card, NCstudio/WoodSystem versions, tool table, actual origin, and delivery channel remain unverified and belong to the engineer's bench session.
- Factory Owner approval covers the `kdt_mvp_v1` contract for shadow implementation. Physical activation remains **CONDITIONAL** and cannot authorize real work.

## Multi-machine pattern

Each future machine uses `docs/evidence/machines/<machine-id>/` with assessment, profile, bilingual intake record, and SHA-256 manifest. The two supplied HTML files remain preserved as exact source bytes.
