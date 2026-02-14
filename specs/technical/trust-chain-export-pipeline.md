# Trust Chain & Export Pipeline Specification

## Overview

The Trust Chain & Export Pipeline system provides:
1. **Immutable Manifest Chain** - Cryptographic audit trail for all design changes
2. **Factory Package Export** - Deterministic DXF + CSV + Report generation
3. **Artifact Storage** - Content-addressed binary storage
4. **Export Viewer** - UI for viewing and downloading exports
5. **Bundle Verification** - Re-hash artifacts to verify integrity

**Core Principle**: "Same Input → Same Output" (Deterministic Export)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MONOLITH Runtime                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Cabinets  │  │  Materials  │  │   Nesting   │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
│         └────────────────┼────────────────┘                        │
│                          ▼                                          │
│              ┌───────────────────────┐                              │
│              │ MONOLITHExportContext    │                              │
│              │ Provider              │                              │
│              └───────────┬───────────┘                              │
└──────────────────────────┼──────────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Export Pipeline                                    │
│                                                                       │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │ Factory Profile │───▶│ Plan Factory    │───▶│ MONOLITH Exporter  │  │
│  │ (KDT/HOMAG/etc) │    │ Package         │    │                 │  │
│  └─────────────────┘    └─────────────────┘    └────────┬────────┘  │
│                                                          │           │
│  ┌───────────────────────────────────────────────────────┼─────────┐│
│  │                     Builders                          │         ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │         ││
│  │  │ DXF Sheets  │  │ CSV CutList │  │ JSON Report │◀──┘         ││
│  │  │ Builder     │  │ Builder     │  │ Builder     │             ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘             ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│                           ▼                                          │
│              ┌───────────────────────┐                               │
│              │   Artifact Store      │                               │
│              │  (Memory / IndexedDB) │                               │
│              └───────────┬───────────┘                               │
│                          │                                           │
│                          ▼                                           │
│              ┌───────────────────────┐                               │
│              │   ExportRecord        │                               │
│              │   (in Manifest Chain) │                               │
│              └───────────────────────┘                               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Data Types

### ExportRecord

```typescript
interface ExportRecord {
  exportId: string;                    // EXP_{bundleHash.slice(0,16)}
  kind: 'FACTORY_PACKAGE';
  createdIso: string;
  artifacts: ExportArtifactRef[];
  proof: ExportBundleProof;
  sourceManifestHashHex: string;       // HEAD at export time
  specStateAtExport: 'DRAFT' | 'FROZEN' | 'RELEASED';
  notes?: string;
  createdBy?: string;
}
```

### ExportArtifactRef

```typescript
interface ExportArtifactRef {
  artifactId: string;    // ART_{sha256.slice(0,16)}
  path: string;          // "sheets/A01.dxf"
  mime: string;          // "application/dxf"
  bytes: number;         // File size
  sha256Hex: string;     // Content hash
}
```

### ExportBundleProof

```typescript
interface ExportBundleProof {
  bundleHashHex: string;   // SHA256 of canonical bundle core
  algorithm: 'SHA256';
  createdIso: string;
}
```

### CutListRow (SPEC-08 v8.2 Compliant)

```typescript
interface CutListRow {
  partId: string;        // "SIDE_L", "TOP", etc.
  cabinetId: string;
  materialId: string;

  // Finish Dimensions
  finishW: number;       // mm
  finishH: number;       // mm

  // Edge Banding (mm)
  edgeL: number;
  edgeR: number;
  edgeT: number;
  edgeB: number;

  // Premill (SPEC-08 v8.2)
  premillL: number;
  premillR: number;
  premillT: number;
  premillB: number;

  // Cut Dimensions (calculated)
  cutW: number;          // Finish W - Edge L - Edge R + Premill L + Premill R
  cutH: number;          // Finish H - Edge T - Edge B + Premill T + Premill B

  qty: number;
  grain?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  note?: string;
}
```

---

## Factory Package Profiles

| Profile  | Sheet Folder | CSV Delimiter | DXF Flavor | Use Case          |
|----------|--------------|---------------|------------|-------------------|
| DEFAULT  | `sheets/`    | `,`           | R12        | Generic factories |
| KDT      | `dxf/`       | `;`           | R12        | KDT CNC machines  |
| HOMAG    | `sheets/`    | `,`           | 2000       | Homag machines    |
| BIESSE   | `sheets/`    | `,`           | R12        | Biesse machines   |

### Profile Configuration

```typescript
interface FactoryPackageProfile {
  id: FactoryProfileId;

  // Folder Layout
  sheetFolder: string;
  cutListFolder: string;
  reportFolder: string;

  // File Naming
  sheetNamePattern: (index1: number, label?: string) => string;
  cutListFileName: string;
  reportFileName: string;

  // Format Options
  dxfFlavor: 'R12' | 'R14' | '2000' | '2004' | '2007';
  csvDelimiter: ',' | ';' | '\t';
  csvEncoding: 'utf-8' | 'utf-16' | 'ascii';
  csvBom: boolean;
}
```

---

## Export Pipeline Flow

### 1. Pre-Export Checks (Preflight)

```
canReExport = gateOk
           && noBlockingIssues
           && specState !== 'RELEASED' (for re-export)
```

### 2. Export Sequence

```
1. Get HEAD manifest
2. Extract MONOLITHExportContext from runtime
3. Plan export (planFactoryPackage)
4. Build DXF sheets (one per nesting sheet)
5. Build CSV cut list (SPEC-08 columns)
6. Build JSON report (machine-readable summary)
7. Store files in ArtifactStore
8. Compute bundle hash (deterministic)
9. Create ExportRecord
10. Append manifest with new export
```

### 3. Determinism Rules

| Aspect           | Rule                                           |
|------------------|------------------------------------------------|
| Sheet Order      | By nesting index (1-based)                     |
| Part Order       | By cabinetId, then partId (alphabetical)       |
| Artifact Order   | By path (alphabetical)                         |
| Bundle Hash      | SHA256 of canonical JSON (sorted keys)         |
| No Randomness    | No UUIDs, no random IDs in content             |
| No Timestamps    | Timestamps only in metadata, not in DXF/CSV    |

---

## DXF Sheet Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER (ACADVER AC1009 = R12)                                   │
├─────────────────────────────────────────────────────────────────┤
│ ENTITIES                                                        │
│   Layer: SHEET    - Sheet boundary rectangle                    │
│   Layer: TEXT     - Sheet label, material info, utilization     │
│   Layer: PARTS    - Part rectangles (per placement)             │
│   Layer: LABELS   - Part IDs, dimensions, rotation indicators   │
└─────────────────────────────────────────────────────────────────┘
```

---

## CSV Cut List Columns

| Column       | Description                        |
|--------------|-------------------------------------|
| ROW_NO       | 1-based row number                  |
| PART_ID      | Part identifier                     |
| CABINET_ID   | Parent cabinet ID                   |
| MATERIAL_ID  | Material reference                  |
| QTY          | Quantity                            |
| FINISH_W     | Finish width (mm)                   |
| FINISH_H     | Finish height (mm)                  |
| EDGE_L/R/T/B | Edge banding thickness (mm)         |
| PREMILL_L/R/T/B | Premill amount (mm)              |
| CUT_W        | Cut width (mm)                      |
| CUT_H        | Cut height (mm)                     |
| GRAIN        | HORIZONTAL / VERTICAL / NONE        |
| NOTE         | Optional notes                      |

---

## Artifact Store

### Interface

```typescript
interface ArtifactStore {
  put(input: PutArtifactInput): Promise<PutArtifactOutput>;
  get(artifactId: string): Promise<StoredArtifact | null>;
  has(artifactId: string): Promise<boolean>;
  delete(artifactId: string): Promise<boolean>;
  listIds(): Promise<string[]>;
  clear(): Promise<void>;
}
```

### Implementations

| Implementation | Use Case           | Persistence        |
|----------------|--------------------|--------------------|
| Memory         | Development, Tests | Lost on reload     |
| IndexedDB      | Production         | Browser persistent |

### Content Addressing

```
artifactId = ART_{sha256(bytes).slice(0, 16)}
```

Same content → same ID (deduplication)

---

## Export Viewer

### Features

1. **View Latest Export** - Display export metadata and files
2. **Download Individual** - Download single artifact
3. **Download All** - Download all artifacts sequentially
4. **Verify Bundle** - Re-hash all artifacts and compare

### Store State

```typescript
interface ExportViewerState {
  jobId: string;
  loading: boolean;
  error: string | null;
  headHash: string | null;
  exportRec: ExportRecord | null;
  verify: { running: boolean; result: { ok: boolean; message: string } | null };

  loadLatest(): Promise<void>;
  loadById(exportId: string): Promise<void>;
  downloadOne(artifactId: string): Promise<void>;
  downloadAllSequential(): Promise<void>;
  verifyBundle(): Promise<void>;
}
```

### Verification Process

```
1. For each artifact in sorted order:
   - Load from ArtifactStore
   - Compute SHA256
   - Compare to recorded sha256Hex

2. Recompute bundleCore hash
3. Compare to proof.bundleHashHex

Result: verified: true/false with reason
```

---

## TrustChainService API

### Export Methods

```typescript
// Generate and store export
exportFactoryPackageAndAppend(args: {
  jobId: string;
  notes?: string;
}): Promise<{ ok: true; exportId: string; newHeadHash: string; artifactCount: number } | { ok: false; reason: string }>

// Get latest export
getLatestExport(jobId: string): Promise<{ ok: true; export: ExportRecord; headHash: string } | { ok: false; reason: string }>

// Get specific export
getExportById(jobId: string, exportId: string): Promise<{ ok: true; export: ExportRecord; headHash: string } | { ok: false; reason: string }>

// Download artifact bytes
downloadArtifact(artifactId: string): Promise<{ ok: true; bytes: Uint8Array; mime: string; filename: string; sha256Hex: string } | { ok: false; reason: string }>

// Verify bundle integrity
verifyExportBundle(jobId: string, exportId: string): Promise<{ ok: true; verified: boolean; reason?: string } | { ok: false; reason: string }>
```

---

## Usage Example

```typescript
import {
  createMONOLITHFactoryPackageExporter,
  createStubContextProvider,
  createMemoryArtifactStore,
  createExportViewerStore,
} from './core/export';

// Setup
const artifactStore = createMemoryArtifactStore();
const exporter = createMONOLITHFactoryPackageExporter({
  contextProvider: createStubContextProvider(),
  profileId: 'KDT',
});

// Configure TrustChainService
const svc = createTrustChainService({
  ...config,
  artifactStore,
  factoryExporter: exporter,
});

// Export
const result = await svc.exportFactoryPackageAndAppend({
  jobId: 'JOB_001',
  notes: 'Initial export',
});

// View exports
const viewerStore = createExportViewerStore({ jobId: 'JOB_001', svc });
await viewerStore.getState().loadLatest();
await viewerStore.getState().verifyBundle();
```

---

## File Structure

```
src/core/export/
├── index.ts                       # Module exports
├── exportBundleTypes.ts           # ExportRecord, ExportArtifactRef types
├── factoryPackageExporter.ts      # Exporter interface
├── factoryPackageProfiles.ts      # DEFAULT, KDT profiles
├── planFactoryPackage.ts          # Deterministic planning
└── monolith/
    ├── index.ts                   # MONOLITH exports
    ├── iimoExportContext.ts       # Context types + stub provider
    ├── monolithFactoryPackageExporter.ts  # Main exporter
    └── builders/
        ├── index.ts               # Builder exports
        ├── buildDxfSheets.ts      # DXF R12 generation
        ├── buildCutListCsv.ts     # CSV SPEC-08 generation
        └── buildExportReportJson.ts  # JSON report

src/core/infra/artifacts/
├── artifactStoreTypes.ts          # ArtifactStore interface
├── memoryArtifactStore.ts         # In-memory implementation
└── indexedDbArtifactStore.ts      # IndexedDB implementation

src/components/exportViewer/
├── index.ts                       # Module exports
├── downloadBytesAsFile.ts         # Browser download helper
├── exportViewerStore.ts           # Zustand store
└── ExportViewerPanel.tsx          # UI component
```

---

## Version History

| Version | Date       | Changes                                    |
|---------|------------|--------------------------------------------|
| 1.0     | 2025-01-14 | Initial release with MONOLITH Exporter        |
|         |            | - Factory Package Profiles (DEFAULT, KDT)  |
|         |            | - DXF/CSV/JSON builders                    |
|         |            | - Export Viewer UI                         |
|         |            | - Bundle verification                      |
