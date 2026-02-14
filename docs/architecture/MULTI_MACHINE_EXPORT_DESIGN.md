# T028: Multi-Machine Export Design

> CNC Machine Export Formats for Woodworking Manufacturing

**Version:** 0.1.0 (Design Phase)
**Status:** Research Complete, Implementation Pending

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Research Summary](#research-summary)
3. [Format Specifications](#format-specifications)
4. [Proposed Architecture](#proposed-architecture)
5. [Post-Processor System](#post-processor-system)
6. [Implementation Phases](#implementation-phases)
7. [Trade-offs & Decisions](#trade-offs--decisions)

---

## Problem Statement

### Business Need

Different factories use different CNC machines from various manufacturers. To support broad compatibility, Monolith must export drilling/routing data in multiple formats.

### Target Machines

| Manufacturer | Format | Market Share |
|--------------|--------|--------------|
| **Homag/Weeke** | MPR (WoodWOP) | ~35% |
| **Biesse** | CIX/BPP (bSolid) | ~25% |
| **SCM/Morbidelli** | XXL (Xilog) | ~15% |
| **Holz-Her** | HOP (NC-HOPS) | ~10% |
| **Generic** | G-Code (ISO 6983) | Fallback |
| **Felder** | TCN (TpaCAD) | ~5% |

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

Before export, all operations are stored in a machine-agnostic format:

```typescript
interface CNCOperation {
  id: string;
  type: 'BORE' | 'POCKET' | 'ROUTE' | 'SLOT' | 'SAW';
  partId: string;

  // Position (relative to part origin)
  x: number;      // mm
  y: number;      // mm
  z: number;      // mm (0 = top surface, negative = into material)

  // Operation-specific
  params: BoreParams | PocketParams | RouteParams;
}

interface BoreParams {
  diameter: number;   // mm
  depth: number;      // mm (positive)
  through: boolean;   // Blind vs through hole
  face: 'TOP' | 'BOTTOM' | 'EDGE_L' | 'EDGE_R' | 'EDGE_T' | 'EDGE_B';
}

interface PocketParams {
  width: number;
  height: number;
  depth: number;
  cornerRadius: number;
}

interface RouteParams {
  toolDiameter: number;
  depth: number;
  path: { x: number; y: number }[];
  closed: boolean;
}
```

### MPR Format (Homag)

```typescript
interface MPRDocument {
  header: MPRHeader;
  variables: MPRVariable[];
  operations: MPROperation[];
}

interface MPRHeader {
  version: string;        // "4.0.8.4"
  material: string;
  partName: string;
  dimensions: { lx: number; ly: number; lz: number };
}

interface MPROperation {
  type: 'BOR' | 'PKT' | 'ROUTG';
  id: string;
  params: Record<string, number | string>;
}

// Example output
function toMPR(ops: CNCOperation[], part: Part): string {
  return `[H
VERSION="4.0.8.4"
]
[001
LV=0
M=0
KN="${part.name}"
LX=${part.width}
LY=${part.height}
LZ=${part.thickness}
]
${ops.map(toMPROperation).join('\n')}`;
}
```

### CIX Format (Biesse)

```typescript
interface CIXDocument {
  name: string;
  dimensions: { x: number; y: number; z: number };
  operations: CIXOperation[];
}

function toCIX(ops: CNCOperation[], part: Part): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<PROGRAM name="${part.name}">
  <HEADER>
    <DIM X="${part.width}" Y="${part.height}" Z="${part.thickness}"/>
  </HEADER>
  <MACHINING>
    ${ops.map(toCIXOperation).join('\n    ')}
  </MACHINING>
</PROGRAM>`;
}
```

### G-Code (Fallback)

```typescript
function toGCode(ops: CNCOperation[], part: Part): string {
  const lines = [
    '(Generated by Monolith)',
    `(Part: ${part.name})`,
    'G90 G21',  // Absolute, metric
    'G17',      // XY plane
    ...ops.map(toGCodeOperation),
    'M30',      // Program end
  ];
  return lines.join('\n');
}

function boreToGCode(op: BoreOperation): string[] {
  return [
    `(Bore: ${op.id})`,
    `G0 X${op.x} Y${op.y}`,           // Rapid to position
    `G0 Z5`,                           // Approach height
    `G1 Z${-op.depth} F${FEED_RATE}`, // Plunge
    `G0 Z5`,                           // Retract
  ];
}
```

---

## Proposed Architecture

### Module Structure

```
src/
├── export/
│   ├── types.ts              # CNCOperation, ExportConfig
│   ├── internal/
│   │   └── operations.ts     # Internal representation builder
│   ├── postprocessors/
│   │   ├── base.ts           # PostProcessor interface
│   │   ├── mpr.ts            # Homag/WoodWOP
│   │   ├── cix.ts            # Biesse
│   │   ├── xxl.ts            # SCM/Xilog
│   │   ├── hop.ts            # Holzher
│   │   ├── tcn.ts            # Felder/TPA
│   │   └── gcode.ts          # Generic fallback
│   ├── toolLibrary/
│   │   ├── types.ts          # Tool definitions
│   │   └── defaults.ts       # Standard tool sets
│   ├── exporter.ts           # Main orchestrator
│   └── __tests__/
│       ├── mpr.test.ts
│       └── cix.test.ts
```

### Data Flow

```
useDrillMapStore
       ↓
extractOperations(cabinet)
       ↓
Internal Representation (IR)
       ↓
PostProcessor.process(IR)
       ↓
  ┌────┼────┬────┬────┬────┐
  ↓    ↓    ↓    ↓    ↓    ↓
 MPR  CIX  XXL  HOP  TCN  G-Code
```

---

## Post-Processor System

### Interface

```typescript
interface PostProcessor {
  /** Machine manufacturer/format name */
  readonly name: string;

  /** File extension (e.g., 'mpr', 'cix') */
  readonly extension: string;

  /** MIME type for downloads */
  readonly mimeType: string;

  /** Whether this format supports the operation type */
  supports(opType: CNCOperationType): boolean;

  /** Process all operations for a part */
  process(part: Part, operations: CNCOperation[], config: ExportConfig): string;

  /** Validate operations before export */
  validate(operations: CNCOperation[]): ValidationResult;
}
```

### Implementation Example

```typescript
class MPRPostProcessor implements PostProcessor {
  readonly name = 'Homag/WoodWOP';
  readonly extension = 'mpr';
  readonly mimeType = 'text/plain';

  supports(opType: CNCOperationType): boolean {
    return ['BORE', 'POCKET', 'ROUTE', 'SLOT'].includes(opType);
  }

  process(part: Part, ops: CNCOperation[], config: ExportConfig): string {
    const header = this.buildHeader(part, config);
    const variables = this.buildVariables(part);
    const operations = ops.map((op, i) => this.buildOperation(op, i));

    return [header, variables, ...operations].join('\n');
  }

  private buildHeader(part: Part, config: ExportConfig): string {
    return `[H
VERSION="${config.mprVersion || '4.0.8.4'}"
]`;
  }

  private buildOperation(op: CNCOperation, index: number): string {
    switch (op.type) {
      case 'BORE': return this.buildBore(op as BoreOperation, index);
      case 'POCKET': return this.buildPocket(op as PocketOperation, index);
      // ...
    }
  }

  private buildBore(op: BoreOperation, index: number): string {
    return `[${100 + index}
ID="BOR"
XA=${op.x}
YA=${op.y}
ZA=${op.z}
DU=${op.params.diameter}
TI=${op.params.depth}
TNO=${this.getToolNumber(op.params.diameter)}
]`;
  }
}
```

### Registry Pattern

```typescript
class PostProcessorRegistry {
  private processors = new Map<string, PostProcessor>();

  register(id: string, processor: PostProcessor): void {
    this.processors.set(id, processor);
  }

  get(id: string): PostProcessor | undefined {
    return this.processors.get(id);
  }

  list(): { id: string; name: string }[] {
    return Array.from(this.processors.entries()).map(([id, p]) => ({
      id,
      name: p.name,
    }));
  }
}

// Global registry
export const postProcessors = new PostProcessorRegistry();

// Register built-in processors
postProcessors.register('mpr', new MPRPostProcessor());
postProcessors.register('cix', new CIXPostProcessor());
postProcessors.register('xxl', new XXLPostProcessor());
postProcessors.register('gcode', new GCodePostProcessor());
```

---

## Implementation Phases

### Phase 1: G-Code Fallback (MVP)

**Scope:**
- Basic G-code output
- Bore operations only
- Single file per part

**Deliverables:**
- `gcode.ts` post-processor
- Basic export UI
- Download functionality

**Estimated Effort:** 2-3 days

### Phase 2: MPR (Homag)

**Scope:**
- Full MPR format support
- Tool library integration
- Multi-spindle support

**Deliverables:**
- `mpr.ts` post-processor
- Tool mapping UI
- Validation warnings

**Estimated Effort:** 3-4 days

### Phase 3: CIX (Biesse)

**Scope:**
- CIX XML format
- BPP legacy support (optional)
- Biesse-specific tool codes

**Deliverables:**
- `cix.ts` post-processor
- Format selection UI

**Estimated Effort:** 3-4 days

### Phase 4: Additional Formats

**Scope:**
- XXL (SCM)
- HOP (Holzher)
- TCN (Felder)

**Deliverables:**
- Remaining post-processors
- Comprehensive test suite
- Documentation

**Estimated Effort:** 5-7 days

### Phase 5: Custom Post-Processor SDK

**Scope:**
- User-defined post-processors
- Template system
- Import/export of custom formats

**Deliverables:**
- Post-processor editor UI
- Template language
- Community sharing

**Estimated Effort:** 7-10 days (optional)

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

**Choice:** All drilling data goes through IR before export

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

### Decision 4: Tool Library Mapping

**Choice:** Allow users to map Monolith tools to machine tools

**Rationale:**
- Tool numbers vary per machine
- Users know their setups
- Avoids guessing

**Impact:** Requires setup step, but more reliable output

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
*Last updated: February 2026*
