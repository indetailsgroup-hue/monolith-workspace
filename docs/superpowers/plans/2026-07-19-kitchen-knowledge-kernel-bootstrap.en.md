# MONOLITH Kitchen Knowledge Kernel Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` only when the owner explicitly authorizes subagents; otherwise use `executing-plans` task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Bootstrap a governed MONOLITH monorepo, codify ADR-001/003/005 and corrected ADR-002, create an auditable 19-spec Component Master seed, and deliver an executive-grade bilingual gap report without overstating production readiness.

**Estimated tasks:** 8 | **Estimated time:** ~240–360 min | **Touches:** Git / governance docs / Python package / JSONL data / tests / research evidence

## Current Problem / Current Solution

The workspace is not a Git repository. The kitchen corpus exists as loose HTML, Markdown, and Python files under `All aboute kitchen/`. ADR-002 is Proposed and relies on tenant policy before ADR-001 exists. It incorrectly grants Daph, a pilot tenant, platform-level decision authority. The current test harness expects `data/specs.jsonl` and `data/skus.jsonl`, but neither file exists: a fresh direct run produces 3 passes and 7 failures. Book 11 defines exactly 15 connector specs and explicitly defers hinges and drawer runners. The encyclopedia heading says “12 bounded contexts” while its table enumerates 14, and ADR-002 separately requires Component Master ownership.

The corpus is broad but materially under-specified in tenancy, finish appearance measurement, current ISO hardware standards, data governance, field commissioning, traceability, interoperability, and operational evidence. Perplexity research is treated as discovery, not authority; material facts must be re-verified against primary sources.

## Proposed Approach

Create a minimal monorepo with one folder per bounded context and a dedicated Component Master package. Preserve original source artifacts as evidence; copy rather than silently rewrite them. Record the approved tenant, finish, and boring decisions in bilingual ADR editions and standalone HTML. Seed 15 Book 11 connector specs plus two hinge and two drawer-runner specs (19 total), with supplier SKUs, provenance, boring profiles, and validation tests. Publish `MON-BS-001` as an internal, versioned interoperability profile—not an ISO/EN claim. Produce a decision-grade gap report that separates verified facts, owner decisions, proposals, unknowns, and contradictions.

## Side by Side

| Scenario | Before | After |
| --- | --- | --- |
| Repository authority | Loose files; no Git revision | Git repository with context map, ADRs, packages, tests, and traceable revisions |
| Tenant policy | Un-governed dictionaries in reference code | ADR-001 Bridge boundary and tenant contract owned by MONOLITH governance |
| Finish identity | Supplier codes with no canonical appearance model | MONOLITH canonical taxonomy plus lossless supplier-native mappings |
| Boring geometry | De facto constants presented without governing profile | Versioned `MON-BS-001` core and named supplier/machine variants |
| Component seed | Missing JSONL; 7/10 tests fail | 19 valid specs with referentially valid SKUs and all tests green |
| Standards | EN-centric and partly stale | Current ISO status recorded, including ISO 4769:2022, ISO 12808:2024, ISO 25131:2025, and withdrawn ISO 7171:2019 |
| Readiness claim | Documentation can be mistaken for runtime | Explicit evidence classes and no production/ratification claim without gates |

## Assumptions & Risks

- **Assumed:** The workspace copy and Downloads copy of the encyclopedia are identical; SHA-256 was verified as `561C0F6E7D5A0486913F476B46587A3F1A92B9F677C8E9201F36681A23719728`.
- **Assumed:** The approved ADR-001 decisions in the grill are authoritative owner decisions but not yet runtime facts.
- **Assumed:** The canonical context map contains the 14 contexts enumerated by the encyclopedia plus Component Master as a separate fifteenth context required by ADR-002.
- **Assumed:** The first release remains a reference kernel; it does not implement a production database, authentication provider, KMS, billing, or hosted deployment.
- **Risk:** Supplier technical documents may change or restrict reuse; retain native codes and URLs but do not copy protected catalog artwork or claim licensing rights.
- **Risk:** Digital finish values cannot prove physical substitutability; physical master samples and measured tolerances remain mandatory.
- **Risk:** System 32 variants can share a 32 mm pitch but differ in exact fixing geometry; never collapse supplier variants into a false universal pattern.
- **Risk:** Git initialization captures existing user files as untracked; stage or commit only when separately requested.

## Impact

- Establishes platform authority independently of Daph or any other tenant.
- Turns Book 11 and Book 12 statements into testable data contracts.
- Creates a safe base for later database, CAD/CAM, procurement, and field-service implementation.
- Gives executives a severity-ranked, source-backed investment and sequencing view.

---

## Task Overview

> **For implementation tasks:** REQUIRED SUB-SKILL: Use `test-driven-development` before editing production code. Each behavior task is a RED → GREEN → REFACTOR slice.
> **Parallel-first design:** Independent lanes are identified, but this session executes sequentially unless the owner explicitly authorizes subagents. Never parallelize shared ADRs, seed fixtures, generated HTML, or Git initialization.

1. **Repository and context bootstrap** — Lane A | Can run together: none | Must wait for: none | TDD slice: docs/config-only verification → Git/context skeleton → inventory checks
2. **Governance ADR set** — Lane B | Can run together: Task 7 after Task 1 | Must wait for: Task 1 | TDD slice: docs-only decision checklist → bilingual ADRs → rendered parity checks
3. **Component Master package baseline** — Lane C | Can run together: none | Must wait for: Task 1 | TDD slice: failing import/path tests → copied package → targeted tests
4. **Nineteen-spec seed and supplier SKUs** — Lane C | Can run together: none | Must wait for: Task 3 | TDD slice: missing/count/FK failures → JSONL seed → catalog tests
5. **Finish taxonomy and `MON-BS-001` profiles** — Lane C | Can run together: Task 7 only | Must wait for: Tasks 2 and 4 | TDD slice: missing mapping/profile behavior → schemas and validators → conformance tests
6. **Tenant-boundary executable contracts** — Lane D | Can run together: Task 7 | Must wait for: Tasks 1 and 2 | TDD slice: failing policy-contract tests → machine-readable contract fixtures → isolation matrix checks
7. **Executive multidimensional gap report** — Lane B | Can run together: Tasks 3 or 6 | Must wait for: Task 1 | TDD slice: docs-only evidence ledger → TH/EN reports → citation/render checks
8. **Integrated verification and implementation report** — Sequential | Can run together: none | Must wait for: Tasks 2–7 | TDD slice: full failing evidence inventory → repairs only → clean verification report

---

### Task 1: Repository and Context Bootstrap

**Files:**

- Create: `.gitignore`
- Create: `pyproject.toml`
- Create: `CONTEXT.md`
- Create: `CONTEXT-MAP.md`
- Create: `apps/.gitkeep`
- Create: 15 named bounded-context folders; use `.gitkeep` for placeholders and keep `CONTEXT-MAP.md` canonical until a context exposes a real contract
- Create: `docs/adr/`, `docs/research/`, `docs/reports/`, `tests/`, and `data/component-master/`

**Parallelization:**

- Can run with: none
- Must wait for: none
- Race risk: Git initialization and shared root paths

- [x] **Step 0: Docs/config-only exception**

No production behavior exists yet. Verify exact target paths and absence of `.git` before writing.

- [x] **Step 1: Capture the pre-bootstrap inventory**

Run `rg --files` and record the source artifacts that will be preserved. Confirm the working directory is not already a repository.

- [x] **Step 2: Create the minimal skeleton**

Initialize Git, add root metadata, and create the 15 context folders: identity-tenancy, product-configuration, component-master, cad-parametric-design, geometry-kernel, bom-costing, manufacturing, workflow, procurement, quality-field-service, finance, customer-partner, ai-governance, platform-api, and security-observability.

- [x] **Step 3: Verify without staging user files**

Run `git status --short --branch`, verify every context appears exactly once in `CONTEXT-MAP.md`, and confirm no commit or push occurred.

### Task 2: Governance ADR Set

**Files:**

- Create: `docs/adr/ADR-001-tenant-boundary.en.md`, `.th.md`, `.en.html`, `.th.html`
- Create: `docs/adr/ADR-002-component-master-schema.en.md`, `.th.md`, `.en.html`, `.th.html`
- Create: `docs/adr/ADR-003-finish-library-ip.en.md`, `.th.md`, `.en.html`, `.th.html`
- Create: `docs/adr/ADR-005-boring-standard.en.md`, `.th.md`, `.en.html`, `.th.html`
- Preserve evidence source: `All aboute kitchen/adr-002-component-master-schema.md`

**Parallelization:**

- Can run with: Task 7 after the shared evidence ledger is stable
- Must wait for: Task 1
- Race risk: cross-ADR references and rendered HTML names

- [x] **Step 0: Docs-only exception**

These files codify approved decisions; validation is structural and evidence-based rather than a runtime unit test.

- [x] **Step 1: Write a failing decision checklist**

Check that no current ADR set contains Bridge isolation, global identity with tenant memberships, tenant-local customer profiles, break-glass access, 7/30/90 offboarding, RPO/RTO, runtime-role RLS red lines, tenant-specific keys, home regions, or separation of duties. Expected: missing.

- [x] **Step 2: Author aligned TH/EN editions**

Label status `Proposed`, distinguish owner decisions from implementation evidence, remove Daph as a ratifying authority, and include migration, rollback, security, acceptance, and supersession sections.

- [x] **Step 3: Render standalone HTML**

Use the existing standalone Markdown renderer; verify title, language attribute, headings, tables, and links.

- [x] **Step 4: Verify parity and authority**

Run targeted `rg` checks for every approved decision and confirm Daph appears only as a consulted pilot. Confirm all four language/format variants exist per ADR.

### Task 3: Component Master Package Baseline

**Files:**

- Create: `packages/component-master/pyproject.toml`
- Create: `packages/component-master/src/monolith_component_master/__init__.py`
- Create: `packages/component-master/src/monolith_component_master/catalog.py`
- Create: `packages/component-master/src/monolith_component_master/boring.py`
- Create: `packages/component-master/src/monolith_component_master/validators.py`
- Create: `tests/component_master/test_catalog_baseline.py`
- Copy from: `All aboute kitchen/hardware_catalog.py`, `boring_lookup.py`, and `validators.py`

**Parallelization:**

- Can run with: none
- Must wait for: Task 1
- Race risk: package imports and later shared fixtures

- [x] **Step 0: Load the TDD discipline**

Use `test-driven-development` before editing package code.

- [x] **Step 1: Write failing import and data-path tests**

Assert the package imports from the monorepo root and resolves seed paths relative to the package/repository contract rather than the caller’s current directory.

- [x] **Step 2: Run and confirm RED**

Use the bundled Python executable with `unittest`; failure must be missing package behavior, not missing third-party test dependencies.

- [x] **Step 3: Copy and minimally adapt the reference engine**

Preserve semantics, add no database abstraction, and change only imports/path handling needed for the package contract.

- [x] **Step 4: Run and confirm GREEN**

Run the same targeted test module and compile all package modules.

- [x] **Step 5: Refactor only after green**

Remove duplicate script-only wiring created by the copy while retaining the original evidence files unchanged.

### Task 4: Nineteen-Spec Seed and Supplier SKUs

**Files:**

- Create: `data/component-master/specs.jsonl`
- Create: `data/component-master/skus.jsonl`
- Create: `data/component-master/boring-profiles.jsonl`
- Create: `tests/component_master/test_seed_integrity.py`
- Modify: `packages/component-master/src/monolith_component_master/catalog.py`

**Parallelization:**

- Can run with: none
- Must wait for: Task 3
- Race risk: shared JSONL fixtures and catalog counts

- [x] **Step 0: Load the TDD discipline**

Use `test-driven-development` before creating production seed data.

- [x] **Step 1: Write failing seed-contract tests**

Assert exactly 19 unique specs: the 15 Book 11 connector IDs, two hinge IDs, and two drawer-runner IDs. Assert category counts, valid semantic versions, non-empty provenance, unique SKU IDs, and valid spec foreign keys.

- [x] **Step 2: Run and confirm RED**

Expected failure: seed files absent or count/category assertions unmet.

- [x] **Step 3: Create the minimum valid seed**

Use functional generic IDs; retain supplier trademarks only in SKU/model fields. Mark every record Proposed and each source `Verified`, `Reported`, or `Unknown` without upgrading evidence.

- [x] **Step 4: Run and confirm GREEN**

Run seed integrity, catalog resolution, substitution rejection, and boring lookup tests.

- [x] **Step 5: Refactor only after green**

Deduplicate repeated provenance fields only if tests remain green and the JSONL contract remains line-oriented and reviewable.

### Task 5: Finish Taxonomy and `MON-BS-001`

**Files:**

- Create: `packages/component-master/src/monolith_component_master/finishes.py`
- Create: `data/component-master/finish-taxonomy.jsonl`
- Create: `data/component-master/finish-mappings.jsonl`
- Create: `data/component-master/boring-standards/MON-BS-001.json`
- Create: `tests/component_master/test_finish_taxonomy.py`
- Create: `tests/component_master/test_boring_standard.py`

**Parallelization:**

- Can run with: Task 7
- Must wait for: Tasks 2 and 4
- Race risk: shared Component Master schema and ADR identifiers

- [x] **Step 0: Load the TDD discipline**

Use `test-driven-development` before implementing validators.

- [x] **Step 1: Write failing safety tests**

Reject finish equivalence based only on a name/image; require canonical attributes, supplier-native code, provenance, physical sample identity, measurement conditions, and approved tolerance. Reject boring programs with profile/version mismatches or unrecognized supplier variants.

- [x] **Step 2: Run and confirm RED**

Expected failure: validators and profile data do not yet exist.

- [x] **Step 3: Implement minimal taxonomy and profile behavior**

Store CIELAB/LCh values with illuminant/observer, ΔE method/tolerance, ISO 2813 gloss geometry, texture/grain/batch metadata, and rights/provenance. Define `MON-BS-001` core pitch/diameter/reference-line semantics plus named variants and explicit non-safety disclaimer.

- [x] **Step 4: Run and confirm GREEN**

Verify valid mappings pass, unsafe substitutions fail, 32 mm pitch is exact in generated coordinates, and project profile pinning prevents silent upgrades.

- [x] **Step 5: Refactor only after green**

Keep supplier mappings lossless and do not normalize away native finish codes.

### Task 6: Tenant-Boundary Executable Contracts

**Status:** Completed with contract-fixture evidence; no runtime-enforcement claim.

**Files:**

- Create: `packages/identity-tenancy/contracts/tenant-boundary.schema.json`
- Create: `packages/identity-tenancy/contracts/isolation-test-matrix.json`
- Create: `packages/identity-tenancy/README.md`
- Create: `tests/identity_tenancy/test_contracts.py`

**Parallelization:**

- Can run with: Task 7
- Must wait for: Tasks 1 and 2
- Race risk: ADR terminology and context ownership

- [x] **Step 0: Load the TDD discipline**

Use `test-driven-development`; this task validates contracts, not a fake production database.

- [x] **Step 1: Write failing contract tests**

Require Bridge mode, one active tenant per request, authenticated membership context, tenant-scoped storage/cache/job/event/webhook keys, break-glass metadata, home region, key identity, offboarding deadlines, RPO/RTO, and ratification roles.

- [x] **Step 2: Run and confirm RED**

Expected failure: contract fixtures absent.

- [x] **Step 3: Add machine-readable contracts and test matrix**

Represent the approved decisions without pretending RLS, KMS, or restore infrastructure exists. Include negative cases for tenant A attempting tenant B reads/writes/files/jobs.

- [x] **Step 4: Run and confirm GREEN**

Verify schema parsing and 100% coverage of the approved decision checklist.

- [x] **Step 5: Refactor only after green**

Keep runtime implementation explicitly out of scope and recorded as a later migration/application task.

### Task 7: Executive Multidimensional Gap Report

**Status:** Completed — aligned TH/EN reports rendered and structurally verified.

**Files:**

- Create: `docs/research/2026-07-19-kitchen-master-gap-analysis.en.md`, `.th.md`, `.en.html`, `.th.html`

**Parallelization:**

- Can run with: Tasks 3 or 6
- Must wait for: Task 1
- Race risk: shared citations and terminology with ADRs

- [x] **Step 0: Docs-only exception**

The report is an evidence synthesis. Its verification is citation, classification, parity, and render quality.

- [x] **Step 1: Build the evidence ledger**

Classify each claim as `VERIFIED FACT`, `OWNER DECISION`, `INFERENCE`, `PROPOSAL`, `UNKNOWN`, or `CONTRADICTED`. Record local path/line and primary web source. Treat Perplexity outputs as discovery unless independently verified.

- [x] **Step 2: Cover all requested dimensions**

Include product/module/catalog coverage, cabinet sizes/heights, hardware, finishes, boring, manufacturing, installation, MEP, safety, accessibility, procurement, quality, traceability, sustainability, BIM/PIM interoperability, service design, ethical retention, AI governance, tenancy, economics, organization, and ecosystem participants.

- [x] **Step 3: Prioritize findings**

Order B0/B1/B2/B3 findings, identify decisions, owners, dependencies, evidence gaps, acceptance criteria, and sequencing. Replace manipulative “cannot stop using” language with trustworthy indispensability, portability, accumulated verified value, and excellent service.

- [x] **Step 4: Render and verify**

Render both HTML files and confirm TH/EN heading topology, decision tables, citations, and risk labels align.

### Task 8: Integrated Verification and Implementation Report

**Status:** Completed — outsider review findings repaired; final evidence and aligned handoff published.

**Files:**

- Create: `docs/reports/2026-07-19-kitchen-kernel-bootstrap.en.md`, `.th.md`, `.en.html`, `.th.html`
- Create: `artifacts/verification/kitchen-kernel-bootstrap-summary.json`

**Parallelization:**

- Can run with: none
- Must wait for: Tasks 2–7
- Race risk: final counts and generated evidence

- [x] **Step 0: Load verification discipline**

Use `verification-before-completion` before any completion claim.

- [x] **Step 1: Run the full verification suite**

Run all `unittest` modules, package compilation, JSON/JSONL parsing, exact spec/category counts, ADR decision checks, bilingual file-pair checks, HTML standalone checks, `git status`, and secret scans.

- [x] **Step 2: Repair only demonstrated failures**

Do not broaden scope. Rerun the exact failed command after each repair.

- [x] **Step 3: Produce machine-readable evidence**

Write command identity, timestamp, exit code, pass/fail totals, examined paths, and residual limitations to the JSON summary.

- [x] **Step 4: Publish aligned implementation reports**

State what was created, what was merely proposed, which tests passed, what remains unimplemented, and why no production/ratification claim is made.

- [x] **Step 5: Final completion gate**

Confirm complete non-truncated output and cleanly distinguish repository initialization from commit/push status.
