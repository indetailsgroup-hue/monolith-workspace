# KDT Machine Intelligence Library — Executive Report

> As of 2026-07-17 · MONOLITH manufacturing platform · research draft

## 1. Purpose and scope

This library consolidates source-grounded technical intelligence for **83 KDT woodworking machines and line/cell items** into a bilingual (TH/EN) catalog for the MONOLITH manufacturing platform. Each item carries a machine profile and a compatibility assessment. Every technical value is **Verified in documents** only — drawn from public catalog, exhibition, or authorized-distributor pages — and never **Observed in operation**.

## 2. Safety posture (non-negotiable)

- Every model defaults to `assessment_state = NOT_ASSESSED` and `manufacturing_release = PROHIBITED`.
- No document in this library constitutes manufacturing approval or operational verification.
- Machine-instance facts — controller hardware/firmware, HMI/OS version, physical delivery path, tool table, coordinate origin, and known-good job — remain **Unknown** until onsite evidence exists. They are never inferred from a sibling model or family manual.
- OCCT / PythonOCC are **Interoperability & Validation only**, never Manufacturing Authority. Original files are immutable; conversions/healing produce Versioned Derived Artifacts requiring human acceptance.
- No secrets (IP, hostname, credentials, license keys) or real physical paths appear anywhere.

## 3. Coverage summary

Per-model source coverage = populated, source-cited technical field-groups / 7 (high = 6–7, medium = 3–5, low = 0–2). Coverage measures evidence availability, not consistency, operational validation, or manufacturing approval.

| Tier | Count |
|---|---|
| Total items | 83 |
| High source coverage (6–7/7 field groups) | 9 |
| Medium source coverage (3–5/7 field groups) | 61 |
| Low source coverage (0–2/7 field groups) | 13 |
| Source-access blocked flag (overlaps the three tiers above) | 9 |

## 4. Coverage by family

| Family | Total | High | Medium | Low |
|---|---|---|---|---|
| Six-sided drilling | 10 | 1 | 9 | 0 |
| Drilling Tech | 8 | 1 | 7 | 0 |
| Nesting Tech | 12 | 5 | 7 | 0 |
| Saw Tech | 9 | 2 | 6 | 1 |
| Banding Machine (Edge Bander) | 25 | 0 | 24 | 1 |
| Automation | 10 | 0 | 6 | 4 |
| Project Planning (Lines/Cells) | 9 | 0 | 2 | 7 |

## 5. High-source-coverage models

[KD-610R](models/kd-610r/machine-profile.en.html), [KD-612G](models/kd-612g/machine-profile.en.html), [KN-2409NL](models/kn-2409nl/machine-profile.en.html), [KN-2409LP](models/kn-2409lp/machine-profile.en.html), [KN-2710L](models/kn-2710l/machine-profile.en.html), [KN-3710D](models/kn-3710d/machine-profile.en.html), [KN-5516P](models/kn-5516p/machine-profile.en.html), [KS-4522HLS](models/ks-4522hls/machine-profile.en.html), [KS-832H](models/ks-832h/machine-profile.en.html).

## 6. Daph pilot instances

Two models are Daph pilot-instance relevant: **KD-610R** (six-sided drilling) and **KN-2409LP** (nesting). Both are marked pilot-instance relevant but remain **NOT_ASSESSED** with manufacturing release **PROHIBITED**. No operational verification is claimed from public evidence. See [KD-610R profile](models/kd-610r/machine-profile.en.html), [KD-610R assessment](models/kd-610r/compatibility-assessment.en.html), [KN-2409LP profile](models/kn-2409lp/machine-profile.en.html), [KN-2409LP assessment](models/kn-2409lp/compatibility-assessment.en.html).

## 7. Source-access-blocked items (overlapping flag)

This is an overlapping evidence flag, not a fourth coverage tier. The following items have image-only or blocked sources; some may still have high or medium coverage from other sources: `Batched Drill Center with servo feeding`, `KD-612KSZA`, `KE-208`, `KE-526GHTC4`, `KS-4522HLS`, `KS-543HLS`, `KS-832H`, `KS-833DP`, `The Column-mounted Four-axis Robot`.

## 8. How to use this library

- Start at the [catalog dashboard](index.html): search by model/alias, filter by family, catalog status, evidence tier, and Daph-critical.
- Open a model's **machine profile** for identity, the 7 technical field groups with source links, documented conflicts, controller profile, delivery contract, coverage score, and the required machine-side evidence checklist.
- Open a model's **compatibility assessment** for the NOT_ASSESSED / PROHIBITED status, document-only scope, geometry/envelope rules, blockers, and the required onsite validation sequence.
- See the [evidence-gap register](evidence-gap-register.en.html) for the per-model gap ledger.

---
MONOLITH · KDT Machine Intelligence Library · as of 2026-07-17. Values are Verified in documents only. This report confers no manufacturing authority.