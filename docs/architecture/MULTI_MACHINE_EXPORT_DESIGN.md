# T028: Multi-Machine Export Design

> CNC Machine Export Formats for Woodworking Manufacturing

**Version:** 2.0.0
**Status:** Phase 1–4 Complete (G-Code, MPR, CIX, XXL), Phase 5 Pending

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Research Summary](#research-summary)
3. [Format Specifications](#format-specifications)
4. [Implemented Architecture](#implemented-architecture)
5. [Post-Processor System (Actual)](#post-processor-system-actual)
6. [Machine Presets](#machine-presets)
7. [Implementation Phases](#implementation-phases)
8. [Test Coverage](#test-coverage)
9. [Trade-offs & Decisions](#trade-offs--decisions)

---

## Problem Statement

### Business Need

Different factories use different CNC machines from various manufacturers. To support broad compatibility, Monolith must export drilling/routing data in multiple formats.

### Target Machines

| Manufacturer | Format | Market Share | Status |
|--------------|--------|--------------|--------|
| **Homag/Weeke** | MPR (WoodWOP) | ~35% | ✅ Implemented |
| **Biesse** | CIX/BPP (bSolid) | ~25% | ✅ Implemented |
| **SCM/Morbidelli** | XXL (Xilog) | ~15% | ✅ Implemented |
| **Holz-Her** | HOP (NC-HOPS) | ~10% | ⏳ Planned |
| **Generic** | G-Code (ISO 6983) | Fallback | ✅ Implemented |
| **Felder** | TCN (TpaCAD) | ~5% | ⏳ Planned |

### Key Insight

> "Today woodworking machines have virtually no capability to be directly programmed using G-code. The interpretation of the G-code is well-hidden and programmers perform the entire programming only through these front-end CAM systems."
> — [WOODWEB CNC Forum](https://woodweb.com/cgi-bin/forums/cnc.pl?read=839464)

---

## Research Summary

### G-Code Limitations

[G-code (ISO 6983)](https://en.wikipedia.org/wiki/G-code) is theoretically standard, but:
- Machine-specific extensions vary widely
- Tool libraries differ per manufacturer
- Workholding/clamping not standardized
- [Direct G-code is difficult on Weeke/Homag](https://woodweb.com/cgi-bin/forums/cnc.pl?read=839464)

### Manufacturer-Specific Formats

#### Homag/Weeke - WoodWOP (MPR)

```
; WoodWOP MPR file example
[H
VERSION="4.0.8.4"
]
[001
LV=0
M=0
KN="Panel"
]
[102
ID="BOR"
XA=50
YA=37
ZA=0
DU=8
TI=12.5
...
]
```

**Key Points:**
- Human-readable text format
- [WoodWOP software generates actual G-code](https://www.homag.com/en/product-detail/cnc-programming-software-woodwop)
- Best compatibility across Homag machine range
- Supports aggregates, tool changers, edge banders

#### Biesse - CIX/BPP

```xml
<?xml version="1.0" encoding="UTF-8"?>
<PROGRAM name="panel_001">
  <HEADER>
    <DIM X="600" Y="720" Z="18"/>
  </HEADER>
  <MACHINING>
    <BORE X="50" Y="37" Z="-12.5" DIA="8"/>
  </MACHINING>
</PROGRAM>
```

**Key Points:**
- CIX is XML-based, more portable
- [CIX covers wider range of Biesse machines](https://forums.autodesk.com/t5/hsm-post-processor-ideas/biesse-woodworking-router-using-cix-format/idi-p/7470469)
- BPP is older format, still used
- ISO mode has inconsistency between machines

#### SCM/Morbidelli - XXL (Xilog)

```
XILOG
NAME=panel_001
DIM_X=600
DIM_Y=720
DIM_Z=18
OPERATION BOR
  X=50 Y=37 DEPTH=12.5 DIA=8
END_OPERATION
```

**Key Points:**
- Text-based format
- Used by Xilog Plus CAM software
- Strong in Italian/European market

### Industry Solutions

[ONGAA CAM](https://ongaacam.com/what-is-ongaa-cam/) supports:
- MPR for Homag/Weeke
- BPP/CIX for Biesse
- HOP for Holzher
- TCN for TPA/Felder
- G-Code fallback

[PolyBoard CNC Integration](https://wooddesigner.org/help-centre/polyboard-cnc-integration/) demonstrates multi-format approach.

---

## Format Specifications

### Internal Representation (IR)

Before export, all operations are stored in a machine-agnostic Operation Graph (opGraph):

```typescript
// Actual types from src/cnc/post/types.ts
type GcodeDialect =
  | 'FANUC' | 'BIESSE_ISO' | 'BIESSE' | 'HEIDENHAIN' | 'WEEKE'
  | 'MPR' | 'CIX' | 'XXL';

type FileExt = '.nc' | '.tap' | '.mpr' | '.cix' | '.xxl';

interface PostProcessor {
  dialect: GcodeDialect;
  fileExt: FileExt;
  post(opGraph: OpGraph, machine: StrictMachineProfile, opts?: PostOpts): PostProcessResult;
}
```

### MPR Format (Homag) — `src/cnc/post/dialects/mpr.ts`

```typescript
// Actual exports
export const mprPostProcessor: PostProcessor;
export function formatMprNumber(n: number): string;
export function sanitizeMprString(s: string): string;
```

Output structure:
- `[H` header section with VERSION
- `[001` panel section with LV, M, KN, LX, LY, LZ
- `[1XX` operation sections: ID="BOR" with XA, YA, ZA, DU, TI, TNO
- CRLF line endings
- Supports DRILL and BORE as BOR sections

### CIX Format (Biesse) — `src/cnc/post/dialects/cix.ts`

```typescript
// Actual exports
export const cixPostProcessor: PostProcessor;
export function formatCixNumber(n: number): string;
export function escapeXmlAttr(s: string): string;
export function escapeXmlContent(s: string): string;
```

Output structure:
- `<?xml version="1.0" encoding="UTF-8"?>` declaration
- `<PROGRAM name="...">` root element
- `<HEADER>` with `<DIM X="" Y="" Z=""/>` (panel dimensions)
- `<MACHINING>` with `<BORE X="" Y="" Z="" DIA="" THROUGH="yes/no"/>` operations
- Depth expressed as **negative Z** values
- XML-safe string escaping

### XXL Format (SCM) — `src/cnc/post/dialects/xxl.ts`

```typescript
// Actual exports
export const xxlPostProcessor: PostProcessor;
export function formatXxlNumber(n: number): string;
export function sanitizeXxlString(s: string): string;
```

Output structure:
- `XILOG` header line
- `NAME=` part name
- `DIM_X=`, `DIM_Y=`, `DIM_Z=` panel dimensions
- `OPERATION BOR` ... `END_OPERATION` blocks with X, Y, DEPTH, DIA, THROUGH
- Depth as **positive value** (not negative Z)
- `THROUGH=0/1` numeric flag
- `END` program terminator

### G-Code (FANUC Fallback)

Existing `fanuc.ts` dialect provides ISO 6983 compatible G-code output as universal fallback.

---

## Implemented Architecture

### Module Structure (Actual)

```
src/cnc/
├── post/
│   ├── types.ts                    # GcodeDialect, PostProcessor, PostProcessResult
│   ├── postProcessor.ts            # Registry (v1.4.0) — 8 dialects, aliases, machine mapping
│   ├── dialects/
│   │   ├── index.ts                # Barrel: all 8 dialect exports
│   │   ├── fanuc.ts                # FANUC G-code (fallback)
│   │   ├── biesse_iso.ts           # Biesse ISO G-code
│   │   ├── biesse.ts               # Biesse native (alias → CIX)
│   │   ├── heidenhain.ts           # Heidenhain conversational
│   │   ├── weeke.ts                # Weeke/Homag G-code
│   │   ├── mpr.ts                  # ✅ Homag WoodWOP MPR (~520 lines)
│   │   ├── cix.ts                  # ✅ Biesse CIX XML (~420 lines)
│   │   └── xxl.ts                  # ✅ SCM Xilog XXL (~400 lines)
│   └── dialects/__tests__/
│       ├── mpr.test.ts             # 37 tests
│       ├── cix.test.ts             # 47 tests
│       └── xxl.test.ts             # 47 tests
│
├── machine/
│   ├── machineProfile.ts           # MachineProfile, StrictMachineProfile types
│   └── presets/
│       ├── index.ts                # MACHINE_PRESETS registry (5 presets)
│       ├── kdt.ts                  # KDT CNC Router (FANUC)
│       ├── biesse.ts               # Biesse Rover (BIESSE → CIX via alias)
│       ├── homag.ts                # ✅ Homag CENTATEQ P-110 (MPR)
│       ├── scm.ts                  # ✅ SCM Morbidelli M200 (XXL)
│       └── generic.ts              # ✅ Generic CNC Router (FANUC)
```

### Data Flow (Actual)

```
useDrillMapStore / OpGraph
         ↓
  postProcessor.ts registry
         ↓
  resolveDialect(machine)          # Machine preset → dialect
         ↓                         # With alias resolution:
         ↓                         #   BIESSE → CIX
         ↓                         #   HOMAG_ISO → WEEKE
         ↓                         #   SCM_ISO → FANUC
  dialect.post(opGraph, machine)
         ↓
  ┌──────┼──────┬──────┬──────┬──────┐
  ↓      ↓      ↓      ↓      ↓      ↓
FANUC  BIESSE  HEIDEN  WEEKE  MPR   CIX   XXL
.nc    _ISO    HAIN    .nc    .mpr  .cix  .xxl
       .nc     .nc
```

### Registry System — `postProcessor.ts` v1.4.0

```typescript
// Dialect registry: 8 dialects
const registry: Record<GcodeDialect, PostProcessor> = {
  FANUC:       fanucPostProcessor,
  BIESSE_ISO:  biesseIsoPostProcessor,
  BIESSE:      biessePostProcessor,
  HEIDENHAIN:  heidenhainPostProcessor,
  WEEKE:       weekePostProcessor,
  MPR:         mprPostProcessor,
  CIX:         cixPostProcessor,
  XXL:         xxlPostProcessor,
};

// Machine → dialect mapping
const machineDialectMap: Record<string, GcodeDialect> = {
  BIESSE:    'CIX',       // Biesse native → CIX XML
  HOMAG:     'MPR',       // Homag native → WoodWOP MPR
  SCM:       'XXL',       // SCM native → Xilog XXL
  BIESSE_ISO: 'BIESSE_ISO',
  HOMAG_ISO:  'WEEKE',
  SCM_ISO:    'FANUC',
  GENERIC:    'FANUC',
};

// Dialect aliases (brand name → format)
const dialectAliases: Record<string, GcodeDialect> = {
  BIESSE: 'CIX',
  XXL:    'XXL',
  MPR:    'MPR',
  CIX:    'CIX',
  WEEKE:  'WEEKE',
};
```

---

## Machine Presets

### 5 Machine Presets — `src/cnc/machine/presets/`

| Preset | Machine | Dialect | File Extension |
|---|---|---|---|
| `KDT_MACHINE` | KDT CNC Router | FANUC | .nc |
| `BIESSE_MACHINE` | Biesse Rover B FT | BIESSE → CIX | .cix |
| `HOMAG_MACHINE` | Homag CENTATEQ P-110 | MPR | .mpr |
| `SCM_MACHINE` | SCM Morbidelli M200 | XXL | .xxl |
| `GENERIC_MACHINE` | Generic CNC Router | FANUC | .nc |

All presets exported via `MACHINE_PRESETS` record:

```typescript
export const MACHINE_PRESETS: Record<string, StrictMachineProfile> = {
  KDT: KDT_MACHINE,
  BIESSE: BIESSE_MACHINE,
  HOMAG: HOMAG_MACHINE,
  SCM: SCM_MACHINE,
  GENERIC: GENERIC_MACHINE,
};
```

---

## Implementation Phases

### Phase 1: G-Code Fallback (MVP) — ✅ COMPLETE (pre-existing)

**Delivered:**
- `fanuc.ts` — ISO 6983 G-code (FANUC dialect)
- `biesse_iso.ts` — Biesse ISO variant
- `heidenhain.ts` — Heidenhain conversational
- `weeke.ts` — Weeke/Homag G-code variant
- KDT machine preset

### Phase 2: MPR (Homag) — ✅ COMPLETE

**Delivered:**
- `mpr.ts` — Full WoodWOP MPR format (~520 lines)
  - `[H` header, `[001` panel, `[1XX` operations
  - DRILL/BORE → BOR sections
  - `formatMprNumber()`, `sanitizeMprString()` helpers
  - CRLF line endings
- `homag.ts` — CENTATEQ P-110 preset (dialect: 'MPR')
- 37 tests covering: header format, bore operations, number formatting, string sanitization, edge cases

### Phase 3: CIX (Biesse) — ✅ COMPLETE

**Delivered:**
- `cix.ts` — Biesse CIX XML format (~420 lines)
  - `<?xml>` → `<PROGRAM>` → `<HEADER><DIM/>` → `<MACHINING><BORE/>`
  - Negative Z depth convention
  - `THROUGH="yes"/"no"` attribute
  - `formatCixNumber()`, `escapeXmlAttr()`, `escapeXmlContent()` helpers
- BIESSE machine preset routes to CIX via `dialectAliases`
- 47 tests covering: XML structure, bore operations, depth handling, through holes, XML escaping, edge cases

### Phase 4: XXL (SCM) + Registry Wiring — ✅ COMPLETE

**Delivered:**
- `xxl.ts` — SCM Xilog XXL format (~400 lines)
  - `XILOG` → `NAME=` → `DIM_X/Y/Z=` → `OPERATION BOR...END_OPERATION` → `END`
  - Positive depth convention (not negative Z)
  - `THROUGH=0/1` numeric flag
  - `formatXxlNumber()`, `sanitizeXxlString()` helpers
- `scm.ts` — Morbidelli M200 preset (dialect: 'XXL')
- `generic.ts` — Generic CNC preset (dialect: 'FANUC')
- `postProcessor.ts` v1.4.0 — Full registry with 8 dialects, machine mapping, aliases
- `presets/index.ts` — All 5 presets wired
- 47 tests covering: XXL structure, bore operations, depth handling, through holes, string sanitization, edge cases

### Phase 5: Custom Post-Processor SDK + HOP/TCN — ⏳ NOT STARTED

**Scope:**
- HOP format (Holz-Her NC-HOPS) and TCN format (Felder TpaCAD)
- User-defined post-processor template system
- Import/export of custom format configurations

**Planned Architecture:**

```
src/cnc/post/
├── dialects/
│   ├── hop.ts                # Holz-Her HOP format
│   ├── tcn.ts                # Felder TCN format
│   └── custom.ts             # Custom template-based dialect
├── sdk/
│   ├── postProcessorSDK.ts   # SDK entry point
│   ├── templateEngine.ts     # Template interpolation
│   ├── templateTypes.ts      # Template schema types
│   └── __tests__/
│       ├── hop.test.ts
│       ├── tcn.test.ts
│       └── templateEngine.test.ts
└── presets/
    ├── holzher.ts             # Holz-Her machine preset
    └── felder.ts              # Felder machine preset
```

#### HOP Format (Holz-Her) — Planned

Holz-Her machines use NC-HOPS CAM software with a proprietary text-based format.

```
; NC-HOPS Program
PROGRAM panel_001
PANEL X=600 Y=720 Z=18
;
BORE X=50 Y=37 Z=-12.5 D=8 TYP=THRU
BORE X=50 Y=69 Z=-12.5 D=15 TYP=BLIND
;
END_PROGRAM
```

```typescript
export const hopPostProcessor: PostProcessor = {
  dialect: 'HOP',
  fileExt: '.hop',
  post(opGraph, machine, opts) {
    // 1. Header: PROGRAM + PANEL dimensions
    // 2. Operations: BORE with X, Y, negative Z, D (diameter)
    // 3. TYP=THRU for through holes, TYP=BLIND otherwise
    // 4. END_PROGRAM terminator
  },
};
```

| Feature | HOP Convention |
|---------|---------------|
| Depth | Negative Z (like CIX) |
| Through holes | `TYP=THRU` |
| Comments | `;` prefix |
| Line endings | CRLF |
| Number format | 1 decimal (e.g., `12.5`) |

#### TCN Format (Felder) — Planned

Felder machines use TpaCAD software with TCN format (text-based, section-structured).

```
[HEADER]
NAME=panel_001
VERSION=1.0

[PANEL]
LX=600
LY=720
LZ=18

[OPERATIONS]
BV;X=50;Y=37;DP=12.5;DM=8;TH=1
BV;X=50;Y=69;DP=12.5;DM=15;TH=0

[END]
```

```typescript
export const tcnPostProcessor: PostProcessor = {
  dialect: 'TCN',
  fileExt: '.tcn',
  post(opGraph, machine, opts) {
    // 1. [HEADER] section with NAME, VERSION
    // 2. [PANEL] section with LX, LY, LZ dimensions
    // 3. [OPERATIONS] with BV (bore vertical): X, Y, DP (depth), DM (diameter), TH (through)
    // 4. [END] terminator
  },
};
```

| Feature | TCN Convention |
|---------|---------------|
| Sections | `[HEADER]`, `[PANEL]`, `[OPERATIONS]`, `[END]` |
| Depth | Positive (`DP=12.5`) |
| Through holes | `TH=1` / `TH=0` |
| Field separator | `;` |
| Line endings | CRLF |

#### Registry Update

```typescript
// Extended registry (v1.5.0)
const registry: Record<GcodeDialect, PostProcessor> = {
  // ... existing 8 dialects
  HOP:  hopPostProcessor,
  TCN:  tcnPostProcessor,
  CUSTOM: customPostProcessor,  // Template-based
};

// Extended machine mapping
const machineDialectMap: Record<string, GcodeDialect> = {
  // ... existing 7 mappings
  HOLZHER:     'HOP',
  FELDER:      'TCN',
  HOLZHER_ISO: 'FANUC',
  FELDER_ISO:  'FANUC',
};

// New presets
const HOLZHER_MACHINE: StrictMachineProfile = { /* ... */ };
const FELDER_MACHINE: StrictMachineProfile = { /* ... */ };
```

#### Custom Post-Processor SDK

Template-based system for user-defined formats without code changes.

```typescript
interface PostProcessorTemplate {
  id: string;
  name: string;
  fileExt: FileExt;
  encoding: 'utf-8' | 'ascii';
  lineEnding: 'LF' | 'CRLF';
  sections: TemplateSection[];
}

interface TemplateSection {
  type: 'HEADER' | 'PANEL' | 'OPERATION' | 'FOOTER';
  template: string;            // Mustache-style: "BORE X={{x}} Y={{y}} Z={{z}}"
  repeatFor?: 'operations';    // Repeat for each operation
}

// SDK API
function createCustomPostProcessor(template: PostProcessorTemplate): PostProcessor;
function validateTemplate(template: PostProcessorTemplate): ValidationResult;
function exportTemplate(template: PostProcessorTemplate): string;   // JSON
function importTemplate(json: string): PostProcessorTemplate;
```

**Template Variables:**

| Variable | Type | Description |
|----------|------|-------------|
| `{{panelName}}` | string | Part name |
| `{{panelX}}`, `{{panelY}}`, `{{panelZ}}` | number | Panel dimensions |
| `{{x}}`, `{{y}}` | number | Bore position |
| `{{z}}` or `{{depth}}` | number | Bore depth |
| `{{diameter}}` | number | Tool diameter |
| `{{through}}` | boolean | Through-hole flag |
| `{{toolNumber}}` | number | Tool index |

**Deliverables:**
- `hop.ts` — Holz-Her HOP format (~350 lines est.)
- `tcn.ts` — Felder TCN format (~350 lines est.)
- `custom.ts` — Template-based custom dialect
- `postProcessorSDK.ts` — SDK for creating/validating/importing templates
- `templateEngine.ts` — Mustache-style template interpolation
- `holzher.ts`, `felder.ts` — Machine presets
- `postProcessor.ts` v1.5.0 — Registry updated with HOP, TCN, CUSTOM
- ~40 tests per new dialect + SDK tests

**Estimated Effort:** 7-10 days

---

## Test Coverage

### 131 Dialect Tests — ALL PASSING

| Test File | Tests | Dialect |
|---|---|---|
| `mpr.test.ts` | 37 | Homag WoodWOP MPR |
| `cix.test.ts` | 47 | Biesse CIX XML |
| `xxl.test.ts` | 47 | SCM Xilog XXL |

### Test Categories per Dialect

| Category | MPR | CIX | XXL |
|---|---|---|---|
| Output structure / format | ✅ | ✅ | ✅ |
| Bore operations (single, multiple) | ✅ | ✅ | ✅ |
| Through vs blind holes | ✅ | ✅ | ✅ |
| Depth handling (negative Z / positive) | ✅ | ✅ | ✅ |
| Number formatting | ✅ | ✅ | ✅ |
| String sanitization / escaping | ✅ | ✅ (XML) | ✅ |
| Empty operation graph | ✅ | ✅ | ✅ |
| Panel dimensions in output | ✅ | ✅ | ✅ |
| File extension validation | ✅ | ✅ | ✅ |

---

## Trade-offs & Decisions

### Decision 1: Prioritize MPR and CIX

**Choice:** Focus on Homag and Biesse first

**Rationale:**
- Combined ~60% market share
- Most documentation available
- Community support exists

**Impact:** Covers majority of users early

---

### Decision 2: Internal Representation First

**Choice:** All drilling data goes through OpGraph IR before export

**Rationale:**
- Single source of truth
- Easier to add new formats
- Validates data once, exports many

**Impact:** Cleaner architecture, slight complexity

---

### Decision 3: Client-Side Post-Processing

**Choice:** Run post-processors in browser

**Rationale:**
- No server dependency
- Designs stay private
- Immediate feedback

**Impact:** No server-side customization possible

---

### Decision 4: Dialect Alias System

**Choice:** Map machine brand names to format names via aliases

**Rationale:**
- Machine preset uses `dialect: 'BIESSE'` (brand) but actual output is CIX (format)
- Aliases resolve `BIESSE → CIX`, `MPR → MPR`, etc.
- Users think in terms of machine brands, not file format names
- No need to change existing presets when adding native format support

**Impact:** Flexible mapping, easy to extend for ISO fallback variants

---

### Decision 5: Flat Dialect Directory

**Choice:** All dialect files in `src/cnc/post/dialects/` (flat) instead of nested `postprocessors/` per original design

**Rationale:**
- Existing codebase already had `dialects/` folder with FANUC, BIESSE_ISO, etc.
- Adding MPR, CIX, XXL to the same folder keeps pattern consistent
- Barrel export in `dialects/index.ts` provides clean API

**Impact:** Consistent with existing codebase conventions

---

### Decision 6: Format-Specific Depth Conventions

**Choice:** Each dialect handles depth in its native convention

| Dialect | Depth Convention | Through Convention |
|---|---|---|
| MPR | Positive (`TI=12.5`) | Depth = thickness |
| CIX | Negative Z (`Z="-12.5"`) | `THROUGH="yes"` |
| XXL | Positive (`DEPTH=12.5`) | `THROUGH=1` |

**Rationale:**
- Matches what real machines expect
- Avoids confusing factory operators
- Each dialect's `post()` function handles conversion internally

**Impact:** Dialect implementations are self-contained, no shared depth logic needed

---

## References

- [G-code - Wikipedia](https://en.wikipedia.org/wiki/G-code)
- [ONGAA CAM](https://ongaacam.com/what-is-ongaa-cam/)
- [Biesse CIX Format Discussion](https://forums.autodesk.com/t5/hsm-post-processor-ideas/biesse-woodworking-router-using-cix-format/idi-p/7470469)
- [WoodWOP Programming](https://www.homag.com/en/product-detail/cnc-programming-software-woodwop)
- [PolyBoard CNC Integration](https://wooddesigner.org/help-centre/polyboard-cnc-integration/)
- [WOODWEB CNC Forum](https://woodweb.com/cgi-bin/forums/cnc.pl?read=839464)

---

*Document created: February 2026*
*Last updated: February 2026 — v2.0.0 (Phase 1–4 implementation complete)*
