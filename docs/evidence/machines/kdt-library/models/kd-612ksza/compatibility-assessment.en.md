# Compatibility Assessment — KDT KD-612KSZA

> `assessment: MCA-KD-612KSZA@0.1` · `profile: kdt.drilling.kd_612ksza@0.1-research-draft` · `contract: DELIVERY-KD-612KSZA@0.1-draft`
> [TH edition / ฉบับภาษาไทย](compatibility-assessment.th.md)

> **Manufacturing release: PROHIBITED** — Assessment status: `NOT_ASSESSED`

**MANUFACTURING RELEASE: PROHIBITED** — assessment status is `NOT_ASSESSED`. Every value in this library is drawn from public documents only (**Verified in documents**), never from operation of a physical machine. No job may be released to manufacturing until every onsite verification gate below is passed.

## A. Assessment status

- Assessment status: **NOT_ASSESSED**
- Manufacturing release: **PROHIBITED**

## B. Scope of this assessment

This is a **document-only capability check**. It compares public catalog evidence against MONOLITH platform expectations and lists unresolved conflicts and blockers. It performs **no** operational verification and confers **no** manufacturing authority.

## C. Geometry / workpiece envelope validation rules

- Validate workpiece dimensions against documented boring/through-feed limits.
- Confirm bore positions lie within the machine's documented working range.
- Reject jobs exceeding documented capacity.

## D. Controller / format / tool / origin / physical delivery

These are **instance-level** and remain **Unknown** unless exact-model evidence exists. See the Controller Profile and Delivery Contract in the machine profile.

## E. Unresolved conflicts and blockers

**Conflict:** KDT-official exhibition page 148 is image-only (no OCR-legible table). Closest documented sibling is KD-612KSZ (Leda quotation PDF): Top 26V+12H, Bottom 9V; spindle Top 5.5kW/Bottom 3.5kW; 140/90/50 m/min; overall 6040x3134x2190; total 28.22kW; 5 ATC types. KSZA specifics remain Unknown.

**Documented evidence gaps:**
- `capacities`
- `controller_hmi`
- `native_import_formats`
- `footprint_power_weight`

## F. Required validation sequence

1. **Immutable known-good job** — Start from a job the machine already runs correctly; keep the original file immutable.
2. **Parser / import validation** — Validate the job parses and imports on the machine’s own controller/import dialog.
3. **Simulation (where applicable)** — Run controller or CAM simulation where the machine/software supports it.
4. **Dry-run / air-cut or safe equivalent** — Execute a dry-run, air-cut, or the safe family equivalent before any material is cut.
5. **First-article inspection** — Measure the first physical article against the design tolerances.
6. **Human acceptance** — A qualified human explicitly accepts the result. No automatic machine release.

## G. Interoperability & Validation boundary

OCCT / PythonOCC are used for **Interoperability & Validation only** and never as **Manufacturing Authority**. Original files are **immutable**; any conversion or geometry healing produces a **Versioned Derived Artifact** that itself requires human acceptance. There is **no automatic machine release**.

---
MONOLITH · KDT Machine Intelligence Library — research draft, as of 2026-07-17. Public catalog values are **Verified in documents**, never Observed in operation. This document confers no manufacturing authority.