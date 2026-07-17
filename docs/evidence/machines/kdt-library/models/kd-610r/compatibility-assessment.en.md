# Compatibility Assessment — KDT KD-610R

> `assessment: MCA-KD-610R@0.1` · `profile: kdt.six_sided_drill.kd_610r@0.1-research-draft` · `contract: DELIVERY-KD-610R@0.1-draft`
> [TH edition / ฉบับภาษาไทย](compatibility-assessment.th.md)

> **Manufacturing release: PROHIBITED** — Assessment status: `NOT_ASSESSED`

**MANUFACTURING RELEASE: PROHIBITED** — assessment status is `NOT_ASSESSED`. Every value in this library is drawn from public documents only (**Verified in documents**), never from operation of a physical machine. No job may be released to manufacturing until every onsite verification gate below is passed.

## A. Assessment status

- Assessment status: **NOT_ASSESSED**
- Manufacturing release: **PROHIBITED**

## B. Scope of this assessment

This is a **document-only capability check**. It compares public catalog evidence against MONOLITH platform expectations and lists unresolved conflicts and blockers. It performs **no** operational verification and confers **no** manufacturing authority.

## C. Geometry / workpiece envelope validation rules

- Validate panel length/width/thickness against the model's documented envelope before any drilling.
- Confirm hole coordinates fall inside the reachable drilling zone on all six sides.
- Reject jobs whose panel dimensions exceed any documented min/max in the envelope field.

## D. Controller / format / tool / origin / physical delivery

These are **instance-level** and remain **Unknown** unless exact-model evidence exists. See the Controller Profile and Delivery Contract in the machine profile.

## E. Unresolved conflicts and blockers

**Conflict:** KD-610R vs KD-610RH near-identical (same 15.7kW/4115x2250x2210). Regional drill-count/speed conflicts: Greece 10V+8H upper & feed 100/90/50; Europe 12V+8H+1mill & feed 140.

**Documented evidence gaps:**
- `native_import_formats`

## F. Required validation sequence

1. **Immutable known-good job** — Start from a job the machine already runs correctly; keep the original file immutable.
2. **Parser / import validation** — Validate the job parses and imports on the machine’s own controller/import dialog.
3. **Simulation (where applicable)** — Run controller or CAM simulation where the machine/software supports it.
4. **Dry-run / air-cut or safe equivalent** — Execute a dry-run, air-cut, or the safe family equivalent before any material is cut.
5. **First-article inspection** — Measure the first physical article against the design tolerances.
6. **Human acceptance** — A qualified human explicitly accepts the result. No automatic machine release.

## G. Interoperability & Validation boundary

OCCT / PythonOCC are used for **Interoperability & Validation only** and never as **Manufacturing Authority**. Original files are **immutable**; any conversion or geometry healing produces a **Versioned Derived Artifact** that itself requires human acceptance. There is **no automatic machine release**.

## H. Daph pilot-instance note

Daph’s physical machine of this model is a **pilot-instance-relevant** deployment. It is nonetheless **NOT_ASSESSED** and manufacturing release is **PROHIBITED**. No operational verification is claimed from public evidence.

---
MONOLITH · KDT Machine Intelligence Library — research draft, as of 2026-07-17. Public catalog values are **Verified in documents**, never Observed in operation. This document confers no manufacturing authority.