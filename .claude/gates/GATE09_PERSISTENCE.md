# G9: Persistence Safety Gate

> **North Star Invariant**: No unvalidated external state enters OperationGraph.

This gate ensures that all external data (localStorage, file imports, API responses) passes through validation before entering the manufacturing pipeline.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     EXTERNAL BOUNDARY                               │
│  localStorage · File Import · API Response · URL Params             │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  G9 VALIDATION BOUNDARY                             │
│                                                                     │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐    │
│  │   unsafeStorage.ts  │    │  validateExternalState.ts       │    │
│  │   (localStorage)    │    │  (Zod schema validation)        │    │
│  └─────────────────────┘    └─────────────────────────────────┘    │
│                                                                     │
│  Output: Validated<T> branded types                                 │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    TRUSTED INTERNAL STATE                           │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────────┐   │
│  │ Zustand Stores  │─▶│ buildFactory    │─▶│ buildOperation    │   │
│  │                 │  │ Packet()        │  │ Graph()           │   │
│  └─────────────────┘  └─────────────────┘  └───────────────────┘   │
│                                                                     │
│  Input: ValidatedFactoryPacket (branded type)                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/core/persistence/unsafeStorage.ts` | Single choke point for localStorage |
| `src/core/gate/validateExternalState.ts` | Zod validation + branded types |
| `src/core/gate/brandTypes.ts` | `Validated<T>`, `ValidatedFactoryPacket` |
| `src/cnc/mapping/g9AssertValidPacket.ts` | Runtime assertion for OperationGraph boundary |
| `.claude/gates/ci-bypass-patterns.txt` | CI scanner patterns |

---

## Trusted Modules Allowlist

Only these files may call `markPacketAsValidated()`:

| Module | Purpose |
|--------|---------|
| `factory/packet/buildFactoryPacket.ts` | Internal packet builder |
| `factory/cnc/generateGcodeForJob.ts` | G-code generation (trusted packet) |
| `core/export/dxfExportFromOperationGraph.ts` | DXF export (trusted packet) |
| `cnc/mapping/g9AssertValidPacket.ts` | Definition file |
| `**/__tests__/**` | Test fixtures |
| `**/*.test.ts` | Test fixtures |

**Adding new trusted modules requires:**
1. PR with justification
2. Review by gate owner
3. CI exception pattern update

---

## Forbidden Patterns (CI BLOCK)

| Pattern | Reason |
|---------|--------|
| `as ValidatedFactoryPacket` | Unsafe cast bypasses validation |
| `as unknown as ValidatedFactoryPacket` | Double-cast bypass forbidden |
| `markPacketAsValidated(` outside allowlist | Untrusted caller |

---

## CI Strategy: 2-Tier Enforcement

### Tier 1: G9 Scope Blocking Job (MUST PASS)

```bash
# Run in CI - blocks PR if violations found
npx ts-node scripts/gates/bypass-scan.ts --gate G9 --scope

# Exit codes:
# 0 = PASS (BLOCK=0, WARN-HIGH=0)
# 1 = FAIL (any BLOCK or WARN-HIGH found)
```

**What it checks:**
- Direct localStorage access outside unsafeStorage.ts
- Unsafe branded type casts (`as ValidatedProject`)
- Double-cast bypass attempts (`as unknown as`)

**When to run:**
- Every PR to main
- Pre-merge checks

### Tier 2: Full Repo Report (INFORMATIONAL)

```bash
# Run for visibility - does NOT block
npx ts-node scripts/gates/bypass-scan.ts --gate G9 --json > bypass-report.json

# Outputs categorized counts for monitoring
```

**What it tracks:**
- WARN-MED patterns (console.log, any types)
- WARN-LOW patterns (code hygiene)
- Trend metrics over time

---

## Pattern Severity Levels

| Severity | CI Behavior | Description |
|----------|-------------|-------------|
| `BLOCK` | Fails CI | Critical bypass - MUST fix |
| `WARN-HIGH` | Fails CI (with --scope) | Likely gate bypass |
| `WARN-MED` | Report only | Quality/determinism issue |
| `WARN-LOW` | Report only | Code hygiene |

---

## Adding Exceptions

When a pattern is legitimately needed, add an exception to `ci-bypass-patterns.txt`:

```
# Format: EXCEPT|PATTERN|FILE_GLOB

# Example: Allow localStorage in choke point file
EXCEPT|localStorage\.getItem|**/unsafeStorage.ts

# Example: Allow double-cast in type coercion
EXCEPT|as\s+unknown\s+as\s+|**/gate09.ts
```

**Rules for exceptions:**
1. Only exception trusted internal code, never external data handlers
2. Document WHY the exception is needed
3. Keep exceptions minimal - prefer fixing the pattern

---

## Runtime Enforcement

### At OperationGraph Boundary

```typescript
import { assertValidatedPacket, markPacketAsValidated } from './g9AssertValidPacket';

// External source - MUST validate
const raw = JSON.parse(fileContent);
const validated = assertValidatedPacket(raw, 'file:import.json');
const result = buildOperationGraph(validated, machine);

// Internal build - trusted path
const { packet } = await buildFactoryPacket(input, context);
const validated = markPacketAsValidated(packet);
const result = buildOperationGraph(validated, machine);
```

### Error Code

When G9 is violated at runtime:

```
MONO_G9_UNVALIDATED_INPUT_TO_OPGRAPH
```

---

## Migration Checklist

### Phase 1: Core Boundary (COMPLETE)
- [x] `unsafeStorage.ts` - localStorage choke point
- [x] `validateExternalState.ts` - Zod validation boundary
- [x] `brandTypes.ts` - Compile-time branded types
- [x] `g9AssertValidPacket.ts` - Runtime assertion

### Phase 2: Hotspot Migration (COMPLETE)
- [x] `src/App.tsx` - Theme via appPrefs
- [x] `src/main.tsx` - Theme via appPrefs
- [x] `src/runtime/env.ts` - Mode via unsafeStorage
- [x] `src/release/policy/*.ts` - Policy via unsafeStorage + Zod

### Phase 3: CI Enforcement (COMPLETE)
- [x] `ci-bypass-patterns.txt` - BLOCK patterns defined
- [x] Exception patterns for legitimate internal code
- [x] G9 scoped scan achieves BLOCK=0, WARN-HIGH=0

### Phase 4: OperationGraph Boundary (COMPLETE)
- [x] `buildOperationGraph()` requires `ValidatedFactoryPacket`
- [x] `markPacketAsValidated()` for trusted internal paths
- [x] `assertValidatedPacket()` for external sources
- [x] Runtime assertion with `MONO_G9_UNVALIDATED_INPUT_TO_OPGRAPH`

### Phase 5: Remaining Migration (FUTURE)
- [ ] Hardware presets (HardwareLibrary.tsx)
- [ ] Security/keys storage
- [ ] Lineage storage
- [ ] Factory/tooling storage

See `.claude/audits/g9-localStorage-audit.md` for full breakdown.

---

## Quick Reference

### Do's
- Use `readValidatedSafe()` for external JSON
- Use `markPacketAsValidated()` for internal builds
- Use `assertValidatedPacket()` for file/API imports
- Add Zod schemas for new external data types

### Don'ts
- Never call `localStorage.getItem()` directly (use unsafeStorage)
- Never cast to `Validated<T>` without validation
- Never use `as unknown as` for external data
- Never skip validation "just for testing"

---

## Error Handling

```typescript
import { isG9ViolationError, G9_ERROR_CODE } from './g9AssertValidPacket';

try {
  const validated = assertValidatedPacket(rawPacket);
} catch (e) {
  if (isG9ViolationError(e)) {
    // Handle G9 violation - show user-friendly error
    console.error(`G9 Violation: ${e.violations.join(', ')}`);
    showBlockerModal('Invalid packet data. Please re-export from designer.');
  } else {
    // Other error
    throw e;
  }
}
```

---

## Escalation Policy

### Adding to Trusted Modules Allowlist

1. **Create PR** with:
   - Justification for why this module needs trusted access
   - What external data source it handles
   - Alternative approaches considered

2. **Required approvals**:
   - Gate owner review
   - Security review (if handling external API data)

3. **Update CI patterns**:
   - Add `EXCEPT|markPacketAsValidated|**/your/module.ts`
   - Update `TRUSTED_MODULES_ALLOWLIST` in `g9AssertValidPacket.ts`

### Requesting Exception for Cast

Exceptions for `as ValidatedFactoryPacket` are **NOT granted** except:
- Test fixtures (`**/__tests__/**`)
- Migration scripts with expiry date

All other code MUST use `assertValidatedPacket()` or `markPacketAsValidated()` from trusted modules.

---

*Last updated: 2026-02-02*
*Gate Owner: @monolith-team*
