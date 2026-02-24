# G10.3: Machine Dialect Gate

> **North Star Invariant**: No OperationGraph may be exported unless it is valid for the selected machine dialect.

This gate ensures that all CNC operations in an OperationGraph are compatible with the target machine's capabilities before export (DXF/G-code).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     OPERATION GRAPH                                  │
│  Operations: DRILL, BORE, POCKET, PROFILE, SLOT                      │
│  Tool IDs, depths, diameters, peck settings, arc paths              │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  G10.3 VALIDATION BOUNDARY                          │
│                                                                     │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐    │
│  │   MachineProfile    │    │  MachineDialectCapabilities     │    │
│  │   (Tool Table)      │    │  (Extended Constraints)         │    │
│  └─────────────────────┘    └─────────────────────────────────┘    │
│                                                                     │
│  Checks:                                                            │
│  ✓ Tool exists in machine                                           │
│  ✓ Tool diameter within min/max range                               │
│  ✓ Operation depth within tool/machine limits                       │
│  ✓ Arc operations only if machine supports arcs                     │
│  ✓ G83 peck drilling only if machine supports it                    │
│  ✓ Operation type not in forbidden list                             │
│  ✓ Operation type in supported list (if specified)                  │
│                                                                     │
│  Output: MachineDialectResult { ok, issues, summary }               │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    EXPORT PIPELINE                                   │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────────┐   │
│  │ DXF Export      │  │ G-code Export   │  │ Post-processing   │   │
│  │ (G10 + G10.2)   │  │ (Dialect-aware) │  │                   │   │
│  └─────────────────┘  └─────────────────┘  └───────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/core/gate/gate10_3MachineDialect.ts` | Core validation logic |
| `src/core/gate/__tests__/gate10_3MachineDialect.test.ts` | 35 tests covering all validation rules + canary tests |
| `src/core/gate/index.ts` | Module exports |
| `src/core/gate/brandTypes.ts` | `ValidatedMachineProfile` branded type |
| `src/core/export/dxfExportFromOperationGraph.ts` | Pipeline integration |
| `.claude/gates/ci-bypass-patterns.txt` | CI scanner patterns |

---

## Issue Codes

| Code | Severity | Description |
|------|----------|-------------|
| `G10.3:TOOL_NOT_FOUND` | BLOCK | Tool not found in machine tool table |
| `G10.3:TOOL_DIAMETER_RANGE` | BLOCK | Tool diameter outside machine min/max |
| `G10.3:TOOL_DEPTH_RANGE` | BLOCK | Operation depth exceeds tool or machine limit |
| `G10.3:OPERATION_UNSUPPORTED` | BLOCK | Operation type not in supportedOps list |
| `G10.3:ARC_UNSUPPORTED` | BLOCK | Arc operations used but machine doesn't support |
| `G10.3:G83_UNSUPPORTED` | BLOCK | Peck drilling requested but not supported |
| `G10.3:FORBIDDEN_OPERATION` | BLOCK | Operation type in forbiddenOps list |
| `G10.3:UNITS_MISMATCH` | BLOCK | Units mismatch (future) |

---

## Validation Rules

### 1. Tool Existence
```typescript
// Every operation must reference a tool that exists in machine
const tool = getTool(machine, op.toolId);
if (!tool) {
  // BLOCK: G10.3:TOOL_NOT_FOUND
}
```

### 2. Tool Diameter Range
```typescript
// Tool diameter must be within machine limits
if (tool.diameter < caps.minToolDiameter) {
  // BLOCK: G10.3:TOOL_DIAMETER_RANGE (too small)
}
if (tool.diameter > caps.maxToolDiameter) {
  // BLOCK: G10.3:TOOL_DIAMETER_RANGE (too large)
}
```

### 3. Operation Depth
```typescript
// Depth must not exceed tool maxDepth
if (op.depth > tool.maxDepth) {
  // BLOCK: G10.3:TOOL_DEPTH_RANGE
}

// Depth must not exceed machine maxOperationDepth
if (caps.maxOperationDepth && op.depth > caps.maxOperationDepth) {
  // BLOCK: G10.3:TOOL_DEPTH_RANGE
}
```

### 4. Arc Support
```typescript
// Profile with leadRadius requires arc support
if (op.leadRadius && caps.supportsArcs === false) {
  // BLOCK: G10.3:ARC_UNSUPPORTED
}
```

### 5. G83 Peck Drilling
```typescript
// Peck drilling requires G83 support
if (op.peckDepth && caps.supportsG83 === false) {
  // BLOCK: G10.3:G83_UNSUPPORTED
}

// Tool must also support peck
if (op.peckDepth && !tool.supportsPeck) {
  // BLOCK: G10.3:G83_UNSUPPORTED
}
```

### 6. Forbidden Operations
```typescript
// Operation type must not be forbidden
if (caps.forbiddenOps?.includes(op.type)) {
  // BLOCK: G10.3:FORBIDDEN_OPERATION
}
```

### 7. Supported Operations
```typescript
// If supportedOps is specified, operation must be in list
if (caps.supportedOps && !caps.supportedOps.includes(op.type)) {
  // BLOCK: G10.3:OPERATION_UNSUPPORTED
}
```

---

## Usage

### Basic Validation
```typescript
import { validateMachineDialect } from '@/core/gate';

const result = validateMachineDialect(graph, machine);

if (!result.ok) {
  console.error('G10.3 BLOCKED:', result.issues.map(i => i.message));
  // Do not proceed with export
}
```

### With Extended Capabilities
```typescript
import { validateMachineDialect, type MachineDialectCapabilities } from '@/core/gate';

const caps: MachineDialectCapabilities = {
  supportsArcs: false,      // Basic machine without arc interpolation
  supportsG83: false,       // No peck drilling cycles
  minToolDiameter: 3,       // Minimum 3mm tools
  maxToolDiameter: 25,      // Maximum 25mm tools
  maxOperationDepth: 50,    // 50mm max depth
  forbiddenOps: ['SLOT'],   // SLOT operations not allowed
};

const result = validateMachineDialect(graph, machine, caps);
```

### Fail-Fast Assertion
```typescript
import { assertMachineDialect, isG10_3Error } from '@/core/gate';

try {
  assertMachineDialect(graph, machine);
  // Safe to export
} catch (e) {
  if (isG10_3Error(e)) {
    console.error(`G10.3 FAILED: ${e.result.summary.blockingIssues} issues`);
  }
}
```

---

## Pipeline Integration

G10.3 is integrated into the DXF export pipeline at `dxfExportFromOperationGraph.ts`:

```typescript
// For each panel:
// 1. Create panel-specific graph
const panelGraph = { ...graph, operations: panelOperations };

// 2. G10.3: Machine dialect validation
const dialectResult = validateMachineDialect(panelGraph, machine);

// 3. Collect warnings/errors
for (const issue of dialectResult.issues) {
  warnings.push(`[G10.3] ${panelId}: ${issue.message}`);
}

// 4. Continue to G10.2 (semantic) and G10 (safety) validation
```

---

## Default Capabilities

When no custom capabilities are provided, these defaults apply:

| Capability | Default | Notes |
|------------|---------|-------|
| `supportsArcs` | `true` | Most modern machines support G02/G03 |
| `supportsG83` | `true` | Most support peck drilling |
| `minToolDiameter` | `0.5` | 0.5mm minimum |
| `maxToolDiameter` | `50` | 50mm maximum |
| `maxOperationDepth` | `100` | 100mm default max depth |
| `supportedOps` | undefined | All operation types allowed |
| `forbiddenOps` | undefined | No operations forbidden |

---

## Machine Profile Requirements

G10.3 requires these fields in `MachineProfile`:

```typescript
interface MachineProfile {
  tools: ToolCapability[];  // Tool table
  // ...
}

interface ToolCapability {
  toolId: string;           // Unique tool ID
  type: ToolType;           // DRILL, BORE, ROUTER, SAW
  diameter: number;         // Tool diameter (mm)
  maxDepth: number;         // Maximum cutting depth (mm)
  supportsPeck: boolean;    // Supports peck drilling
  supportsBore: boolean;    // Supports bore operations
  // ...
}
```

---

## Error Handling

### G10_3Error Class

```typescript
class G10_3Error extends Error {
  code = 'MONO_G10_3_MACHINE_DIALECT_FAILED';
  result: MachineDialectResult;
}
```

### Type Guard

```typescript
import { isG10_3Error } from '@/core/gate';

try {
  assertMachineDialect(graph, machine);
} catch (e) {
  if (isG10_3Error(e)) {
    // Handle G10.3 violation
    showBlockerModal('Machine dialect incompatibility', e.result.issues);
  }
}
```

---

## Test Coverage

| Test Case | Expected Result |
|-----------|-----------------|
| Tool too large | BLOCK: TOOL_DIAMETER_RANGE |
| Tool too small | BLOCK: TOOL_DIAMETER_RANGE |
| Depth > tool maxDepth | BLOCK: TOOL_DEPTH_RANGE |
| Depth > machine maxDepth | BLOCK: TOOL_DEPTH_RANGE |
| Arc on non-arc machine | BLOCK: ARC_UNSUPPORTED |
| G83 on non-G83 machine | BLOCK: G83_UNSUPPORTED |
| G83 on non-peck tool | BLOCK: G83_UNSUPPORTED |
| Unsupported op type | BLOCK: OPERATION_UNSUPPORTED |
| Forbidden op type | BLOCK: FORBIDDEN_OPERATION |
| Tool not found | BLOCK: TOOL_NOT_FOUND |
| Valid graph on valid machine | PASS |

Run tests:
```bash
npm run test:run -- src/core/gate/__tests__/gate10_3MachineDialect.test.ts
```

---

## Relationship to Other Gates

| Gate | Purpose | When |
|------|---------|------|
| **G9** | Persistence boundary | Before OperationGraph build |
| **G10** | DXF safety verification | After DXF generation |
| **G10.2** | DXF semantic validation | Before DXF generation |
| **G10.3** | Machine dialect compatibility | Before export (this gate) |

---

## Hardening (Bypass-Proof)

### CI Bypass Patterns

The following patterns are BLOCKED in CI to prevent bypassing G10.3:

| Pattern | Severity | Reason |
|---------|----------|--------|
| `skipDialectValidation` | BLOCK | Skipping validation is forbidden |
| `skipMachineCheck` | BLOCK | Skipping machine check is forbidden |
| `dialectResult.ok = true` | BLOCK | Overwriting result is forbidden |
| `issues.length = 0` | BLOCK | Clearing issues is forbidden |

### Warning Patterns (WARN-HIGH)

| Pattern | Reason |
|---------|--------|
| `getMachineProfile(...) \|\| {}` | Fallback empty profile dangerous |
| `tools: []` | Empty tool table |
| `toolTable: []` | Empty tool table |

### Trusted Export Paths

Only these file patterns may perform DXF/G-code export:

```typescript
export const TRUSTED_EXPORT_PATHS = [
  '**/core/export/dxfExportFromOperationGraph.ts',
  '**/factory/cnc/generateGcodeForJob.ts',
  '**/cnc/gcode/buildGcodeBundle.ts',
  '**/__tests__/**',
  '**/*.test.ts',
] as const;
```

### Machine Profile Validation

Before any export, machine profile structure should be validated:

```typescript
import { assertMachineProfile, validateMachineProfileStructure } from '@/core/gate';

// Throws if invalid
assertMachineProfile(machine);

// Or safe version
const issues = validateMachineProfileStructure(machine);
if (issues.length > 0) {
  // Handle invalid profile
}
```

### Branded Type: ValidatedMachineProfile

```typescript
import type { ValidatedMachineProfile } from '@/core/gate';

// Function requiring validated machine profile
function exportToFactory(
  graph: OperationGraph,
  machine: ValidatedMachineProfile
): void {
  // TypeScript ensures machine was validated
}
```

### Canary Tests

The test suite includes canary tests that verify:

1. **Machine profile validation catches invalid profiles**
   - Null/non-object profiles
   - Missing id, tools, axis
   - Empty tool table

2. **Runtime guard catches bypass attempts**
   - Cast bypass with invalid machine
   - Missing tools in machine profile

3. **Trusted export paths allowlist verification**
   - Includes expected export paths
   - Includes test file patterns

---

## Future Enhancements

- [ ] Units mismatch detection (G10.3:UNITS_MISMATCH)
- [ ] Spindle RPM validation
- [ ] Feed rate limits per machine
- [ ] Coolant support validation
- [ ] Multi-spindle operation support

---

*Last updated: 2026-02-02*
*Gate Owner: @monolith-team*
