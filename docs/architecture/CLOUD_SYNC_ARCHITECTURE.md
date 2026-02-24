# T029: Cloud Sync Architecture

> Real-Time Collaborative Design with Offline Support

**Version:** 1.0.0
**Status:** Phase 1 Complete (Local Persistence), Phases 2-5 Pending

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Research Summary](#research-summary)
3. [Architecture Options](#architecture-options)
4. [Proposed Architecture](#proposed-architecture)
5. [Implemented Architecture (Phase 1)](#implemented-architecture-phase-1)
6. [CRDT Implementation](#crdt-implementation)
7. [Security Model](#security-model)
8. [Implementation Phases](#implementation-phases)
9. [Test Coverage](#test-coverage)
10. [Trade-offs & Decisions](#trade-offs--decisions)

---

## Problem Statement

### Business Need

Enable users to:
- **Sync projects** across devices (laptop ↔ tablet ↔ desktop)
- **Collaborate** in real-time with team members
- **Work offline** and sync when connected
- **Version history** and rollback capabilities

### Technical Challenges

| Challenge | Difficulty |
|-----------|------------|
| **Conflict Resolution** | High - CAD operations don't always commute |
| **Large File Sync** | Medium - Textures, models can be large |
| **Real-Time Updates** | Medium - Sub-second latency expected |
| **Offline Support** | High - Full functionality without network |
| **Security** | High - Design IP is sensitive |

### CAD-Specific Complexity

Unlike text documents, CAD operations have complex dependencies:
- Moving a panel affects connected hardware
- Changing dimensions cascades to child objects
- Feature order matters (dependency graph)

---

## Research Summary

### CRDT for CAD Systems

[Research from ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S147403461730486X) proposes:

> "A novel CRDT-based synchronization approach for real-time Co-CAD systems defining three feature-based operation relations: dependency-conflict, mutual exclusive, and compatible relations."

Key findings:
- Feature-based conflict detection mechanism
- Conflict resolution under CRDT framework
- Handles sophisticated CAD objects

### Modern CRDT Libraries

| Library | Language | Strengths | Weaknesses |
|---------|----------|-----------|------------|
| **[Yjs](https://yjs.dev)** | TypeScript | Mature, many bindings | Complex for CAD |
| **[Automerge](https://automerge.org)** | Rust/JS | Academic backing | Performance at scale |
| **[Loro](https://loro.dev)** | Rust/WASM | Fast, rich types | Newer, less proven |
| **[Replicache](https://replicache.dev)** | TypeScript | Full sync framework | Commercial |

### 3D Collaborative Editing

[ACM research](https://dl.acm.org/doi/10.1145/3627915.3627919) proposes:

> "Using list CRDTs to represent 3D models since each individual part of a model can be expressed as an ordered list of modeling operations."

Strategies for:
- Exclusive conflicts (two users editing same object)
- Compatible conflicts (independent edits merge)
- Automatic resolution vs user decision

### Security Considerations

[End-to-end encryption for CAD/PLM](https://novedge.com/blogs/design-news/end-to-end-encryption-for-cad-plm-protecting-design-ip-in-cloud-workflows):

> "Use CRDTs or OT where each user signs their operations with a device-bound key. The server sequences ciphertext operations, and clients perform conflict resolution locally."

---

## Architecture Options

### Option A: Server-Centric (Traditional)

```
Client A ──┐
           ├──→ Server (source of truth) ──→ Database
Client B ──┘
```

**Pros:**
- Simpler conflict resolution (last-write-wins)
- Centralized audit trail
- Easier access control

**Cons:**
- Requires connection for edits
- Server is bottleneck
- Higher latency

### Option B: CRDT-Based (Distributed)

```
Client A ←──→ Sync Server ←──→ Client B
    ↓                              ↓
Local DB                      Local DB
```

**Pros:**
- Full offline support
- Low latency (local-first)
- Server is optional relay

**Cons:**
- Complex conflict resolution
- Larger client-side storage
- Harder to implement correctly

### Option C: Hybrid

```
Client A ←──→ Sync Server ←──→ Client B
    ↓              ↓              ↓
Local DB    Master DB       Local DB
```

**Pros:**
- Best of both worlds
- Server validates/authorizes
- Clients work offline

**Cons:**
- Most complex
- Dual consistency models

---

## Proposed Architecture

### Recommended: Hybrid with Yjs

```
┌─────────────────────────────────────────────────────────────┐
│                        Client                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Monolith App                          ││
│  │  ┌─────────┐    ┌─────────┐    ┌─────────────────────┐  ││
│  │  │ Zustand │←──→│  Yjs    │←──→│  IndexedDB          │  ││
│  │  │ Stores  │    │  Doc    │    │  (y-indexeddb)      │  ││
│  │  └─────────┘    └────┬────┘    └─────────────────────┘  ││
│  └──────────────────────│───────────────────────────────────┘│
└──────────────────────────│───────────────────────────────────┘
                           │
                    WebSocket / WebRTC
                           │
┌──────────────────────────│───────────────────────────────────┐
│                    Sync Server                               │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  ┌─────────┐    ┌─────────┐    ┌─────────────────────┐  ││
│  │  │  Auth   │    │  Yjs    │    │  PostgreSQL         │  ││
│  │  │ Service │    │ Server  │    │  (snapshots)        │  ││
│  │  └─────────┘    └─────────┘    └─────────────────────┘  ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Yjs Doc** | CRDT document, conflict-free merging |
| **y-indexeddb** | Local persistence for offline |
| **y-websocket** | Real-time sync with server |
| **Auth Service** | User authentication, project access |
| **Snapshot Service** | Periodic full-state backups |

---

## Implemented Architecture (Phase 1)

Phase 1 (Local Persistence) is fully implemented with 75 passing tests.

### Module Structure

```
src/core/sync/
├── types.ts              # Domain types, configs, constants
├── yjsDocument.ts        # Y.Doc factory, populate, extract, snapshot
├── yjsProvider.ts        # IndexedDB persistence (y-indexeddb)
├── yjsBridge.ts          # Zustand ↔ Yjs bidirectional bridge
├── yjsMigration.ts       # localStorage → IndexedDB one-time migration
├── syncOrchestrator.ts   # High-level lifecycle orchestrator
├── index.ts              # Barrel exports
└── __tests__/
    ├── yjsDocument.test.ts       # 25 tests
    ├── yjsBridge.test.ts         # 17 tests
    ├── yjsMigration.test.ts      # 19 tests
    └── syncOrchestrator.test.ts  # 14 tests
```

### Data Flow

```
initSync(projectId, callbacks)
  → createMonolithDoc()          Create Y.Doc with 4 shared types
  → connect(projectId, doc)      Attach y-indexeddb provider
  → await provider.whenSynced    Wait for IndexedDB data load
  → migrateFromLocalStorage()    One-time localStorage migration (if empty)
  → setupBridge(mdoc, callbacks) Wire Zustand ↔ Yjs observers
  → extractAll() → callbacks     Push initial data to Zustand stores
  → return SyncSession           { pushToDoc, pushToDocImmediate, destroy }
```

### MonolithDoc (Implemented)

```typescript
interface MonolithDoc {
  doc: Y.Doc;
  cabinet: Y.Map<any>;       // Active cabinet data (dimensions, panels, etc.)
  metadata: Y.Map<any>;      // Project metadata (id, name, version, etc.)
  cabinets: Y.Array<any>;    // Scene cabinet list (positions, rotations)
  materials: Y.Map<any>;     // Material configuration & palette
}
```

### Key Design Decisions (Phase 1)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Shared types** | 4 Y.Map/Y.Array (not nested) | Flat structure = simpler observers |
| **Anti-loop** | `BRIDGE_ORIGIN` transaction marker + `_isBridgeWriting` flag | Prevents Zustand ↔ Yjs infinite loop |
| **Debouncing** | 300ms for Zustand → Yjs writes | Prevents flooding during dimension dragging |
| **Migration** | Flag-based idempotent, preserves localStorage | Safe rollback, one-time operation |
| **Population** | Single Y.Doc transaction for all writes | Atomic updates, single observer notification |
| **IndexedDB naming** | `monolith-yjs-{projectId}` | Per-project isolation |

### Usage Example

```typescript
import { initSync, destroySync } from '@/core/sync';

// Start sync
const session = await initSync('proj-123', {
  onCabinetUpdate: (cabinet) => useCabinetStore.setState({ cabinet }),
  onMetadataUpdate: (metadata) => useProjectStore.setState({ metadata }),
  onCabinetsUpdate: (cabinets) => useCabinetStore.setState({ cabinets }),
});

// Push local changes (debounced)
session.pushToDoc({ cabinet: serializeCabinet(currentCabinet) });

// Push immediately (no debounce)
session.pushToDocImmediate({ metadata: { id: 'proj-123', name: 'Updated' } });

// Cleanup
session.destroy();
```

---

## CRDT Implementation

### Document Structure (Implemented)

```typescript
import * as Y from 'yjs';

interface MonolithDoc {
  doc: Y.Doc;
  cabinet: Y.Map<any>;       // Cabinet geometry, materials, panels
  metadata: Y.Map<any>;      // Project metadata
  cabinets: Y.Array<any>;    // Scene cabinet list
  materials: Y.Map<any>;     // Material configuration
}

function createMonolithDoc(clientId?: number): MonolithDoc {
  const doc = new Y.Doc(clientId != null ? { guid: `monolith-${clientId}` } : undefined);
  if (clientId != null) doc.clientID = clientId;

  return {
    doc,
    cabinet: doc.getMap('cabinet'),
    metadata: doc.getMap('metadata'),
    cabinets: doc.getArray('cabinets'),
    materials: doc.getMap('materials'),
  };
}
```

### Syncing with Zustand (Implemented)

The bridge uses `observeDeep` for Y.Map types and `observe` for Y.Array, with an anti-loop mechanism:

```typescript
// Bridge setup (simplified)
function setupBridge(mdoc: MonolithDoc, callbacks: BridgeCallbacks, config: BridgeConfig) {
  let _isBridgeWriting = false;
  const BRIDGE_ORIGIN = 'zustand-bridge';

  // Y.Doc → Zustand (on external changes only)
  mdoc.cabinet.observeDeep((events, txn) => {
    if (_isBridgeWriting || txn.origin === BRIDGE_ORIGIN) return; // Anti-loop
    callbacks.onCabinetUpdate(mdoc.cabinet.toJSON());
  });

  // Zustand → Y.Doc (debounced, with bridge origin marker)
  function pushToDocImmediate(data: { cabinet?: Record<string, any> }) {
    _isBridgeWriting = true;
    mdoc.doc.transact(() => {
      if (data.cabinet) {
        mdoc.cabinet.clear();
        for (const [k, v] of Object.entries(data.cabinet)) {
          mdoc.cabinet.set(k, v);
        }
      }
    }, BRIDGE_ORIGIN);
    _isBridgeWriting = false;
  }
}
```

### Conflict Resolution Strategies

#### 1. Last-Writer-Wins (LWW) for Simple Values

```typescript
// Dimensions: simple LWW is fine
ydoc.cabinet.set('width', 800);  // Both clients can set, last wins
```

#### 2. Operation-Based for Collections

```typescript
// Panels: use Y.Array for ordered collection
function addPanel(ydoc: MonolithDoc, panel: Panel) {
  ydoc.panels.push([new Y.Map(Object.entries(panel))]);
}

function removePanel(ydoc: MonolithDoc, index: number) {
  ydoc.panels.delete(index, 1);
}
```

#### 3. Custom Resolution for CAD-Specific Conflicts

```typescript
// Hardware placement: detect and resolve conflicts
interface HardwareConflict {
  type: 'POSITION_OVERLAP' | 'DEPENDENCY_BROKEN' | 'CONSTRAINT_VIOLATION';
  items: string[];  // Hardware IDs in conflict
}

function detectHardwareConflicts(ydoc: MonolithDoc): HardwareConflict[] {
  const hardware = ydoc.hardware.toArray();
  const conflicts: HardwareConflict[] = [];

  // Check for overlapping positions
  for (let i = 0; i < hardware.length; i++) {
    for (let j = i + 1; j < hardware.length; j++) {
      if (positionsOverlap(hardware[i], hardware[j])) {
        conflicts.push({
          type: 'POSITION_OVERLAP',
          items: [hardware[i].get('id'), hardware[j].get('id')],
        });
      }
    }
  }

  return conflicts;
}
```

### Awareness (Presence)

```typescript
import { Awareness } from 'y-protocols/awareness';

interface UserPresence {
  name: string;
  color: string;
  selectedPanelId: string | null;
  cursor: { x: number; y: number } | null;
}

function setupAwareness(awareness: Awareness, userId: string) {
  // Set local user state
  awareness.setLocalStateField('user', {
    name: 'User Name',
    color: '#8b5cf6',
    selectedPanelId: null,
    cursor: null,
  });

  // Listen for remote users
  awareness.on('change', () => {
    const states = awareness.getStates();
    states.forEach((state, clientId) => {
      if (clientId !== awareness.clientID) {
        // Show remote user's cursor/selection
        showRemoteUser(state.user);
      }
    });
  });
}
```

---

## Security Model

### Authentication

```typescript
interface AuthProvider {
  // OAuth2 / OpenID Connect
  signIn(provider: 'google' | 'github' | 'email'): Promise<User>;
  signOut(): Promise<void>;
  getToken(): Promise<string>;
}
```

### Authorization

```typescript
interface ProjectPermission {
  projectId: string;
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
}

// Server-side validation
function canEdit(permission: ProjectPermission): boolean {
  return permission.role === 'owner' || permission.role === 'editor';
}
```

### End-to-End Encryption (Future)

```typescript
interface E2EEConfig {
  enabled: boolean;
  keyDerivation: 'PBKDF2' | 'Argon2';
  encryption: 'AES-GCM-256';
}

// Client-side encryption before sync
async function encryptUpdate(update: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    update
  );
  return new Uint8Array([...iv, ...new Uint8Array(encrypted)]);
}
```

---

## Implementation Phases

### Phase 1: Local Persistence (Foundation) — COMPLETE

**Status:** Implemented and tested (75/75 tests passing)

**Scope:**
- IndexedDB storage with y-indexeddb
- Auto-save on changes
- Load from local on startup

**Delivered:**
- `yjsDocument.ts` — Y.Doc factory, population, extraction, snapshots
- `yjsProvider.ts` — IndexedDB persistence via y-indexeddb
- `yjsBridge.ts` — Zustand ↔ Yjs bidirectional bridge with anti-loop
- `yjsMigration.ts` — One-time localStorage → IndexedDB migration
- `syncOrchestrator.ts` — High-level lifecycle orchestrator with `initSync`/`destroySync`
- `types.ts` — Full type system (MonolithDoc, SyncState, configs)
- `index.ts` — Public API barrel exports
- 4 test files with 75 tests covering all modules

**Dependencies Added:** `yjs@^13.6.29`, `y-indexeddb@^9.0.12`

### Phase 2: Manual Sync (Cloud Backup)

**Scope:**
- Manual "sync to cloud" button
- Simple REST API for uploads
- Download/restore functionality

**Deliverables:**
- Sync server (basic)
- Cloud storage integration
- UI for sync status

**Estimated Effort:** 4-5 days

### Phase 3: Real-Time Sync

**Scope:**
- WebSocket connection
- Automatic background sync
- Conflict notification

**Deliverables:**
- y-websocket provider
- Connection status UI
- Offline queue

**Estimated Effort:** 5-7 days

### Phase 4: Collaboration

**Scope:**
- Multi-user awareness
- Remote cursor display
- Selection highlighting

**Deliverables:**
- Awareness integration
- Collaboration UI
- User presence indicators

**Estimated Effort:** 4-5 days

### Phase 5: Advanced Features

**Scope:**
- Version history
- Branching/merging
- E2E encryption

**Deliverables:**
- History viewer
- Branch UI
- Security layer

**Estimated Effort:** 7-10 days

---

## Test Coverage

### Phase 1 Tests (75 total, all passing)

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `yjsDocument.test.ts` | 25 | Doc creation, populate/extract (cabinet, metadata, cabinets, materials), extractAll, snapshot/restore, transaction atomicity, destroy |
| `yjsBridge.test.ts` | 17 | Lifecycle (setup/dispose/replace), Y.Doc→Zustand observers, Zustand→Y.Doc push, anti-loop mechanism, debouncing, multi-type push |
| `yjsMigration.test.ts` | 19 | hasMigrated flag, successful migration (data integrity, cabinet count, flag set, backup preserved), idempotency, force mode, no-data handling, invalid JSON/missing fields |
| `syncOrchestrator.test.ts` | 14 | initSync lifecycle, migration integration, pushToDoc/pushToDocImmediate, destroySync cleanup, IndexedDB round-trip, error handling |

### Running Sync Tests

```bash
# All sync tests
npx vitest run src/core/sync/ --reporter=verbose

# Specific module
npx vitest run src/core/sync/__tests__/yjsBridge.test.ts
```

---

## Trade-offs & Decisions

### Decision 1: Yjs over Automerge

**Choice:** Use Yjs for CRDT implementation

**Rationale:**
- More mature ecosystem
- Better TypeScript support
- Proven at scale (Notion, etc.)
- y-indexeddb for offline

**Impact:** Simpler integration, community support

---

### Decision 2: Hybrid Sync Model

**Choice:** Local-first with server backup

**Rationale:**
- Full offline support
- Fast local operations
- Server provides durability + sharing

**Impact:** More complex, but best UX

---

### Decision 3: WebSocket for Real-Time

**Choice:** WebSocket over WebRTC

**Rationale:**
- Simpler NAT traversal
- Server can log/audit
- Easier to implement

**Impact:** Requires server, but more reliable

---

### Decision 4: Eventual Consistency

**Choice:** Accept eventual consistency for most data

**Rationale:**
- Immediate feedback to users
- Conflicts rare in practice
- Can show conflict UI when needed

**Impact:** Users may briefly see inconsistent state

---

### Decision 5: Defer E2E Encryption

**Choice:** Implement E2EE in Phase 5

**Rationale:**
- Significant complexity
- Not blocking for MVP
- Can add later without breaking changes

**Impact:** Initial version trusts server

---

## References

- [A novel CRDT-based synchronization method for real-time collaborative CAD systems](https://www.sciencedirect.com/science/article/abs/pii/S147403461730486X)
- [3D Collaborative Editing via List CRDTs](https://dl.acm.org/doi/10.1145/3627915.3627919)
- [Yjs Documentation](https://yjs.dev)
- [Loro CRDT](https://loro.dev/docs/concepts/crdt)
- [CRDT.tech](https://crdt.tech/)
- [TypeScript CRDT Toolkits](https://medium.com/@2nick2patel2/typescript-crdt-toolkits-for-offline-first-apps-conflict-free-sync-without-tears-df456c7a169b)
- [E2E Encryption for CAD/PLM](https://novedge.com/blogs/design-news/end-to-end-encryption-for-cad-plm-protecting-design-ip-in-cloud-workflows)

---

*Document created: February 2026*
*Phase 1 implemented: February 2026*
*Last updated: February 2026*
