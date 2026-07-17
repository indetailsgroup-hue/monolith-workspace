# KDT Machine Intelligence Library — MONOLITH

A self-contained, bilingual (TH/EN) static site and document library covering **83 KDT woodworking
machines and line/cell items** for the MONOLITH manufacturing platform.

คลังข้อมูลสองภาษา (TH/EN) แบบสแตติกที่มีในตัวเอง ครอบคลุม **เครื่องจักรงานไม้ KDT และรายการไลน์/เซลล์ 83 รายการ**
สำหรับแพลตฟอร์มการผลิต MONOLITH

## Safety constraints (non-negotiable) / ข้อจำกัดด้านความปลอดภัย

- Every model defaults to `assessment_state = NOT_ASSESSED` and `manufacturing_release = PROHIBITED`.
- Public catalog values are **Verified in documents** only — never **Observed in operation**.
- Machine-instance facts (controller hardware/firmware, HMI/OS version, physical delivery path,
  tool table, coordinate origin, known-good job) remain **Unknown** until onsite evidence exists,
  and are never inferred from a sibling model or family manual.
- OCCT / PythonOCC are **Interoperability & Validation only**, never Manufacturing Authority.
  Original files are immutable; conversions/healing produce Versioned Derived Artifacts requiring
  human acceptance. There is no automatic machine release.
- No secrets (IP, hostname, credentials, license keys) or real physical paths appear anywhere.
- No unsupported claims (e.g. inflated agent counts or unverifiable review-process boasts) appear anywhere.
- Controller families, formats, and channels (NCstudio, LNC, TPA, Windows, G-code, `.nc`, `G54`,
  USB, network shares, barcode formats) are **never generalized** across models.

## Generated counts / จำนวนที่สร้าง

- **83** model/item directories under `models/<slug>/`
- **8** deliverable files per model = **664** per-model files
  (`machine-profile` and `compatibility-assessment`, each in `.th.md`, `.en.md`, `.th.html`, `.en.html`)
- Root deliverables: `index.html`, `executive-report.{th,en}.{md,html}`,
  `evidence-gap-register.{th,en}.{md,html}`, `data/kdt-all-models-inventory.json`, `README.md`, `manifest.json`
- Source-coverage tiers: **9** high (6–7/7 field groups), **61** medium (3–5/7), and **13** low (0–2/7).
  A separate **source-access blocked** flag applies to **9** items and overlaps those three tiers; it is not a fourth tier.

## Structure / โครงสร้าง

```
kdt-machine-intelligence-library/
├── index.html                      # bilingual catalog dashboard (search + filters)
├── executive-report.{en,th}.{md,html}
├── evidence-gap-register.{en,th}.{md,html}
├── README.md
├── manifest.json                   # machine-readable file listing
├── assets/kdt.css                  # shared industrial design system
├── data/kdt-all-models-inventory.json   # copied source of truth
├── build/                          # regeneration scripts (not required at runtime)
└── models/<slug>/
    ├── machine-profile.{en,th}.{md,html}
    └── compatibility-assessment.{en,th}.{md,html}
```

## Conventions for future regeneration / ข้อตกลงสำหรับการสร้างใหม่

- **Source of truth:** `data/kdt-all-models-inventory.json` (83 model records, each with the 7 fixed
  technical field groups: `envelope`, `capabilities`, `capacities`, `controller_hmi`,
  `native_import_formats`, `automation`, `footprint_power_weight`).
- **Slugs:** model code lowercased, non-alphanumerics collapsed to `-` (e.g. `KE-668JSGZU(40)` → `ke-668jsgzu-40`).
- **Profile ID:** `kdt.<normalized_family>.<normalized_model>@0.1-research-draft`.
- **Grounding rule:** a technical value is rendered only if it has both a non-Unknown value and a
  source URL; otherwise it renders as `Unknown`. Values are shown verbatim from JSON with an inline
  link to the exact source. Facts are never invented, broadened, or normalized beyond source wording.
- **Regenerate** with: `python3 build/build_models.py && python3 build/build_root.py && python3 build/build_reports.py`,
  then run `python3 build/qa.py`.
- **Runtime:** pure static HTML/CSS/JS. Search/filter run client-side with no network access.
  Open `index.html` directly or serve the folder with any static server.
