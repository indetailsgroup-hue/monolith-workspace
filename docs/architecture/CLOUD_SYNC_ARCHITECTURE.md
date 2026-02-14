# T029: Cloud Sync Architecture

> Real-Time Collaborative Design with Offline Support

**Version:** 0.1.0 (Design Phase)
**Status:** Research Complete, Implementation Pending

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Research Summary](#research-summary)
3. [Architecture Options](#architecture-options)
4. [Proposed Architecture](#proposed-architecture)
5. [CRDT Implementation](#crdt-implementation)
6. [Security Model](#security-model)
7. [Implementation Phases](#implementation-phases)
8. [Trade-offs & Decisions](#trade-offs--decisions)

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

## CRDT Implementation

### Document Structure

```typescript
import * as Y from 'yjs';

interface MonolithDoc {
  // Root Yjs document
  doc: Y.Doc;

  // Shared types for cabinet data
  cabinet: Y.Map<any>;         // Cabinet metadata, dimensions
  panels: Y.Array<Y.Map<any>>; // Panel list
  hardware: Y.Array<Y.Map<any>>;
  materials: Y.Map<any>;

  // Collaboration metadata
  awareness: Awareness;        // Cursor positions, selections
}

function createMonolithDoc(): MonolithDoc {
  const doc = new Y.Doc();

  return {
    doc,
    cabinet: doc.getMap('cabinet'),
    panels: doc.getArray('panels'),
    hardware: doc.getArray('hardware'),
    materials: doc.getMap('materials'),
    awareness: new Awareness(doc),
  };
}
```

### Syncing with Zustand

```typescript
import { useCabinetStore } from '@/core/store/useCabinetStore';

function syncYjsToZustand(ydoc: MonolithDoc) {
  // Yjs → Zustand (on remote changes)
  ydoc.cabinet.observe((event) => {
    const newDimensions = ydoc.cabinet.get('dimensions');
    useCabinetStore.setState((state) => ({
      cabinet: {
        ...state.cabinet,
        dimensions: newDimensions,
      },
    }));
  });

  // Zustand → Yjs (on local changes)
  useCabinetStore.subscribe(
    (state) => state.cabinet?.dimensions,
    (dimensions) => {
      ydoc.doc.transact(() => {
        ydoc.cabinet.set('dimensions', dimensions);
      });
    }
  );
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

### Phase 1: Local Persistence (Foundation)

**Scope:**
- IndexedDB storage with y-indexeddb
- Auto-save on changes
- Load from local on startup

**Deliverables:**
- Yjs integration layer
- Local persistence provider
- Migration from localStorage

**Estimated Effort:** 3-4 days

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
*Last updated: February 2026*
