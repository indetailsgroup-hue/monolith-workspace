/**
 * useDrillMapStore - v2.2
 *
 * Zustand store for drill map state.
 * Includes rotation/position override support for Minifix 3D visualization.
 *
 * Position clamping now uses DYNAMIC Cabinet AABB (not fixed ±20mm).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DrillMap, DrillMapPoint, DrillingParams, RotationOverride, CornerType, PositionOverride, Vec3Tuple } from '../manufacturing/drillMap/types';
import { POSITION_OVERRIDE_FALLBACK_LIMITS } from '../manufacturing/drillMap/types';
import {
  type Bounds3World,
  type ClampRanges,
  FALLBACK_BOUNDS,
  clampOverrideToCabinetBounds,
  computeClampRanges,
} from '../manufacturing/drillMap/cabinetBounds';
import { useUiStore } from './useUiStore';
import { useCabinetStore } from './useCabinetStore';

// ============================================
// TYPES
// ============================================

/** Default rotation settings by corner type (persisted to localStorage) */
export type RotationDefaults = Partial<Record<CornerType, RotationOverride>>;

/** Default position settings by corner type (persisted to localStorage) */
export type PositionDefaults = Partial<Record<CornerType, PositionOverride>>;

/** Context menu state for hardware */
export interface HardwareContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  pointId: string | null;
  cornerType: CornerType | null;
  currentRotation: RotationOverride | null;
  currentPosition: PositionOverride | null;
  baseWorldPos: Vec3Tuple | null;  // Base position for dynamic clamp range display
}

export type PositionAxis = 'dx' | 'dy' | 'dz';

interface DrillMapState {
  // Current drill map
  drillMap: DrillMap | null;

  // UI State
  showDrillMap: boolean;
  show3DHardware: boolean;
  showDrillDimensions: boolean;
  drillMapPurpose: string | null;
  drillMapScale: number;

  // Visibility controls (used by SceneToolbar)
  visible: boolean;  // Drill map overlay visibility
  showDimensions: boolean;  // Show dimension labels
  showCADView: boolean;  // Show CAD-style 2D drill map overlay

  // Selected point
  selectedPoint: DrillMapPoint | null;
  selectedDrillPointId: string | null;

  // Position editing offset
  positionOffset: { x: number; y: number; z: number };

  // Drilling params (user-adjustable)
  drillingParams: DrillingParams;

  // Hardware context menu
  hardwareContextMenu: HardwareContextMenuState;

  // Flag to skip RadialMenu when hardware is right-clicked
  // Set to timestamp when hardware is right-clicked, cleared after 100ms
  hardwareRightClickTime: number;

  // Rotation defaults (persisted)
  rotationDefaults: RotationDefaults;
  // Explicit vertical flip state by point id (do not infer from rotX)
  flipXStateByPointId: Record<string, boolean>;

  // Position defaults (persisted)
  positionDefaults: PositionDefaults;

  // Cabinet bounds for dynamic position clamping (NOT persisted)
  // Set by Cabinet3D when cabinet geometry is computed
  cabinetBoundsWorld: Bounds3World;

  // Version counter for triggering drill map regeneration
  // Incremented when regenerateDrillMap() is called
  drillMapVersion: number;

  // Per-group connector count overrides
  // Keys: "main" (TOP/BOTTOM corners), "shelf_0"/"shelf_1"/... (shelves), "back" (back panel)
  connectorCountOverrides: Record<string, number>;
}

interface DrillMapActions {
  // Drill map
  setDrillMap: (drillMap: DrillMap | null) => void;
  clearDrillMap: () => void;

  // UI toggles
  setShowDrillMap: (show: boolean) => void;
  toggleShowDrillMap: () => void;
  setShow3DHardware: (show: boolean) => void;
  toggleShow3DHardware: () => void;
  setShowDrillDimensions: (show: boolean) => void;
  setDrillMapPurpose: (purpose: string | null) => void;
  setDrillMapScale: (scale: number) => void;

  // Visibility controls (used by SceneToolbar)
  setVisible: (visible: boolean) => void;
  toggleVisible: () => void;
  setShowDimensions: (show: boolean) => void;
  toggleShowDimensions: () => void;
  setShowCADView: (show: boolean) => void;
  toggleShowCADView: () => void;

  // Selection
  setSelectedPoint: (point: DrillMapPoint | null) => void;
  setSelectedDrillPoint: (id: string | null) => void;

  // Position editing
  setPositionOffset: (offset: { x: number; y: number; z: number } | [number, number, number]) => void;
  resetPositionOffset: () => void;
  applyPositionOffset: () => void;

  // Drilling params
  setDrillingParam: (param: keyof DrillingParams, value: number) => void;

  // Hardware context menu
  openHardwareContextMenu: (
    position: { x: number; y: number },
    pointId: string,
    cornerType: CornerType,
    currentRotation: RotationOverride,
    currentPosition?: PositionOverride,
    baseWorldPos?: Vec3Tuple
  ) => void;
  closeHardwareContextMenu: () => void;

  // Rotation overrides
  setPointRotationOverride: (pointId: string, rotation: RotationOverride) => void;
  clearPointRotationOverride: (pointId: string) => void;
  setRotationDefault: (cornerType: CornerType, rotation: RotationOverride) => void;
  applyRotationToPoint: (pointId: string, action: 'flipX' | 'flipY' | 'rotX+' | 'rotX-' | 'rotY+' | 'rotY-' | 'rotZ+' | 'rotZ-') => void;
  getRotationForPoint: (pointId: string, cornerType: CornerType, calculatedRotation: RotationOverride) => RotationOverride;

  // Position overrides
  setPointPositionOverride: (pointId: string, position: PositionOverride, baseWorldPos?: Vec3Tuple) => void;
  clearPointPositionOverride: (pointId: string) => void;
  setPositionDefault: (cornerType: CornerType, position: PositionOverride) => void;
  nudgePosition: (pointId: string, axis: PositionAxis, deltaMm: number, baseWorldPos?: Vec3Tuple) => void;
  setPositionAxis: (pointId: string, axis: PositionAxis, valueMm: number, baseWorldPos?: Vec3Tuple) => void;
  getPositionForPoint: (pointId: string, cornerType: CornerType) => PositionOverride;
  getClampRangesForPoint: (baseWorldPos: Vec3Tuple) => ClampRanges;

  // Cabinet bounds (for dynamic position clamping)
  setCabinetBounds: (bounds: Bounds3World) => void;

  // Reset all defaults to system defaults (fixes Z-alignment issues)
  resetAllDefaults: () => void;

  // Trigger drill map regeneration (clears map and bumps version)
  regenerateDrillMap: () => void;

  // Per-group connector count overrides (Add/Del buttons in ConnectorList)
  setConnectorCountOverride: (group: string, count: number) => void;
  clearConnectorCountOverride: (group: string) => void;
  getConnectorCountOverride: (group: string) => number | undefined;
}

// ============================================
// CONSTANTS
// ============================================

const DEG_15 = 15 * Math.PI / 180;  // 15 degrees in radians

/**
 * Default rotation for each corner (calculated fallback)
 *
 * BOLT DIRECTION: Bolt should point INWARD toward cabinet center
 * - LEFT corners: rotY=0 → bolt points toward +X (right/inward)
 * - RIGHT corners: rotY=π → bolt points toward -X (left/inward)
 */
const DEFAULT_ROTATION_DEFAULTS: RotationDefaults = {
  TOP_LEFT: { rotX: 0, rotY: 0, rotZ: -Math.PI / 2 },         // bolt → right (inward)
  TOP_RIGHT: { rotX: 0, rotY: Math.PI, rotZ: -Math.PI / 2 },  // bolt → left (inward)
  BOTTOM_LEFT: { rotX: Math.PI, rotY: 0, rotZ: -Math.PI / 2 },         // bolt → right (inward)
  BOTTOM_RIGHT: { rotX: Math.PI, rotY: Math.PI, rotZ: -Math.PI / 2 },  // bolt → left (inward)
};

/**
 * Default position offset for each corner.
 *
 * v5.0: Zeroed out - ball head alignment is now computed automatically
 * from targetPocketCenter in Cabinet3D.tsx. These defaults serve only
 * as base for user manual overrides (right-click → adjust position).
 */
const DEFAULT_POSITION_DEFAULTS: PositionDefaults = {
  TOP_LEFT: { dx: 0, dy: 0, dz: 0 },
  TOP_RIGHT: { dx: 0, dy: 0, dz: 0 },
  BOTTOM_LEFT: { dx: 0, dy: 0, dz: 0 },
  BOTTOM_RIGHT: { dx: 0, dy: 0, dz: 0 },
};

/**
 * Clamp position using dynamic cabinet bounds.
 * Falls back to large range if bounds not set.
 */
const clampPositionWithBounds = (
  desiredOverride: PositionOverride,
  baseWorldPos: Vec3Tuple,
  bounds: Bounds3World
): PositionOverride => {
  const result = clampOverrideToCabinetBounds(
    baseWorldPos,
    [desiredOverride.dx, desiredOverride.dy, desiredOverride.dz],
    bounds
  );
  return { dx: result.clamped[0], dy: result.clamped[1], dz: result.clamped[2] };
};

/** Legacy fallback clamp (used when baseWorldPos not available) */
const clampPositionFallback = (v: number): number =>
  Math.max(POSITION_OVERRIDE_FALLBACK_LIMITS.min, Math.min(POSITION_OVERRIDE_FALLBACK_LIMITS.max, v));

/**
 * Normalize rotation value to range [-π, π].
 * Prevents rotation values from accumulating outside reasonable range.
 */
const normalizeRotation = (rad: number): number => {
  // Normalize to [-π, π]
  let normalized = rad % (2 * Math.PI);
  if (normalized > Math.PI) normalized -= 2 * Math.PI;
  if (normalized < -Math.PI) normalized += 2 * Math.PI;
  return normalized;
};

/**
 * Normalize all rotation values in an override object.
 */
const normalizeRotationOverride = (rotation: RotationOverride): RotationOverride => ({
  rotX: normalizeRotation(rotation.rotX),
  rotY: normalizeRotation(rotation.rotY),
  rotZ: normalizeRotation(rotation.rotZ),
});

// ============================================
// STORE
// ============================================

export const useDrillMapStore = create<DrillMapState & DrillMapActions>()(
  persist(
    (set, get) => ({
      // Initial state
      drillMap: null,
      showDrillMap: false,
      show3DHardware: true,
      showDrillDimensions: false,
      drillMapPurpose: null,
      drillMapScale: 1,
      visible: true,
      showDimensions: true,
      showCADView: false,
      selectedPoint: null,
      selectedDrillPointId: null,
      positionOffset: { x: 0, y: 0, z: 0 },
      drillingParams: {
        firstHoleZ: 37,
        drillingDistanceB: 24,  // 24mm per CAD spec
      },
      hardwareContextMenu: {
        isOpen: false,
        position: { x: 0, y: 0 },
        pointId: null,
        cornerType: null,
        currentRotation: null,
        currentPosition: null,
        baseWorldPos: null,
      },
      hardwareRightClickTime: 0,
      rotationDefaults: DEFAULT_ROTATION_DEFAULTS,
      flipXStateByPointId: {},
      positionDefaults: DEFAULT_POSITION_DEFAULTS,
      cabinetBoundsWorld: FALLBACK_BOUNDS,
      drillMapVersion: 0,
      connectorCountOverrides: {},

      // Actions
      setDrillMap: (drillMap) => {
        if (drillMap) {
          // RESTORE: Apply saved overrides from cabinet store
          const activeCabinetId = useCabinetStore.getState().activeCabinetId;
          if (activeCabinetId) {
            const savedOverrides = useCabinetStore.getState().getHardwarePointOverrides(activeCabinetId);
            const overrideCount = Object.keys(savedOverrides).length;

            if (overrideCount > 0) {
              // Apply overrides to drill map points
              const updatedPanels = drillMap.panels.map(panel => ({
                ...panel,
                points: panel.points.map(point => {
                  const saved = savedOverrides[point.id];
                  if (saved) {
                    return {
                      ...point,
                      // FIX: Restore rotation overrides so context-menu edits survive
                      // the regeneration cycle (setHardwarePointOverride → cabinet change
                      // → activeCabinetFromArray → useEffect → regenerate drillMap).
                      // Without this, rotation/flip actions via the Minifix Transform
                      // popover were immediately wiped by the regeneration.
                      rotationOverride: saved.rotation || point.rotationOverride,
                      // Position nudges are still safe to restore.
                      positionOverride: saved.position || point.positionOverride,
                    };
                  }
                  return point;
                }),
              }));

              drillMap = {
                ...drillMap,
                panels: updatedPanels,
              };
            }
          }

        }
        set({ drillMap });
      },

      clearDrillMap: () => set({ drillMap: null, flipXStateByPointId: {} }),

      setShowDrillMap: (show) => set({ showDrillMap: show }),

      toggleShowDrillMap: () => set((state) => ({ showDrillMap: !state.showDrillMap })),

      setShow3DHardware: (show) => set({ show3DHardware: show }),

      toggleShow3DHardware: () => set((state) => ({ show3DHardware: !state.show3DHardware })),

      setShowDrillDimensions: (show) => set({ showDrillDimensions: show }),

      setDrillMapPurpose: (purpose) => set({ drillMapPurpose: purpose }),

      setDrillMapScale: (scale) => set({ drillMapScale: scale }),

      // Visibility controls (used by SceneToolbar)
      setVisible: (visible) => set({ visible }),

      toggleVisible: () => set((state) => ({ visible: !state.visible })),

      setShowDimensions: (show) => set({ showDimensions: show }),

      toggleShowDimensions: () => set((state) => ({ showDimensions: !state.showDimensions })),

      setShowCADView: (show) => set({ showCADView: show }),

      toggleShowCADView: () => set((state) => ({ showCADView: !state.showCADView })),

      setSelectedPoint: (point) => set({ selectedPoint: point }),

      setSelectedDrillPoint: (id) => set({ selectedDrillPointId: id }),

      // Position editing
      setPositionOffset: (offset) => {
        // Handle both object and tuple formats
        if (Array.isArray(offset)) {
          set({ positionOffset: { x: offset[0], y: offset[1], z: offset[2] } });
        } else {
          set({ positionOffset: offset });
        }
      },

      resetPositionOffset: () => set({ positionOffset: { x: 0, y: 0, z: 0 } }),

      applyPositionOffset: () => {
        const state = get();
        if (!state.selectedDrillPointId || !state.drillMap) return;

        const { x, y, z } = state.positionOffset;
        // Convert position offset to PositionOverride format
        const positionOverride = { dx: x, dy: y, dz: z };

        // Apply to the selected point
        get().setPointPositionOverride(state.selectedDrillPointId, positionOverride);

        // Reset offset after applying
        set({ positionOffset: { x: 0, y: 0, z: 0 } });
      },

      setDrillingParam: (param, value) => set((state) => ({
        drillingParams: {
          ...state.drillingParams,
          [param]: value,
        },
      })),

      // Hardware context menu
      openHardwareContextMenu: (position, pointId, cornerType, currentRotation, currentPosition, baseWorldPos) => {
        // Close RadialMenu first (it may have opened from the contextmenu event)
        useUiStore.getState().closeRadialMenu();

        // Set timestamp to signal that hardware was right-clicked
        set({
          hardwareContextMenu: {
            isOpen: true,
            position,
            pointId,
            cornerType,
            currentRotation,
            currentPosition: currentPosition ?? { dx: 0, dy: 0, dz: 0 },
            baseWorldPos: baseWorldPos ?? null,
          },
          hardwareRightClickTime: Date.now(),
        });
      },

      closeHardwareContextMenu: () => {
        set({
          hardwareContextMenu: {
            isOpen: false,
            position: { x: 0, y: 0 },
            pointId: null,
            cornerType: null,
            currentRotation: null,
            currentPosition: null,
            baseWorldPos: null,
          },
        });
      },

      // Rotation overrides
      setPointRotationOverride: (pointId, rotation) => {
        const state = get();
        if (!state.drillMap) {
          return;
        }

        // Find and update the point
        const updatedPanels = state.drillMap.panels.map(panel => ({
          ...panel,
          points: panel.points.map(point =>
            point.id === pointId
              ? { ...point, rotationOverride: rotation }
              : point
          ),
        }));

        set({
          drillMap: {
            ...state.drillMap,
            panels: updatedPanels,
          },
          // BUG FIX: Also update context menu state if this point is selected
          hardwareContextMenu: state.hardwareContextMenu.pointId === pointId
            ? { ...state.hardwareContextMenu, currentRotation: rotation }
            : state.hardwareContextMenu,
        });

        // PERSIST: Save to cabinet store for persistence across sessions
        const activeCabinetId = useCabinetStore.getState().activeCabinetId;
        if (activeCabinetId) {
          useCabinetStore.getState().setHardwarePointOverride(activeCabinetId, pointId, { rotation });
        }
      },

      clearPointRotationOverride: (pointId) => {
        const state = get();
        if (!state.drillMap) return;

        // PRIORITY: Use context menu cornerType (more reliable)
        // Then fall back to point.cornerType
        let cornerType: CornerType = 'TOP_RIGHT';

        if (state.hardwareContextMenu.pointId === pointId && state.hardwareContextMenu.cornerType) {
          // Use context menu cornerType (most reliable)
          cornerType = state.hardwareContextMenu.cornerType;
        } else {
          // Fall back to point.cornerType
          for (const panel of state.drillMap.panels) {
            const point = panel.points.find(p => p.id === pointId);
            if (point) {
              cornerType = point.cornerType || 'TOP_RIGHT';
              break;
            }
          }
        }

        let pairedHoleId: string | undefined;
        const updatedPanels = state.drillMap.panels.map(panel => ({
          ...panel,
          points: panel.points.map(point =>
            point.id === pointId
              ? ((pairedHoleId = point.pairedHoleId), { ...point, rotationOverride: undefined })
              : point
          ),
        }));

        // Get the default rotation for this corner (to update context menu display)
        const defaultRotation = state.rotationDefaults[cornerType];

        set({
          drillMap: {
            ...state.drillMap,
            panels: updatedPanels,
          },
          flipXStateByPointId: (() => {
            const next = { ...state.flipXStateByPointId };
            delete next[pointId];
            if (pairedHoleId) delete next[pairedHoleId];
            return next;
          })(),
          // Update context menu to show default rotation after clearing override
          hardwareContextMenu: state.hardwareContextMenu.pointId === pointId
            ? { ...state.hardwareContextMenu, currentRotation: defaultRotation ?? null }
            : state.hardwareContextMenu,
        });

        // PERSIST: Also clear from cabinet store
        const activeCabinetId = useCabinetStore.getState().activeCabinetId;
        if (activeCabinetId) {
          // Get existing override and clear only the rotation part
          const overrides = useCabinetStore.getState().getHardwarePointOverrides(activeCabinetId);
          const existing = overrides[pointId];
          if (existing?.rotation) {
            if (existing.position) {
              // Keep position, clear rotation
              useCabinetStore.getState().setHardwarePointOverride(activeCabinetId, pointId, { position: existing.position });
            } else {
              // No position, clear entire override
              useCabinetStore.getState().clearHardwarePointOverride(activeCabinetId, pointId);
            }
          }
        }

      },

      setRotationDefault: (cornerType, rotation) => {
        set((state) => ({
          rotationDefaults: {
            ...state.rotationDefaults,
            [cornerType]: rotation,
          },
        }));
      },

      applyRotationToPoint: (pointId, action) => {
        const state = get();
        const hasDrillMap = !!state.drillMap;
        const menuRot = state.hardwareContextMenu.currentRotation;

        // ── CASE-2 lightweight path: drillMap null ──
        // Allow preview overrides (especially flipX) even before drillMap is generated.
        // flipX only toggles flip state — no currentRotation or pairedHole needed.
        if (!hasDrillMap && action === 'flipX') {
          const nextFlip = !(state.flipXStateByPointId[pointId] ?? false);
          set((s) => ({
            flipXStateByPointId: {
              ...s.flipXStateByPointId,
              [pointId]: nextFlip,
            },
          }));
          const activeCabinetId = useCabinetStore.getState().activeCabinetId;
          if (activeCabinetId) {
            useCabinetStore.getState().setHardwarePointOverride(activeCabinetId, pointId, {
              previewState: { flipVertical: nextFlip },
            });
          }
          return;
        }

        // PRIORITY: Use context menu state if this is the selected point
        // Context menu has the CORRECT cornerType and currentRotation from Cabinet3D
        let currentRotation: RotationOverride | null = null;

        if (state.hardwareContextMenu.pointId === pointId && state.hardwareContextMenu.currentRotation) {
          // Use context menu rotation (most reliable - matches what user sees)
          currentRotation = state.hardwareContextMenu.currentRotation;
        } else if (hasDrillMap) {
          // Fallback: Find from drillMap (only when available)
          for (const panel of state.drillMap!.panels) {
            const point = panel.points.find(p => p.id === pointId);
            if (point) {
              // Use context menu cornerType if available, else point.cornerType, else fallback
              const cornerType = state.hardwareContextMenu.cornerType || point.cornerType || 'TOP_RIGHT';
              currentRotation = point.rotationOverride || state.rotationDefaults[cornerType] || null;
              break;
            }
          }
        }

        // ── CASE-3 fallback: derive default rotation from corner defaults ──
        if (!currentRotation) {
          const fallbackCorner = state.hardwareContextMenu.cornerType || 'TOP_RIGHT';
          currentRotation = state.rotationDefaults[fallbackCorner] || { rotX: 0, rotY: 0, rotZ: 0 };
        }

        // Resolve pair once so rotation + explicit flip state stay in sync.
        let pairedHoleId: string | undefined;
        if (hasDrillMap) {
          for (const panel of state.drillMap!.panels) {
            const point = panel.points.find((p) => p.id === pointId);
            if (point?.pairedHoleId) {
              pairedHoleId = point.pairedHoleId;
              break;
            }
          }
        }

        // Apply the action
        const newRotation = { ...currentRotation };
        switch (action) {
          case 'flipX':
            // IMPORTANT:
            // Vertical Flip should swap hardware/holes to opposite panel face.
            // Do NOT inject extra 180° rotation here (it fights placement logic).
            // Rotation remains unchanged for flipX; only explicit flip state toggles below.
            break;
          case 'flipY':
            // Same toggle logic for Y axis
            if (currentRotation.rotY >= Math.PI / 2) {
              newRotation.rotY = currentRotation.rotY - Math.PI;
            } else {
              newRotation.rotY = currentRotation.rotY + Math.PI;
            }
            break;
          case 'rotX+':
            newRotation.rotX += DEG_15;
            break;
          case 'rotX-':
            newRotation.rotX -= DEG_15;
            break;
          case 'rotY+':
            newRotation.rotY += DEG_15;
            break;
          case 'rotY-':
            newRotation.rotY -= DEG_15;
            break;
          case 'rotZ+':
            newRotation.rotZ += DEG_15;
            break;
          case 'rotZ-':
            newRotation.rotZ -= DEG_15;
            break;
        }

        // For non-flip actions, persist rotation overrides.
        // flipX uses dedicated face-swap state and should not alter rotation override.
        if (action !== 'flipX') {
          // Normalize rotation to prevent values from accumulating outside [-π, π]
          const normalizedRotation = normalizeRotationOverride(newRotation);

          // Update the point
          get().setPointRotationOverride(pointId, normalizedRotation);

          // Keep paired CAM/BOLT in sync so rotation edits affect both.
          if (pairedHoleId) {
            get().setPointRotationOverride(pairedHoleId, normalizedRotation);
          }
        }

        // PERSIST: flipY → hardwareOverrides[pairId].previewState.flipHorizontal
        if (action === 'flipY') {
          // flipY toggles rotY by ±π; if was >= π/2 we just unflipped, else we just flipped
          const wasFlippedH = currentRotation.rotY >= Math.PI / 2;
          const nextFlipH = !wasFlippedH;

          // Collect pairIds for per-connector persistence (same corner logic as flipX)
          const pairIdsForFlipY = new Set<string>();
          let flipYCorner: CornerType | undefined = state.hardwareContextMenu.cornerType ?? undefined;
          if (!flipYCorner && hasDrillMap) {
            for (const panel of state.drillMap!.panels) {
              const pt = panel.points.find((p) => p.id === pointId);
              if (pt?.cornerType) { flipYCorner = pt.cornerType; break; }
            }
          }
          if (flipYCorner && hasDrillMap) {
            for (const panel of state.drillMap!.panels) {
              for (const pt of panel.points) {
                if (pt.cornerType === flipYCorner) {
                  if (pt.pairKeyV2) pairIdsForFlipY.add(pt.pairKeyV2);
                  if (pt.pairId) pairIdsForFlipY.add(pt.pairId); // dual-write for migration
                }
              }
            }
          }

          const activeCabIdY = useCabinetStore.getState().activeCabinetId;
          if (activeCabIdY) {
            const payloadY = { flipHorizontal: nextFlipH };
            if (pairIdsForFlipY.size > 0) {
              for (const pid of pairIdsForFlipY) {
                useCabinetStore.getState().setHardwarePointOverride(activeCabIdY, pid, {
                  previewState: payloadY,
                });
              }
            } else {
              useCabinetStore.getState().setHardwarePointOverride(activeCabIdY, pointId, {
                previewState: payloadY,
              });
              if (pairedHoleId) {
                useCabinetStore.getState().setHardwarePointOverride(activeCabIdY, pairedHoleId, {
                  previewState: payloadY,
                });
              }
            }
          }
        }

        if (action === 'flipX') {
          const nextFlip = !(state.flipXStateByPointId[pointId] ?? false);
          let selectedCorner: CornerType | undefined = state.hardwareContextMenu.cornerType ?? undefined;
          if (!selectedCorner && hasDrillMap) {
            for (const panel of state.drillMap!.panels) {
              const point = panel.points.find((p) => p.id === pointId);
              if (point?.cornerType) {
                selectedCorner = point.cornerType;
                break;
              }
            }
          }

          const pointIdsInSameCorner: string[] = [];
          // Also collect unique pairIds in the same corner for per-connector persistence
          const pairIdsInSameCorner = new Set<string>();
          if (selectedCorner && hasDrillMap) {
            for (const panel of state.drillMap!.panels) {
              for (const point of panel.points) {
                if (point.cornerType === selectedCorner) {
                  pointIdsInSameCorner.push(point.id);
                  if (point.pairKeyV2) pairIdsInSameCorner.add(point.pairKeyV2);
                  if (point.pairId) pairIdsInSameCorner.add(point.pairId); // dual-write for migration
                }
              }
            }
          }

          // Update in-memory flip state (legacy path for Hardware3D backward compat)
          set((s) => ({
            flipXStateByPointId: {
              ...s.flipXStateByPointId,
              ...(pointIdsInSameCorner.length > 0
                ? Object.fromEntries(pointIdsInSameCorner.map((id) => [id, nextFlip]))
                : {
                    [pointId]: nextFlip,
                    ...(pairedHoleId ? { [pairedHoleId]: nextFlip } : {}),
                  }),
            },
          }));

          // PERSIST: Write per-connector previewState to cabinet store (keyed by pairKeyV2 + legacy pairId)
          // See docs/architecture/HARDWARE_PREVIEW_KEYS.md — pairKeyV2 is canonical, pairId is migration fallback
          const activeCabinetId = useCabinetStore.getState().activeCabinetId;
          if (activeCabinetId) {
            const previewStatePayload = { flipVertical: nextFlip };
            if (pairIdsInSameCorner.size > 0) {
              for (const pid of pairIdsInSameCorner) {
                useCabinetStore.getState().setHardwarePointOverride(activeCabinetId, pid, {
                  previewState: previewStatePayload,
                });
              }
            } else {
              // Fallback: persist by pointId if no pairId available
              useCabinetStore.getState().setHardwarePointOverride(activeCabinetId, pointId, {
                previewState: previewStatePayload,
              });
              if (pairedHoleId) {
                useCabinetStore.getState().setHardwarePointOverride(activeCabinetId, pairedHoleId, {
                  previewState: previewStatePayload,
                });
              }
            }
          }
        }
      },

      getRotationForPoint: (pointId, cornerType, calculatedRotation) => {
        const state = get();

        // Priority 1: Point-specific override (set via HardwareContextMenu on individual connectors)
        if (state.drillMap) {
          for (const panel of state.drillMap.panels) {
            const point = panel.points.find(p => p.id === pointId);
            if (point?.rotationOverride) {
              return point.rotationOverride;
            }
          }
        }

        // Priority 2: Calculated rotation (from bolt orientation pipeline)
        // The calculated rotation is dynamically computed from getDrillingAxis +
        // computeBoltQuatWithTwist, which correctly handles both INSET and OVERLAY.
        // Corner-level stored defaults (rotationDefaults) are skipped because they
        // don't account for joint type changes and cause stale-state bugs when
        // switching between INSET ↔ OVERLAY.
        return calculatedRotation;
      },

      // ============================================
      // CABINET BOUNDS
      // ============================================

      setCabinetBounds: (bounds) => set({ cabinetBoundsWorld: bounds }),

      resetAllDefaults: () => {
        // Reset defaults + clear all per-point overrides/flip state so baseline is deterministic.
        const state = get();
        const activeCabinetId = useCabinetStore.getState().activeCabinetId;
        if (activeCabinetId) {
          const overrides = useCabinetStore.getState().getHardwarePointOverrides(activeCabinetId);
          for (const pointId of Object.keys(overrides)) {
            useCabinetStore.getState().clearHardwarePointOverride(activeCabinetId, pointId);
          }
        }

        const currentVersion = state.drillMapVersion;
        set({
          rotationDefaults: DEFAULT_ROTATION_DEFAULTS,
          positionDefaults: DEFAULT_POSITION_DEFAULTS,
          flipXStateByPointId: {},
          drillMap: null,
          drillMapVersion: currentVersion + 1,
        });
      },

      regenerateDrillMap: () => {
        // Clear the drill map and bump version to trigger regeneration in Cabinet3D
        // Cabinet3D watches drillMapVersion and regenerates when it changes
        const currentVersion = get().drillMapVersion;
        set({
          drillMap: null,
          drillMapVersion: currentVersion + 1,
          flipXStateByPointId: {},  // Clear legacy V-Flip state too
        });
      },

      setConnectorCountOverride: (group, count) => {
        const prev = get().connectorCountOverrides;
        const next = { ...prev, [group]: Math.max(1, count) };
        // Don't clear drillMap — keep old data visible while regenerating
        // Cabinet3D watches connectorCountOverrides and regenerates immediately
        set({ connectorCountOverrides: next });
      },

      clearConnectorCountOverride: (group) => {
        const prev = get().connectorCountOverrides;
        const { [group]: _, ...rest } = prev;
        set({ connectorCountOverrides: rest });
      },

      getConnectorCountOverride: (group) => {
        return get().connectorCountOverrides[group];
      },

      getClampRangesForPoint: (baseWorldPos) => {
        const state = get();
        return computeClampRanges(baseWorldPos, state.cabinetBoundsWorld);
      },

      // ============================================
      // POSITION OVERRIDES
      // ============================================

      setPointPositionOverride: (pointId, position, baseWorldPos) => {
        const state = get();
        if (!state.drillMap) return;

        // Find the point to get its base position if not provided
        let effectiveBasePos = baseWorldPos;
        if (!effectiveBasePos) {
          for (const panel of state.drillMap.panels) {
            const point = panel.points.find(p => p.id === pointId);
            if (point) {
              effectiveBasePos = point.position;
              break;
            }
          }
        }

        // Clamp using dynamic cabinet bounds
        let clampedPosition: PositionOverride;
        if (effectiveBasePos) {
          clampedPosition = clampPositionWithBounds(position, effectiveBasePos, state.cabinetBoundsWorld);
        } else {
          // Fallback to basic clamp if no base position
          clampedPosition = {
            dx: clampPositionFallback(position.dx),
            dy: clampPositionFallback(position.dy),
            dz: clampPositionFallback(position.dz),
          };
        }

        const updatedPanels = state.drillMap.panels.map(panel => ({
          ...panel,
          points: panel.points.map(point =>
            point.id === pointId
              ? { ...point, positionOverride: clampedPosition }
              : point
          ),
        }));

        set({
          drillMap: {
            ...state.drillMap,
            panels: updatedPanels,
          },
          // Also update context menu state if this point is selected
          hardwareContextMenu: state.hardwareContextMenu.pointId === pointId
            ? { ...state.hardwareContextMenu, currentPosition: clampedPosition }
            : state.hardwareContextMenu,
        });

        // PERSIST: Save to cabinet store for persistence across sessions
        const activeCabinetId = useCabinetStore.getState().activeCabinetId;
        if (activeCabinetId) {
          useCabinetStore.getState().setHardwarePointOverride(activeCabinetId, pointId, { position: clampedPosition });
        }
      },

      clearPointPositionOverride: (pointId) => {
        const state = get();
        if (!state.drillMap) return;

        // PRIORITY: Use context menu cornerType (more reliable)
        // Then fall back to point.cornerType
        let cornerType: CornerType = 'TOP_RIGHT';

        if (state.hardwareContextMenu.pointId === pointId && state.hardwareContextMenu.cornerType) {
          // Use context menu cornerType (most reliable)
          cornerType = state.hardwareContextMenu.cornerType;
        } else {
          // Fall back to point.cornerType
          for (const panel of state.drillMap.panels) {
            const point = panel.points.find(p => p.id === pointId);
            if (point) {
              cornerType = point.cornerType || 'TOP_RIGHT';
              break;
            }
          }
        }

        const updatedPanels = state.drillMap.panels.map(panel => ({
          ...panel,
          points: panel.points.map(point =>
            point.id === pointId
              ? { ...point, positionOverride: undefined }
              : point
          ),
        }));

        // Get the default position for this corner (to update context menu display)
        const defaultPosition = state.positionDefaults[cornerType];

        set({
          drillMap: {
            ...state.drillMap,
            panels: updatedPanels,
          },
          // Update context menu to show default position after clearing override
          hardwareContextMenu: state.hardwareContextMenu.pointId === pointId
            ? { ...state.hardwareContextMenu, currentPosition: defaultPosition ?? null }
            : state.hardwareContextMenu,
        });

        // PERSIST: Also clear from cabinet store
        const activeCabinetId = useCabinetStore.getState().activeCabinetId;
        if (activeCabinetId) {
          // Get existing override and clear only the position part
          const overrides = useCabinetStore.getState().getHardwarePointOverrides(activeCabinetId);
          const existing = overrides[pointId];
          if (existing?.position) {
            if (existing.rotation) {
              // Keep rotation, clear position
              useCabinetStore.getState().setHardwarePointOverride(activeCabinetId, pointId, { rotation: existing.rotation });
            } else {
              // No rotation, clear entire override
              useCabinetStore.getState().clearHardwarePointOverride(activeCabinetId, pointId);
            }
          }
        }

      },

      setPositionDefault: (cornerType, position) => {
        // Position defaults use fallback clamp since they're not tied to a specific point
        const clampedPosition: PositionOverride = {
          dx: clampPositionFallback(position.dx),
          dy: clampPositionFallback(position.dy),
          dz: clampPositionFallback(position.dz),
        };

        set((state) => ({
          positionDefaults: {
            ...state.positionDefaults,
            [cornerType]: clampedPosition,
          },
        }));
      },

      nudgePosition: (pointId, axis, deltaMm, baseWorldPos) => {
        const state = get();
        if (!state.drillMap) return;

        // Find current position and base world pos
        let currentPosition: PositionOverride = { dx: 0, dy: 0, dz: 0 };
        let effectiveBasePos = baseWorldPos;
        let foundPoint = false;

        for (const panel of state.drillMap.panels) {
          const point = panel.points.find(p => p.id === pointId);
          if (point) {
            foundPoint = true;
            currentPosition = point.positionOverride
              || state.positionDefaults[point.cornerType || 'TOP_RIGHT']
              || { dx: 0, dy: 0, dz: 0 };
            if (!effectiveBasePos) {
              effectiveBasePos = point.position;
            }
            break;
          }
        }

        if (!foundPoint) return;

        // Apply nudge (clamping happens in setPointPositionOverride)
        const newPosition: PositionOverride = {
          ...currentPosition,
          [axis]: currentPosition[axis] + deltaMm,
        };

        get().setPointPositionOverride(pointId, newPosition, effectiveBasePos);
      },

      setPositionAxis: (pointId, axis, valueMm, baseWorldPos) => {
        const state = get();
        if (!state.drillMap) return;

        // Find current position and base world pos
        let currentPosition: PositionOverride = { dx: 0, dy: 0, dz: 0 };
        let effectiveBasePos = baseWorldPos;

        for (const panel of state.drillMap.panels) {
          const point = panel.points.find(p => p.id === pointId);
          if (point) {
            currentPosition = point.positionOverride
              || state.positionDefaults[point.cornerType || 'TOP_RIGHT']
              || { dx: 0, dy: 0, dz: 0 };
            if (!effectiveBasePos) {
              effectiveBasePos = point.position;
            }
            break;
          }
        }

        // Set specific axis (clamping happens in setPointPositionOverride)
        const newPosition: PositionOverride = {
          ...currentPosition,
          [axis]: valueMm,
        };

        get().setPointPositionOverride(pointId, newPosition, effectiveBasePos);
      },

      getPositionForPoint: (pointId, cornerType) => {
        const state = get();

        // Priority 1: Point-specific override
        if (state.drillMap) {
          for (const panel of state.drillMap.panels) {
            const point = panel.points.find(p => p.id === pointId);
            if (point?.positionOverride) {
              return point.positionOverride;
            }
          }
        }

        // Priority 2: Corner default (user-set)
        // Note: positionDefaults only has cabinet corners (TOP_LEFT, etc.)
        // Shelf corners (SHELF_N_LEFT/RIGHT) won't have entries, so fallback to zero
        const cornerDefault = state.positionDefaults[cornerType as keyof typeof state.positionDefaults];
        const zeroPosition = { dx: 0, dy: 0, dz: 0 };

        // Check if user has customized this corner
        if (
          cornerDefault &&
          (cornerDefault.dx !== 0 ||
          cornerDefault.dy !== 0 ||
          cornerDefault.dz !== 0)
        ) {
          return cornerDefault;
        }

        // Priority 3: Zero (no offset)
        return zeroPosition;
      },
    }),
    {
      name: 'drill-map-settings',
      version: 4,  // v4: Force-reset persisted rotation/position defaults for stable CAM baseline
      partialize: (state) => ({
        // Only persist rotation/position defaults, not the drill map itself
        rotationDefaults: state.rotationDefaults,
        positionDefaults: state.positionDefaults,
      }),
      migrate: (persistedState, version) => {
        // Version 4: Reset persisted defaults to prevent stale flip/orientation carry-over
        if (version < 4) {
          console.log('[DrillMap] Migrating settings to v4 (reset persisted hardware defaults)');
          const state = persistedState as Partial<DrillMapState> | null;
          return {
            ...(state ?? {}),
            rotationDefaults: DEFAULT_ROTATION_DEFAULTS,
            positionDefaults: DEFAULT_POSITION_DEFAULTS,
            // Force drillMap regeneration by clearing it
            drillMap: null,
            drillMapVersion: (state?.drillMapVersion ?? 0) + 1,
          };
        }
        // Version 2: Added ball head offset compensation to position defaults
        if (version < 2) {
          console.log('[DrillMap] Migrating settings to v2 (ball head position offset)');
          const state = persistedState as Partial<DrillMapState> | null;
          return {
            ...(state ?? {}),
            rotationDefaults: DEFAULT_ROTATION_DEFAULTS,
            positionDefaults: DEFAULT_POSITION_DEFAULTS,
          };
        }
        return persistedState as DrillMapState;
      },
    }
  )
);

// ============================================
// SELECTORS
// ============================================

export const selectDrillMap = (state: DrillMapState) => state.drillMap;
export const selectShowDrillMap = (state: DrillMapState) => state.showDrillMap;
export const selectShow3DHardware = (state: DrillMapState) => state.show3DHardware;
export const selectDrillingParams = (state: DrillMapState) => state.drillingParams;
export const selectHardwareContextMenu = (state: DrillMapState) => state.hardwareContextMenu;
export const selectRotationDefaults = (state: DrillMapState) => state.rotationDefaults;
export const selectFlipXStateByPointId = (state: DrillMapState) => state.flipXStateByPointId;
export const selectPositionDefaults = (state: DrillMapState) => state.positionDefaults;
export const selectCabinetBounds = (state: DrillMapState) => state.cabinetBoundsWorld;
export const selectDrillMapVersion = (state: DrillMapState) => state.drillMapVersion;
export const selectConnectorCountOverrides = (state: DrillMapState) => state.connectorCountOverrides;

// ============================================
// SELECTOR HOOKS
// ============================================

/**
 * Hook to get the currently selected drill point.
 * Returns the full DrillMapPoint object or null if none selected.
 */
export const useSelectedDrillPoint = () => {
  return useDrillMapStore((state) => {
    if (!state.selectedDrillPointId || !state.drillMap) return null;
    // Search through all panels to find the point
    for (const panel of state.drillMap.panels) {
      const point = panel.points.find(p => p.id === state.selectedDrillPointId);
      if (point) return point;
    }
    return null;
  });
};

/**
 * Hook to get the current position offset for editing.
 * Returns [x, y, z] tuple for compatibility with HardwareEditPanel.
 */
export const usePositionOffset = (): [number, number, number] => {
  return useDrillMapStore((state) => [
    state.positionOffset.x,
    state.positionOffset.y,
    state.positionOffset.z,
  ]);
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Determine corner type from drill point position relative to cabinet center.
 *
 * IMPORTANT: Drill map uses CENTER-BASED coordinates:
 * - x = 0 is center, x < 0 is LEFT, x > 0 is RIGHT
 * - y = 0 is center, y < 0 is BOTTOM, y > 0 is TOP
 *
 * The cabinetWidth/Height params are kept for API compatibility but not used.
 */
export function getCornerType(
  position: [number, number, number],
  _cabinetWidth: number,  // Unused - kept for API compatibility
  _cabinetHeight: number  // Unused - kept for API compatibility
): CornerType {
  const [x, y] = position;

  // CENTER-BASED coordinate system (drill map standard)
  const isTop = y > 0;
  const isLeft = x < 0;

  if (isTop && isLeft) return 'TOP_LEFT';
  if (isTop && !isLeft) return 'TOP_RIGHT';
  if (!isTop && isLeft) return 'BOTTOM_LEFT';
  return 'BOTTOM_RIGHT';
}
