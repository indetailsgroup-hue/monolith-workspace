# G9 LocalStorage Audit Report

**Generated:** 2026-02-02
**Status:** 44 raw localStorage usages outside G9 boundary

## Summary

| Bucket | Files | Usages | Risk | Priority |
|--------|-------|--------|------|----------|
| A) UI Prefs | 2 | 3 | LOW | P1 (quick win) |
| B) Hardware Presets | 1 | 5 | MED | P2 |
| C) Security/Keys | 4 | 14 | HIGH | P4 (needs design) |
| D) Core Data/Store | 4 | 6 | HIGH | P3 |
| E) Telemetry/Lineage | 2 | 7 | MED | P3 |
| F) Factory/Tooling | 1 | 4 | MED | P3 |

---

## Bucket A: UI Preferences (LOW risk)

**Files:** 2 | **Usages:** 3 | **Risk:** LOW | **Priority:** P1

| File | Lines | Usage | Migration |
|------|-------|-------|-----------|
| `src/App.tsx` | 143, 420 | Theme storage | Use `appPrefs.ts` |
| `src/main.tsx` | 6 | Initial theme | Use `appPrefs.ts` |

**Proposed Solution:** Create `src/core/persistence/appPrefs.ts` with:
- `readTheme()` / `writeTheme()` - enum validated ("dark" | "light")
- Safe defaults, never throws

---

## Bucket B: Hardware Library Presets (MED risk)

**Files:** 1 | **Usages:** 5 | **Risk:** MED | **Priority:** P2

| File | Lines | Usage | Migration |
|------|-------|-------|-----------|
| `src/components/ui/HardwareLibrary.tsx` | 460, 478, 492, 529, 545 | Minifix presets & overrides | Use `unsafeStorage` + Zod schema |

**Proposed Solution:**
- Create `HardwarePresetsSchema` with Zod
- Migrate to `readValidatedSafe()` / `writeJson()`

---

## Bucket C: Security/Keys (HIGH risk)

**Files:** 4 | **Usages:** 14 | **Risk:** HIGH | **Priority:** P4 (needs design)

| File | Lines | Usage |
|------|-------|-------|
| `src/crypto/keyStore.ts` | 28, 40, 47, 68 | Ed25519 key pair storage |
| `src/release/keys/persistentRegistry.ts` | 34, 55, 98, 106, 114 | Key registry + active key |
| `src/release/keys/audit.ts` | 57, 73, 125 | Key operation audit log |
| `src/release/keys/revocationPolicy.ts` | 56, 84, 201 | Revocation policy storage |

**Risk Notes:**
- Crypto keys are sensitive - need careful schema design
- Production should use secure storage (Web Crypto keychain)
- MVP can use `unsafeStorage` but needs proper schemas

**Proposed Solution:**
- Design `KeyPairSchema`, `KeyRegistrySchema`, `AuditLogSchema`
- Add encryption-at-rest consideration for future

---

## Bucket D: Core Data/Store (HIGH risk)

**Files:** 4 | **Usages:** 6 | **Risk:** HIGH | **Priority:** P3

| File | Lines | Usage |
|------|-------|-------|
| `src/core/auth/roles.ts` | 79, 92 | User role storage |
| `src/core/jobRegistry/localStorageJobRegistry.ts` | 40, 57 | Job ID registry |
| `src/core/model/canonical/gate09.ts` | 291, 327 | Validated project persistence |
| `src/components/ui/SceneToolbar.tsx` | 413, 414 | Project clear (uses store keys) |

**Proposed Solution:**
- `roles.ts` → use `unsafeStorage` with enum schema
- `jobRegistry` → use `unsafeStorage` with array schema
- `gate09.ts` → already has Zod validation, just change storage calls
- `SceneToolbar.tsx` → use `remove()` from unsafeStorage

---

## Bucket E: Telemetry/Lineage (MED risk)

**Files:** 2 | **Usages:** 7 | **Risk:** MED | **Priority:** P3

| File | Lines | Usage |
|------|-------|-------|
| `src/core/lineage/lineageReader.ts` | 80, 401, 409, 426 | Read lineage JSONL |
| `src/core/lineage/lineageWriter.ts` | 134, 141, 285 | Write lineage JSONL |

**Proposed Solution:**
- Create `lineageStorage.ts` wrapper using `unsafeStorage`
- JSONL format doesn't need schema, just string validation

---

## Bucket F: Factory/Tooling (MED risk)

**Files:** 1 | **Usages:** 4 | **Risk:** MED | **Priority:** P3

| File | Lines | Usage |
|------|-------|-------|
| `src/factory/tooling/storage/indexedDbToolingStore.ts` | 411, 427, 439, 453 | Maintenance log backup |

**Proposed Solution:**
- Migrate to `unsafeStorage` with `MaintenanceLogSchema`

---

## Double-Cast (`as unknown as`) Analysis

| File | Line | Usage | Risk | Action |
|------|------|-------|------|--------|
| `buildOperationGraph.ts` | 89 | DrillMap type cast | MED | Review type definitions |
| `Cabinet3D.tsx` | 120, 1604, 1608 | Three.js event types | LOW | Internal type coercion |
| `gate09.ts` | 147, 187, 226, 274 | Branded types after Zod | LOW | Legitimate pattern |
| `factoryReceiptTypes.ts` | 221, 264 | After Zod validation | LOW | Legitimate |
| `normalizeSnapshot.ts` | 269, 309 | After schema validation | LOW | Legitimate |
| Others | various | Type escape hatches | LOW | Internal TypeScript |

**Action:** Add exceptions for legitimate internal type coercion patterns.

---

## Migration Priority

### Sprint 1 (Quick Wins)
- [x] G9 scope boundary created (unsafeStorage.ts)
- [ ] **Task G9.1:** UI Prefs → appPrefs.ts (3 usages)

### Sprint 2 (Medium)
- [ ] **Task G9.2:** Hardware Presets migration (5 usages)
- [ ] **Task G9.3:** Lineage wrapper (7 usages)
- [ ] **Task G9.4:** Core Data migration (6 usages)

### Sprint 3 (Needs Design)
- [ ] **Task G9.5:** Security/Keys redesign (14 usages)
- [ ] **Task G9.6:** Factory/Tooling migration (4 usages)

---

## CI Strategy

### Job A: G9 Blocking (MUST PASS)
```bash
npx ts-node scripts/gates/bypass-scan.ts --gate G9 --scope
# Requires: BLOCK=0, WARN-HIGH=0
```

### Job B: Full Repo Report (INFORMATIONAL)
```bash
npx ts-node scripts/gates/bypass-scan.ts --gate G9 --json > bypass-report.json
# Outputs: categorized report + trend counters
```
