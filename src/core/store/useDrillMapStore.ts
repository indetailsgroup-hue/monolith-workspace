/**
 * Drill Map Store - CNC Drill Map Visualization State
 *
 * Manages drill map data, visualization settings, and hardware interaction.
 * Cabinet3D.tsx uses 15+ selectors from this store.
 */

import { create } from 'zustand';
import type { DrillMap, DrillMapPoint, CornerType, RotationOverride, DrillMapBounds } from '../manufacturing/drillMap/types';

// ============================================
// TYPES
// ============================================

interface HardwareContextMenuState {
  visible: boolean;
  position: { x: number; y: number };
  pointId: string | null;
}

interface DrillMapState {
  // Visibility
  showDrillMap: boolean;
  show3DHardware: boolean;
  showDrillDimensions: boolean;
  showDimensions: boolean;

  // Data
  drillMap: DrillMap | null;
  drillMapPurpose: string;
  drillMapScale: number;
  drillMapVersion: number;
  cabinetBounds: DrillMapBounds | null;

  // Selection
  selectedPoint: DrillMapPoint | null;

  // Rotation defaults
  rotationDefaults: Record<string, RotationOverride>;

  // Hardware context menu
  hardwareContextMenu: HardwareContextMenuState;
}

interface DrillMapActions {
  setShowDrillMap: (show: boolean) => void;
  setShow3DHardware: (show: boolean) => void;
  setShowDrillDimensions: (show: boolean) => void;
  setShowDimensions: (show: boolean) => void;
  setDrillMap: (map: DrillMap | null) => void;
  setDrillMapPurpose: (purpose: string) => void;
  setDrillMapScale: (scale: number) => void;
  setCabinetBounds: (bounds: DrillMapBounds | null) => void;
  setSelectedPoint: (point: DrillMapPoint | null) => void;
  regenerateDrillMap: () => void;
  setRotationDefault: (pointId: string, rotation: RotationOverride) => void;
  getRotationForPoint: (pointId: string, cornerType?: string, fallback?: RotationOverride) => RotationOverride;
  getPositionForPoint: (pointId: string, cornerType?: string) => { dx: number; dy: number; dz: number };
  openHardwareContextMenu: (position: { x: number; y: number }, pointId: string, cornerType?: any, rotation?: any, positionOffset?: any, worldPosition?: any) => void;
  closeHardwareContextMenu: () => void;
}

type DrillMapStore = DrillMapState & DrillMapActions;

// ============================================
// STORE
// ============================================

export const useDrillMapStore = create<DrillMapStore>()((set, get) => ({
  // State defaults
  showDrillMap: false,
  show3DHardware: true,
  showDrillDimensions: false,
  showDimensions: false,
  drillMap: null,
  drillMapPurpose: 'minifix',
  drillMapScale: 1,
  drillMapVersion: 0,
  cabinetBounds: null,
  selectedPoint: null,
  rotationDefaults: {},
  hardwareContextMenu: { visible: false, position: { x: 0, y: 0 }, pointId: null },

  // Actions
  setShowDrillMap: (show) => set({ showDrillMap: show }),
  setShow3DHardware: (show) => set({ show3DHardware: show }),
  setShowDrillDimensions: (show) => set({ showDrillDimensions: show }),
  setShowDimensions: (show) => set({ showDimensions: show }),
  setDrillMap: (map) => set({ drillMap: map }),
  setDrillMapPurpose: (purpose) => set({ drillMapPurpose: purpose }),
  setDrillMapScale: (scale) => set({ drillMapScale: scale }),
  setCabinetBounds: (bounds) => set({ cabinetBounds: bounds }),
  setSelectedPoint: (point) => set({ selectedPoint: point }),

  regenerateDrillMap: () => {
    set((s) => ({ drillMapVersion: s.drillMapVersion + 1 }));
  },

  setRotationDefault: (pointId, rotation) =>
    set((s) => ({
      rotationDefaults: { ...s.rotationDefaults, [pointId]: rotation },
    })),

  getRotationForPoint: (pointId, _cornerType?, fallback?) => {
    const override = get().rotationDefaults[pointId];
    if (override) return override;
    return fallback ?? { rotX: 0, rotY: 0, rotZ: 0 };
  },

  getPositionForPoint: (pointId, _cornerType?) => {
    void pointId;
    void _cornerType;
    return { dx: 0, dy: 0, dz: 0 };
  },

  openHardwareContextMenu: (position, pointId) =>
    set({ hardwareContextMenu: { visible: true, position, pointId } }),

  closeHardwareContextMenu: () =>
    set({ hardwareContextMenu: { visible: false, position: { x: 0, y: 0 }, pointId: null } }),
}));

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Determine corner type from position relative to panel dimensions.
 */
export function getCornerType(
  position: [number, number] | [number, number, number],
  panelWidth: number,
  panelHeight: number
): CornerType {
  const x = position[0];
  const y = position[1];
  const midX = panelWidth / 2;
  const midY = panelHeight / 2;

  if (x <= midX && y >= midY) return 'TOP_LEFT';
  if (x > midX && y >= midY) return 'TOP_RIGHT';
  if (x <= midX && y < midY) return 'BOTTOM_LEFT';
  return 'BOTTOM_RIGHT';
}
