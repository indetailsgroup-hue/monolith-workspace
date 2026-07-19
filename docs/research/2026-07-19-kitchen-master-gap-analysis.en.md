# MONOLITH Kitchen Master Encyclopedia — Executive Multidimensional Gap Analysis

- **Edition:** English
- **Assessment date:** 2026-07-19
- **Primary local artifact:** `All aboute kitchen/MONOLITH-Kitchen-Master-Encyclopedia.html`
- **Artifact SHA-256:** `561C0F6E7D5A0486913F476B46587A3F1A92B9F677C8E9201F36681A23719728`
- **Decision audience:** MONOLITH Board, Platform Owner, Architecture, Security/Privacy, Manufacturing, Product Data, Legal/IP, and tenant leadership
- **Evidence rule:** Perplexity was used only for public-domain discovery. No Perplexity result is treated as authority unless independently matched to a primary source.

## 1. Executive decision

### Verdict

**Proceed with the governed knowledge-kernel programme, but do not market the encyclopedia as a complete product catalog, a manufacturing authority, a compliance system, or a production-ready multi-tenant platform.** It is a unusually broad research corpus and strategic vocabulary. It is not yet a controlled system of record.

The board should fund a conversion from “large document” to “versioned evidence graph + executable rules + operational proof.” The highest-value work is not another round of prose. It is closing the chain from source revision → canonical identity → tenant policy → configured design → BOM/SKU → machine/site instruction → inspection → installed asset → service event.

| Board question | Decision-grade answer |
| --- | --- |
| Is the corpus valuable? | **Yes.** It covers dimensions, construction, hardware, appliances/MEP, markets, parts, cut lists, connectors, visual language, and a platform blueprint at rare breadth. |
| Is it complete for every product, model, cabinet size, height, tool, installation, and jurisdiction? | **No; completeness is UNKNOWN and cannot be achieved by a static encyclopedia.** It requires licensed supplier feeds, current technical sheets, regional rules, evidence expiry, and accountable stewards. |
| Is manufacturing output safe to release? | **No.** `MON-BS-001` and supplier/machine variants are Proposed; no calibrated coupon, first article, machine qualification, or post-processor evidence exists. |
| Are multi-tenant boundaries resolved? | **Owner decisions are resolved in ADR-001 and contract fixtures. Runtime enforcement is not implemented.** |
| Can MONOLITH claim finish equivalence? | **No.** It can store supplier-native codes and candidate mappings. Physical substitution requires measured samples and approval. |
| What makes the platform loved and difficult to replace? | **Trustworthy indispensability:** portable data, verified accumulated evidence, first-time-right execution, transparent decisions, fast service, and an ecosystem that improves with use—never hostage data or dark patterns. |

### Readiness scorecard

Scores are an executive inference from available evidence, not certification.

| Dimension | Score / 5 | Interpretation |
| --- | ---: | --- |
| Knowledge breadth | 4.0 | Strong research coverage and vocabulary |
| Evidence currency and primary-source control | 1.8 | Many citations, but no global source register, expiry, rights, or systematic primary-source grading |
| Canonical product/module data | 1.5 | Rich prose; little executable model/variant coverage |
| Component Master | 2.0 | Two-layer ADR and first 19 specs exist; coverage and verified SKU depth remain below ratification gates |
| Finish science and library | 1.2 | Governance and safety contract exist; physical samples and measured supplier mappings do not |
| CAD/CAM/manufacturing authority | 1.0 | Reference engine only; no qualified machine/post-processor/physical output |
| Installation/commissioning/service traceability | 1.4 | Valuable concepts; no operational closed loop or installed-asset evidence |
| Multi-tenant governance | 2.5 | Decisions and fixtures are coherent; runtime identity/RLS/KMS/restore remain absent |
| Compliance and standards management | 1.5 | Broad names, but current-version drift and jurisdictional applicability are not governed |
| Executive launch readiness | 1.3 | Appropriate for governed foundation work, not a production claim |

## 2. Scope, method, and evidence classes

### Local corpus audit

The assessed HTML contains 15,151 lines, 1.41 MB, 215 `<h2>` headings, 549 `<h3>` headings, 186 tables, 1,559 table rows, and 1,855 external links. It contains 77 occurrences of “Proposed,” 16 of “Unknown,” and 91 of “Unverified.” These figures prove breadth and some evidence caution; they do not prove correctness, rights, currency, or operational coverage.

The corpus explicitly covers dimensions and ergonomics (local lines 1065–1839), hardware (2319 onward), appliance/MEP coordination (2636–2675), manufacturing (2676 onward), sustainability (2718 onward), market and brand research, parts/cut lists, IFC mapping (9200 onward), connector depth, and a Component Master proposal.

### Evidence labels

| Label | Meaning |
| --- | --- |
| `VERIFIED FACT` | Reproduced locally or supported by a current primary source |
| `OWNER DECISION` | Explicitly confirmed by the MONOLITH owner; still not runtime proof |
| `INFERENCE` | Reasoned conclusion from stated facts; must not be presented as measured fact |
| `PROPOSAL` | Recommended target, control, KPI, or sequence |
| `UNKNOWN` | Evidence absent, expired, inaccessible, or not granular enough |
| `CONTRADICTED` | Current evidence conflicts with the corpus or another claim |

### Research handling

Public, generic Perplexity queries were useful for discovery. Some returned secondary sources or unsupported generalizations, especially around System 32 and finish standards. Those outputs were not promoted to evidence. Private project content was not sent when the research interface rejected it. Material claims below are re-anchored to ISO, W3C, NIST, GS1, EUR-Lex, PostgreSQL, OWASP, EPA, or current supplier sources.

## 3. Evidence ledger

| ID | Classification | Claim | Evidence / implication |
| --- | --- | --- | --- |
| E-01 | VERIFIED FACT | Workspace and Downloads encyclopedia copies are identical. | SHA-256 above; protects the review baseline. |
| E-02 | VERIFIED FACT | The corpus is broad: 215 H2 headings, 186 tables, and 1,855 external links. | Local structural audit; breadth is not assurance. |
| E-03 | CONTRADICTED | Architecture heading says 12 bounded contexts; its table contains 14. | Local lines 5269–5382. Component Master adds a fifteenth context in the new context map. |
| E-04 | OWNER DECISION | Bridge isolation, global identity + tenant membership, tenant-local customer profile, governance-only kernel, and break-glass support. | ADR-001 and tenant contract fixtures. Runtime is still UNKNOWN. |
| E-05 | OWNER DECISION | MONOLITH owns the canonical finish taxonomy while supplier-native codes remain lossless. | ADR-003; no physical equivalence is claimed. |
| E-06 | OWNER DECISION | Publish `MON-BS-001` now as an internal profile, never as ISO/EN/DIN. | ADR-005 and machine-readable profile. |
| E-07 | VERIFIED FACT | First seed contains exactly 15 Book 11 connector specs + 2 hinges + 2 drawer runners = 19 specs. | JSONL and automated integrity tests. All remain Proposed. |
| E-08 | UNKNOWN | Complete, current coverage of every supplier product/model/SKU. | No licensed supplier feeds, catalog completeness denominator, or lifecycle SLA exists. |
| E-09 | UNKNOWN | Connector load ratings. | Encyclopedia lines 13290 and 13433 state public data is absent for essentially all 15 connector specs. |
| E-10 | CONTRADICTED | Book 12 refers to “24 spec entries in this Book alone” while Book 11 defines 15 connector specs and the approved first expansion totals 19. | Local line 14724 versus lines 10920 and governed seed. Reconcile the book-to-data denominator. |
| E-11 | CONTRADICTED | The corpus treats ISO 23387:2020 as current context. | ISO 23387:2020 is withdrawn and replaced by [ISO 23387:2025](https://www.iso.org/standard/85391.html). |
| E-12 | VERIFIED FACT | Current IFC data schema publication is ISO 16739-1:2024. | [ISO 16739-1:2024](https://www.iso.org/standard/84123.html); update the local IFC section at line 9200. |
| E-13 | VERIFIED FACT | Current hardware performance standards include ISO 4769:2022, ISO 12808:2024, and ISO 25131:2025. | [hinges](https://www.iso.org/standard/80333.html), [extension elements](https://www.iso.org/standard/84112.html), [horizontal-axis hinges/stays](https://www.iso.org/standard/89083.html). They do not define universal drilling coordinates. |
| E-14 | VERIFIED FACT | ISO 7171:2019 is withdrawn and revised by ISO 7170:2021. | [ISO 7170:2021](https://www.iso.org/standard/76864.html). |
| E-15 | VERIFIED FACT | EU formaldehyde restriction for in-scope furniture and wood-based articles applies from 6 August 2026 at 0.062 mg/m³ under specified chamber conditions. | [Commission Regulation (EU) 2023/1464](https://eur-lex.europa.eu/eli/reg/2023/1464/oj/eng). This is an urgent market-pack issue, not a universal global threshold. |
| E-16 | VERIFIED FACT | ISO 16000-9:2024 provides a chamber method for VOC emissions from building products/furnishing, including formaldehyde from wood-based panels. | [ISO 16000-9:2024](https://www.iso.org/standard/79022.html). |
| E-17 | VERIFIED FACT | ISO 14025:2026 replaced the 2006 EPD edition in June 2026. | [ISO 14025:2026](https://www.iso.org/standard/87610.html); standards register needs near-real-time lifecycle monitoring. |
| E-18 | VERIFIED FACT | Blum publishes native finish code `NI` as Nickel; Häfele publishes “bright/nickel-plated” for item 262.26.531. | [Blum hinge range](https://www.blum.com/us/en/products/hingesystems/hinge-programme/), [Häfele item](https://www.hafele.com/us/en/product/26226531/26226531/). Names/codes still do not prove physical equivalence. |
| E-19 | PROPOSAL | The encyclopedia’s persona KPIs and roadmap are hypotheses, not baselines. | Local lines 5384 onward explicitly label them Proposed; require measured baselines and experiment owners. |
| E-20 | UNKNOWN | Production identity, RLS, KMS, regional storage, backup expiry, tenant restore, and break-glass operations. | Contracts exist; deployed evidence does not. |

## 4. What the encyclopedia already does well

| Strength | Executive value | Boundary |
| --- | --- | --- |
| Regional cabinet dimensions and ergonomics | Gives designers a comparative starting vocabulary | Tables are advisory, not executable jurisdiction/tenant rules |
| Construction systems and hardware vocabulary | Covers frameless/face-frame, boards, hinges, drawers, accessories | Supplier series, revision, tolerance, load, and lifecycle are inconsistent |
| Appliance, ventilation, plumbing, electrical overview | Exposes coordination dependencies early | Must never replace current OEM instructions or licensed MEP review |
| Parts, cut lists, nesting, machining vocabulary | Strong bridge from design language to manufacturing concepts | No qualified solver, machine, post-processor, coupon, or first article |
| Market and brand landscape | Useful for positioning, taxonomy, and supplier outreach | Brand facts and collections are time-sensitive and often secondary-source-derived |
| Connector depth | Book 11 correctly exposes missing load data, single-source risk, and machine lock-in | Only one category; insufficient for Component Master ratification |
| Evidence-state language | “Proposed/Unknown/Unverified” appears frequently | Labels are not normalized per claim and are not machine-enforced across the corpus |
| Persona thinking | Includes executives, finance, dealers, designers, installers, customers, CNC, quality, safety | Missing role ownership, baseline metrics, accessibility, service operations, and ethical-retention controls |

## 5. Multidimensional gap heatmap

| Dimension | Current state | Material gap | Required target artifact | Priority |
| --- | --- | --- | --- | --- |
| Product/collection/model coverage | Extensive narrative brand survey | No completeness denominator, supplier feed contract, revision SLA, market-effective dates, or rights ledger | Supplier Source Registry + Product/Model/Variant graph + freshness dashboard | B0 |
| Cabinet modules, sizes, heights | Rich base/tall/wall/accessibility tables | Not executable; nominal/finished/opening dimensions and tenant/jurisdiction applicability are mixed | Module Family schema + dimension rules + golden configurations | B0 |
| Component hardware | Two-layer decision and 19-spec seed | 19 Proposed specs, 20 SKU records, research-pending placeholders, missing loads/tolerances | ≥50 specs/8 categories, ≥300 current SKUs/5 suppliers, tested substitution | B1 |
| Hinges and runners | Two specs each added | Exact series, plate/locking device, lengths, load classes, drilling, opening/protrusion/collision incomplete | Series-specific technical packs + ISO performance evidence + golden assemblies | B0 |
| Finish library | ADR-003 + three lossless native mappings | No 50-code Italiana register, physical master samples, CIELAB conditions, gloss/texture/batch, licences | Finish Registry + lab/sample workflow + rights-aware mappings | B0 |
| Boring and drilling | Reference recipes + `MON-BS-001` Proposed | Supplier and machine variants are research-pending; generic 37/32/5 values are not production authority | Qualified variant + machine profile + post-processor + coupon/FAI evidence | B0 |
| Manufacturing | Strong vocabulary for cut/nest/CNC/MES | No deterministic released manufacturing packet or safety interlock proof | Manufacturing Release Packet + signed gates + output checksum + quarantine/rollback | B0 |
| Installation and commissioning | Installer-app concept and broad instructions | No site-ready version pin, package/box/part identity, torque/adhesive cure, inspection, as-built capture | Installation Work Pack + commissioning checklist + acceptance certificate | B1 |
| Appliances and MEP | Broad ventilation/plumbing/electrical sections | No current OEM model instruction ingestion, jurisdiction pack, service zone, conflict rules, licensed signoff | OEM Appliance Pack + MEP Jurisdiction Pack + site-survey constraints | B0 |
| Product and machine safety | Some standards and safety gates | Standards lifecycle drift, no risk assessment, machine qualification, product test dossier, recall workflow | Safety Case per product/machine/market + standards watch | B0 |
| Accessibility and ergonomics | ADA/universal design and ISO 21542 section | Single “standard height” logic cannot serve population, disability, posture, task, and adjustable use | Inclusive Design Profile using population data and user validation | B1 |
| Digital accessibility | Not governed | No WCAG target, keyboard/screen-reader/offline/mobile evidence | WCAG 2.2 AA product policy and automated/manual evidence | B1 |
| Procurement/inventory | MRP/MES concepts and SKU layer | No supplier contract terms, lead-time confidence, MOQ/UOM conversion, approval, alternate-risk, receiving QC | Supplier/Sourcing Master + effective commercial snapshot + approval workflow | B1 |
| Quality/traceability | Proposed checklists and non-conformance concepts | No lot/serial genealogy from material to installed asset; no recall blast-radius query | Product/batch/item identity + genealogy + NCR/CAPA + recall simulation | B0 |
| Sustainability | Broad certifications and proposed LCA | No verified mass balance, EPD, transport/waste data, chain of custody, repairability or end-of-life | LCA/EPD evidence model + ISO 22095 chain of custody + DPP-ready identity | B1 |
| BIM/PIM/interoperability | IFC discussion and format ambitions | Current standards drift; no canonical property dictionary, data template, MVD/IDS-style requirement, round-trip corpus | ISO 23386 property governance + ISO 23387:2025 templates + IFC 2024 mappings | B1 |
| Warranty/field service | Digital twin and one-tap service vision | No installed configuration, entitlement, SLA, part supersession, diagnosis, visit, fix verification | Installed Asset Twin + warranty rules + service knowledge + first-time-fix metrics | B1 |
| AI/RAG/agents | Persona copilots and governance context proposed | No risk tiers, eval sets, source permissions, tenant isolation, human authority, model/prompt/version lineage | AI Use-Case Registry + NIST AI RMF profile + eval/release gates | B0 |
| Tenant/security/privacy | ADR-001 + fixture matrix | No runtime auth, RLS, storage/cache/queue isolation, KMS, region, deletion, restore, break-glass proof | Deployed control plane + continuous isolation evidence | B0 |
| Economics/pricing | Several proposed KPIs and pricing questions | No cost-to-serve, API/AI/CAD compute, supplier-data licensing, support, warranty liability, CAC/LTV | Cohort unit-economics model + pricing experiments + tenant usage ledger | B1 |
| Organization/governance | ADR authorities defined | No permanent data stewards, standards owner, supplier rights owner, release board, escalation SLAs | RACI + stewardship queues + decision calendar + audit KPIs | B0 |
| Ecosystem/dealers/designers | Rich persona and marketplace concepts | No identity federation, certification, data-sharing contracts, commission authority, dispute model | Partner Registry + credentials + scoped sharing + settlement rules | B2 |
| Internationalization | Seven-language vocabulary ambition | No concept-ID-based translations, locale QA, regulated-term governance, fallback/translation memory | i18n termbase linked to canonical IDs + reviewer workflow | B2 |
| Content/experience | Strong presentation and visual-language research | Claims can outrun evidence; accessibility and asset rights not enforced | Evidence-aware publishing pipeline + WCAG + asset licence gate | B2 |

## 6. Blocking findings and required corrections

### B0-01 — Separate knowledge, decision, and runtime truth

The current corpus interleaves market observations, prescriptive dimensions, supplier facts, proposed architecture, code examples, and target KPIs. The next kernel must store these as different evidence classes with separate owners and expiry.

**Required controls:** claim ID; subject ID; value/unit; applicability; source and exact locator; publisher; revision/effective/retrieval dates; rights; evidence class; reviewer; expiry; supersession; contradiction links; affected outputs. Publishing, configuration, BOM, CAM, installation, and AI retrieval must query only claims allowed for that use.

**Acceptance:** a deliberately expired, contradicted, unlicensed, or Proposed claim cannot silently enter a client spec, purchase order, machine packet, or regulatory declaration.

### B0-02 — Turn all cabinet dimensions into governed rule packs

The encyclopedia’s base/tall/wall and regional tables are useful research, but they do not answer which values are nominal, finished, opening, site, manufacturing, or accessible-use dimensions. A cabinet cannot be defined by width/height/depth alone.

The canonical rule must include family, construction system, front style, panel/back thickness, top/bottom/rail logic, width/height/depth range and grid, fillers/scribes, plinth, worktop, reveal, internal opening, hinge/runner envelope, appliance/service void, MEP zone, ventilation, door/drawer collision, load, installation tolerance, accessibility profile, shipping split, tenant policy, region, source revision, and manufacturing capability.

**Acceptance:** at least 100 golden configurations across base, wall, tall, corner, island, appliance, sink, accessible, and bespoke families; boundary, collision, opening, service, and manufacturing checks; round-trip dimensions from design → BOM → parts → as-built.

### B0-03 — Establish a live standards and regulatory register

Current research moves faster than a static book. Since the encyclopedia was composed, ISO 23387:2025, ISO 16739-1:2024, ISO 16000-9:2024, ISO 14025:2026, ISO 12808:2024, and ISO 25131:2025 materially affect it. ISO 21542:2021 is currently under systematic review, while [ISO 9001’s 2026 revision](https://www.iso.org/standard/88464.html) is under publication. The register must distinguish Published, Under Review, Under Development, Withdrawn, and Replaced; jurisdiction; scope; licensed text access; applicability; effective date; and impacted rules.

For EU-market wood furniture, Commission Regulation (EU) 2023/1464 is a near-term B0: in-scope articles placed on the market after 6 August 2026 must meet its formaldehyde release limit under its defined conditions. Legal/compliance owners must decide applicability; software must not infer it from an “E0/E1” marketing label.

### B0-04 — Replace “all products/models” with a measurable coverage service

No organization can truthfully maintain every global kitchen product and model from web research alone. Define completeness per contracted source: expected collections, models, variants, SKUs, finishes, documents, certifications, markets, and effective dates. Each supplier connector needs last successful sync, change/diff review, licence, rate/usage terms, and missing-record alerts.

Target graph: `Supplier → Brand → ProductLine → Collection → Model → Variant → Module → ComponentSpec → SupplierSKU → Finish → Asset/Document/Certificate → MarketOffer`. Project snapshots pin every referenced version so future catalog changes cannot rewrite sold work.

### B0-05 — Finish identity is not appearance equivalence

Italiana codes, Häfele descriptors, and Blum codes belong to different native vocabularies. The first registry preserves Italiana `ZN`, Häfele `bright`, and Blum `NI`; it explicitly sets physical equivalence to false. The requested “Italiana 50 finish codes vs Häfele/Blum” cannot be closed until the official code sets and usage rights are acquired.

Each physical mapping needs substrate/coating compatibility, master sample and custody, calibrated CIELAB/LCh measurement with illuminant/observer/geometry, named colour-difference method and approved tolerance, ISO 2813 geometry where applicable, texture/grain/batch, metamerism/lighting review, application limits, sample approval, tenant/project approval, and revalidation. [ISO/CIE 11664-4:2019](https://www.iso.org/standard/74166.html) governs CIELAB calculation records; [ISO 2813:2014](https://www.iso.org/standard/56807.html) has a limited gloss-measurement scope and cannot describe every texture.

### B0-06 — Quarantine generic boring values from production

The 32 mm pitch is a de facto interoperability convention, not a universal supplier geometry standard. `MON-BS-001` correctly separates core semantics, generic reference, supplier/series variants, machine profile, post-processor, and project pin. However, current supplier variants are research-pending and `manufacturing_allowed=false`.

**Acceptance before any factory release:** current primary technical sheet; coordinate/tolerance schema; verified tool; machine datum and transforms; calibrated coupon; first-article measurement; deterministic output checksum; collision/breakthrough/edge checks; operator and safety approval; rollback/quarantine; sampled production checks. ISO 19085-1:2021 covers common woodworking-machine safety and must be used with machine-specific parts such as ISO 19085-3 for NC/CNC boring/routing—not replaced by a software geometry check. [ISO 19085-1:2021](https://www.iso.org/standard/77655.html).

### B0-07 — Model MEP and appliance authority per market and model

Ventilation, electrical, gas, plumbing, drainage, water treatment, fire, and appliance clearances are jurisdiction- and model-specific. Create a versioned OEM Appliance Pack with cutout, ventilation, electrical/gas/water/drain, service access, adjacent-material temperature, door swing, installation sequence, and source revision. Combine it with a Jurisdiction Pack and licensed-professional approval. When OEM and generic rules conflict, block design release.

**Non-negotiable:** AI or generic encyclopedia text must never issue final electrical, gas, ventilation, fire, or plumbing approval.

### B0-08 — Build product, material, and machine safety cases

Safety must link hazard → requirement → design control → test method → result → certificate → market → expiry → affected models. Include stability/strength, hinge/runner durability, anti-tip, glass, sharp edges, hot surfaces, child access, chemicals/emissions, food-contact interfaces, outdoor exposure, machine hazards, dust/fire/explosion, lockout/tagout, installation, and foreseeable misuse.

Storage-unit test scope belongs in [ISO 7170:2021](https://www.iso.org/standard/76864.html); hardware performance has separate standards. VOC/formaldehyde evidence should use current methods such as [ISO 16000-9:2024](https://www.iso.org/standard/79022.html) and market rules, not a single global “E0/E1” field. For the US, EPA TSCA Title VI regulates hardwood plywood, MDF, and particleboard and requires testing/certification and supply-chain records for covered products. [EPA guidance](https://www.epa.gov/sites/default/files/2018-04/documents/small_entity_compliance_for_formaldehyde_standards-fabricators_4.20.2018.pdf).

### B0-09 — Trace from source material to installed asset

Every material lot, panel, finish batch, hardware SKU, machined part, box, room, installed cabinet, inspection, and service action needs genealogy. GS1 distinguishes class-, batch/lot-, and instance-level identity; MONOLITH should select the lowest level that controls safety, finish consistency, recall, warranty, and service risk. [GS1 Global Traceability Standard](https://www.gs1.org/standards/gs1-global-traceability-standard/current-standard). GS1 Digital Link can connect standard identifiers to certifications, instructions, product information, and traceability services. [GS1 Digital Link](https://www.gs1.org/standards/gs1-digital-link).

ISO 22095 supplies chain-of-custody models but does not itself prove sustainability claims. [ISO 22095:2020](https://www.iso.org/standard/72532.html). Acceptance is a timed recall simulation: identify every affected tenant/project/room/asset from a supplier lot, block new use, notify authorized parties, select verified substitute, and retain the audit trail.

### B0-10 — Rights and source permission must gate content

A URL proves provenance, not permission to copy photographs, CAD, textures, manuals, tables, trademarks, or catalog layouts. Every asset must carry owner, licence, permitted channels/territory, attribution, expiry, checksum, transformation rights, and takedown state. Supplier-native identifiers and factual metadata can be stored separately from protected assets. Legal/IP approval is required before training or retrieval uses supplier content beyond agreed purposes.

## 7. B1–B3 development priorities

### B1 — Launch-critical operational depth

1. **Installation/commissioning:** QR/box/part identity, versioned work pack, site deviations, calibrated measurements, photo evidence, torque/adhesive/cure records, punch list, customer acceptance, and as-built update.
2. **Quality/CAPA:** receiving, in-process and final inspection; NCR; containment; root cause; corrective/preventive action; effectiveness review; supplier scorecard.
3. **BIM/PIM:** use ISO 23386:2020 for property governance and current [ISO 23387:2025](https://www.iso.org/standard/85391.html) for data templates. Pin [ISO 16739-1:2024](https://www.iso.org/standard/84123.html), define exchange requirements, and test geometry/identity/property round trips. A downloadable IFC file alone is not interoperability.
4. **Sustainability:** mass/material BOM, energy, transport, waste, recycled/biogenic content with chain of custody, repairability, spare parts, disassembly, end-of-life, LCA boundaries, uncertainty, EPD verification. [ISO 14040](https://www.iso.org/standard/37456.html), [ISO 14025:2026](https://www.iso.org/standard/87610.html), [ISO 21930:2017](https://www.iso.org/standard/61694.html), and [ISO 22057:2022](https://www.iso.org/standard/72463.html) form a useful evidence chain.
5. **DPP readiness:** EU Regulation 2024/1781 establishes a framework for product passports and open, interoperable, portable data, but product-specific obligations depend on delegated acts. Build model/batch/item identity and access controls without claiming a furniture mandate prematurely. [EU 2024/1781](https://eur-lex.europa.eu/eli/reg/2024/1781/oj/eng).
6. **Inclusive design:** treat accessibility as a configurable user/environment profile. ISO 21542:2021 covers accessibility of the built environment and is under review; ISO 15535:2023 governs anthropometric databases. [ISO 21542](https://www.iso.org/standard/71860.html), [ISO 15535](https://www.iso.org/standard/82541.html). Validate with users rather than encoding one universal height.
7. **Digital accessibility:** target WCAG 2.2 AA for web/mobile portals, including keyboard, focus, accessible authentication, touch targets, alternatives, language, errors, and offline workflows. [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

### B2 — Scale and differentiated trust

- Partner identity, credentials, certification, tenant-approved sharing, conflict/dispute handling, commission authority, and settlement audit.
- Installed Asset Twin with exact components/finishes/batches, entitlement, maintenance, cleaning, spare-part supersession, service diagnosis, visit, repair, and verification.
- Multilingual termbase where translations attach to canonical concept IDs, with domain reviewer and regulated-term controls.
- Tenant-configurable vertical packs that cannot override platform safety, evidence, privacy, or kernel governance.
- Evidence-aware publishing: every public claim displays source class, market, effective date, and limitations where material.

### B3 — Experience optimization after trust gates

- Visual storytelling, AR, mood boards, marketplace discovery, and personalization.
- Recommendation and sales copilots only after permissions, evidence, fairness, and outcome measurement exist.
- Advanced optimization for nesting, scheduling, inventory, and service routing after deterministic baselines and human override are proven.

## 8. Priority portfolio with owners and acceptance evidence

| ID | Priority | Outcome | Accountable owner | Dependencies | Acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| P-01 | B0 | Claim/evidence firewall | Product Data Governance | Source registry, rights model | Expired/contradicted/unlicensed claim blocked in five output channels |
| P-02 | B0 | Executable module/size rules | Product Configuration Owner | Geometry, Component Master, MEP | 100 golden configurations; boundary/collision/round-trip green |
| P-03 | B0 | Standards/applicability register | Compliance Authority | Legal, product safety | Current/withdrawn/replaced lifecycle; impact alerts; EU formaldehyde decision recorded |
| P-04 | B0 | Finish sample laboratory pilot | Finish Governance + Quality | ADR-003, supplier rights | Two real suppliers, measured samples, tolerance/lighting/batch approval, no image-only equivalence |
| P-05 | B0 | Qualified manufacturing cell | Manufacturing + Safety | ADR-005, machine vendor | Coupon, FAI, post-processor checksum, rollback, operator approval |
| P-06 | B0 | Tenant runtime isolation | Security/Privacy + Platform | ADR-001 contract | Real service matrix, no cross-tenant data, key/region/restore/delete/break-glass evidence |
| P-07 | B0 | Product genealogy and recall | Quality + Supply Chain | Identity, SKU, installed asset | Lot-to-installed-asset recall simulation within target time |
| P-08 | B0 | AI release governance | AI Governance | Tenant permissions, evidence graph | Use-case risk tiers, eval corpus, prompt/model/source versions, human authority, incident rollback |
| P-09 | B1 | Supplier catalog coverage service | Supplier Data Owner | Contracts, APIs/files | Coverage denominator, freshness SLA, diff review, rights, ≥5 suppliers |
| P-10 | B1 | Installation/commissioning loop | Field Operations | Manufacturing packet, mobile/offline | Work pack → as-built → acceptance → service trace on pilot site |
| P-11 | B1 | BIM/PIM exchange contract | Interoperability Owner | Property dictionary, geometry | IFC/property round trip corpus; no identity loss; current standard pins |
| P-12 | B1 | Sustainability evidence model | Sustainability/Compliance | Mass BOM, supplier evidence | Pilot LCA with declared boundaries; verified EPD/CoC links; no green claim without evidence |
| P-13 | B1 | Unit economics and pricing experiments | CFO/Product | Usage ledger, cost allocation | Per-tenant contribution margin including AI/API/CAD/support/warranty; controlled price tests |
| P-14 | B2 | Partner credential and settlement | Ecosystem Owner | Identity, finance, contracts | Certified partner workflow, scoped data access, auditable commission and disputes |

## 9. AI governance and Perplexity integration

AI should be an evidence navigator and constrained copilot, not an invisible authority. Establish an AI Use-Case Registry with tenant, purpose, affected persona, data classes, sources, model/provider/version, prompt/retrieval version, tools, decision authority, risk tier, evaluation set, thresholds, human approval, monitoring, incident route, and rollback.

Use the NIST AI RMF functions Govern, Map, Measure, and Manage, while version-pinning because AI RMF 1.0 is being revised. NIST’s Generative AI Profile adds cross-sector risk actions. [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework), [NIST Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf).

Hard controls:

- raw cross-tenant retrieval/training denied by default;
- supplier licences and project permissions applied before indexing;
- citations resolve to exact source revision and passage;
- instructions inside retrieved documents are data, never agent authority;
- price, contract, safety, compliance, CAM/CNC, and MEP decisions require named human authority;
- hallucination, stale-source, prompt-injection, data-poisoning, leakage, over-reliance, and unavailable-provider tests;
- provider/API cost, latency, quota, data retention, and geographic processing measured per tenant/use case.

Perplexity API usage is charged against the Perplexity API account/credits associated with the key, not against the MONOLITH Codex/OpenAI subscription. MONOLITH should therefore meter it as a provider cost and never place the key in browser code, documents, logs, Git, or tenant-visible exports.

## 10. Organization and decision rights

Create permanent, named accountability—not a temporary document project.

| Role | Owns |
| --- | --- |
| Platform Owner | Portfolio, funding, ratification quorum, risk acceptance |
| Architecture Authority | Context boundaries, contracts, versioning, integration |
| Security/Privacy Authority | Tenant isolation, identity, keys, region, retention, break-glass, AI data use |
| Product Data Steward | Canonical IDs, property dictionary, conflicts, lifecycle, coverage |
| Supplier Data/Rights Owner | Feeds, licences, native codes, change notices, takedowns |
| Finish Governance + Laboratory | Samples, measurement, tolerance, batch, approval |
| Manufacturing Authority | Machine/profile/post-processor qualification and release |
| Product Safety/Compliance | Standards/applicability register, test dossiers, market release, recall |
| Quality Authority | Inspection, NCR/CAPA, genealogy, supplier quality, commissioning evidence |
| Interoperability Owner | BIM/PIM/CAD exchange contracts and round-trip corpus |
| Field Operations/Service Owner | Installation, acceptance, installed assets, warranty, service outcomes |
| Finance | Unit economics, pricing, revenue/commission authority, cost controls |
| Legal/IP | Supplier/customer contracts, asset rights, claims, regulatory interpretation |

Daph and all other tenants supply workflow evidence and acceptance feedback. They cannot ratify platform-wide tenant, kernel, security, finish, manufacturing, or evidence policy.

## 11. Trustworthy indispensability by persona

The ethical product objective is to make leaving easy but staying obviously valuable.

| Persona | Indispensable value | Anti-lock-in promise | Primary measure |
| --- | --- | --- | --- |
| Tenant executive | Margin/order/risk truth tied to source transactions | Complete export and version history | Contribution margin, forecast accuracy, export drill |
| CFO/auditor | Traceable commercial snapshots and approvals | Standard exports, immutable links, no hidden fees | Close time, audit exceptions, cost-to-serve |
| Designer | Multi-brand validated rules and fast client packages | Open BIM/CAD/data handoff | Design time, rule violations, round-trip success |
| Dealer/sales | Fast accurate configuration and quote | Customer/project ownership clear by contract | Quote cycle, rework, conversion with guardrails |
| Factory/operator | Released packets that match machine reality | Human stop, rollback, portable machine profiles | First-pass yield, downtime, scrap, safety events |
| Quality/safety | Full evidence and genealogy | Readable export and independent audit | Escape rate, CAPA effectiveness, recall time |
| Installer/foreman | Correct box/part/site instruction offline | PDF/QR package remains usable outside app | Install time, snag rate, first visit completion |
| Service technician | Exact installed configuration and verified substitutes | Customer asset record export | First-time-fix, parts lead time, repeat visit |
| End customer | Transparent progress, care, warranty, and fast help | Portable asset passport; consent and deletion controls | NPS, resolution time, successful self-service |
| Supplier/partner | Accurate native identity, demand signal, controlled rights | No forced IP transfer; transparent mapping | Data freshness, dispute rate, forecast quality |
| Regulator/insurer | Market-specific safety and traceability evidence | Independent evidence access under authority | Release exceptions, evidence retrieval time |

## 12. Sequenced 365-day programme

### Days 0–30 — Stop unsafe claims and freeze foundations

- Ratify or explicitly retain Proposed status for ADR-001/002/003/005.
- Launch source/standards/rights registers and claim classification.
- Record EU formaldehyde applicability decision before 6 August 2026 for relevant market offers.
- Reconcile 12/14/15 contexts and 15/19/24 spec denominators.
- Freeze manufacturing release from generic/research-pending profiles.
- Define product/module, supplier source, installed asset, and evidence IDs.

### Days 31–90 — Build the minimum operational evidence spine

- Implement module/size rules and 100 golden configurations.
- Expand Component Master with current hinge/runner technical packs.
- Run two-supplier physical finish pilot.
- Implement supplier coverage/freshness dashboard and rights-aware asset ingestion.
- Implement real identity/membership and tenant context propagation in a test environment.
- Create OEM appliance/MEP pack and one jurisdiction pilot.

### Days 91–180 — Prove one closed-loop tenant workflow

- Quote → configured design → pinned BOM/SKU → machine packet → qualified cell → inspection → boxed identity → installation → as-built → acceptance → service record.
- Execute isolation, restore, pool-to-dedicated rollback, deletion, key-erasure, and break-glass drills.
- Complete product genealogy/recall simulation.
- Complete BIM/property round-trip corpus and digital accessibility audit.
- Establish unit-economics baseline including Perplexity/AI/provider costs.

### Days 181–365 — Prove repeatability with a second tenant

- Onboard a second tenant with no policy exceptions hidden in Daph-specific code.
- Expand supplier feeds and Component Master toward ADR-002 ratification thresholds.
- Qualify additional machine/series profiles separately.
- Pilot LCA/EPD/DPP-ready records and chain of custody.
- Release only AI use cases that pass risk-tier evaluations and tenant isolation.
- Obtain independent security, privacy, manufacturing, and product-safety review evidence.

## 13. Board decisions required now

1. **Approve the claim firewall:** no client, procurement, manufacturing, compliance, or AI output may use a claim outside its allowed evidence class.
2. **Fund product data acquisition:** supplier licences, technical sheets, update SLAs, stewards, and sample laboratory capacity are core product costs.
3. **Approve release sequencing:** evidence spine and one closed loop before broad marketplace/AR/copilot expansion.
4. **Approve portability as policy:** documented export, deletion, interoperable IDs/formats, and no punitive exit mechanism.
5. **Approve manufacturing non-claim:** no generic/research-pending profile can produce a released machine packet.
6. **Approve market-pack governance:** compliance applies by product, market, customer, date, and use—not by a universal badge.
7. **Require measured economics:** all conversion, margin, waste, NPS, and time-reduction numbers remain hypotheses until baselined and experimentally measured.

## 14. Explicit non-claims and residual risks

- This report does not certify a kitchen, product, machine, facility, installer, supplier, tenant, or software platform.
- It does not replace licensed standards, OEM instructions, engineering judgement, legal advice, accessibility validation, or jurisdictional approval.
- The 19-spec seed is an auditable starting set, not Component Master ratification.
- The three finish mappings preserve native identities; they do not establish physical equivalence or complete the requested supplier libraries.
- The tenant contract proves policy consistency only; it does not prove production isolation or privacy compliance.
- `MON-BS-001` is Proposed and not manufacturing-ready.
- Current product/model completeness, supplier asset rights, real physical finish performance, load ratings, regional availability, and production evidence remain material unknowns.

The strategic opportunity is nevertheless strong: MONOLITH can become the trusted operating memory connecting design intent to physical outcome across tenants and partners. That advantage comes from verified, portable, continuously maintained evidence—not from document volume or forced dependency.
