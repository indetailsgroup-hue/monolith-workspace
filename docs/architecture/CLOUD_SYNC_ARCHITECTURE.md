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

### Phase 2: Manual Sync (Cloud Backup) — ⏳ NOT STARTED

**Scope:**
- Manual "Sync to Cloud" / "Download from Cloud" buttons
- Simple REST API for Y.Doc state vector uploads
- Download/restore functionality with conflict detection

**Planned Architecture:**

```
src/core/sync/
├── cloudSync.ts              # Manual sync orchestrator
├── cloudClient.ts            # REST API client
├── cloudTypes.ts             # Cloud-specific types
└── __tests__/
    ├── cloudSync.test.ts
    └── cloudClient.test.ts

server/                        # Separate deployment
├── src/
│   ├── index.ts              # Express server entry
│   ├── routes/sync.ts        # POST /sync, GET /sync/:projectId
│   ├── storage/s3.ts         # S3-compatible blob storage
│   └── auth/middleware.ts    # JWT validation
└── package.json
```

**API Design:**

```typescript
// Client-side
interface CloudSyncClient {
  upload(projectId: string, stateVector: Uint8Array): Promise<SyncReceipt>;
  download(projectId: string): Promise<Uint8Array | null>;
  getStatus(projectId: string): Promise<CloudProjectStatus>;
}

interface SyncReceipt {
  projectId: string;
  version: number;
  uploadedAt: number;        // Server timestamp
  sizeBytes: number;
  sha256: string;
}

interface CloudProjectStatus {
  exists: boolean;
  lastSyncedAt: number | null;
  version: number;
  sizeBytes: number;
}
```

**REST Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sync/:projectId` | Upload Y.Doc state vector |
| `GET` | `/api/sync/:projectId` | Download latest state vector |
| `GET` | `/api/sync/:projectId/status` | Get sync status |
| `DELETE` | `/api/sync/:projectId` | Delete cloud backup |

**UI Components:**

```tsx
// SyncStatusBar in project toolbar
<SyncStatusBar>
  <SyncIndicator status="local_only" />  {/* or "synced" | "pending" | "conflict" */}
  <Button onClick={uploadToCloud}>Sync to Cloud</Button>
  <Button onClick={downloadFromCloud}>Download</Button>
  <Text>Last synced: 5 min ago</Text>
</SyncStatusBar>
```

**Conflict Detection:**

```typescript
// On download, compare local vs cloud versions
type SyncConflict = {
  type: 'LOCAL_NEWER' | 'CLOUD_NEWER' | 'DIVERGED';
  localVersion: number;
  cloudVersion: number;
  resolution: 'KEEP_LOCAL' | 'KEEP_CLOUD' | 'MERGE';  // User choice
};
```

**Storage Backend:**
- S3-compatible (AWS S3, MinIO, Cloudflare R2)
- Blobs stored as `{projectId}/{version}.ystate`
- Max 5 versions retained per project
- Total storage limit: 100MB per user (configurable)

**Deliverables:**
- `cloudSync.ts` — Manual sync orchestrator (upload/download/conflict detection)
- `cloudClient.ts` — REST API client with retry and error handling
- `SyncStatusBar.tsx` — Sync status indicator + manual sync buttons
- Server: Express + S3 storage + JWT auth
- 20+ tests

**Estimated Effort:** 4-5 days

### Phase 3: Real-Time Sync — ⏳ NOT STARTED

**Scope:**
- WebSocket connection with y-websocket provider
- Automatic background sync (no manual button needed)
- Connection status indicator and offline queue

**Planned Architecture:**

```
src/core/sync/
├── realtimeProvider.ts       # y-websocket wrapper
├── connectionManager.ts      # Reconnection, heartbeat, status
├── offlineQueue.ts           # Queue edits while offline
└── __tests__/
    ├── realtimeProvider.test.ts
    └── connectionManager.test.ts

server/
├── src/
│   ├── ws/
│   │   ├── yjsWebSocket.ts  # y-websocket server
│   │   ├── roomManager.ts   # Project room lifecycle
│   │   └── persistence.ts   # Snapshot on disconnect
│   └── ...existing routes
```

**WebSocket Integration:**

```typescript
import { WebsocketProvider } from 'y-websocket';

interface RealtimeConfig {
  serverUrl: string;           // wss://sync.monolith.app
  token: string;               // JWT auth token
  reconnectInterval: number;   // ms (default: 1000, max: 30000 with backoff)
  maxReconnectAttempts: number; // Default: 50
}

interface RealtimeProvider {
  connect(projectId: string, doc: Y.Doc, config: RealtimeConfig): void;
  disconnect(): void;
  getStatus(): ConnectionStatus;
  onStatusChange(cb: (status: ConnectionStatus) => void): () => void;
}

type ConnectionStatus =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'ERROR';
```

**Offline Queue:**

```typescript
interface OfflineQueue {
  // Edits made while disconnected are buffered in Y.Doc automatically
  // On reconnect, y-websocket syncs the diff
  pendingUpdates: number;      // Count of unsynced changes
  oldestPendingAt: number;     // Timestamp of oldest pending change
}
```

**Connection Manager:**

```typescript
// Exponential backoff reconnection
const BACKOFF = {
  initial: 1000,      // 1s
  multiplier: 1.5,
  max: 30000,         // 30s cap
  jitter: 0.2,        // ±20% randomization
};

// Heartbeat to detect stale connections
const HEARTBEAT_INTERVAL = 30000;  // 30s
const HEARTBEAT_TIMEOUT = 5000;    // 5s to respond
```

**UI Components:**

```tsx
// ConnectionIndicator in app header
<ConnectionIndicator status={connectionStatus}>
  {status === 'CONNECTED' && <GreenDot />}
  {status === 'RECONNECTING' && <PulsingYellowDot />}
  {status === 'DISCONNECTED' && <RedDot label="Offline" />}
</ConnectionIndicator>

// Pending changes indicator
{pendingUpdates > 0 && (
  <Badge>{pendingUpdates} unsaved changes</Badge>
)}
```

**Server-Side:**

```typescript
// Room manager tracks active project sessions
interface Room {
  projectId: string;
  doc: Y.Doc;
  clients: Set<WebSocket>;
  lastActivity: number;
  // Auto-persist snapshot every 60s or on last client disconnect
}
```

**Deliverables:**
- `realtimeProvider.ts` — y-websocket wrapper with auth token injection
- `connectionManager.ts` — Reconnection with exponential backoff + heartbeat
- `offlineQueue.ts` — Pending changes tracking (leverages Y.Doc built-in)
- `ConnectionIndicator.tsx` — Status dot + offline badge
- Server: y-websocket server + room manager + snapshot persistence
- 25+ tests

**Estimated Effort:** 5-7 days

### Phase 4: Collaboration — ⏳ NOT STARTED

**Scope:**
- Multi-user awareness (who's online, what they're editing)
- Remote cursor display in 3D viewport
- Panel selection highlighting across users

**Planned Architecture:**

```
src/core/sync/
├── awareness.ts              # Awareness protocol setup
├── presenceTypes.ts          # User presence types
└── __tests__/
    └── awareness.test.ts

src/components/
├── collaboration/
│   ├── UserAvatarStack.tsx   # Online user avatars
│   ├── RemoteCursor.tsx      # 3D cursor overlay
│   ├── PanelHighlight.tsx    # Remote selection highlight
│   └── CollaborationBar.tsx  # Collaboration toolbar
```

**Awareness Protocol:**

```typescript
import { Awareness } from 'y-protocols/awareness';

interface UserPresence {
  userId: string;
  name: string;
  avatarUrl: string | null;
  color: string;              // Unique color per user (assigned from palette)
  selectedPanelId: string | null;
  selectedCabinetId: string | null;
  cursor3D: { x: number; y: number; z: number } | null;
  activeTab: string;          // Which panel tab is active
  lastActivity: number;       // For idle detection
  status: 'ACTIVE' | 'IDLE' | 'AWAY';  // Idle after 5min, away after 15min
}

// Color palette for collaborative users (max 8 concurrent)
const USER_COLORS = [
  '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
];

function setupAwareness(awareness: Awareness, localUser: UserPresence): {
  setSelection: (panelId: string | null) => void;
  setCursor3D: (pos: { x: number; y: number; z: number } | null) => void;
  getRemoteUsers: () => UserPresence[];
  onRemoteChange: (cb: (users: UserPresence[]) => void) => () => void;
  destroy: () => void;
};
```

**3D Cursor Rendering:**

```typescript
// Render remote cursors in Three.js scene
interface RemoteCursorOverlay {
  userId: string;
  color: string;
  position: THREE.Vector3;
  label: string;              // User name
}

// Throttle cursor updates to 10 FPS to minimize network traffic
const CURSOR_THROTTLE_MS = 100;
```

**Panel Selection Highlight:**

```typescript
// When remote user selects a panel, highlight it with their color
interface RemoteSelection {
  userId: string;
  panelId: string;
  color: string;
  userName: string;
}

// Visual: colored outline (2px) around selected panel mesh
// Label: userName badge floating above panel
```

**UI Components:**

```tsx
// UserAvatarStack — top-right corner
<UserAvatarStack>
  <Avatar name="Thai" color="#8b5cf6" status="active" />
  <Avatar name="John" color="#3b82f6" status="idle" />
  <OverflowBadge count={3} />   {/* "+3 more" */}
</UserAvatarStack>

// CollaborationBar — below toolbar
<CollaborationBar>
  <UserAvatarStack users={remoteUsers} />
  <Text>{remoteUsers.length + 1} collaborators</Text>
  <Button onClick={copyInviteLink}>Invite</Button>
</CollaborationBar>
```

**Deliverables:**
- `awareness.ts` — Awareness protocol setup with cursor/selection tracking
- `UserAvatarStack.tsx` — Online user avatar display
- `RemoteCursor.tsx` — 3D cursor overlay (Three.js integration)
- `PanelHighlight.tsx` — Remote panel selection highlight
- `CollaborationBar.tsx` — Collaboration toolbar with invite
- Idle detection (5min idle, 15min away)
- 20+ tests

**Estimated Effort:** 4-5 days

### Phase 5: Advanced Features — ⏳ NOT STARTED

**Scope:**
- Version history with snapshot timeline
- Branch/merge for design variants
- End-to-end encryption

**Planned Architecture:**

```
src/core/sync/
├── history/
│   ├── snapshotManager.ts    # Create/restore snapshots
│   ├── historyTypes.ts       # Snapshot, HistoryEntry types
│   └── diffViewer.ts         # Compare two snapshots
├── branching/
│   ├── branchManager.ts      # Create/switch/merge branches
│   └── branchTypes.ts        # Branch, MergeResult types
├── encryption/
│   ├── e2ee.ts               # Encrypt/decrypt Y.Doc updates
│   ├── keyManager.ts         # Key derivation, rotation
│   └── encryptionTypes.ts
└── __tests__/
    ├── snapshotManager.test.ts
    ├── branchManager.test.ts
    └── e2ee.test.ts

src/components/
├── history/
│   ├── HistoryTimeline.tsx    # Visual timeline of snapshots
│   ├── SnapshotPreview.tsx    # Preview a snapshot state
│   └── DiffViewer.tsx         # Side-by-side comparison
├── branching/
│   ├── BranchSelector.tsx     # Switch between branches
│   └── MergeDialog.tsx        # Merge confirmation
```

**Version History:**

```typescript
interface Snapshot {
  id: string;
  projectId: string;
  branchId: string;
  version: number;
  stateVector: Uint8Array;     // Full Y.Doc state
  metadata: {
    createdBy: string;
    createdAt: number;
    label?: string;            // User-provided label (e.g., "Before kitchen redesign")
    auto: boolean;             // Auto-snapshot vs manual
    cabinetCount: number;
    panelCount: number;
  };
  sizeBytes: number;
}

interface SnapshotManager {
  createSnapshot(label?: string): Promise<Snapshot>;
  listSnapshots(projectId: string): Promise<Snapshot[]>;
  restoreSnapshot(snapshotId: string): Promise<void>;
  deleteSnapshot(snapshotId: string): Promise<void>;
  compareSnapshots(a: string, b: string): Promise<SnapshotDiff>;
}

// Auto-snapshot triggers
const AUTO_SNAPSHOT_TRIGGERS = {
  onExport: true,              // Before CNC export
  onMajorChange: true,         // Cabinet add/delete
  intervalMinutes: 30,         // Periodic
  maxAutoSnapshots: 50,        // Per project
};
```

**Branching:**

```typescript
interface Branch {
  id: string;
  projectId: string;
  name: string;                // e.g., "kitchen-v2", "client-option-B"
  parentBranchId: string;
  parentSnapshotId: string;    // Fork point
  createdBy: string;
  createdAt: number;
  status: 'ACTIVE' | 'MERGED' | 'ARCHIVED';
}

interface BranchManager {
  createBranch(name: string): Promise<Branch>;
  switchBranch(branchId: string): Promise<void>;
  listBranches(projectId: string): Promise<Branch[]>;
  mergeBranch(source: string, target: string): Promise<MergeResult>;
  deleteBranch(branchId: string): Promise<void>;
}

interface MergeResult {
  success: boolean;
  conflicts: MergeConflict[];  // If any
  mergedSnapshot: Snapshot;
}

interface MergeConflict {
  path: string;                // e.g., "cabinet.width"
  localValue: unknown;
  remoteValue: unknown;
  resolution?: 'LOCAL' | 'REMOTE';  // User choice
}
```

**End-to-End Encryption:**

```typescript
interface E2EEConfig {
  enabled: boolean;
  algorithm: 'AES-GCM-256';
  keyDerivation: 'PBKDF2';
  iterations: 100000;
}

interface KeyManager {
  deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey>;
  rotateKey(oldKey: CryptoKey, newPassphrase: string): Promise<CryptoKey>;
  exportKey(key: CryptoKey): Promise<JsonWebKey>;
  importKey(jwk: JsonWebKey): Promise<CryptoKey>;
}

// Encrypt Y.Doc updates before sending to server
async function encryptUpdate(update: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, update);
  return new Uint8Array([...iv, ...new Uint8Array(encrypted)]);
}

// Decrypt Y.Doc updates received from server
async function decryptUpdate(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
  return new Uint8Array(decrypted);
}
```

**UI Components:**

```tsx
// HistoryTimeline — side panel
<HistoryTimeline snapshots={snapshots}>
  {snapshots.map(s => (
    <TimelineEntry
      key={s.id}
      label={s.metadata.label || `Auto-save`}
      date={s.metadata.createdAt}
      onPreview={() => previewSnapshot(s.id)}
      onRestore={() => restoreSnapshot(s.id)}
    />
  ))}
</HistoryTimeline>

// BranchSelector — project toolbar
<BranchSelector
  branches={branches}
  activeBranch={activeBranch}
  onSwitch={switchBranch}
  onMerge={openMergeDialog}
  onCreate={openCreateBranchDialog}
/>
```

**Deliverables:**
- `snapshotManager.ts` — Create/restore/compare snapshots
- `branchManager.ts` — Branch lifecycle and merge logic
- `e2ee.ts` — AES-GCM encryption/decryption for Y.Doc updates
- `keyManager.ts` — Key derivation (PBKDF2) and rotation
- `HistoryTimeline.tsx` — Visual snapshot timeline
- `BranchSelector.tsx` — Branch switching UI
- `MergeDialog.tsx` — Conflict resolution UI
- Server: snapshot storage + branch metadata + encrypted blob support
- 40+ tests

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
