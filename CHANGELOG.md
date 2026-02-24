# Changelog

All notable changes to the Monolith project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] - 2026-01-22

### 🏭 Factory-Ready CNC Pipeline (Phases D1–D3.3)

This release marks the completion of the **Trust Chain for CNC Manufacturing**.
The entire pipeline from Designer Intent → Verified Packet → G-code → Factory is now
cryptographically secured and deterministic.

**Test Coverage:** 867 tests passing

---

### Added

#### Phase D1: DrillMap → Operation Graph
- **Operation Types** (`src/cnc/operation/operationTypes.ts`)
  - `DrillOperation`: Standard drilling with depth, feedRate, throughHole
  - `PeckDrillOperation`: Deep hole drilling with peck depth
  - `BoringOperation`: Precision boring
  - `CounterboreOperation`: Counterbore with pilot
  - `CountersinkOperation`: Countersink with angle
  - `TapOperation`: Thread tapping with pitch
  - `HelicalMillOperation`: Helical interpolation

- **Operation Graph Builder** (`src/cnc/mapping/`)
  - `mapDrillMapToOps()`: Convert DrillMap points → Operations
  - `mapMinifixToOps()`: Convert Minifix connector pairs → Drill operations
  - `buildOperationGraph()`: Complete DrillMap → OperationGraph
  - `validateOperationGraph()`: 12 safety validators

- **Machine Profiles** (`src/cnc/machine/`)
  - `KDT` preset: Nested-based router (3-axis)
  - `BIESSE` preset: Pod-and-rail CNC

#### Phase D2: Operation Graph → G-code
- **Post Processors** (`src/cnc/post/`)
  - `FANUC` dialect: Standard ISO G-code (G81/G83)
  - `BIESSE_ISO` dialect: Biesse-compatible ISO

- **G-code Builder** (`src/cnc/post/gcodeBuilder.ts`)
  - Header/footer generation with checksums
  - Tool change management
  - Feed/speed optimization
  - Deterministic output (sorted operations)

- **G-code Bundle** (`src/cnc/buildGcodeBundle.ts`)
  - Complete pipeline: Packet → DrillMap → Ops → G-code
  - SHA-256 verification at each step

#### Phase D3.1: CNC Bundle ZIP
- **Bundle Format** (`src/cnc/bundle/`)
  - Deterministic ZIP creation (fixed timestamps)
  - `cnc-manifest.json`: Factory-verifiable manifest
  - `opgraph.json`: Operation graph for audit
  - `checksums.sha256`: File integrity checksums
  - `nc/*.nc`: G-code program files

- **Manifest Schema** (`monolith.cnc.manifest@1.0`)
  ```typescript
  interface CncManifest {
    schema: 'monolith.cnc.manifest@1.0';
    jobId: string;
    machineId: string;
    packetContentHash?: string;  // Trust chain linkage
    opGraphHash: string;         // SHA-256 of opgraph.json
    gcodeSha256: string;         // SHA-256 of G-code
    post: { dialect: CncDialect; postVersion: string };
    createdAt: number;
    files: CncManifestFileEntry[];
    stats?: CncManifestStats;
  }
  ```

#### Phase D3.2: CNC Cache (IndexedDB)
- **Deterministic Cache Keys** (`src/cnc/cache/cncCacheKey.ts`)
  - Cache key = SHA-256(packetContentHash + machineId + dialect + postVersion)
  - Same inputs → guaranteed same cache key

- **IndexedDB Store** (`src/cnc/cache/indexedDbCncStore.ts`)
  - Persistent CNC bundle storage
  - Metadata indexing by jobId, cachedAt
  - LRU eviction support

- **Cache Helpers** (`src/cnc/cache/cncCacheHelpers.ts`)
  - `getCachedBundle()`: Basic cache lookup
  - `cacheBundle()`: Store with deterministic key
  - `invalidateJobCache()`: Job-level cache invalidation

#### Phase D3.3: Re-verify on Load
- **Strict Verification Policy** (`src/factory/verify/`)
  - Cache hits only returned if verification passes
  - Tamper detection: G-code hash, OpGraph hash
  - Linkage verification: packetContentHash must match
  - Post version mismatch → STALE (not FAIL)
  - Auto-invalidation of corrupted entries

- **Verification Functions**
  - `reverifyCncBundleFromIndexedDb()`: Full re-verification
  - `getVerifiedCachedBundle()`: Verified cache lookup
  - `isCncBundleValid()`: Quick validity check
  - `invalidateIfVerifyFailed()`: Cleanup corrupted entries

---

### API Contracts (Stable)

These interfaces are **guaranteed stable** for factory integration:

#### CNC Manifest (`cnc-manifest.json`)
```json
{
  "schema": "monolith.cnc.manifest@1.0",
  "jobId": "JOB-12345678",
  "machineId": "KDT",
  "packetContentHash": "abc123...",
  "opGraphHash": "def456...",
  "gcodeSha256": "789ghi...",
  "post": {
    "dialect": "FANUC",
    "postVersion": "1.0.0"
  },
  "createdAt": 1704067200000,
  "files": [
    { "path": "nc/PROG001.nc", "bytes": 1234, "sha256": "..." }
  ]
}
```

#### Operation Graph (`opgraph.json`)
```json
{
  "machineId": "KDT",
  "operations": [
    {
      "id": "drill-001",
      "type": "DRILL",
      "toolId": "DRILL_5",
      "position": { "x": 100, "y": 100, "z": 0 },
      "depth": 13,
      "feedRate": 500,
      "throughHole": false,
      "sourceId": "point-001"
    }
  ],
  "toolsUsed": ["DRILL_5"],
  "safeZ": 50,
  "rapidZ": 60,
  "metadata": {
    "jobId": "job-001",
    "sourceContentHash": "hash-001",
    "builtAt": "2024-01-01T00:00:00Z",
    "toolVersion": "monolith@2.1.0"
  }
}
```

#### Cache Key Format
```
SHA-256(packetContentHash + machineId + dialect + postVersion)
```

---

### Verification Guarantees

| Check | Description | Failure Mode |
|-------|-------------|--------------|
| G-code Hash | SHA-256 of .nc file matches manifest | `E_BUNDLE_GCODE_HASH_MISMATCH` |
| OpGraph Hash | SHA-256 of opgraph.json matches manifest | `E_BUNDLE_OPGRAPH_HASH_MISMATCH` |
| Packet Linkage | packetContentHash matches expected | `STALE` (not FAIL) |
| Post Version | postVersion matches current | `STALE` (not FAIL) |
| ZIP Integrity | ZIP can be extracted | `E_BUNDLE_CORRUPT` |
| Manifest Schema | Schema matches `monolith.cnc.manifest@1.0` | `E_BUNDLE_MANIFEST_INVALID` |

---

### What's NOT in This Release (Planned for D4/D5)

- ❌ Workpiece coordinate system (panel origin, face selection)
- ❌ Multi-face drilling (TOP/BOTTOM face logic)
- ❌ Panel flip/mirror/rotation transforms
- ❌ Advanced drilling cycles (G83 peck parameters)
- ❌ Material-aware feed/speed tables
- ❌ Coolant/spindle control
- ❌ Nesting / multi-part programs

---

### Dependencies

- Node.js 18+
- TypeScript 5.x
- Vite 5.x
- Vitest 3.0.0 (downgraded from 4.x due to jsdom compatibility)
- JSZip 3.x

---

### Migration Notes

**For Factory Integration:**
1. Parse `cnc-manifest.json` from bundle ZIP
2. Verify `gcodeSha256` against actual G-code file
3. Check `post.postVersion` matches expected version
4. Trust `packetContentHash` for audit trail linkage

**For Cache Consumers:**
- Use `getVerifiedCachedBundle()` instead of `getCachedBundle()` for strict policy
- Handle `STALE` status separately from `FAIL` (stale = regenerate, fail = investigate)

---

### Contributors

- Trust Chain Architecture
- CNC Pipeline Implementation
- Test Infrastructure (867 tests)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>

---

## [2.0.0] - Previous Release

Initial release with:
- Cabinet design system
- Parametric constraints
- Gate validation
- Factory packet generation
- Release workflow (DRAFT → FROZEN → GATED → RELEASED)

