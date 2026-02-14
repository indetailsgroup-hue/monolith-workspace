# แผนการแก้ไขปัญหา IIMOS Workspace

## สรุปปัญหา
- **179 TypeScript Errors** (Build blocking)
- **40 TODO Comments** (Incomplete features)
- **2 Missing API Endpoints** (Frontend/Backend mismatch)
- **6+ Missing UI Features**

---

## Phase 1: แก้ไข Type Definitions (Build Blocking) ⚡ Priority: CRITICAL

### 1.1 DrillMapPoint Type (ลด ~30 errors)
**ไฟล์:** `src/core/manufacturing/drillMap/types.ts`

เพิ่ม properties ที่ขาด:
```typescript
interface DrillMapPoint {
  // ... existing properties ...

  // Missing properties to add:
  boltDirection?: 'IN' | 'OUT';
  drillingDistanceB?: number;
  jointStyle?: string;
  panelThickness?: number;
  face?: 'A' | 'B';
  pairedHoleId?: string;
  connectedPanelRole?: string;
  operationId?: string;
  throughHole?: boolean;
}
```

**Agents:** 1 agent

---

### 1.2 Cabinet Type - outerWidth/outerHeight (ลด ~4 errors)
**ไฟล์:** `src/core/types/Cabinet.ts`

Options:
- A) เพิ่ม computed properties `outerWidth`, `outerHeight`
- B) สร้าง utility function `getCabinetOuterDimensions(cabinet)`

**Agents:** 1 agent (same as 1.1)

---

### 1.3 MapDrillResult Interface (ลด ~3 errors)
**ไฟล์:** `src/cnc/mapping/mapDrillMapToOps.ts`

เพิ่ม:
```typescript
interface MapDrillResult {
  operations: Operation[];
  stats: MapDrillStats;
  warnings?: string[];        // ADD
  unmappedPoints?: DrillMapPoint[];  // ADD
}
```

**Agents:** 1 agent

---

### 1.4 Fix Type Re-exports in minifix (ลด ~26 errors)
**ไฟล์:** `src/core/manufacturing/minifix/index.ts`

เปลี่ยนจาก:
```typescript
export { SomeType } from './types';
```
เป็น:
```typescript
export type { SomeType } from './types';
```

**Agents:** 1 agent

---

### 1.5 useDrillMapStore Missing Actions (ลด ~12 errors)
**ไฟล์:** `src/core/store/useDrillMapStore.ts`

เพิ่ม actions และ selectors:
- `useSelectedDrillPoint`
- `usePositionOffset`
- `setPositionOffset()`
- `resetPositionOffset()`
- `applyPositionOffset()`
- `visible` state
- `toggleVisible()`
- `showDimensions`
- `toggleShowDimensions()`

**Agents:** 1 agent

---

### 1.6 Missing Module Exports (ลด ~3 errors)
**ไฟล์:** `src/core/manufacturing/drillMap/index.ts`

เพิ่ม exports:
- `generateConnectorPlateDrillMap()`
- `validateConnectorPlateConfig()`
- `ConnectorPlateConfig` type

**Agents:** 1 agent (same as 1.1)

---

## Phase 2: แก้ไข Test Files (ลด ~50 errors)

### 2.1 Update Test Data Structures
**ไฟล์:**
- `src/cnc/__tests__/buildOperationGraph.test.ts`
- `src/cnc/__tests__/mapMinifixToOps.test.ts`
- `src/cnc/cache/__tests__/cncCacheHelpers.test.ts`
- `src/gate/rules/connectors/__tests__/*.spec.ts`

อัปเดต test data ให้ตรงกับ type definitions ใหม่

**Agents:** 1-2 agents (can run parallel)

---

## Phase 3: Backend API Endpoints 🔌

### 3.1 Add Missing Factory Endpoints
**ไฟล์:** `server/src/api/routes/factory.ts` (สร้างใหม่)

เพิ่ม:
```typescript
// GET /factory/export/options
router.get('/factory/export/options', async (req, res) => {
  // Return available export formats and settings
});

// POST /factory/jobs/:jobId/export
router.post('/factory/jobs/:jobId/export', async (req, res) => {
  // Queue export job for specific job
});
```

**Agents:** 1 agent

---

## Phase 4: Implement Stub Functions 🔧

### 4.1 CNC Mapping Logic (High Priority)
**ไฟล์:** `src/cnc/mapping/mapDrillMapToOps.ts`

Implement actual mapping from DrillMapPoint → CNC Operations

**Agents:** 1 agent (complex, needs domain knowledge)

---

### 4.2 DrillMap Builder
**ไฟล์:** `src/factory/packet/builders/buildDrillMap.ts`

Implement actual drill map data generation

**Agents:** 1 agent

---

### 4.3 CSG Drill Visualization
**ไฟล์:** `src/components/canvas/CSGDrillOverlay.tsx`

Implement CSG boolean operations for drill holes

**Agents:** 1 agent (needs @react-three/csg)

---

## Phase 5: Tool Store Implementation 🛠️

### 5.1 Visibility Features
**ไฟล์:** `src/core/store/useToolStore.ts`

Implement:
- `hideSelectedCabinet()`
- `hideUnselected()`
- `unhideAll()`
- `isolate()`
- `toggleXRayMode()`
- `toggleOverlay()`

**Agents:** 1 agent

---

### 5.2 Camera Features
**ไฟล์:** `src/core/store/useToolStore.ts`

Implement:
- `focusOnSelection()`
- `cameraFocusOnSelection()`

**Agents:** Same as 5.1

---

## Phase 6: Missing UI Components 🎨

### 6.1 View Mode Toolbar
**ไฟล์:** สร้างใหม่หรือเพิ่มใน `src/components/ui/SceneToolbar.tsx`

เพิ่มปุ่ม:
- X-Ray mode toggle
- Hide/Show controls
- Isolate button

**Agents:** 1 agent

---

### 6.2 Export Options Dialog
**ไฟล์:** สร้างใหม่ `src/components/ui/ExportOptionsDialog.tsx`

**Agents:** 1 agent

---

## Phase 7: Connect Snap System

### 7.1 Enable Snap
**ไฟล์:** `src/App.tsx`

เปลี่ยน `snapEnabled={false}` → `snapEnabled={true}`
และตรวจสอบว่า snap system ทำงานถูกต้อง

**Agents:** 1 agent

---

## แผนการใช้ Sub Agents

### Batch 1 (Parallel) - Type Fixes
```
Agent A: DrillMapPoint + Cabinet + DrillMap types
Agent B: minifix re-exports
Agent C: useDrillMapStore actions
```

### Batch 2 (Parallel) - Tests + API
```
Agent D: Fix test files
Agent E: Backend API endpoints
```

### Batch 3 (Parallel) - Implementation
```
Agent F: CNC mapping + DrillMap builder
Agent G: Tool store implementations
```

### Batch 4 (Parallel) - UI
```
Agent H: CSG visualization + UI components
Agent I: Snap system + Export dialog
```

---

## ประมาณการ

| Phase | Agents | ลด Errors |
|-------|--------|-----------|
| Phase 1 | 3 parallel | ~80 errors |
| Phase 2 | 2 parallel | ~50 errors |
| Phase 3 | 1 | API mismatch |
| Phase 4 | 2 parallel | Stub functions |
| Phase 5 | 1 | Tool features |
| Phase 6 | 2 parallel | Missing UI |
| Phase 7 | 1 | Snap system |

**รวม:** 8-10 Sub Agents, ทำเป็น 4 batches

---

## ลำดับความสำคัญ

1. ⚡ **Phase 1** - ต้องทำก่อน (Build blocking)
2. 🔧 **Phase 2** - Tests จะ pass
3. 🔌 **Phase 3** - API ทำงานได้
4. 🛠️ **Phase 4-5** - Features ครบ
5. 🎨 **Phase 6-7** - UI/UX สมบูรณ์

---

## คำสั่งรัน (หลังแก้ไข)

```bash
# ตรวจสอบ TypeScript
npm run typecheck

# รัน Tests
npm run test

# Build
npm run build

# Start dev server
npm run dev
```
